from sqlalchemy.orm import Session

from app.models.download_log import DownloadLog
from app.models.request import Request
from app.models.user import User
from app.utils.datetime_utils import now_beijing


def log_download(db: Session, request_id: int, user: User, org_name: str | None = None):
    """记录下载日志。org_name 优先使用传入值（feed 模式），否则回退到需求自身的机构名。"""
    if not org_name:
        req = db.get(Request, request_id)
        org_name = req.org_name if req else None

    log = DownloadLog(
        request_id=request_id,
        user_id=user.id,
        org_name=org_name,
        downloaded_at=now_beijing(),
    )
    db.add(log)
    db.commit()
