// History: every chat and run is saved on the device; search, reopen, export, delete.
(() => {
  "use strict";
  const { $, esc } = U;
  let q = "", rv = null;
  const ICON = { chat: "💬", orchestra: "🎼", chain: "🔗", team: "👥", agent: "🤖", task: "📌", scheduled: "⏱️" };

  function renderList(el) {
    const items = Store.history().filter(h => !q || JSON.stringify([h.title, h.task, h.final, (h.messages || []).map(m => m.content)]).toLowerCase().includes(q));
    $("#hiList", el).innerHTML = items.map(h => {
      const meta = h.type === "chat" ? `${esc((Core.agent(h.agentId) || { name: "Agent" }).name)} · ${h.messages.length} messages` : `${h.steps.length} steps · ${esc(h.status || "")}`;
      return `<div class="hist"><div class="info" data-open="${esc(h.id)}"><div class="t">${ICON[h.type] || "•"} ${esc(h.title)}</div><div class="muted small">${esc(h.type)} · ${meta} · ${esc((PROVIDERS[h.provider] || {}).label || h.provider || "")} · ${new Date(h.updated || h.ts).toLocaleString()}</div></div><button class="btn small danger" data-del="${esc(h.id)}">Delete</button></div>`;
    }).join("") || `<p class="muted">${q ? "No matches." : "Nothing here yet. Chats and runs are saved automatically on this device."}</p>`;
    $("#hiCount", el).textContent = `${Store.history().length} saved`;
  }

  function openItem(el, id) {
    const h = Store.history().find(x => x.id === id); if (!h) return;
    if (h.type === "chat") { App.go("chat", { chat: h }); return; }
    $("#hiList", el).hidden = true; $("#hiTools", el).hidden = true;
    const d = $("#hiDetail", el); d.hidden = false;
    d.innerHTML = `<div class="row between"><button class="btn small" data-back>← Back to history</button><span class="muted small">${new Date(h.ts).toLocaleString()}</span></div><h3>${esc(h.title)}</h3><div class="card"><div class="label">Task</div><div class="step-body">${U.md(h.task || "")}</div></div><div id="hiRun"></div>`;
    if (rv) rv.detach();
    rv = RunView.attach($("#hiRun", d), h);
  }

  App.register({
    id: "history", title: "History", icon: "🕘",
    mount(el) {
      el.innerHTML = `<div id="hiTools" class="stack"><div class="row between"><div><h2>History</h2><div class="muted small" id="hiCount"></div></div><div class="row"><button class="btn" data-a="export">Export</button><button class="btn danger" data-a="clear">Clear all</button></div></div><input id="hiQ" type="search" placeholder="Search history…"></div><div id="hiList" class="stack"></div><div id="hiDetail" class="stack" hidden></div>`;
      $("#hiQ", el).addEventListener("input", e => { q = e.target.value.toLowerCase(); renderList(el); });
      el.addEventListener("click", e => {
        if (e.target.closest("[data-back]")) { $("#hiDetail", el).hidden = true; $("#hiList", el).hidden = false; $("#hiTools", el).hidden = false; return; }
        const del = e.target.closest("[data-del]"); if (del) { Store.deleteItem(del.dataset.del); renderList(el); return; }
        const op = e.target.closest("[data-open]"); if (op) { openItem(el, op.dataset.open); return; }
        const b = e.target.closest("[data-a]"); if (!b) return;
        if (b.dataset.a === "export") U.download("history.json", JSON.stringify(Store.history(), null, 2));
        else if (b.dataset.a === "clear" && confirm("Delete all history?")) { Store.clearHistory(); renderList(el); }
      });
    },
    show(el, p) {
      $("#hiDetail", el).hidden = true; $("#hiList", el).hidden = false; $("#hiTools", el).hidden = false;
      renderList(el);
      if (p && p.open) openItem(el, p.open);
    }
  });
})();
