"""Hello greeting endpoint for basic health/greeting requests."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.schemas.hello import HelloResponse

router = APIRouter(prefix="/hello", tags=["hello"])


@router.get(
    "",
    response_model=HelloResponse,
    summary="Get Greeting Message",
    description="Returns a simple greeting message for health checks and basic connectivity tests.",
    responses={
        status.HTTP_200_OK: {
            "description": "A friendly greeting message.",
            "content": {
                "application/json": {
                    "example": {"message": "Hello, World!"},
                }
            },
        },
    },
)
async def get_hello() -> HelloResponse:
    """Return a simple greeting message."""
    return HelloResponse(message="Hello, World!")
