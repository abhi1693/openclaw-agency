"""Seed Mission Control data using EXISTING models + new MC models.

Maps: Organization → YourFaithful Inc
      BoardGroup → Department (Leadership, Engineering, Growth, etc.)
      Board → Brand (Plentum, Mavena, PawFully, etc.)
      Agent → Our 14 AI agents
      Tag → Task categories
"""

from __future__ import annotations

import asyncio
import json
from datetime import date, datetime
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.time import utcnow
from app.db.session import async_session_maker, init_db
from app.models.agents import Agent
from app.models.boards import Board
from app.models.board_groups import BoardGroup
from app.models.gateways import Gateway
from app.models.organizations import Organization
from app.models.tags import Tag
from app.models.activity_events import ActivityEvent
from app.core.mc_auth import hash_password
from app.models.mc_models import (
    Brand,
    MCAgent,
    MCUser,
    PerformanceSnapshot,
    ActivityFeedEntry,
    MCTask,
)

# ── Fixed UUIDs for deterministic seeding ──
ORG_ID = UUID("00000000-0000-0000-0000-000000000001")
GW_ID = UUID("00000000-0000-0000-0000-000000000002")

DEPARTMENTS = {
    "leadership": UUID("10000000-0000-0000-0000-000000000001"),
    "engineering": UUID("10000000-0000-0000-0000-000000000002"),
    "growth": UUID("10000000-0000-0000-0000-000000000003"),
    "content": UUID("10000000-0000-0000-0000-000000000004"),
    "creative": UUID("10000000-0000-0000-0000-000000000005"),
    "paid_media": UUID("10000000-0000-0000-0000-000000000006"),
    "operations": UUID("10000000-0000-0000-0000-000000000007"),
    "retention": UUID("10000000-0000-0000-0000-000000000008"),
    "product": UUID("10000000-0000-0000-0000-000000000009"),
    "analytics": UUID("10000000-0000-0000-0000-00000000000a"),
}

BRAND_BOARDS = {
    "plentum": UUID("20000000-0000-0000-0000-000000000001"),
    "mavena": UUID("20000000-0000-0000-0000-000000000002"),
    "pawfully": UUID("20000000-0000-0000-0000-000000000003"),
    "wespod": UUID("20000000-0000-0000-0000-000000000004"),
    "yourfaithful": UUID("20000000-0000-0000-0000-000000000005"),
}

AGENTS_DATA = [
    {"name": "Nova", "emoji": "🧠", "role": "Chief of Staff", "dept": "leadership", "model": "claude-opus-4", "is_lead": True},
    {"name": "Pixel", "emoji": "💻", "role": "Senior Full-Stack Developer", "dept": "engineering", "model": "claude-opus-4", "is_lead": True},
    {"name": "Sage", "emoji": "📊", "role": "Data & Analytics Lead", "dept": "analytics", "model": "claude-sonnet-4", "is_lead": True},
    {"name": "Echo", "emoji": "📣", "role": "Growth Marketing Manager", "dept": "growth", "model": "claude-sonnet-4", "is_lead": True},
    {"name": "Buzz", "emoji": "📱", "role": "Social Media Manager", "dept": "growth", "model": "claude-sonnet-4", "is_lead": False},
    {"name": "Quill", "emoji": "✍️", "role": "Content Strategist", "dept": "content", "model": "claude-sonnet-4", "is_lead": True},
    {"name": "Iris", "emoji": "🎨", "role": "Creative Director", "dept": "creative", "model": "claude-sonnet-4", "is_lead": True},
    {"name": "Bolt", "emoji": "⚡", "role": "Paid Media Specialist", "dept": "paid_media", "model": "claude-sonnet-4", "is_lead": True},
    {"name": "Scout", "emoji": "🔍", "role": "SEO & Organic Growth", "dept": "growth", "model": "claude-sonnet-4", "is_lead": False},
    {"name": "Atlas", "emoji": "🗺️", "role": "Operations Manager", "dept": "operations", "model": "claude-sonnet-4", "is_lead": True},
    {"name": "Ember", "emoji": "🔥", "role": "Email & Retention", "dept": "retention", "model": "claude-sonnet-4", "is_lead": True},
    {"name": "Dash", "emoji": "🏃", "role": "QA & Testing Lead", "dept": "engineering", "model": "claude-sonnet-4", "is_lead": False},
    {"name": "Lumen", "emoji": "💡", "role": "Product Manager", "dept": "product", "model": "claude-sonnet-4", "is_lead": True},
    {"name": "Sentinel", "emoji": "🛡️", "role": "QA Gate Keeper", "dept": "engineering", "model": "claude-sonnet-4", "is_lead": False},
]

