// Agents: view, add, edit, delete, import/export the roster; export system specs.
(() => {
  "use strict";
  const { $, esc } = U;
  let q = "", open = new Set();

  async function editAgent(id) {
    const a = id ? Core.agent(id) : null, sys = a ? Core.systemOf(a.id) : Core.systems()[0];
    const v = await U.form(a ? "Edit agent" : "New agent (role)", [
      { key: "name", label: "Name", required: true }, { key: "role", label: "Role" },
      { key: "system", label: "System", type: "select", options: Core.systems().map(s => ({ value: s.id, label: s.name })) },
      { key: "group", label: "Team", required: true, list: Core.groups().map(g => g.id), hint: "Pick an existing team id or type a new one" },
      { key: "layer", label: "Layer", type: "select", options: ["conductor", "orchestrator", "lead", "worker"] },
      { key: "manual", label: "Manual-input agent (you fill in its roles and tasks)", type: "checkbox" }, { key: "enabled", label: "Enabled", type: "checkbox" },
      { key: "prompt", label: "Instructions", type: "textarea", rows: 6, placeholder: "What this agent does and how it answers" }
    ], a ? { ...a, system: sys.id } : { system: sys.id, group: "mgmt", layer: "worker", enabled: true });
    if (!v) return;
    const group = U.slug(v.group) || "ungrouped";
    if (a) {
      Object.assign(a, { name: v.name, role: v.role, group, layer: v.layer, manual: v.manual, enabled: v.enabled, prompt: v.prompt });
      if (sys.id !== v.system) { sys.agents = sys.agents.filter(x => x !== a); Core.systems().find(s => s.id === v.system).agents.push(a); }
    } else {
      let nid = U.slug(v.name) || U.uid(); while (Core.agent(nid)) nid += "-" + Math.floor(Math.random() * 99);
      Core.systems().find(s => s.id === v.system).agents.push({ id: nid, name: v.name, role: v.role, group, layer: v.layer, manual: v.manual, enabled: v.enabled, prompt: v.prompt });
    }
    Core.saveSystems(); Core.Audit.log("agents", `${a ? "Edited" : "Created"} agent ${v.name}`);
  }

  function normalize(data) {
    const arr = Array.isArray(data) ? data : data && data.systems;
    if (!Array.isArray(arr) || !arr.length) throw new Error('The JSON must contain a "systems" array.');
    return arr.map((s, i) => ({
      id: String(s.id || "sys" + (i + 1)), name: s.name || `System ${i + 1}`, description: s.description || "",
      agents: (s.agents || []).map((a, j) => ({ id: String(a.id || U.slug(a.name) || U.uid()), name: a.name || `Agent ${j + 1}`, layer: ["conductor", "orchestrator", "lead"].includes(a.layer) ? a.layer : "worker", group: U.slug(a.group || a.team || "") || "ungrouped", role: a.role || "", prompt: a.prompt || "", manual: !!a.manual, enabled: a.enabled !== false }))
    }));
  }

  function render(el) {
    const total = Core.agents().length;
    $("#agCount", el).textContent = `${total} agents · ${Core.systems().length} systems · ${Core.groups().length} teams`;
    const ql = q.toLowerCase();
    $("#agList", el).innerHTML = Core.systems().map(s => {
      const list = s.agents.filter(a => !ql || (a.name + a.role + a.group).toLowerCase().includes(ql));
      return `<details class="card sys" data-sys="${esc(s.id)}" ${open.has(s.id) || ql ? "open" : ""}><summary><strong>${esc(s.name)}</strong><span class="muted small">${s.agents.length} agents</span></summary>
        <p class="muted small">${esc(s.description || "")}</p>
        ${list.map(a => { const g = Core.groupOf(a); return `<div class="agent-row"><div class="info"><strong>${esc(a.name)}</strong><span class="tag ${a.layer !== "worker" ? "orch" : ""}">${a.layer}</span>${a.manual ? `<span class="tag">manual</span>` : ""}${a.enabled === false ? `<span class="tag bad">disabled</span>` : ""}<span class="tag">${esc(g ? g.name : a.group)}</span><div class="muted small">${esc(a.role)}</div></div>
          <div class="row nowrap"><button class="btn small" data-a="chat" data-id="${a.id}">Chat</button><button class="btn small" data-a="edit" data-id="${a.id}">Edit</button><button class="btn small danger" data-a="del" data-id="${a.id}">✕</button></div></div>`; }).join("")}
        <div class="row"><button class="btn small" data-a="add" data-sys="${esc(s.id)}">+ Add agent</button><button class="btn small" data-a="rename" data-sys="${esc(s.id)}">Rename system</button><button class="btn small danger" data-a="delsys" data-sys="${esc(s.id)}">Delete system</button></div></details>`;
    }).join("");
  }

  App.register({
    id: "agents", title: "Agents", icon: "🤖",
    mount(el) {
      el.innerHTML = `<div class="row between"><div><h2>Agents</h2><div class="muted small" id="agCount"></div></div>
        <div class="row"><button class="btn primary" data-a="add">+ Agent / role</button><button class="btn" data-a="sysadd">+ System</button><button class="btn" data-a="import">Import JSON</button><button class="btn" data-a="export">Export JSON</button><button class="btn" data-a="spec">Export specs (.md)</button><button class="btn" data-a="reset">Reset</button></div></div>
        <input id="agQ" type="search" placeholder="Search agents, roles, teams…"><input id="agFile" type="file" accept=".json,application/json" hidden><div id="agList" class="stack"></div>`;
      $("#agQ", el).addEventListener("input", e => { q = e.target.value; render(el); });
      el.addEventListener("toggle", e => { const d = e.target; if (d.dataset && d.dataset.sys) d.open ? open.add(d.dataset.sys) : open.delete(d.dataset.sys); }, true);
      $("#agFile", el).addEventListener("change", async e => {
        const f = e.target.files[0]; e.target.value = ""; if (!f) return;
        try { const systems = normalize(JSON.parse(await f.text())); const n = systems.reduce((k, s) => k + s.agents.length, 0); if (!confirm(`Replace the current roster with ${n} imported agents?`)) return; Core.systems().splice(0, Core.systems().length, ...systems); Core.saveSystems(); Core.Audit.log("agents", `Imported roster (${n} agents)`); U.toast("Roster imported."); render(el); } catch (err) { U.toast("Import failed: " + err.message); }
      });
      el.addEventListener("click", async e => {
        const b = e.target.closest("[data-a]"); if (!b) return;
        const id = b.dataset.id, sid = b.dataset.sys, s = sid ? Core.systems().find(x => x.id === sid) : null;
        switch (b.dataset.a) {
          case "chat": App.go("chat", { agentId: id }); return;
          case "edit": await editAgent(id); break;
          case "add": await editAgent(); break;
          case "del": { const a = Core.agent(id); if (confirm(`Delete ${a.name}?`)) { const sys = Core.systemOf(id); sys.agents = sys.agents.filter(x => x.id !== id); Core.saveSystems(); } break; }
          case "sysadd": { const v = await U.form("New system", [{ key: "name", label: "Name", required: true }, { key: "description", label: "Description" }]); if (v) { Core.systems().push({ id: "sys-" + U.uid(), name: v.name, description: v.description, agents: [] }); Core.saveSystems(); } break; }
          case "rename": { const v = await U.form("Rename system", [{ key: "name", label: "Name", required: true }, { key: "description", label: "Description" }], s); if (v) { Object.assign(s, v); Core.saveSystems(); } break; }
          case "delsys": if (confirm(`Delete "${s.name}" and its ${s.agents.length} agents?`)) { Core.systems().splice(Core.systems().indexOf(s), 1); Core.saveSystems(); } break;
          case "import": $("#agFile", el).click(); return;
          case "export": U.download("agents.json", JSON.stringify({ systems: Core.systems() }, null, 2)); return;
          case "spec": U.download("SPECS.md", Specs.markdown(Core.systems(), window.GROUP_META), "text/markdown"); return;
          case "reset": if (confirm("Reset to the standard 56-agent roster? Your changes to agents will be lost.")) { Store.resetSystems(); Core.load(); Core.saveSystems(); } break;
        }
        render(el);
      });
      Core.on(t => { if (t === "systems" && App.current() === "agents") render(el); });
    },
    show(el, p) { render(el); if (p && p.create) editAgent().then(() => render(el)); }
  });
})();
