# 📧 Email Marketing & 🔑 Retention — Panel Spec

> **Operators:** Ember 📧 (Email/CRM) · Keeper 🔑 (Retention)
> **Data Sources:** Klaviyo API, Shopify Admin API, Recharge/subscription provider
> **Refresh:** Every 4 hours (KPIs), daily (cohorts, LTV), real-time (flow status)

---

## Part 1: Email Marketing Panel

### 1.1 Flow Status Overview

| Column | Description |
|--------|-------------|
| Brand | Plentum / Mavena / PawFully |
| Flow Name | e.g. "Welcome Series", "Abandoned Cart" |
| Status | 🟢 Active · 🟡 Draft · 🔴 Paused |
| Emails in Flow | Count of messages |
| Last Triggered | Timestamp of most recent recipient entry |
| 30d Revenue | Revenue attributed to this flow (last 30 days) |

**Summary bar** at top: `Active: X | Draft: Y | Paused: Z` per brand.

**Current inventory:** 26 flows drafted (Plentum 15, Mavena 11, PawFully 0).

**Data source:** Klaviyo Flows API (`GET /api/flows/`) — filter by `status` field.

---

### 1.2 Email Performance KPIs

Four metric cards per brand, with sparkline (last 30 days) and vs-prior-period delta:

| KPI | Target (Plentum) | Target (Mavena) | Calculation |
|-----|-------------------|------------------|-------------|
| **Open Rate** | ≥ 45% | ≥ 40% | Unique opens / delivered |
| **Click Rate** | ≥ 3.5% | ≥ 2.5% | Unique clicks / delivered |
| **Revenue per Email** | ≥ $0.15 | ≥ $0.10 | Klaviyo attributed revenue / emails delivered |
| **Unsubscribe Rate** | < 0.2% | < 0.3% | Unsubs / delivered |

**Breakdown toggles:** By flow vs. campaign, by time period (7d / 30d / 90d).

**Data source:** Klaviyo Metrics API — `Received Email`, `Opened Email`, `Clicked Email`, `Unsubscribed`.

---

### 1.3 List Growth Trend

**Chart type:** Stacked area chart (30/90/180d view).

| Metric | Description |
|--------|-------------|
| New Subscribers | Daily additions (by source: popup, checkout, import) |
| Unsubscribes | Daily removals |
| Net Growth | New − unsubs |
| Total List Size | Running total active profiles |

Per brand. PawFully gets a dedicated "List Building" callout showing progress toward first 1,000 subscribers.

**Data source:** Klaviyo Lists API + Profile metrics.

---

### 1.4 Campaign Calendar

**View:** Weekly calendar grid (current + next 2 weeks).

| Field | Description |
|-------|-------------|
| Date/Time | Scheduled send time (EST) |
| Brand | Plentum / Mavena / PawFully |
| Campaign Name | Subject line or internal name |
| Segment | Target audience |
| Status | Scheduled / Sending / Sent / Draft |
| Est. Recipients | Projected audience size |

**Color-coded by brand.** Click-through to Klaviyo campaign editor.

**Data source:** Klaviyo Campaigns API (`GET /api/campaigns/`).

---

### 1.5 Revenue Attribution from Email

**Chart type:** Donut chart + trend line.

| Metric | Description |
|--------|-------------|
| Email Revenue | Total Klaviyo-attributed revenue (flows + campaigns) |
| Email % of Total | Email revenue / Shopify total revenue × 100 |
| Flow vs Campaign Split | Breakdown of email revenue by type |
| Top 3 Flows by Revenue | Ranked list with $ amounts |

**Targets:** Plentum ≥ 30% of revenue from email (subscription brand). Mavena ≥ 20%.

**Data source:** Klaviyo revenue metrics + Shopify orders API (for total revenue denominator).

---

## Part 2: Retention Panel

### 2.1 Subscription Metrics (Plentum — Primary)

> Plentum is subscription-based dog supplement. This is the single most important retention panel.

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| **Active Subscriptions** | Current active sub count | Δ < -5% WoW 🔴 |
| **MRR** | Monthly recurring revenue | Δ < -3% MoM 🔴 |
| **Churn Rate** | Cancellations / active subs (monthly) | > 8% 🔴, > 5% 🟡 |
| **New Subs** | Subscriptions created this period | Trend line |
| **Reactivations** | Previously cancelled → resubscribed | Count + rate |
| **Skip Rate** | Orders skipped / total scheduled | > 15% 🟡 |
| **Avg Subscription Age** | Mean days since first subscription order | Trend |
| **Cancellation Reasons** | Top 5 reasons (pie chart) | Updated weekly |

**Churn breakdown:** Voluntary (cancelled) vs. involuntary (payment failed). Involuntary churn → trigger dunning flows.

**Data source:** Recharge API (or Shopify Selling Plans API) + Klaviyo subscription events.

---

### 2.2 Customer LTV by Brand

**Chart type:** Bar chart + table.

| Metric | Plentum | Mavena | PawFully |
|--------|---------|--------|----------|
| **Avg LTV (all-time)** | $ | $ | $ |
| **Avg LTV (12-month)** | $ | $ | $ |
| **Avg Orders per Customer** | # | # | # |
| **Avg Order Value** | $ | $ | $ |
| **Time to 2nd Purchase** | days | days | days |

