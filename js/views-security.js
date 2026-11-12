// Security: app lock, security checks, audit log, encrypted backup/restore.
window.Lock = (() => {
  "use strict";
  let locked = false, idle = null, fails = 0, until = 0;
  const hasCrypto = () => !!(window.crypto && crypto.subtle);
  const enc = s => new TextEncoder().encode(s);
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  async function derive(pin, salt) {
    const km = await crypto.subtle.importKey("raw", enc(pin), "PBKDF2", false, ["deriveBits"]);
    return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc(salt), iterations: 150000, hash: "SHA-256" }, km, 256));
  }
  const enabled = () => !!(Core.settings().lock && Core.settings().lock.hash);
  async function set(pin) {
    const salt = U.uid() + U.uid(), s = Core.settings();
    s.lock = { salt, hash: await derive(pin, salt) }; Core.saveSettings(); Core.Audit.log("security", "App lock enabled"); arm();
  }
  function disable() { const s = Core.settings(); s.lock = null; Core.saveSettings(); Core.Audit.log("security", "App lock disabled"); clearTimeout(idle); }
  async function verify(pin) { const l = Core.settings().lock; return !!l && (await derive(pin, l.salt)) === l.hash; }
  function show() {
    if (!enabled()) return;
    locked = true; document.getElementById("lock").hidden = false;
    const i = document.getElementById("lockPin"); i.value = ""; setTimeout(() => i.focus(), 50);
    document.getElementById("lockMsg").textContent = "";
  }
  async function tryUnlock() {
    const msg = document.getElementById("lockMsg"), i = document.getElementById("lockPin");
    if (Date.now() < until) { msg.textContent = `Too many attempts. Wait ${Math.ceil((until - Date.now()) / 1000)} s.`; return; }
    if (await verify(i.value)) { fails = 0; locked = false; document.getElementById("lock").hidden = true; Core.Audit.log("security", "Unlocked"); arm(); }
    else { fails++; i.value = ""; Core.Audit.log("security", `Failed unlock attempt (${fails})`); msg.textContent = "Wrong PIN."; if (fails >= 5) { until = Date.now() + 30000; fails = 0; msg.textContent = "Too many attempts. Locked for 30 s."; } }
  }
  function arm() {
    clearTimeout(idle);
    const m = Core.settings().lockMinutes || 5;
    if (enabled() && !locked) idle = setTimeout(show, m * 60000);
  }
  function init() {
    document.getElementById("lockForm").addEventListener("submit", e => { e.preventDefault(); tryUnlock(); });
    ["pointerdown", "keydown", "touchstart"].forEach(ev => document.addEventListener(ev, () => { if (!locked) arm(); }, { passive: true }));
    if (enabled()) show();
  }
  return { init, show, set, disable, enabled, arm, verify, hasCrypto, isLocked: () => locked };
})();

