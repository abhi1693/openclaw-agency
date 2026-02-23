# Paid Media Panel — Mission Control Spec

> **Owner:** Blade ⚔️ | **Last updated:** 2026-02-19
> **Goal:** At a glance, know if we're making or losing money RIGHT NOW.

---

## 1. Campaign Health Cards

One card per active campaign. Cards sorted by spend (highest first).

### Metrics per card
| Metric | Source | Format |
|--------|--------|--------|
| **Campaign name** | Meta/Google | text |
| **Platform badge** | — | 🟦 Meta · 🟩 Google |
| **Brand** | — | Plentum / Mavena / PawFully |
| **Status** | API | 🟢 Active · 🟡 Learning · 🔴 Off/Error |
| **Learning phase** | Meta only | `Learning` / `Learning Limited` / `Active` — days in current phase |
| **Daily budget** | API | $X/day |
| **Today's spend** | API | $X.XX + % of daily budget |
| **Budget pacing %** | calc | (spend / budget) × (24 / hours_elapsed) — gauge bar |
| **ROAS** | API | X.XX× (green ≥2×, yellow 1–2×, red <1×) |
| **CPA** | API | $X.XX (color vs target CPA) |
| **Conversions** | API | count today / 7d avg |
| **CTR** | API | X.XX% |
| **CPM** | API | $X.XX |
| **Frequency** | Meta | X.X (warn if >3) |

### Card color coding
- **Green border:** ROAS ≥ 2× AND on-pace
- **Yellow border:** ROAS 1–2× OR pacing off by >20%
- **Red border:** ROAS < 1× OR learning stuck >7d OR budget exhausted

---

## 2. Top / Bottom Performers

### Top 5 / Bottom 5 Ads (across all platforms & brands)

Table sorted by **cost per result** (ascending = best).

| Column | Notes |
|--------|-------|
| Ad name / Creative thumbnail | 50×50 preview |
| Brand | Plentum / Mavena / PawFully |
| Platform | Meta / Google |
| Spend (7d) | — |
| Conversions (7d) | — |
| CPA | color-coded vs target |
| ROAS | — |
| CTR | — |
| Trend arrow | ↑↓→ vs prior 7d |

**Quick actions per row:** `⏸ Pause` · `📈 Scale +20%` · `🔍 Details`

---

## 3. Budget Pacing

### Per-brand summary bar

```
Brand        Daily Target    Spent Today    Pacing     Monthly Target   MTD Spend    MTD Pacing
─────────────────────────────────────────────────────────────────────────────────────────────────
Plentum      $150/day        $62.40         On pace    $4,500           $2,180       97% ✅
Mavena       $40/day         $36.68         92%        $1,200           $680         104% ⚠️
PawFully     $30/day         $12.00         40% 🔴     $900             $228         51% 🔴
```

### Visual
- Horizontal gauge per brand: green fill up to target, red overshoot
- Dotted line = where pacing should be at this hour
- Solid fill = actual spend

### Editable targets
- Daily / weekly / monthly budget targets set per brand (stored in config, not from API)

---

## 4. Creative Performance

### Creative leaderboard (7-day rolling)

| Column | Notes |
|--------|-------|
| Creative name | + thumbnail |
| Hook / angle tag | e.g. "bad-breath-gut-problem", "vet-approved" |
| Platform | Meta / Google |
| Brand | — |
| Impressions | — |
| CTR | color: green >2%, yellow 1–2%, red <1% |
| CPA | vs target |
| ROAS | — |
| Conversions | — |
| Spend | — |
| Status | Active / Paused / Learning |

### Creative insights box
- **Winning angles:** auto-tag by naming convention, show which hooks convert
- **Fatigue alert:** CTR declining >20% week-over-week → flag
- **Current state callout:** _"Only 'bad-breath-gut-problem' converting for Plentum — creative diversity risk 🔴"_

---

## 5. Cross-Platform Brand View

### Per brand (Plentum, Mavena, PawFully): side-by-side columns

```
                    Meta                    Google                  TOTAL
                    ─────                   ─────                   ─────
Spend (today)       $62.40                  $18.20                  $80.60
Spend (7d)          $436.80                 $127.40                 $564.20
ROAS                1.42×                   2.10×                   1.61×
CPA                 $38.50                  $22.10                  $32.80
Conversions (7d)    12                      6                       18
CTR                 1.8%                    3.2%                    —
Top creative        bad-breath-gut-problem  Search - Brand          —
```

### Blended metrics row
- Total spend, blended ROAS, blended CPA across all platforms per brand
- **Revenue attribution:** Shopify revenue vs ad spend = true blended ROAS

---

## 6. Alerts

### Alert priority levels

