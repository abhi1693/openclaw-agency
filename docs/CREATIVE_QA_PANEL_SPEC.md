# 🔥 Creative Pipeline & ✅ QA Panel Spec
> Mission Control Dashboard — Forge & Sentinel Panels

---

## Panel 1: 🔥 Daily Generation Tracker

**Purpose:** At-a-glance daily creative production status.

```
┌─────────────────────────────────────────────┐
│  TODAY: Feb 19, 2026                        │
│                                             │
│  🎯 Target: 15    Generated: 12            │
│  ✅ QA Passed: 9   📤 Uploaded to Meta: 7  │
│                                             │
│  ████████████░░░  12/15 (80%)               │
│  Progress: On Track / Behind / Blocked      │
└─────────────────────────────────────────────┘
```

**Data points:**
- Target count (default: 15/day)
- Generated count (Higgs Field API completions)
- QA passed count (items cleared from staging)
- Uploaded count (pushed to Meta ad account)
- Status badge: 🟢 On Track (≥10 by noon) | 🟡 Behind | 🔴 Blocked
- Format breakdown: X × 1:1, X × 9:16 (every creative must have both)
- Rolling 7-day average generation rate

**Data source:** Higgs Field API job history + `shared/staging/creatives/` file counts + Meta Marketing API upload log.

---

## Panel 2: 🏆 Creative Performance Leaderboard

**Purpose:** Surface top-converting creatives so the team knows what to make more of.

| Rank | Thumbnail | Angle | ROAS | Spend | Purchases | CPA | Status |
|------|-----------|-------|------|-------|-----------|-----|--------|
| 1 | 🖼️ | bad-breath-gut-problem | 4.2x | $312 | 47 | $6.64 | 🟢 Scaling |
| 2 | 🖼️ | gut-health-connection | 3.1x | $189 | 28 | $6.75 | 🟢 Active |
| 3 | 🖼️ | before-after-teeth | 2.8x | $95 | 12 | $7.92 | 🟡 Testing |

**Data points:**
- Top 10 by purchases (primary sort) with ROAS as secondary
- Thumbnail preview (click to expand)
- Angle/hook tag
- Format indicator (1:1 / 9:16)
- Lifecycle status: Testing → Active → Scaling → Fatigued → Retired
- Fatigue alert: flag when CTR drops >20% week-over-week
- Filter by: date range, angle, format, status

**Data source:** Meta Marketing API — ad-level insights joined with creative asset metadata.

---

## Panel 3: 📊 Winning Patterns Summary

**Purpose:** Codify what works so generation stays high-quality.

```
┌─────────────────────────────────────────────┐
│  WINNING PATTERNS (last 30 days)            │
│                                             │
│  Format:  Static ONLY (video = 0 purchases) │
│  #1 Angle: "bad-breath-gut-problem" (63%)   │
│  #2 Angle: "gut-health-connection" (21%)    │
│  #3 Angle: "before-after-teeth" (11%)       │
│                                             │
│  Best ratio: 1:1 outperforms 9:16 by 1.4x  │
│  Top palette: Fresh Green #D4F2B6 present   │
│  Subject: Realistic dog + owner together    │
└─────────────────────────────────────────────┘
```

**Data points:**
- Purchase share by angle (pie chart)
- Format performance comparison (static vs video — expect 100/0 split)
- Ratio performance (1:1 vs 9:16 ROAS comparison)
- Common visual elements in top 5 creatives (manual tags)
- New angle test results (last 7 days)
- "Do more of / Stop doing" recommendations (auto-generated from data)

**Data source:** Meta API creative-level performance + angle tags from asset metadata.

---

## Panel 4: ⚙️ Higgs Field Generation Queue

**Purpose:** Monitor batch generation progress in real time.

```
┌─────────────────────────────────────────────┐
│  HIGGS FIELD — Nano Banana Pro              │
│                                             │
│  Batch #47:  ████████░░ 8/10 complete       │
│  Batch #48:  Queued (5 jobs)                │
│                                             │
│  Credits remaining: 142 (~47 images)        │
│  Avg generation time: 38s per image         │
│  ⚠️ Low credits — recharge at <50           │
└─────────────────────────────────────────────┘
```

