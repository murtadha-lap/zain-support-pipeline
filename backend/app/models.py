"""Database tables (SQLModel). API shapes live in schemas.py.

Portable across SQLite and PostgreSQL: JSON columns via sa_column=Column(JSON), no dialect-specific SQL.
All datetimes are stored as UTC.
"""
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, Column, Text
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """Aware UTC. SQLModel's UTCDateTime stores it as UTC (timestamptz on Postgres) and returns aware UTC."""
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=255)
    full_name: str = Field(default="", max_length=255)
    role: str = Field(default="customer", index=True, max_length=32)
    team_key: str | None = Field(default=None, index=True, max_length=64)
    password_hash: str = Field(max_length=255)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)


class Team(SQLModel, table=True):
    __tablename__ = "teams"

    key: str = Field(primary_key=True, max_length=64)
    name: str = Field(max_length=255)
    name_ar: str = Field(default="", max_length=255)
    description: str = Field(default="", sa_column=Column(Text, nullable=False, default=""))
    color: str = Field(default="#64748b", max_length=16)
    created_at: datetime = Field(default_factory=utcnow)


class RoutingRule(SQLModel, table=True):
    __tablename__ = "routing_rules"

    category: str = Field(primary_key=True, max_length=64)
    team_key: str = Field(max_length=64)
    default_priority: str = Field(max_length=16)


class ModelConfig(SQLModel, table=True):
    __tablename__ = "model_configs"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=255)
    provider: str = Field(max_length=32)
    model_id: str = Field(max_length=255)
    base_url: str | None = Field(default=None, max_length=512)
    api_key_env: str | None = Field(default=None, max_length=128)
    supports_logprobs: bool = Field(default=False)
    temperature: float | None = Field(default=None)
    max_tokens: int = Field(default=1024)
    timeout_s: float = Field(default=60)
    effort: str | None = Field(default=None, max_length=16)
    use_fallbacks: bool = Field(default=False)
    enabled: bool = Field(default=True)
    is_default: bool = Field(default=False)
    notes: str = Field(default="", sa_column=Column(Text, nullable=False, default=""))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Setting(SQLModel, table=True):
    __tablename__ = "settings"

    key: str = Field(primary_key=True, max_length=64)
    value: Any = Field(default=None, sa_column=Column(JSON))


class Ticket(SQLModel, table=True):
    __tablename__ = "tickets"

    id: int | None = Field(default=None, primary_key=True)
    customer_id: int | None = Field(default=None, foreign_key="users.id", index=True)
    channel: str = Field(default="app", max_length=16)
    text: str = Field(sa_column=Column(Text, nullable=False))
    status: str = Field(default="new", index=True, max_length=16)
    category: str | None = Field(default=None, index=True, max_length=64)
    secondary_category: str | None = Field(default=None, max_length=64)
    priority: str | None = Field(default=None, max_length=16)
    team_key: str | None = Field(default=None, index=True, max_length=64)
    fields: dict | None = Field(default=None, sa_column=Column(JSON))
    flags: list | None = Field(default=None, sa_column=Column(JSON))
    confidence: float | None = Field(default=None)
    escalation_reason: str | None = Field(default=None, max_length=32)
    escalation_note: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    draft_md: str = Field(default="", sa_column=Column(Text, nullable=False, default=""))
    ai_draft: str = Field(default="", sa_column=Column(Text, nullable=False, default=""))
    assignee_id: int | None = Field(default=None, index=True)
    is_synthetic: bool = Field(default=False)
    external_id: str | None = Field(default=None, max_length=64, index=True)
    gold: dict | None = Field(default=None, sa_column=Column(JSON))
    batch_id: int | None = Field(default=None, index=True)
    latest_triage_id: int | None = Field(default=None)
    triaged_at: datetime | None = Field(default=None)
    resolved_at: datetime | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)


class Triage(SQLModel, table=True):
    __tablename__ = "triages"

    id: int | None = Field(default=None, primary_key=True)
    ticket_id: int = Field(foreign_key="tickets.id", index=True)
    batch_id: int | None = Field(default=None, index=True)
    model_config_id: int | None = Field(default=None)
    model_name: str = Field(default="", max_length=255)
    model_id: str = Field(default="", max_length=255)
    provider: str = Field(default="", max_length=32)
    prompt_version: str = Field(default="", max_length=64)
    threshold: float = Field(default=0.8)
    category: str | None = Field(default=None, max_length=64)
    secondary_category: str | None = Field(default=None, max_length=64)
    priority: str | None = Field(default=None, max_length=16)
    fields: dict | None = Field(default=None, sa_column=Column(JSON))
    raw_fields: dict | None = Field(default=None, sa_column=Column(JSON))  # model fields before grounding
    flags: list | None = Field(default=None, sa_column=Column(JSON))
    draft_reply: str = Field(default="", sa_column=Column(Text, nullable=False, default=""))
    confidence: float | None = Field(default=None)
    category_probs: dict | None = Field(default=None, sa_column=Column(JSON))
    checks: list | None = Field(default=None, sa_column=Column(JSON))
    decision: str = Field(default="escalated", max_length=16)
    escalation_reason: str | None = Field(default=None, max_length=32)
    latency_ms: int = Field(default=0)
    tokens_in: int | None = Field(default=None)
    tokens_out: int | None = Field(default=None)
    raw_output: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    error: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(default_factory=utcnow)


class Message(SQLModel, table=True):
    __tablename__ = "messages"

    id: int | None = Field(default=None, primary_key=True)
    ticket_id: int = Field(foreign_key="tickets.id", index=True)
    author_type: str = Field(max_length=16)  # customer | staff | system
    author_id: int | None = Field(default=None)
    author_name: str = Field(default="", max_length=255)
    body_md: str = Field(sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(default_factory=utcnow)


class Decision(SQLModel, table=True):
    __tablename__ = "decisions"

    id: int | None = Field(default=None, primary_key=True)
    ticket_id: int = Field(foreign_key="tickets.id", index=True)
    user_id: int | None = Field(default=None, index=True)
    user_name: str = Field(default="", max_length=255)
    user_role: str | None = Field(default=None, max_length=32)
    action: str = Field(max_length=32, index=True)
    before: dict | None = Field(default=None, sa_column=Column(JSON))
    after: dict | None = Field(default=None, sa_column=Column(JSON))
    draft_edited: bool | None = Field(default=None)
    note: str = Field(default="", sa_column=Column(Text, nullable=False, default=""))
    created_at: datetime = Field(default_factory=utcnow, index=True)


class Batch(SQLModel, table=True):
    __tablename__ = "batches"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(default="", max_length=255)
    model_config_id: int = Field(default=0)
    model_name: str = Field(default="", max_length=255)
    status: str = Field(default="queued", max_length=16)
    source: str = Field(default="live", max_length=16)
    ticket_ids: list | None = Field(default=None, sa_column=Column(JSON))
    total: int = Field(default=0)
    processed: int = Field(default=0)
    routed: int = Field(default=0)
    escalated: int = Field(default=0)
    failed: int = Field(default=0)
    avg_confidence: float | None = Field(default=None)
    per_team: dict | None = Field(default=None, sa_column=Column(JSON))
    escalation_reasons: dict | None = Field(default=None, sa_column=Column(JSON))
    eval: dict | None = Field(default=None, sa_column=Column(JSON))
    error: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    created_by_id: int | None = Field(default=None)
    created_by_name: str = Field(default="", max_length=255)
    created_at: datetime = Field(default_factory=utcnow)
    started_at: datetime | None = Field(default=None)
    finished_at: datetime | None = Field(default=None)
