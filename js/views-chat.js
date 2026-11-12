// Chat with any one of the agents (with long-term memory injected).
(() => {
  "use strict";
  const { $, esc } = U;
  let chat = null, abort = null;

  function options() {
    return Core.systems().map(s => {
      const byG = {};
      s.agents.forEach(a => (byG[a.group] = byG[a.group] || []).push(a));
      return Object.entries(byG).map(([gid, list]) => {
        const g = Core.group(gid);
        return `<optgroup label="${esc((g ? g.icon + " " + g.name : gid))}">${list.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</optgroup>`;
      }).join("");
    }).join("");
  }
  function newChat(agentId) { chat = { id: U.uid(), type: "chat", title: "New chat", agentId, messages: [], ts: Date.now() }; paint(); }

  function paint() {
    const box = $("#chatMessages"), a = chat && Core.agent(chat.agentId);
    if (!chat || !chat.messages.length) {
      box.innerHTML = `<div class="empty"><b>${esc(a ? a.name : "No agent")}</b>${esc(a ? a.role : "Add an agent in the Agents tab.")}<br><br>Type a message below to start.</div>`; return;
    }
    box.innerHTML = chat.messages.map(m => `<div class="msg ${m.role}">${U.md(m.content)}</div>`).join("");
    box.scrollTop = box.scrollHeight;
  }
  function save() {
    if (!chat || !chat.messages.length) return;
    chat.title = (chat.messages.find(m => m.role === "user") || { content: "Chat" }).content.slice(0, 60);
    chat.provider = Core.settings().provider; chat.model = Core.modelName(); chat.updated = Date.now();
    Store.saveItem(U.clone(chat));
  }
  const grow = () => { const t = $("#chatInput"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 140) + "px"; };
  const busy = b => { $("#chatSend").hidden = b; $("#chatStop").hidden = !b; };

  async function send() {
    const input = $("#chatInput"), text = input.value.trim();
    if (!text || abort) return;
    const a = chat && Core.agent(chat.agentId);
    if (!a) return U.toast("Pick an agent first.");
    const pre = Engine.preflight();
    if (!pre.ok) { U.toast(pre.reason); if (pre.goto) App.go(pre.goto); return; }
    chat.messages.push({ role: "user", content: text });
    input.value = ""; grow(); paint();
    const box = $("#chatMessages");
    const bubble = document.createElement("div"); bubble.className = "msg assistant"; bubble.textContent = "…"; box.appendChild(bubble); box.scrollTop = box.scrollHeight;
    abort = new AbortController(); busy(true);
    let acc = "";
    try {
      const out = await Engine.call(a, chat.messages, { signal: abort.signal, query: text, onToken: (t, all) => { acc = all; bubble.innerHTML = U.md(all); box.scrollTop = box.scrollHeight; } });
      chat.messages.push({ role: "assistant", content: out || acc });
      if (!out && !acc) bubble.remove();
    } catch (e) {
      if (acc) chat.messages.push({ role: "assistant", content: acc });
      if (e.name !== "AbortError") { bubble.className = "msg error"; bubble.textContent = "⚠ " + e.message; }
    } finally { abort = null; busy(false); save(); }
  }

  App.register({
    id: "chat", title: "Chat", icon: "💬",
    mount(el) {
      el.classList.add("chatview");
      el.innerHTML = `
        <div class="toolbar"><select id="chatAgent" aria-label="Agent"></select><button id="chatNew" class="btn">New chat</button><button id="chatRemember" class="btn" title="Save durable facts from this chat to memory">Remember</button></div>
        <div id="chatMessages" class="messages"></div>
        <form id="chatForm" class="composer">
          <textarea id="chatInput" rows="1" placeholder="Message the agent…  (Enter to send, Shift+Enter for a new line)"></textarea>
          <button id="chatSend" class="btn primary" type="submit">Send</button><button id="chatStop" class="btn danger" type="button" hidden>Stop</button>
        </form>`;
      $("#chatAgent").innerHTML = options();
      newChat(Core.conductor().id); $("#chatAgent").value = chat.agentId;
      $("#chatForm").addEventListener("submit", e => { e.preventDefault(); send(); });
      $("#chatInput").addEventListener("input", grow);
      $("#chatInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
      $("#chatStop").addEventListener("click", () => abort && abort.abort());
      $("#chatNew").addEventListener("click", () => newChat($("#chatAgent").value));
      $("#chatAgent").addEventListener("change", () => newChat($("#chatAgent").value));
      $("#chatRemember").addEventListener("click", async () => {
        if (!chat || !chat.messages.length) return U.toast("Nothing to remember yet.");
        const pre = Engine.preflight(); if (!pre.ok) return U.toast(pre.reason);
        U.toast("Extracting memories…");
        try { const n = await Engine.extractMemories(chat.messages.map(m => `${m.role}: ${m.content}`).join("\n")); U.toast(n ? `${n} memories saved.` : "Nothing new to remember."); } catch (e) { U.toast("Could not extract: " + e.message); }
      });
      Core.on(t => { if (t === "systems") { const v = $("#chatAgent").value; $("#chatAgent").innerHTML = options(); if (Core.agent(v)) $("#chatAgent").value = v; } });
    },
    show(el, p) {
      if (p && p.agentId && Core.agent(p.agentId)) { $("#chatAgent").value = p.agentId; newChat(p.agentId); }
      if (p && p.chat) { chat = U.clone(p.chat); if (!Core.agent(chat.agentId)) chat.agentId = Core.conductor().id; $("#chatAgent").value = chat.agentId; paint(); }
    }
  });
})();
