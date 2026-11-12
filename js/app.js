// Boot: load storage, build state, mount views, start the lock and the scheduler, register the service worker.
(async () => {
  "use strict";
  try {
    await Store.init();
    Core.load();
    Finance.ensureSeed();
    App.mount();
    Lock.init();
    Engine.Scheduler.start();
    if (Core.settings().autoPrices !== false && Core.online()) setTimeout(() => Finance.refreshAll().catch(() => {}), 2500);
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
    window.__ready = true;
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML("afterbegin", `<pre style="color:#ff6b6b;padding:16px;white-space:pre-wrap">Agent Studio failed to start: ${U.esc(e.message)}</pre>`);
  }
})();
