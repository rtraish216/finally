"""FinAlly FastAPI application."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
from collections.abc import AsyncIterator
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app import db, services
from app.api import register
from app.market import PriceCache, create_market_data_source, create_stream_router
from app.services import market as tracking
from app.services import runtime

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
SNAPSHOT_INTERVAL_SECONDS = 30

logger = logging.getLogger(__name__)


def find_static_dir() -> Path | None:
    """First existing static export dir: $FINALLY_STATIC_DIR, backend/static, then <root>/static."""
    candidates = [
        os.environ.get("FINALLY_STATIC_DIR"),
        BACKEND_DIR / "static",
        PROJECT_ROOT / "static",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_dir():
            return Path(candidate)
    return None


async def _snapshot_loop() -> None:
    while True:
        await asyncio.sleep(SNAPSHOT_INTERVAL_SECONDS)
        try:
            services.record_snapshot()
        except Exception:
            logger.exception("Portfolio snapshot failed")


def create_app() -> FastAPI:
    load_dotenv(PROJECT_ROOT / ".env")
    cache = PriceCache()
    runtime.configure(cache)

    @contextlib.asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        db.init_db()
        source = create_market_data_source(cache)
        await source.start(sorted(tracking.required_tickers()))
        runtime.configure(cache, source)
        services.record_snapshot()
        snapshot_task = asyncio.create_task(_snapshot_loop(), name="portfolio-snapshots")
        try:
            yield
        finally:
            snapshot_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await snapshot_task
            await source.stop()
            runtime.configure(cache, None)

    app = FastAPI(title="FinAlly", lifespan=lifespan)
    app.include_router(create_stream_router(cache))
    register(app)

    static_dir = find_static_dir()
    if static_dir:
        # Mounted last so it never shadows /api routes.
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app


app = create_app()
