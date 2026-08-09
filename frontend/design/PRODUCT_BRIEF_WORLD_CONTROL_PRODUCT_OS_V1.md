# PRODUCT BRIEF — Reset Produit « World Control »
## Quant R&D OS + Personal Trading OS
**Document de référence : Head of Product · 2026-05-29 · FR**
**Statut : CONTRAT DE CONCEPTION (maquette jugeable objectivement)**
**source_tag : `PRODUCT_BRIEF_WORLD_CONTROL_PRODUCT_OS_V1_20260529`**
**remplace :** `DESIGN_BRIEF_QUANT_RD_PERSONAL_TRADING_V3.md` (⛔ V3 REJECTED VISUAL)
**handoff parent :** `HANDOFF_WORLD_CONTROL_PRODUCT_RESET_20260529T210501Z.md`

---

## ⛔ CONTRAINTES DURES (rappel en tête de contrat — non négociables)

Ces règles encadrent **toute** la production de la maquette. Une maquette qui en viole une seule est REJETÉE d'office.

| # | Contrainte | Implication concrète |
|---|---|---|
| C-1 | **Rien de live** | Aucune donnée temps réel, aucun tick streaming réel. Tout est figé / rejoué depuis fixtures. |
| C-2 | **Pas de patch hub** | On ne touche PAS au Hub `:8430`, server.py, ni à aucun fichier runtime canon. |
| C-3 | **Pas de :3000 ni :8767** | La maquette ne s'attache à aucun port runtime (`:3000` front, `:8767` registry). Standalone uniquement. |
| C-4 | **Pas d'intégration canon** | Zéro câblage dans `WorldMapLiving.tsx`, houses registry, manifest. La maquette vit isolée. |
| C-5 | **Tout mock / read-only / dry-run** | Toute action (ordre, copy, run WF, exec) est simulée. Aucune écriture, aucun effet de bord. |
| C-6 | **Pas d'auto-exec** | Aucun bouton ne déclenche d'exécution réelle. « Submit / Run / Copy » = dry-run visuel uniquement. |
| C-7 | **Pas de contournement Apex** | Les règles de funded account (Apex) sont affichées comme garde-fous PASSIFS, jamais bypassées ni désactivables. |
| C-8 | **Séparation stricte stratégie ↔ UI** | La logique d'edge (params, signaux, code stratégie) n'est JAMAIS exposée dans l'UI. L'UI consomme des résultats agrégés. |
| C-9 | **Pipeline figé** | `design → maquette → screenshots → validation Erwin → intégration canon`. L'intégration n'arrive QU'APRÈS GO explicite. |

> Verdict comité d'investissement sur lequel ce reset est construit : **STRAT-17 = RESEARCH ONLY · STRAT-18 = RESEARCH ONLY · Portfolio = RESEARCH ONLY · VIP signaux = PAPER APPROVE (zéro %/$) · Copy = REJECT · Auto-exec = REJECT.** La maquette doit **incarner ce verdict**, pas le contredire.

---

## 1. Que doit faire Quant R&D OS ?

**Quant R&D OS = banc d'essai institutionnel de recherche stratégique, read-only.** C'est le laboratoire où l'on juge si une stratégie mérite d'exister — pas où on la trade.

Fonctions cœur :
- **Cataloguer** les stratégies en R&D (STRAT-17 AOKIJI, STRAT-18 KAIDO, portfolio combiné) avec leur statut honnête (`RESEARCH ONLY`).
- **Présenter la performance backtest** (equity, drawdown, distribution, monthly) à taille lisible et plein écran.
- **Rejouer chaque trade** (replay chronologique candle-by-candle) pour audit visuel des entrées/sorties.
- **Comparer variantes** (param sweep) et **afficher les variantes REJETÉES** avec la raison de rejet (DD aggravé, INSUFFICIENT_N).
- **Exposer le verdict red-team** : fat-tail, NQ/MNQ mismatch, OOS paper négatif, scorecard robustesse.
- **Tracker le paper-forward** : comparer backtest attendu vs réalité OOS paper (qui est PERDANTE sur les deux stratégies).
- **Produire un rapport VIP-safe** exportable sans exposer l'IP (aucun param, aucun edge).

**Posture produit : honnête par design.** Le produit ne vend pas du rêve — il affiche en gros que le backtest est sur NQ plein ($20/pt) alors que le live est MNQ micro ($2/pt), que le PnL s'effondre sans le top 10% des trades, et que le paper live est négatif. C'est un OS qui aide à **dire non**.

---

## 2. Que doit faire Personal Trading OS ?

**Personal Trading OS = cockpit de pilotage multi-comptes du trading personnel/funded, read-only & dry-run.** C'est là qu'Erwin voit l'état de ses comptes, son risque, ses positions, sa conformité — sans jamais qu'un clic n'exécute quoi que ce soit de réel.

Fonctions cœur :
- **Agréger tous les comptes** (funded Apex, brokers, MT4/MT5, FXcess) : equity totale, equity par compte, drawdown, daily PnL.
- **Cockpit de risque** : exposition brute/nette, marge, VaR, perte jour vs limite, corrélation positions.
- **Blotter positions ouvertes** + **journal d'exécutions** (historique, slippage, latence).
- **Ordres en DRY-RUN** : on peut composer un ordre, voir son impact simulé, mais **rien n'est envoyé** (C-5/C-6).
- **Statut funded** : Apex rules, Rithmic/ATAS connexion, état des garde-fous (affichés, jamais contournés — C-7).
- **Copy-trading** : visualiser master → followers, mais l'état canon = **Copy BLOCKED** (verdict comité) tant que le paper live n'est pas positif sur 100+ trades.
- **Compliance** : règles de risque (max DD jour, perte hebdo, leverage, news window) avec statut PASS/WARN/FAIL + journal d'audit immuable.
- **Daily report** : revue quotidienne (PnL jour, trades, equity intraday, notes/journal).

