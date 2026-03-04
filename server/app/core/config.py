from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./data/data.db"
    SECRET_KEY: str = "change-me-in-production"
    UPLOAD_DIR: str = "./data/uploads"
    BACKUP_DIR: str = "./data/backups"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 24
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def upload_path(self) -> Path:
        p = Path(self.UPLOAD_DIR)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def data_path(self) -> Path:
        """附件相对路径的根目录 (upload_path 的父目录, 即 ./data)"""
        return self.upload_path.parent


settings = Settings()