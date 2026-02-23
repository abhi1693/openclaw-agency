# Plentum Klaviyo Audit — Triple Pixel vs Standard Shopify Metrics
**Audit Date:** 2026-02-22  
**Window:** 30 days (2026-01-23 through 2026-02-22)  
**Auditor:** Ember (OpenClaw)  
**API Revision:** 2024-10-15  

---

## Raw API Results

The Klaviyo metric-aggregates endpoint returned data in two monthly buckets:
- **January bucket** — covers Jan 23–31 (partial month within our filter window)
- **February bucket** — covers Feb 1–22 (partial month within our filter window)

The 30-day total = January bucket + February bucket.

---

## 30-Day Event Counts

### Added to Cart
| Source | Metric ID | Jan Bucket | Feb Bucket | **30-Day Total** |
|--------|-----------|-----------|-----------|-----------------|
| Shopify (Standard) | T8dkjg | 35 | 70 | **105** |
| Triple Pixel | YhYkNs | 38 | 63 | **101** |
| **Delta** | | | | **-4 (-3.8%)** |

### Checkout Started
| Source | Metric ID | Jan Bucket | Feb Bucket | **30-Day Total** |
|--------|-----------|-----------|-----------|-----------------|
| Shopify (Standard) | R5w3su | 32 | 83 | **115** |
| Triple Pixel | U67xaR | 21 | 28 | **49** |
| **Delta** | | | | **-66 (-57.4%)** |

### Viewed Product
| Source | Metric ID | Jan Bucket | Feb Bucket | **30-Day Total** |
|--------|-----------|-----------|-----------|-----------------|
| Shopify (Standard) | UzJy84 | 118 | 182 | **300** |
| Triple Pixel | ShFDEn | 119 | 180 | **299** |
| **Delta** | | | | **-1 (-0.3%)** |

### Placed Order (Shopify only — no Triple Pixel equivalent)
| Source | Metric ID | Jan Bucket | Feb Bucket | **30-Day Total** |
|--------|-----------|-----------|-----------|-----------------|
| Shopify (Standard) | VUpTGG | 73 | 126 | **199** |

---

## Summary Table

| Event | Shopify | Triple Pixel | Delta | Delta % |
|-------|---------|-------------|-------|---------|
| Added to Cart | 105 | 101 | -4 | -3.8% |
| Checkout Started | 115 | 49 | -66 | -57.4% |
| Viewed Product | 300 | 299 | -1 | -0.3% |
| Placed Order | 199 | N/A | — | — |

---

## Key Findings

### 1. Checkout Started — CRITICAL DISCREPANCY
Triple Pixel is reporting **57.4% fewer** Checkout Started events than Shopify standard (49 vs 115). This is a massive gap. Possible causes:
- Triple Pixel script may not be firing on the checkout page (Shopify Plus checkout customization issue)
- Triple Pixel checkout tracking may be blocked by browser privacy/ad-blockers at higher rates
- The Triple Pixel integration may have had a partial outage during this window
- **Action:** Investigate Triple Pixel checkout script placement and verify it fires on every checkout initiation

### 2. Added to Cart — Minor Variance (Acceptable)
The -3.8% delta is within normal tolerance. Both sources are tracking Add to Cart consistently.

### 3. Viewed Product — Near-Perfect Parity
Only a 1-event difference across 300 events. Both tracking sources are aligned for product views.

### 4. Placed Order — Baseline Only
199 orders in 30 days. No Triple Pixel equivalent metric exists for comparison. This serves as the revenue baseline.

### 5. Overall Volume Assessment
- **300 Viewed Product** events feeding into **105 Add to Cart** (35% view-to-cart rate) is healthy
- **105 Add to Cart** to **115 Checkout Started** suggests some direct-to-checkout traffic
- **115 Checkout Started** to **199 Placed Order** ratio looks anomalous — orders exceed checkouts, which suggests the Checkout Started metric may be UNDER-counting (possibly a tracking gap, not a data quality issue with orders)

---

## Recommendations

1. **URGENT:** Audit Triple Pixel script placement on checkout pages. The 57.4% drop-off in Checkout Started tracking means Triple Pixel-driven flows that depend on this event (e.g., checkout abandonment) are missing more than half their audience.

2. **Investigate Placed Order > Checkout Started anomaly.** 199 orders vs 115 checkout starts suggests Shopify's own checkout tracking is also incomplete — potentially a Shopify webhook vs browser-side tracking discrepancy.

3. **For flow triggers:** Use Shopify-native Checkout Started (R5w3su) for any abandonment flows, NOT Triple Pixel's version (U67xaR), until the tracking gap is resolved.

4. **Viewed Product and Added to Cart** can safely use either source — both are tracking at parity.

---

## Raw API Responses

```json
// Added to Cart (T8dkjg) — Shopify
{"dates":["2026-01-01T00:00:00+00:00","2026-02-01T00:00:00+00:00"],"data":[{"dimensions":[],"measurements":{"count":[35.0,70.0]}}]}

// Added to Cart - Triple Pixel (YhYkNs)
{"dates":["2026-01-01T00:00:00+00:00","2026-02-01T00:00:00+00:00"],"data":[{"dimensions":[],"measurements":{"count":[38.0,63.0]}}]}

// Checkout Started (R5w3su) — Shopify
{"dates":["2026-01-01T00:00:00+00:00","2026-02-01T00:00:00+00:00"],"data":[{"dimensions":[],"measurements":{"count":[32.0,83.0]}}]}

// Checkout Started - Triple Pixel (U67xaR)
{"dates":["2026-01-01T00:00:00+00:00","2026-02-01T00:00:00+00:00"],"data":[{"dimensions":[],"measurements":{"count":[21.0,28.0]}}]}

// Viewed Product (UzJy84) — Shopify
{"dates":["2026-01-01T00:00:00+00:00","2026-02-01T00:00:00+00:00"],"data":[{"dimensions":[],"measurements":{"count":[118.0,182.0]}}]}

// Viewed Product - Triple Pixel (ShFDEn)
{"dates":["2026-01-01T00:00:00+00:00","2026-02-01T00:00:00+00:00"],"data":[{"dimensions":[],"measurements":{"count":[119.0,180.0]}}]}

// Placed Order (VUpTGG) — Shopify
{"dates":["2026-01-01T00:00:00+00:00","2026-02-01T00:00:00+00:00"],"data":[{"dimensions":[],"measurements":{"count":[73.0,126.0]}}]}
```
