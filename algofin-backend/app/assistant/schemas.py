# app/assistant/schemas.py
# AlgoFin v1 — Assistant request/response schemas

from pydantic import BaseModel, Field


class SendMessageRequest(BaseModel):
    message: str = Field(..., max_length=10000)
    stream: bool = True


class MessageResponse(BaseModel):
    role: str  # "user" | "assistant" | "tool"
    content: str
    thread_id: str
    message_id: str