**Data points:**
- Active batch progress (job count, completion %)
- Queue depth (pending batches)
- Per-job status: Queued → Generating → Complete → Downloaded
- Credits remaining + estimated images left (1080p = 3 credits)
- Low-credit alert threshold: <50 credits (⚠️) / <15 credits (🔴)
- Error/retry count
- Average generation latency

**Data source:** Higgs Field API (`platform.higgsfield.ai`) — poll job status.

---

## Panel 5: 📁 Asset Library Overview

**Purpose:** Know what's in the vault.

```
┌─────────────────────────────────────────────┐
│  ASSET LIBRARY                              │
│                                             │
│  Total creatives: 487                       │
│  By angle:                                  │
│    bad-breath-gut-problem .... 142 (29%)    │
│    gut-health-connection ..... 98  (20%)    │
│    before-after-teeth ........ 76  (16%)    │
│    other angles .............. 171 (35%)    │
│                                             │
│  By format: 244 × 1:1  |  243 × 9:16       │
│  By status: 89 active | 31 testing | 367 retired │
└─────────────────────────────────────────────┘
```

**Data points:**
- Total creative count (all time)
- Breakdown by angle tag
- Breakdown by format (1:1 vs 9:16)
- Breakdown by lifecycle status
- This week's additions vs retirements
- Search/filter capability

**Data source:** Local asset registry (file system scan of creative folders + metadata JSON).

---

## Panel 6: ✅ Staging Queue (QA Inbox)

**Purpose:** Everything waiting for review, across all content types.

```
┌─────────────────────────────────────────────┐
│  QA STAGING QUEUE                           │
│                                             │
│  🎨 Creatives:  7 pending                  │
│  📝 Blogs:      2 pending                  │
│  📢 Campaigns:  1 pending                  │
│                                             │
│  Oldest item: 4h ago ⚠️                    │
│  Avg review time: 12 min                   │
└─────────────────────────────────────────────┘
```

**Items show:**
- Thumbnail/preview
- Category (creative / blog / campaign)
- Submitted timestamp + age
- Auto-QA pre-check result (pass/warn/fail)
- Priority flag (urgent if blocking a campaign launch)
- One-click approve / reject with reason tag

**Data source:** `shared/staging/creatives/` + `shared/staging/blogs/` + `shared/staging/campaigns/` — file presence + metadata.

---

## Panel 7: 📈 QA Pass/Fail Rate

**Purpose:** Track quality trends.

```
  Pass Rate (daily)
  100%|
   90%|          ●  ●     ●
   80%|    ●  ●        ●     ●
   70%|  ●
      +---------------------------
        Mon Tue Wed Thu Fri Sat Sun

  Today: 9/12 passed (75%) — 7-day avg: 82%
```

**Data points:**
- Daily pass rate (line chart, 30-day window)
- 7-day rolling average
- Pass/fail/revision counts per day
- Trend arrow (improving ↑ / declining ↓ / stable →)
- Target line at 85% pass rate

**Data source:** QA log (append-only JSON log of all review decisions).

---

## Panel 8: ❌ Failed Items with Reason Tags

**Purpose:** See exactly why things fail so generation improves.

| Item | Reason | Category | Date | Resubmitted? |
|------|--------|----------|------|---------------|
| creative-0219-03.png | `brand:said-scoop` | Brand violation | Today | No |
| creative-0219-07.png | `format:missing-9x16` | Missing variant | Today | Yes ✅ |
| creative-0218-11.png | `quality:unrealistic-dog` | Visual quality | Yesterday | No |

**Standard reason tags:**
- `brand:said-scoop` — Used "scoop" instead of "sachet"
- `brand:wrong-green` — Color not Fresh Green #D4F2B6
- `brand:cartoon-style` — Not realistic dogs/people
- `format:missing-1x1` — Missing 1:1 variant
- `format:missing-9x16` — Missing 9:16 variant
- `format:wrong-dimensions` — Incorrect pixel dimensions
- `quality:unrealistic-dog` — AI artifacts, uncanny valley
- `quality:text-garbled` — Illegible text in image
- `quality:low-resolution` — Below 1080p
- `content:off-brand-angle` — Angle doesn't match brief
- `content:competitor-reference` — Mentions/shows competitor

