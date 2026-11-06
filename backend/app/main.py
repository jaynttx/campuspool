import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .db import check_database, init_db, session_factory
from .deps import COOKIE, origin_allowed, user_for_token
from .ratelimit import allow
from .realtime import hub
from .routers.chat import typing_target
from .routers import activities, admin, auth, chat, e2ee, me, misc, ratings, relations, rides
from .tasks import cleanup_loop

log = logging.getLogger("campuspool")


@asynccontextmanager
async def lifespan(app: FastAPI):
    hub.bind(asyncio.get_running_loop())
    task = None
    if settings.database_url:
        init_db()
        task = asyncio.create_task(cleanup_loop())
    else:
        log.warning("DATABASE_URL is not set: the API starts, but sign-in and data endpoints will fail until it is configured.")
    yield
    if task:
        task.cancel()


app = FastAPI(
    title="CampusPool API",
    description="Backend for CampusPool, the Thapar student ride and activity network.",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-Envelope"],
)


@app.middleware("http")
async def reject_foreign_origins(request: Request, call_next):
    """Browsers always send Origin on cross-site writes; refuse any that is not ours."""
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin and not origin_allowed(origin):
            return JSONResponse({"detail": "Origin not allowed."}, status_code=403)
    return await call_next(request)


app.include_router(auth.router)
app.include_router(me.router)
app.include_router(misc.router)
app.include_router(rides.router)
app.include_router(activities.router)
app.include_router(chat.router)
app.include_router(admin.router)
app.include_router(relations.router)
app.include_router(ratings.router)
app.include_router(e2ee.router)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Liveness check. Does not touch the database."""
    return {"status": "ok", "service": "campuspool-api"}


@app.get("/health/db", tags=["system"])
def health_db() -> dict[str, str]:
    return {"database": check_database()}


def _lookup_user_id(token: str | None) -> int | None:
    with session_factory()() as db:
        user = user_for_token(db, token)
        return user.id if user else None


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    origin = ws.headers.get("origin")
    if origin and not origin_allowed(origin):
        await ws.close(code=1008)
        return
    user_id = await run_in_threadpool(_lookup_user_id, ws.cookies.get(COOKIE))
    if user_id is None:
        await ws.close(code=1008)
        return
    await hub.connect(user_id, ws)
    try:
        while True:
            frame = await ws.receive_text()
            await run_in_threadpool(_client_frame, user_id, frame)
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(user_id, ws)


def _client_frame(user_id: int, frame: str) -> None:
    """Browsers send only small hints over the socket: right now just "typing" in a conversation."""
    if len(frame) > 200:
        return
    try:
        data = json.loads(frame)
        convo_id = int(data.get("conversationId", 0))
    except (ValueError, TypeError, AttributeError):
        return
    if data.get("type") != "typing" or convo_id <= 0 or not allow(f"typing:{user_id}", 30, 60):
        return
    with session_factory()() as db:
        other = typing_target(db, convo_id, user_id)
    if other is not None:
        hub.push([other], {"type": "typing", "conversationId": str(convo_id)})
