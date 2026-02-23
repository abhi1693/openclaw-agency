# Operations Panel Spec — Mission Control

> Vault 🏪 (Store Ops) + Shield 🛡️ (Support)

---

## Data Sources

| Brand | Shopify Store | Products | Orders (8mo) | Type |
|-------|--------------|----------|--------------|------|
| Plentum | plentumstore.myshopify.com | 3 | 1,061 | Subscription supplements |
| Mavena | e1jy1j-sg.myshopify.com | 146 | 4,452 | Dropshipping |
| PawFully | pawfullyco.myshopify.com | 80 | 913 | Pet products |
| RetroMedy | TBD | — | — | Coming soon |

**Support:** Gorgias (plentum.gorgias.com) — CSAT 2.5/5, resolution time 1mo 16d, 3,800 unresolved tickets

---

## 🏪 Store Ops Panels

### 1. Order Volume Cards

Three time-window cards per brand: **Today / This Week / This Month**

| Metric | Source | Refresh |
|--------|--------|---------|
| Order count | Shopify Orders API (`created_at` filter) | 15 min |
| Revenue (gross) | `total_price` sum | 15 min |
| AOV | Revenue ÷ orders | 15 min |

**Layout:** 4-column row (one per brand, RetroMedy greyed until launch). Each card shows order count + revenue with delta vs. prior period (↑/↓ %).

### 2. Fulfillment Pipeline

Horizontal funnel per brand:

```
[Unfulfilled] → [In Transit] → [Delivered]
```

| Stage | Shopify Filter | Color |
|-------|---------------|-------|
| Unfulfilled | `fulfillment_status=unfulfilled` | 🔴 Red |
| Partially fulfilled | `fulfillment_status=partial` | 🟡 Yellow |
| In Transit | Fulfilled + tracking, no delivery confirmation | 🔵 Blue |
| Delivered | Fulfilled + delivery confirmed | 🟢 Green |

**Key metric:** Unfulfilled age distribution (0-1d, 2-3d, 4-7d, 7d+). Orders unfulfilled >3 days get flagged.

**Brand-specific notes:**
- **Mavena (dropship):** Expect longer fulfillment windows; flag at >5 days instead of >3
- **Plentum (subscription):** Track recurring vs. one-time fulfillment separately

### 3. Inventory Alerts

| Alert Level | Condition | Visual |
|-------------|-----------|--------|
| 🔴 Out of Stock | `inventory_quantity = 0` + `track_inventory = true` | Red badge |
| 🟡 Low Stock | `inventory_quantity ≤ 10` (configurable threshold) | Yellow badge |
| ✅ Healthy | Above threshold | No alert |

**Display:** Table sorted by severity. Columns: Product, Variant, Stock, Velocity (units/week), Days Until Stockout.

**Brand-specific:**
- **Plentum (3 products):** Critical — any stockout kills subscriptions. Threshold: 50 units.
- **Mavena (dropship):** Lower priority — supplier manages stock. Track supplier-side if possible.
- **PawFully (80 products):** Standard threshold of 10 units.

### 4. Product Catalog Health

| Metric | Source |
|--------|--------|
| Active products | `status=active` count |
| Draft products | `status=draft` count |
| Missing images | Products where `images` array is empty |
| Missing descriptions | Products where `body_html` is empty/null |
| No price set | Variants with `price = 0` |

**Display:** Health score card (% of products with no issues) + issue list table.

---

## 🛡️ Support Panels

### 5. Ticket Queue

Three-column counter display:

| Status | Current Baseline | Source |
|--------|-----------------|--------|
| Open | ~3,800 | Gorgias API `status=open` |
| Pending | TBD | Gorgias API `status=pending` |
| Resolved (this week) | TBD | Gorgias API `status=closed` + date filter |

**Display:** Large number cards with sparkline trend (7-day). Include tickets created today vs. resolved today ratio.

### 6. CSAT Score with Trend

| Metric | Current | Target |
|--------|---------|--------|
| CSAT | 2.5 / 5 (50%) | 4.0 / 5 (80%) |

**Display:** Gauge chart (red/yellow/green zones) + 30-day trend line. Show per-brand CSAT if Gorgias tags allow filtering.

**Zones:** 🔴 <3.0 | 🟡 3.0–3.9 | 🟢 ≥4.0

