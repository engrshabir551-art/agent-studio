// Finance data layer: accounts + immutable ledger (cash vault), metals vault, live wallet, payments, API hub, prices and terminal.
// It records and reconciles. Real money only moves through provider APIs the owner connects and approves.
window.Finance = (() => {
  "use strict";
  const K = { cfg: "fin.cfg", accounts: "fin.accounts", ledger: "fin.ledger", metals: "fin.metals", mlog: "fin.mlog", wallet: "fin.wallet", prices: "fin.prices", payments: "fin.payments", apis: "fin.apis" };
  const G_PER_OZT = 31.1034768;
  const DEFAULT_CFG = { base: "USD", fx: { USD: 1 }, metalsUrl: "https://api.gold-api.com/price/{symbol}", metalsPath: "price" };
  const SYM = { gold: "XAU", silver: "XAG" };
  const cfg = () => ({ ...DEFAULT_CFG, ...Store.get(K.cfg, {}), fx: { ...DEFAULT_CFG.fx, ...((Store.get(K.cfg, {}) || {}).fx || {}) } });
  const saveCfg = c => Store.set(K.cfg, c);
  const log = (t, d) => Core.Audit.log(t, d);

  function ensureSeed() {
    if (!Store.get(K.accounts)) Store.set(K.accounts, [
      { id: "acc-cash-usd", name: "Cash Vault USD", type: "cash", currency: "USD", location: "Main vault", notes: "" },
      { id: "acc-bank-usd", name: "Bank USD", type: "bank", currency: "USD", location: "", notes: "" }
    ]);
  }

  // ---------- accounts & ledger ----------
  const accounts = () => Store.get(K.accounts, []);
  const code = a => U.slug(a.name);
  const account = id => accounts().find(a => a.id === id);
  function findAccount(tok) {
    tok = U.slug(tok); if (!tok) return null;
    const a = accounts().filter(x => !x.archived);
    return a.find(x => x.id === tok || code(x) === tok) || a.find(x => code(x).startsWith(tok)) || a.find(x => code(x).includes(tok)) || null;
  }
  function addAccount(a) { const acc = { id: U.uid(), type: "cash", currency: "USD", location: "", notes: "", ...a, currency: String(a.currency || "USD").toUpperCase() }; Store.set(K.accounts, [...accounts(), acc]); log("account", `Created ${acc.name} (${acc.currency})`); return acc; }
  function updateAccount(id, patch) { Store.set(K.accounts, accounts().map(a => a.id === id ? { ...a, ...patch } : a)); }

  const ledger = () => Store.get(K.ledger, []);
  function delta(e, accId) {
    let d = 0;
    if (e.accountId === accId) {
      if (e.type === "deposit" || e.type === "adjustment") d += e.amount;
      else d -= e.amount;
      if (e.fee) d -= e.fee;
    }
    if (e.type === "transfer" && e.toAccountId === accId) d += (e.toAmount ?? e.amount);
    return d;
  }
  const balance = id => ledger().reduce((s, e) => (e.status === "completed" ? s + delta(e, id) : s), 0);
  const pendingOut = id => ledger().reduce((s, e) => (e.status === "pending" && e.accountId === id && e.type !== "deposit" ? s + e.amount : s), 0);

  function post(entry) {
    const a = account(entry.accountId);
    if (!a) throw new Error("Choose an account.");
    const amount = Number(entry.amount);
    if (!isFinite(amount) || amount === 0 || (entry.type !== "adjustment" && amount < 0)) throw new Error("Enter a valid amount.");
    if (entry.type === "transfer") {
      const b = account(entry.toAccountId);
      if (!b) throw new Error("Choose a destination account.");
      if (b.id === a.id) throw new Error("Source and destination must differ.");
      if (b.currency !== a.currency && !(Number(entry.toAmount) > 0)) throw new Error(`Enter the amount received in ${b.currency}.`);
    }
    const e = { id: U.uid(), ts: entry.ts || Date.now(), type: entry.type, accountId: a.id, toAccountId: entry.toAccountId || null, amount, toAmount: entry.toAmount != null ? Number(entry.toAmount) : null,
      fee: entry.fee ? Number(entry.fee) : 0, currency: a.currency, memo: entry.memo || "", ref: entry.ref || "", status: entry.status || "completed", paymentId: entry.paymentId || null, reverses: entry.reverses || null };
    Store.set(K.ledger, [e, ...ledger()]);
    log("ledger", `${e.type} ${amount} ${a.currency} ${a.name}${e.memo ? " – " + e.memo : ""}`);
    Core.emit("finance");
    return e;
  }
  function wouldOverdraw(accId, out) { return balance(accId) - out < 0; }
  function reverse(id) {
    const e = ledger().find(x => x.id === id);
    if (!e) throw new Error("Entry not found.");
    if (ledger().some(x => x.reverses === id)) throw new Error("Already reversed.");
    if (e.status !== "completed") throw new Error("Only completed entries can be reversed.");
    if (e.type === "transfer") return post({ type: "transfer", accountId: e.toAccountId, toAccountId: e.accountId, amount: e.toAmount ?? e.amount, toAmount: e.amount, memo: "Reversal: " + (e.memo || ""), reverses: id });
    const sign = e.type === "deposit" || e.type === "adjustment" ? -1 : 1;
    return post({ type: "adjustment", accountId: e.accountId, amount: sign * (e.amount + (e.type === "deposit" || e.type === "adjustment" ? 0 : (e.fee || 0))), memo: "Reversal: " + (e.memo || e.type), reverses: id });
  }

  // ---------- prices & FX ----------
  const prices = () => Store.get(K.prices, { metals: {}, crypto: {}, manual: {} });
  function setManualSpot(sym, v) { const p = prices(); p.manual = p.manual || {}; p.manual[sym] = v > 0 ? v : null; Store.set(K.prices, p); }
  function spot(sym) {
    const p = prices();
    const m = (p.manual || {})[sym]; if (m > 0) return { price: m, src: "manual", ts: null };
    const l = (p.metals || {})[sym]; return l ? { price: l.price, src: "live", ts: l.ts } : null;
  }
  const cryptoPrice = id => { const c = (prices().crypto || {})[id]; return c ? c.usd : null; };
  const getPath = (o, path) => String(path || "").split(".").filter(Boolean).reduce((x, k) => (x == null ? x : x[k]), o);

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }
  async function fetchMetals() {
    const c = cfg(), p = prices(); p.metals = p.metals || {}; const errs = [];
    for (const sym of ["XAU", "XAG"]) {
      try {
        const j = await fetchJson(c.metalsUrl.replace("{symbol}", sym));
        const v = Number(getPath(j, c.metalsPath));
        if (!(v > 0)) throw new Error(`no number at "${c.metalsPath}"`);
        p.metals[sym] = { price: v, ts: Date.now() };
      } catch (e) { errs.push(`${sym}: ${e.message}`); }
    }
    Store.set(K.prices, p);
    return errs;
  }
  async function fetchCrypto() {
    const ids = [...new Set(wallet().map(w => w.cgId).filter(Boolean))];
    if (!ids.length) return [];
    const p = prices(); p.crypto = p.crypto || {};
    try {
      const j = await fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd`);
      for (const id of ids) if (j[id] && j[id].usd > 0) p.crypto[id] = { usd: j[id].usd, ts: Date.now() };
      Store.set(K.prices, p); return [];
    } catch (e) { return ["Crypto: " + e.message]; }
  }
  async function fetchFx() {
    const c = cfg();
    try {
      const j = await fetchJson(`https://api.frankfurter.app/latest?from=${encodeURIComponent(c.base)}`);
      const fx = { ...c.fx, [c.base]: 1 };
      for (const [cur, r] of Object.entries(j.rates || {})) if (r > 0 && !(c.fxManual || []).includes(cur)) fx[cur] = 1 / r;
      saveCfg({ ...c, fx, fxTs: Date.now() }); return [];
    } catch (e) { return ["FX: " + e.message]; }
  }
  async function refreshAll() {
    if (!Core.online()) return ["You are offline – using the last saved prices."];
    const r = await Promise.all([fetchMetals(), fetchCrypto(), fetchFx()]);
    Core.emit("finance");
    return r.flat();
  }

  // ---------- metals vault ----------
  const metals = () => Store.get(K.metals, []);
  const mlog = () => Store.get(K.mlog, []);
  const activeMetals = () => metals().filter(h => h.qty > 0);
  function pieceGrams(h) { return h.unit === "g" ? h.weight : h.unit === "kg" ? h.weight * 1000 : h.weight * G_PER_OZT; }
  const fineOz = h => (pieceGrams(h) / G_PER_OZT) * (h.purity || 1) * (h.qty || 0);
  const grossGrams = h => pieceGrams(h) * (h.qty || 0);
  const usdRate = () => { const c = cfg(); return c.base === "USD" ? 1 : (c.fx.USD > 0 ? c.fx.USD : 0); };
  function metalValue(h) { const sp = spot(SYM[h.metal]); const r = usdRate(); return sp && r ? fineOz(h) * sp.price * r : null; }
  function mlogPush(e) { Store.set(K.mlog, [{ id: U.uid(), ts: Date.now(), ...e }, ...mlog()].slice(0, 2000)); }
  function addMetal(h) {
    const item = { id: U.uid(), metal: "gold", form: "bar", desc: "", weight: 0, unit: "g", purity: 0.999, qty: 1, serial: "", location: "Main vault", acquired: "", cost: 0, costCur: cfg().base, notes: "", ...h };
    if (!(item.weight > 0) || !(item.qty > 0)) throw new Error("Weight and quantity must be greater than zero.");
    if (!(item.purity > 0 && item.purity <= 1)) throw new Error("Purity must be between 0 and 1 (for example 0.999).");
    Store.set(K.metals, [item, ...metals()]);
    mlogPush({ type: "in", holdingId: item.id, desc: describeMetal(item), qty: item.qty, fineOz: fineOz(item), location: item.location, memo: h.memo || "" });
    log("metals", `IN ${describeMetal(item)} ×${item.qty}`);
    Core.emit("finance"); return item;
  }
  const describeMetal = h => `${h.metal} ${h.form}${h.desc ? " " + h.desc : ""} ${h.weight}${h.unit} @${h.purity}${h.serial ? " #" + h.serial : ""}`;
  function removeMetal(id, qty, memo) {
    const h = metals().find(x => x.id === id);
    if (!h) throw new Error("Holding not found.");
    qty = Number(qty);
    if (!(qty > 0) || qty > h.qty) throw new Error(`Quantity must be between 0 and ${h.qty}.`);
    const out = { ...h, qty };
    Store.set(K.metals, metals().map(x => x.id === id ? { ...x, qty: x.qty - qty } : x));
    mlogPush({ type: "out", holdingId: id, desc: describeMetal(h), qty, fineOz: fineOz(out), location: h.location, memo: memo || "" });
    log("metals", `OUT ${describeMetal(h)} ×${qty}`);
    Core.emit("finance");
  }
  function moveMetal(id, location, memo) {
    const h = metals().find(x => x.id === id);
    if (!h) throw new Error("Holding not found.");
    Store.set(K.metals, metals().map(x => x.id === id ? { ...x, location } : x));
    mlogPush({ type: "move", holdingId: id, desc: describeMetal(h), qty: h.qty, fineOz: fineOz(h), location, memo: `from ${h.location} ${memo || ""}`.trim() });
    log("metals", `MOVE ${describeMetal(h)} → ${location}`);
    Core.emit("finance");
  }
  const metalTotals = () => {
    const t = { XAU: { oz: 0, g: 0, value: 0, missing: false, pieces: 0 }, XAG: { oz: 0, g: 0, value: 0, missing: false, pieces: 0 } };
    for (const h of activeMetals()) {
      const s = t[SYM[h.metal]]; s.oz += fineOz(h); s.g += grossGrams(h); s.pieces += h.qty;
      const v = metalValue(h); if (v == null) s.missing = true; else s.value += v;
    }
    return t;
  };

  // ---------- wallet ----------
  const wallet = () => Store.get(K.wallet, []);
  const walletValue = w => { const p = cryptoPrice(w.cgId), r = usdRate(); return p && r ? w.qty * p * r : null; };
  function saveWallet(list) { Store.set(K.wallet, list); Core.emit("finance"); }
  async function syncBtc(w) {
    if (!w.address) throw new Error("Add the Bitcoin address first.");
    const j = await fetchJson("https://mempool.space/api/address/" + encodeURIComponent(w.address));
    const sats = (j.chain_stats.funded_txo_sum - j.chain_stats.spent_txo_sum) + ((j.mempool_stats || {}).funded_txo_sum || 0) - ((j.mempool_stats || {}).spent_txo_sum || 0);
    return sats / 1e8;
  }

  // ---------- net worth ----------
  function netWorth() {
    const c = cfg(), missing = new Set();
    const rate = cur => { if (cur === c.base) return 1; const r = c.fx[cur]; if (!(r > 0)) { missing.add(cur); return 0; } return r; };
    let cash = 0; const byCur = {};
    for (const a of accounts().filter(x => !x.archived)) { const b = balance(a.id); byCur[a.currency] = (byCur[a.currency] || 0) + b; cash += b * rate(a.currency); }
    const mt = metalTotals(); let metalsV = 0, metalMissing = false;
    for (const s of Object.values(mt)) { metalsV += s.value; if (s.missing) metalMissing = true; }
    let walletV = 0, walletMissing = false;
    for (const w of wallet()) { const v = walletValue(w); if (v == null) { if (w.qty > 0) walletMissing = true; } else walletV += v; }
    if (c.base !== "USD" && !(c.fx.USD > 0)) missing.add("USD");
    return { base: c.base, cash, byCur, metals: metalsV, wallet: walletV, total: cash + metalsV + walletV, gold: mt.XAU, silver: mt.XAG, missing: [...missing], metalMissing, walletMissing };
  }
  function snapshotText() {
    const nw = netWorth(), c = cfg(), m = x => U.money(x, c.base);
    const lines = [`Net worth ≈ ${m(nw.total)} (cash ${m(nw.cash)}, metals ${m(nw.metals)}, wallet ${m(nw.wallet)}); base currency ${c.base}.`];
    for (const a of accounts().filter(x => !x.archived)) lines.push(`Account ${a.name}: ${U.money(balance(a.id), a.currency)}${pendingOut(a.id) ? ` (pending out ${U.money(pendingOut(a.id), a.currency)})` : ""}`);
    lines.push(`Gold: ${U.num(nw.gold.oz, 3)} fine oz in ${nw.gold.pieces} pcs ≈ ${m(nw.gold.value)}${nw.gold.missing ? " (no price)" : ""}. Silver: ${U.num(nw.silver.oz, 3)} fine oz in ${nw.silver.pieces} pcs ≈ ${m(nw.silver.value)}${nw.silver.missing ? " (no price)" : ""}.`);
    for (const w of wallet()) lines.push(`Wallet ${w.label || w.symbol}: ${w.qty} ${w.symbol}${walletValue(w) != null ? " ≈ " + m(walletValue(w)) : " (no price)"}`);
    const pp = payments().filter(p => ["draft", "pending", "submitted"].includes(p.status));
    if (pp.length) lines.push(`Open payments: ${pp.length} totalling ${pp.map(p => U.money(p.amount, p.currency)).join(", ")}`);
    if (nw.missing.length) lines.push(`Missing FX rates for: ${nw.missing.join(", ")}`);
    return lines.join("\n").slice(0, 2500);
  }

  // ---------- payments & API hub ----------
  const payments = () => Store.get(K.payments, []);
  const savePayments = l => { Store.set(K.payments, l); Core.emit("finance"); };
  function createPayment(p) {
    const a = account(p.accountId); if (!a) throw new Error("Choose the source account.");
    if (!(Number(p.amount) > 0)) throw new Error("Enter a valid amount.");
    if (!p.payee) throw new Error("Enter the payee.");
    const item = { id: U.uid(), ts: Date.now(), status: "pending", method: "bank", reference: "", memo: "", apiId: "", apiPath: "", bodyTemplate: "", response: "", ledgerId: null, ...p, amount: Number(p.amount), currency: a.currency };
    savePayments([item, ...payments()]); log("payment", `Created ${item.amount} ${item.currency} to ${item.payee}`); return item;
  }
  function setPayment(id, patch) { savePayments(payments().map(p => p.id === id ? { ...p, ...patch } : p)); }
  function completePayment(id) {
    const p = payments().find(x => x.id === id); if (!p) throw new Error("Payment not found.");
    if (p.status === "completed") throw new Error("Already completed.");
    const e = post({ type: "payment", accountId: p.accountId, amount: p.amount, memo: `Payment to ${p.payee}`, ref: p.reference, paymentId: p.id });
    setPayment(id, { status: "completed", ledgerId: e.id, completedAt: Date.now() }); log("payment", `Completed ${p.amount} ${p.currency} to ${p.payee}`);
  }
  const apis = () => Store.get(K.apis, []);
  const saveApis = l => { Store.set(K.apis, l); Core.emit("finance"); };
  async function apiRequest(conn, { method = "GET", path = "", body, headers = {} } = {}) {
    let url = (conn.baseUrl || "").replace(/\/+$/, "") + (path ? (path.startsWith("/") ? path : "/" + path) : "");
    const h = { ...headers };
    if (conn.auth === "bearer" && conn.key) h.Authorization = "Bearer " + conn.key;
    else if (conn.auth === "header" && conn.key) h[conn.headerName || "X-API-Key"] = conn.key;
    else if (conn.auth === "query" && conn.key) url += (url.includes("?") ? "&" : "?") + encodeURIComponent(conn.queryName || "key") + "=" + encodeURIComponent(conn.key);
    const hasBody = body && method !== "GET" && method !== "HEAD";
    if (hasBody && !h["Content-Type"]) h["Content-Type"] = "application/json";
    const t0 = Date.now();
    try {
      const res = await fetch(url, { method, headers: h, body: hasBody ? body : undefined });
      const text = await res.text();
      log("api", `${method} ${conn.name} ${path} → ${res.status}`);
      return { ok: res.ok, status: res.status, text: text.slice(0, 6000), ms: Date.now() - t0 };
    } catch (e) {
      log("api", `${method} ${conn.name} ${path} failed: ${e.message}`);
      return { ok: false, status: 0, ms: Date.now() - t0, text: `Network or CORS error: ${e.message}\nMany bank and payment APIs refuse direct browser calls. Use a provider that allows browser access, or call it through your own server.` };
    }
  }
  function fillTemplate(tpl, p) {
    const vals = { amount: p.amount, currency: p.currency, payee: p.payee, reference: p.reference || "", memo: p.memo || "", id: p.id };
    return String(tpl || "").replace(/\{\{(\w+)\}\}/g, (m, k) => k in vals ? (typeof vals[k] === "number" ? String(vals[k]) : JSON.stringify(String(vals[k])).slice(1, -1)) : m);
  }
  async function submitPayment(id) {
    const p = payments().find(x => x.id === id); if (!p) throw new Error("Payment not found.");
    const conn = apis().find(a => a.id === p.apiId); if (!conn) throw new Error("Choose an API connection on the payment.");
    const r = await apiRequest(conn, { method: "POST", path: p.apiPath, body: fillTemplate(p.bodyTemplate, p) });
    setPayment(id, { status: r.ok ? "submitted" : "failed", response: `${r.status} ${r.text}`.slice(0, 1500) });
    log("payment", `${r.ok ? "Submitted" : "FAILED"} via ${conn.name}: ${p.amount} ${p.currency} to ${p.payee} (HTTP ${r.status})`);
    return r;
  }

  // ---------- terminal ----------
  const TERM_HELP = [
    "Vault terminal commands:",
    "  net                         net worth summary", "  accounts                    list accounts and balances",
    "  balance <account>           one account", "  deposit <acct> <amount> [memo]", "  withdraw <acct> <amount> [memo]",
    "  transfer <from> <to> <amount> [memo]   (same-currency accounts)", "  gold | silver               metals vault summary",
    "  price                       spot prices", "  wallet                      live wallet", "  ledger [n]                  last n ledger entries",
    "  refresh                     fetch live prices", "  clear                       clear the screen"
  ].join("\n");
  async function terminal(line) {
    const parts = line.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    const cmd = parts[0].toLowerCase(), c = cfg(), m = x => U.money(x, c.base);
    const acctOr = t => { const a = findAccount(t); if (!a) throw new Error(`No account matches "${t}". Try: accounts`); return a; };
    try {
      switch (cmd) {
        case "help": case "?": return TERM_HELP;
        case "net": { const n = netWorth(); return `Net worth  ${m(n.total)}\n  cash     ${m(n.cash)}\n  metals   ${m(n.metals)}${n.metalMissing ? "  (price missing)" : ""}\n  wallet   ${m(n.wallet)}${n.walletMissing ? "  (price missing)" : ""}${n.missing.length ? "\n  missing FX: " + n.missing.join(", ") : ""}`; }
        case "accounts": return accounts().filter(a => !a.archived).map(a => `${code(a).padEnd(22)} ${a.name.padEnd(24)} ${U.money(balance(a.id), a.currency).padStart(16)}`).join("\n") || "No accounts.";
        case "balance": { const a = acctOr(parts[1]); return `${a.name}: ${U.money(balance(a.id), a.currency)}${pendingOut(a.id) ? `  (pending out ${U.money(pendingOut(a.id), a.currency)})` : ""}`; }
        case "deposit": case "withdraw": {
          const a = acctOr(parts[1]), amt = parseFloat(parts[2]);
          if (!(amt > 0)) return "Usage: " + cmd + " <account> <amount> [memo]";
          if (cmd === "withdraw" && wouldOverdraw(a.id, amt)) return `Refused: would make ${a.name} negative (balance ${U.money(balance(a.id), a.currency)}). Use the Cash tab to override.`;
          post({ type: cmd, accountId: a.id, amount: amt, memo: parts.slice(3).join(" ") });
          return `${cmd === "deposit" ? "Deposited" : "Withdrew"} ${U.money(amt, a.currency)}. New balance ${U.money(balance(a.id), a.currency)}`;
        }
        case "transfer": {
          const a = acctOr(parts[1]), b = acctOr(parts[2]), amt = parseFloat(parts[3]);
          if (!(amt > 0)) return "Usage: transfer <from> <to> <amount> [memo]";
          if (a.currency !== b.currency) return "Different currencies: use the Cash tab to enter the received amount.";
          if (wouldOverdraw(a.id, amt)) return `Refused: would make ${a.name} negative.`;
          post({ type: "transfer", accountId: a.id, toAccountId: b.id, amount: amt, memo: parts.slice(4).join(" ") });
          return `Transferred ${U.money(amt, a.currency)} ${a.name} → ${b.name}.`;
        }
        case "gold": case "silver": {
          const t = metalTotals()[SYM[cmd]], list = activeMetals().filter(h => h.metal === cmd);
          return `${cmd.toUpperCase()} vault: ${t.pieces} pcs, ${U.num(t.g, 2)} g gross, ${U.num(t.oz, 4)} fine oz ≈ ${m(t.value)}${t.missing ? " (price missing)" : ""}\n` + list.map(h => `  ${h.qty}× ${h.form} ${h.weight}${h.unit} @${h.purity} ${h.serial ? "#" + h.serial : ""} [${h.location}]`).join("\n");
        }
        case "price": { const g = spot("XAU"), s = spot("XAG"); return `Gold   ${g ? U.money(g.price, "USD") + "/oz (" + g.src + ")" : "no price"}\nSilver ${s ? U.money(s.price, "USD") + "/oz (" + s.src + ")" : "no price"}`; }
        case "wallet": return wallet().map(w => `${(w.label || w.symbol).padEnd(18)} ${String(w.qty).padStart(12)} ${w.symbol}  ${walletValue(w) != null ? m(walletValue(w)) : "no price"}`).join("\n") || "Wallet is empty.";
        case "ledger": { const n = Math.min(50, parseInt(parts[1], 10) || 10); return ledger().slice(0, n).map(e => `${new Date(e.ts).toISOString().slice(0, 16).replace("T", " ")}  ${e.type.padEnd(10)} ${U.money(e.amount, e.currency).padStart(14)}  ${(account(e.accountId) || {}).name || "?"}  ${e.memo}`).join("\n") || "Ledger is empty."; }
        case "refresh": { const errs = await refreshAll(); return errs.length ? "Refreshed with problems:\n  " + errs.join("\n  ") : "Prices refreshed."; }
        default: return `Unknown command "${cmd}". Type help.`;
      }
    } catch (e) { return "Error: " + e.message; }
  }

  return {
    K, G_PER_OZT, SYM, cfg, saveCfg, ensureSeed, accounts, code, account, findAccount, addAccount, updateAccount, ledger, balance, pendingOut, delta, post, wouldOverdraw, reverse,
    prices, setManualSpot, spot, cryptoPrice, refreshAll, fetchMetals, fetchCrypto, fetchFx,
    metals, mlog, activeMetals, fineOz, grossGrams, metalValue, addMetal, removeMetal, moveMetal, describeMetal, metalTotals,
    wallet, walletValue, saveWallet, syncBtc,
    netWorth, snapshotText, payments, createPayment, setPayment, completePayment, savePayments, apis, saveApis, apiRequest, fillTemplate, submitPayment, terminal, usdRate
  };
})();
