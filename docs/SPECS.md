# Agent Studio – System Specifications

**Total agents:** 56 · **Systems:** 3 · **Teams:** 19

| System | Agents | Teams |
|---|---|---|
| System 1 · Command & Orchestra | 26 | 9 |
| System 2 · Knowledge & World Intelligence | 20 | 7 |
| System 3 · Finance & Vault | 10 | 3 |

## 1. Architecture (all systems)

- **Layers:** Conductor → system orchestrators → team leads → members. A team run is: lead plans (assigns subtasks) → members work in parallel → lead merges.
- **Orchestra run:** the Conductor reads the catalogue of teams, routes subtasks to the teams it needs, teams run (optionally consulting their linked teams first), the Conductor merges and reports conflicts or gaps.
- **Linking:** the three systems share one message bus, one memory store, one runtime and one ledger. Teams reference each other through links; the Conductor can reach every team.
- **Delivery:** static HTML/CSS/JS web app (GitHub Pages), installable as PWA, packaged as Android APK with Capacitor. No server and no Streamlit.
- **AI providers:** OpenRouter, Ollama (local), OpenAI, Anthropic, Gemini, Groq, DeepSeek, Mistral or any OpenAI-compatible endpoint. The user pastes a key in Settings.
- **Offline / online:** all data lives on the device (IndexedDB). Dashboards, vault, tasks, memory, history and the terminal work offline; agents need a reachable provider (use Ollama on the local network to run agents offline).

## 2. Agent communication protocol

Every inter-agent message is an envelope:

```json
{ "id": "…", "corr": "correlation id", "ts": 0, "from": {"id": "conductor", "name": "GOD AI Conductor"},
  "to": {"id": "news-editor", "name": "Editor-in-Chief", "group": "news"},
  "type": "task | result | request | response | event | handoff | alert",
  "subject": "short text", "body": "content", "status": "delivered | rejected", "runId": "…" }
```

Messages that fail validation (missing sender, recipient, type or body) are stored as `rejected` with the reasons. The bus keeps the latest 1,500 messages.

## 3. Memory

Entries have text, scope (global, a team or a single agent), tags and a pinned flag. Before each agent call the most relevant entries (keyword overlap, plus pinned) are injected into the prompt. Memories can be added manually or extracted from text by the Memory Keeper. Secrets are filtered out.

## 4. Runtime

Per-agent state (idle, running, disabled), run count, error count, average latency and estimated tokens. Agents can be disabled; disabled agents are skipped by teams. A scheduler runs recurring jobs (a team or an agent) while the app is open. A Stop control cancels active runs.

## 5. Security

- Optional app lock (PIN, PBKDF2-hashed) with idle auto-lock.
- Content-Security-Policy blocks inline and third-party scripts.
- Audit log of key changes, API calls, payments, backups and failed unlocks.
- Encrypted backups (AES-GCM with a PBKDF2-derived key).
- API keys stay on the device and are sent only to the provider they belong to.

## 6. Finance platform

Multi-account ledger (immutable entries, reversals instead of deletion), cash vault, gold and silver vault (bars/coins with weight, purity, serial, location and movement log), live wallet prices, payments register with optional API submission, API hub, and a vault terminal. The app records and reconciles; real money moves only through the provider APIs the owner connects and approves.

## 7. Four-week plan

| Week | Scope |
|---|---|
| 1 | Roster, core engine, storage, message bus, memory, runtime |
| 2 | Team dashboards, orchestra, tasks, scheduler, security |
| 3 | Finance platform: ledger, vaults, wallet, payments, API hub, terminal |
| 4 | Testing, offline/APK packaging, documentation, handover |

## System 1 · Command & Orchestra

The GOD AI orchestra: conductor, chief of staff, assistants, management, memory, communication, runtime, project management and security.

**Agents:** 26 · **Teams:** 9

### Teams

| Team | Lead | Members | Consults first (links) |
|---|---|---|---|
| GOD AI Orchestra | GOD AI Conductor | – | – |
| Chief of Staff | Chief of Staff | – | Management, Project Management, Security, Financial Planning |
| AI Assistants | AI Assistant X1 | AI Assistant X2 | GOD AI Orchestra |
| Management | Operations Manager | Roles & HR Manager, Task Dispatcher, Quality Controller, Reporting Manager | – |
| Memory & AI Support | Memory Keeper | Context Retriever, Knowledge Base Curator, Session Summariser | – |
| Agent Communication | Message Router | Protocol Validator, Handoff Coordinator | – |
| Agent Runtime | Runtime Supervisor | Scheduler, Health Monitor | – |
| Project Management | Project Management Manager | Role Builder, Task Builder | – |
| Security | Security Chief | Key Guardian, Threat Monitor, Audit Logger | – |

### Agents and responsibilities

