# Serving the local models with vLLM

The backend talks to local models through vLLM's OpenAI-compatible server (provider `vllm`). It uses two features of that server:

* **Structured output**: `response_format={"type": "json_schema", ...}`. The model can only produce JSON that matches the triage schema, with `category` first.
* **Token logprobs**: `logprobs=true, top_logprobs=5`. The pipeline computes the category confidence from these. Without them, the confidence is `null` and the ticket escalates with `no_confidence`.

> vLLM flag names and defaults change between versions. The commands below are a starting point: check `vllm serve --help` for your installed version before you rely on a flag.

## 1. Install

You need a Linux machine (or WSL2) with an NVIDIA GPU and a recent CUDA driver.

```bash
python -m venv ~/vllm-env && source ~/vllm-env/bin/activate
pip install -U vllm            # pulls a matching torch build
vllm --version
```

## 2. Serve the base model + the LoRA adapter

```bash
vllm serve Qwen/Qwen3.5-4B \
  --port 8001 \
  --enable-lora \
  --lora-modules zain-triage-lora=/path/to/adapter \
  --max-model-len 4096 \
  --max-logprobs 20 \
  --logprobs-mode processed_logprobs
```

* `--enable-lora --lora-modules NAME=PATH`: serves the fine-tuned adapter under the model name `zain-triage-lora`. The base model is still served under `Qwen/Qwen3.5-4B`. One server can therefore answer as **both** the LoRA model and the base model; the request's `model` field picks one.
* `--max-model-len 4096`: one ticket plus the system prompt plus the JSON answer fits easily, and a shorter context leaves more GPU memory for the KV cache, which lets the server handle more concurrent requests.
* `--max-logprobs 20`: the upper limit a request may ask for. The backend asks for 5.
* `--logprobs-mode processed_logprobs`: return the logprobs **after** processing, which includes the JSON-schema constraint. The pipeline should measure exactly this: "given that the output must be one of the 9 category values, how sure is the model about this one?" The default is raw logprobs, taken before the grammar mask. Raw logprobs spread probability mass over tokens the grammar would never allow, so they underestimate confidence and make the threshold harder to calibrate. Pick the threshold on the validation split **with the same mode you use in production**.

If you start the server with `--api-key SECRET`, set the env var for the backend (for example `VLLM_API_KEY=SECRET`) and put that var's **name** in the model's `api_key_env` field. Without a key, the backend sends `EMPTY`.

## 3. Several models / adapters

* **Several adapters on one server**: repeat the name=path pairs, for example `--lora-modules zain-triage-lora=/ckpt/v1 zain-triage-lora-v2=/ckpt/v2`. Add `--max-loras 2` (and `--max-lora-rank` if your rank is above the default) when several adapters must be active at once. Each LoRA name becomes **one row** on the admin Models page: same `base_url`, different `model_id`.
* **Different base models**: run one vLLM server per base model on different ports (`--port 8001`, `--port 8002`, ...). If they share a GPU, also lower `--gpu-memory-utilization` on each server (for example 0.45 each). Each server is a different `base_url` (`http://host:8001/v1`, `http://host:8002/v1`).
* `GET {base_url}/models` lists what a server serves. The backend's `/api/health` calls this with a 2 s timeout to show whether each vLLM model is `reachable`.

## 4. Smoke test

