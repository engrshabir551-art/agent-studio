// Agent execution engine: single calls, team runs, orchestra (conductor) runs, chains, tasks and the scheduler.
window.Engine = (() => {
  "use strict";
  const { Bus, Memory, Runtime, Audit } = Core;
  const est = s => Math.ceil(String(s || "").length / 4);
  const FIN_GROUPS = new Set(["planning", "treasury", "vault", "staff", "conductor"]);
  const active = new Map();
  const watchers = new WeakMap();

  const watch = (run, fn) => { let s = watchers.get(run); if (!s) { s = new Set(); watchers.set(run, s); } s.add(fn); return () => s.delete(fn); };
  const notify = (run, st) => { const s = watchers.get(run); if (s) s.forEach(f => { try { f(st); } catch (e) { console.error(e); } }); };
  const parseJSON = text => { try { const a = text.indexOf("{"), b = text.lastIndexOf("}"); return JSON.parse(text.slice(a, b + 1)); } catch { return null; } };
  const isAbort = e => e && e.name === "AbortError";

  async function pool(items, n, fn) {
    const q = [...items];
    await Promise.all(Array.from({ length: Math.max(1, Math.min(n, q.length)) }, async () => { while (q.length) await fn(q.shift()); }));
  }

  function systemPrompt(agent, query, extra) {
    const g = Core.groupOf(agent), sys = Core.systemOf(agent.id);
    let p = `You are ${agent.name}${agent.role ? ", " + agent.role : ""}. You belong to the "${g ? g.name : "–"}" team in "${sys ? sys.name : "–"}" of a multi-agent platform called Agent Studio. Today is ${new Date().toDateString()}.\n${agent.prompt || ""}`;
    if (Core.settings().memoryOn !== false) {
      const mem = Memory.relevant(query, agent);
      if (mem.length) p += `\n\nLong-term memory you may rely on:\n` + mem.map(m => `- ${m.text}`).join("\n");
    }
    if (FIN_GROUPS.has(agent.group) && window.Finance) p += `\n\nCurrent finance snapshot (local ledger data; may be incomplete):\n${Finance.snapshotText()}`;
    if (extra) p += `\n\n${extra}`;
    return p + `\n\nBe clear and well structured. Do not invent facts or numbers; say when you are unsure.`;
  }

  // One model call as one agent, with runtime accounting.
  async function call(agent, messages, opts = {}) {
    if (agent.enabled === false) throw new Error(`${agent.name} is disabled (Runtime tab).`);
    const ok = Core.canCall();
    if (!ok.ok) throw Object.assign(new Error(ok.reason), { fatal: true });
    const s = Core.settings(), t0 = Date.now();
    const system = systemPrompt(agent, opts.query || messages[messages.length - 1].content, opts.extra);
    let partial = "";
    Runtime.begin(agent.id);
    try {
      const full = await LLM.chat({
        provider: s.provider, cfg: Core.cfg(), system, messages, temperature: opts.temperature ?? s.temperature, signal: opts.signal,
        onToken: t => { partial += t; if (opts.onToken) opts.onToken(t, partial); }
      });
      Runtime.end(agent.id, { ok: true, ms: Date.now() - t0, tin: est(system) + est(JSON.stringify(messages)), tout: est(full) });
      return full;
    } catch (e) {
      Runtime.end(agent.id, { ok: isAbort(e), ms: Date.now() - t0, tin: est(system), tout: est(partial), error: isAbort(e) ? "" : e.message });
      throw e;
    }
  }

  // ---- runs ----
  function newRun(type, title, task, extra) {
    return Object.assign({ id: U.uid(), type, title: U.trim(title, 70), task, steps: [], final: "", ts: Date.now(), status: "running", provider: Core.settings().provider, model: Core.modelName() }, extra || {});
  }
  function serialize(run) {
    return { ...run, steps: run.steps.map(s => ({ ...s, input: U.trim(s.input, 1500), output: U.trim(s.output, 8000) })), final: U.trim(run.final, 20000) };
  }

  async function step(ctx, agent, label, prompt, opts = {}) {
    const g = Core.groupOf(agent);
    const st = { id: U.uid(), agentId: agent.id, agent: agent.name, group: g ? g.name : "", system: (Core.systemOf(agent.id) || {}).name || "", label, input: prompt, output: "", status: "running", ts: Date.now() };
    ctx.run.steps.push(st); notify(ctx.run, st);
    try {
      st.output = await call(agent, [{ role: "user", content: prompt }], { ...opts, signal: ctx.signal, onToken: (t, acc) => { st.output = acc; notify(ctx.run, st); } });
      st.status = "done"; st.ms = Date.now() - st.ts; notify(ctx.run, st);
      return st.output;
    } catch (e) {
      st.status = isAbort(e) ? "stopped" : "error"; if (st.status === "error") st.error = e.message;
      st.ms = Date.now() - st.ts; notify(ctx.run, st);
      throw e;
    }
  }

  async function consultLinks(ctx, group, task) {
    const gs = group.links.map(id => Core.group(id)).filter(Boolean);
    const parts = await Promise.all(gs.map(async g => {
      const a = g.agents.find(x => x.enabled !== false); if (!a) return "";
      try {
        const t = await step(ctx, a, `consulted by ${group.name}`, `The "${group.name}" team is working on the task below and asks for your input from the "${g.name}" domain. Be concise (max 200 words).\n\nTask:\n${task}`);
        Bus.post({ from: Core.ref(a), to: { ...Core.ref(group.lead), group: group.id }, type: "response", subject: `Consultation: ${g.name}`, body: t, runId: ctx.run.id });
        return `### ${g.name} (${a.name})\n${t}`;
      } catch (e) { if (isAbort(e) || e.fatal) throw e; return ""; }
    }));
    return parts.filter(Boolean).join("\n\n");
  }

  // lead plans -> members work in parallel -> lead merges
  async function team(ctx, group, task, opts = {}) {
    const run = ctx.run;
    const act = group.agents.filter(a => a.enabled !== false);
    if (!act.length) throw new Error(`Every agent in "${group.name}" is disabled.`);
    const lead = act[0], members = act.slice(1);
    let full = task;
    if (opts.consult && group.links.length) {
      const c = await consultLinks(ctx, group, task);
      if (c) full = `${task}\n\nInput from linked teams:\n${c}`;
    }
    if (!members.length) return step(ctx, lead, "answer", full);
    let plan = {};
    try {
      const t = await step(ctx, lead, "planning", `You lead the "${group.name}" team. Assign each member a subtask that fits their role.\n\nMembers:\n${members.map(m => `- ${m.name}: ${m.role}`).join("\n")}\n\nTask:\n${full}\n\nRespond ONLY with JSON: {"assignments":{"<member name>":"<subtask>"}}`);
      plan = (parseJSON(t) || {}).assignments || {};
    } catch (e) { if (isAbort(e) || e.fatal) throw e; }
    const results = {};
    await pool(members, ctx.conc, async m => {
      const sub = typeof plan[m.name] === "string" ? plan[m.name] : full;
      Bus.post({ from: Core.ref(lead), to: Core.ref(m), type: "task", subject: `${group.name}: assignment`, body: sub, runId: run.id });
      try {
        results[m.name] = await step(ctx, m, m.role || "member", `Team task:\n${full}\n\nYour assignment:\n${sub}`);
        Bus.post({ from: Core.ref(m), to: Core.ref(lead), type: "result", subject: "Report", body: results[m.name], runId: run.id });
      } catch (e) { if (isAbort(e) || e.fatal) throw e; results[m.name] = `(failed: ${e.message})`; }
    });
    return step(ctx, lead, "final merge", `Team task:\n${full}\n\nMember reports:\n${members.map(m => `### ${m.name}\n${results[m.name] || "(no output)"}`).join("\n\n")}\n\nMerge these into one final, polished deliverable.`);
  }

  // The Conductor picks the teams it needs, teams run, the Conductor merges.
  async function orchestra(ctx, task, opts = {}) {
    const cond = Core.conductor();
    const all = Core.groups().filter(g => g.id !== cond.group && g.agents.some(a => a.enabled !== false) && (!opts.groupIds || opts.groupIds.includes(g.id)));
    if (!all.length) return step(ctx, cond, "direct answer", task);
    const catalog = all.map(g => `- ${g.id}: ${g.name} [${(Core.systemOf(g.lead.id) || {}).name || ""}] – ${g.lead.role}; ${g.members.length} members`).join("\n");
    const routeText = await step(ctx, cond, "routing", `You are conducting these teams:\n${catalog}\n\nChoose ONLY the teams needed and give each a clear subtask.\n\nTask:\n${task}\n\nRespond ONLY with JSON: {"assignments":{"<team id>":"<subtask>"}}`);
    const plan = (parseJSON(routeText) || {}).assignments || {};
    const chosen = Object.keys(plan).filter(id => all.some(g => g.id === id));
    if (!chosen.length) return step(ctx, cond, "direct answer", task);
    const results = {};
    await pool(chosen, ctx.teamConc, async id => {
      const g = Core.group(id), sub = typeof plan[id] === "string" ? plan[id] : JSON.stringify(plan[id]);
      Bus.post({ from: Core.ref(cond), to: { ...Core.ref(g.lead), group: g.id }, type: "task", subject: `Route → ${g.name}`, body: sub, runId: ctx.run.id });
      try {
        results[id] = await team(ctx, g, sub, { consult: opts.consult });
        Bus.post({ from: Core.ref(g.lead), to: Core.ref(cond), type: "result", subject: `${g.name} report`, body: results[id], runId: ctx.run.id });
      } catch (e) { if (isAbort(e) || e.fatal) throw e; results[id] = `(failed: ${e.message})`; }
    });
    return step(ctx, cond, "final merge", `Original task:\n${task}\n\nTeam reports:\n${chosen.map(id => `### ${Core.group(id).name}\n${results[id]}`).join("\n\n")}\n\nSynthesize one coherent final answer. Point out conflicts or gaps between teams.`);
  }

  // Team chain: each team's result becomes the next team's input.
  async function chain(ctx, task, groupIds, opts = {}) {
    let carry = task;
    for (const id of groupIds) { const g = Core.group(id); if (g) carry = await team(ctx, g, carry, opts); }
    return carry;
  }

  // ---- run lifecycle ----
  function execute(type, title, task, fn, extra) {
    const run = newRun(type, title, task, extra);
    const ac = new AbortController();
    const s = Core.settings();
    const ctx = { run, signal: ac.signal, conc: s.conc || 3, teamConc: s.teamConc || 2 };
    active.set(run.id, { run, ac });
    Core.emit("runs");
    const done = (async () => {
      try { run.final = await fn(ctx); run.status = "done"; }
      catch (e) { run.status = isAbort(e) ? "stopped" : "error"; run.error = isAbort(e) ? "" : e.message; }
      finally {
        active.delete(run.id);
        if (run.steps.length) Store.saveItem(serialize(run));
        Bus.post({ from: { id: "engine", name: "Runtime" }, to: { id: "conductor", name: "GOD AI Conductor" }, type: "event", subject: `Run ${run.status}: ${run.title}`, body: `${run.steps.length} steps`, runId: run.id });
        notify(run, null); Core.emit("runs");
      }
      return run;
    })();
    return { run, stop: () => ac.abort(), done };
  }

  const runOrchestra = (task, opts) => execute("orchestra", task, task, ctx => orchestra(ctx, task, opts));
  const runTeam = (groupId, task, opts) => { const g = Core.group(groupId); return execute("team", `${g.name}: ${task}`, task, ctx => team(ctx, g, task, opts), { groupId }); };
  const runChain = (groupIds, task, opts) => execute("chain", task, task, ctx => chain(ctx, task, groupIds, opts), { groupIds });
  const runAgent = (agent, task) => execute("agent", `${agent.name}: ${task}`, task, ctx => step(ctx, agent, "answer", task), { agentId: agent.id });
  const stopAll = () => { active.forEach(a => a.ac.abort()); };

  async function extractMemories(text, signal) {
    const keeper = Core.agent("memory-keeper") || Core.conductor();
    const out = await call(keeper, [{ role: "user", content: `Extract up to 8 durable facts, preferences, decisions or constraints worth remembering long-term from the text below. Each must be a short standalone sentence. Respond ONLY with JSON: {"memories":[{"text":"...","scope":"global"}]}\n\nTEXT:\n${String(text).slice(0, 12000)}` }], { signal, extra: "Never include secrets, passwords or API keys." });
    const list = ((parseJSON(out) || {}).memories || []).filter(m => m && typeof m.text === "string" && !/(sk-[A-Za-z0-9_-]{10,}|api[_ -]?key|password|secret|passphrase)/i.test(m.text));
    let n = 0;
    for (const m of list) {
      const scope = m.scope && (m.scope === "global" || Core.group(m.scope) || Core.agent(m.scope)) ? m.scope : "global";
      if (Memory.add({ text: m.text, scope, source: "extracted" })) n++;
    }
    return n;
  }

  // ---- scheduler (runs while the app is open) ----
  const Scheduler = {
    jobs: () => Store.get("jobs", []),
    save(list) { Store.set("jobs", list); Core.emit("jobs"); },
    busy: false,
    async tick() {
      if (Scheduler.busy || !Core.canCall().ok) return;
      const now = Date.now();
      const job = Scheduler.jobs().find(j => j.enabled && (j.nextRun || 0) <= now);
      if (!job) return;
      Scheduler.busy = true;
      let status = "ok";
      try {
        const g = job.target.type === "group" ? Core.group(job.target.id) : null, a = job.target.type === "agent" ? Core.agent(job.target.id) : null;
        if (!g && !a) throw new Error("Target no longer exists.");
        const h = g ? execute("scheduled", `${job.name}`, job.prompt, ctx => team(ctx, g, job.prompt, { consult: job.consult }), { groupId: g.id })
                    : execute("scheduled", `${job.name}`, job.prompt, ctx => step(ctx, a, "answer", job.prompt), { agentId: a.id });
        const run = await h.done;
        if (run.status !== "done") status = run.error || run.status;
      } catch (e) { status = e.message; }
      const list = Scheduler.jobs().map(j => j.id === job.id ? { ...j, lastRun: Date.now(), lastStatus: status, nextRun: Date.now() + Math.max(1, j.everyMin) * 60000 } : j);
      Scheduler.save(list); Scheduler.busy = false;
    },
    start() { setInterval(() => Scheduler.tick(), 20000); setTimeout(() => Scheduler.tick(), 4000); }
  };

  return { call, watch, notify, execute, runOrchestra, runTeam, runChain, runAgent, stopAll, extractMemories, Scheduler, activeRuns: () => [...active.values()].map(a => a.run), preflight: () => Core.canCall(), parseJSON, serialize, FIN_GROUPS };
})();
