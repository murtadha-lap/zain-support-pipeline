# zain-support-pipeline

Ticket triage for an Iraqi mobile-wallet support team. Customers write in Iraqi dialect (also Arabizi and English mix). A small local model reads each ticket and proposes the category, priority, transaction details and a short draft reply. **Code** checks the proposal and either routes the ticket to a team queue or escalates it to a human agent. **People approve every reply**: nothing is sent automatically, no transaction is ever touched.

Agentic AI Challenge Iraq · Topic 06 — Support Pipeline Automation.

> **Status: MVP.** The full system runs end to end (portal → triage → checks → queues → approval → reply) with the offline **mock** model as the default. The fine-tuned Qwen3.5-4B model plugs in through vLLM without code changes; see [Use the real model](#use-the-real-model).

## Contents

- [Architecture](#architecture-three-layers)
- [What each role sees](#what-each-role-sees)
- [How one ticket flows](#how-one-ticket-flows)
- [Quick start](#quick-start-no-docker)
- [Models](#models)
- [Configuration](#configuration)
- [Run with Docker](#run-with-docker)
- [Tests](#tests)
- [Project structure](#project-structure)
- [Dataset](#dataset)
- [Failure modes](#failure-modes-and-how-they-are-handled)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Disclosure](#disclosure-models-tools-data-ai-assistants)

## Architecture: three layers

```text
 Browser ──► Next.js frontend (shadcn/ui)  ──/api rewrite──►  FastAPI backend  ──►  PostgreSQL
             customer portal                                  │  SQLModel + Pydantic
             agent / team workspace                           │  pipeline: model → checks → route/escalate
             admin console                                    ▼
                                                   model providers (one per row in Admin → Models)
                                                   • vLLM (local, OpenAI-compatible): several model ids / LoRA adapters
                                                   • Claude API (cloud, comparison only by default)
                                                   • any OpenAI-compatible cloud API
                                                   • mock (offline keyword model for dev and demos)
```

| layer | stack | folder |
| --- | --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, shadcn/ui, TanStack Query/Table, react-hook-form + zod, Recharts, MDXEditor (markdown draft editor) | [`frontend/`](frontend/) |
| Backend | FastAPI, SQLModel, Pydantic v2, official `openai` SDK (vLLM / OpenAI-compatible) and `anthropic` SDK | [`backend/`](backend/) |
| Database | PostgreSQL 16 (Docker) or SQLite (local dev) | — |
| Local model | Qwen3.5-4B + LoRA served by vLLM | [`docs/vllm.md`](docs/vllm.md) |

No LangChain: the plain SDKs give direct access to token logprobs (the confidence score) and structured outputs. The HTTP API is specified in [`docs/api-contract.md`](docs/api-contract.md); interactive docs run at `http://localhost:8000/docs`.

## What each role sees

| role | home | what they do |
| --- | --- | --- |
| Customer | `/portal` | Send a request (tips for what to include, PIN warning), follow its status (Received → In review → Answered), read the approved reply, send a follow-up. Never sees model internals. |
| Agent | `/app/inbox` | **Review queue** of tickets the model was not sure about, filterable by reason (low confidence, two problems, instruction in text, ungrounded field, …). Correct labels, route to a team, or answer. |
| Team member | `/app/team` | Their team's queue (Transfers, Accounts, Cards, Payments, Agent network, Security, General support). Edit the draft and approve, or send the ticket back to agents. |
| Admin | `/app/admin` | Dashboard (KPIs, daily volume, categories, confidence histogram), batches (run or upload, with evaluation against gold labels), models, users, teams and routing, threshold and settings, exports. |

The **ticket workspace** (`/app/tickets/{id}`) is the main screen for agents and teams:

- the customer message with the extracted reference, amount and date highlighted where they appear in the text;
- the model panel: model and prompt version, confidence against the threshold with the top alternative categories, extracted fields, flags, and each check with pass / fail;
- a markdown draft editor (MDXEditor, right-to-left for Arabic) with autosave, word count and "restore AI draft";
- actions: **Approve & send** (preview of the exact reply, confirmation required), route to team, send back, close, re-run triage with another model, edit labels (side panel), triage history (side panel), activity timeline.

Ctrl+K opens a command menu (jump to a page or a ticket number); light and dark themes are supported.

## How one ticket flows

1. A customer submits (or an admin uploads a batch). The backend calls the default model with JSON-schema constrained output (`category` first).
2. **Confidence** = probability of the category tokens from the model's logprobs, not a number the model reports about itself. The threshold is calibrated on the validation split.
3. **Checks (code, not model):** schema valid · reference / amount / date are substrings of the ticket text (otherwise blanked) · confidence ≥ threshold · one problem only.
4. All pass → routed to the team from the routing table, with the draft. Any fail → escalated to the agents' review queue with the reason.
5. A person edits and approves. Every decision is stored; corrections export as training data (`/api/export/corrections.jsonl`) for the next LoRA round.

## Quick start (no Docker)

Prerequisites: Python 3.12, Node 22+, pnpm. Use **two terminals**, both starting in the repo folder.

> Call Python tools through `python -m …` (`python -m pip`, `python -m uvicorn`, `python -m pytest`). On Windows machines with an Application Control policy, the `.exe` launchers inside `.venv\Scripts` are blocked, while `python.exe` is allowed.

**Terminal 1 — backend** (<http://localhost:8000>)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate                 # Linux/macOS: source .venv/bin/activate
python -m pip install -r requirements.txt
python -m app.seed --reset --demo      # teams, routing, models, users + 60 demo tickets triaged by the mock model
python -m uvicorn app.main:app --port 8000
```

**Terminal 2 — frontend** (<http://localhost:3000>)

```powershell
cd frontend
pnpm install
pnpm dev                               # or: pnpm build; pnpm start
```

Open <http://localhost:3000>. The login page has four demo cards (Admin, Agent, Team, Customer): one click signs you in. The seeded accounts:

| account | password | role |
| --- | --- | --- |
| admin@zain.local | Admin123! | admin |
| agent@zain.local, agent2@zain.local | Agent123! | agent |
| transfers@zain.local (also accounts@, cards@, payments@, agent_network@, security@, general_support@) | Team123! | team member |
| customer@zain.local, customer2@zain.local | Customer123! | customer |

`python -m app.seed --reset --demo` wipes the local database and recreates this demo state; run it again whenever you want a clean start.

## Models

The seed creates four model rows. Only the mock is on, so the system works with no GPU and no API key.

| model | provider | address | after seeding |
| --- | --- | --- | --- |
| Mock (dev only) | `mock` | inside the backend, no network | **on, default** |
| Qwen3.5-4B + LoRA (vLLM) | `vllm` | `http://localhost:8001/v1`, model id `zain-triage-lora` | off |
| Qwen3.5-4B base (vLLM) | `vllm` | `http://localhost:8001/v1`, model id `Qwen/Qwen3.5-4B` | off |
| Claude Opus 5.5 (cloud) | `anthropic` | Claude API, model id `claude-opus-5-5` | off |

The mock is a keyword classifier for testing the flow; its accuracy says nothing about the real model.

### Use the real model

1. Serve the model with vLLM on port 8001: [`docs/vllm.md`](docs/vllm.md). Each LoRA adapter name is its own model id, and several vLLM servers on different ports are several rows.
2. In **Admin → Models**, switch on the vLLM row and press **Test** (it runs a sample Arabic ticket and shows the result).
3. Press **Set as default**. New tickets and batches now go to vLLM.

### Cloud models

Set the key in the backend environment before starting it (`ANTHROPIC_API_KEY`, or the variable named in the model's `api_key_env`; the database stores only the variable name, never the key). Enable the row in **Admin → Models**. Cloud models only process uploaded synthetic tickets unless **Admin → Settings → Allow cloud for live tickets** is on, because customer text must not leave the operator's server. Claude requests use server-side refusal fallback by default (a switch on the model form).

## Configuration

Environment variables (backend, see [`backend/.env.example`](backend/.env.example)):

| variable | default | notes |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./zsp.db` | or `postgresql+psycopg://user:pw@host/db` |
| `JWT_SECRET` | dev value | **change in production** |
| `COOKIE_SECURE` | false | true behind HTTPS |
| `FRONTEND_ORIGIN` | <http://localhost:3000> | CORS origins, comma separated |
| `DATA_DIR` | `<repo>/data` | used by `--demo` |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `VLLM_API_KEY` | — | only the ones your models need |

The frontend reads `BACKEND_URL` (default <http://localhost:8000>) and proxies `/api/*` there, so the auth cookie stays first-party.

Runtime settings (Admin → Settings): confidence threshold (0.80), prompt version (`triage_v1`), escalate when there is no confidence (on), auto-triage new tickets (on), allow cloud for live tickets (off), retries on invalid output (1), batch concurrency (8).

## Run with Docker

```bash
docker compose up --build                 # PostgreSQL + backend + frontend, seeded with demo data
docker compose --profile gpu up --build   # + vLLM on an NVIDIA GPU (put the LoRA adapter in ./adapters/zain-triage-lora)
```

## Tests

```bash
cd backend && python -m pytest                    # 28 tests: confidence, checks, pipeline, API flows, roles, upload + eval
cd frontend && pnpm exec tsc --noEmit && pnpm lint && pnpm build
```

## Project structure

```text
backend/            FastAPI app: routers, pipeline, checks, confidence, LLM providers, seed, tests
frontend/           Next.js app: portal, workspace, admin console, shared components
data/               1,200 synthetic tickets: train / val / test, raw per-agent files, examples
schemas/            ticket.schema.json (dataset row format)
scripts/            validate_dataset.py, dialect_check.py, build_dataset.py
docs/               api-contract.md, vllm.md, generation_spec.md
docker-compose.yml  PostgreSQL + backend + frontend (+ vLLM with --profile gpu)
```

## Dataset

`data/` holds 1,200 synthetic tickets (train 900 / val 100 / test 200, the test split locked) in the format of [`schemas/ticket.schema.json`](schemas/ticket.schema.json). They cover the nine categories, five regions plus generic dialect, very short to long tickets, and planted edge cases: no reference, two problems in one, amounts in words, Arabizi, English mix, text that tries to instruct the model.

- `scripts/validate_dataset.py`: grounding, date resolution, flags, escalation and draft rules
- `scripts/dialect_check.py`: flags Modern Standard, Levantine, Egyptian and Gulf wording
- `scripts/build_dataset.py`: merges `data/raw/`, refuses to build while near-duplicates remain, makes stratified splits

To evaluate any model, upload `data/val.jsonl` or `data/test.jsonl` in **Admin → Batches → Upload**: the batch page shows category accuracy, macro F1, per-category F1, field exact match, invented references, escalation agreement and the most confused category pairs.

## Failure modes and how they are handled

| failure | handling |
| --- | --- |
| Model invents a reference or amount | grounding check: values must appear in the text, otherwise blanked and escalated |
| Model is confidently wrong | confidence from token logprobs, threshold calibrated on validation; below it → a person |
| Two problems in one ticket | escalated, never split by guessing |
| Ticket text tries to instruct the model | ticket is data only; output forced to the schema; flagged and escalated; the model can take no action |
| Invalid JSON | schema-constrained decoding, one retry, then escalated (`model_error`) |
| Cloud model sees live customer text | blocked unless an admin enables it; cloud is for synthetic comparison |
| Phone numbers in logs | masked by a logging filter |

## Troubleshooting

| symptom | fix |
| --- | --- |
| `Program 'pip.exe' / 'uvicorn.exe' failed to run: An Application Control policy has blocked this file` | use `python -m pip …`, `python -m uvicorn …`, `python -m pytest` |
| `cd frontend` fails from the backend terminal | open a second terminal in the repo folder; the frontend is a sibling of `backend/` |
| VS Code Source Control shows thousands of `.venv` files | the view is stale: press ↻ Refresh in Source Control; `.venv/` is ignored |
| Arabic sent with `curl` from Git Bash on Windows arrives as `???` | a Windows command-line encoding issue, not the app; send JSON from a file (`curl -d @ticket.json`) or use the browser / Python |
| Port 3000 or 8000 already in use | stop the old server (Ctrl+C in its terminal) or start on another port |

## Roadmap

From the design brief, MVP on 8 November:

- [x] Synthetic dataset with planted edge cases, test split locked
- [x] End-to-end pipeline with checks, routing, escalation and human approval
- [x] Review screen, team queues, customer portal, admin console
- [ ] Interview 2–3 support agents; confirm categories, teams and priority rules
- [ ] Prompt-only baseline numbers for Qwen3.5-4B on the test split
- [ ] LoRA fine-tune; calibrate the threshold on validation
- [ ] Final comparison: prompt-only vs fine-tuned vs cloud, with 95% bootstrap intervals
- [ ] 50 human-written tickets and injection tests
- [ ] Stretch: weekly pattern report; GRPO/DAPO with code-computed rewards

## Disclosure: models, tools, data, AI assistants

| item | use |
| --- | --- |
| Qwen3.5-4B (open weights, Apache 2.0) + LoRA | main triage model, served with vLLM on one GPU |
| Claude Opus 5.5 via the Claude API | optional cloud comparison on the synthetic test set |
| Claude (Anthropic) as AI assistant | generated the synthetic dataset (multi-agent, checked by scripts), and helped write the code, docs and plan |
| Data | 100% synthetic; names, numbers and references are invented. No real customer data |
| Libraries | FastAPI, SQLModel, Pydantic, openai and anthropic SDKs, Next.js, shadcn/ui, TanStack, Recharts, MDXEditor, PostgreSQL, vLLM, Docker |
