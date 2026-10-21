# zain-support-pipeline

Ticket triage for an Iraqi mobile-wallet support team. Customers write in Iraqi dialect (also Arabizi and English mix). A small local model reads each ticket and proposes the category, priority, transaction details and a short draft reply. **Code** checks the proposal and either routes the ticket to a team queue or escalates it to a human agent. **People approve every reply**: nothing is sent automatically, no transaction is ever touched.

Agentic AI Challenge Iraq · Topic 06 — Support Pipeline Automation.

## Architecture: three layers

```
 Browser ──► Next.js frontend (shadcn/ui)  ──/api rewrite──►  FastAPI backend  ──►  PostgreSQL
             customer portal                                  │  SQLModel + Pydantic
             agent / team workspace                           │  pipeline: model → checks → route/escalate
             admin console                                    ▼
                                                   model providers (one per row in Admin → Models)
                                                   • vLLM (local, OpenAI-compatible) — several model ids / LoRA adapters
                                                   • Claude API (cloud, comparison only by default)
                                                   • any OpenAI-compatible cloud API
                                                   • mock (offline keyword model for dev and demos)
```

| layer | stack | folder |
|---|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, shadcn/ui, TanStack Query/Table, react-hook-form + zod, Recharts, MDXEditor (markdown draft editor) | [`frontend/`](frontend/) |
| Backend | FastAPI, SQLModel, Pydantic v2, official `openai` SDK (vLLM / OpenAI-compatible) and `anthropic` SDK; no LangChain (the plain SDKs keep direct access to logprobs and structured outputs) | [`backend/`](backend/) |
| Database | PostgreSQL 16 (Docker) or SQLite (local dev) | — |
| Local model | Qwen3.5-4B + LoRA served by vLLM | [`docs/vllm.md`](docs/vllm.md) |

The full HTTP API is specified in [`docs/api-contract.md`](docs/api-contract.md); interactive docs at `http://localhost:8000/docs`.

## Roles

| role | what they do | home |
|---|---|---|
| Customer | sends a request, follows the conversation, gets the approved reply | `/portal` |
| Agent | works the **review queue**: tickets the model was not sure about (low confidence, two problems, text that tries to instruct the model, ungrounded fields). Corrects labels, routes, or answers | `/app/inbox` |
| Team member | works their team's queue (Transfers, Accounts, Cards, Payments, Agent network, Security, General support): edits the draft in the markdown editor and approves | `/app/team` |
| Admin | dashboard, batches (run / upload with gold labels for evaluation), models, users, teams and routing, threshold and settings, export of corrections for retraining | `/app/admin` |

## How one ticket flows

1. Customer submits (or an admin uploads a batch). The backend calls the default model with a JSON-schema constrained output (`category` first).
2. **Confidence** = probability of the category tokens from vLLM logprobs — not a number the model reports about itself. Calibrated threshold, chosen on the validation split.
3. **Checks (code, not model):** schema valid · reference/amount/date are substrings of the ticket text (else blanked) · confidence ≥ threshold · one problem only.
4. All pass → routed to the team from the routing table, with the draft. Any fail → escalated with the reason.
5. A person edits and approves the draft. Every decision is stored; corrections export as training data (`/api/export/corrections.jsonl`) for the next LoRA round.

## Run locally (no Docker)

Prerequisites: Python 3.12, Node 22+, pnpm. Use **two terminals**, both starting in the repo folder.

> Always call tools through `python -m …` (`python -m pip`, `python -m uvicorn`). On Windows machines with an Application Control policy, the `pip.exe` / `uvicorn.exe` launchers inside `.venv\Scripts` are blocked, while `python.exe` is allowed.

**Terminal 1 — backend** (http://localhost:8000)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate                 # Linux/macOS: source .venv/bin/activate
python -m pip install -r requirements.txt
python -m app.seed --reset --demo      # teams, routing, models, users + 60 demo tickets triaged by the mock model
python -m uvicorn app.main:app --port 8000
```

**Terminal 2 — frontend** (http://localhost:3000)

```powershell
cd frontend
pnpm install
pnpm dev                               # or: pnpm build; pnpm start
```

Open http://localhost:3000 — the login page has one-click demo accounts.

| account | password | role |
|---|---|---|
| admin@zain.local | Admin123! | admin |
| agent@zain.local, agent2@zain.local | Agent123! | agent |
| transfers@zain.local (also accounts@, cards@, payments@, agent_network@, security@, general_support@) | Team123! | team member |
| customer@zain.local, customer2@zain.local | Customer123! | customer |

The seed enables only the **mock** model, so everything works without a GPU. To use the real model, serve it with vLLM ([`docs/vllm.md`](docs/vllm.md)), then in **Admin → Models** enable the vLLM row, press **Test**, and set it as default. Cloud models need their API key in the backend environment (`ANTHROPIC_API_KEY`, …); by default they only run on uploaded synthetic tickets (Admin → Settings → "Allow cloud for live tickets").

## Run with Docker

```bash
docker compose up --build                 # db + backend + frontend
docker compose --profile gpu up --build   # + vLLM on an NVIDIA GPU (put the LoRA adapter in ./adapters/zain-triage-lora)
```

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest      # 28 tests: confidence, checks, pipeline, API flows, roles, upload + eval (no pytest.exe needed)
cd frontend && pnpm exec tsc --noEmit && pnpm lint && pnpm build
```

## Dataset

`data/` holds the 1,200 synthetic tickets (train 900 / val 100 / test 200, locked) in the format of [`schemas/ticket.schema.json`](schemas/ticket.schema.json). `scripts/validate_dataset.py` checks grounding, dates, flags, draft rules; `scripts/dialect_check.py` flags non-Iraqi wording; `scripts/build_dataset.py` merges and splits. Upload `data/val.jsonl` or `data/test.jsonl` in **Admin → Batches → Upload** to get accuracy, macro F1, field exact match, invented references and escalation agreement for any model.

## Failure modes and how they are handled

| failure | handling |
|---|---|
| Model invents a reference or amount | grounding check: values must appear in the text, otherwise blanked and escalated |
| Model is confidently wrong | confidence from token logprobs, threshold calibrated on validation; below it → a person |
| Two problems in one ticket | escalated, never split by guessing |
| Ticket text tries to instruct the model | ticket is data only; output forced to the schema; flagged and escalated; the model can take no action |
| Invalid JSON | schema-constrained decoding, one retry, then escalated (`model_error`) |
| Cloud model sees live customer text | blocked unless an admin enables it; cloud is for synthetic comparison |
| Phone numbers in logs | masked by a logging filter |

## Disclosure: models, tools, data, AI assistants

| item | use |
|---|---|
| Qwen3.5-4B (open weights, Apache 2.0) + LoRA | main triage model, served with vLLM on one GPU |
| Claude Opus 5.5 via the Claude API | optional cloud comparison on the synthetic test set |
| Claude (Anthropic) as AI assistant | generated the synthetic dataset (multi-agent, reviewed by scripts), and helped write the code, docs and plan |
| Data | 100% synthetic; names, numbers and references are invented. No real customer data |
| Libraries | FastAPI, SQLModel, Pydantic, openai and anthropic SDKs, Next.js, shadcn/ui, TanStack, Recharts, MDXEditor, PostgreSQL, vLLM, Docker |
