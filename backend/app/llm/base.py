"""Provider interface. Plain official SDKs (no LangChain) so logprobs and structured outputs stay direct."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class TokenLogprob:
    token: str
    logprob: float
    top_logprobs: list[tuple[str, float]] = field(default_factory=list)


@dataclass
class LLMResult:
    text: str
    token_logprobs: list[TokenLogprob] | None
    tokens_in: int | None
    tokens_out: int | None
    latency_ms: int
    raw: Any = None


class LLMError(Exception):
    """Transport / API error from a provider."""


class ModelRefusal(LLMError):
    def __init__(self, category: str | None = None):
        self.category = category
        super().__init__(f"model refused (category={category})")


class LLMProvider(Protocol):
    async def complete(self, system: str, user: str, schema: dict) -> LLMResult: ...


@dataclass
class ProviderConfig:
    """Plain copy of a ModelConfig row (safe to use outside a DB session)."""

    id: int | None
    name: str
    provider: str
    model_id: str
    base_url: str | None = None
    api_key_env: str | None = None
    supports_logprobs: bool = False
    temperature: float | None = None
    max_tokens: int = 1024
    timeout_s: float = 60
    effort: str | None = None
    use_fallbacks: bool = False

    @classmethod
    def from_row(cls, row: Any) -> "ProviderConfig":
        return cls(
            id=row.id,
            name=row.name,
            provider=row.provider,
            model_id=row.model_id,
            base_url=row.base_url,
            api_key_env=row.api_key_env,
            supports_logprobs=bool(row.supports_logprobs),
            temperature=row.temperature,
            max_tokens=row.max_tokens,
            timeout_s=row.timeout_s,
            effort=row.effort,
            use_fallbacks=bool(row.use_fallbacks),
        )
