// Generates system-specific specification documents (Markdown) from the live roster.
// Works in the browser (window.Specs) and in Node (scripts/gen-spec.js).
(function (root) {
  const RANK = { conductor: 0, orchestrator: 1, lead: 2, worker: 3 };

  function groupsOf(systems, meta) {
    const map = new Map();
    for (const sys of systems) for (const a of sys.agents) {
      const gid = a.group || "ungrouped";
      if (!map.has(gid)) { const m = meta[gid] || {}; map.set(gid, { id: gid, name: m.name || gid, desc: m.desc || "", links: m.links || [], widget: m.widget || "", sys: sys.id, agents: [] }); }
      map.get(gid).agents.push(a);
    }
    for (const g of map.values()) g.agents.sort((x, y) => (RANK[x.layer] ?? 3) - (RANK[y.layer] ?? 3));
    return map;
  }
  const cell = s => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

  function systemSpec(sys, groups, all) {
    const gs = [...groups.values()].filter(g => g.sys === sys.id);
    let o = `## ${sys.name}\n\n${sys.description}\n\n**Agents:** ${sys.agents.length} · **Teams:** ${gs.length}\n\n### Teams\n\n| Team | Lead | Members | Consults first (links) |\n|---|---|---|---|\n`;
    for (const g of gs) {
      const links = g.links.map(l => (groups.get(l) || {}).name || l).join(", ") || "–";
      o += `| ${cell(g.name)} | ${cell(g.agents[0].name)} | ${cell(g.agents.slice(1).map(a => a.name).join(", ") || "–")} | ${cell(links)} |\n`;
    }
    o += `\n### Agents and responsibilities\n\n| # | Agent | Layer | Team | Role |\n|---|---|---|---|---|\n`;
    let i = 0;
    for (const g of gs) for (const a of g.agents) o += `| ${++i} | ${cell(a.name)} | ${a.layer}${a.manual ? " (manual input)" : ""} | ${cell(g.name)} | ${cell(a.role)} |\n`;
    o += `\n### Dashboards\n\n`;
    for (const g of gs) o += `- **${g.name}** – ${g.desc || "Team dashboard"} Shows agent status, run statistics, a task box to run the whole team${g.links.length ? " (optionally consulting linked teams first)" : ""}${g.widget ? `, and a \`${g.widget}\` panel` : ""}.\n`;
    return o + "\n";
  }

  function markdown(systems, meta) {
    const groups = groupsOf(systems, meta || {});
    const total = systems.reduce((n, s) => n + s.agents.length, 0);
    let o = `# Agent Studio – System Specifications\n\n`;
    o += `**Total agents:** ${total} · **Systems:** ${systems.length} · **Teams:** ${groups.size}\n\n`;
    o += `| System | Agents | Teams |\n|---|---|---|\n`;
    for (const s of systems) o += `| ${cell(s.name)} | ${s.agents.length} | ${[...groups.values()].filter(g => g.sys === s.id).length} |\n`;
    o += `\n## 1. Architecture (all systems)\n\n`;
    o += `- **Layers:** Conductor → system orchestrators → team leads → members. A team run is: lead plans (assigns subtasks) → members work in parallel → lead merges.\n`;
    o += `- **Orchestra run:** the Conductor reads the catalogue of teams, routes subtasks to the teams it needs, teams run (optionally consulting their linked teams first), the Conductor merges and reports conflicts or gaps.\n`;
    o += `- **Linking:** the three systems share one message bus, one memory store, one runtime and one ledger. Teams reference each other through links; the Conductor can reach every team.\n`;
    o += `- **Delivery:** static HTML/CSS/JS web app (GitHub Pages), installable as PWA, packaged as Android APK with Capacitor. No server and no Streamlit.\n`;
    o += `- **AI providers:** OpenRouter, Ollama (local), OpenAI, Anthropic, Gemini, Groq, DeepSeek, Mistral or any OpenAI-compatible endpoint. The user pastes a key in Settings.\n`;
    o += `- **Offline / online:** all data lives on the device (IndexedDB). Dashboards, vault, tasks, memory, history and the terminal work offline; agents need a reachable provider (use Ollama on the local network to run agents offline).\n\n`;
    o += `## 2. Agent communication protocol\n\nEvery inter-agent message is an envelope:\n\n\`\`\`json\n{ "id": "…", "corr": "correlation id", "ts": 0, "from": {"id": "conductor", "name": "GOD AI Conductor"},\n  "to": {"id": "news-editor", "name": "Editor-in-Chief", "group": "news"},\n  "type": "task | result | request | response | event | handoff | alert",\n  "subject": "short text", "body": "content", "status": "delivered | rejected", "runId": "…" }\n\`\`\`\n\n`;
    o += `Messages that fail validation (missing sender, recipient, type or body) are stored as \`rejected\` with the reasons. The bus keeps the latest 1,500 messages.\n\n`;
    o += `## 3. Memory\n\nEntries have text, scope (global, a team or a single agent), tags and a pinned flag. Before each agent call the most relevant entries (keyword overlap, plus pinned) are injected into the prompt. Memories can be added manually or extracted from text by the Memory Keeper. Secrets are filtered out.\n\n`;
    o += `## 4. Runtime\n\nPer-agent state (idle, running, disabled), run count, error count, average latency and estimated tokens. Agents can be disabled; disabled agents are skipped by teams. A scheduler runs recurring jobs (a team or an agent) while the app is open. A Stop control cancels active runs.\n\n`;
    o += `## 5. Security\n\n- Optional app lock (PIN, PBKDF2-hashed) with idle auto-lock.\n- Content-Security-Policy blocks inline and third-party scripts.\n- Audit log of key changes, API calls, payments, backups and failed unlocks.\n- Encrypted backups (AES-GCM with a PBKDF2-derived key).\n- API keys stay on the device and are sent only to the provider they belong to.\n\n`;
    o += `## 6. Finance platform\n\nMulti-account ledger (immutable entries, reversals instead of deletion), cash vault, gold and silver vault (bars/coins with weight, purity, serial, location and movement log), live wallet prices, payments register with optional API submission, API hub, and a vault terminal. The app records and reconciles; real money moves only through the provider APIs the owner connects and approves.\n\n`;
    o += `## 7. Four-week plan\n\n| Week | Scope |\n|---|---|\n| 1 | Roster, core engine, storage, message bus, memory, runtime |\n| 2 | Team dashboards, orchestra, tasks, scheduler, security |\n| 3 | Finance platform: ledger, vaults, wallet, payments, API hub, terminal |\n| 4 | Testing, offline/APK packaging, documentation, handover |\n\n`;
    for (const s of systems) o += systemSpec(s, groups, systems);
    return o;
  }

  root.Specs = { markdown, groupsOf };
  if (typeof module !== "undefined" && module.exports) module.exports = root.Specs;
})(typeof window !== "undefined" ? window : globalThis);
