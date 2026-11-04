# Zain Support Pipeline — Summary

A web app that triages customer support tickets for an Iraqi mobile-wallet operator. Customers write in Iraqi Arabic dialect; the app sorts and answers them, and **a person approves every reply**.

## How it works

1. A customer sends a request from the portal or the Telegram bot (or an admin uploads a batch).
2. A model proposes the category, priority, reference/amount/date and a draft reply.
3. **Code checks it:** valid format, details really appear in the text, confidence above threshold, only one problem.
4. Checks pass → routed to the right team queue. Any fail → escalated to a human agent.
5. A person edits and approves the reply. Nothing is sent automatically. Telegram replies go back to the customer's chat.

## Roles

| Role | Does |
| --- | --- |
| Customer | Sends requests (portal or Telegram), reads approved replies |
| Agent | Reviews tickets the model was unsure about |
| Team member | Edits and approves replies for their team |
| Admin | Dashboard, batches, models, users, routing, settings (incl. Telegram bot), exports |

## Dataset and training

[murtadha-lap/iraqi-wallet-support-tickets](https://huggingface.co/datasets/murtadha-lap/iraqi-wallet-support-tickets) on Hugging Face: 1,200 synthetic tickets (no real customer data).

- **train** (900): fine-tunes the Qwen3.5-4B LoRA triage model
- **val** (100): calibrates the confidence threshold
- **test** (200): held out for the final model comparison
- Staff corrections in the app export as new training rows for the next round.

## Stack

Next.js 15 frontend · FastAPI backend · SQLite/PostgreSQL · models: offline mock (default), local vLLM Qwen + LoRA, or Claude API · Telegram Bot API.

## Run

```bash
# repo root: get the dataset (the demo seed reads data/train.jsonl)
hf download murtadha-lap/iraqi-wallet-support-tickets data/train.jsonl data/val.jsonl data/test.jsonl data/examples.json --repo-type dataset --local-dir .

# terminal 1: backend (http://localhost:8000)
cd backend && python -m app.seed --reset --demo && python -m uvicorn app.main:app --port 8000

# terminal 2: frontend (http://localhost:3000)
cd frontend && pnpm install && pnpm dev
```

Demo login: `admin@zain.local` / `Admin123!`. Connect Telegram in **Admin → Settings → Telegram bot**.
