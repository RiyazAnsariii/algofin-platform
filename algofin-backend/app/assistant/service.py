# app/assistant/service.py
# AlgoFin v1 — Gemini assistant core service
#
# Architecture:
#   - One chat thread per user (chat_threads table, one row per user)
#   - Messages persisted in chat_messages table (our own history store)
#   - Each request: load last N messages → send to Gemini with history
#   - Gemini function calling: tool_use → dispatch → tool_result → continue
#   - Streaming: async generator yields chunks as SSE events
#   - Model: gemini-2.0-flash (free tier, 1M token context)
#
# System prompt: injected with user's portfolio context on every call.

import json
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator

import google.generativeai as genai
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.assistant.tools import GEMINI_TOOL_DECLARATIONS, dispatch_tool
from app.config import settings
from app.models.assistant import ChatMessage, ChatThread
from app.models.user import User

logger = logging.getLogger(__name__)

# ── Gemini system prompt ──────────────────────────────────────────
SYSTEM_PROMPT = """You are the AlgoFin trading assistant — an expert in Binance USDT-M Futures trading.

You have access to the user's live portfolio data through tools. Always use the tools to fetch real data before answering portfolio-specific questions.

## Rules
- Be concise and precise. Use numbers from tools — never make up portfolio data.
- For PnL questions: call get_monthly_pnl() or get_portfolio_summary() first.
- "Estimated monthly fee" is 20% of monthly realized profit — display only, not collected during beta.
- Never call it "performance fee" or "invoice" — always "estimated monthly fee".
- Unrealized PnL is for display only — it is NOT included in the billing calculation.
- You cover Binance USDT-M Futures ONLY. No spot, no coin-M.
- Format currency as USDT with 2 decimal places, e.g. "$1,234.56 USDT".

## Your tools
- get_portfolio_summary: quick overview (balance, positions, MTD PnL, est. fee)
- get_monthly_pnl: realized PnL for any month
- get_estimated_fee: current billing period estimate
- get_open_positions: live positions with unrealized PnL
- get_recent_trades: recent closed trades
- get_economic_events: upcoming macro events from the calendar

Always be helpful about trading context (market dynamics, risk, strategy concepts), but never give specific trade recommendations."""


# ── Thread helpers ────────────────────────────────────────────────

async def get_or_create_thread(db: AsyncSession, *, user_id: str) -> ChatThread:
    """Get or create the single persistent thread for this user."""
    result = await db.execute(
        select(ChatThread).where(ChatThread.user_id == user_id)
    )
    thread = result.scalar_one_or_none()
    if thread is None:
        thread = ChatThread(user_id=user_id)
        db.add(thread)
        await db.commit()
        await db.refresh(thread)
    return thread


async def load_history(
    db: AsyncSession,
    *,
    thread_id: str,
    max_messages: int | None = None,
) -> list[ChatMessage]:
    """Load recent messages for this thread (ordered oldest first)."""
    limit = max_messages or settings.assistant_max_history
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    # Return in chronological order (oldest first)
    return list(reversed(result.scalars().all()))


