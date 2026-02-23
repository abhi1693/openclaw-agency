"""Hello endpoint response schemas."""

from __future__ import annotations

from pydantic import Field
from sqlmodel import SQLModel


class HelloResponse(SQLModel):
    """Response payload for the hello greeting endpoint."""

    message: str = Field(
        description="A friendly greeting message.",
        examples=["Hello, World!"],
    )
