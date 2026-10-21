"""The triage pipeline for one ticket (docs/api-contract.md, "Pipeline").

1. system prompt prompts/{prompt_version}.md with {created_at}; user message = ticket text (data only)
2. model call with JSON-schema constrained output
3. parse + validate; invalid -> retry max_retries times -> model_error
4. confidence from logprobs
5. checks (code): schema, grounding, confidence, single_issue
6. route (team from routing table, priority = max(model, rule default)) or escalate (first failing reason)
7. store everything
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from pydantic import ValidationError
from sqlmodel import Session, select

from ..db import new_session
from ..enums import CLOUD_PROVIDERS, max_priority
from ..llm.base import LLMError, ModelRefusal, ProviderConfig
from ..llm.factory import get_provider
from ..logging_utils import get_logger, mask_pii
from ..models import ModelConfig, Ticket, Triage, utcnow
from ..schemas import TriageOutput, triage_json_schema
from .checks import run_checks
from .confidence import compute_confidence
from .routing import get_settings, route_for

log = get_logger("pipeline")

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
IRAQ_TZ = timezone(timedelta(hours=3))
_VERSION_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")


class PipelineError(Exception):
    """Configuration problem (missing model / prompt). Maps to HTTP 400."""


class CloudNotAllowed(PipelineError):
    pass


def ticket_ref(ticket_id: int | None) -> str:
    return f"ZS-{(ticket_id or 0):06d}"


def as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def render_created_at(dt: datetime | None) -> str:
    """Ticket time in Iraq local time (+03:00), so relative dates (البارحة ...) resolve correctly."""
    return as_utc(dt or utcnow()).astimezone(IRAQ_TZ).isoformat(timespec="seconds")


def load_prompt(version: str, created_at: datetime | None) -> str:
    if not _VERSION_RE.match(version or ""):
        raise PipelineError(f"invalid prompt_version {version!r}")
    path = PROMPTS_DIR / f"{version}.md"
    if not path.is_file():
        raise PipelineError(f"prompt file not found: prompts/{version}.md")
    # str.replace, not .format: the prompt itself contains braces (fields{...}).
    return path.read_text(encoding="utf-8").strip().replace("{created_at}", render_created_at(created_at))


def parse_output(text: str) -> TriageOutput:
    s = (text or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", s).strip()
    if not s.startswith("{"):
        i, j = s.find("{"), s.rfind("}")
        if i < 0 or j <= i:
            raise ValueError("no JSON object in output")
        s = s[i:j + 1]
    out = TriageOutput.model_validate_json(s)
    seen: list = []
    for f in out.flags:
        if f not in seen:
            seen.append(f)
    out.flags = seen
    return out


def is_cloud(provider: str) -> bool:
    return provider in CLOUD_PROVIDERS


@dataclass
class TriageComputation:
    category: str | None
    secondary_category: str | None
    priority: str | None
    fields: dict
    raw_fields: dict | None
    flags: list[str]
    draft_reply: str
    confidence: float | None
    category_probs: dict | None
    checks: list[dict]
    decision: str
    escalation_reason: str | None
    latency_ms: int
    tokens_in: int | None
    tokens_out: int | None
    raw_output: str | None
    error: str | None
    prompt_version: str
    threshold: float


async def run_triage(cfg: ProviderConfig, text: str, created_at: datetime | None, settings: dict) -> TriageComputation:
    """Model call + parse + confidence + checks. Pure (no DB). Used by tickets, batches and model tests."""
    version = settings["prompt_version"]
    threshold = float(settings["confidence_threshold"])
    system = load_prompt(version, created_at)
    schema = triage_json_schema()
    provider = get_provider(cfg)
    attempts = 1 + max(0, int(settings.get("max_retries", 1)))

    t0 = time.perf_counter()
    output: TriageOutput | None = None
    result = None
    error: str | None = None
    for _ in range(attempts):
        try:
            res = await provider.complete(system, text, schema)
        except ModelRefusal as e:
            error = f"Model refused: {e.category or 'unspecified'}"
            break
        except LLMError as e:
            error = f"Model call failed: {e}"
            continue
        except Exception as e:  # unexpected provider bug: still escalate as model_error
            error = f"Model call failed: {type(e).__name__}: {e}"
            continue
        result = res
        try:
            output = parse_output(res.text)
            error = None
            break
        except (ValidationError, ValueError, json.JSONDecodeError) as e:
            msg = str(e).splitlines()
            error = "Invalid model output: " + " | ".join(msg[:4])[:500]
    latency_ms = int((time.perf_counter() - t0) * 1000)

    confidence, category_probs = (None, None)
    if output is not None and result is not None:
        confidence, category_probs = compute_confidence(result.text, result.token_logprobs)

    cr = run_checks(output, text, confidence, threshold, bool(settings["escalate_without_confidence"]), error)
    return TriageComputation(
        category=output.category.value if output else None,
        secondary_category=output.secondary_category.value if output and output.secondary_category else None,
        priority=output.priority.value if output else None,
        fields=cr.fields,
        raw_fields=output.fields.model_dump() if output else None,
        flags=[f.value for f in output.flags] if output else [],
        draft_reply=output.draft_reply if output else "",
        confidence=confidence,
        category_probs=category_probs,
        checks=cr.checks,
        decision=cr.decision,
        escalation_reason=cr.escalation_reason,
        latency_ms=latency_ms,
        tokens_in=result.tokens_in if result else None,
        tokens_out=result.tokens_out if result else None,
        raw_output=result.text if result else None,
        error=error if output is None else None,
        prompt_version=version,
        threshold=threshold,
    )


def default_model(session: Session) -> ModelConfig | None:
    row = session.exec(select(ModelConfig).where(ModelConfig.is_default == True)).first()  # noqa: E712
    return row


def resolve_model(session: Session, model_config_id: int | None, require_enabled: bool = True) -> ModelConfig:
    row = session.get(ModelConfig, model_config_id) if model_config_id else default_model(session)
    if row is None:
        raise PipelineError("model not found" if model_config_id else "no default model configured")
    if require_enabled and not row.enabled:
        raise PipelineError(f"model '{row.name}' is disabled")
    return row


def check_cloud_guard(model: ModelConfig, ticket: Ticket, settings: dict) -> None:
    if is_cloud(model.provider) and not ticket.is_synthetic and not settings["allow_cloud_for_live_tickets"]:
        raise CloudNotAllowed(
            f"Cloud model '{model.name}' may only process uploaded/synthetic tickets "
            f"({ticket_ref(ticket.id)} is a live ticket). Enable 'allow_cloud_for_live_tickets' in settings to override."
        )


@dataclass
class TriageOutcome:
    triage_id: int
    decision: str
    escalation_reason: str | None
    confidence: float | None
    category: str | None


async def triage_ticket(ticket_id: int, model_config_id: int | None = None, batch_id: int | None = None) -> TriageOutcome:
    """Run the pipeline on a stored ticket and persist the result (own DB sessions)."""
    with new_session() as s:
        settings = get_settings(s)
        ticket = s.get(Ticket, ticket_id)
        if ticket is None:
            raise PipelineError(f"ticket {ticket_id} not found")
        model = resolve_model(s, model_config_id, require_enabled=True)
        check_cloud_guard(model, ticket, settings)
        cfg = ProviderConfig.from_row(model)
        prev_status = ticket.status
        text, created_at = ticket.text, ticket.created_at
        ticket.status = "processing"
        ticket.updated_at = utcnow()
        s.add(ticket)
        s.commit()

    try:
        comp = await run_triage(cfg, text, created_at, settings)
    except Exception:
        with new_session() as s:
            t = s.get(Ticket, ticket_id)
            if t is not None and t.status == "processing":
                t.status = prev_status
                s.add(t)
                s.commit()
        raise

    with new_session() as s:
        ticket = s.get(Ticket, ticket_id)
        triage = Triage(
            ticket_id=ticket_id,
            batch_id=batch_id,
            model_config_id=cfg.id,
            model_name=cfg.name,
            model_id=cfg.model_id,
            provider=cfg.provider,
            prompt_version=comp.prompt_version,
            threshold=comp.threshold,
            category=comp.category,
            secondary_category=comp.secondary_category,
            priority=comp.priority,
            fields=comp.fields,
            raw_fields=comp.raw_fields,
            flags=comp.flags,
            draft_reply=comp.draft_reply,
            confidence=comp.confidence,
            category_probs=comp.category_probs,
            checks=comp.checks,
            decision=comp.decision,
            escalation_reason=comp.escalation_reason,
            latency_ms=comp.latency_ms,
            tokens_in=comp.tokens_in,
            tokens_out=comp.tokens_out,
            raw_output=comp.raw_output,
            error=comp.error,
        )
        s.add(triage)
        s.flush()

        team_key, default_priority = route_for(s, comp.category)
        ticket.category = comp.category
        ticket.secondary_category = comp.secondary_category
        ticket.priority = max_priority(comp.priority, default_priority) if comp.category else None
        ticket.fields = comp.fields
        ticket.flags = comp.flags
        ticket.confidence = comp.confidence
        ticket.ai_draft = comp.draft_reply
        ticket.draft_md = comp.draft_reply
        ticket.latest_triage_id = triage.id
        ticket.triaged_at = utcnow()
        ticket.updated_at = utcnow()
        if batch_id is not None:
            ticket.batch_id = batch_id
        if comp.decision == "routed" and team_key:
            ticket.status = "routed"
            ticket.team_key = team_key
            ticket.escalation_reason = None
        else:
            ticket.status = "escalated"
            ticket.team_key = None
            ticket.escalation_reason = comp.escalation_reason or "model_error"
        ticket.escalation_note = None
        s.add(ticket)
        s.commit()
        outcome = TriageOutcome(triage.id, ticket.status, ticket.escalation_reason, comp.confidence, comp.category)

    log.info(
        mask_pii(
            f"triage ticket={ticket_ref(ticket_id)} model={cfg.name} ({cfg.provider}:{cfg.model_id}) "
            f"decision={outcome.decision} reason={outcome.escalation_reason} category={comp.category} "
            f"confidence={comp.confidence if comp.confidence is None else round(comp.confidence, 3)} "
            f"latency_ms={comp.latency_ms}" + (f" error={comp.error}" if comp.error else "")
        )
    )
    return outcome


async def auto_triage_ticket(ticket_id: int) -> None:
    """Background auto-triage for a new customer ticket (default model). Never raises."""
    try:
        with new_session() as s:
            if not get_settings(s)["auto_triage"]:
                return
        await triage_ticket(ticket_id)
    except CloudNotAllowed as e:
        log.warning(mask_pii(f"auto-triage skipped for {ticket_ref(ticket_id)}: {e}"))
    except Exception as e:  # pragma: no cover - logged, ticket stays 'new'
        log.exception(mask_pii(f"auto-triage failed for {ticket_ref(ticket_id)}: {e}"))
