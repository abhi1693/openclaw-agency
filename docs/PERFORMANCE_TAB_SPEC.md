# Performance Tab — Mission Control Dashboard Spec

> Owner: Prism 📊 | Created: 2026-02-19 | Goal: $100K/month per brand

---

## 1. KPI Cards (Top Row)

Six cards, each showing **current value**, **delta %**, and **sparkline (7d)**. Global date picker controls all: Today, Yesterday, This Week, Last 7d, This Month, Last 30d, Custom Range.

| Card | Metric | Calculation | Comparison |
|------|--------|-------------|------------|
| **Revenue** | Total net revenue | Sum of `total_price - refunds` across all brands (Shopify source, Triple Whale for reconciliation) | vs same prior period |
| **Orders** | Total order count | Shopify `orders/count` excluding cancelled/refunded | vs same prior period |
| **AOV** | Average Order Value | Revenue ÷ Orders | vs same prior period |
| **Ad Spend** | Total paid media spend | Meta + Google Ads API | vs same prior period |
| **Blended ROAS** | Return on ad spend | Revenue ÷ Ad Spend | vs same prior period |
| **New Customers** | First-time buyers | Shopify customers where `orders_count = 1` in period | vs same prior period |

**Delta colors:** Green ≥ +5%, Gray -5% to +5%, Red ≤ -5% (inverted for Spend: red = overspend).

---

## 2. Charts

### 2a. Revenue Trend (Primary)
- **Type:** Area chart, stacked by brand (4 colors)
- **X-axis:** Date (auto-granularity: hourly for today, daily for week/month, weekly for 90d+)
- **Y-axis:** Revenue ($)
- **Overlay toggle:** Prior period as dashed line
- **Default range:** Last 30 days

### 2b. Spend vs Revenue
- **Type:** Dual-axis line chart
- **Left Y:** Revenue | **Right Y:** Ad Spend
- **Brands:** Filterable (all/individual)
- **Default range:** Last 30 days

### 2c. ROAS Over Time
- **Type:** Line chart, one line per brand
- **Y-axis:** ROAS (×)
- **Reference line:** 3.0× (break-even target)
- **Default range:** Last 30 days

### 2d. Orders Per Day
- **Type:** Bar chart, stacked by brand
- **Default range:** Last 30 days

### 2e. AOV Trend
- **Type:** Line chart per brand
- **Default range:** Last 30 days

### 2f. Traffic Sources (Pie/Donut)
- **Type:** Donut chart
- **Segments:** Organic Search, Paid Social, Paid Search, Email, Direct, Referral
- **Source:** GA4 `sessionDefaultChannelGroup`
- **Default range:** Last 7 days

---

## 3. Brand Comparison Table

Sortable table, one row per brand. Default sort: Revenue DESC.

| Column | Source |
|--------|--------|
| Brand | — |
| Revenue (period) | Shopify |
| Orders | Shopify |
| AOV | Calculated |
| Ad Spend | Meta/Google Ads |
| ROAS | Calculated |
| New Customers | Shopify |
| Returning Customer % | Shopify |
| Refund Rate % | Shopify |
| Conv. Rate % | GA4 |
| Goal Progress | Calculated (rev ÷ $100K) |

Row click → drills into single-brand detail view.

---

## 4. Campaign Performance Table

For Blade (paid media operator). Filterable by brand, platform, status.

| Column | Source |
|--------|--------|
| Campaign Name | Meta/Google Ads |
| Platform | Meta / Google |
| Brand | Mapped |
| Status | Active/Paused/Ended |
| Spend (period) | Ads API |
| Revenue (attributed) | Ads API (+ Triple Whale cross-ref) |
| ROAS | Calculated |
| Impressions | Ads API |
| Clicks | Ads API |
| CTR % | Calculated |
| CPC | Calculated |
| CPM | Calculated |
| Purchases | Ads API pixel/conversion |
| CPA | Spend ÷ Purchases |

Sortable by any column. Color-code ROAS: 🟢 ≥3×, 🟡 2-3×, 🔴 <2×.

---

## 5. Channel Breakdown

Horizontal stacked bar per brand showing revenue attribution:

