import shutil
from urllib.parse import quote

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

    # FIX: attachment_path 存储的是 "uploads/{id}/filename" 相对路径,
    # 需拼接 data_path (即 ./data) 得到实际文件路径
    path = settings.data_path / req.attachment_path
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "文件不存在")

    # 记录下载日志: org_name 直接透传, 研究员/admin 不传则为 null
    log_download(db, request_id, user.id, org_name=org_name)

    # RFC 5987: filename 给 ASCII 兜底, filename* 给 UTF-8 真实名
    encoded_name = quote(path.name)
    response = FileResponse(path, media_type="application/octet-stream")
    response.headers["Content-Disposition"] = (
        f"attachment; filename=\"{encoded_name}\"; filename*=UTF-8''{encoded_name}"
    )
    return response


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    request_id: int | None = Query(None, description="关联的需求 ID, 用于按需求建子目录"),
):
    """备用上传接口。主上传在 POST /requests/{id}/complete 中。"""
    if request_id:
        dest_dir = settings.upload_path / str(request_id)
    else:
        dest_dir = settings.upload_path
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / file.filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    # 返回相对路径, 与 complete 接口保持一致
    rel = f"uploads/{request_id}/{file.filename}" if request_id else f"uploads/{file.filename}"
    return {"path": rel}