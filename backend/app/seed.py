"""Seed data. Idempotent.

    python -m app.seed            # teams, routing, settings, models, users
    python -m app.seed --reset    # drop all tables first
    python -m app.seed --demo     # + 60 demo tickets from data/train.jsonl and one mock batch over them
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import defaultdict
from pathlib import Path

from sqlmodel import Session, select

from .config import get_config
from .db import drop_db, init_db, new_session
from .models import Batch, Decision, Message, ModelConfig, RoutingRule, Team, Ticket, User, utcnow
from .security import hash_password
from .services.routing import SEED_ROUTING, SEED_TEAMS, ensure_default_settings
from .services.upload import _parse_dt

SEED_MODELS = [
    dict(name="Mock (dev only)", provider="mock", model_id="mock-keyword-v1", supports_logprobs=True, enabled=True,
         is_default=True, max_tokens=1024, timeout_s=10,
         notes="mock (dev only): offline keyword classifier with fake logprobs. Not a model; for development and demos."),
    dict(name="Qwen3.5-4B + LoRA (vLLM)", provider="vllm", model_id="zain-triage-lora", base_url="http://localhost:8001/v1",
         supports_logprobs=True, enabled=False, temperature=0, max_tokens=1024, timeout_s=60,
         notes="Fine-tuned LoRA adapter served by vLLM (see docs/vllm.md)."),
    dict(name="Qwen3.5-4B base (vLLM)", provider="vllm", model_id="Qwen/Qwen3.5-4B", base_url="http://localhost:8001/v1",
         supports_logprobs=True, enabled=False, temperature=0, max_tokens=1024, timeout_s=60,
         notes="Base model without the adapter, for comparison."),
    dict(name="Claude Opus 5.5 (cloud)", provider="anthropic", model_id="claude-opus-5-5", api_key_env="ANTHROPIC_API_KEY",
         supports_logprobs=False, enabled=False, effort="low", use_fallbacks=True, max_tokens=2048, timeout_s=120,
         notes="Cloud model: no logprobs (confidence null). Only runs on synthetic/uploaded tickets unless allowed in settings."),
]

SEED_USERS = [
    ("admin@zain.local", "Admin123!", "Admin", "admin", None),
    ("agent@zain.local", "Agent123!", "Sara Agent", "agent", None),
    ("agent2@zain.local", "Agent123!", "Ali Agent", "agent", None),
    *[(f"{key}@zain.local", "Team123!", f"{name} member", "team_member", key) for key, name, *_ in SEED_TEAMS],
    ("customer@zain.local", "Customer123!", "Ahmed Customer", "customer", None),
    ("customer2@zain.local", "Customer123!", "Zainab Customer", "customer", None),
]


def seed_base(session: Session, only_if_empty: bool = False) -> None:
    has_teams = session.exec(select(Team)).first() is not None
    if not (only_if_empty and has_teams):
        for key, name, name_ar, desc, color in SEED_TEAMS:
            if session.get(Team, key) is None:
                session.add(Team(key=key, name=name, name_ar=name_ar, description=desc, color=color))
        session.commit()
        for cat, (team, prio) in SEED_ROUTING.items():
            if session.get(RoutingRule, cat) is None:
                session.add(RoutingRule(category=cat, team_key=team, default_priority=prio))
        session.commit()
    ensure_default_settings(session)
    has_models = session.exec(select(ModelConfig)).first() is not None
    if not (only_if_empty and has_models):
        existing = {m.name for m in session.exec(select(ModelConfig)).all()}
        has_default = session.exec(select(ModelConfig).where(ModelConfig.is_default == True)).first() is not None  # noqa: E712
        for spec in SEED_MODELS:
            if spec["name"] in existing:
                continue
            spec = dict(spec)
            if has_default:
                spec["is_default"] = False
            session.add(ModelConfig(**spec))
            if spec.get("is_default"):
                has_default = True
        session.commit()


def seed_users(session: Session) -> None:
    for email, pw, name, role, team in SEED_USERS:
        if session.exec(select(User).where(User.email == email)).first() is None:
            session.add(User(email=email, full_name=name, role=role, team_key=team, password_hash=hash_password(pw)))
    session.commit()


def _pick_demo_rows(path: Path, n: int = 60) -> list[dict]:
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    by_cat: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_cat[r["labels"]["category"]].append(r)
    picked: list[dict] = []
    cats = sorted(by_cat)
    i = 0
    while len(picked) < n and any(by_cat.values()):
        bucket = by_cat[cats[i % len(cats)]]
        if bucket:
            picked.append(bucket.pop(0))
        i += 1
    return picked


def seed_demo(n: int = 60) -> int | None:
    path = Path(get_config().data_dir) / "train.jsonl"
    if not path.is_file():
        print(f"  demo: {path} not found, skipping")
        return None
    with new_session() as s:
        customers = [s.exec(select(User).where(User.email == e)).first() for e in ("customer@zain.local", "customer2@zain.local")]
        if any(c is None for c in customers):
            seed_users(s)
            customers = [s.exec(select(User).where(User.email == e)).first() for e in ("customer@zain.local", "customer2@zain.local")]
        cust_ids = [c.id for c in customers]
        existing = s.exec(select(Ticket).where(Ticket.customer_id.in_(cust_ids), Ticket.external_id.is_not(None))).first()
        if existing:
            print("  demo: demo tickets already present, skipping import")
            return None
        rows = _pick_demo_rows(path, n)
        tickets = []
        for idx, r in enumerate(rows):
            created = _parse_dt(r.get("created_at")) or utcnow()
            tickets.append(Ticket(customer_id=cust_ids[idx % 2], channel=r.get("channel", "app"), text=r["text"],
                                  status="new", is_synthetic=False, external_id=r.get("id"),
                                  created_at=created, updated_at=created))
        s.add_all(tickets)
        s.flush()
        ids = [t.id for t in tickets]
        mock = s.exec(select(ModelConfig).where(ModelConfig.provider == "mock")).first()
        admin = s.exec(select(User).where(User.email == "admin@zain.local")).first()
        batch = Batch(name="Demo batch (mock)", model_config_id=mock.id, model_name=mock.name, status="queued",
                      source="live", ticket_ids=ids, total=len(ids), created_by_id=admin.id if admin else None,
                      created_by_name=admin.full_name if admin else "seed")
        s.add(batch)
        s.commit()
        batch_id = batch.id
    from .services.batches import run_batch

    asyncio.run(run_batch(batch_id))
    _demo_human_actions()
    with new_session() as s:
        b = s.get(Batch, batch_id)
        print(f"  demo: imported {b.total} tickets, batch #{b.id}: routed={b.routed} escalated={b.escalated} failed={b.failed}")
    return batch_id


def _demo_human_actions() -> None:
    """A few approvals / assignments so dashboards are not empty."""
    from datetime import timedelta

    with new_session() as s:
        users = {u.email: u for u in s.exec(select(User)).all()}
        routed = s.exec(select(Ticket).where(Ticket.status == "routed").order_by(Ticket.id)).all()
        done_teams: set[str] = set()
        n = 0
        for t in routed:
            if t.team_key in done_teams or not t.draft_md:
                continue
            member = users.get(f"{t.team_key}@zain.local")
            if member is None:
                continue
            done_teams.add(t.team_key)
            edited = n % 3 == 2
            body = t.draft_md + (" وإذا عندك أي سؤال ثاني راسلنا هنا." if edited else "")
            when = (t.created_at or utcnow()) + timedelta(hours=2 + n)
            s.add(Message(ticket_id=t.id, author_type="staff", author_id=member.id, author_name=member.full_name,
                          body_md=body, created_at=when))
            s.add(Decision(ticket_id=t.id, user_id=member.id, user_name=member.full_name, user_role=member.role,
                           action="approve", before={"status": "routed"}, after={"status": "resolved"},
                           draft_edited=edited, note="", created_at=when))
            t.status, t.resolved_at, t.draft_md, t.updated_at = "resolved", when, body, when
            s.add(t)
            n += 1
            if n >= 5:
                break
        agent = users.get("agent@zain.local")
        esc = s.exec(select(Ticket).where(Ticket.status == "escalated").order_by(Ticket.id).limit(2)).all()
        for t in esc:
            if agent:
                t.assignee_id = agent.id
                s.add(Decision(ticket_id=t.id, user_id=agent.id, user_name=agent.full_name, user_role=agent.role,
                               action="assign", before={"assignee_id": None}, after={"assignee_id": agent.id}))
                s.add(t)
        s.commit()


def print_users() -> None:
    print("\nSeed users:")
    for email, pw, name, role, team in SEED_USERS:
        print(f"  {role:<12} {email:<32} {pw:<14} {('team=' + team) if team else ''}")


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Seed the Zain support pipeline database")
    ap.add_argument("--reset", action="store_true", help="drop and recreate all tables")
    ap.add_argument("--demo", action="store_true", help="import 60 demo tickets and run one mock batch")
    args = ap.parse_args(argv)

    from .logging_utils import setup_logging

    setup_logging("WARNING")
    print(f"Database: {get_config().database_url}")
    if args.reset:
        print("  reset: dropping all tables")
        drop_db()
    init_db()
    with new_session() as s:
        seed_base(s)
        seed_users(s)
        print(f"  teams={len(s.exec(select(Team)).all())} routing={len(s.exec(select(RoutingRule)).all())} "
              f"models={len(s.exec(select(ModelConfig)).all())} users={len(s.exec(select(User)).all())}")
    if args.demo:
        seed_demo()
    print_users()


if __name__ == "__main__":
    sys.exit(main())
