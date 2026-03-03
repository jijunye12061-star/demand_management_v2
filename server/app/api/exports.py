from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.core.deps import DB, CurrentUser
from app.schemas.request import RequestListParams
from app.services.request_service import query_requests
from app.utils.export import generate_excel, FEED_COLUMNS

router = APIRouter(prefix="/exports", tags=["导出"])


@router.get("/requests")
def export_requests(
    db: DB, user: CurrentUser,
    scope: str | None = None,
    status_: str | None = None,
    request_type: str | None = None,
    research_scope: str | None = None,
    org_type: str | None = None,
    researcher_id: int | None = None,
    sales_id: int | None = None,
    keyword: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    # 非 feed 导出仅管理员可用
    if scope != "feed" and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "权限不足")

    params = RequestListParams(
        scope=scope,
        status=status_, request_type=request_type, research_scope=research_scope,
        org_type=org_type, researcher_id=researcher_id, sales_id=sales_id,
        keyword=keyword, date_from=date_from, date_to=date_to,
        page=1, page_size=10000,
    )
    items, _ = query_requests(db, user, params)

    # feed 用精简脱敏列，admin 用全量列
    columns = FEED_COLUMNS if scope == "feed" else None
    buf = generate_excel(items, columns=columns)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=requests_export.xlsx"},
    )


@router.get("/requests/preview")
def export_preview(
    db: DB, user: CurrentUser,
    scope: str | None = None,
    status_: str | None = None,
    request_type: str | None = None,
    research_scope: str | None = None,
    org_type: str | None = None,
    researcher_id: int | None = None,
    sales_id: int | None = None,
    keyword: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    if scope != "feed" and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "权限不足")

    params = RequestListParams(
        scope=scope,
        status=status_, request_type=request_type, research_scope=research_scope,
        org_type=org_type, researcher_id=researcher_id, sales_id=sales_id,
        keyword=keyword, date_from=date_from, date_to=date_to,
        page=1, page_size=20,
    )
    items, total = query_requests(db, user, params)
    return {"items": items, "total": total}