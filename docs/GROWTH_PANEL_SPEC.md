# Growth Panel Spec — Mission Control Dashboard

> **Owner:** Scout 🔍 (SEO) + Sage ✍️ (Content)
> **Last updated:** 2026-02-19
> **Brands:** Plentum (plentum.com) · Mavena (mavenaco.com)

---

## Daily North Star Question

> **"Is organic growing?"**
>
> The Growth panel answers this in <10 seconds with three signals:
> 1. **Traffic trend** — Are GSC clicks up week-over-week?
> 2. **Content velocity** — Are we publishing and promoting on schedule?
> 3. **Authority momentum** — Are backlinks and DA trending up?

---

## Panel Layout

```
┌─────────────────────────────────────────────────────────┐
│  GROWTH / SEO                                    [site▾]│
├───────────┬───────────┬───────────┬─────────────────────┤
│ Clicks 7d │ Impr. 7d  │ Avg Pos   │ Indexed Pages       │
│  ▲ 12%    │  ▲ 8%     │  18.3     │  94 / 125           │
├───────────┴───────────┴───────────┴─────────────────────┤
│ [Organic Traffic Trend — 90-day line chart]              │
├─────────────────────┬───────────────────────────────────┤
│ Top Keywords (10)   │ Internal Linking    [████░░] 49%  │
├─────────────────────┼───────────────────────────────────┤
│ Content Pipeline    │ Publishing Calendar               │
├─────────────────────┼───────────────────────────────────┤
│ Article Performance │ Content Gaps                      │
├─────────────────────┴───────────────────────────────────┤
│ Off-Page: Backlinks · DA · Posting Log · Mentions       │
└─────────────────────────────────────────────────────────┘
```

---

## A. SEO Section

### A1. Organic Traffic Trend

| Field | Detail |
|-------|--------|
| **Source** | GSC API (`searchAnalytics.query`) — both sites |
| **Chart** | Line chart, 90-day window, daily granularity |
| **Series** | Clicks (primary, blue), Impressions (secondary, gray) |
| **Annotations** | Auto-mark algorithm updates, major publishes |
| **KPI cards above chart** | Clicks 7d (Δ% WoW), Impressions 7d (Δ% WoW), Avg Position (Δ) |
| **Site toggle** | Dropdown: Plentum / Mavena / Combined |
| **Refresh** | Daily (GSC data has ~2-day lag) |

**Data endpoint:**
```
POST https://www.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query
{
  "startDate": "90 days ago",
  "endDate": "2 days ago",
  "dimensions": ["date"],
  "type": "web"
}
```

### A2. Top Keywords Table

| Column | Source |
|--------|--------|
| Keyword | GSC `query` dimension |
| Position | GSC avg position |
| Impressions | GSC impressions |
| Clicks | GSC clicks |
| CTR | GSC ctr |
| Δ Position (7d) | Computed: current avg pos − 7d-ago avg pos |
| Trend | Sparkline (28d position history) |

- **Default sort:** Impressions desc
- **Rows:** Top 20, expandable to 100
- **Filters:** Brand/non-brand, position buckets (1-3, 4-10, 11-20, 20+)
- **Highlight:** Green if position improved ≥2, red if dropped ≥2

### A3. Indexation Status

| Metric | Source |
|--------|--------|
| Total pages submitted | Sitemap count |
| Indexed pages | GSC URL Inspection API / Coverage report |
| Not indexed (crawled) | GSC Coverage |
| Not indexed (discovered) | GSC Coverage |
| Excluded (noindex, canonical, etc.) | GSC Coverage |

**Display:** Stacked bar — green (indexed), yellow (discovered not indexed), red (crawled not indexed), gray (excluded)

**Alert:** If indexed % drops >5% WoW → red badge

### A4. Internal Linking Progress

| Metric | Current |
|--------|---------|
| **Plentum blog articles** | 121 total |
| **Internally linked** | 59 (48.8%) |
| **Remaining** | 62 |
| **Guide pages** | 4 (hub pages) |