BRANDS_DATA = [
    {"name": "plentum", "type": "ecommerce", "domain": "plentum.com", "shopify_store": "plentumstore", "shopify_token": "", "meta_ad_account": "act_736405932421739", "revenue_target": 100000},
    {"name": "mavena", "type": "ecommerce", "domain": "mavenaco.com", "shopify_store": "e1jy1j-sg", "shopify_token": "", "meta_ad_account": "act_1002679805332780", "revenue_target": 50000},
    {"name": "pawfully", "type": "ecommerce", "domain": "pawfully.co", "shopify_store": "pawfullyco", "shopify_token": "", "revenue_target": 30000},
    {"name": "wespod", "type": "services", "domain": "wespod.com", "revenue_target": 20000},
    {"name": "yourfaithful", "type": "holding", "domain": "yourfaithful.com", "revenue_target": 200000},
]

TAG_NAMES = ["engineering", "analytics", "paid-media", "content", "seo", "retention", "creative", "priority", "testing", "email", "shopify", "meta-ads"]


async def seed() -> None:
    await init_db()
    async with async_session_maker() as session:
        # Check if already seeded
        existing = await session.exec(select(Organization).where(Organization.id == ORG_ID))  # type: ignore[arg-type]
        if existing.first():
            print("Already seeded (org exists), skipping.")
            return

        # 1. Organization
        org = Organization(id=ORG_ID, name="YourFaithful Inc")
        session.add(org)

        # 2. Gateway (our OpenClaw instance)
        gw = Gateway(id=GW_ID, organization_id=ORG_ID, name="OpenClaw Main", url="http://localhost:8765", workspace_root="/Users/arpit-mini/.openclaw/workspace")
        session.add(gw)

        # 3. Board Groups (Departments)
        for dept_name, dept_id in DEPARTMENTS.items():
            bg = BoardGroup(id=dept_id, organization_id=ORG_ID, name=dept_name.replace("_", " ").title(), slug=dept_name)
            session.add(bg)

        # 4. Boards (Brands)
        for brand_name, board_id in BRAND_BOARDS.items():
            brand_data = next(b for b in BRANDS_DATA if b["name"] == brand_name)
            board = Board(
                id=board_id, organization_id=ORG_ID, name=brand_name.title(),
                slug=brand_name, description=f"{brand_name.title()} brand board",
                gateway_id=GW_ID, board_group_id=DEPARTMENTS.get("operations"),
                board_type="goal",
                objective=f"Reach ${brand_data['revenue_target']:,}/month revenue",
            )
            session.add(board)

        # 5. Agents (using existing Agent model with gateway/board refs)
        agent_ids: dict[str, UUID] = {}
        for a in AGENTS_DATA:
            aid = uuid4()
            agent_ids[a["name"]] = aid
            dept_id = DEPARTMENTS.get(a["dept"])
            # Pick a board for the agent (first brand board or None)
            agent = Agent(
                id=aid, name=a["name"], status="online",
                gateway_id=GW_ID, board_id=None,
                is_board_lead=a.get("is_lead", False),
                identity_profile={"emoji": a["emoji"], "role": a["role"], "department": a["dept"], "model_used": a["model"]},
            )
            session.add(agent)

        # 6. Tags
        for tag_name in TAG_NAMES:
            session.add(Tag(id=uuid4(), organization_id=ORG_ID, name=tag_name, slug=tag_name, color="#396AFF"))

        # 7. MC Agents (our enriched agent table for emoji/role/dept display)
        for a in AGENTS_DATA:
            mc_agent = MCAgent(
                name=a["name"], emoji=a["emoji"], role=a["role"],
                department=a["dept"].replace("_", " ").title(),
                status="active", model_used=a["model"],
            )
            session.add(mc_agent)
        # Add Arpit as human
        session.add(MCAgent(name="Arpit", emoji="👨‍💼", role="Founder & CEO", department="Leadership", status="active", model_used="human"))

        # 8. Brands (new table for Shopify/Meta tokens)
        brand_map: dict[str, Brand] = {}
        for b in BRANDS_DATA:
            brand = Brand(**b)
            session.add(brand)
            brand_map[b["name"]] = brand

        await session.flush()

        # 9. Performance snapshots from historical Shopify data
        # Search multiple locations for history file
        history_path = None
        for candidate in [
            Path(__file__).resolve().parents[1] / "docs" / "shopify-history.json",
            Path("/app/docs/shopify-history.json"),
            Path("/tmp/arpit-mission-control/docs/shopify-history.json"),
        ]:
            if candidate.exists():
                history_path = candidate
                break

        if history_path and history_path.exists():
            data = json.loads(history_path.read_text())
            count = 0
            for store_data in data.get("stores", []):
                store_name = store_data["store"]
                brand = brand_map.get(store_name)
                if not brand:
                    continue
                for day in store_data.get("daily", []):
                    rev = day.get("revenue", 0)
                    orders = day.get("orders", 0)
                    aov = round(rev / orders, 2) if orders > 0 else 0
                    snap = PerformanceSnapshot(
                        brand_id=brand.id, snap_date=date.fromisoformat(day["date"]),
                        revenue=rev, orders=orders, aov=aov,
                    )
                    session.add(snap)
                    count += 1
                brand.current_revenue = store_data.get("total_revenue", 0)
            print(f"Loaded {count} performance snapshots from history")

        # 10. Activity events using EXISTING model
        events = [
            {"event_type": "system", "message": "All systems operational. 14 agents online.", "agent_id": agent_ids.get("Nova")},
            {"event_type": "deployment", "message": "Mission Control v5 deployment initiated.", "agent_id": agent_ids.get("Pixel")},
            {"event_type": "sync", "message": "Meta ads sync complete. Plentum ROAS: 2.8x", "agent_id": agent_ids.get("Bolt")},
            {"event_type": "audit", "message": "SEO audit for plentum.com complete. 12 opportunities found.", "agent_id": agent_ids.get("Scout")},
            {"event_type": "handoff", "message": "Customer cohort analysis ready for email segmentation.", "agent_id": agent_ids.get("Sage")},
        ]
        for e in events:
            session.add(ActivityEvent(**e))

        # 11. Activity feed entries (MC-specific enriched feed)
        feeds = [
            {"type": "status", "from_agent": "Nova", "content": "All systems operational. 14 agents active."},
            {"type": "mission", "from_agent": "Nova", "content": "Mission Control v5 deployment initiated."},
            {"type": "message", "from_agent": "Bolt", "content": "Meta ads sync complete. Plentum ROAS: 2.8x"},
            {"type": "message", "from_agent": "Scout", "content": "SEO audit for plentum.com complete. 12 opportunities found."},
            {"type": "handoff", "from_agent": "Sage", "to_agent": "Ember", "content": "Customer cohort analysis ready for email segmentation."},
            {"type": "message", "from_agent": "Quill", "content": "March content calendar drafted. 24 posts across 3 brands."},
            {"type": "status", "from_agent": "Atlas", "content": "Shopify sync healthy. All 3 stores reporting."},
            {"type": "message", "from_agent": "Iris", "content": "New product page templates ready for A/B testing."},
        ]
        for f in feeds:
            session.add(ActivityFeedEntry(**f))

        # 12. MC Tasks
        tasks = [
            {"title": "Deploy Mission Control v5", "status": "in_progress", "assigned_agent": "Pixel", "tags": ["engineering", "priority"]},
            {"title": "Q1 Revenue Report", "status": "review", "assigned_agent": "Sage", "tags": ["analytics"]},
            {"title": "Meta Ads Campaign Optimization", "status": "in_progress", "assigned_agent": "Bolt", "tags": ["paid-media"]},
            {"title": "SEO Content Calendar - March", "status": "assigned", "assigned_agent": "Quill", "tags": ["content", "seo"]},
            {"title": "Email Flow Redesign", "status": "inbox", "tags": ["retention", "email"]},
            {"title": "Product Page A/B Test", "status": "done", "assigned_agent": "Iris", "tags": ["creative", "testing"]},
            {"title": "Shopify Theme Performance Audit", "status": "in_progress", "assigned_agent": "Pixel", "tags": ["engineering", "shopify"]},
            {"title": "Customer Cohort Analysis", "status": "done", "assigned_agent": "Sage", "tags": ["analytics"]},
            {"title": "PawFully Launch Campaign", "status": "assigned", "assigned_agent": "Echo", "tags": ["paid-media", "creative"]},
            {"title": "Inventory Alert System", "status": "inbox", "tags": ["engineering", "shopify"]},
        ]
        for t in tasks:
            session.add(MCTask(**t))

        # 13. MC Owner User (for JWT auth)
        owner_user = MCUser(
            email="arpit@plentum.com",
            password_hash=hash_password("MissionControl2026!"),
            name="Arpit",
            role="owner",
            brand_access=None,
            department_access=None,
        )
        session.add(owner_user)

        await session.commit()
        print("✅ Seed complete! Organization, gateway, departments, brands, agents, tags, performance data, owner user all loaded.")


if __name__ == "__main__":
    asyncio.run(seed())