**Segmented view:** By acquisition source (paid, organic, email, referral).

**Data source:** Shopify Customers API — aggregate order history per customer.

---

### 2.3 Repeat Purchase Rate

| Metric | Description |
|--------|-------------|
| **1x Buyers** | % of customers with exactly 1 order |
| **2x Buyers** | % with 2 orders |
| **3x+ Buyers** | % with 3+ orders |
| **Repeat Rate** | (Customers with 2+ orders / total customers) × 100 |
| **Time Between Orders** | Avg days between 1st→2nd, 2nd→3rd purchase |

**Per brand.** For Mavena (dropship): focus on cross-sell repeat rate (bought product A, then product B).

**Target:** Plentum ≥ 40% repeat (subscription-driven). Mavena ≥ 20%.

**Data source:** Shopify order history, grouped by customer.

---

### 2.4 Cohort Retention Curves

**Chart type:** Heatmap table + line chart overlay.

| | Month 0 | Month 1 | Month 2 | Month 3 | ... | Month 12 |
|---|---------|---------|---------|---------|-----|----------|
| Jan '26 cohort | 100% | % | % | % | ... | % |
| Feb '26 cohort | 100% | % | % | | | |

- **Cohort definition:** Month of first purchase.
- **Retention = made another purchase (or subscription active) in month N.**
- **Color scale:** Green (≥60%) → Yellow (30-59%) → Red (<30%).
- **Plentum bonus view:** Subscription retention curve (% still subscribed at month N).

**Data source:** Shopify orders, grouped by customer first-order month.

---

### 2.5 Win-Back Campaign Performance

| Metric | Description |
|--------|-------------|
| **Lapsed Customers Targeted** | Count entering win-back flows |
| **Win-Back Rate** | % who purchased after win-back email/SMS |
| **Revenue Recovered** | $ from win-back attributed orders |
| **Best Performing Offer** | Which discount/incentive converts best |
| **Avg Days to Win-Back** | Time from lapse to recovery |

**Lapse definitions:**
- Plentum: Subscription cancelled >30 days ago
- Mavena: No purchase in >90 days (was previously 2+ orders)

**Data source:** Klaviyo win-back flow metrics + Shopify order attribution.

---

### 2.6 Customer Health Score Distribution

**Chart type:** Horizontal stacked bar (per brand) + drilldown table.

#### Scoring Model

| Segment | Criteria | Color |
|---------|----------|-------|
| 🏆 **Champions** (score 80-100) | 3+ orders, recent activity (<30d), high AOV, subscribed (if Plentum) | Green |
| 💚 **Healthy** (score 50-79) | 2+ orders, activity within 60d, avg AOV | Blue |
| ⚠️ **At Risk** (score 25-49) | Declining frequency, 60-120d since last order, skipping subs | Yellow |
| 🔴 **Churning** (score 0-24) | 120d+ inactive, cancelled sub, unsubscribed from email | Red |

#### Health Score Inputs (weighted)

| Factor | Weight | Description |
|--------|--------|-------------|
| Recency | 30% | Days since last order |
| Frequency | 25% | Orders in last 12 months |
| Monetary | 20% | Total spend in last 12 months |
| Engagement | 15% | Email open/click activity (last 30d) |
| Subscription Status | 10% | Active/skipped/cancelled (Plentum only) |

**Alerts:**
- 🔴 If "At Risk" segment grows >5% WoW → flag for immediate win-back action
- 🔴 If Champions decline >10% MoM → investigate product/service issues

**Data source:** Computed from Shopify + Klaviyo data. Recalculated daily.

---

## Implementation Notes

### Priority Order
1. **Subscription Metrics** (2.1) — Plentum revenue depends on this
2. **Flow Status Overview** (1.1) — 26 flows need to go live
3. **Customer Health Score** (2.6) — drives all retention actions
4. **Email Performance KPIs** (1.2) — measure what's working
5. **Churn/Cohort curves** (2.4) — longer-term strategic view
6. Everything else

### API Integration Requirements

| Source | API | Auth |
|--------|-----|------|
| Klaviyo | v2024-10-15 REST API | Private API key (per account) |
| Shopify (Plentum) | Admin API 2024-01 | `shpat_25534809...` |
| Shopify (Mavena) | Admin API 2024-01 | `shpat_bde2c259...` |
| Shopify (PawFully) | Admin API 2024-01 | `shpat_b29b9aa7...` |
| Subscription provider | TBD (Recharge / Shopify native) | TBD |

### Refresh Cadence

| Data Type | Refresh |
|-----------|---------|
| Flow status, campaign calendar | Every 4 hours |
| Email KPIs, list growth | Every 4 hours |
| Revenue attribution | Daily (midnight EST) |
| Subscription metrics, churn | Daily |
| LTV, cohorts, health scores | Daily |
| Win-back performance | Daily |

### Brand-Specific Priorities

| Brand | Primary Retention Focus |
|-------|------------------------|
| **Plentum** 🐕 | Subscription retention, reduce churn, reduce skips, increase subscription LTV |
| **Mavena** 💄 | Cross-sell, repeat purchase rate, win-back lapsed buyers |
| **PawFully** 🐾 | List building, welcome flow conversion, first-to-second purchase |

---

*Spec authored by Ember 📧 & Keeper 🔑 — 2026-02-19*
