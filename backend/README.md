# Backend: Zain support pipeline (FastAPI)

This backend triages support tickets for an Iraqi mobile wallet. A model proposes the category, priority, extracted fields, flags and a draft reply. Code then checks the proposal (grounding, confidence against the threshold, single issue) and either routes the ticket to a team queue or escalates it to a human agent. A human approves every reply. Nothing is sent to a customer automatically.

The HTTP contract is in [`../docs/api-contract.md`](../docs/api-contract.md). Interactive API docs are served at **http://localhost:8000/docs** (OpenAPI JSON at `/openapi.json`).

## Run (local, no Docker)

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    Linux/macOS: source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env              # optional

python -m app.seed --reset --demo # tables, teams, routing, models, users + 60 demo tickets (one mock batch)
python -m uvicorn app.main:app --reload --port 8000
```

Tests: `python -m pytest` (run it from `backend/`). The tests use a temporary SQLite database and the mock provider, so they need no network.

### Seed

`python -m app.seed` is idempotent.

- `--reset` drops all tables and creates them again.
- `--demo` imports 60 rows from `data/train.jsonl`, spread across the categories. They become live tickets owned by the demo customers. Only the text, channel and created_at are imported, not the gold labels. It then runs one mock batch over them and makes a few approvals and assignments, so every queue and dashboard has data.

| role | email | password |
|---|---|---|
| admin | admin@zain.local | Admin123! |
| agent | agent@zain.local, agent2@zain.local | Agent123! |
| team_member | `<team_key>@zain.local` (transfers, accounts, agent_network, cards, payments, security, general_support) | Team123! |
| customer | customer@zain.local, customer2@zain.local | Customer123! |

At startup the server also creates the tables. It seeds the teams, routing, settings and models if they are missing, but not the users.

## Environment variables

| var | default | |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./zsp.db` | also works with `postgresql+psycopg://user:pw@host/db` |
| `JWT_SECRET` | dev value | **change in production** |
| `JWT_EXPIRE_DAYS` | 7 | |
| `COOKIE_SECURE` | false | set to true behind HTTPS |
| `FRONTEND_ORIGIN` | http://localhost:3000 | CORS origins (comma separated), sent with credentials |
| `LOG_LEVEL` | INFO | |
| `DATA_DIR` | `<repo>/data` | used by `--demo` |
| `ANTHROPIC_API_KEY`, ... | | API keys. The DB stores only the env var *name* (`api_key_env`) |

Runtime settings are stored in the `settings` table and edited with `PUT /api/settings` (admin). They are `confidence_threshold` (0.80), `prompt_version` (`triage_v1`), `escalate_without_confidence` (true), `auto_triage` (true), `allow_cloud_for_live_tickets` (false), `max_retries` (1) and `batch_concurrency` (8).

## Auth

`POST /api/auth/login` sets the httpOnly cookie `zsp_token`. It is an HS256 JWT valid for 7 days, with `SameSite=Lax` and `Path=/`. The API also accepts `Authorization: Bearer <jwt>`. Passwords are hashed with bcrypt.

## Providers (no LangChain: we use the official SDKs directly, so we keep access to logprobs and structured outputs)

| provider | SDK | output constraint | confidence |
|---|---|---|---|
| `vllm` (local) | `openai.AsyncOpenAI(base_url=...)` | `response_format` json_schema (strict) | from `logprobs` / `top_logprobs=5` |
| `openai_compatible` (cloud) | same | same | when `supports_logprobs` |
| `anthropic` (cloud) | `anthropic.AsyncAnthropic` | `output_config.format` json_schema, `effort` (no temperature) | none, so the ticket escalates with `no_confidence` by default |
| `mock` | none (offline) | same JSON shape, fake token logprobs | yes (fake) |

**Mock (dev only).** The mock provider is a deterministic keyword and regex classifier for Iraqi Arabic and Arabizi. It extracts TX/receipt references, amounts (`٥٠ الف`, `50 alf`, `ربع مليون`, number words) and relative dates, sets flags, writes a templated Iraqi-dialect draft, and emits fake logprobs. It is not a model. Its output goes through exactly the same parsing, confidence and check code as a real model.

**Cloud guard.** A cloud model (anthropic or openai_compatible) only processes tickets that are `is_synthetic` (uploaded), unless `allow_cloud_for_live_tickets` is on. Re-triage returns 400; a batch skips the ticket and records the reason in `batch.error`.

To serve the local Qwen models and register them in the admin UI, see [`../docs/vllm.md`](../docs/vllm.md).

## Pipeline (`app/services/pipeline.py`)

1. Build the system prompt from `app/prompts/{prompt_version}.md`, filling `{created_at}` in Iraq time (+03:00). The user message is the ticket text, which is treated as data only.
2. Call the model with JSON-schema constrained output. `category` comes first, so its tokens are generated first.
3. Parse and validate with Pydantic (`TriageOutput`). If the output is invalid, retry `max_retries` times; after that, escalate with `model_error`.
4. Compute confidence as exp(sum of the logprobs of the tokens that overlap the category value). `category_probs` come from the top_logprobs at the first value token (`services/confidence.py`).
5. Run the checks (`services/checks.py`): `schema`, `grounding` (any ref, amount_text or date_text that is not a substring of the text is set to null and the check fails), `confidence`, `single_issue`.
6. Route the ticket to the team from the routing table, with priority = max(model priority, rule default). Or escalate it with the first failing reason, in this order: model_error, instruction_in_text, mixed_issue, ambiguous_category, grounding_failed, no_confidence, low_confidence.
7. Store everything in `triages`. Server logs get one line per triage, with phone numbers masked (`logging_utils.py`).

Batches run in-process with asyncio and `Semaphore(batch_concurrency)`, one DB session per ticket. Their counters update live. When uploaded tickets carry gold labels, the batch also computes an evaluation: accuracy, macro F1, per-category P/R/F1, field exact match, invented refs, escalation agreement and top confusions.

## Layout

```
app/
  main.py config.py db.py models.py (tables) schemas.py (API + TriageOutput) deps.py security.py
  enums.py (enums + labels for /api/meta) logging_utils.py serializers.py seed.py
  routers/   auth meta users teams routing models settings stats tickets batches export health
  services/  pipeline checks confidence routing batches evaluation upload export
  llm/       base openai_compat anthropic_provider mock factory
  prompts/   triage_v1.md
tests/       confidence, checks/grounding, pipeline (mock + fake providers), API flows
```

Note for Windows: some machines block SQLAlchemy's unsigned compiled extension (Smart App Control / WDAC). `app/__init__.py` sets `DISABLE_SQLALCHEMY_CEXT_RUNTIME=1` on Windows, which makes SQLAlchemy use its pure-Python fallback.
