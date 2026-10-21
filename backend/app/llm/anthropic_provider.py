"""Claude via the official `anthropic` SDK with structured outputs (output_config.format json_schema).

No temperature / top_p / top_k (400 on current models) and no `thinking` param. No logprobs, so the
pipeline's confidence is null for this provider.
"""
from __future__ import annotations

import os
import time

from anthropic import AsyncAnthropic

from .base import LLMError, LLMResult, ModelRefusal, ProviderConfig


class AnthropicProvider:
    def __init__(self, cfg: ProviderConfig):
        self.cfg = cfg

    async def complete(self, system: str, user: str, schema: dict) -> LLMResult:
        cfg = self.cfg
        api_key = os.environ.get(cfg.api_key_env or "ANTHROPIC_API_KEY")
        if not api_key:
            raise LLMError(f"environment variable {cfg.api_key_env or 'ANTHROPIC_API_KEY'} is not set")
        kwargs = dict(
            model=cfg.model_id,
            max_tokens=cfg.max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config={"format": {"type": "json_schema", "schema": schema}, "effort": cfg.effort or "low"},
        )
        t0 = time.perf_counter()
        try:
            async with AsyncAnthropic(api_key=api_key, timeout=cfg.timeout_s, max_retries=0) as client:
                if cfg.use_fallbacks:
                    resp = await client.beta.messages.create(
                        **kwargs, betas=["server-side-fallback-2026-07-01"], fallbacks="default"
                    )
                else:
                    resp = await client.messages.create(**kwargs)
        except Exception as e:
            raise LLMError(f"{type(e).__name__}: {e}") from e
        latency_ms = int((time.perf_counter() - t0) * 1000)

        if resp.stop_reason == "refusal":
            raise ModelRefusal(getattr(getattr(resp, "stop_details", None), "category", None))
        try:
            text = next(b.text for b in resp.content if b.type == "text")
        except StopIteration as e:
            raise LLMError("no text block in response") from e
        usage = getattr(resp, "usage", None)
        try:
            raw = resp.model_dump(mode="json")
        except Exception:  # pragma: no cover
            raw = None
        return LLMResult(
            text=text,
            token_logprobs=None,
            tokens_in=getattr(usage, "input_tokens", None) if usage else None,
            tokens_out=getattr(usage, "output_tokens", None) if usage else None,
            latency_ms=latency_ms,
            raw=raw,
        )
