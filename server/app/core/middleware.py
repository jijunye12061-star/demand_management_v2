from fastapi import Request
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
import json


class ResponseWrapperMiddleware(BaseHTTPMiddleware):
    """Wrap all JSON responses in {code, data, message} format per project.md §4."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Don't wrap file/streaming responses or OpenAPI docs
        if isinstance(response, (StreamingResponse, FileResponse)):
            return response
        if request.url.path in ("/docs", "/openapi.json", "/redoc"):
            return response

        # Read response body
        body = b""
        async for chunk in response.body_iterator:
            body += chunk if isinstance(chunk, bytes) else chunk.encode()

        if not body:
            return response

        # Only wrap JSON responses
        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type:
            return response

        try:
            data = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return response

        # Already wrapped or error response
        if isinstance(data, dict) and "code" in data and "data" in data:
            return response

        # Error responses from HTTPException
        if response.status_code >= 400:
            detail = data.get("detail", "error") if isinstance(data, dict) else str(data)
            wrapped = {"code": response.status_code * 100, "data": None, "message": detail}
            return JSONResponse(content=wrapped, status_code=response.status_code)

        # Success: wrap in standard format
        wrapped = {"code": 0, "data": data, "message": "ok"}
        return JSONResponse(content=wrapped, status_code=response.status_code)
