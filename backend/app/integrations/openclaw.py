from __future__ import annotations

import logging
import os
import time
from typing import Any

import requests
from requests.exceptions import ReadTimeout, RequestException

logger = logging.getLogger("app.openclaw")


class OpenClawClient:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip("/")
        self.token = token

    @classmethod
    def from_env(cls) -> "OpenClawClient | None":
        # Ensure .env is loaded into os.environ (pydantic Settings reads env_file but
        # does not automatically populate os.environ).
        try:
            from dotenv import load_dotenv

            load_dotenv(override=False)
        except Exception:
            pass

        url = os.environ.get("OPENCLAW_GATEWAY_URL")
        token = os.environ.get("OPENCLAW_GATEWAY_TOKEN")
        if not url or not token:
            return None
        return cls(url, token)

    def tools_invoke(
        self,
        tool: str,
        args: dict[str, Any],
        *,
        session_key: str | None = None,
        timeout_s: float = 10.0,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"tool": tool, "args": args}
        logger.info(
            "openclaw.tools_invoke",
            extra={"tool": tool, "has_session_key": bool(session_key), "timeout_s": timeout_s},
        )
        if session_key is not None:
            payload["sessionKey"] = session_key

        last_err: Exception | None = None
        # Retry a few times; the gateway can be busy and respond slowly.
        for attempt in range(4):
            try:
                r = requests.post(
                    f"{self.base_url}/tools/invoke",
                    headers={
                        "Authorization": f"Bearer {self.token}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    # connect timeout, read timeout
                    timeout=(2.0, timeout_s),
                )
                r.raise_for_status()
                logger.info(
                    "openclaw.tools_invoke: ok",
                    extra={"tool": tool, "status": r.status_code, "attempt": attempt + 1},
                )
                return r.json()
            except ReadTimeout as e:
                last_err = e
                logger.warning(
                    "openclaw.tools_invoke: timeout",
                    extra={"tool": tool, "attempt": attempt + 1, "timeout_s": timeout_s},
                )
                time.sleep(0.5 * (2**attempt))
            except RequestException as e:
                last_err = e
                logger.warning(
                    "openclaw.tools_invoke: request error",
                    extra={"tool": tool, "attempt": attempt + 1, "error": str(e)},
                )
                time.sleep(0.5 * (2**attempt))

        assert last_err is not None
        raise last_err
