"""Integration tests for M12: Digital Memory Hub - knowledge CRUD and search."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.models.knowledge_entries import KnowledgeDocument, KnowledgeEntry
from app.schemas.knowledge import (
    KnowledgeEntryCreate,
    KnowledgeEntryUpdate,
    KnowledgeSearchRequest,
)
from app.services.knowledge_service import KnowledgeService


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def org_id():
    return uuid4()


@pytest.fixture
def sample_entry_payload():
    return KnowledgeEntryCreate(
        title="How to deploy FastAPI on Alibaba Cloud",
        content="Step 1: Build Docker image. Step 2: Push to ACR. Step 3: Deploy to ECS.",
        category="deployment",
        tags=["fastapi", "alibaba", "docker"],
        source_type="manual",
    )


# ---------------------------------------------------------------------------
# Unit tests for KnowledgeService (mocked DB session)
# ---------------------------------------------------------------------------


class TestKnowledgeServiceCRUD:
    """Test CRUD operations in KnowledgeService."""

    @pytest.mark.asyncio
    async def test_create_entry_returns_knowledge_entry(self, org_id, sample_entry_payload):
        """create_entry should persist and return a KnowledgeEntry."""
        mock_session = AsyncMock()
        mock_session.add = AsyncMock()
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        svc = KnowledgeService(mock_session)
        # Mock _schedule_embedding_update to be a no-op
        svc._schedule_embedding_update = AsyncMock()

        # Simulate refresh assigning id/timestamps
        async def mock_refresh(obj):
            obj.id = uuid4()
            obj.organization_id = org_id

        mock_session.refresh.side_effect = mock_refresh

        entry = await svc.create_entry(org_id, sample_entry_payload)

        mock_session.add.assert_called_once()
        mock_session.commit.assert_called()
        assert entry.title == sample_entry_payload.title
        assert entry.content == sample_entry_payload.content
        assert entry.category == sample_entry_payload.category

    @pytest.mark.asyncio
    async def test_create_entry_triggers_embedding_schedule(self, org_id, sample_entry_payload):
        """create_entry should schedule an embedding update."""
        mock_session = AsyncMock()

        svc = KnowledgeService(mock_session)
        svc._schedule_embedding_update = AsyncMock()

        async def mock_refresh(obj):
            obj.id = uuid4()

        mock_session.refresh.side_effect = mock_refresh

        await svc.create_entry(org_id, sample_entry_payload)
        svc._schedule_embedding_update.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_entry_raises_404_for_wrong_org(self, org_id):
        """get_entry should raise HTTP 404 if entry belongs to different org."""
        from fastapi import HTTPException

        mock_session = AsyncMock()
        other_org_entry = KnowledgeEntry(
            id=uuid4(),
            organization_id=uuid4(),  # different org
            title="Test",
            content="Test content",
        )
        mock_session.get = AsyncMock(return_value=other_org_entry)

        svc = KnowledgeService(mock_session)
        with pytest.raises(HTTPException) as exc_info:
            await svc.get_entry(uuid4(), org_id)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_get_entry_raises_404_when_missing(self, org_id):
        """get_entry should raise HTTP 404 when entry does not exist."""
        from fastapi import HTTPException

        mock_session = AsyncMock()
        mock_session.get = AsyncMock(return_value=None)

        svc = KnowledgeService(mock_session)
        with pytest.raises(HTTPException) as exc_info:
            await svc.get_entry(uuid4(), org_id)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_pin_entry_toggles_pin_status(self, org_id):
        """pin_entry should flip is_pinned on a knowledge entry."""
        mock_session = AsyncMock()
        entry = KnowledgeEntry(
            id=uuid4(),
            organization_id=org_id,
            title="Pinnable entry",
            content="Content",
            is_pinned=False,
        )
        mock_session.get = AsyncMock(return_value=entry)

        svc = KnowledgeService(mock_session)
        result = await svc.pin_entry(entry.id, org_id)

        assert result.is_pinned is True
        mock_session.add.assert_called_once_with(entry)
        mock_session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_entry_calls_session_delete(self, org_id):
        """delete_entry should call session.delete on the entry."""
        mock_session = AsyncMock()
        entry = KnowledgeEntry(
            id=uuid4(),
            organization_id=org_id,
            title="Delete me",
            content="Content",
        )
        mock_session.get = AsyncMock(return_value=entry)

        svc = KnowledgeService(mock_session)
        await svc.delete_entry(entry.id, org_id)

        mock_session.delete.assert_called_once_with(entry)
        mock_session.commit.assert_called_once()


class TestKnowledgeServiceSearch:
    """Test search modes in KnowledgeService."""

    @pytest.mark.asyncio
    async def test_keyword_search_uses_tsvector_query(self, org_id):
        """_keyword_search should execute a raw SQL tsvector query."""
        mock_session = AsyncMock()
        mock_session.exec = AsyncMock(return_value=AsyncMock(all=AsyncMock(return_value=[])))

        svc = KnowledgeService(mock_session)
        entries, scores = await svc._keyword_search(
            org_id, "fastapi deployment", board_id=None, category=None, limit=10
        )

        assert entries == []
        assert scores == []
        mock_session.exec.assert_called_once()

    @pytest.mark.asyncio
    async def test_semantic_search_without_embedding_returns_empty(self, org_id):
        """_semantic_search with no embedding provider should return empty results."""
        mock_session = AsyncMock()

        svc = KnowledgeService(mock_session)
        svc._embed = AsyncMock(return_value=None)

        entries, scores = await svc._semantic_search(
            org_id, "fastapi deployment", board_id=None, category=None, limit=10
        )

        assert entries == []
        assert scores == []

    @pytest.mark.asyncio
    async def test_hybrid_search_falls_back_to_keyword_when_no_embedding(self, org_id):
        """_hybrid_search should fall back to keyword search when embedding is unavailable."""
        mock_session = AsyncMock()
        mock_session.exec = AsyncMock(return_value=AsyncMock(all=AsyncMock(return_value=[])))

        svc = KnowledgeService(mock_session)
        svc._embed = AsyncMock(return_value=None)
        svc._keyword_search = AsyncMock(return_value=([], []))

        entries, scores = await svc._hybrid_search(
            org_id, "fastapi", board_id=None, category=None, limit=10
        )

        svc._keyword_search.assert_called_once()

    @pytest.mark.asyncio
    async def test_search_dispatches_to_correct_mode(self, org_id):
        """search() should dispatch to the correct internal method based on mode."""
        mock_session = AsyncMock()

        svc = KnowledgeService(mock_session)
        svc._keyword_search = AsyncMock(return_value=([], []))
        svc._semantic_search = AsyncMock(return_value=([], []))
        svc._hybrid_search = AsyncMock(return_value=([], []))

        await svc.search(org_id, "test", mode="keyword")
        svc._keyword_search.assert_called_once()
        svc._semantic_search.assert_not_called()

        await svc.search(org_id, "test", mode="semantic")
        svc._semantic_search.assert_called_once()

        await svc.search(org_id, "test", mode="hybrid")
        svc._hybrid_search.assert_called_once()


class TestEmbeddingProviders:
    """Test embedding provider dispatch."""

    @pytest.mark.asyncio
    async def test_embed_returns_none_when_provider_is_none(self):
        """_embed should return None when provider is 'none'."""
        mock_session = AsyncMock()
        svc = KnowledgeService(mock_session)

        with patch("app.services.knowledge_service.settings") as mock_settings:
            mock_settings.embedding_provider = "none"
            result = await svc._embed("test text")

        assert result is None

    @pytest.mark.asyncio
    async def test_embed_openai_sends_correct_request(self):
        """_embed_openai should call OpenAI API with the correct payload."""
        import httpx

        mock_session = AsyncMock()
        svc = KnowledgeService(mock_session)

        fake_embedding = [0.1] * 1536
        mock_response = AsyncMock()
        mock_response.json = AsyncMock(
            return_value={"data": [{"embedding": fake_embedding}]}
        )
        mock_response.raise_for_status = AsyncMock()

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            with patch("app.services.knowledge_service.settings") as mock_settings:
                mock_settings.embedding_api_key = "sk-test"
                mock_settings.embedding_model = "text-embedding-ada-002"
                result = await svc._embed_openai("test text")

        assert result == fake_embedding

    @pytest.mark.asyncio
    async def test_embed_handles_provider_error_gracefully(self):
        """_embed should return None when provider raises an exception."""
        mock_session = AsyncMock()
        svc = KnowledgeService(mock_session)

        with patch("app.services.knowledge_service.settings") as mock_settings:
            mock_settings.embedding_provider = "openai"
            mock_settings.embedding_api_key = "sk-test"
            mock_settings.embedding_model = "text-embedding-ada-002"
            svc._embed_openai = AsyncMock(side_effect=Exception("API error"))
            result = await svc._embed("test text")

        assert result is None


class TestKnowledgeDocuments:
    """Test document attachment management."""

    @pytest.mark.asyncio
    async def test_add_document_creates_document_record(self, org_id):
        """add_document should create and return a KnowledgeDocument."""
        mock_session = AsyncMock()
        entry_id = uuid4()
        entry = KnowledgeEntry(
            id=entry_id,
            organization_id=org_id,
            title="Entry",
            content="Content",
        )
        mock_session.get = AsyncMock(return_value=entry)

        svc = KnowledgeService(mock_session)
        doc = await svc.add_document(
            entry_id,
            org_id,
            file_name="report.pdf",
            file_type="application/pdf",
            file_size_bytes=102400,
            storage_url="https://oss.example.com/bucket/report.pdf",
        )

        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()
        assert doc.file_name == "report.pdf"
        assert doc.knowledge_entry_id == entry_id

    @pytest.mark.asyncio
    async def test_delete_document_raises_404_for_missing_doc(self, org_id):
        """delete_document should raise HTTP 404 when document does not exist."""
        from fastapi import HTTPException

        mock_session = AsyncMock()
        mock_session.get = AsyncMock(return_value=None)

        svc = KnowledgeService(mock_session)
        with pytest.raises(HTTPException) as exc_info:
            await svc.delete_document(uuid4(), org_id)
        assert exc_info.value.status_code == 404
