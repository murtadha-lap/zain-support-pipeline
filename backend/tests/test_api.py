import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent

ADMIN = ("admin@zain.local", "Admin123!")
AGENT = ("agent@zain.local", "Agent123!")
TRANSFERS = ("transfers@zain.local", "Team123!")
SECURITY = ("security@zain.local", "Team123!")

CLEAR = "السلام عليكم، حولت ربع مليون لأخوية البارحة وطلعتلي العملية ناجحة بس هو للحين ما وصلته. رقم العملية TX84213907"
MIXED = "الحوالة TX61004477 ما وصلت للمستلم، وفوگاها من البارحة البطاقة انقفلت وما أگدر أفتح الحساب أصلاً. شنو أسوي؟"


def test_auth_and_meta(client, login):
    assert client.get("/api/auth/me").status_code == 401
    r = client.post("/api/auth/login", json={"email": "admin@zain.local", "password": "wrong"})
    assert r.status_code == 401
    r = client.post("/api/auth/register", json={"email": "new@x.iq", "password": "secret123", "full_name": "New One"})
    assert r.status_code == 200 and r.json()["role"] == "customer"
    assert "zsp_token" in r.cookies or client.cookies.get("zsp_token")
    assert client.get("/api/auth/me").json()["email"] == "new@x.iq"
    assert client.post("/api/auth/register", json={"email": "new@x.iq", "password": "secret123", "full_name": "x"}).status_code == 409
    meta = client.get("/api/meta").json()
    assert len(meta["categories"]) == 9 and meta["categories"][0]["label_ar"]
    assert {p["key"]: p["is_cloud"] for p in meta["providers"]}["anthropic"] is True
    assert client.post("/api/auth/logout").json() == {"ok": True}
    assert client.get("/api/auth/me").status_code == 401
    # bearer token also accepted
    r = client.post("/api/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]})
    token = r.cookies.get("zsp_token") or client.cookies.get("zsp_token")
    client.cookies.clear()
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).json()["role"] == "admin"


def test_role_forbidden(client, login):
    cust = login("customer@zain.local", "Customer123!")
    for method, path in [("get", "/api/settings"), ("get", "/api/teams"), ("get", "/api/stats/overview"),
                         ("get", "/api/users"), ("get", "/api/batches"), ("get", "/api/export/tickets.csv")]:
        assert getattr(cust, method)(path).status_code == 403, path
    agent = login(*AGENT)
    assert agent.get("/api/settings").status_code == 200
    assert agent.put("/api/settings", json={"confidence_threshold": 0.5}).status_code == 403
    assert agent.get("/api/users").status_code == 403
    assert agent.post("/api/tickets", json={"text": "hello there"}).status_code == 403
    team = login(*TRANSFERS)
    assert team.get("/api/models").status_code == 200
    assert team.post("/api/models", json={"name": "x", "provider": "mock", "model_id": "m"}).status_code == 403


def test_customer_to_resolution_flow(client, login):
    cust = login("customer@zain.local", "Customer123!")
    r = cust.post("/api/tickets", json={"text": CLEAR, "channel": "whatsapp"})
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    assert r.json()["ref"] == f"ZS-{tid:06d}"

    # customer view hides triage internals
    d = cust.get(f"/api/tickets/{tid}").json()
    assert d["status"] == "routed" and d["triage"] is None and d["draft_md"] == "" and d["confidence"] is None
    assert d["decisions"] == [] and d["flags"] == []

    team = login(*TRANSFERS)
    page = team.get("/api/tickets", params={"status": "routed"}).json()
    assert tid in [i["id"] for i in page["items"]]
    detail = team.get(f"/api/tickets/{tid}").json()
    assert detail["triage"]["decision"] == "routed" and detail["triage"]["raw_output"] is None  # team: no raw
    assert detail["team_key"] == "transfers" and detail["draft_md"]

    other = login(*SECURITY)
    assert other.get(f"/api/tickets/{tid}").status_code == 404
    assert other.post(f"/api/tickets/{tid}/approve", json={"draft_md": "x"}).status_code == 404

    # team member cannot change category, but can edit draft and approve
    assert team.patch(f"/api/tickets/{tid}/labels", json={"category": "card_issue"}).status_code == 403
    assert team.put(f"/api/tickets/{tid}/draft", json={"draft_md": detail["draft_md"] + " شكراً"}).status_code == 200
    r = team.post(f"/api/tickets/{tid}/approve", json={"draft_md": detail["draft_md"] + " شكراً"})
    assert r.status_code == 200 and r.json()["status"] == "resolved"
    approve = next(x for x in r.json()["decisions"] if x["action"] == "approve")
    assert approve["draft_edited"] is True

    d = cust.get(f"/api/tickets/{tid}").json()
    assert d["status"] == "resolved" and d["messages"][-1]["author_type"] == "staff"

    # customer reply reopens it to the team
    d = cust.post(f"/api/tickets/{tid}/messages", json={"body": "شكراً بس بعد ما وصلت"}).json()
    assert d["status"] == "routed" and len(d["messages"]) == 2

    admin = login(*ADMIN)
    assert admin.get(f"/api/tickets/{tid}").json()["triage"]["raw_output"]
    ov = admin.get("/api/stats/overview").json()
    assert ov["tickets_total"] >= 1 and len(ov["daily"]) == 14 and len(ov["confidence_histogram"]) == 10
    me = team.get("/api/stats/me").json()
    assert me["resolved_today"] == 1


