"""Knowledge Hub service: CRUD, keyword search, semantic search, hybrid search."""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any, Literal
from uuid import UUID

import httpx
from fastapi import HTTPException, status
from sqlalchemy import text
from sqlmodel import col, select

from app.core.config import settings
from app.core.time import utcnow
from app.models.knowledge_entries import KnowledgeDocument, KnowledgeEntry
from app.schemas.knowledge import KnowledgeEntryCreate, KnowledgeEntryUpdate

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = logging.getLogger(__name__)

KEYWORD_WEIGHT = 0.3
SEMANTIC_WEIGHT = 0.7


class KnowledgeService:
    """Business logic for the Digital Memory Hub."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ------------------------------------------------------------------
    # CRUD helpers
    # ------------------------------------------------------------------

    async def list_entries(
        self,
        org_id: UUID,
        *,
        category: str | None = None,
        board_id: UUID | None = None,
        agent_id: UUID | None = None,
        tags: list[str] | None = None,
        is_pinned: bool | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[KnowledgeEntry], int]:
        """Return paginated knowledge entries matching the filters."""
        statement = select(KnowledgeEntry).where(
            col(KnowledgeEntry.organization_id) == org_id
        )
        if category:
            statement = statement.where(col(KnowledgeEntry.category) == category)
        if board_id:
            statement = statement.where(col(KnowledgeEntry.board_id) == board_id)
        if agent_id:
            statement = statement.where(col(KnowledgeEntry.agent_id) == agent_id)
        if is_pinned is not None:
            statement = statement.where(col(KnowledgeEntry.is_pinned) == is_pinned)

        count_result = await self._session.exec(statement)
        all_items = list(count_result.all())
        total = len(all_items)

        statement = (
            statement.order_by(
                col(KnowledgeEntry.is_pinned).desc(),
                col(KnowledgeEntry.created_at).desc(),
            )
            .offset(offset)
            .limit(limit)
        )
        result = await self._session.exec(statement)
        return list(result.all()), total

    async def get_entry(self, entry_id: UUID, org_id: UUID) -> KnowledgeEntry:
        """Fetch a knowledge entry by ID, verifying org ownership."""
        entry = await self._session.get(KnowledgeEntry, entry_id)
        if entry is None or entry.organization_id != org_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        return entry

    async def create_entry(
        self,
        org_id: UUID,
        payload: KnowledgeEntryCreate,
        *,
        created_by_agent_id: UUID | None = None,
    ) -> KnowledgeEntry:
        """Create a new knowledge entry and trigger async embedding generation."""
        entry = KnowledgeEntry(
            organization_id=org_id,
            board_id=payload.board_id,
            board_group_id=payload.board_group_id,
            agent_id=payload.agent_id or created_by_agent_id,
            title=payload.title,
            content=payload.content,
            category=payload.category,
            tags=payload.tags,
            source_type=payload.source_type,
            source_ref=payload.source_ref,
        )
        self._session.add(entry)
        await self._session.commit()
        await self._session.refresh(entry)
        # Trigger embedding update in background (best-effort)
        await self._schedule_embedding_update(entry)
        return entry

    async def update_entry(
        self,
        entry_id: UUID,
        org_id: UUID,
        payload: KnowledgeEntryUpdate,
    ) -> KnowledgeEntry:
        """Apply a partial update to a knowledge entry."""
        entry = await self.get_entry(entry_id, org_id)
        updates = payload.model_dump(exclude_unset=True)
        for key, value in updates.items():
            setattr(entry, key, value)
        entry.updated_at = utcnow()
        self._session.add(entry)
        await self._session.commit()
        await self._session.refresh(entry)
        # Refresh embedding if content/title changed
        if "content" in updates or "title" in updates:
            await self._schedule_embedding_update(entry)
        return entry

    async def delete_entry(self, entry_id: UUID, org_id: UUID) -> None:
        """Delete a knowledge entry and its documents."""
        entry = await self.get_entry(entry_id, org_id)
        await self._session.delete(entry)
        await self._session.commit()

    async def pin_entry(self, entry_id: UUID, org_id: UUID) -> KnowledgeEntry:
        """Toggle pin status for a knowledge entry."""
        entry = await self.get_entry(entry_id, org_id)
        entry.is_pinned = not entry.is_pinned
        entry.updated_at = utcnow()
        self._session.add(entry)
        await self._session.commit()
        await self._session.refresh(entry)
        return entry

    async def get_documents(self, entry_id: UUID) -> list[KnowledgeDocument]:
        """List all documents attached to a knowledge entry."""
        result = await self._session.exec(
            select(KnowledgeDocument).where(
                col(KnowledgeDocument.knowledge_entry_id) == entry_id
            )
        )
        return list(result.all())

    async def add_document(
        self,
        entry_id: UUID,
        org_id: UUID,
        *,
        file_name: str,
        file_type: str | None,
        file_size_bytes: int | None,
        storage_url: str,
    ) -> KnowledgeDocument:
        """Attach a document record to a knowledge entry."""
        # Verify entry belongs to org
        await self.get_entry(entry_id, org_id)
        doc = KnowledgeDocument(
            knowledge_entry_id=entry_id,
            file_name=file_name,
            file_type=file_type,
            file_size_bytes=file_size_bytes,
            storage_url=storage_url,
        )
        self._session.add(doc)
        await self._session.commit()
        await self._session.refresh(doc)
        return doc

    async def delete_document(self, doc_id: UUID, org_id: UUID) -> None:
        """Delete a document attachment, verifying org ownership via entry."""
        doc = await self._session.get(KnowledgeDocument, doc_id)
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        # Verify org ownership
        await self.get_entry(doc.knowledge_entry_id, org_id)
        await self._session.delete(doc)
        await self._session.commit()

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    async def search(
        self,
        org_id: UUID,
        query: str,
        *,
        mode: Literal["keyword", "semantic", "hybrid"] = "hybrid",
        board_id: UUID | None = None,
        category: str | None = None,
        limit: int = 20,
    ) -> tuple[list[KnowledgeEntry], list[float]]:
        """Run keyword, semantic, or hybrid search over knowledge entries."""
        if mode == "keyword":
            return await self._keyword_search(
                org_id, query, board_id=board_id, category=category, limit=limit
            )
        if mode == "semantic":
            return await self._semantic_search(
                org_id, query, board_id=board_id, category=category, limit=limit
            )
        # hybrid
        return await self._hybrid_search(
            org_id, query, board_id=board_id, category=category, limit=limit
        )

    async def _keyword_search(
        self,
        org_id: UUID,
        query: str,
        *,
        board_id: UUID | None,
        category: str | None,
        limit: int,
    ) -> tuple[list[KnowledgeEntry], list[float]]:
        """Full-text keyword search using tsvector @@ plainto_tsquery."""
        filters = "AND e.organization_id = :org_id"
        params: dict[str, Any] = {"org_id": str(org_id), "query": query, "limit": limit}
        if board_id:
            filters += " AND e.board_id = :board_id"
            params["board_id"] = str(board_id)
        if category:
            filters += " AND e.category = :category"
            params["category"] = category

        sql = text(f"""
            SELECT e.id, ts_rank(e.search_vector, plainto_tsquery('english', :query)) AS score
            FROM knowledge_entries e
            WHERE e.search_vector @@ plainto_tsquery('english', :query)
            {filters}
            ORDER BY score DESC
            LIMIT :limit
        """)
        rows = (await self._session.exec(sql.bindparams(**params))).all()  # type: ignore[arg-type]
        return await self._load_entries_with_scores(rows)

    async def _semantic_search(
        self,
        org_id: UUID,
        query: str,
        *,
        board_id: UUID | None,
        category: str | None,
        limit: int,
    ) -> tuple[list[KnowledgeEntry], list[float]]:
        """Semantic vector search using pgvector cosine distance."""
        embedding = await self._embed(query)
        if embedding is None:
            logger.warning("knowledge.semantic_search: embedding generation failed; falling back")
            return [], []

        embedding_str = "[" + ",".join(str(v) for v in embedding) + "]"
        filters = "AND e.organization_id = :org_id AND e.embedding IS NOT NULL"
        params: dict[str, Any] = {
            "org_id": str(org_id),
            "embedding": embedding_str,
            "limit": limit,
        }
        if board_id:
            filters += " AND e.board_id = :board_id"
            params["board_id"] = str(board_id)
        if category:
            filters += " AND e.category = :category"
            params["category"] = category

        sql = text(f"""
            SELECT e.id, (1.0 - (e.embedding::vector <=> :embedding::vector)) AS score
            FROM knowledge_entries e
            WHERE TRUE {filters}
            ORDER BY e.embedding::vector <=> :embedding::vector ASC
            LIMIT :limit
        """)
        rows = (await self._session.exec(sql.bindparams(**params))).all()  # type: ignore[arg-type]
        return await self._load_entries_with_scores(rows)

    async def _hybrid_search(
        self,
        org_id: UUID,
        query: str,
        *,
        board_id: UUID | None,
        category: str | None,
        limit: int,
    ) -> tuple[list[KnowledgeEntry], list[float]]:
        """Hybrid search: blends keyword and semantic scores."""
        embedding = await self._embed(query)
        if embedding is None:
            logger.warning("knowledge.hybrid_search: embedding unavailable; using keyword only")
            return await self._keyword_search(
                org_id, query, board_id=board_id, category=category, limit=limit
            )

        embedding_str = "[" + ",".join(str(v) for v in embedding) + "]"
        filters = "AND e.organization_id = :org_id"
        params: dict[str, Any] = {
            "org_id": str(org_id),
            "query": query,
            "embedding": embedding_str,
            "kw_weight": KEYWORD_WEIGHT,
            "sem_weight": SEMANTIC_WEIGHT,
            "limit": limit,
        }
        if board_id:
            filters += " AND e.board_id = :board_id"
            params["board_id"] = str(board_id)
        if category:
            filters += " AND e.category = :category"
            params["category"] = category

        sql = text(f"""
            SELECT
                e.id,
                COALESCE(
                    :kw_weight * ts_rank(e.search_vector, plainto_tsquery('english', :query)),
                    0
                ) + COALESCE(
                    :sem_weight * (1.0 - (e.embedding::vector <=> :embedding::vector)),
                    0
                ) AS score
            FROM knowledge_entries e
            WHERE (
                (e.search_vector @@ plainto_tsquery('english', :query))
                OR (e.embedding IS NOT NULL)
            ) {filters}
            ORDER BY score DESC
            LIMIT :limit
        """)
        rows = (await self._session.exec(sql.bindparams(**params))).all()  # type: ignore[arg-type]
        return await self._load_entries_with_scores(rows)

    async def _load_entries_with_scores(
        self,
        rows: list[Any],
    ) -> tuple[list[KnowledgeEntry], list[float]]:
        """Load KnowledgeEntry objects for search result rows."""
        if not rows:
            return [], []
        entry_ids = [UUID(str(row[0])) for row in rows]
        score_by_id = {UUID(str(row[0])): float(row[1]) for row in rows}

        result = await self._session.exec(
            select(KnowledgeEntry).where(col(KnowledgeEntry.id).in_(entry_ids))
        )
        entries_by_id = {e.id: e for e in result.all()}

        # Preserve result order
        entries: list[KnowledgeEntry] = []
        scores: list[float] = []
        for entry_id in entry_ids:
            entry = entries_by_id.get(entry_id)
            if entry:
                entries.append(entry)
                scores.append(score_by_id[entry_id])
        return entries, scores

    # ------------------------------------------------------------------
    # Embedding generation
    # ------------------------------------------------------------------

    async def _embed(self, text_input: str) -> list[float] | None:
        """Generate an embedding vector for the given text.

        Provider selected via EMBEDDING_PROVIDER env var:
        - openai: OpenAI text-embedding-ada-002
        - tongyi: Alibaba Tongyi embedding API
        - local: local Ollama-compatible server
        - none / unset: returns None (graceful degradation)
        """
        provider = settings.embedding_provider.lower() if settings.embedding_provider else "none"
        try:
            if provider == "openai":
                return await self._embed_openai(text_input)
            if provider == "tongyi":
                return await self._embed_tongyi(text_input)
            if provider == "local":
                return await self._embed_local(text_input)
        except Exception as exc:
            logger.warning("knowledge.embed failed provider=%s error=%s", provider, exc)
        return None

    async def _embed_openai(self, text_input: str) -> list[float]:
        """Call OpenAI embeddings API."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {settings.embedding_api_key}"},
                json={"model": settings.embedding_model or "text-embedding-ada-002", "input": text_input},
            )
            resp.raise_for_status()
            data = resp.json()
            return data["data"][0]["embedding"]

    async def _embed_tongyi(self, text_input: str) -> list[float]:
        """Call Alibaba Tongyi embedding API."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding",
                headers={
                    "Authorization": f"Bearer {settings.embedding_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.embedding_model or "text-embedding-v1",
                    "input": {"texts": [text_input]},
                    "parameters": {"text_type": "query"},
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data["output"]["embeddings"][0]["embedding"]

    async def _embed_local(self, text_input: str) -> list[float]:
        """Call local Ollama-compatible embedding server."""
        base_url = getattr(settings, "embedding_base_url", None) or "http://localhost:11434"
        model = settings.embedding_model or "nomic-embed-text"
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{base_url}/api/embeddings",
                json={"model": model, "prompt": text_input},
            )
            resp.raise_for_status()
            data = resp.json()
            return data["embedding"]

    async def update_entry_embedding(self, entry_id: UUID, embedding: list[float]) -> None:
        """Directly write an embedding vector to a knowledge entry row."""
        embedding_str = "[" + ",".join(str(v) for v in embedding) + "]"
        sql = text(
            "UPDATE knowledge_entries SET embedding = :embedding::vector "
            "WHERE id = :entry_id"
        )
        await self._session.exec(  # type: ignore[arg-type]
            sql.bindparams(embedding=embedding_str, entry_id=str(entry_id))
        )
        await self._session.commit()

    async def _schedule_embedding_update(self, entry: KnowledgeEntry) -> None:
        """Generate and persist embedding for an entry (best-effort, async)."""
        try:
            text_for_embed = f"{entry.title}\n\n{entry.content}"
            embedding = await self._embed(text_for_embed)
            if embedding:
                await self.update_entry_embedding(entry.id, embedding)
        except Exception as exc:
            logger.warning(
                "knowledge.embedding_update failed entry_id=%s error=%s", entry.id, exc
            )
