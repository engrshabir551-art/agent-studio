// Overview dashboard: KPIs, systems, alerts, recent runs and messages.
(() => {
  "use strict";
  const { esc } = U;
  const tile = (l, v, sub, go) => `<div class="tile ${go ? "click" : ""}" ${go ? `data-go="${go}"` : ""}><div class="l">${esc(l)}</div><div class="v">${v}</div>${sub ? `<div class="s muted small">${sub}</div>` : ""}</div>`;

  function alerts() {
    const out = [];
    const ok = Core.canCall();
    if (!ok.ok) out.push({ level: "warn", text: ok.reason, go: ok.goto });
    if (window.Security) Security.checks().filter(c => c.level !== "ok" && c.level !== "info").slice(0, 4).forEach(c => out.push({ level: c.level, text: `${c.title}: ${c.detail}`, go: "security" }));
    const nw = Finance.netWorth();
    if (nw.missing.length) out.push({ level: "warn", text: `Missing exchange rate for ${nw.missing.join(", ")} – net worth is incomplete.`, go: "vault" });
    const stuck = Finance.payments().filter(p => p.status === "pending").length;
    if (stuck) out.push({ level: "info", text: `${stuck} payment(s) waiting for approval.`, go: "vault" });
    return out;
  }

  function render(el) {
    const agents = Core.agents(), stats = Core.Runtime.stats(), groups = Core.groups();
    const runs = Object.values(stats).reduce((n, s) => n + s.runs, 0), errs = Object.values(stats).reduce((n, s) => n + s.errors, 0);
    const tasks = Store.get("tasks", []), open = tasks.filter(t => t.status !== "done").length;
    const nw = Finance.netWorth();
    const rate = runs ? Math.round(100 * (runs - errs) / runs) + "%" : "–";
    const hist = Store.history().filter(h => h.type !== "chat").slice(0, 5);
    const bus = Core.Bus.list().slice(0, 7);
    const maxRuns = Math.max(1, ...groups.map(g => g.agents.reduce((n, a) => n + ((stats[a.id] || {}).runs || 0), 0)));

    el.innerHTML = `
      <div class="tiles">
        ${tile("Agents", `${agents.filter(a => a.enabled !== false).length}<span class="muted small"> / ${agents.length}</span>`, `${Core.systems().length} systems · ${groups.length} teams`, "agents")}
        ${tile("Running now", Core.Runtime.runningCount(), `${Engine.activeRuns().length} active runs`, "runtime")}
        ${tile("Total runs", runs, `success ${rate}`, "runtime")}
        ${tile("Open tasks", open, `${tasks.length} total`, "tasks")}
        ${tile("Memory", Core.Memory.all().length, "long-term items", "memory")}
        ${tile("Messages", Core.Bus.list().length, "on the agent bus", "comms")}
        ${tile("Platform balance", U.money(nw.total, nw.base), "cash + metals + wallet", "vault")}
        ${tile("Connection", Core.online() ? "Online" : "Offline", esc((PROVIDERS[Core.settings().provider] || {}).label || ""), "settings")}
      </div>
      ${(() => { const a = alerts(); return a.length ? `<div class="card"><h3>Needs attention</h3>${a.map(x => `<div class="alert ${x.level}" ${x.go ? `data-go="${x.go}"` : ""}>${esc(x.text)}</div>`).join("")}</div>` : ""; })()}
      <div class="row between"><h2>Systems</h2><button class="btn small primary" data-go="orchestra">Run the orchestra</button></div>
      <div class="grid">${Core.systems().map(s => {
        const sg = groups.filter(g => g.systemId === s.id);
        const sRuns = s.agents.reduce((n, a) => n + ((stats[a.id] || {}).runs || 0), 0);
        return `<div class="card click" data-go="teams"><strong>${esc(s.name)}</strong><div class="muted small">${esc(s.description)}</div>
          <div class="row"><span class="tag">${s.agents.length} agents</span><span class="tag">${sg.length} teams</span><span class="tag">${sRuns} runs</span></div>
          <div class="mini">${sg.map(g => { const n = g.agents.reduce((k, a) => k + ((stats[a.id] || {}).runs || 0), 0); const busy = g.agents.some(a => Core.Runtime.isRunning(a.id));
            return `<div class="mrow"><span>${g.icon} ${esc(g.name)}</span><div class="bar"><i style="width:${Math.round(100 * n / maxRuns)}%"></i></div><span class="dot ${busy ? "run" : ""}"></span></div>`; }).join("")}</div></div>`;
      }).join("")}</div>
      <div class="grid2">
        <div class="card"><h3>Recent runs</h3>${hist.map(h => `<div class="li click" data-hist="${h.id}"><span class="tag">${esc(h.type)}</span> ${esc(h.title)}<div class="muted small">${h.steps.length} steps · ${U.ago(h.ts)} · ${esc(h.status || "")}</div></div>`).join("") || `<p class="muted">No runs yet. Start with the Orchestra.</p>`}</div>
        <div class="card"><h3>Agent messages</h3>${bus.map(m => `<div class="li"><span class="tag ${m.status === "rejected" ? "bad" : ""}">${esc(m.type)}</span> <b>${esc(m.from && m.from.name)}</b> → ${esc(m.to && (m.to.name || m.to.group))}<div class="muted small">${esc(U.trim(m.subject, 70))} · ${U.ago(m.ts)}</div></div>`).join("") || `<p class="muted">No messages yet.</p>`}</div>
      </div>`;
  }

  App.register({
    id: "dashboard", title: "Dashboard", icon: "🏠",
    mount(el) {
      el.addEventListener("click", e => {
        const h = e.target.closest("[data-hist]"); if (h) App.go("history", { open: h.dataset.hist });
      });
      Core.on(t => { if (App.current() === "dashboard" && ["runtime", "runs", "bus", "finance", "memory"].includes(t)) this.show(el); });
    },
    show(el) { render(el); }
  });
})();