async def save_message(
    db: AsyncSession,
    *,
    thread_id: str,
    role: str,
    content: str,
    tool_name: str | None = None,
) -> ChatMessage:
    """Persist a message to the DB."""
    msg = ChatMessage(
        thread_id=thread_id,
        role=role,
        content=content,
        tool_name=tool_name,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


async def clear_thread(db: AsyncSession, *, thread_id: str) -> None:
    """Delete all messages in a thread (keeps the thread row)."""
    from sqlalchemy import delete
    await db.execute(delete(ChatMessage).where(ChatMessage.thread_id == thread_id))
    await db.commit()


# ── Gemini client builder ─────────────────────────────────────────

def _build_gemini_model() -> genai.GenerativeModel:
    """Configure and return a Gemini GenerativeModel with tools."""
    genai.configure(api_key=settings.gemini_api_key)

    tools = genai.protos.Tool(
        function_declarations=[
            genai.protos.FunctionDeclaration(
                name=t["name"],
                description=t["description"],
                parameters=genai.protos.Schema(
                    type=genai.protos.Type.OBJECT,
                    properties={
                        k: genai.protos.Schema(
                            type=genai.protos.Type.STRING
                            if v.get("type") == "string"
                            else genai.protos.Type.INTEGER
                            if v.get("type") == "integer"
                            else genai.protos.Type.STRING,
                            description=v.get("description", ""),
                            enum=v.get("enum"),
                        )
                        for k, v in t["parameters"].get("properties", {}).items()
                    },
                    required=t["parameters"].get("required", []),
                ),
            )
            for t in GEMINI_TOOL_DECLARATIONS
        ]
    )

    return genai.GenerativeModel(
        model_name=settings.gemini_model,
        system_instruction=SYSTEM_PROMPT,
        tools=[tools],
        generation_config=genai.GenerationConfig(
            temperature=0.4,
            top_p=0.95,
            max_output_tokens=2048,
        ),
    )


# ── History → Gemini format ───────────────────────────────────────

def _messages_to_gemini_history(messages: list[ChatMessage]) -> list[dict]:
    """Convert DB ChatMessage rows to Gemini chat history format."""
    history = []
    for msg in messages:
        if msg.role == "user":
            history.append({"role": "user", "parts": [{"text": msg.content}]})
        elif msg.role == "assistant":
            history.append({"role": "model", "parts": [{"text": msg.content}]})
        # Skip tool messages from history — Gemini handles them internally
    return history


# ── Main: streaming chat ──────────────────────────────────────────

async def chat_stream(
    db: AsyncSession,
    *,
    user_id: str,
    user_message: str,
) -> AsyncGenerator[dict, None]:
    """
    Main streaming chat function.
    Yields SSE-compatible dicts with type and content.

    Yields:
      {"type": "start"}
      {"type": "chunk", "content": "...text..."}
      {"type": "tool_call", "tool": "name", "args": {...}}
      {"type": "tool_result", "tool": "name", "result": {...}}
      {"type": "done", "message_id": "..."}
      {"type": "error", "message": "..."}
    """
    if not settings.gemini_api_key:
        yield {"type": "error", "message": "GEMINI_API_KEY not configured. Get a free key at https://aistudio.google.com/app/apikey"}
        return

    try:
        # Load thread + history
        thread = await get_or_create_thread(db, user_id=user_id)
        history = await load_history(db, thread_id=str(thread.id))

        # Save user message to DB
        await save_message(db, thread_id=str(thread.id), role="user", content=user_message)

        yield {"type": "start"}

        # Build Gemini model and chat session with history
        model = _build_gemini_model()
        gemini_history = _messages_to_gemini_history(history)
        chat = model.start_chat(history=gemini_history)

        # Send message and handle function calling loop
        full_response = ""
        response = await chat.send_message_async(user_message, stream=False)
        # Note: Using non-streaming first to handle tool calls cleanly,
        # then we stream the final text response.

        # Function calling loop
        max_tool_rounds = 5
        for _ in range(max_tool_rounds):
            # Check for function calls
            fn_calls = [
                part.function_call
                for candidate in response.candidates
                for part in candidate.content.parts
                if hasattr(part, "function_call") and part.function_call.name
            ]

            if not fn_calls:
                # No tool calls — extract text response
                for candidate in response.candidates:
                    for part in candidate.content.parts:
                        if hasattr(part, "text") and part.text:
                            full_response += part.text
                break

            # Execute each tool call
            tool_responses = []
            for fn_call in fn_calls:
                tool_name = fn_call.name
                tool_args = dict(fn_call.args) if fn_call.args else {}

                yield {"type": "tool_call", "tool": tool_name, "args": tool_args}

                try:
                    result = await dispatch_tool(tool_name, tool_args, db, user_id)
                except Exception as exc:
                    result = {"error": str(exc)}

                yield {"type": "tool_result", "tool": tool_name, "result": result}

                tool_responses.append(
                    genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=tool_name,
                            response={"result": result},
                        )
                    )
                )

            # Send tool results back to Gemini
            response = await chat.send_message_async(
                genai.protos.Content(parts=tool_responses, role="user"),
                stream=False,
            )

        # Stream the final text response word by word for UX
        if full_response:
            # Yield in chunks for streaming effect
            words = full_response.split(" ")
            chunk = ""
            for i, word in enumerate(words):
                chunk += word + " "
                if (i + 1) % 5 == 0 or i == len(words) - 1:
                    yield {"type": "chunk", "content": chunk}
                    chunk = ""
        else:
            yield {"type": "chunk", "content": "(No response generated)"}

        # Save assistant response to DB
        saved = await save_message(
            db, thread_id=str(thread.id), role="assistant", content=full_response.strip()
        )

        yield {"type": "done", "message_id": str(saved.id)}

    except Exception as exc:
        logger.exception(f"chat_stream error for user {user_id}: {exc}")
        yield {"type": "error", "message": f"Assistant error: {str(exc)}"}