**Posture produit : garde-fou avant performance.** L'OS personnel privilégie la conformité et le risque sur la promesse de gain. Copy et auto-exec sont visibles mais verrouillés, avec la raison du verrouillage affichée.

---

## 3. Quels utilisateurs ? (personas)

| Persona | Rôle | Besoin clé | OS principal |
|---|---|---|---|
| **Erwin (Owner / CEO-Trader)** | Décide ce qu'on trade, voit ses comptes funded | Vérité brute en 5 sec : « est-ce que ça marche, où est mon risque » | Les deux |
| **Quant / Researcher** | Conçoit & juge les stratégies | Comparer variantes, lire equity/DD/replay, voir red-team verdict | Quant R&D OS |
| **Risk / Comité d'investissement** | Valide ou rejette une stratégie pour passage live | Scorecard robustesse, fat-tail, OOS paper, NQ/MNQ mismatch | Quant R&D OS |
| **Trader / Opérateur funded** | Suit comptes Apex, positions, conformité | Blotter live, risk gauges, Apex status, compliance PASS/FAIL | Personal Trading OS |
| **VIP / Investisseur externe** | Reçoit un rapport propre | Rapport VIP-safe (perf agrégée, zéro IP, zéro $ trompeur) | Quant R&D OS (export) |

---

## 4. Quels workflows ? (parcours bout-en-bout)

**W1 — Juger une stratégie (Quant R&D OS)**
`World Control map → clic bâtiment Quant R&D → /rd/overview (leaderboard) → clic STRAT-17 → /rd/strat-17 (equity + DD + stats) → onglet Trades → /rd/replay (rejoue un trade litigieux) → /rd/red-team (fat-tail + NQ/MNQ + scorecard 3.5/10) → /rd/paper-forward (OOS paper PERDANT) → verdict : RESEARCH ONLY.`

**W2 — Explorer les variantes (Quant R&D OS)**
`/rd/overview → /rd/variants (leaderboard sweep) → filtre familles → voir variantes REJETÉES (A_vol_z20_lt2 DD −42.4%, C_strong_delta_only DD −70%) → /rd/walk-forward (IS vs OOS dégradation) → conclusion robustesse.`

**W3 — Exporter un rapport propre (Quant R&D OS)**
`/rd/overview → /rd/vip-safe-report → sélection période → rendu rapport (equity vs benchmark + monthly heatmap + risque) → Export PDF (dry-run) → zéro param/edge exposé.`

**W4 — Revue de comptes (Personal Trading OS)**
`World Control map → clic bâtiment Personal Trading → /accounts/overview (KPI + equity agrégée + calendrier PnL) → clic compte funded Apex → /accounts/:id → onglet Trades + Calendrier → /daily-report.`

**W5 — Contrôle du risque & conformité (Personal Trading OS)**
`/risk (gauges exposition/marge/VaR) → si WARN/BREACH → /compliance (règles PASS/FAIL + journal audit) → /positions (blotter) → vérif Apex status (garde-fous PASSIFS, non contournables).`

**W6 — Ordre & copy en dry-run (Personal Trading OS)**
`/positions → composer ordre → preview impact simulé → « Submit » = DRY-RUN (rien envoyé) ; /copy → master → followers → état « Copy BLOCKED » + raison (paper live négatif) affichée.`

---

## 5. Quelles données réelles ? (avec sources / paths)

Toutes les valeurs ci-dessous sont **RÉELLES (rapport)** et doivent être affichées telles quelles dans la maquette (fixtures figées extraites de ces fichiers, **lecture seule, jamais re-câblés en live**).

**STRAT-17 (AOKIJI)** — mean-reversion NQ, $20/pt backtest / MNQ $2/pt live :
- Baseline : n=**215**, PnL **$1 012 240**, PF **11.43**, maxDD **$5 728**, WR **40.0%**, Sharpe **5.58**, période **2025-04-01 → 2026-04-01**.
- vNext (TP1@1.5R) : n=200, PnL **$1 204 472**, PF **16.57**, maxDD **$4 501**, WR 45.5%, sanity 5/5.
- Paper live (OOS réel) : **33 trades, WR 30.3%, sum R −0.44 (PERDANT)**.

**STRAT-18 (KAIDO)** — momentum/breakout NQ / MNQ live :
- Baseline STACK 4-filtres : n=**118**, PnL **$439 891**, PF **14.92**, maxDD **$3 864**, WR **67.8%**, avgR **1.342**.
- Raw (sans filtres) : n=175, PF 6.78, maxDD $10 116, PnL $419 668.
- vNext (exit ladder 0.7/2/4R) : n=118, PnL ~**$461k** (+4.9%), PF **16.92**, DD inchangé $3 864.
- Paper live (OOS réel) : **10 trades, WR 30%, sum R −5.06 (NETTEMENT PERDANT)**.

