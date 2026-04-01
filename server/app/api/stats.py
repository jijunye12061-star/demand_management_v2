from fastapi import APIRouter

from app.core.deps import DB, AdminUser, CurrentUser
from app.services.stats_service import (
    get_overview, get_researcher_ranking, get_researcher_matrix,
    get_type_matrix, get_org_matrix, get_sales_matrix,
    get_charts, get_downloads,
    # v2: detail endpoints
    get_researcher_detail, get_type_detail, get_org_detail, get_sales_detail,
    get_org_matrix_v2, get_sales_matrix_v2,
    get_researcher_all_requests,
)

router = APIRouter(prefix="/stats", tags=["统计"])


@router.get("/overview")
def overview(db: DB, admin: AdminUser, period: str = "month"):
    return get_overview(db, period)


@router.get("/my-overview")
def my_overview(db: DB, user: CurrentUser, period: str = "month"):
    """研究员查看自身统计概览（按 researcher_id + 协作双维度）"""
    return get_overview(db, period, researcher_id=user.id)


@router.get("/researcher-ranking")
def researcher_ranking(db: DB, admin: AdminUser, period: str = "month"):
    return get_researcher_ranking(db, period)


@router.get("/researcher-matrix")
def researcher_matrix(db: DB, admin: AdminUser):
    return get_researcher_matrix(db)


@router.get("/researcher-detail")
def researcher_detail(db: DB, admin: AdminUser, user_id: int):
    return get_researcher_detail(db, user_id)


@router.get("/my-detail")
def my_detail(db: DB, user: CurrentUser, period: str = "year"):
    """研究员查看自身详细统计（日趋势+类型分布+今日需求）"""
    return get_researcher_detail(db, user.id, period)


@router.get("/type-matrix")
def type_matrix(db: DB, admin: AdminUser):
    return get_type_matrix(db)


@router.get("/type-detail")
def type_detail(db: DB, admin: AdminUser, request_type: str):
    return get_type_detail(db, request_type)


@router.get("/org-matrix")
def org_matrix(db: DB, admin: AdminUser, period: str = "year"):
    return get_org_matrix_v2(db, period)


@router.get("/org-detail")
def org_detail(db: DB, admin: AdminUser, org_name: str):
    return get_org_detail(db, org_name)


@router.get("/sales-matrix")
def sales_matrix(db: DB, admin: AdminUser):
    return get_sales_matrix_v2(db)


@router.get("/sales-detail")
def sales_detail(db: DB, admin: AdminUser, user_id: int):
    return get_sales_detail(db, user_id)


@router.get("/charts")
def charts(db: DB, admin: AdminUser, period: str = "month"):
    return get_charts(db, period)


@router.get("/downloads")
def downloads(db: DB, admin: AdminUser):
    return get_downloads(db)


@router.get("/researcher-requests")
def researcher_all_requests(
    db: DB, admin: AdminUser,
    user_id: int,
    page: int = 1,
    page_size: int = 10,
):
    """研究员参与的全部需求（主负责 + 协作），用于管理员看板明细展开。"""
    return get_researcher_all_requests(db, user_id, page, page_size)