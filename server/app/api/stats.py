from fastapi import APIRouter

from app.core.deps import DB, AdminUser
from app.services.stats_service import (
    get_overview, get_researcher_ranking, get_researcher_matrix,
    get_type_matrix, get_org_matrix, get_sales_matrix,
    get_charts, get_downloads,
)

router = APIRouter(prefix="/stats", tags=["统计"])


@router.get("/overview")
def overview(db: DB, admin: AdminUser, period: str = "month"):
    return get_overview(db, period)


@router.get("/researcher-ranking")
def researcher_ranking(db: DB, admin: AdminUser, period: str = "month"):
    return get_researcher_ranking(db, period)


@router.get("/researcher-matrix")
def researcher_matrix(db: DB, admin: AdminUser):
    return get_researcher_matrix(db)


@router.get("/type-matrix")
def type_matrix(db: DB, admin: AdminUser):
    return get_type_matrix(db)


@router.get("/org-matrix")
def org_matrix(db: DB, admin: AdminUser):
    return get_org_matrix(db)


@router.get("/sales-matrix")
def sales_matrix(db: DB, admin: AdminUser):
    return get_sales_matrix(db)


@router.get("/charts")
def charts(db: DB, admin: AdminUser, period: str = "month"):
    return get_charts(db, period)


@router.get("/downloads")
def downloads(db: DB, admin: AdminUser):
    return get_downloads(db)