| # | Agent | Layer | Team | Role |
|---|---|---|---|---|
| 1 | GOD AI Conductor | conductor | GOD AI Orchestra | Master orchestrator of all teams |
| 2 | Chief of Staff | lead | Chief of Staff | Executive coordinator and daily briefings |
| 3 | AI Assistant X1 | lead | AI Assistants | Personal assistant linked to the Conductor |
| 4 | AI Assistant X2 | worker | AI Assistants | Second assistant: scheduling, drafting, follow-ups |
| 5 | Operations Manager | lead | Management | Runs day-to-day operations across teams |
| 6 | Roles & HR Manager | worker | Management | Defines agent roles, duties and handovers |
| 7 | Task Dispatcher | worker | Management | Routes tasks to the right agent or team |
| 8 | Quality Controller | worker | Management | Reviews outputs against requirements |
| 9 | Reporting Manager | worker | Management | Compiles status and performance reports |
| 10 | Memory Keeper | lead | Memory & AI Support | Curates long-term memory |
| 11 | Context Retriever | worker | Memory & AI Support | Finds relevant past context |
| 12 | Knowledge Base Curator | worker | Memory & AI Support | Organises documents and knowledge |
| 13 | Session Summariser | worker | Memory & AI Support | Summarises conversations and runs |
| 14 | Message Router | lead | Agent Communication | Routes structured messages between agents |
| 15 | Protocol Validator | worker | Agent Communication | Validates message envelopes |
| 16 | Handoff Coordinator | worker | Agent Communication | Manages handoffs between agents |
| 17 | Runtime Supervisor | lead | Agent Runtime | Oversees agent execution |
| 18 | Scheduler | worker | Agent Runtime | Plans recurring and timed jobs |
| 19 | Health Monitor | worker | Agent Runtime | Watches agent health and failures |
| 20 | Project Management Manager | lead | Project Management | Plans projects and coordinates roles and tasks |
| 21 | Role Builder | worker (manual input) | Project Management | Helps the owner write roles that are entered manually |
| 22 | Task Builder | worker (manual input) | Project Management | Helps the owner write tasks that are entered manually |
| 23 | Security Chief | lead | Security | Safeguards the app and all agents |
| 24 | Key Guardian | worker | Security | Protects API keys and secrets |
| 25 | Threat Monitor | worker | Security | Looks for abuse, prompt injection and anomalies |
| 26 | Audit Logger | worker | Security | Maintains the audit trail |

### Dashboards

- **GOD AI Orchestra** – Top-level conductor. Routes goals to the right teams across all three systems. Shows agent status, run statistics, a task box to run the whole team, and a `orchestra` panel.
- **Chief of Staff** – Executive coordination and daily briefings. Shows agent status, run statistics, a task box to run the whole team (optionally consulting linked teams first), and a `brief` panel.
- **AI Assistants** – Two personal assistants linked to the Conductor. Shows agent status, run statistics, a task box to run the whole team (optionally consulting linked teams first), and a `assist` panel.
- **Management** – Operations, roles, dispatch, quality and reporting. Shows agent status, run statistics, a task box to run the whole team, and a `tasks` panel.
- **Memory & AI Support** – Long-term memory, context retrieval and knowledge curation. Shows agent status, run statistics, a task box to run the whole team, and a `memory` panel.
- **Agent Communication** – Structured messages, routing, validation and handoffs. Shows agent status, run statistics, a task box to run the whole team, and a `bus` panel.
- **Agent Runtime** – Execution, scheduling and health of all agents. Shows agent status, run statistics, a task box to run the whole team, and a `runtime` panel.
- **Project Management** – Projects, plus two agents whose roles and tasks you enter manually. Shows agent status, run statistics, a task box to run the whole team, and a `pm` panel.
- **Security** – Safeguards the app, its keys and its agents. Shows agent status, run statistics, a task box to run the whole team, and a `security` panel.

## System 2 · Knowledge & World Intelligence

World news agency, research, analytics, longevity, biology and business development.

**Agents:** 20 · **Teams:** 7

### Teams

| Team | Lead | Members | Consults first (links) |
|---|---|---|---|
| Knowledge Direction | Knowledge Director | – | World News Agency, Research, Analytics, Longevity Solutions, Professor of Biology, Business Development |
| World News Agency | Editor-in-Chief | Global Correspondent, Markets Reporter, Fact Checker, News AI Assistant | – |
| Research | Research Lead | Literature Scout, Methodology Reviewer | – |
| Analytics | Analytics Lead | Data Analyst, Visualisation Analyst | – |
| Longevity Solutions | Longevity Lead | Lifestyle & Nutrition Analyst, Healthspan Researcher | Professor of Biology |
| Professor of Biology | Professor of Biology | – | – |
| Business Development | Business Development Manager | Market Opportunity Scout, Partnership Liaison, Proposal Writer | Research, Analytics, World News Agency, Financial Planning |

### Agents and responsibilities