def test_escalated_ticket_agent_flow(client, login):
    cust = login("customer@zain.local", "Customer123!")
    tid = cust.post("/api/tickets", json={"text": MIXED}).json()["id"]
    agent = login(*AGENT)
    page = agent.get("/api/tickets", params={"status": "escalated"}).json()
    item = next(i for i in page["items"] if i["id"] == tid)
    assert item["escalation_reason"] == "mixed_issue"
    team = login(*TRANSFERS)
    assert team.get(f"/api/tickets/{tid}").status_code == 404  # not routed yet

    assert agent.post(f"/api/tickets/{tid}/assign", json={"user_id": 1}).status_code == 403
    me_id = agent.get("/api/auth/me").json()["id"]
    assert agent.post(f"/api/tickets/{tid}/assign", json={"user_id": me_id}).json()["assignee_id"] == me_id
    d = agent.patch(f"/api/tickets/{tid}/labels", json={"secondary_category": None, "note": "split later"}).json()
    assert d["secondary_category"] is None and d["decisions"][0]["action"] == "relabel"
    d = agent.post(f"/api/tickets/{tid}/route", json={"note": "transfer first"}).json()
    assert d["status"] == "routed" and d["team_key"] == "transfers"
    assert team.get(f"/api/tickets/{tid}").status_code == 200
    d = team.post(f"/api/tickets/{tid}/escalate", json={"note": "needs agent"}).json()
    assert d["status"] == "escalated" and d["escalation_reason"] == "manual"
    d = agent.post(f"/api/tickets/{tid}/retriage", json={}).json()
    assert len(d["triage_history"]) == 2 and d["decisions"][0]["action"] == "retriage"
    assert agent.post(f"/api/tickets/{tid}/approve", json={"draft_md": "  "}).status_code == 400
    d = agent.post(f"/api/tickets/{tid}/close", json={"note": "dup"}).json()
    assert d["status"] == "closed"


def test_admin_crud_and_model_test(client, login):
    admin = login(*ADMIN)
    models = admin.get("/api/models").json()
    assert len(models) == 4
    mock = next(m for m in models if m["provider"] == "mock")
    assert mock["is_default"] and not mock["is_cloud"]
    r = admin.post(f"/api/models/{mock['id']}/test", json={})
    assert r.status_code == 200 and r.json()["ok"] and r.json()["triage"]["category"] == "failed_transfer"
    assert admin.delete(f"/api/models/{mock['id']}").status_code == 409
    new = admin.post("/api/models", json={"name": "Local", "provider": "vllm", "model_id": "x",
                                          "base_url": "http://localhost:9/v1", "supports_logprobs": True}).json()
    assert new["is_cloud"] is False and new["has_api_key"] is False
    assert admin.patch(f"/api/models/{new['id']}", json={"notes": "n"}).json()["notes"] == "n"
    assert admin.post(f"/api/models/{new['id']}/default").json()["is_default"] is True
    assert admin.post(f"/api/models/{mock['id']}/default").json()["is_default"] is True
    assert admin.delete(f"/api/models/{new['id']}").json() == {"ok": True}

    s = admin.put("/api/settings", json={"confidence_threshold": 0.7}).json()
    assert s["confidence_threshold"] == 0.7 and s["prompt_version"] == "triage_v1"
    assert admin.put("/api/settings", json={"prompt_version": "nope"}).status_code == 400

    teams = admin.get("/api/teams").json()
    assert len(teams) == 7 and next(t for t in teams if t["key"] == "transfers")["member_count"] == 1
    assert admin.post("/api/teams", json={"key": "vip", "name": "VIP", "name_ar": "كبار الزبائن"}).status_code == 200
    assert admin.delete("/api/teams/transfers").status_code == 409
    rules = admin.get("/api/routing").json()
    assert len(rules) == 9
    rules[0]["team_key"] = "vip"
    assert admin.put("/api/routing", json=rules).json()[0]["team_key"] == "vip"
    assert admin.put("/api/routing", json=rules[:3]).status_code == 400

    u = admin.post("/api/users", json={"email": "t@zain.local", "full_name": "T", "password": "Team1234!", "role": "team_member"})
    assert u.status_code == 400
    u = admin.post("/api/users", json={"email": "t@zain.local", "full_name": "T", "password": "Team1234!",
                                       "role": "team_member", "team_key": "vip"}).json()
    assert u["team_name"] == "VIP"
    assert admin.get("/api/users", params={"role": "team_member", "team_key": "vip"}).json()[0]["email"] == "t@zain.local"
    assert admin.delete(f"/api/users/{u['id']}").json() == {"ok": True}
    me = admin.get("/api/auth/me").json()
    assert admin.delete(f"/api/users/{me['id']}").status_code == 400
    h = client.get("/api/health").json()
    assert h["status"] == "ok" and h["db"] == "ok" and any(m["provider"] == "mock" and m["reachable"] is None for m in h["models"])


