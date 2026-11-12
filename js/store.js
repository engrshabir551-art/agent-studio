// Persistence: IndexedDB (large, durable) with an in-memory cache so reads stay synchronous.
// Falls back to localStorage when IndexedDB is unavailable.
window.Store = (() => {
  "use strict";
  const P = "as:", DB = "agent-studio", OS = "kv";
  const DEFAULT_SETTINGS = { provider: "openrouter", temperature: 0.7, providers: {}, conc: 3, teamConc: 2, memoryOn: true, lock: null, lockMinutes: 5, autoPrices: true };
  let db = null;
  const cache = Object.create(null), pending = new Set();

  const openDb = () => new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error("no idb"));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OS);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error("blocked"));
  });

  async function init() {
    try {
      db = await openDb();
      await new Promise(res => {
        const rq = db.transaction(OS).objectStore(OS).openCursor();
        rq.onsuccess = e => { const c = e.target.result; if (c) { cache[c.key] = c.value; c.continue(); } else res(); };
        rq.onerror = () => res();
      });
    } catch { db = null; }
    // load (or migrate) localStorage data
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(P)) continue;
        const key = k.slice(P.length);
        if (key === "systems" || key in cache) continue;
        try { cache[key] = JSON.parse(localStorage.getItem(k)); if (db) pending.add(key); } catch {}
      }
      if (db) Object.keys(localStorage).filter(k => k.startsWith(P)).forEach(k => localStorage.removeItem(k));
    } catch {}
  }

  // Critical data is written within ~40 ms so a closing page rarely loses an edit; high-volume logs are batched longer.
  const SLOW = new Set(["bus", "runtime", "audit"]), timers = Object.create(null);
  function schedule(k) {
    if (timers[k]) return;
    timers[k] = setTimeout(() => { delete timers[k]; write([k]); }, SLOW.has(k) ? 600 : 40);
  }
  function write(keys) {
    keys.forEach(k => pending.delete(k));
    if (!keys.length) return;
    if (!db) { keys.forEach(k => { try { k in cache ? localStorage.setItem(P + k, JSON.stringify(cache[k])) : localStorage.removeItem(P + k); } catch {} }); return; }
    try {
      const st = db.transaction(OS, "readwrite").objectStore(OS);
      keys.forEach(k => { if (k in cache) st.put(cache[k], k); else st.delete(k); });
    } catch (e) { console.error("Store write failed", e); }
  }
  function flush() {
    Object.keys(timers).forEach(k => { clearTimeout(timers[k]); delete timers[k]; });
    write([...pending]);
  }
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });

  const get = (k, d) => (k in cache ? cache[k] : d);
  function set(k, v) { cache[k] = v; pending.add(k); schedule(k); return true; }
  function remove(k) { delete cache[k]; pending.add(k); schedule(k); }

  return {
    init, flush, get, set, remove,
    persistent: () => !!db,
    getSettings() { return { ...DEFAULT_SETTINGS, ...get("settings", {}) }; },
    setSettings(s) { return set("settings", s); },
    providerCfg(settings, id) { return (settings.providers && settings.providers[id]) || {}; },

    getSystems() {
      const s = get("systems2", null);
      return Array.isArray(s) && s.length ? s : JSON.parse(JSON.stringify(window.DEFAULT_SYSTEMS));
    },
    setSystems(s) { return set("systems2", s); },
    resetSystems() { remove("systems2"); },

    history() { return get("history", []); },
    saveItem(item) {
      const list = get("history", []).filter(h => h.id !== item.id);
      list.unshift(item);
      list.length = Math.min(list.length, 400);
      return set("history", list);
    },
    deleteItem(id) { set("history", get("history", []).filter(h => h.id !== id)); },
    clearHistory() { set("history", []); },

    exportAll() { return JSON.parse(JSON.stringify(cache)); },
    importAll(obj) {
      Object.keys(cache).forEach(k => remove(k));
      Object.entries(obj || {}).forEach(([k, v]) => set(k, v));
      flush();
    },
    wipe() {
      Object.keys(cache).forEach(k => delete cache[k]);
      pending.clear();
      try { if (db) db.transaction(OS, "readwrite").objectStore(OS).clear(); } catch {}
      try { Object.keys(localStorage).filter(k => k.startsWith(P)).forEach(k => localStorage.removeItem(k)); } catch {}
    }
  };
})();
