# app/assistant/schemas.py
# AlgoFin v1 — Assistant request/response schemas

from pydantic import BaseModel


class SendMessageRequest(BaseModel):
    message: str
    stream: bool = True


class MessageResponse(BaseModel):
    role: str       # "user" | "assistant" | "tool"
    content: str
    thread_id: str
    message_id: str
