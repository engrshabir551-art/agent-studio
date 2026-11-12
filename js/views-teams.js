// Teams: one dashboard per team (agents, status, stats, run box, and a team-specific panel).
(() => {
  "use strict";
  const { $, esc } = U;
  let gid = null, handle = null, rv = null, attached = "";

  const status = a => a.enabled === false ? ["off", "disabled"] : Core.Runtime.isRunning(a.id) ? ["run", "running"] : ["ok", "idle"];

  function list(el) {
    const stats = Core.Runtime.stats();
    el.innerHTML = `<div class="row between"><div><h2>Teams</h2><div class="muted small">One dashboard per team. Open a team to see its agents, run it, and use its tools.</div></div></div>` +
      Core.systems().map(s => {
        const gs = Core.groups().filter(g => g.systemId === s.id);
        return `<h3 class="sysh">${esc(s.name)}</h3><div class="grid">${gs.map(g => {
          const runs = g.agents.reduce((n, a) => n + ((stats[a.id] || {}).runs || 0), 0), busy = g.agents.some(a => Core.Runtime.isRunning(a.id));
          return `<div class="card click" data-team="${g.id}"><div class="row between"><strong>${g.icon} ${esc(g.name)}</strong><span class="dot ${busy ? "run" : "ok"}"></span></div>
            <div class="muted small">${esc(g.desc)}</div>
            <div class="row"><span class="tag">${g.agents.length} agent${g.agents.length === 1 ? "" : "s"}</span><span class="tag">${runs} runs</span>${g.links.length ? `<span class="tag">links: ${g.links.length}</span>` : ""}</div>
            <div class="muted small">Lead: ${esc(g.lead.name)}</div></div>`;
        }).join("")}</div>`;
      }).join("");
  }

  // ---- team-specific panels ----
  const panels = {
    orchestra: g => `<div class="card"><h3>Conductor</h3><p class="muted small">The Conductor routes work to all other teams. Use the Orchestra for multi-team goals.</p><button class="btn primary" data-w="orch">Open the Orchestra</button></div>`,
    brief: g => `<div class="card"><h3>Daily briefing</h3><p class="muted small">Builds a briefing from open tasks, finance, security and runtime data.</p><button class="btn primary" data-w="brief">Generate today's briefing</button></div>`,
    assist: g => `<div class="card"><h3>Linked to the Conductor</h3><p class="muted small">Write the request in the box below. Run it with the assistants, or escalate it to the Conductor for multi-team work.</p><button class="btn" data-w="escalate">Escalate to the Conductor</button></div>`,
    tasks: g => taskPanel(g, false),
    pm: g => taskPanel(g, true),
    memory: g => { const m = Core.Memory.all(); return `<div class="card"><h3>Memory store</h3><p class="muted small">${m.length} items. ${m.filter(x => x.pinned).length} pinned.</p>${m.slice(0, 4).map(x => `<div class="li">${esc(U.trim(x.text, 110))}<div class="muted small">${esc(x.scope)}</div></div>`).join("")}<div class="row"><button class="btn small" data-w="addmem">Add memory</button><button class="btn small" data-go="memory">Open Memory</button></div></div>`; },
    bus: g => { const b = Core.Bus.list(); return `<div class="card"><h3>Message bus</h3><p class="muted small">${b.length} messages, ${b.filter(x => x.status === "rejected").length} rejected.</p>${b.slice(0, 5).map(m => `<div class="li"><span class="tag">${esc(m.type)}</span> ${esc(m.from && m.from.name)} → ${esc(m.to && (m.to.name || m.to.group))}</div>`).join("")}<button class="btn small" data-go="comms">Open Comms</button></div>`; },
    runtime: g => { const r = Core.Runtime.stats(), runs = Object.values(r).reduce((n, s) => n + s.runs, 0); return `<div class="card"><h3>Runtime</h3><p class="muted small">${Core.Runtime.runningCount()} running · ${runs} total runs · ${Engine.Scheduler.jobs().filter(j => j.enabled).length} scheduled jobs.</p><button class="btn small" data-go="runtime">Open Runtime</button></div>`; },
    security: g => { const c = Security.checks(); return `<div class="card"><h3>Security checks</h3>${c.map(x => `<div class="alert ${x.level}">${esc(x.title)}</div>`).join("")}<button class="btn small" data-go="security">Open Security</button></div>`; },
    finance: g => { const n = Finance.netWorth(); return `<div class="card"><h3>Finance snapshot</h3><div class="tiles"><div class="tile"><div class="l">Platform balance</div><div class="v">${U.money(n.total, n.base)}</div></div><div class="tile"><div class="l">Gold fine oz</div><div class="v">${U.num(n.gold.oz, 3)}</div></div><div class="tile"><div class="l">Silver fine oz</div><div class="v">${U.num(n.silver.oz, 3)}</div></div></div><button class="btn small" data-go="vault">Open Vault Terminal</button></div>`; },
    news: g => `<div class="card"><h3>News desk</h3><p class="muted small">Pick a topic to draft a briefing. For live news use a model with web access (for example an online model on OpenRouter); otherwise the agency works from the model's knowledge and says so.</p><div class="chips">${["World headlines", "Markets & economy", "Technology", "Health & science", "Geopolitics"].map(t => `<button class="chip" data-w="topic" data-topic="${t}">${t}</button>`).join("")}</div></div>`
  };
  function taskPanel(g, pm) {
    const t = Store.get("tasks", []);
    const c = s => t.filter(x => x.status === s).length;
    const manual = g.agents.filter(a => a.manual);
    return `<div class="card"><h3>${pm ? "Manual roles & tasks" : "Task board"}</h3>
      <div class="tiles"><div class="tile"><div class="l">To do</div><div class="v">${c("todo")}</div></div><div class="tile"><div class="l">Doing</div><div class="v">${c("doing")}</div></div><div class="tile"><div class="l">Done</div><div class="v">${c("done")}</div></div></div>
      ${pm && manual.length ? `<p class="muted small">${manual.map(a => esc(a.name)).join(" and ")} are filled in by you: create their roles and tasks yourself.</p>` : ""}
      <div class="row"><button class="btn small primary" data-w="newtask">+ New task</button>${pm ? `<button class="btn small" data-w="newrole">+ New role (agent)</button>` : ""}<button class="btn small" data-go="tasks">Open Tasks</button></div></div>`;
  }

  function open(id, el) {
    const g = Core.group(id); if (!g) return list(el);
    gid = id; attached = "";
    const stats = Core.Runtime.stats(), sys = Core.systemOf(g.lead.id);
    el.innerHTML = `
      <div class="row between"><button class="btn small" data-back>← All teams</button><span class="muted small">${esc(sys ? sys.name : "")}</span></div>
      <div><h2>${g.icon} ${esc(g.name)}</h2><div class="muted small">${esc(g.desc)}</div>${g.links.length ? `<div class="muted small">Linked teams: ${g.links.map(l => esc((Core.group(l) || { name: l }).name)).join(", ")}</div>` : ""}</div>
      ${(panels[g.widget] || (() => ""))(g)}
      <h3>Agents</h3>
      <div class="grid">${g.agents.map((a, i) => { const [cls, label] = status(a), s = stats[a.id] || {};
        return `<div class="card"><div class="row between"><strong>${esc(a.name)}</strong><span class="dot ${cls}" title="${label}"></span></div>
          <div class="muted small">${esc(a.role)}</div>
          <div class="row"><span class="tag ${i === 0 ? "orch" : ""}">${i === 0 && a.layer !== "lead" ? "lead · " : ""}${a.layer}</span>${a.manual ? `<span class="tag">manual input</span>` : ""}<span class="tag">${label}</span></div>
          <div class="muted small">${s.runs || 0} runs · ${s.errors || 0} errors · ${s.runs ? Math.round(s.ms / s.runs) + " ms avg" : "no runs"} · ${U.ago(s.last)}</div>
          <div class="row"><button class="btn small" data-chat="${a.id}">Chat</button><button class="btn small" data-toggle="${a.id}">${a.enabled === false ? "Enable" : "Disable"}</button></div></div>`; }).join("")}</div>
      <div class="card"><h3>Run this team</h3>
        <p class="muted small">${g.members.length ? `${esc(g.lead.name)} plans, ${g.members.length} member${g.members.length === 1 ? "" : "s"} work in parallel, ${esc(g.lead.name)} merges.` : `${esc(g.lead.name)} answers directly.`}</p>
        <textarea id="teamTask" rows="3" placeholder="What should this team do?"></textarea>
        <div class="row"><label class="btn small">Attach file<input type="file" id="teamFile" hidden accept=".txt,.csv,.md,.json,.tsv,text/*"></label><span id="teamFileName" class="muted small"></span>
        ${g.links.length ? `<label class="check"><input type="checkbox" id="teamConsult"> Consult linked teams first</label>` : ""}</div>
        <div class="row"><button class="btn primary" id="teamRun">Run team</button><button class="btn danger" id="teamStop" hidden>Stop</button></div></div>
      <div id="teamOut"></div>`;
    if (rv) { rv.detach(); rv = null; }
    if (handle && handle.run.status === "running" && handle.run.groupId === id) { rv = RunView.attach($("#teamOut"), handle.run); $("#teamRun").hidden = true; $("#teamStop").hidden = false; }
  }

  async function run(el, taskOverride) {
    const g = Core.group(gid);
    const task = (taskOverride || $("#teamTask").value).trim();
    if (!task) return U.toast("Write the task first.");
    const pre = Engine.preflight(); if (!pre.ok) { U.toast(pre.reason); if (pre.goto) App.go(pre.goto); return; }
    const c = $("#teamConsult");
    handle = Engine.runTeam(gid, task + attached, { consult: c && c.checked });
    handle.run.title = `${g.name}: ${task.slice(0, 50)}`;
    if (rv) rv.detach();
    rv = RunView.attach($("#teamOut"), handle.run);
    $("#teamRun").hidden = true; $("#teamStop").hidden = false;
    handle.done.then(r => { if (gid === g.id && $("#teamRun")) { $("#teamRun").hidden = false; $("#teamStop").hidden = true; } U.toast(r.status === "done" ? "Team finished – saved to History." : r.status === "stopped" ? "Stopped." : "Failed: " + (r.error || "")); });
  }

  App.register({
    id: "teams", title: "Teams", icon: "👥",
    mount(el) {
      el.addEventListener("click", async e => {
        const t = e.target.closest("[data-team]"); if (t) { open(t.dataset.team, el); return; }
        if (e.target.closest("[data-back]")) { gid = null; list(el); return; }
        const ch = e.target.closest("[data-chat]"); if (ch) { App.go("chat", { agentId: ch.dataset.chat }); return; }
        const tg = e.target.closest("[data-toggle]");
        if (tg) { const a = Core.agent(tg.dataset.toggle); a.enabled = a.enabled === false; Core.saveSystems(); open(gid, el); return; }
        if (e.target.closest("#teamRun")) return run(el);
        if (e.target.closest("#teamStop") && handle) return handle.stop();
        const w = e.target.closest("[data-w]"); if (!w) return;
        const k = w.dataset.w;
        if (k === "orch") App.go("orchestra");
        else if (k === "brief") run(el, `Prepare today's briefing for the principal. Use this snapshot of their platform:\n\n${Core.snapshotText()}\n\nCover: what matters today, what is blocked, decisions needed, risks, and recommended next actions.`);
        else if (k === "escalate") { const t = $("#teamTask").value.trim(); App.go("orchestra", { task: t || "" }); }
        else if (k === "topic") { $("#teamTask").value = `Produce a concise, neutral briefing on: ${w.dataset.topic}. Separate confirmed facts from claims, note what may be out of date, and end with 3 things to watch.`; }
        else if (k === "addmem") { const v = await U.form("Add memory", [{ key: "text", label: "Memory", type: "textarea", required: true }, { key: "scope", label: "Applies to", type: "select", options: [{ value: "global", label: "Everyone" }, { value: gid, label: "This team" }] }]); if (v) { Core.Memory.add({ text: v.text, scope: v.scope }); open(gid, el); } }
        else if (k === "newtask") App.go("tasks", { create: true });
        else if (k === "newrole") App.go("agents", { create: true });
      });
      el.addEventListener("change", async e => {
        if (e.target.id === "teamFile") { const f = e.target.files[0]; e.target.value = ""; if (!f) return; attached = `\n\n--- Attached file: ${f.name} ---\n` + await U.readFile(f); $("#teamFileName").textContent = f.name + " attached"; }
      });
      Core.on(t => { if (App.current() === "teams" && ["runtime", "systems"].includes(t)) { if (gid) { const keep = $("#teamTask") ? $("#teamTask").value : ""; if (t === "systems") { open(gid, el); } else { /* keep inputs while running */ } } else list(el); } });
    },
    show(el, p) { if (p && p.team) open(p.team, el); else if (gid && Core.group(gid)) open(gid, el); else list(el); }
  });
})();
