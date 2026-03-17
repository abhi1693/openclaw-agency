"""ShipmentLink web scraping service for ocean freight tracking.

ShipmentLink URL: https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do
Supports Evergreen (and other carriers on ShipmentLink).

Strategy:
  1. Try a plain httpx POST first (fast, no JS needed if session check passes).
  2. If that returns a redirect/login wall, fall back to Playwright headless.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

import httpx
from bs4 import BeautifulSoup
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.logging import get_logger
from app.core.time import utcnow
from app.models.shipments import Shipment, ShipmentEvent

logger = get_logger(__name__)

SHIPMENTLINK_URL = "https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do"

# Known status keyword → our status enum
STATUS_KEYWORD_MAP: dict[str, str] = {
    "gate in": "booked",
    "loaded on vessel": "departed",
    "vessel departed": "departed",
    "departed": "departed",
    "in transit": "in_transit",
    "transship": "in_transit",
    "vessel arrived": "arrived",
    "arrived": "arrived",
    "discharged": "discharged",
    "available": "arrived",
    "gate out": "picked_up",
    "delivered": "delivered",
    "empty return": "delivered",
}


def _map_status(raw: str) -> str:
    """Map a raw ShipmentLink status string to our status enum."""
    lower = raw.lower()
    for kw, status in STATUS_KEYWORD_MAP.items():
        if kw in lower:
            return status
    return "in_transit"


def _parse_date(raw: str) -> datetime | None:
    """Try common date formats from ShipmentLink."""
    raw = raw.strip()
    for fmt in (
        "%Y-%m-%d",        # 2026-03-17
        "%m/%d/%Y",        # 03/17/2026
        "%d/%m/%Y",        # 17/03/2026
        "%b %d, %Y",       # Mar 17, 2026
        "%d-%b-%Y",        # 17-Mar-2026
        "%b-%d-%Y",        # MAR-17-2026  ← ShipmentLink format
        "%B %d, %Y",       # March 17, 2026
        "%d %b %Y",        # 17 Mar 2026
    ):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def _clean(text: str) -> str:
    """Strip whitespace and non-breaking spaces."""
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def _th_sibling_value(soup: BeautifulSoup, label: str) -> str:
    """Find a <th> containing label text, return the adjacent <td> value."""
    for th in soup.find_all("th"):
        th_text = _clean(th.get_text())
        if label.lower() in th_text.lower():
            td = th.find_next_sibling("td")
            if td:
                return _clean(td.get_text())
    return ""


def _parse_shipmentlink_html(html: str, booking_number: str) -> dict[str, Any]:
    """
    Parse ShipmentLink cargo tracking results HTML.

    ShipmentLink page structure (results):
    - Booking No / Vessel Voyage in first result table (th/td pairs in same row)
    - "Basic Information" table: rows with <th> labels + <td> values
      - Port of Loading, Port of Discharge, Estimated Arrival Date, Estimated Departure Date
    - "Booked Container Information" table: Size/Type, Gross Weight columns
    - No separate "Cargo Events" table in this booking view (events appear in B/L detail)

    Returns a dict with fields matching Shipment columns + a list of events.
    """
    soup = BeautifulSoup(html, "lxml")
    result: dict[str, Any] = {
        "booking_number": booking_number,
        "events": [],
        "_raw_html_snippet": html[:500],
    }

    # ── Detect "no results" page ──────────────────────────────────────────────
    body_text = _clean(soup.get_text())
    no_result_phrases = [
        "no data found",
        "no record found",
        "no result",
        "booking not found",
        "invalid booking",
        "no information found",
    ]
    # Only flag no-results if it's a short page with no tracking content
    if any(p in body_text.lower() for p in no_result_phrases) and len(html) < 20_000:
        result["_error"] = "no_results"
        return result

    # ── Vessel + Voyage ───────────────────────────────────────────────────────
    # Found in the first result table as: <th>Vessel Voyage</th><td>EVER MILD&nbsp;1445-009E</td>
    vessel_voyage_raw = _th_sibling_value(soup, "Vessel Voyage")
    if vessel_voyage_raw:
        # "EVER MILD 1445-009E (長親輪)" → split vessel and voyage
        # Remove parenthetical
        vv = re.sub(r"\(.*?\)", "", vessel_voyage_raw).strip()
        # Last token(s) after the vessel name is the voyage
        parts = vv.split()
        if len(parts) >= 2:
            # Last part looks like voyage (e.g. "1445-009E")
            result["voyage_number"] = parts[-1]
            result["vessel_name"] = " ".join(parts[:-1])
        else:
            result["vessel_name"] = vv

    # ── Ports ─────────────────────────────────────────────────────────────────
    pol_raw = _th_sibling_value(soup, "Port of Loading")
    if pol_raw:
        # e.g. " YANTIAN, CHINA (CN)" → "YANTIAN, CHINA (CN)"
        result["port_of_loading"] = pol_raw.lstrip()

    pod_raw = _th_sibling_value(soup, "Port of Discharge")
    if pod_raw:
        result["port_of_discharge"] = pod_raw.lstrip()

    # ── Dates from the Basic Information table ────────────────────────────────
    # The table has column headers: VGM Cut Off Date | Cut Off Date | Estimated Arrival Date |
    #                                Estimated Departure Date | Estimated On Board Date | Issue Date
    # Rows: Place of Receipt, Port of Loading, Port of Discharge, Place of Delivery
    # Strategy: find the header row to determine column indices, then read Port of Loading/Discharge rows
    basic_info_table = None
    for table in soup.find_all("table"):
        td = table.find(lambda tag: tag.name in ("td", "th") and "Basic Information" in tag.get_text())
        if td:
            basic_info_table = table
            break

    if basic_info_table:
        rows = basic_info_table.find_all("tr")
        # Find header row (the one with "Estimated Arrival Date" / "Estimated Departure Date")
        header_row_idx = -1
        col_eta = -1   # Estimated Arrival Date column index
        col_etd = -1   # Estimated Departure Date column index
        for i, row in enumerate(rows):
            cells = [_clean(c.get_text()) for c in row.find_all(["th", "td"])]
            for j, c in enumerate(cells):
                if "Estimated Arrival Date" in c:
                    col_eta = j
                if "Estimated Departure Date" in c:
                    col_etd = j
            if col_eta >= 0:
                header_row_idx = i
                break

        if header_row_idx >= 0:
            for row in rows[header_row_idx + 1:]:
                cells_el = row.find_all(["th", "td"])
                if not cells_el:
                    continue
                row_label = _clean(cells_el[0].get_text()).lower()
                # Collect all non-empty text values from this row
                cell_texts = [_clean(c.get_text()) for c in cells_el]

                # Port of Loading row: ETD = Estimated Departure Date col
                if "port of loading" in row_label:
                    # Use column index, but because colspan merges, col_etd may shift
                    # Iterate cells looking for a date string instead of relying on index
                    dates_in_row = [_parse_date(t) for t in cell_texts if _parse_date(t)]
                    # dates_in_row order: VGM cutoff, cutoff, ETA(?), ETD(?), EOB, Issue
                    # For POL: indexes map to: [0]=VGM, [1]=VGM EDI, [2]=CutOff, [3]=ETA(empty), [4]=ETD
                    if col_etd >= 0 and col_etd < len(cell_texts):
                        dt = _parse_date(cell_texts[col_etd])
                        if dt:
                            result["etd"] = dt
                    elif dates_in_row:
                        # Pick last date as ETD (typically the latest schedule date)
                        result["etd"] = dates_in_row[-1]

                # Port of Discharge row: ETA is the first date value in the row
                # (colspan collapses middle columns so ETA appears at index 2)
                if ("port of discharge" in row_label or "place of delivery" in row_label) and "eta" not in result:
                    dates_in_row = [_parse_date(t) for t in cell_texts if _parse_date(t)]
                    if dates_in_row:
                        result["eta"] = dates_in_row[0]

    # ── Container info ────────────────────────────────────────────────────────
    # Container type — scan all tables for "Size/Type" or "Booked Container"
    for table in soup.find_all("table"):
        table_text = _clean(table.get_text())
        if "Size/Type" not in table_text and "Booked Container" not in table_text:
            continue
        rows = table.find_all("tr")
        header_idx = -1
        col_size = -1
        for i, row in enumerate(rows):
            cells = [_clean(c.get_text()) for c in row.find_all(["th", "td"])]
            for j, c in enumerate(cells):
                if "Size" in c and ("Type" in c or "/" in c):
                    col_size = j
                    header_idx = i
                    break
            if header_idx >= 0:
                break
        if header_idx >= 0:
            for row in rows[header_idx + 1:]:
                cells = [_clean(c.get_text()) for c in row.find_all(["th", "td"])]
                if cells:
                    # Try col_size first, else first non-empty cell
                    size_raw = cells[col_size] if col_size < len(cells) else ""
                    if not size_raw:
                        size_raw = next((c for c in cells if c), "")
                    # e.g. "1*40'(SH)" → "40'(SH)"
                    size_clean = re.sub(r"^\d+\*", "", size_raw).strip()
                    if size_clean and "'" in size_clean:
                        result["container_type"] = size_clean
                    break
        if result.get("container_type"):
            break

    # ── Booking status ────────────────────────────────────────────────────────
    booking_status_raw = _th_sibling_value(soup, "Booking Status")
    if booking_status_raw:
        # Map to our status: Cancel → booked (still a booking), Confirmed → booked, etc.
        bs_lower = booking_status_raw.lower()
        if "cancel" in bs_lower:
            result["status"] = "booked"  # booking exists, might be cancelled leg
            result["last_event"] = f"Booking Status: {booking_status_raw}"
        elif "confirm" in bs_lower or "accepted" in bs_lower:
            result["status"] = "booked"
            result["last_event"] = f"Booking confirmed"
        # If we have richer event data it will override this below

    # ── Events / Move Activity table ──────────────────────────────────────────
    # ShipmentLink booking view may show a "Move Activity" or "Cargo Status" table
    events: list[dict[str, Any]] = []
    for table in soup.find_all("table"):
        all_th_text = " ".join(_clean(th.get_text()).lower() for th in table.find_all("th"))
        if not any(kw in all_th_text for kw in ("activity", "cargo status", "movement", "event", "move date")):
            continue

        header_cells = [_clean(c.get_text()) for c in table.find_all("tr")[0].find_all(["th", "td"])]
        col_map: dict[str, int] = {}
        for j, h in enumerate(header_cells):
            hl = h.lower()
            if "date" in hl:
                col_map.setdefault("date", j)
            if "activity" in hl or "description" in hl or "status" in hl or "move" in hl:
                col_map.setdefault("description", j)
            if "location" in hl or "port" in hl or "place" in hl:
                col_map.setdefault("location", j)
            if "vessel" in hl:
                col_map.setdefault("vessel", j)

        for row in table.find_all("tr")[1:]:
            cells = [_clean(c.get_text()) for c in row.find_all("td")]
            if not cells or all(c == "" for c in cells):
                continue
            ev: dict[str, Any] = {"source": "shipmentlink"}
            if "date" in col_map and col_map["date"] < len(cells):
                dt = _parse_date(cells[col_map["date"]])
                if dt:
                    ev["event_at"] = dt
            if "description" in col_map and col_map["description"] < len(cells):
                ev["description"] = cells[col_map["description"]]
                ev["event_type"] = ev["description"].lower().replace(" ", "_")[:50]
            if "location" in col_map and col_map["location"] < len(cells):
                ev["location"] = cells[col_map["location"]]
            if "vessel" in col_map and col_map["vessel"] < len(cells):
                ev["vessel_name"] = cells[col_map["vessel"]]

            if ev.get("description"):
                events.append(ev)

    result["events"] = events

    # ── Override status from latest event if available ────────────────────────
    if events:
        latest = events[-1]
        desc = latest.get("description", "")
        if desc:
            result["last_event"] = desc
            result["last_event_at"] = latest.get("event_at")
            result["status"] = _map_status(desc)

    return result


async def scrape_shipmentlink_httpx(booking_number: str) -> dict[str, Any] | None:
    """
    Attempt a plain HTTP POST to ShipmentLink (no JS).
    Form analysis: POST fields are TYPE=BK, bkno=<num>, BL=, CNTR=, SEL=s_bk, NO=<num>
    Returns parsed data dict or None if scraping fails / blocked.
    """
    base_headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": SHIPMENTLINK_URL,
        "Origin": "https://ct.shipmentlink.com",
    }
    # Exact form fields from JS analysis of frmSubmit():
    # TYPE=BK, bkno=<booking>, BL='', CNTR='', SEL=s_bk, NO=<booking>
    form_data = {
        "TYPE": "BK",
        "bkno": booking_number.upper(),
        "BL": "",
        "CNTR": "",
        "SEL": "s_bk",
        "NO": booking_number.upper(),
    }

    try:
        async with httpx.AsyncClient(
            timeout=30,
            follow_redirects=True,
            headers=base_headers,
        ) as client:
            # GET first to pick up session cookies
            get_resp = await client.get(SHIPMENTLINK_URL)
            # Accept cookie consent if present (set cookie_accepted=true)
            # ShipmentLink sets TDB1_Function_Type cookie on first visit — we have it now
            post_headers = {
                **base_headers,
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": "; ".join(
                    f"{k}={v}" for k, v in get_resp.cookies.items()
                ),
            }
            resp = await client.post(
                SHIPMENTLINK_URL,
                data=form_data,
                headers=post_headers,
            )
            resp.raise_for_status()
            html = resp.text

        # Detect session wall / CAPTCHA
        if len(html) < 1000:
            logger.info("ShipmentLink httpx: response too short (%d bytes), trying playwright", len(html))
            return None
        lower_html = html.lower()
        if "captcha" in lower_html or (
            "login" in lower_html[:500] and "tracking" not in lower_html[:500]
        ):
            logger.info("ShipmentLink httpx: session wall detected, trying playwright")
            return None

        parsed = _parse_shipmentlink_html(html, booking_number)
        if parsed.get("_error") == "no_results":
            logger.info("ShipmentLink: no results for booking %s", booking_number)
            return {"_error": "no_results"}

        return parsed

    except Exception as e:
        logger.warning("ShipmentLink httpx scrape failed: %s", e)
        return None


async def scrape_shipmentlink_playwright(booking_number: str) -> dict[str, Any] | None:
    """
    Use Playwright (headless Chromium) to scrape ShipmentLink.
    Runs synchronously in a thread pool to avoid blocking the event loop.
    """
    import asyncio
    from concurrent.futures import ThreadPoolExecutor

    def _sync_scrape() -> dict[str, Any] | None:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_page(
                    user_agent=(
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/122.0.0.0 Safari/537.36"
                    )
                )
                page.goto(SHIPMENTLINK_URL, wait_until="domcontentloaded", timeout=30_000)

                # Close cookie modal if present
                try:
                    page.click('button:has-text("Accept")', timeout=3_000)
                except Exception:
                    pass

                # ShipmentLink "Quick Tracking" tab is active by default.
                # The visible radio buttons have values: s_bl, s_cntr, s_bk
                # We need s_bk (Booking No.)
                try:
                    page.click('#s_bk', timeout=5_000)
                except Exception:
                    try:
                        page.click('input[value="s_bk"]', timeout=3_000)
                    except Exception:
                        pass

                # The visible NO input (Quick tab) is the last visible one
                # Use JavaScript to set the value and trigger input events reliably
                bk_upper = booking_number.upper()
                page.evaluate(f"""
                    var inputs = document.querySelectorAll('input[name="NO"]');
                    var visible = Array.from(inputs).filter(el => {{
                        var rect = el.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;
                    }});
                    if (visible.length > 0) {{
                        visible[0].value = '{bk_upper}';
                        visible[0].dispatchEvent(new Event('input', {{bubbles: true}}));
                    }}
                """)

                # Also set the hidden fields directly for reliability
                page.evaluate(f"""
                    document.frmCargo.TYPE.value = 'BK';
                    document.frmCargo.bkno.value = '{bk_upper}';
                    document.frmCargo.BL.value = '';
                    document.frmCargo.CNTR.value = '';
                """)

                # Submit the form via JS
                page.evaluate("document.frmCargo.submit()")

                # Wait for navigation / results
                try:
                    page.wait_for_load_state("networkidle", timeout=25_000)
                except Exception:
                    page.wait_for_load_state("domcontentloaded", timeout=10_000)

                html = page.content()
                return _parse_shipmentlink_html(html, booking_number)

            except Exception as e:
                logger.warning("Playwright scrape error: %s", e)
                return None
            finally:
                browser.close()

    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=1) as pool:
        result = await loop.run_in_executor(pool, _sync_scrape)
    return result


async def refresh_shipment_from_shipmentlink(
    shipment: Shipment,
    session: AsyncSession,
) -> dict[str, Any]:
    """
    Scrape ShipmentLink for the shipment's booking number.
    Updates Shipment fields and appends new ShipmentEvents.
    Returns a summary dict.
    """
    booking = shipment.booking_number

    # Try fast httpx first, fall back to playwright
    data = await scrape_shipmentlink_httpx(booking)
    if data is None:
        logger.info("Falling back to Playwright for booking %s", booking)
        data = await scrape_shipmentlink_playwright(booking)

    if data is None:
        return {"status": "error", "message": "Scraping failed (both httpx and playwright)"}
    if data.get("_error") == "no_results":
        return {"status": "no_results", "message": "No tracking data found for this booking"}

    # Update shipment fields
    updatable_fields = [
        "vessel_name", "voyage_number", "container_number", "container_type",
        "port_of_loading", "port_of_discharge", "etd", "eta",
        "status", "last_event", "last_event_at",
    ]
    changed: list[str] = []
    for field in updatable_fields:
        if field in data and data[field]:
            old = getattr(shipment, field, None)
            if old != data[field]:
                setattr(shipment, field, data[field])
                changed.append(field)

    shipment.tracking_source = "shipmentlink"
    shipment.updated_at = utcnow()
    session.add(shipment)

    # Upsert events (avoid duplicates by event_type + event_at)
    existing_result = await session.exec(
        select(ShipmentEvent).where(ShipmentEvent.shipment_id == shipment.id)
    )
    existing_events = existing_result.all()
    existing_keys = {
        (e.event_type, str(e.event_at)): True for e in existing_events
    }

    new_events: list[ShipmentEvent] = []
    for ev in data.get("events", []):
        key = (ev.get("event_type", ""), str(ev.get("event_at")))
        if key in existing_keys:
            continue
        se = ShipmentEvent(
            shipment_id=shipment.id,  # type: ignore[arg-type]
            event_type=ev.get("event_type", ""),
            description=ev.get("description", ""),
            location=ev.get("location", ""),
            vessel_name=ev.get("vessel_name", ""),
            event_at=ev.get("event_at"),
            source="shipmentlink",
            raw_data=json.dumps(ev),
        )
        session.add(se)
        new_events.append(se)

    await session.commit()
    await session.refresh(shipment)

    return {
        "status": "ok",
        "booking_number": booking,
        "fields_updated": changed,
        "new_events": len(new_events),
        "current_status": shipment.status,
    }


async def refresh_all_active_shipments(session: AsyncSession) -> dict[str, Any]:
    """
    Cron job: refresh all in_transit / departed / booked shipments.
    Called daily.
    """
    result = await session.exec(
        select(Shipment).where(
            col(Shipment.status).in_(["booked", "departed", "in_transit"])
        )
    )
    shipments = result.all()
    logger.info("Cron: refreshing %d active shipments", len(shipments))

    results: list[dict[str, Any]] = []
    for s in shipments:
        try:
            r = await refresh_shipment_from_shipmentlink(s, session)
            results.append({"id": s.id, "booking": s.booking_number, **r})
        except Exception as e:
            logger.exception("Cron refresh failed for shipment %s: %s", s.id, e)
            results.append({"id": s.id, "booking": s.booking_number, "status": "error", "message": str(e)})

    return {"refreshed": len(shipments), "results": results}