**Display:** Progress bar with fraction label: `████████░░░░░░░░ 59/121 (49%)`

**Data source:** Internal tracker (JSON/Airtable/sheet). Each article row has `has_internal_links: boolean` and `linked_to: [slugs]`.

**Target:** 100% by end of Q1 2026 → show projected completion date based on current velocity.

### A5. Core Web Vitals

| Metric | Threshold | Source |
|--------|-----------|--------|
| LCP | ≤2.5s (good) | CrUX API / PageSpeed Insights |
| INP | ≤200ms (good) | CrUX API |
| CLS | ≤0.1 (good) | CrUX API |

**Display:** Per-site badge grid (Plentum / Mavena × Mobile / Desktop × LCP / INP / CLS) — green/yellow/red dots.

**Refresh:** Weekly (CrUX is 28-day rolling)

**API:**
```
GET https://chromeuxreport.googleapis.com/v1/records:queryRecord
{ "origin": "https://plentum.com", "formFactor": "PHONE" }
```

---

## B. Content Section

### B1. Content Pipeline

Kanban-style columns showing article counts per stage:

| Stage | Description | Plentum | Mavena |
|-------|-------------|---------|--------|
| **Backlog** | Topic approved, not started | — | — |
| **Draft** | Writing in progress | — | — |
| **Review** | Editing / SEO check | — | — |
| **Published** | Live on site | 121 | 50+ |
| **Promoted** | Shared on socials / off-page | — | — |

**Data source:** Content tracker (Notion/Airtable/Google Sheet — TBD, needs setup).

**Display:** Horizontal funnel with counts. Click a stage to see article list.

**Velocity metric:** Articles published per week (4-week rolling avg) shown as subtitle.

### B2. Publishing Calendar

| Field | Detail |
|-------|--------|
| **View** | Month calendar with day cells |
| **Each cell** | Dot per scheduled/published article, color-coded by brand |
| **Colors** | 🔵 Plentum · 🟣 Mavena |
| **States** | Hollow dot = scheduled, filled = published |
| **Click** | Opens article details (title, URL, target keyword, author) |

**Data source:** Same content tracker as B1.

**Target cadence:** Show a "target" line (e.g., 3 articles/week) to compare actual vs planned.

### B3. Article Performance

| Column | Source |
|--------|--------|
| Page URL | GSC `page` dimension |
| Title | Scraped or from CMS |
| Clicks (28d) | GSC |
| Impressions (28d) | GSC |
| Avg Position | GSC |
| Sessions (28d) | GA4 (property 472066172 / 511243414) |
| Bounce Rate | GA4 |
| Avg Time on Page | GA4 |

- **Default sort:** Clicks desc
- **Rows:** Top 25
- **Filters:** Brand, date range, content type (blog / guide)
- **Highlight:** 🔥 on articles with >50% click growth WoW

**GA4 API:**
```
POST https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport
{
  "dimensions": [{"name": "pagePath"}],
  "metrics": [{"name": "sessions"}, {"name": "bounceRate"}, {"name": "averageSessionDuration"}],
  "dateRanges": [{"startDate": "28daysAgo", "endDate": "today"}]
}
```

### B4. Content Gap Tracker

| Column | Detail |
|--------|--------|
| Keyword | High-volume keyword we don't rank for (pos >50 or absent) |
| Monthly Volume | From keyword research tool (Ahrefs/SEMrush API or manual import) |
| Difficulty | KD score |
| Current Rank | GSC (if any) or "—" |
| Competitor Ranking | Which competitors rank top 3 |
| Priority | Auto-scored: volume × (1/difficulty) |
| Status | Not started / Assigned / In draft |

**Data source:** Quarterly keyword research export + GSC cross-reference.

**Display:** Table sorted by priority, top 20. Badge count of total gaps.

---

## C. Off-Page Section

### C1. Backlink Count & Trend

