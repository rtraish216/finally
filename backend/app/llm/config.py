"""Environment/config helpers for the LLM package."""

import os
from pathlib import Path

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}
REQUEST_TIMEOUT_SECONDS = 45
HISTORY_LIMIT = 20

# Project root .env (backend/app/llm/config.py -> project root is three parents up from backend/)
ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


def _read_env_file(name: str) -> str | None:
    try:
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            if key.strip() == name:
                return value.strip().strip("'\"")
    except OSError:
        pass
    return None


def get_env(name: str) -> str | None:
    """Read a setting from the process environment, falling back to the project .env file."""
    value = os.environ.get(name)
    if value is None:
        value = _read_env_file(name)
    return value or None


def is_mock_mode() -> bool:
    return (get_env("LLM_MOCK") or "").lower() == "true"


def get_api_key() -> str | None:
    """Return the OpenRouter key and export it so LiteLLM can find it."""
    key = get_env("OPENROUTER_API_KEY")
    if key and key != "your-openrouter-api-key-here":
        os.environ.setdefault("OPENROUTER_API_KEY", key)
        return key
    return None
