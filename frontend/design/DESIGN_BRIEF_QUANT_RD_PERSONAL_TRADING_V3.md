# DESIGN BRIEF — Quant R&D Lab + Personal Trading Control (World Control V3)

> **généré:** 2026-05-29 · **source_tag:** `DESIGN_BRIEF_QUANT_RD_PERSONAL_TRADING_V3_20260529`
> **statut:** DESIGN ONLY — aucune intégration canon avant GO Erwin explicite.
> **handoff parent:** `~/.openclaw/workspace-quant/databento_alpha_research/reports/HANDOFF_STRAT17_18_WORLD_CONTROL_20260529T200918Z.md`
> **livrable suivant:** `world_control_17_buildings_v3_premium_mockup.html` (standalone, hors route live)

---

## 0. But du document

Cadrer **avant toute pixel** ce que doivent être les deux nouveaux bâtiments du World Control,
quelles données les alimentent, ce qui est mock vs backend-futur, et comment éviter de refaire
les erreurs de la session précédente (V1 `rnd_accounts`, V2 `17 buildings` — refusées « pas au niveau »).

Ce n'est pas une maquette. C'est le contrat de design qui rend la maquette V3 jugeable objectivement.

---

## 1. Les deux bâtiments — rôle métier

### 1.1 Quant R&D Lab (`quant_rd_lab`)
**Une chose, faite bien : la R&D de stratégies.** Pas du trading, pas des comptes. De la recherche.

| Dimension | Détail |
|---|---|
| Mission | Plateforme R&D pro pour STRAT-17/18 (et futures STRAT-XX) |
| Sections | 1) **Strategy registry** (STRAT-17, STRAT-18, variants) · 2) **Backtest / equity curve** · 3) **Walk-forward** (fenêtres IS/OOS) · 4) **Red-team** (verdicts institutionnels) · 5) **Variants lab** (grille param + score) · 6) **Paper forward** (live OOS observé) |
| District | `research` (accent violet `#a878ff` — proche knowledge mais distinct) |
| Agents rattachés | Quant, Lab, Risk, MiroFish, Marco (**agents existants, cap 38 — zéro nouvel agent**) |
| Statut maquette | `LIVE` (research tourne en read-only) |
| Honnêteté affichée | « research only · pas de vérité live · OOS paper négatif » écrit noir sur blanc |

### 1.2 Personal Trading Control (`personal_trading_control`)
**Une chose, faite bien : la vue comptes/risk personnels.** Distincte de la R&D. Distincte du Command Tower.

| Dimension | Détail |
|---|---|
| Mission | Vue consolidée des comptes perso : ATAS/Rithmic, Apex, MT4/MT5 ; positions ; risk ; (copy = désactivé) |
| Sections | 1) **Accounts** (table multi-broker, equity/marge) · 2) **Open positions** (read-only) · 3) **Risk dashboard** (daily loss, drawdown, exposure vs limite) · 4) **Copy / mirror** (panneau présent mais **OFF / rejeté**) · 5) **Journal** (trades passés en lecture) |
| District | `perso` (accent vert menthe `#6fe39a` — distinct du trading `#00e676` et de la crm) |
| Statut maquette | `DEGRADED` (honnête : live money NON armé — auto-exec Apex BLOCKED, FXcess master 1150061258 mort) |
| Honnêteté affichée | bandeau « Live money non armé · dry-run / lecture seule · copy rejeté » |

### 1.3 Règle d'or de séparation
**R&D ≠ comptes perso.** Deux maisons, deux districts, deux palettes, deux inspecteurs.
Aucune section partagée. Si un doute « ça va où ? » : research → Quant Lab ; argent/compte → Personal Trading Control.

---

## 2. Données réelles vs mock vs backend-futur

Honnêteté = règle n°1 du World Control existant (`houseStatusStyle` est « honest-by-design, jamais de faux-vert »).
La maquette V3 doit **étiqueter chaque donnée** par sa source réelle, même si la valeur affichée est figée.

### 2.1 Quant R&D Lab

| Donnée | Source réelle existante | Statut V3 |
|---|---|---|
| Strategy registry (STRAT-17/18) | `~/Obsidian/.../03_KNOWLEDGE/trading/strategies/STRAT-*.md` + runners `~/.openclaw/workspace-quant/skills/rithmic_bridge/strat*_runner.py` | **mock** (valeurs figées issues des rapports réels) |
| Perf metrics (PF, Sharpe, winrate) | `reports/PERF_LAB_STRAT17*.json` · `PERF_LAB_STRAT18*.json` · `PERFORMANCE_SPRINT_STRAT17_18_*.md` | **mock** (chiffres réels copiés, marqués « candidate research ») |
| Equity / drawdown curve | mêmes JSON perf-lab | **mock** (mini-chart SVG sur série figée crédible) |
| Walk-forward IS/OOS | `AUDIT_FULL_STRAT17_18_*.md` | **mock** |
| Red-team verdict | `INSTITUTIONAL_REDTEAM_STRAT17_18_20260529T171034Z.md` | **mock** (texte verdict réel) |
| Variants grid | non encore produit | **mock** (placeholder honnête « lab à venir ») |
| → Backend futur | endpoint type `/api/cofiatrading-world-control/quant-rd` lisant les JSON perf-lab | **backend plus tard** |

