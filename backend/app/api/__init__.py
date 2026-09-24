"""REST API routers and error handling."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.services import ServiceError, TradeError, UnknownTickerError

from . import chat, portfolio, watchlist


def _error(status: int, detail: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": detail})


def _validation_message(exc: RequestValidationError) -> str:
    parts = []
    for err in exc.errors():
        loc = ".".join(str(p) for p in err["loc"] if p != "body")
        parts.append(f"{loc}: {err['msg']}" if loc else err["msg"])
    return "; ".join(parts) or "Invalid request"


def register(app: FastAPI) -> None:
    """Attach API routers and the {"detail": ...} error handlers."""
    app.include_router(portfolio.router)
    app.include_router(watchlist.router)
    app.include_router(chat.router)

    @app.get("/api/health", tags=["system"])
    async def health() -> dict:
        return {"status": "ok"}

    @app.exception_handler(UnknownTickerError)
    async def unknown_ticker(_: Request, exc: UnknownTickerError) -> JSONResponse:
        return _error(404, str(exc))

    @app.exception_handler(ServiceError)
    async def service_error(_: Request, exc: ServiceError) -> JSONResponse:
        return _error(400, str(exc))

    @app.exception_handler(TradeError)
    async def trade_error(_: Request, exc: TradeError) -> JSONResponse:
        return _error(400, str(exc))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return _error(400, _validation_message(exc))

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _error(exc.status_code, str(exc.detail))
