"""Parse uploaded ticket files (.jsonl, .json array, .csv)."""
from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass
from datetime import datetime, timezone

CHANNELS = {"app", "whatsapp", "telegram"}


class UploadError(ValueError):
    pass


@dataclass
class UploadRow:
    text: str
    channel: str
    created_at: datetime | None
    customer_email: str | None
    gold: dict | None
    external_id: str | None


def _parse_dt(value) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _row_from_obj(obj: dict, where: str) -> UploadRow:
    if not isinstance(obj, dict):
        raise UploadError(f"{where}: expected an object")
    text = obj.get("text")
    if not isinstance(text, str) or len(text.strip()) < 5:
        raise UploadError(f"{where}: missing or too short 'text' (min 5 chars)")
    if len(text) > 4000:
        raise UploadError(f"{where}: 'text' longer than 4000 chars")
    channel = obj.get("channel") if obj.get("channel") in CHANNELS else "app"
    gold = None
    labels = obj.get("labels")
    if isinstance(labels, dict) and labels.get("category"):
        gold = dict(labels)
        if "draft_reply" in obj:
            gold["draft_reply"] = obj.get("draft_reply")
        if obj.get("id"):
            gold["source_id"] = obj.get("id")
    email = obj.get("customer_email")
    return UploadRow(
        text=text,
        channel=channel,
        created_at=_parse_dt(obj.get("created_at")),
        customer_email=str(email).strip().lower() if email else None,
        gold=gold,
        external_id=str(obj["id"])[:64] if obj.get("id") else None,
    )


def parse_upload(filename: str, content: bytes) -> list[UploadRow]:
    name = (filename or "").lower()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise UploadError("file must be UTF-8") from e
    rows: list[UploadRow] = []
    if name.endswith(".jsonl"):
        for n, line in enumerate(text.splitlines(), 1):
            if not line.strip():
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                raise UploadError(f"line {n}: invalid JSON ({e.msg})") from e
            rows.append(_row_from_obj(obj, f"line {n}"))
    elif name.endswith(".json"):
        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            raise UploadError(f"invalid JSON ({e.msg})") from e
        if isinstance(data, dict) and isinstance(data.get("tickets"), list):
            data = data["tickets"]
        if not isinstance(data, list):
            raise UploadError(".json upload must be an array of tickets")
        for n, obj in enumerate(data, 1):
            rows.append(_row_from_obj(obj, f"item {n}"))
    elif name.endswith(".csv"):
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames or "text" not in [f.strip() for f in reader.fieldnames]:
            raise UploadError("CSV must have a 'text' column")
        for n, rec in enumerate(reader, 2):
            rec = {(k or "").strip(): (v or "").strip() for k, v in rec.items()}
            if not rec.get("text"):
                continue
            rows.append(_row_from_obj(rec, f"row {n}"))
    else:
        raise UploadError("unsupported file type: use .jsonl, .json or .csv")
    if not rows:
        raise UploadError("file contains no tickets")
    if len(rows) > 5000:
        raise UploadError("too many rows (max 5000 per upload)")
    return rows