### 2.2 Personal Trading Control

| Donnée | Source réelle existante | Statut V3 |
|---|---|---|
| Comptes (ATAS/Rithmic/Apex/MT4/MT5) | configs brokers locales (non câblées UI) | **mock** |
| Positions ouvertes | aucune source live armée | **mock** (read-only, figé) |
| Risk (daily loss, drawdown, exposure) | règles Apex connues (limites) | **mock** (limites réelles, valeurs sim) |
| Copy / mirror | FXcess master 1150061258 **mort** | **mock OFF** (panneau désactivé + raison) |
| Journal trades | logs runners | **mock** |
| → Backend futur | endpoint `/api/cofiatrading-world-control/personal-trading` agrégeant comptes | **backend plus tard** |

### 2.3 Le reste de la ville (15 maisons)
Dans la **maquette V3** : statuts/KPI figés crédibles (la V3 est standalone, **zéro fetch**).
Dans le **live `:3000`** (plus tard, après GO) : les 15 maisons gardent leurs vrais fetch existants intacts.

---

## 3. Interactions — mock / backend-futur

| Interaction | V3 maquette | Plus tard (après GO) |
|---|---|---|
| Clic bâtiment → inspecteur | **réel** (JS local, pas de réseau) | réel |
| Onglets inspecteur (registry/backtest/walk-fwd/...) | **réel** (switch local) | réel |
| Mini-charts (equity, drawdown, walk-forward bars) | **réel rendu**, données mock | données backend |
| Trade replay (scrub timeline) | **réel rendu**, série mock | série backend |
| Boutons « Run backtest », « Refresh accounts », « Arm copy » | **mock disabled** (badge MOCK, `cursor:not-allowed`) | gated, jamais auto-exec |
| Tout ce qui touche argent réel / exec | **interdit** (jamais armé) | **interdit sans GO + compliance** |

**Aucun bouton de la V3 ne déclenche d'action.** Les boutons existent pour montrer l'intention UX, désactivés, badgés MOCK.

---

## 4. Anti « patch moche » — règles visuelles

Ce qui a fait échouer V2 = « deux cubes + panneau pauvre ». V3 corrige par 6 leviers :

1. **Silhouettes distinctes, pas des cubes clonés.**
   - Quant R&D Lab = tour de recherche **vitrée** : dôme/lanterne sur le toit, façade « écrans » (grille de fenêtres plus dense, accent violet), antenne data.
   - Personal Trading Control = **salle des marchés** : toit-terrasse avec mini-écrans (tickers), parabole/antenne risk, accent vert menthe.
   - Réutiliser `buildZone()` (cohérence) mais **ajouter des superstructures de toit** propres à chaque maison.

2. **Placement réfléchi, zéro collision de route.**
   - Quant R&D Lab près du cluster recherche (Trading Tower / Central Brain / Paperclip), à l'écart des routes vip jaunes.
   - Personal Trading Control près de Command Tower / Compliance / Revenue, mais sur sa propre parcelle.
   - Vérifier le tri painter `(x+y)` pour éviter qu'un grand voisin masque le nouveau bâtiment.

3. **Inspecteur riche, hiérarchisé.** En-tête (icône + nom + sous-titre + pill statut) → bandeau honnêteté → onglets → sections avec mini-charts → boutons mock. Pas de placeholder vide.

4. **Mini-charts crédibles.** Equity curve (ligne + aire), drawdown (aire rouge sous zéro), walk-forward (barres IS vert / OOS ambre), trade replay (timeline scrubbable). SVG natif, animations discrètes.

5. **Cohérence palette stricte.** Fond navy `#02040a`/`#04060d`, lignes `#16203a`, texte `#e6edf7`/`#93a3bd`. Statuts canon : LIVE `#34d399`, DEGRADED `#f59e0b`, SLEEPING `#64748b`, SOURCE_DOWN/ERR `#fb7185`. Accents marque : Electric Blue `#0066FF`, Flow Cyan `#00B9FF`. **Pas d'orange `#FF6B35`** (retiré du brand pack).

6. **Densité maîtrisée.** Riche ≠ chargé. Espacement généreux, sections collapsables si besoin, scroll inspecteur propre.

---

## 5. Cohérence avec World Control actuel

La V3 doit **ressembler à la même ville**, pas à un overlay greffé.

