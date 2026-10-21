"""vLLM (local) and any OpenAI-compatible API, via the official `openai` SDK."""
from __future__ import annotations

import os
import time

from openai import AsyncOpenAI

from .base import LLMError, LLMResult, ProviderConfig, TokenLogprob


class OpenAICompatProvider:
    def __init__(self, cfg: ProviderConfig):
        self.cfg = cfg

    async def complete(self, system: str, user: str, schema: dict) -> LLMResult:
        cfg = self.cfg
        api_key = (os.environ.get(cfg.api_key_env) if cfg.api_key_env else None) or "EMPTY"
        kwargs = dict(
            model=cfg.model_id,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=cfg.temperature or 0,
            max_tokens=cfg.max_tokens,
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "triage", "schema": schema, "strict": True},
            },
        )
        if cfg.supports_logprobs:
            kwargs["logprobs"] = True
            kwargs["top_logprobs"] = 5
        t0 = time.perf_counter()
        try:
            async with AsyncOpenAI(base_url=cfg.base_url, api_key=api_key, timeout=cfg.timeout_s, max_retries=0) as client:
                resp = await client.chat.completions.create(**kwargs)
        except Exception as e:  # network / API errors -> retried by the pipeline
            raise LLMError(f"{type(e).__name__}: {e}") from e
        latency_ms = int((time.perf_counter() - t0) * 1000)

        if not resp.choices:
            raise LLMError("empty response (no choices)")
        choice = resp.choices[0]
        text = choice.message.content or ""
        token_logprobs = None
        lp = getattr(choice, "logprobs", None)
        if cfg.supports_logprobs and lp is not None and getattr(lp, "content", None):
            token_logprobs = [
                TokenLogprob(
                    token=t.token,
                    logprob=float(t.logprob),
                    top_logprobs=[(a.token, float(a.logprob)) for a in (t.top_logprobs or [])],
                )
                for t in lp.content
            ]
        usage = resp.usage
        try:
            raw = resp.model_dump(mode="json")
        except Exception:  # pragma: no cover
            raw = None
        return LLMResult(
            text=text,
            token_logprobs=token_logprobs,
            tokens_in=getattr(usage, "prompt_tokens", None) if usage else None,
            tokens_out=getattr(usage, "completion_tokens", None) if usage else None,
            latency_ms=latency_ms,
            raw=raw,
        )
