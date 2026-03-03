import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Query, status
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.deps import DB, CurrentUser
from app.models.request import Request
from app.services.download_service import log_download

router = APIRouter(prefix="/files", tags=["文件"])


@router.get("/download/{request_id}")
def download_file(
    request_id: int,
    db: DB,
    user: CurrentUser,
    org_name: str | None = Query(None, description="需求动态下载时，销售选择的关联机构名称"),
):
    req = db.get(Request, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "需求不存在")
    if not req.attachment_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "无附件")

    # 保密检查
    if req.is_confidential and user.role != "admin":
        if user.id not in (req.created_by, req.sales_id, req.researcher_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "无权下载")

    path = Path(req.attachment_path)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "文件不存在")

    # 记录下载日志：feed 模式传入 org_name，否则用需求自身的 org_name
    log_download(db, request_id, user, org_name=org_name)

    return FileResponse(path, filename=path.name, media_type="application/octet-stream")


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    upload_dir = settings.upload_path
    dest = upload_dir / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"path": str(dest)}
