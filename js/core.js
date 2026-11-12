// Core state and platform services: settings, roster index, audit log, message bus, memory, runtime stats.
window.Core = (() => {
  "use strict";
  const S = { settings: {}, systems: [], idx: new Map(), groups: new Map(), started: Date.now() };
  const subs = new Set();
  const emit = t => subs.forEach(f => { try { f(t); } catch (e) { console.error(e); } });
  const on = f => { subs.add(f); return () => subs.delete(f); };
  const RANK = { conductor: 0, orchestrator: 1, lead: 2, worker: 3 };

  function rebuild() {
    S.idx.clear(); S.groups.clear();
    for (const sys of S.systems) for (const a of sys.agents) {
      S.idx.set(a.id, { agent: a, sys });
      const gid = a.group || "ungrouped";
      let g = S.groups.get(gid);
      if (!g) {
        const m = (window.GROUP_META || {})[gid] || {};
        g = { id: gid, name: m.name || gid, icon: m.icon || "◆", desc: m.desc || "", widget: m.widget || "", links: m.links || [], systemId: sys.id, agents: [] };
        S.groups.set(gid, g);
      }
      g.agents.push(a);
    }
    for (const g of S.groups.values()) {
      g.agents.sort((x, y) => (RANK[x.layer] ?? 3) - (RANK[y.layer] ?? 3));
      g.lead = g.agents[0];
      g.members = g.agents.slice(1);
    }
  }
  function load() { S.settings = Store.getSettings(); S.systems = Store.getSystems(); rebuild(); }
  function saveSystems() { rebuild(); Store.setSystems(S.systems); emit("systems"); }
  function saveSettings() { Store.setSettings(S.settings); emit("settings"); }

  const agents = () => [...S.idx.values()].map(x => x.agent);
  const agent = id => (S.idx.get(id) || {}).agent;
  const systemOf = id => (S.idx.get(id) || {}).sys;
  const groups = () => [...S.groups.values()];
  const group = id => S.groups.get(id);
  const groupOf = a => S.groups.get(a.group || "ungrouped");
  const ref = a => ({ id: a.id, name: a.name, group: a.group });
  const conductor = () => agents().find(a => a.layer === "conductor") || agents().find(a => a.layer === "orchestrator") || agents()[0];

  const cfg = (id) => Store.providerCfg(S.settings, id || S.settings.provider);
  const modelName = () => cfg().model || (PROVIDERS[S.settings.provider] || {}).model || "no model";
  const online = () => navigator.onLine !== false;
  function canCall() {
    const p = PROVIDERS[S.settings.provider], c = cfg();
    if (!p) return { ok: false, reason: "Choose an AI provider in Settings.", goto: "settings" };
    if (p.needsKey && !(c.apiKey || "").trim()) return { ok: false, reason: `Add your ${p.label} API key in Settings.`, goto: "settings" };
    if (!online() && !LLM.isLocal(S.settings.provider, c)) return { ok: false, reason: "You are offline. Reconnect, or switch to Ollama (local network) in Settings to run agents offline." };
    return { ok: true };
  }

  // ---------------- audit log ----------------
  const Audit = {
    log(type, detail) {
      const a = Store.get("audit", []);
      a.unshift({ id: U.uid(), ts: Date.now(), type, detail: U.trim(detail, 300) });
      if (a.length > 500) a.length = 500;
      Store.set("audit", a); emit("audit");
    },
    list: () => Store.get("audit", []),
    clear() { Store.set("audit", []); emit("audit"); }
  };

  // ---------------- message bus ----------------
  const BUS_TYPES = ["task", "result", "request", "response", "event", "handoff", "alert"];
  const Bus = {
    types: BUS_TYPES,
    validate(m) {
      const e = [];
      if (!m || typeof m !== "object") return { ok: false, errors: ["message must be an object"] };
      if (!m.from || !m.from.id) e.push("from.id is required");
      if (!m.to || !(m.to.id || m.to.group)) e.push("to.id or to.group is required");
      if (!BUS_TYPES.includes(m.type)) e.push("type must be one of " + BUS_TYPES.join(", "));
      if (typeof m.body !== "string" || !m.body.trim()) e.push("body (non-empty text) is required");
      return { ok: !e.length, errors: e };
    },
    post(m) {
      const v = Bus.validate(m);
      const env = {
        id: U.uid(), corr: (m && m.corr) || U.uid(), ts: Date.now(), from: m && m.from, to: m && m.to, type: m && m.type,
        subject: U.trim((m && m.subject) || "", 120), body: U.trim((m && m.body) || "", 1500),
        status: v.ok ? "delivered" : "rejected", errors: v.errors, runId: (m && m.runId) || null
      };
      const list = Store.get("bus", []);
      list.unshift(env);
      if (list.length > 1500) list.length = 1500;
      Store.set("bus", list); emit("bus");
      return env;
    },
    list: () => Store.get("bus", []),
    clear() { Store.set("bus", []); emit("bus"); }
  };

  // ---------------- memory ----------------
  const tokens = t => (String(t).toLowerCase().match(/[a-z0-9؀-ۿ]{3,}/g) || []);
  const Memory = {
    all: () => Store.get("memory", []),
    add({ text, scope = "global", tags = [], pinned = false, source = "manual" }) {
      text = String(text || "").trim(); if (!text) return null;
      const all = Memory.all();
      if (all.some(m => m.text.toLowerCase() === text.toLowerCase())) return null;
      const item = { id: U.uid(), text: U.trim(text, 600), scope, tags, pinned, source, ts: Date.now() };
      Store.set("memory", [item, ...all]); emit("memory"); return item;
    },
    update(id, patch) { Store.set("memory", Memory.all().map(m => m.id === id ? { ...m, ...patch } : m)); emit("memory"); },
    remove(id) { Store.set("memory", Memory.all().filter(m => m.id !== id)); emit("memory"); },
    relevant(query, a, k = 5) {
      const q = new Set(tokens(query));
      const out = [];
      for (const m of Memory.all()) {
        if (!(m.scope === "global" || m.scope === a.group || m.scope === a.id)) continue;
        let score = 0;
        for (const t of tokens(m.text + " " + (m.tags || []).join(" "))) if (q.has(t)) score++;
        if (m.scope !== "global") score += 0.5;
        if (m.pinned) score += 100;
        if (score > 0) out.push({ m, score });
      }
      return out.sort((x, y) => y.score - x.score).slice(0, k).map(x => x.m);
    }
  };

  // ---------------- runtime stats ----------------
  const live = new Map();
  const Runtime = {
    stats: () => Store.get("runtime", {}),
    begin(id) { live.set(id, (live.get(id) || 0) + 1); emit("runtime"); },
    end(id, r) {
      const n = (live.get(id) || 1) - 1; if (n <= 0) live.delete(id); else live.set(id, n);
      const st = Store.get("runtime", {});
      const s = st[id] || (st[id] = { runs: 0, errors: 0, ms: 0, tin: 0, tout: 0 });
      s.runs++; if (!r.ok) s.errors++;
      s.ms += r.ms || 0; s.tin += r.tin || 0; s.tout += r.tout || 0; s.last = Date.now();
      s.lastStatus = r.ok ? "ok" : "error"; s.lastError = r.ok ? "" : U.trim(r.error, 200);
      Store.set("runtime", st); emit("runtime");
    },
    isRunning: id => live.has(id),
    runningCount: () => [...live.values()].reduce((a, b) => a + b, 0),
    resetStats() { Store.set("runtime", {}); emit("runtime"); }
  };

  // Text snapshot used by the Chief of Staff / Conductor (kept short).
  function snapshotText() {
    const tasks = Store.get("tasks", []);
    const open = tasks.filter(t => t.status !== "done");
    const lines = [`Date: ${new Date().toDateString()}`, `Agents: ${agents().length} in ${S.systems.length} systems; running now: ${Runtime.runningCount()}`,
      `Open tasks: ${open.length} (${open.filter(t => t.priority === "high").length} high priority)`];
    open.slice(0, 8).forEach(t => lines.push(`  - [${t.status}] ${t.title}${t.due ? " (due " + t.due + ")" : ""}`));
    if (window.Finance) lines.push("Finance: " + Finance.snapshotText().split("\n")[0]);
    if (window.Security) {
      const bad = Security.checks().filter(c => c.level !== "ok");
      lines.push(`Security: ${bad.length ? bad.map(c => c.title).join("; ") : "all checks OK"}`);
    }
    lines.push(`Memory items: ${Memory.all().length}; bus messages: ${Bus.list().length}`);
    return lines.join("\n");
  }

  return {
    load, on, emit, saveSystems, saveSettings, settings: () => S.settings, systems: () => S.systems,
    agents, agent, systemOf, groups, group, groupOf, ref, conductor, cfg, modelName, online, canCall,
    started: S.started, Audit, Bus, Memory, Runtime, snapshotText
  };
})();
