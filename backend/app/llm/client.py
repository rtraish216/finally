"""LiteLLM -> OpenRouter -> Cerebras call."""

from .config import EXTRA_BODY, MODEL, REQUEST_TIMEOUT_SECONDS
from .schemas import LLMResponse


async def call_llm(messages: list[dict]) -> str:
    """Call the model with structured output and return the raw message content."""
    from litellm import acompletion  # imported lazily: slow import, not needed in mock mode

    response = await acompletion(
        model=MODEL,
        messages=messages,
        response_format=LLMResponse,
        reasoning_effort="low",
        extra_body=EXTRA_BODY,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    return response.choices[0].message.content or ""
