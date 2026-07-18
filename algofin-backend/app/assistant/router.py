# app/assistant/router.py
# AlgoFin v1 — AI Assistant endpoints
# POST /assistant/message  → Server-Sent Events stream
# GET  /assistant/thread   → get/create thread + recent messages
# DELETE /assistant/thread → clear chat history

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.assistant.schemas import SendMessageRequest
from app.assistant.service import (
    chat_stream,
    clear_thread,
    get_or_create_thread,
    load_history,
)
from app.common.deps import CurrentUser, DbSession
from app.common.schemas import SuccessResponse

router = APIRouter(prefix="/assistant", tags=["assistant"])


@router.post("/message")
async def send_message(
    body: SendMessageRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> StreamingResponse:
    """
    Send a message and get a streaming SSE response from Gemini.
    Each event is a JSON line prefixed with "data: ".
    """
    user_id = str(current_user.id)

    async def event_generator():
        async for event in chat_stream(db, user_id=user_id, user_message=body.message):
            yield f"data: {json.dumps(event)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/thread", response_model=SuccessResponse[dict])
async def get_thread(
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Get or create the user's persistent chat thread + last 40 messages."""
    user_id = str(current_user.id)
    thread  = await get_or_create_thread(db, user_id=user_id)
    history = await load_history(db, thread_id=str(thread.id))

    return SuccessResponse(data={
        "thread_id": str(thread.id),
        "messages": [
            {
                "id":         str(m.id),
                "role":       m.role,
                "content":    m.content,
                "tool_name":  None,   # kept for frontend compat; no per-message tool_name in v1 schema
                "created_at": m.created_at.isoformat(),
            }
            for m in history
        ],
    })


@router.delete("/thread", response_model=SuccessResponse[dict])
async def reset_thread(
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """Clear the user's chat history (start fresh)."""
    thread = await get_or_create_thread(db, user_id=str(current_user.id))
    await clear_thread(db, thread_id=str(thread.id))
    return SuccessResponse(data={"message": "Chat history cleared."})
