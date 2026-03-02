from pydantic import BaseModel


class OverviewResponse(BaseModel):
    total: int = 0
    pending: int = 0
    in_progress: int = 0
    completed: int = 0
    total_hours: float = 0


class ResearcherRankItem(BaseModel):
    user_id: int
    display_name: str
    completed_count: int = 0
    work_hours: float = 0
    pending_count: int = 0
    in_progress_count: int = 0


class MatrixRow(BaseModel):
    name: str
    today: int = 0
    week: int = 0
    month: int = 0
    quarter: int = 0
    year: int = 0


class ChartItem(BaseModel):
    name: str
    value: int = 0


class ResearcherWorkloadItem(BaseModel):
    name: str
    completed: int = 0
    in_progress: int = 0
    pending: int = 0


class ChartsResponse(BaseModel):
    type_distribution: list[ChartItem]
    org_type_distribution: list[ChartItem]
    researcher_workload: list[ResearcherWorkloadItem]


class DownloadTopItem(BaseModel):
    request_id: int
    title: str
    total_count: int = 0
    unique_users: int = 0


class DownloadLogItem(BaseModel):
    request_title: str | None = None
    user_name: str | None = None
    org_name: str | None = None
    downloaded_at: str | None = None


class DownloadsResponse(BaseModel):
    top_downloads: list[DownloadTopItem]
    recent_logs: list[DownloadLogItem]
