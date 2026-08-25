from __future__ import annotations

import os

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI


load_dotenv()

DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")


def deepseek_enabled() -> bool:
    return bool(os.getenv("DEEPSEEK_API_KEY"))


def create_deepseek_model(*, temperature: float = 0, api_key: str | None = None) -> ChatOpenAI:
    api_key = (api_key or os.getenv("DEEPSEEK_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY is not configured")
    return ChatOpenAI(
        model=DEEPSEEK_MODEL,
        api_key=api_key,
        base_url=DEEPSEEK_BASE_URL,
        temperature=temperature,
        extra_body={"thinking": {"type": "disabled"}},
    )
