from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import json


class ResponseWrapperMiddleware(BaseHTTPMiddleware):
    """Wrap all JSON responses in {code, data, message} format per project.md §4."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Skip OpenAPI docs
        if request.url.path in ("/docs", "/openapi.json", "/redoc"):
            return response

        # 关键修复：在读取 body 之前先检查 content-type
        # call_next() 返回的不再是原始 FileResponse，isinstance 判断无效
        # 只对 JSON 响应做包装，其余（文件流、HTML 等）直接放行
        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type:
            return response

        # 到这里一定是 JSON 响应，安全地读取 body
        body = b""
        async for chunk in response.body_iterator:
            body += chunk if isinstance(chunk, bytes) else chunk.encode()

        if not body:
            return response

        try:
            data = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return JSONResponse(content=body.decode(errors="replace"), status_code=response.status_code)

        # Already wrapped
        if isinstance(data, dict) and "code" in data and "data" in data:
            return JSONResponse(content=data, status_code=response.status_code)

        # Error responses from HTTPException
        if response.status_code >= 400:
            detail = data.get("detail", "error") if isinstance(data, dict) else str(data)
            wrapped = {"code": response.status_code * 100, "data": None, "message": detail}
            return JSONResponse(content=wrapped, status_code=response.status_code)

        # Success: wrap in standard format
        wrapped = {"code": 0, "data": data, "message": "ok"}
        return JSONResponse(content=wrapped, status_code=response.status_code)