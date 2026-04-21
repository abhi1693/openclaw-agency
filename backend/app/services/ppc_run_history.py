"""Run history service - log and query PPC sync/optimizer executions."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.time import utcnow
from app.models.ppc_automation import PpcRunHistory


async def log_run_start(
    session: AsyncSession,
    run_type: str,
    triggered_by: str = "system",
) -> PpcRunHistory:
    """Create a new run history entry and commit it immediately."""
    run = PpcRunHistory(
        run_type=run_type,
        status="started",
        triggered_by=triggered_by,
        started_at=utcnow(),
    )
    session.add(run)
    await session.commit()
    await session.refresh(run)
    return run


async def log_run_end(
    session: AsyncSession,
    run_id: UUID,
    status: str,
    *,
    entities_scanned: int | None = None,
    entities_created: int | None = None,
    entities_updated: int | None = None,
    errors: int | None = None,
    error_detail: str | None = None,
    metadata_json: dict | None = None,
) -> None:
    """Update a run history entry with final results."""
    result = await session.exec(
        select(PpcRunHistory).where(PpcRunHistory.id == run_id)
    )
    run = result.first()
    if run is None:
        return

    run.status = status
    run.finished_at = utcnow()
    run.duration_ms = int(
        (run.finished_at - run.started_at).total_seconds() * 1000
    )
    run.entities_scanned = entities_scanned
    run.entities_created = entities_created
    run.entities_updated = entities_updated
    run.errors = errors
    run.error_detail = error_detail
    if metadata_json is not None:
        run.metadata_json = metadata_json
    await session.commit()


async def list_run_history(
    session: AsyncSession,
    *,
    run_type: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[PpcRunHistory], int]:
    """Return paginated run history entries with total count."""
    query = select(PpcRunHistory)
    count_query = select(func.count()).select_from(PpcRunHistory)

    if run_type:
        query = query.where(PpcRunHistory.run_type == run_type)
        count_query = count_query.where(PpcRunHistory.run_type == run_type)
    if status:
        query = query.where(PpcRunHistory.status == status)
        count_query = count_query.where(PpcRunHistory.status == status)

    query = (
        query.order_by(col(PpcRunHistory.started_at).desc())
        .offset(offset)
        .limit(limit)
    )

    rows = list(await session.exec(query))
    total = (await session.exec(count_query)).one()
    return rows, int(total)
