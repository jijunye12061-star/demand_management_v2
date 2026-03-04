from sqlalchemy.orm import Session

from app.models.download_log import DownloadLog
from app.utils.datetime_utils import now_beijing


def log_download(db: Session, request_id: int, user_id: int, org_name: str | None = None):
    """记录下载日志。
    org_name 由调用方显式传入:
    - 销售 feed 下载: 前端弹窗选择的机构名 (追踪哪个机构对该成果感兴趣)
    - 研究员/admin: 不传, 记录为 null
    不再回退到需求自身的 org_name, 避免混淆统计语义。
    """
    log = DownloadLog(
        request_id=request_id,
        user_id=user_id,
        org_name=org_name,
        downloaded_at=now_beijing(),
    )
    db.add(log)
    db.commit()