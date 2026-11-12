// App shell: view registry, navigation (sidebar / drawer / tab bar), hash routing, online status.
window.App = (() => {
  "use strict";
  const { $, $$, esc } = U;
  const views = new Map();
  const NAV = [
    ["Overview", ["dashboard"]],
    ["Work", ["orchestra", "chat", "teams", "tasks"]],
    ["Platform", ["memory", "comms", "runtime"]],
    ["Finance", ["vault"]],
    ["Admin", ["agents", "security", "history", "settings"]]
  ];
  const TABS = ["dashboard", "orchestra", "teams", "vault"];
  let current = null, params = null;

  const register = v => views.set(v.id, v);

  function buildNav() {
    $("#nav").innerHTML = NAV.map(([label, ids]) => `<div class="navgrp">${esc(label)}</div>` + ids.filter(id => views.has(id)).map(id => {
      const v = views.get(id); return `<button data-go="${id}"><span class="ni">${v.icon}</span>${esc(v.title)}</button>`;
    }).join("")).join("");
    $("#tabbar").innerHTML = TABS.filter(id => views.has(id)).map(id => { const v = views.get(id); return `<button data-go="${id}"><span>${v.icon}</span>${esc(v.short || v.title)}</button>`; }).join("") +
      `<button id="tabMenu"><span>☰</span>Menu</button>`;
  }

  function mount() {
    const main = $("#main");
    for (const v of views.values()) {
      const sec = document.createElement("section");
      sec.className = "view"; sec.id = "view-" + v.id; main.appendChild(sec); v.el = sec;
      try { if (v.mount) v.mount(sec); } catch (e) { console.error(v.id, e); sec.innerHTML = `<p class="muted">This view failed to load: ${esc(e.message)}</p>`; }
    }
    buildNav();
    document.addEventListener("click", e => {
      const b = e.target.closest("[data-go]"); if (b) { go(b.dataset.go); return; }
      if (e.target.closest("#tabMenu, #menuBtn")) toggleSide(true);
      else if (e.target.closest("#scrim")) toggleSide(false);
    });
    window.addEventListener("hashchange", () => show(routeId()));
    window.addEventListener("online", netState); window.addEventListener("offline", netState);
    netState();
    Core.on(t => { if (t === "settings") renderBadge(); });
    renderBadge();
    show(routeId());
  }

  const routeId = () => { const id = (location.hash || "").replace(/^#\/?/, ""); return views.has(id) ? id : "dashboard"; };
  function go(id, p) {
    params = p || null;
    if (location.hash === "#/" + id) show(id); else location.hash = "#/" + id;
  }
  function show(id) {
    const v = views.get(id); if (!v) return;
    current = id;
    for (const x of views.values()) x.el.classList.toggle("active", x.id === id);
    $$("[data-go]").forEach(b => b.classList.toggle("active", b.dataset.go === id));
    $("#viewTitle").textContent = v.title;
    toggleSide(false);
    const p = params; params = null;
    try { if (v.show) v.show(v.el, p); } catch (e) { console.error(id, e); }
    const main = $("#main"); main.scrollTop = 0;
  }
  function toggleSide(open) { $("#side").classList.toggle("open", open); $("#scrim").classList.toggle("show", open); }

  function netState() {
    const on = navigator.onLine !== false;
    $("#netChip").className = "netchip " + (on ? "on" : "off");
    $("#netChip").textContent = on ? "Online" : "Offline";
    $("#offlineBanner").hidden = on;
    Core.emit("net");
  }
  function renderBadge() {
    const p = PROVIDERS[Core.settings().provider];
    $("#providerBadge").textContent = `${p ? p.label : "?"} · ${Core.modelName()}`;
  }

  return { register, mount, go, show, renderBadge, current: () => current, views };
})();