| Metric | Source |
|--------|--------|
| Total backlinks | Ahrefs/Moz API (or manual monthly import) |
| Referring domains | Same |
| New backlinks (30d) | Same |
| Lost backlinks (30d) | Same |

**Display:** Single number + 6-month sparkline for referring domains.

**Alert:** If referring domains drop >10% MoM → warning badge.

### C2. Reddit / Medium / Quora Posting Log

| Column | Detail |
|--------|--------|
| Date | Post date |
| Platform | Reddit / Medium / Quora |
| Title/Topic | Post title or question answered |
| URL | Link to post |
| Engagement | Upvotes, comments, views (where available) |
| Referral Clicks | UTM-tracked clicks to our sites (GA4) |
| Status | Published / Pending / Removed |

**Current status:**
- Reddit: Active (u/ok-introduction-145, anonymous — never mention Plentum by name publicly)
- Medium: Pending first publish
- Quora: Needs account creation

**Display:** Reverse-chronological table, filterable by platform. Summary cards: posts this week / total / referral clicks.

### C3. Domain Authority Trend

| Metric | Source |
|--------|--------|
| DA (Moz) or DR (Ahrefs) | Monthly API pull or manual |
| Plentum current | TBD |
| Mavena current | TBD |

**Display:** Line chart, monthly data points, 12-month window. Both brands on same chart.

### C4. Brand Mention Monitoring

| Column | Detail |
|--------|--------|
| Date | Mention date |
| Source | URL where mentioned |
| Context | Snippet of mention |
| Sentiment | Positive / Neutral / Negative |
| Has Backlink? | Yes / No (opportunity if no) |

**Data source:** Google Alerts API, or Mention.com/Brand24 integration. Queries: "plentum", "mavena co", "mavenaco".

**Display:** Feed view (newest first), with daily count sparkline.

---

## Data Sources Summary

| Source | API/Method | Properties | Refresh |
|--------|-----------|------------|---------|
| GSC | Search Analytics API | plentum.com, mavenaco.com | Daily |
| GA4 | Data API v1 | 472066172, 511243414 | Daily |
| CrUX | CrUX API | Both origins | Weekly |
| Shopify | Admin API | plentumstore, mavenaco | Real-time |
| Ahrefs/Moz | API or CSV import | Both domains | Weekly/Monthly |
| Content Tracker | TBD (Notion/Sheet) | Both brands | Real-time |
| Reddit/Medium/Quora | Manual log or scrape | — | Per-post |
| Google Alerts | Email or API | Brand queries | Daily |

---

## Implementation Priority

| Phase | Panels | Effort | Impact |
|-------|--------|--------|--------|
| **P0 — Now** | A1 (Traffic Trend), A2 (Keywords), A4 (Internal Links), B3 (Article Perf) | Low — GSC API already connected | High — answers "is organic growing?" |
| **P1 — Next** | A3 (Indexation), B1 (Pipeline), B2 (Calendar), C2 (Posting Log) | Med — needs content tracker setup | High — answers "are we executing?" |
| **P2 — Soon** | A5 (CWV), C1 (Backlinks), C3 (DA), B4 (Content Gaps) | Med — needs Ahrefs/Moz API | Med — strategic visibility |
| **P3 — Later** | C4 (Brand Mentions) | Low — Google Alerts is free | Low — nice to have |

---

## Alert Rules

| Alert | Condition | Severity |
|-------|-----------|----------|
| Traffic drop | Clicks down >15% WoW | 🔴 Critical |
| Indexation drop | Indexed pages down >5% WoW | 🔴 Critical |
| CWV regression | Any metric moves from Good → Needs Improvement | 🟡 Warning |
| Publishing miss | 0 articles published in 7 days | 🟡 Warning |
| Internal linking stall | No new links added in 14 days | 🟡 Warning |
| DA drop | DA/DR drops ≥2 points MoM | 🟡 Warning |
| Keyword drop | Any top-10 keyword drops to 20+ | 🟡 Warning |
| Brand mention (negative) | Negative sentiment detected | 🔵 Info |