**Variants REJETÉS (top 5, pages /rd/variants + /rd/red-team)** :
| Famille | Nom | Reject reason | DD red % | PnL keep % |
|---|---|---|---|---|
| A_micro (S17) | `A_vol_z20_lt2` | DD aggravé | −42.4% | 93.5% |
| B_reclaim (S17) | `B_reclaim_strength_ge0.3` | DD aggravé | −56.6% | 65.2% |
| A_micro (S17) | `A_cvd_exhaustion` | INSUFFICIENT_N (n=22) + DD | −45.6% | 14.1% |
| A_cvd (S18) | `A_cvd_slope_aligned` | DD aggravé | −66% | 87% |
| C (S18) | `C_strong_delta_only` | DD aggravé | −70% | 92% |

Compléments rejetés S18 : `A_breakout_strength_ge_2.0` (INSUFFICIENT_N n=19), `F_kaido_score_ge_5` (DD −55%), `D_tp_wide_2_4_6` (DD −57%).

**Red-team institutionnel (verdicts à afficher en clair)** :
- **NQ/MNQ mismatch** : backtest NQ $20/pt vs live MNQ $2/pt → tous les $ sont **~10× trop gros**.
- **Fat-tail** : retirer top 10% gagnants → S17 ne garde que **15.9%** de son PnL (PF 11.4→2.66), S18 seulement **1.7%** (PF 6.78→1.10 = edge nul).
- **OOS paper négatif** : S17 sum R −0.44 (WR 30.3%), S18 sum R −5.06 (WR 30% vs 68% backtest).
- **Copy = REJECT**, **Auto-exec = REJECT** (faux-vert `auto_exec_enabled:true` masqué par 4 gardes, exec OFF, zéro track record).
- **Scorecard OVERALL** : S17 **3.5/10**, S18 **2.8/10**, Portfolio **3.5/10**.

**Portfolio copy** :
- Combined baseline : n=333, R total **3321.14**, R/mo 277.65, PF 14.05, WR 50%, maxDD_R 12.28, copy-score 85.0.
- Combined vNext : n=318, R total 3758.66, R/mo 315.09, PF 18.04, WR 54%, copy-score 85.0.
- Copy conservateur (MODÈLE $50/1R) : n=100, R/mo 35.57, WR 59%, $1 779/mo (modèle), $maxDD $386, copy-score 88.8.
- Perso agressif (MODÈLE) : n=291, R/mo 299.82, WR 54%, $14 991/mo (modèle), $maxDD $807, copy-score 77.9.
- STRAT-17 ≈ **70%** du PnL combiné ; corrélation S17/S18 daily-R = **−0.04**.
- **Drapeau honnêteté** : std R >> avg R (fat-tail) ; les $ sont un MODÈLE $50/1R, **PAS un % live**.

**Equity curve combinée (cumul R mensuel, baseline)** — R mensuels RÉELS, cumul DÉRIVÉ :
`606.63 / 1080.75 / 1175.26 / 1177.32 / 1426.27 / 1729.00 / 2039.81 / 2324.68 / 2416.66 / 2838.52 / 2894.40 / 3321.14` (avr 2025 → mar 2026).

**Drawdown (STRAT-17 baseline, NQ plein)** — bornes Monte-Carlo RÉELLES : backtest **$5 728** · P50 **$8 204** · P95 **$12 707** · P99 **$15 602** · max **$22 635** · P(DD≥$5K)=99.4%. Conversion MNQ ≈ ÷10 (P95 ≈ $1 271).

**Fichiers sources (absolus, read-only) :**
- `/Users/burakokyay/.openclaw/workspace-quant/databento_alpha_research/reports/PERF_LAB_STRAT17_20260529T155028Z.md`
- `/Users/burakokyay/.openclaw/workspace-quant/databento_alpha_research/reports/PERF_LAB_STRAT18_20260529T155042Z.md`
- `/Users/burakokyay/.openclaw/workspace-quant/databento_alpha_research/reports/AUDIT_FULL_STRAT17_18_20260529T153500Z.md`
- `/Users/burakokyay/.openclaw/workspace-quant/databento_alpha_research/reports/INSTITUTIONAL_REDTEAM_STRAT17_18_20260529T171034Z.md`
- `/Users/burakokyay/.openclaw/workspace-quant/databento_alpha_research/reports/PERFORMANCE_SPRINT_STRAT17_18_20260529T161500Z.md`
- `/Users/burakokyay/.openclaw/workspace-quant/databento_alpha_research/reports/PERF_PORTFOLIO_COPY_20260529T160307Z.md`

---

## 6. Quelles données mock ?

Tout ce qui n'a PAS de source rapport ci-dessus est **MOCK réaliste silencieux** (pas de badge criard — anti-pattern AP-11). Le mock doit être plausible et cohérent avec les chiffres réels.

| Domaine | Donnée mock | Règle de cohérence |
|---|---|---|
| Candles replay | Séries OHLC 1m NQ/MNQ autour des dates de trade | Générées plausibles, cohérentes avec entry/exit/R réels du trade rejoué |
| Cumul R mensuel | Le **cumul** des R (la série mensuelle R est RÉELLE) | Cumul DÉRIVÉ, final = 3321.14 (vérifié) |
| Drawdown intermédiaire | P25 ~$6 900, P75 ~$10 400, équiv MNQ | DÉRIVÉ entre bornes MC RÉELLES |
| Personal — comptes | Liste comptes funded/brokers, equity, marge, n° | MOCK ; libellés brokers réalistes (Apex, FXcess, MT4/MT5) |
| Personal — positions ouvertes | Blotter instruments, size, PnL non réalisé | MOCK plausible, cohérent avec instruments NQ/MNQ |
| Personal — exécutions | Historique fills, slippage bps, latence ms | MOCK, ordres de grandeur réalistes |
| Personal — daily PnL calendrier | Grille mensuelle colorée | MOCK, somme cohérente avec equity mock |
| Copy followers | Liste followers, latence, ratio copie | MOCK ; **état global = Copy BLOCKED (RÉEL verdict)** |
| Compliance journal | Events horodatés, breaches | MOCK plausible, immuable visuellement |
| Apex / Rithmic / ATAS status | Pills connexion | MOCK « connecté/déconnecté » — jamais d'action réelle |