**Data points:**
- Sortable/filterable table
- Reason tag frequency (which failures are most common?)
- Resubmission tracking
- "Top 3 failure reasons this week" summary badge

**Data source:** QA log with structured reason tags.

---

## Panel 9: 🤖 Auto-QA Checks

**Purpose:** Automated pre-screening before human review.

```
┌─────────────────────────────────────────────┐
│  AUTO-QA STATUS                             │
│                                             │
│  ✅ Format check    — All pairs present     │
│  ✅ Dimensions      — 1080x1080 + 1080x1920│
│  ⚠️ Brand text scan — 1 item: "scoop" found│
│  ✅ File size        — All <5MB             │
│  ✅ Color palette    — #D4F2B6 present      │
│  ✅ File naming      — Convention OK        │
└─────────────────────────────────────────────┘
```

**Auto-QA checklist (runs on every file landing in staging):**

| Check | Method | Action on Fail |
|-------|--------|----------------|
| Both ratios exist (1:1 + 9:16) | File pair matching | Block — flag `format:missing-*` |
| Dimensions correct | Image metadata read | Block — flag `format:wrong-dimensions` |
| File size ≤ 5MB | File size check | Warn |
| No "scoop" in text overlay | OCR scan (Tesseract) | Block — flag `brand:said-scoop` |
| Fresh Green #D4F2B6 present | Dominant color extraction | Warn — flag `brand:wrong-green` |
| Realistic style (no cartoon) | Visual classifier (future) | Warn — flag `brand:cartoon-style` |
| File naming convention | Regex match | Warn |
| Resolution ≥ 1080p | Pixel count check | Block — flag `quality:low-resolution` |

**Data source:** Automated pipeline watching `shared/staging/creatives/` via filesystem events.

---

## Panel 10: 📉 Quality Score Trend

**Purpose:** Composite quality health over time.

```
  Quality Score (0-100)
  100|
   90|          ●──●──●
   85|--------------------target----
   80|    ●──●           ●──●
   70|  ●
      +---------------------------
       W1   W2   W3   W4   W5  W6

  This week: 87 (+4 from last week)
```

**Quality Score formula:**
- QA pass rate (40% weight)
- Auto-QA pre-check pass rate (20% weight)
- Average creative ROAS vs target (20% weight)
- Resubmission rate — lower is better (10% weight)
- Time-in-staging — faster is better (10% weight)

**Data points:**
- Weekly composite score (line chart, 12-week window)
- Target line at 85
- Component breakdown (which factor is dragging score down?)
- Week-over-week delta with trend arrow

**Data source:** Computed from QA log + Meta API performance data.

---

## Implementation Notes

### File Naming Convention
```
{angle}-{variant}-{date}-{seq}.{ext}
Example: bad-breath-gut-problem-v2-20260219-01.png
```
Each creative produces two files:
- `...-1x1.png` (1080×1080)
- `...-9x16.png` (1080×1920)

### Data Storage
- **QA Log:** `shared/logs/qa-decisions.jsonl` — append-only, one JSON object per decision
- **Asset Metadata:** `shared/assets/registry.json` — angle tags, status, performance links
- **Generation Log:** `shared/logs/higgs-field-jobs.jsonl` — API job tracking

### Refresh Rates
| Panel | Refresh |
|-------|---------|
| Daily Generation Tracker | Every 5 min |
| Performance Leaderboard | Every 6 hours |
| Winning Patterns | Daily |
| Higgs Field Queue | Every 30 sec (when active) |
| Asset Library | Every 15 min |
| Staging Queue | Real-time (filesystem watch) |
| QA Pass/Fail Rate | On each QA decision |
| Failed Items | On each QA decision |
| Auto-QA Checks | Real-time (on file arrival) |
| Quality Score | Weekly (Sunday midnight) |

### Key Alerts (push to #plentum-updates Slack)
- 🔴 Credits < 15 — generation will stop
- 🔴 0 creatives generated by noon — pipeline stalled
- 🟡 QA pass rate < 70% today — quality issue
- 🟡 Item in staging > 8 hours — review bottleneck
- 🟢 Daily target of 15 reached — celebrate!
