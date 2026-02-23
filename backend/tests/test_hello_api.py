"""Tests for the hello greeting endpoint."""

from __future__ import annotations

import pytest

from app.api import hello as hello_api


@pytest.mark.asyncio
async def test_get_hello_returns_greeting_message() -> None:
    """Test that GET /hello returns the expected greeting message."""
    response = await hello_api.get_hello()

    assert response.message == "Hello, World!"