**Règle d'or mock (C-8) :** le mock comble le décor, **jamais** la logique d'edge. Aucun paramètre de stratégie, aucun signal, aucun code n'apparaît, réel ou mock.

---

## 7. Quelles pages ? (routes + objectif)

### QUANT R&D OS — `/rd/*`
| Route | Objectif |
|---|---|
| `/rd/overview` | Cockpit portefeuille de stratégies : 5 KPI, equity agrégé multi-strat, leaderboard, cards par strat |
| `/rd/strat-17` | Fiche AOKIJI : equity vs benchmark + drawdown synchronisé + 12-16 stats + onglets Trades/Distribution/Monthly/Logs |
| `/rd/strat-18` | Fiche KAIDO : idem gabarit fiche stratégie |
| `/rd/replay` | Replay chronologique trade-par-trade : candlestick plein canvas + transport scrubber + timeline trades |
| `/rd/variants` | Leaderboard param sweep + variantes REJETÉES + scatter Sharpe/MaxDD |
| `/rd/walk-forward` | Stepper IS→WF→OOS→Validé + timeline folds + dégradation IS vs OOS |
| `/rd/red-team` | Scorecard robustesse + panels stress (fat-tail, MC fan chart, regime, slippage) + verdict |
| `/rd/paper-forward` | Equity réalisé (paper) vs attendu (backtest) + tracking error + OOS PERDANT visible |
| `/rd/vip-safe-report` | Rapport propre exportable, agrégé, zéro IP, zéro param |

### PERSONAL TRADING OS — `/accounts/*` + `/risk` etc.
| Route | Objectif |
|---|---|
| `/accounts/overview` | Tous comptes : 5 KPI, equity agrégée, calendrier PnL, table comptes |
| `/accounts/:id` | Fiche compte : equity + drawdown + onglets Trades/Calendrier/Stats/Positions |
| `/risk` | Cockpit risque : gauges exposition/marge/VaR/perte-vs-limite + table limites + heatmap corrélation |
| `/positions` | Blotter positions ouvertes + résumé exposition + détail position (mini chart SL/TP) |
| `/executions` | Historique exécutions + timeline densité + drawer contexte fill |
| `/copy` | Master vs followers + table réplication + **état Copy BLOCKED** |
| `/compliance` | Cards règles PASS/WARN/FAIL + journal audit immuable + Apex/limites broker |
| `/daily-report` | Revue quotidienne : KPI jour + equity intraday + trades du jour + calendrier + notes |

---

## 8. Quels composants ? (catalogue réutilisable)

Tous partagent rail latéral gauche 56px + top bar 48px (breadcrumb, switcher, range picker global, statut). Conventions transversales : tableaux header sticky lignes 32-36px police ≥13px `tabular-nums`, charts primaires ≥360px haut, stat panels ≥280×96px.