window.Security = (() => {
  "use strict";
  const { $, esc } = U;
  const b64 = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function key(pass, salt) {
    const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, km, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function encryptBackup(obj, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(pass, salt), new TextEncoder().encode(JSON.stringify(obj)));
    return JSON.stringify({ app: "agent-studio", v: 1, kdf: "PBKDF2-SHA256-250k", salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(ct)) });
  }
  async function decryptBackup(text, pass) {
    const j = JSON.parse(text);
    if (j.app !== "agent-studio") throw new Error("This is not an Agent Studio backup.");
    try { const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(j.iv) }, await key(pass, unb64(j.salt)), unb64(j.data)); return JSON.parse(new TextDecoder().decode(pt)); }
    catch { throw new Error("Wrong passphrase, or the file is damaged."); }
  }

  function checks() {
    const s = Core.settings(), out = [];
    out.push(Lock.enabled() ? { level: "ok", title: "App lock enabled", detail: `Locks after ${s.lockMinutes || 5} min idle.` } : { level: "warn", title: "App lock is off", detail: "Anyone with this device can open the app, keys and vault." });
    const keys = Object.entries(s.providers || {}).filter(([, c]) => c.apiKey).length + Finance.apis().filter(a => a.key).length;
    out.push(keys ? { level: "warn", title: `${keys} API key(s) stored on this device`, detail: "Keys are stored unencrypted in app storage. Use restricted, revocable keys; encrypted backups protect exports." } : { level: "ok", title: "No API keys stored", detail: "" });
    const bad = [];
    Object.entries(s.providers || {}).forEach(([id, c]) => { if (c.baseUrl && /^http:\/\//i.test(c.baseUrl) && !LLM.isLocal(id, c)) bad.push(id); });
    Finance.apis().forEach(a => { if (/^http:\/\//i.test(a.baseUrl || "")) bad.push(a.name); });
    out.push(bad.length ? { level: "fail", title: "Unencrypted (http) endpoints", detail: bad.join(", ") + " send data without TLS." } : { level: "ok", title: "All remote endpoints use https", detail: "" });
    const csp = !!document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    out.push(csp ? { level: "ok", title: "Content-Security-Policy active", detail: "Blocks injected or third-party scripts." } : { level: "fail", title: "No Content-Security-Policy", detail: "" });
    out.push(Lock.hasCrypto() ? { level: "ok", title: "Secure context (encryption available)", detail: "" } : { level: "warn", title: "Encryption unavailable", detail: "Open the app over https or install it, so backups and the lock can use WebCrypto." });
    const lb = Store.get("lastBackup", 0);
    out.push(lb && Date.now() - lb < 30 * 864e5 ? { level: "ok", title: "Recent backup", detail: U.ago(lb) } : { level: "warn", title: "No recent backup", detail: "Export an encrypted backup." });
    const f = Core.Audit.list().filter(a => /Failed unlock/.test(a.detail) && Date.now() - a.ts < 864e5).length;
    if (f) out.push({ level: "warn", title: `${f} failed unlock attempt(s) in 24 h`, detail: "Review the audit log." });
    return out;
  }

  let persisted = null;
  function render(el) {
    const list = checks();
    $("#secBody", el).innerHTML = `
      <div class="card"><h3>Checks</h3>${list.map(c => `<div class="alert ${c.level}"><b>${esc(c.title)}</b>${c.detail ? `<div class="small">${esc(c.detail)}</div>` : ""}</div>`).join("")}
        <div class="row"><button class="btn primary" data-a="review">Ask the Security Chief to review</button><button class="btn" data-a="persist">${persisted ? "Storage is persistent" : "Request persistent storage"}</button></div></div>
      <div class="card"><h3>App lock</h3><p class="muted small">A PIN screen that hides the app on this device (PBKDF2-hashed). It is a convenience gate, not disk encryption: use device encryption and encrypted backups for real protection.</p>
        <div class="row">${Lock.enabled() ? `<button class="btn" data-a="lock-now">Lock now</button><button class="btn" data-a="lock-change">Change PIN</button><button class="btn danger" data-a="lock-off">Turn off</button>` : `<button class="btn primary" data-a="lock-on">Set a PIN</button>`}
        <label class="inline">Auto-lock (min)<input id="lockMin" type="number" min="1" max="240" value="${Core.settings().lockMinutes || 5}"></label></div></div>
      <div class="card"><h3>Encrypted backup</h3><p class="muted small">Everything (agents, history, memory, vault, keys) in one AES-GCM encrypted file. Keep the passphrase safe: it cannot be recovered.</p>
        <div class="row"><button class="btn primary" data-a="backup">Export encrypted backup</button><button class="btn" data-a="restore">Restore from backup</button></div><input type="file" id="bkFile" accept=".json,.asbackup" hidden></div>
      <div class="card"><div class="row between"><h3>Audit log</h3><button class="btn small danger" data-a="audit-clear">Clear</button></div>${Core.Audit.list().slice(0, 40).map(a => `<div class="li"><span class="tag">${esc(a.type)}</span> ${esc(a.detail)} <span class="muted small">${U.ago(a.ts)}</span></div>`).join("") || `<p class="muted">Empty.</p>`}</div>`;
  }

  async function pin(title) {
    const v = await U.form(title, [{ key: "pin", label: "PIN (4–12 digits or characters)", type: "password", required: true }, { key: "pin2", label: "Repeat PIN", type: "password", required: true }], {}, { submit: "Set PIN" });
    if (!v) return null;
    if (v.pin.length < 4) { U.toast("PIN must be at least 4 characters."); return null; }
    if (v.pin !== v.pin2) { U.toast("The PINs do not match."); return null; }
    return v.pin;
  }

  App.register({
    id: "security", title: "Security", icon: "🛡️",
    mount(el) {
      el.innerHTML = `<div><h2>Security</h2><div class="muted small">Safeguards for the app, keys and agents</div></div><div id="secBody" class="stack"></div>`;
      el.addEventListener("change", e => { if (e.target.id === "lockMin") { Core.settings().lockMinutes = Math.max(1, parseInt(e.target.value, 10) || 5); Core.saveSettings(); Lock.arm(); } });
      el.addEventListener("change", async e => {
        if (e.target.id !== "bkFile") return;
        const f = e.target.files[0]; e.target.value = ""; if (!f) return;
        const v = await U.form("Restore backup", [{ key: "pass", label: "Backup passphrase", type: "password", required: true }], {}, { submit: "Restore", intro: "This REPLACES all current data in the app." });
        if (!v) return;
        try { const data = await decryptBackup(await f.text(), v.pass); Store.importAll(data); Core.Audit.log("security", "Backup restored"); U.toast("Restored. Reloading…"); setTimeout(() => location.reload(), 700); }
        catch (err) { U.toast(err.message, 6000); }
      });
      el.addEventListener("click", async e => {
        const b = e.target.closest("[data-a]"); if (!b) return;
        const a = b.dataset.a;
        try {
          if (a === "review") {
            const pre = Engine.preflight(); if (!pre.ok) return U.toast(pre.reason);
            const txt = checks().map(c => `[${c.level}] ${c.title}${c.detail ? " – " + c.detail : ""}`).join("\n");
            App.go("teams", { team: "security" });
            setTimeout(() => { const t = document.getElementById("teamTask"); if (t) { t.value = `Review this app's current security checks and give a prioritised action list (most important first), with concrete steps for a non-technical owner:\n\n${txt}`; U.toast("Task prepared – press “Run team”."); } }, 150);
            return;
          }
          if (a === "persist") { persisted = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; U.toast(persisted ? "Storage will not be cleared automatically." : "The browser declined (installing the app helps)."); }
          else if (a === "lock-on" || a === "lock-change") { if (!Lock.hasCrypto()) return U.toast("Needs a secure context (https or installed app)."); const p = await pin(a === "lock-on" ? "Set a PIN" : "New PIN"); if (p) { await Lock.set(p); U.toast("App lock enabled."); } }
          else if (a === "lock-off") { const v = await U.form("Turn off app lock", [{ key: "pin", label: "Current PIN", type: "password", required: true }], {}, { submit: "Turn off" }); if (v && await Lock.verify(v.pin)) { Lock.disable(); U.toast("App lock turned off."); } else if (v) U.toast("Wrong PIN."); }
          else if (a === "lock-now") Lock.show();
          else if (a === "backup") {
            if (!Lock.hasCrypto()) return U.toast("Needs a secure context (https or installed app).");
            const v = await U.form("Encrypted backup", [{ key: "pass", label: "Passphrase (min 8 characters)", type: "password", required: true }, { key: "pass2", label: "Repeat passphrase", type: "password", required: true }], {}, { submit: "Export" });
            if (!v) return;
            if (v.pass.length < 8) return U.toast("Use at least 8 characters."); if (v.pass !== v.pass2) return U.toast("Passphrases do not match.");
            Store.flush();
            U.download(`agent-studio-backup-${new Date().toISOString().slice(0, 10)}.asbackup`, await encryptBackup(Store.exportAll(), v.pass));
            Store.set("lastBackup", Date.now()); Core.Audit.log("security", "Encrypted backup exported"); U.toast("Backup exported.");
          }
          else if (a === "restore") { if (!Lock.hasCrypto()) return U.toast("Needs a secure context."); $("#bkFile", el).click(); return; }
          else if (a === "audit-clear" && confirm("Clear the audit log?")) Core.Audit.clear();
        } catch (err) { U.toast("Error: " + err.message); }
        render(el);
      });
      Core.on(t => { if (t === "audit" && App.current() === "security") render(el); });
    },
    show(el) { render(el); }
  });

  return { checks, encryptBackup, decryptBackup };
})();
