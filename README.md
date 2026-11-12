# Agent Studio

A standalone, open-source multi-agent platform built with plain **HTML, CSS and JavaScript**. No Streamlit, no framework, no server.
**56 agents · 3 linked systems · 19 team dashboards · works offline and online.** Runs in a browser, installs as a PWA, and builds into an Android APK.

## What is inside

| Area | What it does |
|---|---|
| **Dashboard** | Platform KPIs, alerts, per-system health, recent runs and agent messages |
| **Orchestra (GOD AI)** | The Conductor routes a goal to the teams it needs; teams run (members in parallel); the Conductor merges. Or chain teams in a manual order |
| **Teams** | One dashboard per team: agent status, run stats, enable/disable, run box (file attach), team panel, optional "consult linked teams first" |
| **Chat** | Talk to any single agent (long-term memory injected automatically) |
| **Tasks** | Manual board (to do / doing / blocked / done), assign to a team or agent, run it, or draft tasks with the Task Builder |
| **Memory** | Long-term memory (global, per team or per agent), pinned items, extraction from text |
| **Comms** | Structured agent-to-agent message bus with envelope validation |
| **Runtime** | Live agent state, runs, errors, latency, estimated tokens; stop-all; scheduled jobs |
| **Vault Terminal** | Platform balance, cash vault + ledger, gold & silver vault, live wallet, payments, API hub, command terminal |
| **Agents** | Add, edit, delete, import/export the roster, export system specs |
| **Security** | App lock, security checks, audit log, encrypted backup/restore |
| **History** | Every chat and run is saved on the device; search, reopen, export |

The 56 agents: System 1 Command & Orchestra (26), System 2 Knowledge & World Intelligence (20), System 3 Finance & Vault (10). See `docs/SPECS.md` (generated) for the system-specific specifications.

## Run it

Open `index.html` through any static server (`npm run serve`, or `python3 -m http.server`). Opening the file directly works for most things, but encryption (app lock, backups) and offline caching need `http://localhost` or `https`.

1. Go to **Settings**, choose a provider (OpenRouter, Ollama, OpenAI, Anthropic, Gemini, Groq, DeepSeek, Mistral or any OpenAI-compatible URL), paste the key, press **Test connection**.
2. Try the **Orchestra** with a goal such as "Plan the launch of our wallet product".

## Publish on GitHub and get a web link

```bash
git init && git add . && git commit -m "Agent Studio"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then **Settings → Pages → Source: GitHub Actions**. The `Deploy web app to GitHub Pages` workflow publishes on every push to `https://<you>.github.io/<repo>/`.

## Android APK

* **No Android Studio needed:** the `Build Android APK` workflow runs on every push. Open the repo's **Actions** tab, open the latest run and download the `agent-studio-apk` artifact (a debug APK; allow "install unknown apps" on the phone).
* **Locally** (Node 20, JDK 17, Android SDK): `npm install && npm run build && npx cap add android && npx cap sync android && cd android && ./gradlew assembleDebug`.

The APK contains the whole app, so it also opens with no internet.

## Offline and online

* All data is stored on the device (IndexedDB). Dashboards, vault, ledger, tasks, memory, history and the terminal work with no connection.
* Agents need a reachable AI provider. **To run agents fully offline**, use Ollama on the same network (or the same device) and choose Ollama in Settings. The app detects local addresses and still allows them when the internet is down.
* The status chip and banner show the connection state. Price refreshes are skipped offline and the last saved prices are used.

## Using Ollama

* PC/browser: start Ollama with `OLLAMA_ORIGINS=*`.
* Phone (APK): `localhost` is the phone itself. Run Ollama on a computer with `OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=*` and set the Base URL to `http://<computer-ip>:11434`.
* A page served from `https://` (GitHub Pages) can only reach Ollama on localhost; use the APK or the local copy for a LAN address.

## Finance platform: what it does and does not do

* **Does:** record and reconcile. Multi-account ledger (entries are never deleted; mistakes are reversed), cash vault and bank accounts, gold and silver vault (bars/coins with weight, purity, serial, location, movement log, fine-ounce valuation), live wallet prices (CoinGecko), Bitcoin address balance sync (mempool.space), exchange rates (Frankfurter), metals spot (configurable URL, manual override), payment register, CSV exports, command terminal.
* **Payments:** a payment is prepared, approved, optionally submitted through an API connection you define (JSON template with `{{amount}}`, `{{currency}}`, `{{payee}}`, `{{reference}}`), then marked completed, which posts the ledger entry. The app only moves real money if you connect a provider API and confirm the prompt. Many bank/payment APIs block direct browser calls (CORS); those need your own small server in between.
* **Does not:** hold private keys, execute trades, or provide licensed financial advice. Agent outputs are suggestions.
* Verify the live price sources before relying on them: they are third-party services that can change. Edit the metals URL in *Vault → Overview → Rates & prices*.

## Security notes

* A Content-Security-Policy blocks injected and third-party scripts.
* API keys are stored unencrypted in the device's app storage and are sent only to the provider they belong to. Use restricted, revocable keys.
* The PIN lock hides the app on a shared device; it is not disk encryption. **Encrypted backups** (AES-GCM, PBKDF2) protect exported data; the passphrase cannot be recovered.
* For a public multi-user product, route AI and finance calls through your own backend instead of keeping keys in the client.

## Load the client's own roles

*Agents → Import JSON* replaces the roster. Format:

```json
{ "systems": [ { "id": "sys1", "name": "System 1", "description": "",
  "agents": [ { "id": "lead-1", "name": "Lead", "layer": "lead", "group": "news",
                "role": "Coordinator", "prompt": "Instructions…" } ] } ] }
```

`layer` is `conductor`, `orchestrator`, `lead` or `worker`; `group` is the team id. The first agent by layer in each team leads it. `GROUP_META` in `js/defaults.js` gives teams their names, icons and links.

## Development

```
npm run build   # copy the app to ./www
npm run spec    # regenerate docs/SPECS.md from the roster
npm run serve   # static server
```

Plain scripts, no bundler: `js/defaults.js` (roster) → `core.js` (state, bus, memory, runtime) → `engine.js` (team/orchestra runs, scheduler) → `finance.js` → views.

## Licence

MIT. See `LICENSE`.
