from __future__ import annotations

from dataclasses import dataclass

from starlette.requests import Request

@dataclass
class ClerkConfig:
    jwks_url: str
    verify_iat: bool = ...
    leeway: float = ...

class HTTPAuthorizationCredentials:
    scheme: str
    credentials: str
    decoded: dict[str, object] | None

    def __init__(
        self,
        scheme: str,
        credentials: str,
        decoded: dict[str, object] | None = ...,
    ) -> None: ...

class ClerkHTTPBearer:
    def __init__(
        self,
        config: ClerkConfig,
        auto_error: bool = ...,
        add_state: bool = ...,
    ) -> None: ...
    async def __call__(self, request: Request) -> HTTPAuthorizationCredentials | None: ...
