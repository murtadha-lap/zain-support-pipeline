from fastapi import APIRouter, Depends

from ..deps import get_current_user
from ..enums import (
    CATEGORY_LABELS,
    CHANNEL_LABELS,
    CLOUD_PROVIDERS,
    ESCALATION_LABELS,
    FLAG_LABELS,
    PRIORITY_LABELS,
    PROVIDER_LABELS,
    ROLE_LABELS,
    STATUS_LABELS,
)
from ..schemas import MetaOut

router = APIRouter(prefix="/api", tags=["meta"])


def build_meta() -> dict:
    return {
        "categories": [{"key": k, "label": en, "label_ar": ar} for k, (en, ar) in CATEGORY_LABELS.items()],
        "priorities": [{"key": k, "label": v} for k, v in PRIORITY_LABELS.items()],
        "channels": [{"key": k, "label": v} for k, v in CHANNEL_LABELS.items()],
        "flags": [{"key": k, "label": lab, "description": d} for k, (lab, d) in FLAG_LABELS.items()],
        "statuses": [{"key": k, "label": v} for k, v in STATUS_LABELS.items()],
        "escalation_reasons": [{"key": k, "label": lab, "description": d} for k, (lab, d) in ESCALATION_LABELS.items()],
        "roles": [{"key": k, "label": v} for k, v in ROLE_LABELS.items()],
        "providers": [{"key": k, "label": v, "is_cloud": k in CLOUD_PROVIDERS} for k, v in PROVIDER_LABELS.items()],
    }


@router.get("/meta", response_model=MetaOut, dependencies=[Depends(get_current_user)])
def meta():
    return build_meta()
