"""
SQLite 自动备份服务
- sqlite3.backup() 保证一致性（比 shutil.copy 安全，不怕写入中途复制）
- APScheduler 每日凌晨 3:00 执行
- 自动清理超过 RETENTION_DAYS 天的备份
"""
import sqlite3
import logging
from datetime import datetime, timedelta
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import settings

logger = logging.getLogger("backup")

RETENTION_DAYS = 30


def run_backup() -> Path | None:
    """执行一次备份，返回备份文件路径"""
    # 从 DATABASE_URL 提取实际 db 文件路径
    db_url = settings.DATABASE_URL
    db_path = Path(db_url.replace("sqlite:///", ""))

    backup_dir = Path(settings.BACKUP_DIR)
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"data_{timestamp}.db"

    try:
        # sqlite3.backup() 是在线热备份，对 WAL 模式完全安全
        src = sqlite3.connect(str(db_path))
        dst = sqlite3.connect(str(backup_path))
        src.backup(dst)
        dst.close()
        src.close()

        size_mb = backup_path.stat().st_size / 1024 / 1024
        logger.info(f"备份完成: {backup_path.name} ({size_mb:.1f}MB)")
        return backup_path
    except Exception:
        logger.exception("备份失败")
        return None


def cleanup_old_backups():
    """删除超过 RETENTION_DAYS 天的备份文件"""
    backup_dir = Path(settings.BACKUP_DIR)
    if not backup_dir.exists():
        return

    cutoff = datetime.now() - timedelta(days=RETENTION_DAYS)
    removed = 0
    for f in backup_dir.glob("data_*.db"):
        if f.stat().st_mtime < cutoff.timestamp():
            f.unlink()
            removed += 1
    if removed:
        logger.info(f"已清理 {removed} 个过期备份")


def backup_job():
    """定时任务入口：备份 + 清理"""
    logger.info("开始执行定时备份...")
    run_backup()
    cleanup_old_backups()


# ── 调度器 ──

scheduler = BackgroundScheduler(daemon=True)
scheduler.add_job(
    backup_job,
    trigger=CronTrigger(hour=3, minute=0),
    id="daily_backup",
    replace_existing=True,
)


def start_scheduler():
    if not scheduler.running:
        scheduler.start()
        logger.info("备份调度器已启动 (每日 03:00)")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("备份调度器已停止")
