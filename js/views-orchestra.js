// Orchestra: the Conductor routes a task to the teams it needs (auto), or you chain teams by hand.
(() => {
  "use strict";
  const { $, $$, esc } = U;
  let mode = "conductor", handle = null, rv = null, file = "";

  function chips() {
    const byS = Core.systems().map(s => {
      const gs = Core.groups().filter(g => g.systemId === s.id && g.id !== "conductor");
      return `<div class="label">${esc(s.name)}</div><div class="chips">${gs.map(g => `<label class="chip"><input type="checkbox" value="${g.id}" ${mode === "conductor" ? "checked" : ""}>${g.icon} ${esc(g.name)}</label>`).join("")}</div>`;
    }).join("");
    $("#orchTeams").innerHTML = byS;
  }

  function render(el) {
    el.innerHTML = `
      <div class="card">
        <h2>GOD AI Orchestra</h2>
        <div class="tabs"><button class="tab ${mode === "conductor" ? "active" : ""}" data-mode="conductor">Conductor (auto-route)</button><button class="tab ${mode === "chain" ? "active" : ""}" data-mode="chain">Team chain (manual order)</button></div>
        <p class="muted small">${mode === "conductor"
          ? "The Conductor reads the catalogue of teams, sends each the subtask it needs, teams run (members in parallel), and the Conductor merges everything into one answer. Untick teams to keep them out."
          : "Pick teams in the order you want. Each team's final result becomes the next team's input."}</p>
        <textarea id="orchTask" rows="4" placeholder="Describe the goal or task…"></textarea>
        <div class="row"><label class="btn small">Attach text/CSV file<input type="file" id="orchFile" accept=".txt,.csv,.md,.json,.tsv,text/*" hidden></label><span id="orchFileName" class="muted small"></span></div>
        <div id="orchTeams"></div>
        <div class="row">
          <label class="check"><input type="checkbox" id="orchConsult"> Consult linked teams first</label>
          <label class="inline">Members in parallel <input id="orchConc" type="number" min="1" max="10" value="${Core.settings().conc || 3}"></label>
          <label class="inline">Teams in parallel <input id="orchTConc" type="number" min="1" max="6" value="${Core.settings().teamConc || 2}"></label>
        </div>
        <div class="row"><button id="orchRun" class="btn primary">Run</button><button id="orchStop" class="btn danger" hidden>Stop</button></div>
      </div>
      <div id="orchOut"></div>`;
    chips();
    $("#orchFile").addEventListener("change", async e => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      file = `\n\n--- Attached file: ${f.name} ---\n` + await U.readFile(f);
      $("#orchFileName").textContent = `${f.name} attached`;
    });
  }

  async function run() {
    const task = $("#orchTask").value.trim();
    if (!task) return U.toast("Describe the task first.");
    const pre = Engine.preflight();
    if (!pre.ok) { U.toast(pre.reason); if (pre.goto) App.go(pre.goto); return; }
    const picked = $$("#orchTeams input:checked").map(i => i.value);
    if (!picked.length) return U.toast(mode === "chain" ? "Pick at least one team." : "Leave at least one team ticked.");
    const s = Core.settings();
    s.conc = Math.max(1, Math.min(10, parseInt($("#orchConc").value, 10) || 3));
    s.teamConc = Math.max(1, Math.min(6, parseInt($("#orchTConc").value, 10) || 2));
    Core.saveSettings();
    const opts = { consult: $("#orchConsult").checked };
    const full = task + file;
    handle = mode === "conductor" ? Engine.runOrchestra(full, { ...opts, groupIds: picked }) : Engine.runChain(picked, full, opts);
    handle.run.title = task.slice(0, 70);
    if (rv) rv.detach();
    rv = RunView.attach($("#orchOut"), handle.run);
    $("#orchRun").hidden = true; $("#orchStop").hidden = false;
    handle.done.then(r => { $("#orchRun").hidden = false; $("#orchStop").hidden = true; U.toast(r.status === "done" ? "Done – saved to History." : r.status === "stopped" ? "Run stopped." : "Run failed: " + (r.error || "")); });
  }

  App.register({
    id: "orchestra", title: "Orchestra", icon: "🎼",
    mount(el) {
      render(el);
      el.addEventListener("click", e => {
        const t = e.target.closest("[data-mode]");
        if (t) { mode = t.dataset.mode; const task = $("#orchTask").value; render(el); $("#orchTask").value = task; return; }
        if (e.target.closest("#orchRun")) run();
        if (e.target.closest("#orchStop") && handle) handle.stop();
      });
      Core.on(t => { if (t === "systems" && App.current() !== "orchestra") chips(); });
    },
    show(el, p) {
      chips();
      if (p && p.task) { $("#orchTask").value = p.task; }
    }
  });
})();