| Élément à conserver identique | Référence `WorldMapLiving.tsx` |
|---|---|
| Projection iso | `ISO_W=30, ISO_H=16`, `isoProject(wx,wy)` |
| Géométrie bâtiment | `buildZone()` : levels (tall=7 / command-content=5 / 4), `h=8+levels*6.5`, fenêtres bilinéaires |
| 15 zones canon | mêmes `x,y,w,h,color,roof,accent,district` (lignes 148-164) |
| Districts + couleurs | `DISTRICT_COLOR` + ajouts `research`/`perso` |
| Routes animées | `ROUTES` + camions + piétons + dash anim |
| Halos district sol | `ellipse` `soft-glow` |
| Crest toit + arêtes néon statut | conserver |
| Inspecteur à onglets | esprit `houseTab` (vue/kpis/anges/machines/flux) étendu |
| Header KPI + légende bas | conserver |

Les 2 nouvelles maisons s'**insèrent dans cette grammaire** : mêmes primitives, superstructures en plus. Un œil extérieur ne doit pas pouvoir dire « lesquelles sont les nouvelles » par un défaut de style — seulement par leur district/accent.

---

## 6. Erreurs de la session précédente — à NE PAS refaire

| # | Erreur passée | Garde-fou V3 |
|---|---|---|
| 1 | Patch de la mauvaise source (`cof-island-v21.html` = hub `:8430`) | V3 = **fichier standalone** dans `frontend/design/`, zéro lien `:8430`, zéro lien `:3000` |
| 2 | Intégration canon trop tôt | V3 = maquette pure. **STOP après screenshots, GO Erwin obligatoire** avant tout patch `WorldMapLiving.tsx` |
| 3 | Maquette « pas au niveau » (cubes + panneau pauvre) | §4 (silhouettes distinctes + inspecteur riche + mini-charts) |
| 4 | Bug statut `state.status` vs `houses[id].status` | **Noté pour la phase backend uniquement** : statut au **niveau racine** de chaque house. **Pas touché en V3.** |
| 5 | Mélange R&D / comptes perso | §1.3 séparation stricte, 2 districts, 2 inspecteurs |
| — | Faux-vert / claim non prouvé | Chaque donnée mock étiquetée « mock » ; statuts honnêtes (Personal = DEGRADED, pas LIVE) |

---

## 7. Contraintes dures (rappel, non négociables)

- Pas de patch hub live · pas de touche `:3000` · pas de touche `:8767` registry.
- Pas de nouveau bâtiment **canonique** (la V3 les montre en maquette, pas dans le manifest).
- Pas d'ATAS custom DLL · pas d'auto-exec · pas de contournement Apex · pas de copy trading · pas de vente de % live.
- Tout en **design / research d'abord**. Aucune action réelle armée.
- STRAT-17/18 = programme d'amélioration **séparé de l'UI** (autre piste, autres fichiers).

---

## 8. Critères d'acceptation de la maquette V3

La V3 est « au niveau » si **tous** ces points sont vrais (checklist de validation Erwin) :

- [ ] Ce n'est pas une map vide — la ville complète (17 bâtiments) est rendue et peuplée.
- [ ] Les 2 nouveaux bâtiments sont **visuellement intégrés** (même grammaire iso) **et distincts** (superstructures + accents).
- [ ] Placement propre, aucune collision de route ni occlusion gênante.
- [ ] Routes lisibles (les nouvelles routes ne croisent pas salement les existantes).
- [ ] Inspecteur **riche** pour chaque nouvelle maison (en-tête + bandeau honnêteté + onglets + sections).
- [ ] **Mini-charts crédibles** : equity curve + drawdown + walk-forward (Quant) ; risk gauges + equity (Personal).
- [ ] **Trade replay crédible** : timeline scrubbable avec marqueurs trades.
- [ ] **Accounts / risk crédibles** : table multi-broker + limites Apex + exposure.
- [ ] Boutons **mock disabled** avec badge MOCK, aucun déclenche d'action.
- [ ] Badge **MOCKUP ONLY** visible en permanence.
- [ ] Palette canon respectée (navy + cyan/blue, statuts, pas d'orange).
- [ ] Honnêteté : Personal = DEGRADED, mentions « research only / live money non armé / copy rejeté ».
- [ ] **Screenshots de validation** produits (vue ville + inspecteur Quant + inspecteur Personal).

---

## 9. Plan d'exécution (après ce brief)

1. Construire `world_control_17_buildings_v3_premium_mockup.html` (standalone) selon §4–§8.
2. Ouvrir + screenshots (Playwright local, headless) : ville globale, inspecteur Quant (chaque onglet), inspecteur Personal.
3. Présenter à Erwin → **attendre validation**.
4. **Seulement si GO** : patch canon `WorldMapLiving.tsx` + manifest (statut niveau racine, fix bug §4 passé).
5. STRAT-17/18 alpha program : piste séparée, ne touche pas l'UI.

---

*Fin du brief. Aucune intégration canon sans GO Erwin explicite.*
