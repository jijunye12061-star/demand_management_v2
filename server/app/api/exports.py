from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.deps import DB, AdminUser, CurrentUser
from app.schemas.request import RequestListParams
from app.services.request_service import query_requests
from app.utils.export import generate_excel

router = APIRouter(prefix="/exports", tags=["导出"])


@router.get("/requests")
def export_requests(
    db: DB, admin: AdminUser,
    status: str | None = None,
    request_type: str | None = None,
    research_scope: str | None = None,
    org_type: str | None = None,
    researcher_id: int | None = None,
    sales_id: int | None = None,
    keyword: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    params = RequestListParams(
        status=status, request_type=request_type, research_scope=research_scope,
        org_type=org_type, researcher_id=researcher_id, sales_id=sales_id,
        keyword=keyword, date_from=date_from, date_to=date_to,
        page=1, page_size=10000,  # export all
    )
    items, _ = query_requests(db, admin, params)
    buf = generate_excel(items)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=requests_export.xlsx"},
    )


@router.get("/requests/preview")
def export_preview(
    db: DB, admin: AdminUser,
    status: str | None = None,
    request_type: str | None = None,
    research_scope: str | None = None,
    org_type: str | None = None,
    researcher_id: int | None = None,
    sales_id: int | None = None,
    keyword: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    params = RequestListParams(
        status=status, request_type=request_type, research_scope=research_scope,
        org_type=org_type, researcher_id=researcher_id, sales_id=sales_id,
        keyword=keyword, date_from=date_from, date_to=date_to,
        page=1, page_size=20,
    )
    items, total = query_requests(db, admin, params)
    return {"items": items, "total": total}
