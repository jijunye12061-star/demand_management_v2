from sqlalchemy.orm import Session

from app.models.download_log import DownloadLog
from app.models.request import Request
from app.models.user import User
from app.utils.datetime_utils import now_beijing


def log_download(db: Session, request_id: int, user: User):
    req = db.get(Request, request_id)
    if not req:
        return
    log = DownloadLog(
        request_id=request_id,
        user_id=user.id,
        org_name=req.org_name,
        downloaded_at=now_beijing(),
    )
    db.add(log)
    db.commit()
