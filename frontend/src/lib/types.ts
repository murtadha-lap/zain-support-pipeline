// Mirrors docs/api-contract.md. Change the contract first, then this file.

export type Role = "customer" | "agent" | "team_member" | "admin"
export type Category =
  | "failed_transfer"
  | "wrong_recipient"
  | "login_problem"
  | "agent_dispute"
  | "card_issue"
  | "topup_balance"
  | "bill_payment"
  | "suspected_fraud"
  | "general_question"
export type Priority = "high" | "medium" | "low"
export type Channel = "app" | "whatsapp" | "telegram"
export type Flag =
  | "missing_reference"
  | "amount_unit_inferred"
  | "mixed_issue"
  | "instruction_in_text"
  | "ambiguous_category"
  | "money_already_gone"
export type TicketStatus = "new" | "processing" | "routed" | "escalated" | "resolved" | "closed"
export type EscalationReason =
  | "low_confidence"
  | "no_confidence"
  | "mixed_issue"
  | "instruction_in_text"
  | "ambiguous_category"
  | "grounding_failed"
  | "model_error"
  | "manual"
export type Provider = "vllm" | "openai_compatible" | "anthropic" | "mock"
export type CheckName = "schema" | "grounding" | "confidence" | "single_issue"
export type DecisionAction =
  | "relabel"
  | "route"
  | "approve"
  | "escalate"
  | "close"
  | "retriage"
  | "assign"
  | "reopen"
  | "draft_saved"
export type BatchStatus = "queued" | "running" | "completed" | "failed"

export interface Option<K extends string = string> {
  key: K
  label: string
  label_ar?: string
  description?: string
  is_cloud?: boolean
}

export interface Meta {
  categories: Option<Category>[]
  priorities: Option<Priority>[]
  channels: Option<Channel>[]
  flags: Option<Flag>[]
  statuses: Option<TicketStatus>[]
  escalation_reasons: Option<EscalationReason>[]
  roles: Option<Role>[]
  providers: Option<Provider>[]
}

export interface User {
  id: number
  email: string
  full_name: string
  role: Role
  team_key: string | null
  team_name: string | null
  is_active: boolean
  created_at: string
}

export interface Team {
  key: string
  name: string
  name_ar: string
  description: string
  color: string
  member_count: number
  open_tickets: number
}

export interface RoutingRule {
  category: Category
  team_key: string
  default_priority: Priority
}

export interface ModelConfig {
  id: number
  name: string
  provider: Provider
  model_id: string
  base_url: string | null
  api_key_env: string | null
  has_api_key: boolean
  is_cloud: boolean
  supports_logprobs: boolean
  temperature: number | null
  max_tokens: number
  timeout_s: number
  effort: "low" | "medium" | "high" | null
  use_fallbacks: boolean
  enabled: boolean
  is_default: boolean
  notes: string
  created_at: string
  updated_at: string
}

export type ModelConfigInput = Omit<
  ModelConfig,
  "id" | "created_at" | "updated_at" | "has_api_key" | "is_cloud" | "is_default"
>

export interface Settings {
  confidence_threshold: number
  prompt_version: string
  escalate_without_confidence: boolean
  auto_triage: boolean
  allow_cloud_for_live_tickets: boolean
  max_retries: number
  batch_concurrency: number
}

export interface ExtractedFields {
  transaction_ref: string | null
  amount_iqd: number | null
  amount_text: string | null
  date: string | null
  date_text: string | null
}

export interface Check {
  name: CheckName
  passed: boolean | null
  detail: string
}

export interface Triage {
  id: number
  ticket_id: number
  model_config_id: number | null
  model_name: string
  model_id: string
  provider: Provider
  prompt_version: string
  threshold: number
  category: Category | null
  secondary_category: Category | null
  priority: Priority | null
  fields: ExtractedFields
  flags: Flag[]
  draft_reply: string
  confidence: number | null
  category_probs: Partial<Record<Category, number>> | null
  checks: Check[]
  decision: "routed" | "escalated"
  escalation_reason: EscalationReason | null
  latency_ms: number
  tokens_in: number | null
  tokens_out: number | null
  raw_output: string | null
  error: string | null
  created_at: string
}

export interface Message {
  id: number
  ticket_id: number
  author_type: "customer" | "staff" | "system"
  author_name: string
  body_md: string
  created_at: string
}

export interface Decision {
  id: number
  ticket_id: number
  user_id: number | null
  user_name: string
  user_role: Role | null
  action: DecisionAction
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  draft_edited: boolean | null
  note: string
  created_at: string
}

export interface TicketListItem {
  id: number
  ref: string
  channel: Channel
  text_preview: string
  status: TicketStatus
  category: Category | null
  priority: Priority | null
  team_key: string | null
  team_name: string | null
  confidence: number | null
  escalation_reason: EscalationReason | null
  flags: Flag[]
  customer_name: string | null
  assignee_id: number | null
  assignee_name: string | null
  is_synthetic: boolean
  message_count: number
  created_at: string
  updated_at: string
}

export interface TicketDetail extends TicketListItem {
  text: string
  secondary_category: Category | null
  fields: ExtractedFields
  escalation_note: string | null
  draft_md: string
  ai_draft: string
  customer: { id: number; full_name: string; email: string } | null
  triage: Triage | null
  triage_history: Triage[]
  messages: Message[]
  decisions: Decision[]
  gold: Record<string, unknown> | null
  batch_id: number | null
  triaged_at: string | null
  resolved_at: string | null
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface BatchEval {
  n: number
  category_accuracy: number
  macro_f1: number
  field_exact: number
  invented_refs: number
  escalation_agreement: number
  confusions: { gold: Category; predicted: Category; count: number }[]
  per_category: { category: Category; precision: number; recall: number; f1: number; support: number }[]
}

export interface Batch {
  id: number
  name: string
  model_config_id: number
  model_name: string
  status: BatchStatus
  source: "live" | "upload"
  total: number
  processed: number
  routed: number
  escalated: number
  failed: number
  avg_confidence: number | null
  per_team: Record<string, number>
  escalation_reasons: Record<string, number>
  eval: BatchEval | null
  error: string | null
  created_by_name: string
  created_at: string
  started_at: string | null
  finished_at: string | null
  duration_s: number | null
}

export interface Overview {
  tickets_total: number
  by_status: Partial<Record<TicketStatus, number>>
  by_category: Partial<Record<Category, number>>
  by_team: Record<string, number>
  by_priority: Partial<Record<Priority, number>>
  escalation_rate: number
  avg_confidence: number | null
  auto_routed_accuracy: number | null
  drafts_sent_unedited_rate: number | null
  median_resolution_s: number | null
  daily: { date: string; created: number; resolved: number; escalated: number }[]
  confidence_histogram: { bucket: string; count: number }[]
  recent_batches: Batch[]
}

export interface MyStats {
  escalated_open: number
  team_open: number
  assigned_to_me: number
  resolved_today: number
  new_waiting: number
}

export interface ModelTestResult {
  ok: boolean
  latency_ms: number
  message: string
  triage: Triage | null
}

export interface TicketQuery {
  status?: string
  category?: string
  priority?: string
  team_key?: string
  escalation_reason?: string
  assignee?: string
  q?: string
  is_synthetic?: boolean
  sort?: string
  page?: number
  page_size?: number
}
