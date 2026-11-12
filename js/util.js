// Small shared helpers (DOM, formatting, markdown, form dialog, downloads).
window.U = (() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ESC[c]);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = o => JSON.parse(JSON.stringify(o));
  const slug = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const trim = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n) + "…" : s; };

  function md(text) {
    const blocks = [];
    let t = esc(text).replace(/```[\w-]*\n?([\s\S]*?)```/g, (m, c) => { blocks.push(c); return `\u0000${blocks.length - 1}\u0000`; });
    t = t.split("\n").map(line => {
      const l = line.replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
      const h = l.match(/^\s{0,3}#{1,4}\s+(.*)$/);
      if (h) return `<strong class="mdh">${h[1]}</strong>`;
      const b = l.match(/^\s*[-*]\s+(.*)$/);
      if (b) return `<span class="mdli">• ${b[1]}</span>`;
      return l;
    }).join("<br>");
    return t.replace(/\u0000(\d+)\u0000/g, (m, i) => `<pre><code>${blocks[i]}</code></pre>`);
  }

  let toastTimer;
  function toast(msg, ms = 3400) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), ms);
  }

  function money(n, cur = "USD") {
    n = Number(n) || 0;
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(n); }
    catch { return n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + " " + cur; }
  }
  const num = (n, d = 2) => (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: d });
  const dt = ts => new Date(ts).toLocaleString();
  function ago(ts) {
    if (!ts) return "never";
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " h ago";
    return Math.floor(s / 86400) + " d ago";
  }

  function download(name, text, type = "application/json") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function csv(rows) {
    return rows.map(r => r.map(c => { const s = String(c ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\n");
  }
  async function readFile(file, max = 60000) { return (await file.text()).slice(0, max); }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast("Copied."); } catch { toast("Copy failed – select the text manually."); }
  }
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // ---- generic form dialog: returns a values object, or null when cancelled ----
  function fieldHtml(f, val) {
    const v = val ?? f.value ?? "";
    const id = "ff_" + f.key;
    let input;
    if (f.type === "checkbox") return `<label class="check"><input type="checkbox" name="${f.key}" ${v ? "checked" : ""}> ${esc(f.label || f.key)}</label>`;
    if (f.type === "textarea") input = `<textarea name="${f.key}" id="${id}" rows="${f.rows || 4}" placeholder="${esc(f.placeholder || "")}">${esc(v)}</textarea>`;
    else if (f.type === "select") input = `<select name="${f.key}" id="${id}">${(f.options || []).map(o => {
      const ov = typeof o === "object" ? o.value : o, ol = typeof o === "object" ? o.label : o;
      return `<option value="${esc(ov)}" ${String(ov) === String(v) ? "selected" : ""}>${esc(ol)}</option>`;
    }).join("")}</select>`;
    else input = `<input name="${f.key}" id="${id}" type="${f.type || "text"}" ${f.step ? `step="${f.step}"` : ""} value="${esc(v)}" placeholder="${esc(f.placeholder || "")}" ${f.list ? `list="dl_${f.key}"` : ""} autocomplete="off">` +
      (f.list ? `<datalist id="dl_${f.key}">${f.list.map(x => `<option value="${esc(x)}">`).join("")}</datalist>` : "");
    return `<label class="field">${esc(f.label || f.key)}${f.hint ? `<span class="muted small">${esc(f.hint)}</span>` : ""}${input}</label>`;
  }

  function form(title, fields, initial = {}, opts = {}) {
    return new Promise(resolve => {
      const dlg = $("#formDialog"), body = $("#formBody"), formEl = $("#formEl");
      $("#formTitle").textContent = title;
      $("#formSubmit").textContent = opts.submit || "Save";
      body.innerHTML = (opts.intro ? `<p class="muted small">${esc(opts.intro)}</p>` : "") + fields.map(f => fieldHtml(f, initial[f.key])).join("");
      let done = false;
      const collect = () => {
        const out = {};
        for (const f of fields) {
          const el = body.querySelector(`[name="${f.key}"]`);
          if (!el) continue;
          let v;
          if (f.type === "checkbox") v = el.checked;
          else if (f.type === "number") { v = el.value === "" ? null : parseFloat(el.value); if (el.value !== "" && !isFinite(v)) v = null; }
          else v = el.value.trim();
          if (f.required && (v === "" || v === null)) { toast(`${f.label || f.key} is required.`); el.focus(); return undefined; }
          out[f.key] = v;
        }
        return out;
      };
      const onSubmit = e => { e.preventDefault(); const v = collect(); if (v === undefined) return; done = true; dlg.close(); resolve(v); };
      const onCancel = () => dlg.close();
      const onClose = () => { formEl.removeEventListener("submit", onSubmit); $("#formCancel").removeEventListener("click", onCancel); dlg.removeEventListener("close", onClose); if (!done) resolve(null); };
      formEl.addEventListener("submit", onSubmit);
      $("#formCancel").addEventListener("click", onCancel);
      dlg.addEventListener("close", onClose);
      dlg.showModal();
      const first = body.querySelector("input,select,textarea"); if (first) first.focus();
    });
  }

  return { $, $$, esc, uid, clone, slug, trim, md, toast, money, num, dt, ago, download, csv, readFile, copy, debounce, form };
})();
