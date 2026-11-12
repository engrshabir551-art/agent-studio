// Vault Terminal: platform balance, cash vault, gold & silver vault, live wallet, payments, API hub, terminal.
(() => {
  "use strict";
  const { $, esc } = U;
  const TABS = [["overview", "Overview"], ["cash", "Cash vault"], ["metals", "Gold & silver"], ["wallet", "Wallet live"], ["payments", "Payments"], ["apis", "API hub"], ["terminal", "Terminal"]];
  const V = { tab: "overview", acc: "", type: "", q: "", term: { out: [], hist: [], i: 0 } };
  let root = null, refreshing = false;

  const tile = (l, v, s) => `<div class="tile"><div class="l">${esc(l)}</div><div class="v">${v}</div>${s ? `<div class="s muted small">${s}</div>` : ""}</div>`;
  const accOpts = (filter) => Finance.accounts().filter(a => !a.archived && (!filter || filter(a))).map(a => ({ value: a.id, label: `${a.name} (${a.currency})` }));
  const base = () => Finance.cfg().base;
  const money = n => U.money(n, base());
  const ageTxt = ts => ts ? U.ago(ts) : "manual";

  // ---------------- overview ----------------
  function overview() {
    const nw = Finance.netWorth(), c = Finance.cfg(), g = Finance.spot("XAU"), s = Finance.spot("XAG");
    const pct = v => nw.total > 0 ? Math.max(0, Math.round(100 * v / nw.total)) : 0;
    return `<div class="tiles">
      ${tile("Platform balance", money(nw.total), `base ${esc(c.base)}`)}${tile("Cash vault & bank", money(nw.cash), Object.entries(nw.byCur).map(([k, v]) => U.money(v, k)).join(" · ") || "–")}
      ${tile("Gold & silver", money(nw.metals), `${U.num(nw.gold.oz, 3)} oz Au · ${U.num(nw.silver.oz, 3)} oz Ag${nw.metalMissing ? " · price missing" : ""}`)}${tile("Wallet (live)", money(nw.wallet), nw.walletMissing ? "price missing" : `${Finance.wallet().length} holdings`)}</div>
      ${nw.total > 0 ? `<div class="card"><h3>Allocation</h3><div class="alloc"><i class="a1" style="width:${pct(nw.cash)}%"></i><i class="a2" style="width:${pct(nw.metals)}%"></i><i class="a3" style="width:${pct(nw.wallet)}%"></i></div>
        <div class="row small muted"><span><i class="sw a1"></i> Cash ${pct(nw.cash)}%</span><span><i class="sw a2"></i> Metals ${pct(nw.metals)}%</span><span><i class="sw a3"></i> Wallet ${pct(nw.wallet)}%</span></div></div>` : ""}
      ${nw.missing.length ? `<div class="alert warn">Missing exchange rate for ${esc(nw.missing.join(", "))}. Refresh prices or set a manual rate in “Rates & prices”.</div>` : ""}
      <div class="card"><div class="row between"><h3>Spot prices</h3><div class="row"><button class="btn small primary" data-a="refresh">${refreshing ? "Refreshing…" : "Refresh live prices"}</button><button class="btn small" data-a="rates">Rates & prices</button></div></div>
        <div class="tiles"><div class="tile"><div class="l">Gold / troy oz</div><div class="v">${g ? U.money(g.price, "USD") : "–"}</div><div class="s muted small">${g ? `${g.src} · ${ageTxt(g.ts)}` : "no price yet"}</div></div>
        <div class="tile"><div class="l">Silver / troy oz</div><div class="v">${s ? U.money(s.price, "USD") : "–"}</div><div class="s muted small">${s ? `${s.src} · ${ageTxt(s.ts)}` : "no price yet"}</div></div></div>
        <p class="muted small">Offline? The last saved prices are used. You can type a manual price in “Rates & prices”.</p></div>
      <div class="grid2"><div class="card"><h3>Recent ledger</h3>${Finance.ledger().slice(0, 6).map(e => `<div class="li"><span class="tag">${e.type}</span> ${U.money(e.amount, e.currency)} · ${esc((Finance.account(e.accountId) || {}).name || "?")}<div class="muted small">${esc(e.memo)} ${U.ago(e.ts)}</div></div>`).join("") || `<p class="muted">No entries yet.</p>`}</div>
      <div class="card"><h3>Open payments</h3>${Finance.payments().filter(p => ["pending", "submitted", "draft"].includes(p.status)).slice(0, 6).map(p => `<div class="li"><span class="tag">${p.status}</span> ${U.money(p.amount, p.currency)} → ${esc(p.payee)}</div>`).join("") || `<p class="muted">None.</p>`}</div></div>`;
  }

  // ---------------- cash ----------------
  function ledgerRows() {
    const rows = Finance.ledger().filter(e => (!V.acc || e.accountId === V.acc || e.toAccountId === V.acc) && (!V.type || e.type === V.type) &&
      (!V.q || JSON.stringify([e.memo, e.ref, e.type]).toLowerCase().includes(V.q)));
    return rows.slice(0, 300).map(e => {
      const a = Finance.account(e.accountId) || { name: "?", currency: "" }, b = e.toAccountId ? Finance.account(e.toAccountId) : null;
      const rev = Finance.ledger().some(x => x.reverses === e.id);
      return `<tr class="${rev ? "struck" : ""}"><td>${new Date(e.ts).toLocaleString()}</td><td>${esc(a.name)}${b ? " → " + esc(b.name) : ""}</td><td>${e.type}${e.reverses ? " (reversal)" : ""}</td>
        <td class="num">${e.type === "deposit" ? "+" : e.type === "adjustment" ? (e.amount >= 0 ? "+" : "") : "−"}${U.num(Math.abs(e.amount), 2)} ${a.currency}</td><td>${e.status}</td><td>${esc(e.memo)} ${e.ref ? `<span class="muted small">#${esc(e.ref)}</span>` : ""}</td>
        <td>${e.status === "completed" && !rev && !e.reverses ? `<button class="btn small" data-a="reverse" data-id="${e.id}">Reverse</button>` : ""}</td></tr>`;
    }).join("");
  }
  function cash() {
    const accs = Finance.accounts();
    return `<div class="row between"><div class="row"><button class="btn primary" data-a="deposit">Deposit</button><button class="btn" data-a="withdraw">Withdraw</button><button class="btn" data-a="transfer">Transfer</button><button class="btn" data-a="adjust">Adjust</button></div>
        <div class="row"><button class="btn small" data-a="acc-add">+ Account</button><button class="btn small" data-a="csv-ledger">Export CSV</button></div></div>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>Account</th><th>Type</th><th>Currency</th><th>Location</th><th class="num">Balance</th><th class="num">Pending out</th><th></th></tr></thead><tbody>${accs.map(a => `<tr class="${a.archived ? "struck" : ""}"><td><b>${esc(a.name)}</b><div class="muted small">${esc(Finance.code(a))}</div></td><td>${a.type}</td><td>${a.currency}</td><td>${esc(a.location || "")}</td>
        <td class="num"><b>${U.money(Finance.balance(a.id), a.currency)}</b></td><td class="num">${Finance.pendingOut(a.id) ? U.money(Finance.pendingOut(a.id), a.currency) : "–"}</td>
        <td><button class="btn small" data-a="acc-edit" data-id="${a.id}">Edit</button></td></tr>`).join("")}</tbody></table></div>
      <h3>Ledger</h3><div class="row"><select id="fAcc"><option value="">All accounts</option>${accs.map(a => `<option value="${a.id}" ${V.acc === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
        <select id="fType"><option value="">All types</option>${["deposit", "withdrawal", "transfer", "payment", "fee", "adjustment"].map(t => `<option ${V.type === t ? "selected" : ""}>${t}</option>`).join("")}</select><input id="fQ" type="search" placeholder="Search memo / reference…" value="${esc(V.q)}"></div>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>Date</th><th>Account</th><th>Type</th><th class="num">Amount</th><th>Status</th><th>Memo</th><th></th></tr></thead><tbody id="ledgerBody">${ledgerRows() || `<tr><td colspan="7" class="muted">No entries.</td></tr>`}</tbody></table></div>
      <p class="muted small">Entries are never deleted: a mistake is corrected with a reversal, so the trail stays complete.</p>`;
  }

  // ---------------- metals ----------------
  function metals() {
    const t = Finance.metalTotals(), list = Finance.metals(), log = Finance.mlog();
    const sumCard = (name, sym) => { const x = t[sym]; return `<div class="card"><h3>${name} vault</h3><div class="tiles">${tile("Pieces", x.pieces)}${tile("Gross weight", U.num(x.g, 2) + " g")}${tile("Fine ounces", U.num(x.oz, 4))}${tile("Value", x.missing ? "price missing" : money(x.value))}</div></div>`; };
    return `<div class="row between"><div class="row"><button class="btn primary" data-a="m-add">+ Add bar / coin</button></div><button class="btn small" data-a="m-csv">Export CSV</button></div>
      <div class="grid2">${sumCard("Gold", "XAU")}${sumCard("Silver", "XAG")}</div>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>Metal</th><th>Item</th><th>Serial</th><th class="num">Qty</th><th class="num">Weight</th><th class="num">Purity</th><th class="num">Fine oz</th><th>Location</th><th class="num">Cost</th><th class="num">Value</th><th class="num">P/L</th><th></th></tr></thead><tbody>${list.map(h => {
        const v = Finance.metalValue(h), pl = v != null && h.cost > 0 && h.costCur === base() && h.qty > 0 ? v - h.cost : null;
        return `<tr class="${h.qty <= 0 ? "struck" : ""}"><td>${h.metal}</td><td>${esc(h.form)} ${esc(h.desc || "")}</td><td>${esc(h.serial || "")}</td><td class="num">${h.qty}</td><td class="num">${h.weight} ${h.unit}</td><td class="num">${h.purity}</td><td class="num">${U.num(Finance.fineOz(h), 4)}</td><td>${esc(h.location)}</td>
          <td class="num">${h.cost ? U.money(h.cost, h.costCur) : "–"}</td><td class="num">${v == null ? "–" : money(v)}</td><td class="num ${pl == null ? "" : pl >= 0 ? "ok" : "bad"}">${pl == null ? "–" : money(pl)}</td>
          <td>${h.qty > 0 ? `<button class="btn small" data-a="m-out" data-id="${h.id}">Take out</button><button class="btn small" data-a="m-move" data-id="${h.id}">Move</button>` : ""}</td></tr>`; }).join("") || `<tr><td colspan="12" class="muted">No holdings yet. Add your first bar or coin.</td></tr>`}</tbody></table></div>
      <h3>Movement log</h3><div class="tblwrap"><table class="tbl"><thead><tr><th>Date</th><th>Movement</th><th>Item</th><th class="num">Qty</th><th class="num">Fine oz</th><th>Location</th><th>Memo</th></tr></thead><tbody>${log.slice(0, 120).map(m => `<tr><td>${new Date(m.ts).toLocaleString()}</td><td><span class="tag">${m.type}</span></td><td>${esc(m.desc)}</td><td class="num">${m.qty}</td><td class="num">${U.num(m.fineOz, 4)}</td><td>${esc(m.location || "")}</td><td>${esc(m.memo || "")}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">No movements.</td></tr>`}</tbody></table></div>`;
  }

  // ---------------- wallet ----------------
  function walletTab() {
    const list = Finance.wallet(), c = Finance.prices().crypto || {};
    const newest = Math.max(0, ...Object.values(c).map(x => x.ts || 0));
    const live = newest && Date.now() - newest < 150000;
    return `<div class="row between"><div class="row"><button class="btn primary" data-a="w-add">+ Add holding</button><button class="btn" data-a="refresh">${refreshing ? "Refreshing…" : "Refresh prices"}</button>
      <label class="check"><input type="checkbox" id="autoPrices" ${Core.settings().autoPrices !== false ? "checked" : ""}> Auto-refresh every 60 s</label></div><span class="muted small"><span class="dot ${live ? "run" : "off"}"></span> ${newest ? "prices " + U.ago(newest) : "no prices yet"}</span></div>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>Holding</th><th>Symbol</th><th class="num">Quantity</th><th class="num">Price (USD)</th><th class="num">Value</th><th>Address</th><th></th></tr></thead><tbody>${list.map(w => { const p = Finance.cryptoPrice(w.cgId), v = Finance.walletValue(w);
        return `<tr><td><b>${esc(w.label || w.symbol)}</b></td><td>${esc(w.symbol)}</td><td class="num">${w.qty}</td><td class="num">${p ? U.money(p, "USD") : "–"}</td><td class="num">${v == null ? "–" : money(v)}</td><td class="small">${esc(U.trim(w.address || "", 18))}</td>
          <td><button class="btn small" data-a="w-edit" data-id="${w.id}">Edit</button>${w.cgId === "bitcoin" && w.address ? `<button class="btn small" data-a="w-sync" data-id="${w.id}">Sync balance</button>` : ""}<button class="btn small danger" data-a="w-del" data-id="${w.id}">✕</button></td></tr>`; }).join("") || `<tr><td colspan="7" class="muted">No wallet holdings. Add one (use the CoinGecko id, for example bitcoin or ethereum).</td></tr>`}</tbody></table></div>
      <p class="muted small">Prices come from CoinGecko (read-only). Quantities are entered by you; for Bitcoin you can add a public address and sync its balance from the chain. The app never holds private keys.</p>`;
  }

  // ---------------- payments ----------------
  function payments() {
    const list = Finance.payments();
    return `<div class="row between"><button class="btn primary" data-a="p-add">+ New payment</button><span class="muted small">Prepare → approve → complete. Completing posts the ledger entry.</span></div>
      <div class="tblwrap"><table class="tbl"><thead><tr><th>Date</th><th>Payee</th><th class="num">Amount</th><th>From</th><th>Method</th><th>Status</th><th>Reference</th><th></th></tr></thead><tbody>${list.map(p => `<tr><td>${new Date(p.ts).toLocaleDateString()}</td><td><b>${esc(p.payee)}</b></td><td class="num">${U.money(p.amount, p.currency)}</td><td>${esc((Finance.account(p.accountId) || {}).name || "?")}</td><td>${esc(p.method)}</td><td><span class="tag ${p.status === "failed" ? "bad" : ""}">${p.status}</span></td><td>${esc(p.reference)}</td>
        <td>${["pending", "draft", "submitted"].includes(p.status) ? `${p.apiId ? `<button class="btn small" data-a="p-submit" data-id="${p.id}">Submit via API</button>` : ""}<button class="btn small primary" data-a="p-done" data-id="${p.id}">Mark completed</button><button class="btn small" data-a="p-fail" data-id="${p.id}">Failed</button><button class="btn small" data-a="p-cancel" data-id="${p.id}">Cancel</button>` : ""}
        ${p.response ? `<details><summary class="muted small">API response</summary><pre>${esc(p.response)}</pre></details>` : ""}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">No payments yet.</td></tr>`}</tbody></table></div>`;
  }

  // ---------------- API hub ----------------
  function apisTab() {
    const list = Finance.apis();
    return `<div class="row between"><button class="btn primary" data-a="api-add">+ Connection</button><span class="muted small">Connect any REST API (bank, exchange, payment provider, data feed).</span></div>
      <div class="alert warn">Requests are sent from this device. Many bank and payment APIs refuse direct browser calls (CORS); those need your own server in between. Keys are stored on this device.</div>
      ${list.map(a => `<div class="card"><div class="row between"><strong>${esc(a.name)}</strong><span class="tag">${a.auth}</span></div><div class="muted small">${esc(a.baseUrl)}</div>${a.notes ? `<div class="muted small">${esc(a.notes)}</div>` : ""}
        <div class="row"><button class="btn small primary" data-a="api-send" data-id="${a.id}">Send request</button><button class="btn small" data-a="api-edit" data-id="${a.id}">Edit</button><button class="btn small danger" data-a="api-del" data-id="${a.id}">Delete</button></div></div>`).join("") || `<p class="muted">No connections yet.</p>`}
      <pre id="apiOut" class="apiout" hidden></pre>`;
  }

  // ---------------- terminal ----------------
  function terminalTab() {
    return `<div class="term" id="termOut"></div><form id="termForm" class="composer"><span class="prompt">vault&gt;</span><input id="termIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="type help"><button class="btn primary" type="submit">Run</button></form>`;
  }
  function termPrint(text, cls) { const o = $("#termOut"); if (!o) return; const d = document.createElement("div"); if (cls) d.className = cls; d.textContent = text; o.appendChild(d); o.scrollTop = o.scrollHeight; }
  async function termRun(line) {
    termPrint("vault> " + line, "cmd");
    V.term.hist.push(line); V.term.i = V.term.hist.length;
    if (line.trim().toLowerCase() === "clear") { $("#termOut").innerHTML = ""; return; }
    const out = await Finance.terminal(line); if (out) termPrint(out);
  }

  // ---------------- render ----------------
  function render() {
    if (!root) return;
    const body = { overview, cash, metals, wallet: walletTab, payments, apis: apisTab, terminal: terminalTab }[V.tab]();
    $("#vaultBody", root).innerHTML = body;
    $$tabs();
    if (V.tab === "terminal") {
      if (!V.term.out.length) { V.term.out = [1]; termPrint("Vault terminal — type help for commands."); }
      $("#termIn").focus();
    }
  }
  function $$tabs() { U.$$(".tab", root).forEach(b => b.classList.toggle("active", b.dataset.tab === V.tab)); }

  async function doRefresh() {
    if (refreshing) return; refreshing = true; render();
    const errs = await Finance.refreshAll(); refreshing = false; render();
    U.toast(errs.length ? "Refreshed with problems: " + errs.join("; ") : "Prices refreshed.", errs.length ? 7000 : 3000);
  }

  // ---------------- actions ----------------
  async function entryForm(kind, accId) {
    const accs = accOpts();
    if (!accs.length) return U.toast("Add an account first.");
    const fields = kind === "transfer"
      ? [{ key: "accountId", label: "From", type: "select", options: accs }, { key: "toAccountId", label: "To", type: "select", options: accs }, { key: "amount", label: "Amount sent", type: "number", step: "any", required: true }, { key: "toAmount", label: "Amount received (only if currencies differ)", type: "number", step: "any" }, { key: "memo", label: "Memo" }, { key: "ref", label: "Reference" }]
      : [{ key: "accountId", label: "Account", type: "select", options: accs }, { key: "amount", label: kind === "adjust" ? "Amount (negative to reduce)" : "Amount", type: "number", step: "any", required: true }, ...(kind === "withdraw" ? [{ key: "fee", label: "Fee", type: "number", step: "any" }] : []), { key: "memo", label: "Memo" }, { key: "ref", label: "Reference" }, ...(kind === "withdraw" ? [{ key: "pending", label: "Mark as pending (not yet settled)", type: "checkbox" }] : [])];
    const v = await U.form({ deposit: "Deposit", withdraw: "Withdraw", transfer: "Transfer", adjust: "Adjustment" }[kind], fields, { accountId: accId || (accs[0] || {}).value });
    if (!v) return;
    const type = kind === "withdraw" ? "withdrawal" : kind === "adjust" ? "adjustment" : kind;
    if ((type === "withdrawal" || type === "transfer") && Finance.wouldOverdraw(v.accountId, v.amount + (v.fee || 0)) && !confirm("This will make the balance negative. Continue anyway?")) return;
    Finance.post({ type, accountId: v.accountId, toAccountId: v.toAccountId, amount: v.amount, toAmount: v.toAmount, fee: v.fee, memo: v.memo, ref: v.ref, status: v.pending ? "pending" : "completed" });
  }

  async function accountForm(id) {
    const a = id ? Finance.account(id) : null;
    const v = await U.form(a ? "Edit account" : "New account", [{ key: "name", label: "Name", required: true }, { key: "type", label: "Type", type: "select", options: ["cash", "bank", "other"] }, { key: "currency", label: "Currency (ISO code)", required: true, list: ["USD", "EUR", "GBP", "AED", "PKR", "SAR", "CHF", "JPY"] }, { key: "location", label: "Location / institution" }, { key: "notes", label: "Notes", type: "textarea", rows: 2 }, ...(a ? [{ key: "archived", label: "Archived (hide from lists and totals)", type: "checkbox" }] : [])], a || { type: "cash", currency: base() });
    if (!v) return;
    if (a) { if (v.currency.toUpperCase() !== a.currency && Finance.ledger().some(e => e.accountId === a.id || e.toAccountId === a.id)) { U.toast("The currency of an account with entries cannot change."); v.currency = a.currency; } Finance.updateAccount(id, { ...v, currency: v.currency.toUpperCase() }); }
    else Finance.addAccount(v);
  }

  async function ratesForm() {
    const c = Finance.cfg(), p = Finance.prices();
    const v = await U.form("Rates & prices", [
      { key: "base", label: "Base currency", required: true, value: c.base },
      { key: "xau", label: "Manual gold price per troy oz in USD (blank = use live)", type: "number", step: "any", value: (p.manual || {}).XAU || "" },
      { key: "xag", label: "Manual silver price per troy oz in USD (blank = use live)", type: "number", step: "any", value: (p.manual || {}).XAG || "" },
      { key: "fx", label: "Manual FX rates: value of 1 unit in base currency", type: "textarea", rows: 3, placeholder: "EUR=1.08, PKR=0.0036", value: Object.entries(c.fx).filter(([k]) => (c.fxManual || []).includes(k)).map(([k, x]) => `${k}=${x}`).join(", ") },
      { key: "url", label: "Metals price URL ({symbol} = XAU or XAG)", value: c.metalsUrl }, { key: "path", label: "Price field in the JSON response", value: c.metalsPath }
    ], {}, { intro: "Live prices: metals from the URL below, crypto from CoinGecko, FX from Frankfurter. Manual values always win." });
    if (!v) return;
    const fx = { ...c.fx }, manual = [];
    (v.fx || "").split(/[,\n]/).map(s => s.trim()).filter(Boolean).forEach(pair => { const [k, x] = pair.split("="); const n = parseFloat(x); if (k && n > 0) { fx[k.trim().toUpperCase()] = n; manual.push(k.trim().toUpperCase()); } });
    const newBase = v.base.toUpperCase();
    fx[newBase] = 1;
    Finance.saveCfg({ ...c, base: newBase, fx, fxManual: manual, metalsUrl: v.url || c.metalsUrl, metalsPath: v.path || c.metalsPath });
    Finance.setManualSpot("XAU", v.xau); Finance.setManualSpot("XAG", v.xag);
  }

  async function metalForm() {
    const v = await U.form("Add bar / coin to the vault", [
      { key: "metal", label: "Metal", type: "select", options: ["gold", "silver"] }, { key: "form", label: "Form", type: "select", options: ["bar", "coin", "other"] }, { key: "desc", label: "Description", placeholder: "e.g. PAMP Fortuna" },
      { key: "weight", label: "Weight of one piece", type: "number", step: "any", required: true }, { key: "unit", label: "Unit", type: "select", options: [{ value: "g", label: "grams" }, { value: "oz", label: "troy ounces" }, { value: "kg", label: "kilograms" }] },
      { key: "purity", label: "Purity (0.999 = 99.9%)", type: "number", step: "any", required: true }, { key: "qty", label: "Quantity (pieces)", type: "number", step: "any", required: true },
      { key: "serial", label: "Serial number(s)" }, { key: "location", label: "Location", required: true }, { key: "acquired", label: "Acquired on", type: "date" },
      { key: "cost", label: `Total cost (${base()})`, type: "number", step: "any" }, { key: "notes", label: "Notes" }
    ], { metal: "gold", unit: "g", purity: 0.999, qty: 1, location: "Main vault" });
    if (!v) return;
    Finance.addMetal({ ...v, cost: v.cost || 0, costCur: base() });
  }

  async function walletForm(id) {
    const w = id ? Finance.wallet().find(x => x.id === id) : null;
    const v = await U.form(w ? "Edit holding" : "Add wallet holding", [{ key: "label", label: "Label", placeholder: "Cold wallet" }, { key: "symbol", label: "Symbol", required: true, placeholder: "BTC" }, { key: "cgId", label: "CoinGecko id", required: true, placeholder: "bitcoin" }, { key: "qty", label: "Quantity", type: "number", step: "any", required: true }, { key: "address", label: "Public address (optional)" }], w || { cgId: "bitcoin", symbol: "BTC" });
    if (!v) return;
    v.symbol = v.symbol.toUpperCase(); v.cgId = v.cgId.toLowerCase();
    Finance.saveWallet(w ? Finance.wallet().map(x => x.id === id ? { ...x, ...v } : x) : [...Finance.wallet(), { id: U.uid(), ...v }]);
    if (Core.online()) Finance.fetchCrypto().then(() => render());
  }

  async function paymentForm() {
    const accs = accOpts(); if (!accs.length) return U.toast("Add an account first.");
    const apis = Finance.apis();
    const v = await U.form("New payment", [{ key: "payee", label: "Payee", required: true }, { key: "accountId", label: "Pay from", type: "select", options: accs }, { key: "amount", label: "Amount", type: "number", step: "any", required: true },
      { key: "method", label: "Method", type: "select", options: ["bank", "card", "crypto", "cash", "other"] }, { key: "reference", label: "Reference" }, { key: "memo", label: "Memo" },
      { key: "apiId", label: "Submit through API connection (optional)", type: "select", options: [{ value: "", label: "None (manual payment)" }, ...apis.map(a => ({ value: a.id, label: a.name }))] },
      { key: "apiPath", label: "API path (e.g. /v1/payments)" }, { key: "bodyTemplate", label: "API request body (JSON template)", type: "textarea", rows: 4, placeholder: '{"amount": {{amount}}, "currency": "{{currency}}", "payee": "{{payee}}", "reference": "{{reference}}"}', hint: "Placeholders: amount, currency, payee, reference, memo, id" }]);
    if (!v) return;
    Finance.createPayment(v);
  }

  async function apiForm(id) {
    const a = id ? Finance.apis().find(x => x.id === id) : null;
    const v = await U.form(a ? "Edit connection" : "New API connection", [{ key: "name", label: "Name", required: true }, { key: "baseUrl", label: "Base URL", required: true, placeholder: "https://api.example.com" },
      { key: "auth", label: "Authentication", type: "select", options: [{ value: "bearer", label: "Bearer token" }, { value: "header", label: "Custom header" }, { value: "query", label: "Query parameter" }, { value: "none", label: "None" }] },
      { key: "headerName", label: "Header name (custom header)", placeholder: "X-API-Key" }, { key: "queryName", label: "Parameter name (query)", placeholder: "key" }, { key: "key", label: "API key / token", type: "password" }, { key: "notes", label: "Notes", type: "textarea", rows: 2 }], a || { auth: "bearer" });
    if (!v) return;
    Finance.saveApis(a ? Finance.apis().map(x => x.id === id ? { ...x, ...v } : x) : [...Finance.apis(), { id: U.uid(), ...v }]);
    Core.Audit.log("api", `${a ? "Updated" : "Added"} connection ${v.name}`);
  }

  async function apiSend(id) {
    const a = Finance.apis().find(x => x.id === id);
    const v = await U.form(`Request: ${a.name}`, [{ key: "method", label: "Method", type: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"] }, { key: "path", label: "Path", placeholder: "/v1/balance" }, { key: "body", label: "Body (JSON)", type: "textarea", rows: 4 }], { method: "GET" }, { submit: "Send" });
    if (!v) return;
    if (v.method !== "GET" && !confirm(`Send a real ${v.method} request to ${a.baseUrl}?`)) return;
    const out = $("#apiOut"); out.hidden = false; out.textContent = "Sending…";
    const r = await Finance.apiRequest(a, v);
    out.textContent = `HTTP ${r.status || "–"} · ${r.ms} ms\n\n${r.text}`;
  }

  function csvDownload(name, rows) { U.download(name, U.csv(rows), "text/csv"); }

  async function onClick(e) {
    const t = e.target.closest("[data-tab]"); if (t) { V.tab = t.dataset.tab; render(); return; }
    const b = e.target.closest("[data-a]"); if (!b) return;
    const id = b.dataset.id;
    try {
      switch (b.dataset.a) {
        case "refresh": await doRefresh(); return;
        case "rates": await ratesForm(); break;
        case "deposit": case "withdraw": case "transfer": case "adjust": await entryForm(b.dataset.a); break;
        case "acc-add": await accountForm(); break;
        case "acc-edit": await accountForm(id); break;
        case "reverse": if (confirm("Post a reversing entry for this transaction?")) Finance.reverse(id); break;
        case "csv-ledger": csvDownload("ledger.csv", [["date", "account", "type", "amount", "currency", "status", "memo", "reference"], ...Finance.ledger().map(x => [new Date(x.ts).toISOString(), (Finance.account(x.accountId) || {}).name, x.type, x.amount, x.currency, x.status, x.memo, x.ref])]); break;
        case "m-add": await metalForm(); break;
        case "m-out": { const h = Finance.metals().find(x => x.id === id); const v = await U.form("Take out of the vault", [{ key: "qty", label: `Quantity (max ${h.qty})`, type: "number", step: "any", required: true }, { key: "memo", label: "Reason / destination" }], { qty: h.qty }); if (v) Finance.removeMetal(id, v.qty, v.memo); break; }
        case "m-move": { const v = await U.form("Move to another location", [{ key: "location", label: "New location", required: true }, { key: "memo", label: "Memo" }]); if (v) Finance.moveMetal(id, v.location, v.memo); break; }
        case "m-csv": csvDownload("metals.csv", [["metal", "form", "description", "serial", "qty", "weight", "unit", "purity", "fine_oz", "location", "cost"], ...Finance.metals().map(h => [h.metal, h.form, h.desc, h.serial, h.qty, h.weight, h.unit, h.purity, Finance.fineOz(h), h.location, h.cost])]); break;
        case "w-add": await walletForm(); break;
        case "w-edit": await walletForm(id); break;
        case "w-del": if (confirm("Remove this holding?")) Finance.saveWallet(Finance.wallet().filter(x => x.id !== id)); break;
        case "w-sync": { const w = Finance.wallet().find(x => x.id === id); U.toast("Reading the chain…"); const q = await Finance.syncBtc(w); Finance.saveWallet(Finance.wallet().map(x => x.id === id ? { ...x, qty: q } : x)); U.toast(`Balance synced: ${q} BTC`); break; }
        case "p-add": await paymentForm(); break;
        case "p-done": if (confirm("Mark as completed and post it to the ledger?")) Finance.completePayment(id); break;
        case "p-fail": Finance.setPayment(id, { status: "failed" }); break;
        case "p-cancel": Finance.setPayment(id, { status: "cancelled" }); break;
        case "p-submit": { const p = Finance.payments().find(x => x.id === id); if (!confirm(`Send this payment request (${U.money(p.amount, p.currency)} to ${p.payee}) to the API now? This may move real money.`)) return; const r = await Finance.submitPayment(id); U.toast(r.ok ? "Submitted. Mark completed once the provider confirms." : "Provider rejected or unreachable. See the response.", 6000); break; }
        case "api-add": await apiForm(); break;
        case "api-edit": await apiForm(id); break;
        case "api-del": if (confirm("Delete this connection?")) Finance.saveApis(Finance.apis().filter(x => x.id !== id)); break;
        case "api-send": await apiSend(id); return;
      }
    } catch (err) { U.toast("⚠ " + err.message, 6000); }
    render();
  }

  App.register({
    id: "vault", title: "Vault Terminal", short: "Vault", icon: "🏛️",
    mount(el) {
      root = el;
      el.innerHTML = `<div class="row between"><div><h2>Vault Terminal</h2><div class="muted small">Personal AI financial platform · cash vault · gold & silver vault · live wallet · payments · APIs</div></div><button class="btn small" data-go="teams">Finance teams</button></div>
        <div class="tabs">${TABS.map(([k, l]) => `<button class="tab" data-tab="${k}">${l}</button>`).join("")}</div><div id="vaultBody" class="stack"></div>`;
      el.addEventListener("click", onClick);
      el.addEventListener("change", e => {
        if (e.target.id === "fAcc") { V.acc = e.target.value; render(); } else if (e.target.id === "fType") { V.type = e.target.value; render(); }
        else if (e.target.id === "autoPrices") { Core.settings().autoPrices = e.target.checked; Core.saveSettings(); }
      });
      el.addEventListener("input", e => { if (e.target.id === "fQ") { V.q = e.target.value.toLowerCase(); $("#ledgerBody").innerHTML = ledgerRows() || `<tr><td colspan="7" class="muted">No entries.</td></tr>`; } });
      el.addEventListener("submit", async e => {
        if (e.target.id !== "termForm") return; e.preventDefault();
        const i = $("#termIn"), line = i.value; i.value = ""; if (line.trim()) await termRun(line);
      });
      el.addEventListener("keydown", e => {
        if (e.target.id !== "termIn") return;
        if (e.key === "ArrowUp") { V.term.i = Math.max(0, V.term.i - 1); e.target.value = V.term.hist[V.term.i] || ""; e.preventDefault(); }
        else if (e.key === "ArrowDown") { V.term.i = Math.min(V.term.hist.length, V.term.i + 1); e.target.value = V.term.hist[V.term.i] || ""; e.preventDefault(); }
      });
      Core.on(t => { if (t === "finance" && App.current() === "vault" && V.tab !== "terminal" && !document.querySelector("dialog[open]")) render(); });
      setInterval(() => { if (App.current() === "vault" && V.tab === "wallet" && Core.settings().autoPrices !== false && Core.online() && !document.hidden) Finance.fetchCrypto().then(() => { if (V.tab === "wallet") render(); }); }, 60000);
    },
    show(el, p) { if (p && p.tab) V.tab = p.tab; render(); }
  });
})();
