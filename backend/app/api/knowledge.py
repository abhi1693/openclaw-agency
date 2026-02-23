"""Knowledge Hub API: CRUD, hybrid search, and document management."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import require_admin_auth
from app.db.session import get_session
from app.models.knowledge_entries import KnowledgeDocument, KnowledgeEntry
from app.schemas.common import OkResponse
from app.schemas.knowledge import (
    AgentKnowledgeCreate,
    KnowledgeDocumentRead,
    KnowledgeEntryCreate,
    KnowledgeEntryRead,
    KnowledgeEntryUpdate,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
)
from app.services.knowledge_service import KnowledgeService

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.core.auth import AuthContext

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

_ADMIN_AUTH_DEP = Depends(require_admin_auth)
_SESSION_DEP = Depends(get_session)


def _entry_read(entry: KnowledgeEntry, documents: list[KnowledgeDocument] | None = None) -> KnowledgeEntryRead:
    """Convert a KnowledgeEntry ORM object to a read schema."""
    docs = [
        KnowledgeDocumentRead.model_validate(doc, from_attributes=True)
        for doc in (documents or [])
    ]
    return KnowledgeEntryRead(
        id=entry.id,
        organization_id=entry.organization_id,
        board_id=entry.board_id,
        board_group_id=entry.board_group_id,
        agent_id=entry.agent_id,
        title=entry.title,
        content=entry.content,
        category=entry.category,
        tags=entry.tags if entry.tags is not None else [],
        source_type=entry.source_type,
        source_ref=entry.source_ref,
        is_pinned=entry.is_pinned,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        documents=docs,
    )


@router.get("", response_model=dict)
async def list_knowledge(
    category: str | None = Query(default=None),
    board_id: UUID | None = Query(default=None),
    agent_id: UUID | None = Query(default=None),
    is_pinned: bool | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    auth: AuthContext = _ADMIN_AUTH_DEP,
    session: AsyncSession = _SESSION_DEP,
) -> dict:
    """List knowledge entries with optional filters."""
    if auth.organization_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    svc = KnowledgeService(session)
    entries, total = await svc.list_entries(
        auth.organization_id,
        category=category,
        board_id=board_id,
        agent_id=agent_id,
        is_pinned=is_pinned,
        limit=limit,
        offset=offset,
    )
    items = [_entry_read(e) for e in entries]
    return {"items": [i.model_dump(mode="json") for i in items], "total": total}


@router.post("", response_model=KnowledgeEntryRead, status_code=status.HTTP_201_CREATED)
async def create_knowledge(
    payload: KnowledgeEntryCreate,
    auth: AuthContext = _ADMIN_AUTH_DEP,
    session: AsyncSession = _SESSION_DEP,
) -> KnowledgeEntryRead:
    """Create a new knowledge entry."""
    if auth.organization_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    svc = KnowledgeService(session)
    entry = await svc.create_entry(auth.organization_id, payload)
    return _entry_read(entry)


@router.post("/search", response_model=KnowledgeSearchResponse)
async def search_knowledge(
    payload: KnowledgeSearchRequest,
    auth: AuthContext = _ADMIN_AUTH_DEP,
    session: AsyncSession = _SESSION_DEP,
) -> KnowledgeSearchResponse:
    """Search the knowledge base using keyword, semantic, or hybrid mode."""
    if auth.organization_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    svc = KnowledgeService(session)
    entries, scores = await svc.search(
        auth.organization_id,
        payload.query,
        mode=payload.mode,
        board_id=payload.board_id,
        category=payload.category,
        limit=payload.limit,
    )
    items = [_entry_read(e) for e in entries]
    return KnowledgeSearchResponse(items=items, scores=scores)


@router.get("/{entry_id}", response_model=KnowledgeEntryRead)
async def get_knowledge(
    entry_id: UUID,
    auth: AuthContext = _ADMIN_AUTH_DEP,
    session: AsyncSession = _SESSION_DEP,
) -> KnowledgeEntryRead:
    """Get a single knowledge entry by ID."""
    if auth.organization_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    svc = KnowledgeService(session)
    entry = await svc.get_entry(entry_id, auth.organization_id)
    documents = await svc.get_documents(entry_id)
    return _entry_read(entry, documents)


@router.patch("/{entry_id}", response_model=KnowledgeEntryRead)
async def update_knowledge(
    entry_id: UUID,
    payload: KnowledgeEntryUpdate,
    auth: AuthContext = _ADMIN_AUTH_DEP,
    session: AsyncSession = _SESSION_DEP,
) -> KnowledgeEntryRead:
    """Update a knowledge entry."""
    if auth.organization_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    svc = KnowledgeService(session)
    entry = await svc.update_entry(entry_id, auth.organization_id, payload)
    documents = await svc.get_documents(entry_id)
    return _entry_read(entry, documents)


@router.delete("/{entry_id}", response_model=OkResponse)
async def delete_knowledge(
    entry_id: UUID,
    auth: AuthContext = _ADMIN_AUTH_DEP,
    session: AsyncSession = _SESSION_DEP,
) -> OkResponse:
    """Delete a knowledge entry."""
    if auth.organization_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    svc = KnowledgeService(session)
    await svc.delete_entry(entry_id, auth.organization_id)
    return OkResponse()


@router.post("/{entry_id}/pin", response_model=KnowledgeEntryRead)
async def pin_knowledge(
    entry_id: UUID,
    auth: AuthContext = _ADMIN_AUTH_DEP,
    session: AsyncSession = _SESSION_DEP,
) -> KnowledgeEntryRead:
    """Toggle pin status for a knowledge entry."""
    if auth.organization_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    svc = KnowledgeService(session)
    entry = await svc.pin_entry(entry_id, auth.organization_id)
    return _entry_read(entry)


@router.post(
    "/{entry_id}/documents",
    response_model=KnowledgeDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    entry_id: UUID,
    file_name: str = Query(..., max_length=512),
    file_type: str | None = Query(default=None),
    file_size_bytes: int | None = Query(default=None),
    storage_url: str = Query(..., max_length=2048),
    auth: AuthContext = _ADMIN_AUTH_DEP,
    session: AsyncSession = _SESSION_DEP,
) -> KnowledgeDocumentRead:
    """Attach a document reference to a knowledge entry."""
    if auth.organization_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    svc = KnowledgeService(session)
    doc = await svc.add_document(
        entry_id,
        auth.organization_id,
        file_name=file_name,
        file_type=file_type,
        file_size_bytes=file_size_bytes,
        storage_url=storage_url,
    )
    return KnowledgeDocumentRead.model_validate(doc, from_attributes=True)


@router.delete("/documents/{doc_id}", response_model=OkResponse)
async def delete_document(
    doc_id: UUID,
    auth: AuthContext = _ADMIN_AUTH_DEP,
    session: AsyncSession = _SESSION_DEP,
) -> OkResponse:
    """Delete a document attachment."""
    if auth.organization_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    svc = KnowledgeService(session)
    await svc.delete_document(doc_id, auth.organization_id)
    return OkResponse()


# ---------------------------------------------------------------------------
# Agent-facing endpoint
# ---------------------------------------------------------------------------

_agent_router = APIRouter(prefix="/agent/knowledge", tags=["agent"])


@_agent_router.post("", response_model=KnowledgeEntryRead, status_code=status.HTTP_201_CREATED)
async def agent_create_knowledge(
    payload: AgentKnowledgeCreate,
    auth: AuthContext = _ADMIN_AUTH_DEP,
    session: AsyncSession = _SESSION_DEP,
) -> KnowledgeEntryRead:
    """Agent-facing endpoint to save a knowledge entry."""
    if auth.organization_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    svc = KnowledgeService(session)
    create_payload = KnowledgeEntryCreate(
        title=payload.title,
        content=payload.content,
        category=payload.category,
        tags=payload.tags,
        source_type="agent_generated",
        source_ref=payload.source_ref,
        board_id=payload.board_id,
    )
    entry = await svc.create_entry(auth.organization_id, create_payload)
    return _entry_read(entry)