### 7. Response & Resolution Time

| Metric | Current | Target |
|--------|---------|--------|
| Avg First Response | TBD | <4 hours |
| Avg Resolution Time | 1 month 16 days | <48 hours |

**Display:** Two metric cards with trend. Breakdown by brand if available.

### 8. Top Issues Breakdown

Bar chart showing ticket volume by issue category:

| Brand | Top Issue | % of Tickets |
|-------|-----------|-------------|
| Mavena | Website defaults to size 5.5 | 30% |
| Plentum | Subscription management | 25% |
| PawFully | TBD (needs tagging) | — |

**Data source:** Gorgias tags/intents. If not tagged, use subject line clustering.

**Actionable insight callouts:**
- Mavena size issue → engineering fix needed (default variant selection)
- Plentum subscriptions → improve self-service portal or FAQ

### 9. Urgent Tickets Flagged

Auto-flag criteria:

| Rule | Condition |
|------|-----------|
| VIP customer | Order value >$200 or repeat customer (5+ orders) |
| Chargeback risk | Contains "refund", "dispute", "bank" keywords |
| Shipping emergency | Unfulfilled + customer follow-up after 5+ days |
| Social media escalation | Source = Twitter/Instagram/Facebook |
| Negative sentiment | Sentiment score < 0.2 (if NLP available) |

**Display:** Priority queue list, newest first, with brand tag and age badge.

---

## 🚨 Combined Alert Rules

Alerts push to **Slack (#brand-updates channels)** and **Telegram (Arpit direct)**.

| Alert | Condition | Severity | Channel |
|-------|-----------|----------|---------|
| Unfulfilled orders stale | Plentum/PawFully >3 days, Mavena >5 days | 🔴 Critical | Telegram + Slack |
| CSAT drop | Drops >0.3 points in 7 days | 🔴 Critical | Telegram |
| CSAT below target | Stays <3.0 for 3+ days | 🟡 Warning | Slack |
| Inventory critical | Plentum product <50 units | 🔴 Critical | Telegram + Slack |
| Inventory low | PawFully product <10 units | 🟡 Warning | Slack |
| Ticket backlog spike | >100 new tickets/day (2x avg) | 🟡 Warning | Slack |
| Resolution time spike | Avg resolution >72 hours (rolling 7d) | 🟡 Warning | Slack |
| Chargeback risk | Flagged ticket unresolved >24h | 🔴 Critical | Telegram |
| Revenue anomaly | Daily revenue <50% of 7-day avg | 🔴 Critical | Telegram |
| Zero orders | Any brand has 0 orders for 6+ hours (during business hours) | 🔴 Critical | Telegram |

### Alert Escalation

1. **Slack only** → team visibility, no immediate action needed
2. **Telegram** → Arpit needs to see this now
3. **Telegram + Slack** → everyone needs to know and act

---

## API Requirements

| System | Endpoint | Auth | Rate Limit |
|--------|----------|------|------------|
| Plentum Shopify | Admin API 2024-01 | `shpat_255...` | 2 req/sec |
| Mavena Shopify | Admin API 2024-01 | `shpat_bde...` | 2 req/sec |
| PawFully Shopify | Admin API 2024-01 | `shpat_b29...` | 2 req/sec |
| Gorgias | REST API | Basic auth (rohan@plentum.com) | 2 req/sec |

**Refresh cadence:** Every 15 minutes for order/fulfillment data. Every 1 hour for catalog/inventory. Every 30 minutes for support metrics.

---

## Layout Summary

```
┌─────────────────────────────────────────────────────┐
│  ORDER VOLUME: [Plentum] [Mavena] [PawFully] [Retro]│
├─────────────────────────────────────────────────────┤
│  FULFILLMENT PIPELINE (per brand funnel bars)       │
├──────────────────────┬──────────────────────────────┤
│  INVENTORY ALERTS    │  CATALOG HEALTH              │
├──────────────────────┼──────────────────────────────┤
│  TICKET QUEUE        │  CSAT GAUGE + TREND          │
├──────────────────────┼──────────────────────────────┤
│  RESPONSE TIME       │  TOP ISSUES (bar chart)      │
├─────────────────────────────────────────────────────┤
│  🚨 URGENT TICKETS / COMBINED ALERTS FEED           │
└─────────────────────────────────────────────────────┘
```
