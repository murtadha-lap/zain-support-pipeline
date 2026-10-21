"""Pydantic v2 request/response models (separate from the SQLModel tables)."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .enums import (
    BatchStatus,
    Category,
    Channel,
    CheckName,
    DecisionAction,
    EscalationReason,
    Flag,
    Priority,
    Provider,
    Role,
    TicketStatus,
)

T = TypeVar("T")


class APIModel(BaseModel):
    model_config = ConfigDict(protected_namespaces=(), from_attributes=True)


# --------------------------------------------------------------------------- model output

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class ExtractedFields(APIModel):
    model_config = ConfigDict(protected_namespaces=(), from_attributes=True, extra="forbid")

    transaction_ref: str | None = None
    amount_iqd: int | None = None
    amount_text: str | None = None
    date: str | None = None
    date_text: str | None = None

    @field_validator("date")
    @classmethod
    def _check_date(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not _DATE_RE.match(v):
            raise ValueError("date must be YYYY-MM-DD")
        datetime.strptime(v, "%Y-%m-%d")
        return v

    @field_validator("amount_iqd")
    @classmethod
    def _check_amount(cls, v: int | None) -> int | None:
        if v is not None and v < 0:
            raise ValueError("amount_iqd must be >= 0")
        return v


class TriageOutput(BaseModel):
    """What the model must return. `category` is FIRST so its tokens are generated first."""

    model_config = ConfigDict(extra="forbid")

    category: Category
    secondary_category: Category | None
    priority: Priority
    fields: ExtractedFields
    flags: list[Flag]
    draft_reply: str


def _nullable(schema: dict) -> dict:
    return {"anyOf": [schema, {"type": "null"}]}


def triage_json_schema() -> dict:
    """Strict JSON schema for constrained decoding (vLLM / OpenAI strict / Anthropic structured outputs).

    Every object has `additionalProperties: false` and lists all keys in `required`; key order puts
    `category` first.
    """
    cats = [c.value for c in Category]
    return {
        "type": "object",
        "properties": {
            "category": {"type": "string", "enum": cats},
            "secondary_category": _nullable({"type": "string", "enum": cats}),
            "priority": {"type": "string", "enum": [p.value for p in Priority]},
            "fields": {
                "type": "object",
                "properties": {
                    "transaction_ref": _nullable({"type": "string"}),
                    "amount_iqd": _nullable({"type": "integer"}),
                    "amount_text": _nullable({"type": "string"}),
                    "date": _nullable({"type": "string"}),
                    "date_text": _nullable({"type": "string"}),
                },
                "required": ["transaction_ref", "amount_iqd", "amount_text", "date", "date_text"],
                "additionalProperties": False,
            },
            "flags": {"type": "array", "items": {"type": "string", "enum": [f.value for f in Flag]}},
            "draft_reply": {"type": "string"},
        },
        "required": ["category", "secondary_category", "priority", "fields", "flags", "draft_reply"],
        "additionalProperties": False,
    }


# --------------------------------------------------------------------------- generic

class Page(APIModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class OkResponse(APIModel):
    ok: bool = True


# --------------------------------------------------------------------------- auth / users

class LoginIn(BaseModel):
    email: str
    password: str


class RegisterIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)


class UserOut(APIModel):
    id: int
    email: str
    full_name: str
    role: Role
    team_key: str | None
    team_name: str | None
    is_active: bool
    created_at: datetime


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: Role
    team_key: str | None = None


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    role: Role | None = None
    team_key: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


# --------------------------------------------------------------------------- meta

class MetaItem(APIModel):
    key: str
    label: str
    label_ar: str | None = None
    description: str | None = None
    is_cloud: bool | None = None


class MetaOut(APIModel):
    model_config = ConfigDict(protected_namespaces=(), from_attributes=True)

    categories: list[dict]
    priorities: list[dict]
    channels: list[dict]
    flags: list[dict]
    statuses: list[dict]
    escalation_reasons: list[dict]
    roles: list[dict]
    providers: list[dict]


# --------------------------------------------------------------------------- teams / routing

class TeamOut(APIModel):
    key: str
    name: str
    name_ar: str
    description: str
    color: str
    member_count: int
    open_tickets: int


class TeamCreate(BaseModel):
    key: str = Field(min_length=2, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")
    name: str = Field(min_length=1, max_length=255)
    name_ar: str = Field(min_length=1, max_length=255)
    description: str = ""
    color: str = Field(default="#64748b", pattern=r"^#[0-9a-fA-F]{6}$")


class TeamUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    name_ar: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


class RoutingRuleIO(APIModel):
    category: Category
    team_key: str
    default_priority: Priority


# --------------------------------------------------------------------------- models

class ModelConfigOut(APIModel):
    id: int
    name: str
    provider: Provider
    model_id: str
    base_url: str | None
    api_key_env: str | None
    has_api_key: bool
    is_cloud: bool
    supports_logprobs: bool
    temperature: float | None
    max_tokens: int
    timeout_s: float
    effort: Literal["low", "medium", "high"] | None
    use_fallbacks: bool
    enabled: bool
    is_default: bool
    notes: str
    created_at: datetime
    updated_at: datetime


class ModelConfigCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    name: str = Field(min_length=1, max_length=255)
    provider: Provider
    model_id: str = Field(min_length=1, max_length=255)
    base_url: str | None = None
    api_key_env: str | None = None
    supports_logprobs: bool = False
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_tokens: int = Field(default=1024, ge=16, le=32000)
    timeout_s: float = Field(default=60, gt=0, le=600)
    effort: Literal["low", "medium", "high"] | None = None
    use_fallbacks: bool = False
    enabled: bool = True
    is_default: bool = False
    notes: str = ""


class ModelConfigUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    name: str | None = Field(default=None, min_length=1, max_length=255)
    provider: Provider | None = None
    model_id: str | None = Field(default=None, min_length=1, max_length=255)
    base_url: str | None = None
    api_key_env: str | None = None
    supports_logprobs: bool | None = None
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=16, le=32000)
    timeout_s: float | None = Field(default=None, gt=0, le=600)
    effort: Literal["low", "medium", "high"] | None = None
    use_fallbacks: bool | None = None
    enabled: bool | None = None
    is_default: bool | None = None
    notes: str | None = None


class ModelTestIn(BaseModel):
    text: str | None = Field(default=None, max_length=4000)


# --------------------------------------------------------------------------- settings

class SettingsOut(APIModel):
    confidence_threshold: float
    prompt_version: str
    escalate_without_confidence: bool
    auto_triage: bool
    allow_cloud_for_live_tickets: bool
    max_retries: int
    batch_concurrency: int


class SettingsUpdate(BaseModel):
    confidence_threshold: float | None = Field(default=None, ge=0, le=1)
    prompt_version: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_.-]{1,64}$")
    escalate_without_confidence: bool | None = None
    auto_triage: bool | None = None
    allow_cloud_for_live_tickets: bool | None = None
    max_retries: int | None = Field(default=None, ge=0, le=5)
    batch_concurrency: int | None = Field(default=None, ge=1, le=64)


# --------------------------------------------------------------------------- triage / tickets

class CheckOut(APIModel):
    name: CheckName
    passed: bool | None
    detail: str


class TriageOut(APIModel):
    id: int
    ticket_id: int
    model_config_id: int | None
    model_name: str
    model_id: str
    provider: Provider
    prompt_version: str
    threshold: float
    category: Category | None
    secondary_category: Category | None
    priority: Priority | None
    fields: ExtractedFields
    flags: list[Flag]
    draft_reply: str
    confidence: float | None
    category_probs: dict[str, float] | None
    checks: list[CheckOut]
    decision: Literal["routed", "escalated"]
    escalation_reason: EscalationReason | None
    latency_ms: int
    tokens_in: int | None
    tokens_out: int | None
    raw_output: str | None
    error: str | None
    created_at: datetime


class MessageOut(APIModel):
    id: int
    ticket_id: int
    author_type: Literal["customer", "staff", "system"]
    author_name: str
    body_md: str
    created_at: datetime


class DecisionOut(APIModel):
    id: int
    ticket_id: int
    user_id: int | None
    user_name: str
    user_role: Role | None
    action: DecisionAction
    before: dict | None
    after: dict | None
    draft_edited: bool | None
    note: str
    created_at: datetime


class TicketListItem(APIModel):
    id: int
    ref: str
    channel: Channel
    text_preview: str
    status: TicketStatus
    category: Category | None
    priority: Priority | None
    team_key: str | None
    team_name: str | None
    confidence: float | None
    escalation_reason: EscalationReason | None
    flags: list[Flag]
    customer_name: str | None
    assignee_id: int | None
    assignee_name: str | None
    is_synthetic: bool
    message_count: int
    created_at: datetime
    updated_at: datetime


class CustomerRef(APIModel):
    id: int
    full_name: str
    email: str


class TicketDetail(TicketListItem):
    text: str
    secondary_category: Category | None
    fields: ExtractedFields
    escalation_note: str | None
    draft_md: str
    ai_draft: str
    customer: CustomerRef | None
    triage: TriageOut | None
    triage_history: list[TriageOut]
    messages: list[MessageOut]
    decisions: list[DecisionOut]
    gold: dict | None
    batch_id: int | None
    triaged_at: datetime | None
    resolved_at: datetime | None


class TicketCreate(BaseModel):
    text: str = Field(min_length=5, max_length=4000)
    channel: Channel = Channel.app


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class DraftIn(BaseModel):
    draft_md: str = Field(max_length=8000)


class FieldsPatch(BaseModel):
    transaction_ref: str | None = None
    amount_iqd: int | None = Field(default=None, ge=0)
    amount_text: str | None = None
    date: str | None = None
    date_text: str | None = None

    @field_validator("date")
    @classmethod
    def _check_date(cls, v: str | None) -> str | None:
        if v is not None:
            if not _DATE_RE.match(v):
                raise ValueError("date must be YYYY-MM-DD")
            datetime.strptime(v, "%Y-%m-%d")
        return v


class LabelsIn(BaseModel):
    category: Category | None = None
    secondary_category: Category | None = None
    priority: Priority | None = None
    fields: FieldsPatch | None = None
    note: str = ""


class RouteIn(BaseModel):
    team_key: str | None = None
    note: str = ""


class ApproveIn(BaseModel):
    draft_md: str = Field(max_length=8000)
    note: str = ""


class EscalateIn(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


class CloseIn(BaseModel):
    note: str = ""


class AssignIn(BaseModel):
    user_id: int | None


class RetriageIn(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_config_id: int | None = None


class ModelTestOut(APIModel):
    ok: bool
    latency_ms: int
    message: str
    triage: TriageOut | None


# --------------------------------------------------------------------------- batches / stats

class ConfusionOut(APIModel):
    gold: Category
    predicted: Category
    count: int


class PerCategoryOut(APIModel):
    category: Category
    precision: float
    recall: float
    f1: float
    support: int


class EvalOut(APIModel):
    n: int
    category_accuracy: float
    macro_f1: float
    field_exact: float
    invented_refs: int
    escalation_agreement: float
    confusions: list[ConfusionOut]
    per_category: list[PerCategoryOut]


class BatchOut(APIModel):
    id: int
    name: str
    model_config_id: int
    model_name: str
    status: BatchStatus
    source: Literal["live", "upload"]
    total: int
    processed: int
    routed: int
    escalated: int
    failed: int
    avg_confidence: float | None
    per_team: dict[str, int]
    escalation_reasons: dict[str, int]
    eval: EvalOut | None
    error: str | None
    created_by_name: str
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    duration_s: float | None


class BatchCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    name: str | None = None
    model_config_id: int | None = None
    ticket_ids: list[int] | None = None
    statuses: list[TicketStatus] | None = None


class DailyPoint(APIModel):
    date: str
    created: int
    resolved: int
    escalated: int


class HistogramBucket(APIModel):
    bucket: str
    count: int


class OverviewOut(APIModel):
    tickets_total: int
    by_status: dict[str, int]
    by_category: dict[str, int]
    by_team: dict[str, int]
    by_priority: dict[str, int]
    escalation_rate: float
    avg_confidence: float | None
    auto_routed_accuracy: float | None
    drafts_sent_unedited_rate: float | None
    median_resolution_s: float | None
    daily: list[DailyPoint]
    confidence_histogram: list[HistogramBucket]
    recent_batches: list[BatchOut]


class MyStatsOut(APIModel):
    escalated_open: int
    team_open: int
    assigned_to_me: int
    resolved_today: int
    new_waiting: int


class HealthModel(APIModel):
    id: int
    name: str
    provider: str
    reachable: bool | None


class HealthOut(APIModel):
    status: str
    db: str
    models: list[HealthModel]


JSONDict = dict[str, Any]
