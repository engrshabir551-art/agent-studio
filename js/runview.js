// Renders a run (live or saved) as a list of step cards plus a final result card.
window.RunView = (() => {
  "use strict";
  function attach(box, run) {
    box.innerHTML = "";
    const cards = new Map();
    let finalEl = null;

    function ensure(st) {
      let c = cards.get(st.id);
      if (c) return c;
      const el = document.createElement("div");
      el.className = "card step";
      el.innerHTML = `<div class="step-head"><div><strong></strong><div class="muted small sub"></div></div><span class="status"></span></div><div class="step-body"></div><div class="muted small foot"></div>`;
      el.querySelector("strong").textContent = st.agent;
      el.querySelector(".sub").textContent = `${st.group}${st.group ? " · " : ""}${st.label}`;
      box.insertBefore(el, finalEl);
      c = { el, body: el.querySelector(".step-body"), status: el.querySelector(".status"), foot: el.querySelector(".foot"), raf: 0 };
      cards.set(st.id, c);
      return c;
    }
    function paint(st) {
      const c = ensure(st);
      c.status.textContent = st.status; c.status.dataset.s = st.status;
      c.foot.textContent = st.ms ? `${(st.ms / 1000).toFixed(1)} s` : "";
      cancelAnimationFrame(c.raf);
      c.raf = requestAnimationFrame(() => {
        c.body.innerHTML = U.md(st.output || "") + (st.error ? `<div class="err">⚠ ${U.esc(st.error)}</div>` : "");
        const near = box.parentElement && (box.parentElement.scrollHeight - box.parentElement.scrollTop - box.parentElement.clientHeight < 160);
        if (near && st.status === "running") box.parentElement.scrollTop = box.parentElement.scrollHeight;
      });
    }
    function finish() {
      if (finalEl) finalEl.remove();
      finalEl = document.createElement("div");
      finalEl.className = "card step final";
      const failed = run.status === "error", stopped = run.status === "stopped";
      finalEl.innerHTML = `<div class="step-head"><div><strong>${failed ? "Run failed" : stopped ? "Run stopped" : "Final result"}</strong><div class="muted small">${run.steps.length} steps · ${U.esc(run.provider || "")} ${U.esc(run.model || "")}</div></div><span class="status" data-s="${run.status}">${run.status}</span></div>
        <div class="step-body">${failed ? `<div class="err">⚠ ${U.esc(run.error || "Unknown error")}</div>` : ""}${run.final ? U.md(run.final) : ""}</div>
        ${run.final ? `<div class="row"><button class="btn small" data-fa="copy">Copy</button><button class="btn small" data-fa="md">Download .md</button><button class="btn small" data-fa="mem">Remember</button></div>` : ""}`;
      box.appendChild(finalEl);
      finalEl.addEventListener("click", async e => {
        const b = e.target.closest("[data-fa]"); if (!b) return;
        if (b.dataset.fa === "copy") U.copy(run.final);
        else if (b.dataset.fa === "md") U.download("result.md", `# ${run.title}\n\n${run.final}\n`, "text/markdown");
        else if (b.dataset.fa === "mem") {
          const pre = Engine.preflight(); if (!pre.ok) return U.toast(pre.reason);
          b.disabled = true; b.textContent = "Extracting…";
          try { const n = await Engine.extractMemories(run.final); U.toast(n ? `${n} memories saved.` : "Nothing new to remember."); } catch (err) { U.toast("Could not extract: " + err.message); }
          b.disabled = false; b.textContent = "Remember";
        }
      });
    }

    run.steps.forEach(paint);
    const un = Engine.watch(run, st => { if (st) paint(st); else finish(); });
    if (run.status !== "running") finish();
    return { detach: un };
  }
  return { attach };
})();
