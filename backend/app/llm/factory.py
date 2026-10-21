from __future__ import annotations

from .base import LLMProvider, ProviderConfig


def get_provider(cfg: ProviderConfig) -> LLMProvider:
    if cfg.provider in ("vllm", "openai_compatible"):
        from .openai_compat import OpenAICompatProvider

        return OpenAICompatProvider(cfg)
    if cfg.provider == "anthropic":
        from .anthropic_provider import AnthropicProvider

        return AnthropicProvider(cfg)
    if cfg.provider == "mock":
        from .mock import MockProvider

        return MockProvider(cfg)
    raise ValueError(f"unknown provider {cfg.provider!r}")