| # | Agent | Layer | Team | Role |
|---|---|---|---|---|
| 1 | Knowledge Director | orchestrator | Knowledge Direction | Orchestrates all knowledge and intelligence work |
| 2 | Editor-in-Chief | lead | World News Agency | Runs the World News Agency |
| 3 | Global Correspondent | worker | World News Agency | Covers world affairs and geopolitics |
| 4 | Markets Reporter | worker | World News Agency | Covers economy and markets |
| 5 | Fact Checker | worker | World News Agency | Checks claims and sources |
| 6 | News AI Assistant | worker | World News Agency | Personal news assistant |
| 7 | Research Lead | lead | Research | Leads research projects |
| 8 | Literature Scout | worker | Research | Finds and summarises sources |
| 9 | Methodology Reviewer | worker | Research | Checks research methods |
| 10 | Analytics Lead | lead | Analytics | Leads data analysis |
| 11 | Data Analyst | worker | Analytics | Analyses data and finds patterns |
| 12 | Visualisation Analyst | worker | Analytics | Designs charts and dashboards |
| 13 | Longevity Lead | lead | Longevity Solutions | Leads healthy-ageing research |
| 14 | Lifestyle & Nutrition Analyst | worker | Longevity Solutions | Analyses lifestyle and nutrition evidence |
| 15 | Healthspan Researcher | worker | Longevity Solutions | Tracks ageing biology research |
| 16 | Professor of Biology | lead | Professor of Biology | Explains biology at university level |
| 17 | Business Development Manager | lead | Business Development | Finds growth opportunities and links other teams |
| 18 | Market Opportunity Scout | worker | Business Development | Scans markets for opportunities |
| 19 | Partnership Liaison | worker | Business Development | Plans partnerships and outreach |
| 20 | Proposal Writer | worker | Business Development | Writes proposals and pitches |

### Dashboards

- **Knowledge Direction** – Directs news, research, analytics, longevity, biology and business development. Shows agent status, run statistics, a task box to run the whole team (optionally consulting linked teams first).
- **World News Agency** – Editorial team with its own AI assistant. Shows agent status, run statistics, a task box to run the whole team, and a `news` panel.
- **Research** – Question framing, sources and methodology. Shows agent status, run statistics, a task box to run the whole team.
- **Analytics** – Data analysis and visualisation. Attach a CSV or text file to analyse it. Shows agent status, run statistics, a task box to run the whole team.
- **Longevity Solutions** – Healthy-ageing evidence (educational, not medical advice). Shows agent status, run statistics, a task box to run the whole team (optionally consulting linked teams first).
- **Professor of Biology** – University-level biology teaching and explanation. Shows agent status, run statistics, a task box to run the whole team.
- **Business Development** – Growth, partnerships and proposals. Can consult several other teams. Shows agent status, run statistics, a task box to run the whole team (optionally consulting linked teams first).

## System 3 · Finance & Vault

Financial planning, treasury, live wallet, payments, API integrations, cash vault and gold and silver vault.

**Agents:** 10 · **Teams:** 3

### Teams

| Team | Lead | Members | Consults first (links) |
|---|---|---|---|
| Financial Planning | Finance Director | Financial Planner, Asset Valuation Analyst | Treasury & Wallet, Cash, Gold & Silver Vault |
| Treasury & Wallet | Treasury Manager | Wallet Monitor, Payments Agent, API Integration Agent | – |
| Cash, Gold & Silver Vault | Cash Vault Keeper | Gold Vault Keeper, Silver Vault Keeper | – |

### Agents and responsibilities

| # | Agent | Layer | Team | Role |
|---|---|---|---|---|
| 1 | Finance Director | orchestrator | Financial Planning | Leads financial planning and the finance system |
| 2 | Financial Planner | worker | Financial Planning | Builds budgets, goals and scenarios |
| 3 | Asset Valuation Analyst | worker | Financial Planning | Values cash, metals and crypto holdings |
| 4 | Treasury Manager | lead | Treasury & Wallet | Manages liquidity and cash flow |
| 5 | Wallet Monitor | worker | Treasury & Wallet | Watches the live wallet |
| 6 | Payments Agent | worker | Treasury & Wallet | Prepares and checks payments |
| 7 | API Integration Agent | worker | Treasury & Wallet | Designs and checks API connections |
| 8 | Cash Vault Keeper | lead | Cash, Gold & Silver Vault | Keeps the cash vault ledger accurate |
| 9 | Gold Vault Keeper | worker | Cash, Gold & Silver Vault | Keeps the gold vault records |
| 10 | Silver Vault Keeper | worker | Cash, Gold & Silver Vault | Keeps the silver vault records |

### Dashboards

- **Financial Planning** – Budgets, goals, scenarios and valuation. Shows agent status, run statistics, a task box to run the whole team (optionally consulting linked teams first), and a `finance` panel.
- **Treasury & Wallet** – Liquidity, live wallet, payments and API integrations. Shows agent status, run statistics, a task box to run the whole team, and a `finance` panel.
- **Cash, Gold & Silver Vault** – Cash vault ledger and the gold and silver vault records. Shows agent status, run statistics, a task box to run the whole team, and a `finance` panel.