```bash
curl -s http://localhost:8001/v1/models | python -m json.tool

curl -s http://localhost:8001/v1/chat/completions -H 'Content-Type: application/json' -d '{
  "model": "zain-triage-lora",
  "temperature": 0,
  "max_tokens": 512,
  "logprobs": true,
  "top_logprobs": 5,
  "messages": [
    {"role": "system", "content": "You are the triage step ... Today is 2026-10-20T16:32:00+03:00."},
    {"role": "user", "content": "حولت ربع مليون لأخوية البارحة وما وصلت. رقم العملية TX84213907"}
  ],
  "response_format": {"type": "json_schema", "json_schema": {"name": "triage", "strict": true, "schema": {
    "type": "object", "additionalProperties": false,
    "required": ["category", "secondary_category", "priority", "fields", "flags", "draft_reply"],
    "properties": {
      "category": {"type": "string", "enum": ["failed_transfer","wrong_recipient","login_problem","agent_dispute","card_issue","topup_balance","bill_payment","suspected_fraud","general_question"]},
      "secondary_category": {"anyOf": [{"type": "string", "enum": ["failed_transfer","wrong_recipient","login_problem","agent_dispute","card_issue","topup_balance","bill_payment","suspected_fraud","general_question"]}, {"type": "null"}]},
      "priority": {"type": "string", "enum": ["high","medium","low"]},
      "fields": {"type": "object", "additionalProperties": false,
        "required": ["transaction_ref","amount_iqd","amount_text","date","date_text"],
        "properties": {
          "transaction_ref": {"anyOf": [{"type": "string"}, {"type": "null"}]},
          "amount_iqd": {"anyOf": [{"type": "integer"}, {"type": "null"}]},
          "amount_text": {"anyOf": [{"type": "string"}, {"type": "null"}]},
          "date": {"anyOf": [{"type": "string"}, {"type": "null"}]},
          "date_text": {"anyOf": [{"type": "string"}, {"type": "null"}]}}},
      "flags": {"type": "array", "items": {"type": "string", "enum": ["missing_reference","amount_unit_inferred","mixed_issue","instruction_in_text","ambiguous_category","money_already_gone"]}},
      "draft_reply": {"type": "string"}}}}}
}' | python -c "import sys,json; r=json.load(sys.stdin); c=r['choices'][0]; print(c['message']['content']); print([(t['token'], round(t['logprob'],3)) for t in c['logprobs']['content'][:8]])"
```

The exact schema the backend sends is `app/schemas.py::triage_json_schema()`, and the full system prompt is `backend/app/prompts/triage_v1.md`. The first tokens should spell `{"category": "failed_transfer"`, and the tokens of `failed_transfer` should have logprobs close to 0 (probability close to 1).

## 5. GPU / memory notes (4B model, one GPU)

* Weights: about 8 GB in bf16. A LoRA adapter adds a few hundred MB at most.
* By default vLLM takes `--gpu-memory-utilization 0.9` of the card and uses everything left after the weights for the KV cache. At `--max-model-len 4096`, a **16 GB** card (T4 / A4000 / 4080) can serve one 4B model comfortably; on a T4, use `--dtype half` because it has no bf16. A **24 GB** card (A10 / L4 / 3090 / 4090) leaves room for many concurrent sequences, or for a second server.
* With 12 GB or less, try a lower `--max-model-len` (2048 is enough for most tickets), `--gpu-memory-utilization 0.85`, a quantized checkpoint (AWQ/GPTQ), or `--enforce-eager` (no CUDA graphs: slower, but less memory).
* Throughput: the backend runs `batch_concurrency` (default 8) requests in parallel per batch, and vLLM batches them on the GPU. Raise that setting while the GPU still has headroom.
* Thinking/reasoning: the triage call wants the JSON answer directly. If your Qwen build defaults to a thinking mode, turn it off in the chat template (for example `--default-chat-template-kwargs '{"enable_thinking": false}'` on versions that support it, or a custom `--chat-template`). Otherwise the extra tokens waste time and can push the JSON past `max_tokens`.

## 6. Register the model in the admin UI

Go to Admin, then Models, then Add model:

| field | value |
|---|---|
| provider | `vllm` |
| name | e.g. `Qwen3.5-4B + LoRA (vLLM)` |
| base_url | `http://localhost:8001/v1` (the host as seen **from the backend**, with `/v1`) |
| model_id | the LoRA name (`zain-triage-lora`) or the base name (`Qwen/Qwen3.5-4B`) |
| supports_logprobs | **on** (otherwise confidence is null) |
| temperature | 0 |
| max_tokens | 1024 |
| api_key_env | empty, or the env var name if the server uses `--api-key` |

The seed already creates both vLLM rows, disabled. Enable one, then press **Test**. That calls `POST /api/models/{id}/test`, which runs the full pipeline on a sample ticket without saving it and shows the category, confidence, checks and draft. Once the test passes, you can **Set as default** (new customer tickets are then auto-triaged with it), pick the model in the ticket re-triage menu, or run a batch with it. To compare the LoRA with the base model, upload `data/val.jsonl` as a batch once per model: each batch reports accuracy, macro F1, field exact match and escalation agreement against the gold labels.
