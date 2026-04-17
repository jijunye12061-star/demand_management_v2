from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.backup import start_scheduler, stop_scheduler
from app.core.middleware import ResponseWrapperMiddleware
from app.api import auth, requests, users, organizations, teams, files, stats, exports, templates
from app.api import progress_updates, features


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="研究服务管理系统", version="3.0.0", lifespan=lifespan)

# CORS - allow all for development, restrict in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Unified response wrapper: {code, data, message}
app.add_middleware(ResponseWrapperMiddleware)

# Mount all routers under /api/v1
PREFIX = "/api/v1"
app.include_router(auth.router, prefix=PREFIX)
app.include_router(requests.router, prefix=PREFIX)
app.include_router(users.router, prefix=PREFIX)
app.include_router(organizations.router, prefix=PREFIX)
app.include_router(teams.router, prefix=PREFIX)
app.include_router(files.router, prefix=PREFIX)
app.include_router(stats.router, prefix=PREFIX)
app.include_router(exports.router, prefix=PREFIX)
app.include_router(templates.router, prefix=PREFIX)
app.include_router(progress_updates.router, prefix=PREFIX)
app.include_router(features.router, prefix=PREFIX)


@app.get("/")
def root():
    return {"service": "研究服务管理系统", "version": "3.0.0"}