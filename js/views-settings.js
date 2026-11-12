// Settings: AI provider, model, key, run preferences, storage, install.
(() => {
  "use strict";
  const { $, esc } = U;
  let installEvt = null;

  function fields(el) {
    const id = Core.settings().provider, p = PROVIDERS[id], c = Core.cfg(id);
    $("#setKey", el).value = c.apiKey || ""; $("#setKey", el).placeholder = p.needsKey ? "Paste your API key" : "API key (optional)";
    $("#setModel", el).value = c.model || ""; $("#setModel", el).placeholder = p.model || "model name";
    $("#setBase", el).value = c.baseUrl || ""; $("#setBase", el).placeholder = p.baseUrl || "https://…/v1";
    $("#provHint", el).textContent = p.hint; $("#testOut", el).textContent = ""; $("#modelList", el).innerHTML = "";
    App.renderBadge();
  }
  function saveProv(el) {
    const s = Core.settings(), id = s.provider;
    s.providers = s.providers || {};
    const old = s.providers[id] || {};
    s.providers[id] = { apiKey: $("#setKey", el).value.trim(), model: $("#setModel", el).value.trim(), baseUrl: $("#setBase", el).value.trim() };
    if (old.apiKey !== s.providers[id].apiKey) Core.Audit.log("security", `API key for ${id} ${s.providers[id].apiKey ? "set" : "removed"}`);
    Core.saveSettings();
  }

  App.register({
    id: "settings", title: "Settings", icon: "⚙️",
    mount(el) {
      el.innerHTML = `
        <div class="card"><h2>AI provider</h2>
          <label class="field">Provider<select id="setProvider">${Object.entries(PROVIDERS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("")}</select></label>
          <p id="provHint" class="muted small"></p>
          <label class="field">API key<div class="row nowrap"><input id="setKey" type="password" autocomplete="off"><button id="keyToggle" class="btn" type="button">Show</button></div></label>
          <label class="field">Model<input id="setModel" list="modelList" autocomplete="off"><datalist id="modelList"></datalist></label>
          <label class="field">Base URL<input id="setBase" autocomplete="off"></label>
          <label class="field">Temperature <span id="tempVal" class="muted"></span><input id="setTemp" type="range" min="0" max="1.5" step="0.1"></label>
          <div class="row"><button id="loadModels" class="btn">Load models</button><button id="testConn" class="btn primary">Test connection</button></div><pre id="testOut" class="muted small"></pre></div>
        <div class="card"><h2>Run preferences</h2>
          <div class="row"><label class="inline">Members in parallel<input id="setConc" type="number" min="1" max="10"></label><label class="inline">Teams in parallel<input id="setTConc" type="number" min="1" max="6"></label></div>
          <label class="check"><input type="checkbox" id="setMem"> Use long-term memory in agent prompts</label>
          <p class="muted small">Lower parallelism if your provider rate-limits you.</p></div>
        <div class="card"><h2>App</h2><p class="muted small">Everything is stored on this device (<span id="storKind"></span>). Keys go only to the provider you choose. Works offline for everything except cloud AI calls; use Ollama on your network to run agents offline.</p>
          <div class="row"><button id="installBtn" class="btn" hidden>Install app</button><button id="wipeAll" class="btn danger">Erase all app data</button></div>
          <p class="muted small">Open source (MIT licence). Source and build instructions are in the repository README.</p></div>`;
      const s = Core.settings();
      $("#setProvider", el).value = s.provider; $("#setTemp", el).value = s.temperature; $("#tempVal", el).textContent = s.temperature;
      $("#setConc", el).value = s.conc || 3; $("#setTConc", el).value = s.teamConc || 2; $("#setMem", el).checked = s.memoryOn !== false;
      $("#storKind", el).textContent = Store.persistent() ? "IndexedDB" : "browser storage";
      fields(el);
      $("#setProvider", el).addEventListener("change", e => { Core.settings().provider = e.target.value; Core.saveSettings(); fields(el); });
      ["#setKey", "#setModel", "#setBase"].forEach(i => $(i, el).addEventListener("input", () => { saveProv(el); App.renderBadge(); }));
      $("#setTemp", el).addEventListener("input", e => { Core.settings().temperature = +e.target.value; $("#tempVal", el).textContent = e.target.value; Core.saveSettings(); });
      $("#setConc", el).addEventListener("change", e => { Core.settings().conc = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 3)); Core.saveSettings(); });
      $("#setTConc", el).addEventListener("change", e => { Core.settings().teamConc = Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 2)); Core.saveSettings(); });
      $("#setMem", el).addEventListener("change", e => { Core.settings().memoryOn = e.target.checked; Core.saveSettings(); });
      $("#keyToggle", el).addEventListener("click", () => { const k = $("#setKey", el), show = k.type === "password"; k.type = show ? "text" : "password"; $("#keyToggle", el).textContent = show ? "Hide" : "Show"; });
      $("#loadModels", el).addEventListener("click", async () => {
        $("#testOut", el).textContent = "Loading models…";
        try { const list = await LLM.listModels({ provider: Core.settings().provider, cfg: Core.cfg() }); $("#modelList", el).innerHTML = list.map(m => `<option value="${esc(m)}">`).join(""); $("#testOut", el).textContent = `${list.length} models loaded – tap the Model field to pick one.`; }
        catch (e) { $("#testOut", el).textContent = "⚠ " + e.message; }
      });
      $("#testConn", el).addEventListener("click", async () => {
        const out = $("#testOut", el); out.textContent = "Testing…";
        const pre = Core.canCall(); if (!pre.ok) { out.textContent = "⚠ " + pre.reason; return; }
        try { const r = await LLM.chat({ provider: Core.settings().provider, cfg: Core.cfg(), messages: [{ role: "user", content: "Reply with the single word: OK" }], temperature: 0 }); out.textContent = "✅ Connected. Model replied: " + r.trim().slice(0, 80); }
        catch (e) { out.textContent = "⚠ " + e.message; }
      });
      $("#wipeAll", el).addEventListener("click", () => { if (confirm("Erase ALL app data (keys, agents, history, memory, vault)? This cannot be undone.")) { Store.wipe(); location.reload(); } });
      window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("#installBtn", el).hidden = false; });
      $("#installBtn", el).addEventListener("click", async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("#installBtn", el).hidden = true; });
    },
    show(el) { $("#setProvider", el).value = Core.settings().provider; fields(el); }
  });
})();
