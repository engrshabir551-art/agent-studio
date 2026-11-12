// Comms: structured agent-to-agent messages (envelope protocol), live log, send and validate.
(() => {
  "use strict";
  const { $, esc } = U;
  let typeF = "", textF = "";
  const agentOpts = () => Core.agents().map(a => ({ value: a.id, label: a.name }));

  function renderLog(el) {
    const list = Core.Bus.list().filter(m => (!typeF || m.type === typeF) && (!textF || JSON.stringify([m.from, m.to, m.subject, m.body]).toLowerCase().includes(textF))).slice(0, 150);
    $("#busLog", el).innerHTML = list.map(m => `<div class="card msgcard"><div class="row between"><span><span class="tag ${m.status === "rejected" ? "bad" : ""}">${esc(m.type)}</span> <b>${esc(m.from && m.from.name)}</b> → <b>${esc(m.to && (m.to.name || m.to.group))}</b></span><span class="muted small">${U.ago(m.ts)}</span></div>
      ${m.subject ? `<div><strong>${esc(m.subject)}</strong></div>` : ""}<div class="step-body">${U.md(U.trim(m.body, 500))}</div>
      ${m.status === "rejected" ? `<div class="err">Rejected: ${esc((m.errors || []).join("; "))}</div>` : ""}<div class="muted small">corr ${esc(m.corr)}</div></div>`).join("") || `<p class="muted">No messages. They appear when teams and the Conductor work, or when you send one.</p>`;
    $("#busCount", el).textContent = `${Core.Bus.list().length} messages`;
  }

  async function send(el) {
    const v = await U.form("Send agent message", [
      { key: "from", label: "From", type: "select", options: agentOpts() }, { key: "to", label: "To", type: "select", options: agentOpts() },
      { key: "type", label: "Type", type: "select", options: Core.Bus.types }, { key: "subject", label: "Subject" },
      { key: "body", label: "Body", type: "textarea", required: true }, { key: "run", label: "Deliver now: let the receiving agent respond", type: "checkbox" }
    ], { type: "request", from: "conductor", to: "news-editor", run: true }, { submit: "Send" });
    if (!v) return;
    const f = Core.agent(v.from), t = Core.agent(v.to);
    const env = Core.Bus.post({ from: Core.ref(f), to: Core.ref(t), type: v.type, subject: v.subject, body: v.body });
    if (v.run && env.status === "delivered") {
      const pre = Engine.preflight(); if (!pre.ok) return U.toast(pre.reason);
      U.toast(`${t.name} is responding…`);
      try {
        const out = await Engine.call(t, [{ role: "user", content: `Message from ${f.name} (${v.type}${v.subject ? ": " + v.subject : ""}):\n${v.body}\n\nRespond as ${t.name}.` }]);
        Core.Bus.post({ from: Core.ref(t), to: Core.ref(f), type: "response", subject: "Re: " + (v.subject || v.type), body: out, corr: env.corr });
      } catch (e) { U.toast("No response: " + e.message); }
    }
  }

  async function validate() {
    const v = await U.form("Validate an envelope", [{ key: "json", label: "Envelope JSON", type: "textarea", rows: 8, required: true, value: '{\n  "from": {"id": "conductor"},\n  "to": {"id": "news-editor"},\n  "type": "task",\n  "body": "Brief me on today."\n}' }], {}, { submit: "Validate" });
    if (!v) return;
    try { const r = Core.Bus.validate(JSON.parse(v.json)); U.toast(r.ok ? "✅ Valid envelope." : "❌ " + r.errors.join("; "), 7000); } catch (e) { U.toast("Not valid JSON: " + e.message); }
  }

  App.register({
    id: "comms", title: "Comms", icon: "📡",
    mount(el) {
      el.innerHTML = `<div class="row between"><div><h2>Agent communication</h2><div class="muted small" id="busCount"></div></div>
        <div class="row"><button class="btn primary" data-a="send">Send message</button><button class="btn" data-a="validate">Validate envelope</button><button class="btn danger" data-a="clear">Clear</button></div></div>
        <details class="card"><summary>Protocol</summary><pre>{ "from": {"id","name"}, "to": {"id","name","group"}, "type": "task | result | request | response | event | handoff | alert",
  "subject": "…", "body": "…", "corr": "correlation id" }</pre><p class="muted small">Messages missing a sender, recipient, valid type or body are stored as rejected with the reasons.</p></details>
        <div class="row"><select id="busType"><option value="">All types</option>${Core.Bus.types.map(t => `<option>${t}</option>`).join("")}</select><input id="busQ" type="search" placeholder="Search messages…"></div>
        <div id="busLog" class="stack"></div>`;
      $("#busType", el).addEventListener("change", e => { typeF = e.target.value; renderLog(el); });
      $("#busQ", el).addEventListener("input", e => { textF = e.target.value.toLowerCase(); renderLog(el); });
      el.addEventListener("click", async e => {
        const b = e.target.closest("[data-a]"); if (!b) return;
        if (b.dataset.a === "send") await send(el); else if (b.dataset.a === "validate") await validate(); else if (b.dataset.a === "clear" && confirm("Clear all messages?")) Core.Bus.clear();
        renderLog(el);
      });
      Core.on(t => { if (t === "bus" && App.current() === "comms") renderLog(el); });
    },
    show(el) { renderLog(el); }
  });
})();
