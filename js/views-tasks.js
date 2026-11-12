// Tasks: manual task board (todo / doing / done / blocked), assign to a team or agent, run it, or draft tasks with the Task Builder.
(() => {
  "use strict";
  const { $, esc } = U;
  const COLS = [["todo", "To do"], ["doing", "Doing"], ["blocked", "Blocked"], ["done", "Done"]];
  const tasks = () => Store.get("tasks", []);
  const save = l => { Store.set("tasks", l); Core.emit("tasks"); };
  const targetName = t => { if (!t.assignee) return "Unassigned"; const x = t.assignee.type === "group" ? Core.group(t.assignee.id) : Core.agent(t.assignee.id); return x ? x.name : "(removed)"; };

  function assigneeOptions() {
    return [{ value: "", label: "Unassigned" }, ...Core.groups().map(g => ({ value: "group:" + g.id, label: `Team · ${g.name}` })), ...Core.agents().map(a => ({ value: "agent:" + a.id, label: `Agent · ${a.name}` }))];
  }
  const parseAssignee = v => { if (!v) return null; const [type, id] = v.split(":"); return { type, id }; };
  const assigneeVal = t => t && t.assignee ? `${t.assignee.type}:${t.assignee.id}` : "";

  async function edit(id) {
    const t = id ? tasks().find(x => x.id === id) : null;
    const v = await U.form(t ? "Edit task" : "New task", [
      { key: "title", label: "Title", required: true }, { key: "desc", label: "Details", type: "textarea" },
      { key: "assignee", label: "Assign to", type: "select", options: assigneeOptions() },
      { key: "priority", label: "Priority", type: "select", options: ["low", "medium", "high"] },
      { key: "due", label: "Due date", type: "date" }
    ], t ? { ...t, assignee: assigneeVal(t) } : { priority: "medium" });
    if (!v) return;
    const patch = { title: v.title, desc: v.desc, assignee: parseAssignee(v.assignee), priority: v.priority, due: v.due, updated: Date.now() };
    if (t) save(tasks().map(x => x.id === id ? { ...x, ...patch } : x));
    else save([{ id: U.uid(), status: "todo", created: Date.now(), source: "manual", result: "", ...patch }, ...tasks()]);
  }

  async function runTask(id) {
    const t = tasks().find(x => x.id === id); if (!t) return;
    if (!t.assignee) return U.toast("Assign the task to a team or an agent first.");
    const pre = Engine.preflight(); if (!pre.ok) { U.toast(pre.reason); if (pre.goto) App.go(pre.goto); return; }
    const prompt = `Task: ${t.title}\n${t.desc || ""}\nPriority: ${t.priority}${t.due ? "\nDue: " + t.due : ""}\n\nComplete this task and give the deliverable.`;
    const g = t.assignee.type === "group" ? Core.group(t.assignee.id) : null, a = t.assignee.type === "agent" ? Core.agent(t.assignee.id) : null;
    if (!g && !a) return U.toast("The assignee no longer exists.");
    save(tasks().map(x => x.id === id ? { ...x, status: "doing" } : x));
    U.toast("Task running…");
    const h = g ? Engine.runTeam(g.id, prompt) : Engine.runAgent(a, prompt);
    h.run.type = "task"; h.run.title = `Task: ${t.title}`;
    const r = await h.done;
    save(tasks().map(x => x.id === id ? { ...x, status: r.status === "done" ? "done" : "blocked", result: r.final || ("Failed: " + (r.error || r.status)), runId: r.id, updated: Date.now() } : x));
    U.toast(r.status === "done" ? "Task done." : "Task could not finish: " + (r.error || r.status));
  }

  async function draft() {
    const v = await U.form("Draft tasks with the Task Builder", [{ key: "goal", label: "Goal", type: "textarea", required: true, placeholder: "e.g. Launch the client's wallet dashboard in 4 weeks" }], {}, { submit: "Draft", intro: "The Task Builder proposes tasks; they are added to the board as drafts you can edit or delete." });
    if (!v) return;
    const pre = Engine.preflight(); if (!pre.ok) return U.toast(pre.reason);
    U.toast("Drafting tasks…");
    try {
      const gl = Core.groups().map(g => g.id).join(", ");
      const out = await Engine.call(Core.agent("task-builder") || Core.conductor(), [{ role: "user", content: `Break this goal into 3-8 concrete tasks.\nGoal: ${v.goal}\n\nTeam ids you may assign: ${gl}\nRespond ONLY with JSON: {"tasks":[{"title":"...","desc":"...","team":"<team id or empty>","priority":"low|medium|high"}]}` }]);
      const list = (Engine.parseJSON(out) || {}).tasks || [];
      if (!list.length) return U.toast("The Task Builder returned no tasks.");
      save([...list.map(x => ({ id: U.uid(), title: String(x.title || "Task"), desc: String(x.desc || ""), status: "todo", priority: ["low", "medium", "high"].includes(x.priority) ? x.priority : "medium", assignee: x.team && Core.group(x.team) ? { type: "group", id: x.team } : null, due: "", created: Date.now(), source: "ai", result: "" })), ...tasks()]);
      U.toast(`${list.length} tasks added.`);
    } catch (e) { U.toast("Could not draft: " + e.message); }
  }

  function render(el) {
    const all = tasks();
    el.innerHTML = `<div class="row between"><div><h2>Tasks</h2><div class="muted small">${all.length} tasks · created manually or drafted by the Task Builder</div></div>
      <div class="row"><button class="btn primary" data-a="new">+ New task</button><button class="btn" data-a="draft">Draft with AI</button><button class="btn" data-a="role">+ New role</button></div></div>
      <div class="kanban">${COLS.map(([k, label]) => `<div class="col"><div class="colh">${label} <span class="tag">${all.filter(t => t.status === k).length}</span></div>${all.filter(t => t.status === k).map(t => `
        <div class="card task"><strong>${esc(t.title)}</strong>${t.desc ? `<div class="muted small">${esc(U.trim(t.desc, 140))}</div>` : ""}
          <div class="row"><span class="tag ${t.priority === "high" ? "bad" : ""}">${t.priority}</span><span class="tag">${esc(targetName(t))}</span>${t.due ? `<span class="tag">${esc(t.due)}</span>` : ""}${t.source === "ai" ? `<span class="tag">AI draft</span>` : ""}</div>
          ${t.result ? `<details><summary class="muted small">Result</summary><div class="step-body">${U.md(t.result)}</div></details>` : ""}
          <div class="row"><button class="btn small primary" data-a="run" data-id="${t.id}">Run</button><button class="btn small" data-a="edit" data-id="${t.id}">Edit</button>
            ${COLS.filter(([c]) => c !== k).map(([c, l]) => `<button class="btn small" data-a="mv" data-id="${t.id}" data-to="${c}">→ ${l}</button>`).join("")}<button class="btn small danger" data-a="del" data-id="${t.id}">✕</button></div></div>`).join("")}</div>`).join("")}</div>`;
  }

  App.register({
    id: "tasks", title: "Tasks", icon: "📌",
    mount(el) {
      el.addEventListener("click", async e => {
        const b = e.target.closest("[data-a]"); if (!b) return;
        const id = b.dataset.id;
        switch (b.dataset.a) {
          case "new": await edit(); break;
          case "draft": await draft(); break;
          case "role": App.go("agents", { create: true }); return;
          case "edit": await edit(id); break;
          case "run": await runTask(id); break;
          case "mv": save(tasks().map(x => x.id === id ? { ...x, status: b.dataset.to, updated: Date.now() } : x)); break;
          case "del": if (confirm("Delete this task?")) save(tasks().filter(x => x.id !== id)); break;
        }
        render(el);
      });
      Core.on(t => { if (t === "tasks" && App.current() === "tasks") render(el); });
    },
    show(el, p) { render(el); if (p && p.create) edit().then(() => render(el)); }
  });
})();
