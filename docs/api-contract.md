# API contract (backend ⇄ frontend)

This file is the single source of truth for the HTTP API. Backend (`backend/`, FastAPI) implements it; frontend (`frontend/`, Next.js) consumes it. If you change a shape, change it here first.

* Base path: every route is under `/api`. The frontend calls relative `/api/...`; Next.js rewrites `/api/:path*` to `${BACKEND_URL}/api/:path*` (default `http://localhost:8000`), so the browser sees one origin.
* JSON everywhere, `snake_case` keys, ISO-8601 datetimes with timezone (UTC, `Z`), dates `YYYY-MM-DD`.
* Auth: `POST /api/auth/login` sets an **httpOnly cookie `zsp_token`** (JWT, `SameSite=Lax`, `Path=/`, 7 days). Every other call sends it automatically. The backend also accepts `Authorization: Bearer <jwt>` (for scripts/tests).
* Errors: FastAPI default `{"detail": "message"}` (string) with 400/401/403/404/409; 422 validation errors keep FastAPI's list format. 401 = not logged in, 403 = wrong role.
* Pagination: `?page=1&page_size=25` (max 100) → `{"items": [...], "total": int, "page": int, "page_size": int}`.

## Enums

| name | values |
|---|---|
| `Role` | `customer`, `agent` (human reviewer of escalated / not-sure tickets), `team_member` (works a team's queue), `admin` |
| `Category` | `failed_transfer`, `wrong_recipient`, `login_problem`, `agent_dispute`, `card_issue`, `topup_balance`, `bill_payment`, `suspected_fraud`, `general_question` |
| `Priority` | `high`, `medium`, `low` |
| `Channel` | `app`, `whatsapp`, `telegram` |
| `Flag` | `missing_reference`, `amount_unit_inferred`, `mixed_issue`, `instruction_in_text`, `ambiguous_category`, `money_already_gone` |
| `TicketStatus` | `new` (waiting for triage), `processing` (model running), `routed` (passed all checks → team queue), `escalated` (needs a human agent), `resolved` (reply sent), `closed` (closed without reply) |
| `EscalationReason` | `low_confidence`, `no_confidence`, `mixed_issue`, `instruction_in_text`, `ambiguous_category`, `grounding_failed`, `model_error`, `manual` |
| `Provider` | `vllm` (local, OpenAI-compatible server), `openai_compatible` (cloud, any OpenAI-compatible API), `anthropic` (Claude API), `mock` (offline keyword classifier, dev/demo only) |
| `CheckName` | `schema`, `grounding`, `confidence`, `single_issue` |
| `DecisionAction` | `relabel`, `route`, `approve`, `escalate`, `close`, `retriage`, `assign`, `reopen`, `draft_saved` |
| `BatchStatus` | `queued`, `running`, `completed`, `failed` |

`GET /api/meta` (any logged-in user) returns all enums with labels so the UI never hard-codes them:

```json
{
  "categories": [{"key": "failed_transfer", "label": "Failed / stuck transfer", "label_ar": "حوالة فاشلة أو عالقة"}],
  "priorities": [{"key": "high", "label": "High"}],
  "channels": [{"key": "app", "label": "App"}],
  "flags": [{"key": "missing_reference", "label": "Missing reference", "description": "..."}],
  "statuses": [{"key": "new", "label": "New"}],
  "escalation_reasons": [{"key": "low_confidence", "label": "Low confidence", "description": "..."}],
  "roles": [{"key": "agent", "label": "Human agent"}],
  "providers": [{"key": "vllm", "label": "vLLM (local)", "is_cloud": false}]
}
```

## Objects

```ts
User = { id: number, email: string, full_name: string, role: Role, team_key: string | null,
         team_name: string | null, is_active: boolean, created_at: string }

Team = { key: string, name: string, name_ar: string, description: string, color: string /* hex */,
         member_count: number, open_tickets: number }

RoutingRule = { category: Category, team_key: string, default_priority: Priority }

ModelConfig = {
  id: number, name: string, provider: Provider, model_id: string,   // e.g. "zain-triage-lora" or "claude-opus-5-5"
  base_url: string | null,          // vllm / openai_compatible, e.g. "http://localhost:8001/v1"
  api_key_env: string | null,       // NAME of the env var holding the key (keys are never stored in the DB)
  has_api_key: boolean,             // env var is set on the server
  is_cloud: boolean,                // derived from provider
  supports_logprobs: boolean,       // true for vllm; confidence is null without it
  temperature: number | null, max_tokens: number, timeout_s: number,
  effort: "low" | "medium" | "high" | null,   // anthropic only
  use_fallbacks: boolean,           // anthropic only: server-side refusal fallback
  enabled: boolean, is_default: boolean, notes: string,
  created_at: string, updated_at: string
}

Settings = {
  confidence_threshold: number,       // 0..1, chosen on the validation split
  prompt_version: string,             // e.g. "triage_v1"
  escalate_without_confidence: boolean, // model without logprobs → escalate (default true)
  auto_triage: boolean,               // triage new customer tickets immediately with the default model
  allow_cloud_for_live_tickets: boolean, // default false: cloud models only run on uploaded/synthetic tickets
  max_retries: number,                // retries on invalid model output, default 1
  batch_concurrency: number           // parallel model calls per batch, default 8
}

ExtractedFields = { transaction_ref: string | null, amount_iqd: number | null, amount_text: string | null,
                    date: string | null, date_text: string | null }

Check = { name: CheckName, passed: boolean | null /* null = not applicable */, detail: string }

Triage = {
  id: number, ticket_id: number, model_config_id: number | null, model_name: string, model_id: string,
  provider: Provider, prompt_version: string, threshold: number,
  category: Category | null, secondary_category: Category | null, priority: Priority | null,
  fields: ExtractedFields, flags: Flag[], draft_reply: string,
  confidence: number | null,                       // P(category tokens) from logprobs
  category_probs: Record<Category, number> | null, // top alternatives when available
  checks: Check[], decision: "routed" | "escalated", escalation_reason: EscalationReason | null,
  latency_ms: number, tokens_in: number | null, tokens_out: number | null,
  raw_output: string | null,   // only for agent/admin
  error: string | null, created_at: string
}

Message = { id: number, ticket_id: number, author_type: "customer" | "staff" | "system",
            author_name: string, body_md: string, created_at: string }

Decision = { id: number, ticket_id: number, user_id: number | null, user_name: string, user_role: Role | null,
             action: DecisionAction, before: object | null, after: object | null,
             draft_edited: boolean | null, note: string, created_at: string }

TicketListItem = {
  id: number, ref: string,            // "ZS-000042"
  channel: Channel, text_preview: string, status: TicketStatus,
  category: Category | null, priority: Priority | null, team_key: string | null, team_name: string | null,
  confidence: number | null, escalation_reason: EscalationReason | null,
  flags: Flag[], customer_name: string | null, assignee_id: number | null, assignee_name: string | null,
  is_synthetic: boolean, message_count: number,
  created_at: string, updated_at: string
}

TicketDetail = TicketListItem & {
  text: string,                       // full customer message (Arabic, Arabizi, mixed)
  secondary_category: Category | null,
  fields: ExtractedFields,            // current (human-corrected if relabelled)
  escalation_note: string | null,
  draft_md: string,                   // current working draft (starts as the AI draft)
  ai_draft: string,                   // untouched AI draft of the latest triage
  customer: { id: number, full_name: string, email: string } | null,
  triage: Triage | null,              // latest
  triage_history: Triage[],           // newest first
  messages: Message[],                // oldest first (customer message is NOT duplicated here)
  decisions: Decision[],              // newest first
  gold: object | null,                // labels from an uploaded dataset row, admin/agent only
  batch_id: number | null, triaged_at: string | null, resolved_at: string | null
}
```

For `customer` callers the backend returns `TicketDetail` with `triage = null`, `triage_history = []`, `decisions = []`, `gold = null`, `draft_md = ""`, `ai_draft = ""`, `confidence = null`, `flags = []`, `escalation_reason = null`; status is shown as is.

```ts
Batch = {
  id: number, name: string, model_config_id: number, model_name: string, status: BatchStatus,
  source: "live" | "upload", total: number, processed: number, routed: number, escalated: number, failed: number,
  avg_confidence: number | null, per_team: Record<string, number>, escalation_reasons: Record<string, number>,
  eval: null | {              // present when tickets carry gold labels (uploaded dataset rows)
    n: number, category_accuracy: number, macro_f1: number, field_exact: number,
    invented_refs: number, escalation_agreement: number,
    confusions: { gold: Category, predicted: Category, count: number }[],   // top 10
    per_category: { category: Category, precision: number, recall: number, f1: number, support: number }[]
  },
  error: string | null, created_by_name: string, created_at: string,
  started_at: string | null, finished_at: string | null, duration_s: number | null
}
```

## Endpoints

Role column: who may call. `staff` = agent, team_member, admin.

### Auth

| method | path | role | body → response |
|---|---|---|---|
| POST | `/api/auth/login` | public | `{email, password}` → `User` (sets cookie) · 401 on bad credentials |
| POST | `/api/auth/register` | public | `{email, password (min 8), full_name}` → `User` (role `customer`, sets cookie) · 409 if email exists |
| POST | `/api/auth/logout` | any | → `{"ok": true}` (clears cookie) |
| GET | `/api/auth/me` | any | → `User` |

### Meta, settings, stats

| method | path | role | body → response |
|---|---|---|---|
| GET | `/api/meta` | any | → see Enums |
| GET | `/api/settings` | staff | → `Settings` |
| PUT | `/api/settings` | admin | partial `Settings` → `Settings` |
| GET | `/api/stats/overview` | admin | → `Overview` (below) |
| GET | `/api/stats/me` | staff | → `{escalated_open, team_open, assigned_to_me, resolved_today, new_waiting}` (numbers) |

```ts
Overview = {
  tickets_total: number, by_status: Record<TicketStatus, number>, by_category: Record<Category, number>,
  by_team: Record<string, number>, by_priority: Record<Priority, number>,
  escalation_rate: number, avg_confidence: number | null,
  auto_routed_accuracy: number | null,   // routed tickets later approved without relabel / all routed+resolved
  drafts_sent_unedited_rate: number | null,
  median_resolution_s: number | null,
  daily: { date: string, created: number, resolved: number, escalated: number }[],  // last 14 days
  confidence_histogram: { bucket: string, count: number }[],  // "0.0-0.1" ... "0.9-1.0"
  recent_batches: Batch[]   // last 5
}
```

### Users (admin)

| method | path | body → response |
|---|---|---|
| GET | `/api/users?role=&q=&team_key=` | → `User[]` |
| POST | `/api/users` | `{email, full_name, password, role, team_key?}` → `User` · `team_key` required when role is `team_member` |
| PATCH | `/api/users/{id}` | `{full_name?, role?, team_key?, is_active?, password?}` → `User` |
| DELETE | `/api/users/{id}` | → `{"ok": true}` (soft: sets `is_active=false`; an admin cannot deactivate themselves) |

### Teams and routing

| method | path | role | body → response |
|---|---|---|---|
| GET | `/api/teams` | staff | → `Team[]` |
| POST | `/api/teams` | admin | `{key, name, name_ar, description?, color?}` → `Team` |
| PATCH | `/api/teams/{key}` | admin | `{name?, name_ar?, description?, color?}` → `Team` |
| DELETE | `/api/teams/{key}` | admin | → `{"ok": true}` · 409 if a routing rule or user still uses it |
| GET | `/api/routing` | staff | → `RoutingRule[]` (always 9, one per category) |
| PUT | `/api/routing` | admin | `RoutingRule[]` (all 9) → `RoutingRule[]` |

Seed teams (key → routing): `transfers` (failed_transfer high, wrong_recipient high), `accounts` (login_problem medium), `agent_network` (agent_dispute medium), `cards` (card_issue medium), `payments` (topup_balance medium, bill_payment medium), `security` (suspected_fraud high), `general_support` (general_question low).

### Models (admin)

| method | path | body → response |
|---|---|---|
| GET | `/api/models` | → `ModelConfig[]` (staff may call; used by the re-triage menu) |
| POST | `/api/models` | `ModelConfig` without id/timestamps/derived fields → `ModelConfig` |
| PATCH | `/api/models/{id}` | partial → `ModelConfig` |
| DELETE | `/api/models/{id}` | → `{"ok": true}` · 409 if it is the default |
| POST | `/api/models/{id}/default` | → `ModelConfig` (unsets the previous default) |
| POST | `/api/models/{id}/test` | `{text?}` (default: a built-in sample ticket) → `{ok: boolean, latency_ms: number, message: string, triage: Triage | null}` (not saved) |

### Tickets

| method | path | role | body → response |
|---|---|---|---|
| POST | `/api/tickets` | customer | `{text (5..4000 chars), channel?}` → `TicketDetail` (auto-triage runs in background when enabled) |
| GET | `/api/tickets` | any | query: `status` (comma list), `category`, `priority`, `team_key`, `escalation_reason`, `assignee` (`me`, `none` for unassigned, or a user id), `q` (text / ref search), `is_synthetic`, `sort` (`-created_at` default, `created_at`, `-priority`, `confidence`), `page`, `page_size` → `Page<TicketListItem>`. Scope: customer → own; team_member → tickets of own team; agent/admin → all |
| GET | `/api/tickets/{id}` | any (scoped) | → `TicketDetail` |
| POST | `/api/tickets/{id}/messages` | customer (own) | `{body}` → `TicketDetail` · reopens a resolved/closed ticket (`routed` if it has a team, else `new`) |
| PUT | `/api/tickets/{id}/draft` | staff | `{draft_md}` → `TicketDetail` (autosave; logs at most one `draft_saved` decision per user per minute) |
| PATCH | `/api/tickets/{id}/labels` | agent, admin, team_member (own team; cannot change category) | `{category?, secondary_category?, priority?, fields?, note?}` → `TicketDetail` (`relabel` decision; team follows routing table if category changed and status is routed) |
| POST | `/api/tickets/{id}/route` | agent, admin | `{team_key?, note?}` (default: team from routing table) → `TicketDetail` (status `routed`) |
| POST | `/api/tickets/{id}/approve` | agent, admin, team_member (own team) | `{draft_md, note?}` → `TicketDetail` (adds staff `Message`, status `resolved`, `approve` decision with `draft_edited`) · 400 if ticket is `new`/`processing` or draft empty |
| POST | `/api/tickets/{id}/escalate` | team_member, admin | `{note}` → `TicketDetail` (status `escalated`, reason `manual`) |
| POST | `/api/tickets/{id}/close` | staff | `{note?}` → `TicketDetail` |
| POST | `/api/tickets/{id}/assign` | staff | `{user_id: number | null}` (`null` = unassign; agents/team may only assign themselves) → `TicketDetail` |
| POST | `/api/tickets/{id}/retriage` | agent, admin | `{model_config_id?}` → `TicketDetail` (runs synchronously, new `Triage` row) |

Nothing is ever sent to a customer without a human calling `approve`.

### Batches (admin)

| method | path | body → response |
|---|---|---|
| GET | `/api/batches` | → `Batch[]` (newest first) |
| GET | `/api/batches/{id}` | → `Batch` (poll every 2 s while `queued`/`running`) |
| POST | `/api/batches` | `{name?, model_config_id?, ticket_ids?: number[], statuses?: TicketStatus[] (default ["new"])}` → `Batch` (runs in background) |
| POST | `/api/batches/upload` | multipart: `file` (`.jsonl`, `.json` array, or `.csv` with column `text`, optional `channel`, `created_at`, `customer_email`; dataset rows in `schemas/ticket.schema.json` format keep their `labels` as gold), `model_config_id?`, `name?`, `run` (`true`/`false`, default true) → `Batch` (tickets are marked `is_synthetic=true`, source `upload`) |
| GET | `/api/batches/{id}/tickets` | → `Page<TicketListItem>` |

### Export (admin)

| method | path | response |
|---|---|---|
| GET | `/api/export/corrections.jsonl` | JSONL of resolved tickets in `schemas/ticket.schema.json` format, labels = human-confirmed final labels, `draft_reply` = text actually sent, `meta.source = "human"`, `meta.split = "train"` |
| GET | `/api/export/tickets.csv` | all tickets with final labels, status, team, confidence, escalation reason |

## Pipeline (what happens to one ticket)

1. Build messages: system prompt `backend/app/prompts/{prompt_version}.md` with `{created_at}` filled, user message = ticket text (data only, never instructions).
2. Call the model with JSON-schema constrained output (`model_output_schema`: `category` first, then `secondary_category, priority, fields, flags, draft_reply`). vLLM / OpenAI-compatible: `response_format={"type": "json_schema", ...}`, `logprobs=True, top_logprobs=5`. Anthropic: `output_config.format` json_schema, `effort` from config, no temperature.
3. Parse + validate (Pydantic). Invalid → retry `max_retries` times → else escalate `model_error`.
4. Confidence: `exp(sum of logprobs of the tokens forming the category value)`; `category_probs` from top_logprobs at the first value token. `null` when the provider gives no logprobs.
5. Checks (code, not model):
   * `schema` — output parsed and valid.
   * `grounding` — `transaction_ref`, `amount_text`, `date_text` must be substrings of the ticket text; an ungrounded value is set to null and the check fails.
   * `confidence` — `confidence >= threshold`; `passed = null` when there is no confidence (then fails only if `escalate_without_confidence`).
   * `single_issue` — fails on `mixed_issue`, `instruction_in_text` or `ambiguous_category` flags, or a non-null `secondary_category`.
6. All checks pass → `routed` to the team from the routing table, priority = max(model priority, rule default), `draft_md = draft_reply`. Any check fails → `escalated` with the first failing reason (order: model_error, instruction_in_text, mixed_issue, ambiguous_category, grounding_failed, no_confidence, low_confidence); draft kept if the model wrote one.
7. Everything is stored: model, prompt version, threshold, checks, raw output, latency. Phone numbers are masked in server logs.
