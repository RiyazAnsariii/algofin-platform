import logging

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)


class RequestBodySizeLimitMiddleware:
    """Reject requests with body larger than max_body_size bytes."""

    def __init__(self, app: ASGIApp, max_body_size: int = 1_048_576) -> None:
        self.app = app
        self.max_body_size = max_body_size

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        content_length = 0
        for header, value in scope.get("headers", []):
            if header == b"content-length":
                content_length = int(value)
                break

        if content_length > self.max_body_size:
            logger.warning(f"Request body too large: {content_length} bytes (max {self.max_body_size})")
            await send({
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                ],
            })
            await send({
                "type": "http.response.body",
                "body": b'{"success":false,"error":{"code":"PAYLOAD_TOO_LARGE","message":"Request body too large"}}',
            })
            return

        await self.app(scope, receive, send)
