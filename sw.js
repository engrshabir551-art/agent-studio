// Offline support: the app shell is cached and served instantly (stale-while-revalidate).
// API calls to AI providers and finance services are never cached.
const CACHE = "agent-studio-v2";
const SHELL = [
  "./", "index.html", "css/style.css", "manifest.webmanifest", "icon.svg",
  "js/util.js", "js/defaults.js", "js/specs.js", "js/providers.js", "js/store.js", "js/core.js", "js/engine.js", "js/finance.js",
  "js/runview.js", "js/shell.js", "js/views-dashboard.js", "js/views-orchestra.js", "js/views-chat.js", "js/views-teams.js", "js/views-tasks.js",
  "js/views-memory.js", "js/views-comms.js", "js/views-runtime.js", "js/views-vault.js", "js/views-agents.js", "js/views-security.js",
  "js/views-history.js", "js/views-settings.js", "js/app.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || (await cache.match("index.html")) || new Response("Offline", { status: 503 });
  }));
});
