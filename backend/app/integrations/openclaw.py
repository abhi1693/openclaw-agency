from __future__ import annotations

import os
from typing import Any

import requests


class OpenClawClient:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip("/")
        self.token = token

    @classmethod
    def from_env(cls) -> "OpenClawClient | None":
        url = os.environ.get("OPENCLAW_GATEWAY_URL")
        token = os.environ.get("OPENCLAW_GATEWAY_TOKEN")
        if not url or not token:
            return None
        return cls(url, token)

    def tools_invoke(self, tool: str, args: dict[str, Any], *, session_key: str | None = None, timeout_s: float = 5.0) -> dict[str, Any]:
        payload: dict[str, Any] = {"tool": tool, "args": args}
        if session_key is not None:
            payload["sessionKey"] = session_key

        r = requests.post(
            f"{self.base_url}/tools/invoke",
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
            json=payload,
            timeout=timeout_s,
        )
        r.raise_for_status()
        return r.json()
