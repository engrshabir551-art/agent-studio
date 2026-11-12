// Runtime: live state and statistics for every agent, enable/disable, stop runs, scheduled jobs.
(() => {
  "use strict";
  const { $, esc } = U;
  let tab = "agents";

  function agentsTab() {
    const st = Core.Runtime.stats();
    return `<div class="tblwrap"><table class="tbl"><thead><tr><th>Agent</th><th>Team</th><th>State</th><th class="num">Runs</th><th class="num">Errors</th><th class="num">Avg ms</th><th class="num">Tokens (est.)</th><th>Last run</th><th></th></tr></thead><tbody>${Core.agents().map(a => {
      const s = st[a.id] || {}, run = Core.Runtime.isRunning(a.id), off = a.enabled === false, g = Core.groupOf(a);
      return `<tr><td><b>${esc(a.name)}</b></td><td>${esc(g ? g.name : "")}</td><td><span class="dot ${off ? "off" : run ? "run" : "ok"}"></span> ${off ? "disabled" : run ? "running" : "idle"}</td>
        <td class="num">${s.runs || 0}</td><td class="num ${s.errors ? "bad" : ""}" title="${esc(s.lastError || "")}">${s.errors || 0}</td><td class="num">${s.runs ? Math.round(s.ms / s.runs) : "–"}</td><td class="num">${U.num((s.tin || 0) + (s.tout || 0), 0)}</td><td>${U.ago(s.last)}</td>
        <td><button class="btn small" data-a="toggle" data-id="${a.id}">${off ? "Enable" : "Disable"}</button></td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function jobsTab() {
    const jobs = Engine.Scheduler.jobs();
    return `<p class="muted small">Jobs run while the app is open and a provider is reachable (checked every 20 seconds). Each run is saved to History.</p>
      <div class="row"><button class="btn primary" data-a="job-new">+ New job</button></div>` +
      (jobs.map(j => `<div class="card"><div class="row between"><strong>${esc(j.name)}</strong><span class="tag">${j.enabled ? "enabled" : "paused"}</span></div>
        <div class="muted small">${esc(j.target.type)}: ${esc((j.target.type === "group" ? (Core.group(j.target.id) || {}).name : (Core.agent(j.target.id) || {}).name) || "(removed)")} · every ${j.everyMin} min · last ${U.ago(j.lastRun)}${j.lastStatus && j.lastStatus !== "ok" ? ` · <span class="bad">${esc(U.trim(j.lastStatus, 80))}</span>` : ""}</div>
        <div class="muted small">${esc(U.trim(j.prompt, 140))}</div>
        <div class="row"><button class="btn small" data-a="job-toggle" data-id="${j.id}">${j.enabled ? "Pause" : "Resume"}</button><button class="btn small" data-a="job-now" data-id="${j.id}">Run next tick</button><button class="btn small danger" data-a="job-del" data-id="${j.id}">Delete</button></div></div>`).join("") || `<p class="muted">No scheduled jobs.</p>`);
  }

  function render(el) {
    const st = Core.Runtime.stats(), runs = Object.values(st).reduce((n, s) => n + s.runs, 0), errs = Object.values(st).reduce((n, s) => n + s.errors, 0);
    const act = Engine.activeRuns();
    $("#rtBody", el).innerHTML = `<div class="tiles">
      <div class="tile"><div class="l">Running agents</div><div class="v">${Core.Runtime.runningCount()}</div></div><div class="tile"><div class="l">Active runs</div><div class="v">${act.length}</div></div>
      <div class="tile"><div class="l">Total runs</div><div class="v">${runs}</div></div><div class="tile"><div class="l">Error rate</div><div class="v">${runs ? Math.round(100 * errs / runs) + "%" : "–"}</div></div>
      <div class="tile"><div class="l">Session uptime</div><div class="v">${Math.max(1, Math.round((Date.now() - Core.started) / 60000))} min</div></div>
      <div class="tile"><div class="l">Storage</div><div class="v">${Store.persistent() ? "IndexedDB" : "Local"}</div></div></div>` +
      (act.length ? `<div class="card"><h3>Active runs</h3>${act.map(r => `<div class="li">${esc(r.title)} <span class="muted small">${r.steps.length} steps</span></div>`).join("")}</div>` : "") +
      `<div class="tabs"><button class="tab ${tab === "agents" ? "active" : ""}" data-tab="agents">Agents</button><button class="tab ${tab === "jobs" ? "active" : ""}" data-tab="jobs">Scheduled jobs</button></div>` +
      (tab === "agents" ? agentsTab() : jobsTab());
  }

  async function newJob() {
    const v = await U.form("New scheduled job", [
      { key: "name", label: "Name", required: true },
      { key: "target", label: "Run", type: "select", options: [...Core.groups().map(g => ({ value: "group:" + g.id, label: `Team · ${g.name}` })), ...Core.agents().map(a => ({ value: "agent:" + a.id, label: `Agent · ${a.name}` }))] },
      { key: "prompt", label: "Task", type: "textarea", required: true }, { key: "everyMin", label: "Every (minutes)", type: "number", required: true, value: 60 }, { key: "consult", label: "Consult linked teams first", type: "checkbox" }
    ], { target: "group:news" }, { submit: "Create" });
    if (!v) return;
    const [type, id] = v.target.split(":");
    Engine.Scheduler.save([...Engine.Scheduler.jobs(), { id: U.uid(), name: v.name, target: { type, id }, prompt: v.prompt, everyMin: Math.max(1, v.everyMin || 60), consult: v.consult, enabled: true, nextRun: Date.now() + Math.max(1, v.everyMin || 60) * 60000 }]);
  }

  App.register({
    id: "runtime", title: "Runtime", icon: "⏱️",
    mount(el) {
      el.innerHTML = `<div class="row between"><div><h2>Agent runtime</h2><div class="muted small">Live state, statistics and scheduled jobs for all agents</div></div>
        <div class="row"><button class="btn danger" data-a="stop">Stop all runs</button><button class="btn" data-a="reset">Reset statistics</button></div></div><div id="rtBody" class="stack"></div>`;
      el.addEventListener("click", async e => {
        const t = e.target.closest("[data-tab]"); if (t) { tab = t.dataset.tab; render(el); return; }
        const b = e.target.closest("[data-a]"); if (!b) return;
        const id = b.dataset.id;
        switch (b.dataset.a) {
          case "stop": Engine.stopAll(); U.toast("Stopping active runs…"); break;
          case "reset": if (confirm("Reset all runtime statistics?")) Core.Runtime.resetStats(); break;
          case "toggle": { const a = Core.agent(id); a.enabled = a.enabled === false; Core.saveSystems(); break; }
          case "job-new": await newJob(); break;
          case "job-toggle": Engine.Scheduler.save(Engine.Scheduler.jobs().map(j => j.id === id ? { ...j, enabled: !j.enabled } : j)); break;
          case "job-now": Engine.Scheduler.save(Engine.Scheduler.jobs().map(j => j.id === id ? { ...j, enabled: true, nextRun: 0 } : j)); U.toast("Will run on the next check (within 20 s)."); break;
          case "job-del": Engine.Scheduler.save(Engine.Scheduler.jobs().filter(j => j.id !== id)); break;
        }
        render(el);
      });
      Core.on(t => { if (App.current() === "runtime" && ["runtime", "runs", "jobs", "systems"].includes(t)) render(el); });
    },
    show(el) { render(el); }
  });
})();