def test_batch_upload_with_gold_and_exports(client, login):
    admin = login(*ADMIN)
    lines = (REPO / "data" / "val.jsonl").read_text(encoding="utf-8").splitlines()[:12]
    r = admin.post("/api/batches/upload", files={"file": ("val.jsonl", ("\n".join(lines)).encode("utf-8"), "application/json")},
                   data={"name": "val sample", "run": "true"})
    assert r.status_code == 200, r.text
    bid = r.json()["id"]
    b = admin.get(f"/api/batches/{bid}").json()
    assert b["status"] == "completed" and b["source"] == "upload" and b["total"] == 12 and b["processed"] == 12
    assert b["routed"] + b["escalated"] == 12 and b["avg_confidence"] is not None
    ev = b["eval"]
    assert ev["n"] == 12 and 0 <= ev["category_accuracy"] <= 1 and len(ev["per_category"]) == 9
    assert ev["invented_refs"] == 0 and 0 <= ev["escalation_agreement"] <= 1
    page = admin.get(f"/api/batches/{bid}/tickets", params={"page_size": 5}).json()
    assert page["total"] == 12 and len(page["items"]) == 5 and page["items"][0]["is_synthetic"]
    tid = page["items"][0]["id"]
    assert admin.get(f"/api/tickets/{tid}").json()["gold"]["category"]

    # csv upload without running; then a live batch over them
    csv_body = "text,channel\nالتطبيق يگلي الرمز غلط وهسه انقفل الحساب,app\nشگد العمولة على التحويل؟,telegram\n"
    r = admin.post("/api/batches/upload", files={"file": ("t.csv", csv_body.encode("utf-8"), "text/csv")}, data={"run": "false"})
    assert r.status_code == 200 and r.json()["status"] == "queued" and r.json()["total"] == 2
    r = admin.post("/api/batches", json={"statuses": ["new"]})
    assert r.status_code == 200
    b2 = admin.get(f"/api/batches/{r.json()['id']}").json()
    assert b2["status"] == "completed" and b2["processed"] == 2 and b2["eval"] is None
    assert len(admin.get("/api/batches").json()) == 3

    # approve one routed ticket, then export corrections
    routed = admin.get("/api/tickets", params={"status": "routed", "page_size": 1}).json()["items"][0]
    d = admin.get(f"/api/tickets/{routed['id']}").json()
    admin.post(f"/api/tickets/{routed['id']}/approve", json={"draft_md": d["draft_md"] or "تم"})
    r = admin.get("/api/export/corrections.jsonl")
    assert r.status_code == 200
    rows = [json.loads(x) for x in r.text.splitlines() if x.strip()]
    assert len(rows) == 1 and rows[0]["meta"]["source"] == "human" and rows[0]["meta"]["split"] == "train"
    assert set(rows[0]) == {"id", "text", "channel", "created_at", "labels", "draft_reply", "meta"}
    r = admin.get("/api/export/tickets.csv")
    assert r.status_code == 200 and "ref" in r.text.splitlines()[0]


def test_cloud_guard_batch_and_retriage(client, login):
    admin = login(*ADMIN)
    claude = next(m for m in admin.get("/api/models").json() if m["provider"] == "anthropic")
    admin.patch(f"/api/models/{claude['id']}", json={"enabled": True})
    cust = login("customer@zain.local", "Customer123!")
    tid = cust.post("/api/tickets", json={"text": CLEAR}).json()["id"]
    r = admin.post(f"/api/tickets/{tid}/retriage", json={"model_config_id": claude["id"]})
    assert r.status_code == 400 and "live ticket" in r.json()["detail"]
    r = admin.post("/api/batches", json={"model_config_id": claude["id"], "ticket_ids": [tid]})
    b = admin.get(f"/api/batches/{r.json()['id']}").json()
    assert b["failed"] == 1 and "cloud model not allowed" in b["error"]


def test_pagination_and_filters(client, login):
    cust = login("customer@zain.local", "Customer123!")
    for i in range(3):
        cust.post("/api/tickets", json={"text": f"{CLEAR} {i}"})
    admin = login(*ADMIN)
    p = admin.get("/api/tickets", params={"page_size": 2, "sort": "-priority"}).json()
    assert p["total"] == 3 and len(p["items"]) == 2 and p["page_size"] == 2
    assert admin.get("/api/tickets", params={"page_size": 500}).json()["page_size"] == 100
    first = p["items"][0]
    assert admin.get("/api/tickets", params={"q": first["ref"]}).json()["total"] >= 1
    assert admin.get("/api/tickets", params={"q": "TX84213907"}).json()["total"] == 3
    assert admin.get("/api/tickets", params={"category": "failed_transfer", "status": "routed,escalated"}).json()["total"] == 3
    assert cust.get("/api/tickets").json()["total"] == 3
    other = login("customer2@zain.local", "Customer123!")
    assert other.get("/api/tickets").json()["total"] == 0
    assert other.get(f"/api/tickets/{first['id']}").status_code == 404