| Composant | Description | Pages |
|---|---|---|
| **CandleChart** | Candlestick OHLC plein canvas, volume sous-panneau, overlays entry/SL/TP, crosshair | /rd/replay, /positions (mini), /executions (drawer) |
| **EntryMarker / SL line / TP1-2-3** | Triangle entry, ligne SL **rouge**, lignes TP1/TP2/TP3 **vertes**, label R atteint | /rd/replay |
| **EquityCurve** | Time-series multi-séries, ligne strat néon + benchmark gris pointillé, fill gradient, légende cliquable | /rd/overview, /rd/strat-*, /rd/paper-forward, /accounts/* |
| **DrawdownCurve** | Area rouge sous zéro, axe temps synchronisé avec l'equity au-dessus | /rd/strat-*, /accounts/:id, /risk |
| **LeaderboardTable** | Table dense triable, sparkline inline 80×24, pills statut, coloration conditionnelle vert→rouge | /rd/overview, /rd/variants |
| **RejectedVariantRow** | Ligne variante REJETÉE : reject reason, DD red %, PnL keep %, badge robustesse | /rd/variants, /rd/red-team |
| **RiskGauge** | Gauge radiale seuils colorés (vert/orange/rouge), valeur centrale ≥18px | /risk |
| **ReplayScrubber** | Barre transport (play/pause/step/vitesse) + timeline large, marqueurs trades, liée au tableau | /rd/replay |
| **EventTimeline** | Timeline événementielle (folds WF, exécutions, signaux) barres + ticks | /rd/walk-forward, /executions, /daily-report |
| **StatCard** | Grand chiffre ≥18px (KPI ≥24-28px), label ≥12px, delta coloré, sparkline fond 60px | partout |
| **MonthlyHeatmap** | Heatmap calendaire PnL/R par mois × année | /rd/strat-*, /rd/vip-safe-report, /accounts/*, /daily-report |
| **DistributionHisto** | Histogramme returns / R-multiples + bar PnL par tag | /rd/strat-*, /daily-report |
| **MonteCarloFan** | Fan chart trajectoires + bandes percentiles P5/P50/P95 (ancré bornes MC réelles) | /rd/red-team |
| **Scorecard** | Gauge radiale score global 0-100 + sous-scores en stat panels | /rd/red-team |
| **Blotter** | Table positions ouvertes auto-refresh (mock), coloration PnL, ligne→détail | /positions |
| **ExecutionTable** | Table fills (timestamp, slippage bps, latence, maker/taker) | /executions, /rd/paper-forward |
| **PnLCalendar** | Grille mensuelle jours colorés intensité PnL, chiffre ≥13px par cellule | /accounts/*, /daily-report |
| **RulePill / ComplianceCard** | Pill PASS/WARN/FAIL, valeur courante vs seuil, mini historique | /compliance, /risk |
| **WarningBanner** | Bandeau d'avertissement honnête (NQ/MNQ mismatch, fat-tail, OOS négatif, Copy BLOCKED) | /rd/*, /copy |
| **CorrelationHeatmap** | Matrice corrélation positions/comptes | /risk |
| **ReportSection** | Section paginée export-friendly (canvas centré 1080px, contrastes renforcés) | /rd/vip-safe-report, /daily-report |

---

## 9. Quelles métriques ? (KPI par OS)

**QUANT R&D OS — bandeau 5 KPI (`/rd/overview`) :** Equity total · PnL MTD · Sharpe agrégé · Max DD courant · # stratégies live (= **0 live**, toutes RESEARCH ONLY).
Fiche stratégie (12-16 stats) : Sharpe, Sortino, CAGR, MaxDD, Calmar, Win%, Profit Factor, Avg W/L, Expectancy, Exposure, Turnover, # trades, **avgR**, **sum R OOS**.
KPI de jugement (honnêteté) : **fat-tail PnL keep %**, **PF sans top 10%**, **OOS paper sum R**, **scorecard /10**, **NQ vs MNQ ($ ÷10)**.

**PERSONAL TRADING OS — bandeau 5 KPI (`/accounts/overview`) :** Equity totale · PnL jour · PnL mois · # comptes · marge utilisée globale.
Risque (`/risk`) : exposition brute, exposition nette, marge utilisée %, VaR jour, perte jour vs limite, corrélation cluster.
Copy (`/copy`) : taux réplication %, latence ms, slippage moyen, écart PnL master/follower — **sous bannière Copy BLOCKED**.
Compliance (`/compliance`) : max DD jour, perte hebdo, leverage max, news window, taille position max → PASS/WARN/FAIL.

---

## 10. Bâtiment vs Inspector vs Fullscreen App (modèle launcher)

C'est **la** correction structurelle du reset. Trois couches strictement séparées :

| Couche | Rôle | Taille | Contenu | Règle |
|---|---|---|---|---|
| **Bâtiment (launcher)** | PORTE D'ENTRÉE sur la carte World Control | Tuile sur la map | Aperçu réel : mini-equity, 1 vraie métrique, libellé produit. **PAS un cube iso recoloré** (anti AP-6) | Le launcher *vend* le produit qu'il ouvre |
| **Inspector (résumé court, OPTIONNEL)** | Survol / clic léger → carte de résumé | Petit panneau (≤320px), **non obligatoire** | 3-4 stats max + bouton « Ouvrir le produit » | **N'est PAS le produit.** Jamais de backtest/replay/risk entassés ici (anti AP-1) |
| **Fullscreen App (LE produit)** | La vraie plateforme métier | **100vw × 100vh** (≥95%) | Quant R&D OS ou Personal Trading OS complet, navigation propre, charts dominants | C'est ici que vit toute la profondeur. La map se retire (anti AP-2) |

**Flux :** `clic bâtiment → (option : inspector résumé 3 stats) → "Ouvrir" → app plein écran`. Dans l'app, la map disparaît ; un bouton **retour vers le launcher** (≥40px, en haut, sans scroll) est toujours visible.

> L'erreur fondatrice de la V3 était de confondre les couches 1 et 3 (faire tenir tout l'OS dans un inspector 392px). Ici : bâtiment = menu léger, inspector = teaser optionnel, fullscreen = produit entier respirant.

---

## 11. Erreurs V2/V3 à ne JAMAIS refaire (12 anti-patterns + contre-règles)

Source rejetée : `world_control_17_buildings_v3_premium_mockup.html` — **REJECTED VISUAL « pas au niveau ».**

| # | Anti-pattern V3 | Contre-règle (obligatoire) |
|---|---|---|
| AP-1 | Tout l'OS fourré dans inspector 392px | Bâtiment = launcher seul ; clic → plateforme plein écran 100vw/100vh |
| AP-2 | Carte iso reste la scène principale | La map est un menu ; une fois dans un produit elle disparaît / breadcrumb |
| AP-3 | Charts riquiqui ~360px confinés | Chart principal ≥60% largeur viewport, ≥50% hauteur |
| AP-4 | Micro-typo 8.5px systémique | **Aucun texte < 12px.** Labels ≥12px, KPI ≥18px, titres ≥14px |
| AP-5 | Onglets fourre-tout qui débordent | Chaque domaine = sa vue plein écran, nav primaire claire sans overflow |
| AP-6 | 17 cubes iso clonés sans identité | Chaque launcher = aperçu réel de données, identité forte |
| AP-7 | KPIs mini-stats décoratives 74px | Métriques dans leur produit, lisibles, avec contexte (sparkline/delta) |
| AP-8 | Grilles compressées gap 8px | Grille 12 colonnes fluide, cards ≥280px, whitespace généreux |
| AP-9 | 6 modules empilés = Grafana cramé | Une vue = un focus, ≤3 modules majeurs simultanés |
| AP-10 | Replay/scrub dans largeur smartphone | Replay = vue plein écran dédiée, chart dominant + scrubber large |
| AP-11 | Banner honesty + badges MOCK criards | Données mock réalistes silencieuses, pas de chrome de brouillon |
| AP-12 | Scroll vertical infini = navigation | Navigation par vues nommées / routes, l'essentiel tient sans scroll |

---

## 12. Critères d'acceptation visuelle (checklist mesurable)

La maquette est **ACCEPTÉE** seulement si **tous** ces points sont vérifiables au DevTools :

| # | Critère | Mesure objective |
|---|---|---|
| AC-1 | Fullscreen, pas colonne | conteneur produit ≥ 95% de `window.innerWidth` |
| AC-2 | Chart dominant | `chart.offsetWidth / innerWidth ≥ 0.6` ET hauteur ≥ 50% viewport |
| AC-3 | Plancher typo 12px | aucun `computed font-size` < 12px nulle part |
| AC-4 | KPI lisibles | `.val` ≥ 18px + label ≥12px + delta/sparkline présent |
| AC-5 | Une vue = un focus | ≤ 3 blocs de premier niveau visibles sans scroll |
| AC-6 | La map se retire | map non visible derrière le produit, ou conteneur ≤ 10% viewport |
| AC-7 | Zéro débordement d'onglets | pas de scrollbar horizontale sur la nav à 1440px |
| AC-8 | Whitespace minimum | padding conteneurs ≥ 24px, gaps grille ≥ 16px |
| AC-9 | Launcher = aperçu | preview de données réelles dans chaque tuile (pas cube) |
| AC-10 | Retour clair | élément retour ≥40px visible au chargement de chaque produit |
| AC-11 | Honnêteté visible | NQ/MNQ mismatch + fat-tail + OOS négatif + Copy BLOCKED affichés en clair |
| AC-12 | Zéro action réelle | tout bouton Submit/Run/Copy = dry-run, aucun appel réseau live |

---

## DESIGN DIRECTION

**Esprit : cohérent World Control (dark navy / glass / neon) mais BEAUCOUP plus dense et pro — niveau Grafana + TradingView + TradeZella, pas maquette de ville.** Cible desktop **1440-1600px**, grille 12 colonnes, gutter 16px, canvas utile 1280-1440px.

**Palette (tokens exacts du composant `WorldMapLiving.tsx`, à réutiliser) :**
- Fonds : scène `#02040a` · centre sol `#0a1326` · panel `rgb(2 6 23 / .85)` (slate-950/85) · inspector `rgb(2 6 23 / .95)` · cards/chips `rgb(15 23 42 / .70)` (slate-900/70).
- Borders : défaut `cyan-300/15` `rgb(103 232 249 / .15)` · forte `/25` · grille iso `#13314d`.
- Textes : primaire `#f1f5f9` · label `#e2e8f0` · secondaire `#cbd5e1` · muted `#94a3b8` · faint `#64748b`.
- **Statuts honest-by-design :** LIVE `#34d399` · EN VEILLE `#64748b` · DEGRADED/REGISTERED `#f59e0b` · SOURCE DOWN / FAIL `#ef4444` · ERR `#fb7185`. PnL+ cyan/green, PnL− red.
- **Accents marque (ajout, PAS d'orange #FF6B35) :** Electric Blue `#0066FF`, Flow Cyan `#00B9FF`. Bleus dominants existants : command `#008cff`, cyans `#00d9ff`/`#22d3ee`. Violet research `#a78bfa`, mint `#34d399`, route VIP `#ffd400`.

**Effets glass/neon (réutiliser tels quels) :**
- Glass conteneur : `backdrop-blur` + `bg-slate-950/85` + border `cyan-300/15`.
- Shadow néon : `shadow-[0_0_40px_-12px_rgba(34,211,238,0.35)]`.
- Pills statut : fond `<hex>22` (~13%), border `<hex>55` (~33%), couleur `<hex>`.
- Halo glow point : `0 0 6px <color>`. Bloom haut + vignette bords pour profondeur.
- Titre dégradé : `from-cyan-300 via-sky-200 to-amber-300` bg-clip-text.

**Typographie :** stack `"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`. **Plancher 12px (AC-3).** KPI 24-28px, valeurs ≥18px, titres section ≥14px, données tabulaires `font-variant-numeric: tabular-nums`. Sur-titres uppercase `tracking-[0.16em]`.

**Hiérarchie visuelle :** un focus par vue, charts pleine zone, tableaux denses ≥20 lignes visibles sans scroll à 1440px, whitespace ≥24px/16px (vs 8-11px V3). Glass subtil, néon comme accent (pas saturation Grafana cramé).

---

## STRUCTURE PRODUIT (fonctions attendues par page)

### QUANT R&D OS

**`/rd/overview`** — 5 StatCard (Equity total, PnL MTD, Sharpe agrégé, MaxDD courant, # strat live=0) ; EquityCurve agrégé multi-strat (S17+S18+benchmark pointillé) ; LeaderboardTable (Strat, statut pill RESEARCH ONLY, Sharpe, CAGR, MaxDD, PnL 30j sparkline) ; cards par strat. WarningBanner global « toutes RESEARCH ONLY ».

**`/rd/strat-17` (AOKIJI)** — Header (nom, tags NQ/MNQ mean-reversion, statut RESEARCH ONLY, boutons Replay/Clone/Run WF en **dry-run**). Colonne stats 320px : Sharpe **5.58**, PF **11.43**, MaxDD **$5 728**, WR **40%**, n=**215**, PnL **$1 012 240**, vNext PF 16.57… **CandleChart grand format TradingView**, EquityCurve vs benchmark (420px) + DrawdownCurve synchronisée (160px). Onglets Trades / Distribution / Monthly / Logs. **WarningBanner fat-tail (garde 15.9% sans top 10%, PF→2.66) + NQ/MNQ mismatch ($ ÷10) + OOS paper PERDANT (sum R −0.44, WR 30.3%) visibles.**

**`/rd/strat-18` (KAIDO)** — Même gabarit. Stats : PF **14.92**, MaxDD **$3 864**, WR **67.8%**, n=**118**, PnL **$439 891**, avgR 1.342, vNext PF 16.92. **WarningBanner fat-tail SÉVÈRE (garde 1.7%, PF 6.78→1.10 edge nul) + OOS paper NETTEMENT PERDANT (sum R −5.06, WR 30% vs 68%).**

**`/rd/replay`** — **CandleChart 1m plein canvas (≥560px)** dominant. EntryMarker triangle, **SL line rouge**, **TP1/TP2/TP3 lignes vertes**, label R atteint. ReplayScrubber large (play/pause, step ±1 bougie, vitesse 1×/2×/4×, timeline marqueurs trades). Panneau bas onglets : Trades du replay / Order log / Equity-at-cursor — ligne du trade courant surlignée au scrub.

**`/rd/variants`** — LeaderboardTable param sweep dominant (Rank, Variant ID, params compacts, Sharpe, CAGR, MaxDD, Calmar, Win%, Trades, stabilité OOS/IS, badge robustesse). RejectedVariantRow en clair : `A_vol_z20_lt2` −42.4%, `B_reclaim` −56.6%, `A_cvd_exhaustion` INSUFFICIENT_N, `A_cvd_slope_aligned` −66%, `C_strong_delta_only` −70%. 3 charts : scatter Sharpe/MaxDD, distrib CAGR, overlay equity top-5.

**`/rd/walk-forward`** — Stepper IS→WF→OOS→Validé ; EventTimeline gantt folds (IS bleu / OOS orange) ; EquityCurve OOS concaténée vs benchmark ; table par fold (Sharpe IS, Sharpe OOS, dégradation %, verdict pill) ; bloc comparatif IS vs OOS miroir.

**`/rd/red-team`** — Scorecard gauge globale + sous-scores ; verdicts S17 **3.5/10**, S18 **2.8/10**, Portfolio **3.5/10**. Panels stress : **MonteCarloFan** (bornes réelles backtest $5 728 / P50 $8 204 / P95 $12 707 / P99 $15 602 / max $22 635), fat-tail (PnL keep %), regime-shift, slippage. Table findings (sévérité, test, seuil, valeur, verdict). **Copy = REJECT, Auto-exec = REJECT affichés.**

**`/rd/paper-forward`** — KPI live paper (figé) ; EquityCurve **réalisé paper vs attendu backtest** + zone tracking error ; ExecutionTable paper. **Comparaison backtest vs OOS paper explicite : S17 33 trades sum R −0.44, S18 10 trades sum R −5.06 — divergence affichée en rouge.**

**`/rd/vip-safe-report`** — ReportSection paginée centrée 1080px : résumé exécutif (StatCards agrégés), EquityCurve vs benchmark propre, MonthlyHeatmap, table risque épurée, DistributionHisto. **Zéro param, zéro edge, zéro $ trompeur.** Export PDF dry-run.

### PERSONAL TRADING OS

**`/accounts/overview`** — 5 StatCard (Equity totale, PnL jour, PnL mois, # comptes, marge globale) ; EquityCurve agrégé tous comptes ; PnLCalendar mensuel ; table comptes (broker, equity, PnL jour/mois, marge %, statut pill) ; cards compte cliquables. **Tous comptes visibles (funded Apex, FXcess, MT4/MT5) — mock.**

**`/accounts/:id`** — Colonne stats compte 320px ; EquityCurve compte + DrawdownCurve synchronisée ; onglets Trades / Calendrier / Stats / Positions ouvertes. **Equity par compte + drawdown + daily PnL.**

**`/risk`** — Pill global OK/WARN/BREACH ; rangée RiskGauge (exposition brute, nette, marge %, VaR jour, perte jour vs limite, corrélation cluster) ; EquityCurve exposition + DrawdownCurve ; table limites (valeur vs limite, util %, statut) ; CorrelationHeatmap. **Apex rules en garde-fous PASSIFS (C-7), non contournables.**

**`/positions`** — Blotter dominant (instrument, compte, side, size, entry, prix actuel, PnL non réalisé coloré, SL, TP, R courant, durée, marge) ; bandeau résumé exposition ; rail droit détail position (mini CandleChart + SL/TP). **Ordres/dry-run : composer un ordre → preview impact simulé → Submit = DRY-RUN, rien envoyé (C-5/C-6).**

**`/executions`** — ExecutionTable dominante (timestamp, compte, instrument, side, qty, prix, fees, slippage bps, latence, maker/taker) ; EventTimeline densité ; drawer contexte fill (mini CandleChart + marqueur). **Rithmic/ATAS / MT4/MT5 comme sources d'exécutions mock.**

**`/copy`** — Statut copy (master, # followers, latence, slippage réplication) ; EquityCurve master vs moyenne followers ; table followers ; table réplication trade master → followers. **État canon = Copy BLOCKED (WarningBanner : paper live négatif, exiger 100+ trades live positifs). FXcess copy visible mais verrouillé.**

**`/compliance`** — Cards règles (max DD jour, perte hebdo, leverage max, news window, taille max) PASS/WARN/FAIL + valeur/seuil + mini historique ; journal d'audit immuable horodaté ; table limites broker + **Apex status**. Export rapport conformité dry-run.

**`/daily-report`** — Canvas centré 1080px daté : StatCards jour (PnL, # trades, Win%, best/worst, R cumulé) ; EquityCurve intraday (marqueurs trades) ; table trades du jour ; PnLCalendar mois ; bloc notes/journal (tags setup/émotion). Export dry-run.

---

## DONNÉES — RÉEL / MOCK / BACKEND-FUTUR

| Donnée | Source réelle | Statut |
|---|---|---|
| STRAT-17 baseline (n, PnL, PF, DD, WR, Sharpe) | `PERF_LAB_STRAT17_*.md` | **RÉEL** |
| STRAT-17 vNext + OOS paper (−0.44) | `PERF_LAB_STRAT17_*.md` / `INSTITUTIONAL_REDTEAM_*.md` | **RÉEL** |
| STRAT-18 baseline STACK + raw + vNext + OOS paper (−5.06) | `PERF_LAB_STRAT18_*.md` | **RÉEL** |
| Variants REJETÉS (top 5 + compléments) | `AUDIT_FULL_*.md` / `INSTITUTIONAL_REDTEAM_*.md` | **RÉEL** |
| Red-team verdicts (fat-tail, NQ/MNQ, OOS, scorecard) | `INSTITUTIONAL_REDTEAM_*.md` | **RÉEL** |
| Portfolio copy (combined, conservateur, agressif) | `PERF_PORTFOLIO_COPY_*.md` | **RÉEL** |
| R mensuels (série) | `PERF_PORTFOLIO_COPY_*.md` | **RÉEL** |
| Cumul R mensuel (somme progressive) | dérivé de la série R RÉELLE | **MOCK (DÉRIVÉ crédible)** |
| Drawdown P25/P75 + équiv MNQ | dérivé entre bornes MC RÉELLES | **MOCK (DÉRIVÉ crédible)** |
| Bornes MC (backtest/P50/P95/P99/max) | `INSTITUTIONAL_REDTEAM_*.md` | **RÉEL** |
| Candles OHLC 1m replay | générées | **MOCK** |
| Comptes (funded Apex, FXcess, MT4/MT5) | — | **MOCK** → BACKEND-FUTUR (broker APIs) |
| Positions ouvertes / blotter | — | **MOCK** → BACKEND-FUTUR (Rithmic/ATAS/MT) |
| Exécutions (slippage, latence) | — | **MOCK** → BACKEND-FUTUR |
| Daily PnL calendrier perso | — | **MOCK** → BACKEND-FUTUR |
| Copy followers / réplication | — | **MOCK** ; état BLOCKED **RÉEL (verdict)** → BACKEND-FUTUR |
| Compliance journal / breaches | — | **MOCK** → BACKEND-FUTUR |
| Apex / Rithmic / ATAS / MT4-5 status | — | **MOCK** → BACKEND-FUTUR (read-only, jamais auto-exec) |
| Risk gauges (expo, VaR, marge) | — | **MOCK** → BACKEND-FUTUR |
| Paper-forward health live | OOS paper chiffres RÉELS, télémétrie live | **MOCK (télémétrie)** + **RÉEL (sum R OOS)** → BACKEND-FUTUR |

---

## LIVRABLES & PHASAGE

| Phase | Livrable | Détail | Gate |
|---|---|---|---|
| **P0 — Brief** | Ce document | Contrat de conception validé (12 questions + design + structure + données + critères) | Lecture Erwin |
| **P1 — Maquette standalone** | Maquette HTML isolée | **Aucun port runtime** (pas :3000/:8767), pas de patch hub, pas de câblage canon. Fixtures figées RÉELLES + mock silencieux. Routes `/rd/*` + `/accounts/*` plein écran. Respecte AC-1→AC-12. | Auto-check DevTools vs checklist AC |
| **P2 — Screenshots** | Captures 1440-1600px par route | 1 screenshot par page clé (overview, strat-17, replay, variants, red-team, accounts/overview, account detail, risk/copy) + preuve mesures AC | — |
| **P3 — Validation Erwin** | GO / NO-GO explicite | Erwin juge sur screenshots + checklist AC objective. NO-GO = retour P1 (max 2 itérations avant pivot direction — §6 HARDLOCK) | **GATE BLOQUANT** |
| **P4 — Intégration canon** | Câblage World Control | **UNIQUEMENT après GO P3.** Branchement launchers sur `WorldMapLiving.tsx`, routes réelles, données via backend-futur. R5 backup avant tout edit. | GO Erwin obligatoire |

**Règles de phasage (rappel) :** P4 ne démarre JAMAIS sans GO P3 explicite (C-9). Tant qu'on est en P1-P3, **zéro touche** au canon (C-2/C-3/C-4). L'intégration respecte §22 (Ferrari immutable), §42 (audit-existing avant invent), §18 (no-push-prod), R5 (backup pré-edit).

**Définition de DONE de la maquette (P1) :** les 12 critères AC vérifiables au DevTools + les 4 messages d'honnêteté affichés (NQ/MNQ mismatch, fat-tail, OOS paper négatif, Copy BLOCKED) + zéro action réelle (tout dry-run) + standalone (aucun port runtime).

---

*Fin du Product Brief. Aucune intégration canon sans GO Erwin explicite (C-9).*