| Channel | Source | Attribution |
|---------|--------|-------------|
| **Paid Social** | Meta Ads | Meta pixel `purchase` events |
| **Paid Search** | Google Ads | Google conversion tracking |
| **Organic Search** | GA4 | `sessionDefaultChannelGroup = "Organic Search"` |
| **Email/SMS** | GA4 | UTM `medium=email` or Klaviyo attribution |
| **Direct** | GA4 | `sessionDefaultChannelGroup = "Direct"` |
| **Referral** | GA4 | `sessionDefaultChannelGroup = "Referral"` |

**Note:** Attribution will double-count across platforms. Display disclaimer: "Platform-reported; totals may exceed actual revenue."

---

## 6. Goal Tracking — $100K/Month Per Brand

Visual progress gauge per brand showing MTD revenue vs $100K target.

```
Plentum   ████░░░░░░░░░░░░  $16,200 / $100K  (16.2%)  — Pacing: $30,857/mo
Mavena    ████████████░░░░  $74,500 / $100K  (74.5%)  — Pacing: $141,553/mo ✅
PawFully  ██░░░░░░░░░░░░░░  $8,400  / $100K  (8.4%)   — Pacing: $15,960/mo
RetroMedy ░░░░░░░░░░░░░░░░  $0      / $100K  (0.0%)   — No data
```

**Pacing formula:** `(MTD Revenue ÷ Day of Month) × Days in Month`

Colors: 🟢 On pace (projected ≥ $100K), 🟡 Within 20%, 🔴 Below 80% pace.

Secondary view: **Trailing 6-month trend** — monthly revenue per brand as grouped bar chart with $100K line overlay.

---

## 7. Data Refresh Strategy

| Source | Endpoint | Frequency | Cron (ET) | Latency |
|--------|----------|-----------|-----------|---------|
| **Shopify** (3 stores) | Orders, Customers | Every 15 min | `*/15 * * * *` | ~Real-time |
| **Meta Ads** (2 accounts) | Campaign insights | Every 2 hours | `0 */2 * * *` | ~3h delay |
| **Google Ads** (3 accounts) | Campaign metrics | Every 4 hours | `0 */4 * * *` | ~3h delay |
| **GA4** (2 properties) | Sessions, channels | Every 6 hours | `0 0,6,12,18 * * *` | ~4-24h delay |
| **GSC** (2 properties) | Clicks, impressions | Daily | `0 8 * * *` | 48-72h delay |
| **Triple Whale** | Revenue reconciliation | Daily | `0 7 * * *` | ~24h delay |

**Morning rollup** at 7:00 AM ET: Aggregate all sources → write `performance-data.json` → trigger Slack summary to `#plentum-updates` and `#mavena-updates`.

---

## 8. JSON Schema — `performance-data.json`

```jsonc
{
  "generated_at": "2026-02-19T07:00:00-05:00",
  "period": { "start": "2026-02-01", "end": "2026-02-19", "granularity": "daily" },

  "summary": {
    "total_revenue": 99100,
    "total_orders": 1847,
    "total_aov": 53.66,
    "total_spend": 28500,
    "blended_roas": 3.48,
    "total_new_customers": 1102
  },

  "brands": {
    "plentum": {
      "revenue": 16200,
      "orders": 392,
      "aov": 41.33,
      "spend": 5800,
      "roas": 2.79,
      "new_customers": 245,
      "returning_pct": 18.2,
      "refund_rate": 3.1,
      "conversion_rate": 2.4,
      "goal": { "target": 100000, "mtd": 16200, "pacing": 30857, "on_track": false },
      "daily": [
        { "date": "2026-02-01", "revenue": 820, "orders": 19, "spend": 310, "new_customers": 12 }
        // ... one entry per day
      ],
      "channels": {
        "paid_social": { "revenue": 7200, "spend": 4100, "roas": 1.76 },
        "paid_search": { "revenue": 3800, "spend": 1700, "roas": 2.24 },
        "organic_search": { "revenue": 2900, "sessions": 4200 },
        "email": { "revenue": 1500, "sessions": 800 },
        "direct": { "revenue": 600, "sessions": 500 },
        "referral": { "revenue": 200, "sessions": 150 }
      },
      "campaigns": [
        {
          "id": "120210123456",
          "name": "Plentum - TOF - Broad",
          "platform": "meta",
          "status": "active",
          "spend": 2100,
          "revenue": 4800,
          "roas": 2.29,
          "impressions": 185000,
          "clicks": 3200,
          "ctr": 1.73,
          "cpc": 0.66,
          "cpm": 11.35,
          "purchases": 52,
          "cpa": 40.38
        }
        // ... all campaigns
      ]
    },
    "mavena": { /* same structure */ },
    "pawfully": { /* same structure */ },
    "retromedy": { /* same structure — null/zero until data exists */ }
  },

  "charts": {
    "revenue_trend": [
      { "date": "2026-02-01", "plentum": 820, "mavena": 3950, "pawfully": 440, "retromedy": 0 }
      // ... daily
    ],
    "spend_trend": [
      { "date": "2026-02-01", "plentum": 310, "mavena": 1100, "pawfully": 90, "retromedy": 0 }
    ],
    "roas_trend": [
      { "date": "2026-02-01", "plentum": 2.65, "mavena": 3.59, "pawfully": 4.89, "retromedy": null }
    ]
  },

  "alerts": []  // see section 9
}
```

