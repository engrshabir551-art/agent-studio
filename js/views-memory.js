// Memory: long-term items injected into agent prompts when relevant.
(() => {
  "use strict";
  const { $, esc } = U;
  let q = "", scope = "";

  function scopeOptions() {
    return [{ value: "global", label: "Everyone (global)" }, ...Core.groups().map(g => ({ value: g.id, label: `Team · ${g.name}` })), ...Core.agents().map(a => ({ value: a.id, label: `Agent · ${a.name}` }))];
  }
  const scopeName = s => s === "global" ? "Everyone" : (Core.group(s) ? "Team · " + Core.group(s).name : Core.agent(s) ? Core.agent(s).name : s);

  async function edit(id) {
    const m = id ? Core.Memory.all().find(x => x.id === id) : null;
    const v = await U.form(m ? "Edit memory" : "Add memory", [
      { key: "text", label: "Memory", type: "textarea", required: true, placeholder: "A short, standalone fact, preference or decision" },
      { key: "scope", label: "Applies to", type: "select", options: scopeOptions() }, { key: "tags", label: "Tags (comma separated)" }, { key: "pinned", label: "Always include (pinned)", type: "checkbox" }
    ], m ? { ...m, tags: (m.tags || []).join(", ") } : { scope: "global" });
    if (!v) return;
    const tags = v.tags ? v.tags.split(",").map(s => s.trim()).filter(Boolean) : [];
    if (m) Core.Memory.update(id, { text: v.text, scope: v.scope, tags, pinned: v.pinned }); else Core.Memory.add({ text: v.text, scope: v.scope, tags, pinned: v.pinned });
  }

  function render(el) {
    const all = Core.Memory.all().filter(m => (!scope || m.scope === scope) && (!q || (m.text + (m.tags || []).join(" ")).toLowerCase().includes(q)));
    $("#memList", el).innerHTML = all.map(m => `<div class="card"><div>${m.pinned ? "📌 " : ""}${esc(m.text)}</div>
      <div class="row"><span class="tag">${esc(scopeName(m.scope))}</span>${(m.tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join("")}<span class="tag">${esc(m.source)}</span><span class="muted small">${U.ago(m.ts)}</span></div>
      <div class="row"><button class="btn small" data-a="pin" data-id="${m.id}">${m.pinned ? "Unpin" : "Pin"}</button><button class="btn small" data-a="edit" data-id="${m.id}">Edit</button><button class="btn small danger" data-a="del" data-id="${m.id}">Delete</button></div></div>`).join("") || `<p class="muted">No memories${q || scope ? " match" : " yet"}. Add one, or ask an agent to “Remember” a chat or result.</p>`;
    $("#memCount", el).textContent = `${Core.Memory.all().length} items`;
  }

  App.register({
    id: "memory", title: "Memory", icon: "🧠",
    mount(el) {
      el.innerHTML = `<div class="row between"><div><h2>Memory</h2><div class="muted small" id="memCount"></div></div>
        <div class="row"><button class="btn primary" data-a="add">+ Add</button><button class="btn" data-a="extract">Extract from text</button><label class="check"><input type="checkbox" id="memOn"> Use memory in agent prompts</label></div></div>
        <div class="row"><input id="memQ" type="search" placeholder="Search memory…"><select id="memScope"></select></div><div id="memList" class="stack"></div>`;
      $("#memOn", el).checked = Core.settings().memoryOn !== false;
      $("#memOn", el).addEventListener("change", e => { Core.settings().memoryOn = e.target.checked; Core.saveSettings(); });
      $("#memQ", el).addEventListener("input", e => { q = e.target.value.toLowerCase(); render(el); });
      $("#memScope", el).addEventListener("change", e => { scope = e.target.value; render(el); });
      el.addEventListener("click", async e => {
        const b = e.target.closest("[data-a]"); if (!b) return;
        const id = b.dataset.id;
        if (b.dataset.a === "add") await edit();
        else if (b.dataset.a === "edit") await edit(id);
        else if (b.dataset.a === "pin") { const m = Core.Memory.all().find(x => x.id === id); Core.Memory.update(id, { pinned: !m.pinned }); }
        else if (b.dataset.a === "del") Core.Memory.remove(id);
        else if (b.dataset.a === "extract") {
          const v = await U.form("Extract memories", [{ key: "text", label: "Paste text", type: "textarea", rows: 8, required: true }], {}, { submit: "Extract", intro: "The Memory Keeper picks durable facts, preferences and decisions. Secrets are filtered out." });
          if (!v) return;
          const pre = Engine.preflight(); if (!pre.ok) return U.toast(pre.reason);
          U.toast("Extracting…");
          try { const n = await Engine.extractMemories(v.text); U.toast(n ? `${n} memories saved.` : "Nothing new to remember."); } catch (err) { U.toast("Failed: " + err.message); }
        }
        render(el);
      });
      Core.on(t => { if (t === "memory" && App.current() === "memory") render(el); });
    },
    show(el) {
      $("#memScope", el).innerHTML = `<option value="">All scopes</option>` + scopeOptions().map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("");
      $("#memScope", el).value = scope; render(el);
    }
  });
})();