| Priority | Trigger | Threshold | Action |
|----------|---------|-----------|--------|
| 🔴 CRITICAL | ROAS below floor | < 0.8× for 3+ days | Auto-pause suggestion |
| 🔴 CRITICAL | Budget exhausted before noon | >80% spent before 12pm | Notify immediately |
| 🔴 CRITICAL | Learning phase stuck | >7 days in Learning | Review / restructure |
| 🟡 WARNING | CPA above target | >150% of target CPA for 48h | Review creatives |
| 🟡 WARNING | Creative fatigue | CTR drop >25% WoW | Rotate creatives |
| 🟡 WARNING | Frequency too high | >3.0 (Meta) | Expand audience |
| 🟡 WARNING | Single creative dependency | >80% spend on 1 creative | Diversify |
| 🟡 WARNING | Underspend | <50% pacing at midday | Check delivery issues |
| 🟢 INFO | New campaign exited learning | — | Celebrate / scale? |
| 🟢 INFO | ROAS spike | >2× above 7d avg | Investigate & scale |

### Current known alerts (as of spec date)
- 🔴 Plentum: 3 ad sets stuck in Learning
- 🟡 Plentum: Only 1 converting creative ("bad-breath-gut-problem")
- 🟡 Plentum: Budget $100/day — below recommended
- 🟢 Mavena: 3.28× ROAS — performing well

### Alert delivery
- Dashboard: bell icon with count badge
- Slack: post to `#plentum-updates` / `#mavena-updates`
- Telegram: push to Arpit for CRITICAL only

---

## 7. Historical Trends

### Charts (default: 30-day view, toggleable to 7d / 90d)

1. **Spend over time** — stacked area by brand, line per platform
2. **ROAS over time** — line per brand with target threshold line
3. **CPA over time** — line per brand with target threshold line
4. **Conversions over time** — bar chart per brand
5. **CTR over time** — line per platform (Meta vs Google)

### Annotations on charts
- Vertical markers for: creative launches, budget changes, campaign on/off events
- Hover: show exact values + % change vs prior period

---

## 8. Recommended Actions

Auto-generated from rules engine. Each recommendation:

```
[Priority] [Brand] [Action] [Rationale] [One-click button]
```

### Rule set

| Condition | Recommendation |
|-----------|---------------|
| ROAS > 2.5× for 5+ days, not at budget cap | 📈 **Scale budget +25%** on [campaign] |
| ROAS < 0.8× for 3+ days | ⏸ **Pause** [campaign] — bleeding money |
| CPA > 2× target for 48h | 🔄 **Rotate creatives** on [campaign] |
| 1 creative = >80% of spend | ⚠️ **Test new creatives** — single point of failure |
| Learning stuck >7 days | 🔧 **Consolidate ad sets** or increase budget to exit learning |
| CTR dropping >25% WoW | 🎨 **Creative fatigue** — launch new hooks |
| Platform ROAS diverging >2× | 💰 **Shift budget** from [low] to [high] platform |
| Underspend <60% pacing | 🔍 **Check delivery** — audience too narrow or bid too low |

### Current recommendations (based on known state)
1. 🔧 **Plentum Meta:** Consolidate 3 learning ad sets → fewer ad sets with more budget each to exit learning
2. ⚠️ **Plentum Meta:** Test 3–5 new creatives — over-reliance on "bad-breath-gut-problem"
3. 📈 **Plentum Meta:** Increase daily budget from $100 → $150+ to help exit learning
4. 📈 **Mavena Meta:** ROAS at 3.28× — scale budget cautiously (+20%)
5. 🔍 **PawFully Google:** Verify campaigns are active and spending

---

## Data Sources & Refresh

| Source | API | Refresh rate |
|--------|-----|-------------|
| Meta Ads | Marketing API v21.0 | Every 30 min |
| Google Ads | Google Ads API v18 | Every 30 min |
| Shopify (revenue) | Admin API | Every 15 min |
| Budget targets | Local config | Manual |

### Account IDs
- Plentum Meta: Campaign 120241449609470326 (act_736405932421739)
- Mavena Meta: act_1002679805332780
- Google MCC: 467-004-6496
  - Plentum Google: 373-999-5780
  - Mavena Google: 383-156-9586
  - PawFully Google: 468-927-3564

---

## Dashboard Layout (suggested)

```
┌─────────────────────────────────────────────────────┐
│  🔔 ALERTS BAR (critical alerts scroll here)        │
├──────────────┬──────────────┬───────────────────────┤
│  PLENTUM     │  MAVENA      │  PAWFULLY             │
│  Brand Card  │  Brand Card  │  Brand Card           │
│  (cross-plat)│  (cross-plat)│  (cross-plat)         │
├──────────────┴──────────────┴───────────────────────┤
│  BUDGET PACING GAUGES (all brands)                  │
├─────────────────────┬───────────────────────────────┤
│  TOP 5 ADS          │  BOTTOM 5 ADS                 │
├─────────────────────┴───────────────────────────────┤
│  CAMPAIGN HEALTH CARDS (scrollable grid)            │
├─────────────────────────────────────────────────────┤
│  CREATIVE LEADERBOARD                               │
├─────────────────────────────────────────────────────┤
│  TREND CHARTS (spend · ROAS · CPA tabs)             │
├─────────────────────────────────────────────────────┤
│  RECOMMENDED ACTIONS                                │
└─────────────────────────────────────────────────────┘
```

---

## Key Principle

> **If I open this dashboard and can't tell in 5 seconds whether we're profitable — it's wrong.**

Every number should answer: _Are we making money?_ Everything else is decoration.
