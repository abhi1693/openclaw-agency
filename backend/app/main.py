from __future__ import annotations

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.activity import router as activity_router
from app.api.agent import router as agent_router
from app.api.agents import router as agents_router
from app.api.approvals import router as approvals_router
from app.api.auth import router as auth_router
from app.api.board_memory import router as board_memory_router
from app.api.board_onboarding import router as board_onboarding_router
from app.api.boards import router as boards_router
from app.api.gateway import router as gateway_router
from app.api.gateways import router as gateways_router
from app.api.metrics import router as metrics_router
from app.api.tasks import router as tasks_router
from app.api.users import router as users_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.db.session import init_db

configure_logging()

app = FastAPI(title="Mission Control API", version="0.1.0")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
if origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.get("/readyz")
def readyz() -> dict[str, bool]:
    return {"ok": True}


api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(auth_router)
api_v1.include_router(agent_router)
api_v1.include_router(agents_router)
api_v1.include_router(activity_router)
api_v1.include_router(gateway_router)
api_v1.include_router(gateways_router)
api_v1.include_router(metrics_router)
api_v1.include_router(boards_router)
api_v1.include_router(board_memory_router)
api_v1.include_router(board_onboarding_router)
api_v1.include_router(approvals_router)
api_v1.include_router(tasks_router)
api_v1.include_router(users_router)
app.include_router(api_v1)