---

## 9. Alerts & Thresholds

Alerts populate in `alerts[]` array and render as a dismissible banner at top of Performance tab.

| Alert | Condition | Severity | Check Freq |
|-------|-----------|----------|------------|
| **ROAS Crash** | Brand ROAS < 2.0× (trailing 3 days) | 🔴 Critical | Every 2h |
| **Spend Pacing Over** | Daily spend > 120% of daily budget | 🔴 Critical | Every 2h |
| **Spend Pacing Under** | Daily spend < 50% of daily budget | 🟡 Warning | Every 4h |
| **Revenue Drop** | Today's revenue < 60% of same-day-last-week by 2 PM | 🟡 Warning | 2 PM daily |
| **Goal Off Track** | Brand pacing < $80K projected | 🟡 Warning | Daily 7 AM |
| **Zero Orders** | Any brand with 0 orders for 6+ hours (9AM-11PM) | 🔴 Critical | Hourly |
| **High Refund Rate** | Brand refund rate > 8% (trailing 7d) | 🟡 Warning | Daily |
| **AOV Anomaly** | AOV deviates > 25% from 30-day avg | 🟡 Warning | Daily |
| **Data Stale** | Any source not updated in 2× expected interval | 🟡 Warning | Every 15 min |

Alert schema:
```json
{
  "id": "alert_20260219_roas_plentum",
  "type": "roas_crash",
  "severity": "critical",
  "brand": "plentum",
  "message": "Plentum ROAS at 1.6× (3-day avg). Below 2.0× threshold.",
  "value": 1.6,
  "threshold": 2.0,
  "triggered_at": "2026-02-19T07:00:00-05:00",
  "dismissed": false
}
```

---

## 10. 7 AM Morning View — "Am I Winning?"

When Arpit opens the dashboard at 7 AM, he sees (top to bottom):

1. **Alert banner** — any red/yellow flags from overnight
2. **6 KPI cards** — yesterday's final numbers vs day before
3. **Goal gauges** — 4 brands, MTD progress toward $100K
4. **Revenue trend chart** — last 30 days, all brands stacked
5. **Brand comparison table** — MTD snapshot, sorted by revenue
6. **Campaign table** — sortable, filterable (Blade's workspace)

One glance = "Mavena's cruising, Plentum needs attention, PawFully needs a plan, RetroMedy is pre-launch."

---

## Implementation Notes

- **Primary data source:** Shopify for revenue/orders (ground truth for fulfillment)
- **Reconciliation:** Triple Whale daily pull at 7 AM cross-checks Shopify totals; discrepancies > 5% trigger alert
- **RetroMedy:** Schema included but all values null/0 until store is live. No API credentials yet.
- **Google Ads:** Pending OAuth flow completion. Schema ready; data will populate once auth is done.
- **File location:** `mission-control/performance-data.json` (generated by cron aggregator script)
- **Dashboard renderer:** TBD — can be static HTML, React app, or Canvas-based depending on infra decision
