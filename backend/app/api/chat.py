"""Chat endpoints. The LLM flow lives in app.llm; this module only delegates to it."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app import db

from .schemas import ChatHistoryResponse, ChatRequest, ChatResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])

HISTORY_LIMIT = 50


async def _handle_chat(message: str) -> dict:
    try:
        from app.llm import handle_chat
    except ImportError:
        return {
            "message": "The AI assistant is not available yet.",
            "trades": [],
            "watchlist_changes": [],
        }
    return await handle_chat(message)


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest) -> dict:
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message must not be empty")
    try:
        return await _handle_chat(request.message)
    except Exception:
        logger.exception("Chat handler failed")
        raise HTTPException(status_code=500, detail="Chat failed unexpectedly") from None


@router.get("/history", response_model=ChatHistoryResponse)
async def history() -> dict:
    return {"messages": db.list_chat_messages(limit=HISTORY_LIMIT)}
