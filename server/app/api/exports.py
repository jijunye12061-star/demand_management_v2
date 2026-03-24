from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.core.deps import DB, CurrentUser, AdminUser
from app.schemas.request import RequestListParams
from app.services.request_service import query_requests
from app.utils.export import generate_excel, FEED_COLUMNS

router = APIRouter(prefix="/exports", tags=["导出"])


@router.get("/requests")
def export_requests(
    db: DB, user: CurrentUser,
    scope: str | None = None,
    request_type: str | None = None,
    research_scope: str | None = None,
    org_type: str | None = None,
    researcher_id: int | None = None,
    sales_id: int | None = None,
    keyword: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
):
    # FIX: 非 admin 强制 scope=feed, 而非 403 拒绝
    if user.role != "admin":
        scope = "feed"

    params = RequestListParams(
        scope=scope, status=status_filter, request_type=request_type,
        research_scope=research_scope, org_type=org_type,
        researcher_id=researcher_id, sales_id=sales_id,
        keyword=keyword, date_from=date_from, date_to=date_to,
        page=1, page_size=10000,
    )
    items, _ = query_requests(db, user, params)
    columns = FEED_COLUMNS if scope == "feed" else None
    buf = generate_excel(items, columns=columns)
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=requests_export.xlsx"},
    )


# FIX: preview 严格 admin-only, 使用 AdminUser 依赖注入
@router.get("/requests/preview")
def export_preview(
    db: DB, admin: AdminUser,
    current: int = Query(1, alias="current"),      # ← 新增
    page_size: int = Query(20, alias="pageSize"),   # ← 新增
    request_type: str | None = None,
    research_scope: str | None = None,
    org_type: str | None = None,
    researcher_id: int | None = None,
    sales_id: int | None = None,
    keyword: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
):
    params = RequestListParams(
        status=status_filter, request_type=request_type,
        research_scope=research_scope, org_type=org_type,
        researcher_id=researcher_id, sales_id=sales_id,
        keyword=keyword, date_from=date_from, date_to=date_to,
        page=current, page_size=page_size,  # ← 用传入值
    )
    items, total = query_requests(db, admin, params)
    return {"items": items, "total": total}