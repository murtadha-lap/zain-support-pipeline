from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..deps import require_admin, require_staff
from ..llm.base import ProviderConfig
from ..models import ModelConfig, Triage, utcnow
from ..schemas import ModelConfigCreate, ModelConfigOut, ModelConfigUpdate, ModelTestIn, ModelTestOut, OkResponse
from ..serializers import model_out, triage_out
from ..services.pipeline import PipelineError, run_triage
from ..services.routing import get_settings, route_for

router = APIRouter(prefix="/api/models", tags=["models"])

SAMPLE_TICKET = (
    "السلام عليكم، حولت ربع مليون لأخوية البارحة العصر وطلعتلي العملية ناجحة بس هو للحين ما وصلته. "
    "رقم العملية TX84213907 … شنو السالفة؟ والله فلوس ضرورية"
)


def _get(session: Session, model_id: int) -> ModelConfig:
    row = session.get(ModelConfig, model_id)
    if row is None:
        raise HTTPException(404, "Model not found")
    return row


def _unset_other_defaults(session: Session, keep_id: int) -> None:
    for other in session.exec(select(ModelConfig).where(ModelConfig.is_default == True, ModelConfig.id != keep_id)).all():  # noqa: E712
        other.is_default = False
        session.add(other)


@router.get("", response_model=list[ModelConfigOut])
def list_models(session: Session = Depends(get_session), _=Depends(require_staff)):
    return [model_out(m) for m in session.exec(select(ModelConfig).order_by(ModelConfig.id)).all()]


@router.post("", response_model=ModelConfigOut)
def create_model(body: ModelConfigCreate, session: Session = Depends(get_session), _=Depends(require_admin)):
    data = body.model_dump()
    data["provider"] = body.provider.value
    if body.provider.value in ("vllm", "openai_compatible") and not body.base_url:
        raise HTTPException(400, "base_url is required for vllm / openai_compatible")
    row = ModelConfig(**data)
    if row.is_default:
        row.enabled = True
    session.add(row)
    session.flush()
    if row.is_default:
        _unset_other_defaults(session, row.id)
    session.commit()
    session.refresh(row)
    return model_out(row)


@router.patch("/{model_id}", response_model=ModelConfigOut)
def update_model(model_id: int, body: ModelConfigUpdate, session: Session = Depends(get_session), _=Depends(require_admin)):
    row = _get(session, model_id)
    data = body.model_dump(exclude_unset=True)
    if "provider" in data and data["provider"] is not None:
        data["provider"] = data["provider"].value
    if data.get("is_default") is False and row.is_default:
        raise HTTPException(409, "Set another model as default instead of unsetting the default")
    if data.get("enabled") is False and row.is_default:
        raise HTTPException(409, "The default model cannot be disabled")
    nullable = {"base_url", "api_key_env", "temperature", "effort"}
    for k, v in data.items():
        if v is None and k not in nullable:
            continue
        setattr(row, k, v)
    if row.is_default:
        row.enabled = True
        _unset_other_defaults(session, row.id)
    row.updated_at = utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return model_out(row)


@router.delete("/{model_id}", response_model=OkResponse)
def delete_model(model_id: int, session: Session = Depends(get_session), _=Depends(require_admin)):
    row = _get(session, model_id)
    if row.is_default:
        raise HTTPException(409, "Cannot delete the default model")
    session.delete(row)
    session.commit()
    return {"ok": True}


@router.post("/{model_id}/default", response_model=ModelConfigOut)
def set_default(model_id: int, session: Session = Depends(get_session), _=Depends(require_admin)):
    row = _get(session, model_id)
    _unset_other_defaults(session, row.id)
    row.is_default = True
    row.enabled = True
    row.updated_at = utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return model_out(row)


@router.post("/{model_id}/test", response_model=ModelTestOut)
async def test_model(model_id: int, body: ModelTestIn | None = None, session: Session = Depends(get_session),
                     _=Depends(require_admin)):
    row = _get(session, model_id)
    cfg = ProviderConfig.from_row(row)
    settings = get_settings(session)
    text = (body.text if body and body.text and body.text.strip() else SAMPLE_TICKET)
    try:
        comp = await run_triage(cfg, text, utcnow(), settings)
    except PipelineError as e:
        return {"ok": False, "latency_ms": 0, "message": str(e), "triage": None}
    tri = Triage(
        id=0, ticket_id=0, model_config_id=row.id, model_name=row.name, model_id=row.model_id, provider=row.provider,
        prompt_version=comp.prompt_version, threshold=comp.threshold, category=comp.category,
        secondary_category=comp.secondary_category, priority=comp.priority, fields=comp.fields, flags=comp.flags,
        draft_reply=comp.draft_reply, confidence=comp.confidence, category_probs=comp.category_probs, checks=comp.checks,
        decision=comp.decision, escalation_reason=comp.escalation_reason, latency_ms=comp.latency_ms,
        tokens_in=comp.tokens_in, tokens_out=comp.tokens_out, raw_output=comp.raw_output, error=comp.error,
        created_at=utcnow(),
    )
    ok = comp.error is None
    if ok:
        team, _prio = route_for(session, comp.category)
        conf = "n/a" if comp.confidence is None else f"{comp.confidence:.2f}"
        where = f"routed to {team}" if comp.decision == "routed" else f"escalated ({comp.escalation_reason})"
        message = f"OK: {comp.category}, confidence {conf}, {where}"
    else:
        message = comp.error or "model error"
    return {"ok": ok, "latency_ms": comp.latency_ms, "message": message, "triage": triage_out(tri)}
