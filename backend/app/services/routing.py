"""Routing table + runtime settings (key/value table) helpers."""
from __future__ import annotations

from sqlmodel import Session, select

from ..models import RoutingRule, Setting, Team

SEED_TEAMS = [
    # key, name, name_ar, description, color
    ("transfers", "Transfers", "قسم الحوالات", "Failed / stuck transfers and transfers to the wrong recipient.", "#2563eb"),
    ("accounts", "Accounts", "قسم الحسابات", "Login problems, locked accounts, PIN / OTP issues.", "#7c3aed"),
    ("agent_network", "Agent network", "قسم الوكلاء", "Disputes about cash-in / cash-out at agents.", "#d97706"),
    ("cards", "Cards", "قسم البطاقات", "Card declined, not delivered, frozen, wrong charge.", "#0891b2"),
    ("payments", "Payments", "قسم المدفوعات", "Top-ups, balance problems and bill payments.", "#16a34a"),
    ("security", "Security", "قسم الأمان", "Suspected fraud, hacked accounts, phishing.", "#dc2626"),
    ("general_support", "General support", "فريق الدعم", "Limits, fees, how-to and general questions.", "#64748b"),
]

SEED_ROUTING = {
    "failed_transfer": ("transfers", "high"),
    "wrong_recipient": ("transfers", "high"),
    "login_problem": ("accounts", "medium"),
    "agent_dispute": ("agent_network", "medium"),
    "card_issue": ("cards", "medium"),
    "topup_balance": ("payments", "medium"),
    "bill_payment": ("payments", "medium"),
    "suspected_fraud": ("security", "high"),
    "general_question": ("general_support", "low"),
}

DEFAULT_SETTINGS = {
    "confidence_threshold": 0.80,
    "prompt_version": "triage_v1",
    "escalate_without_confidence": True,
    "auto_triage": True,
    "allow_cloud_for_live_tickets": False,
    "max_retries": 1,
    "batch_concurrency": 8,
}


def get_routing(session: Session) -> dict[str, RoutingRule]:
    return {r.category: r for r in session.exec(select(RoutingRule)).all()}


def route_for(session: Session, category: str | None) -> tuple[str | None, str | None]:
    """(team_key, default_priority) for a category."""
    if not category:
        return None, None
    rule = session.get(RoutingRule, category)
    if rule:
        return rule.team_key, rule.default_priority
    seed = SEED_ROUTING.get(category)
    return seed if seed else (None, None)


def team_names(session: Session) -> dict[str, str]:
    return {t.key: t.name for t in session.exec(select(Team)).all()}


def get_settings(session: Session) -> dict:
    values = dict(DEFAULT_SETTINGS)
    for row in session.exec(select(Setting)).all():
        if row.key in values:
            values[row.key] = row.value
    return values


def update_settings(session: Session, patch: dict) -> dict:
    for key, value in patch.items():
        if key not in DEFAULT_SETTINGS or value is None:
            continue
        row = session.get(Setting, key)
        if row is None:
            session.add(Setting(key=key, value=value))
        else:
            row.value = value
            session.add(row)
    session.commit()
    return get_settings(session)


def ensure_default_settings(session: Session) -> None:
    for key, value in DEFAULT_SETTINGS.items():
        if session.get(Setting, key) is None:
            session.add(Setting(key=key, value=value))
    session.commit()
