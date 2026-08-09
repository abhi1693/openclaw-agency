# CANONICAL — COFIATRADING World Control (source de vérité unique)

> Tout travail sur le World Control se fait **UNIQUEMENT ICI**. Les autres dossiers sont des doublons.

## ✅ CANONIQUE (travailler ici seulement)

- **App** : `~/.openclaw/mission-control-frontend-restored/frontend` (Next.js 16, prod via `npm run start`, dev via `npm run dev`)
- **Route** : `/cofiatrading-world-control`
- **Fichier principal** : `frontend/src/components/cofiatrading-world-control/WorldControl.tsx`
- **Scène carte** : `frontend/src/components/cofiatrading-world-control/WorldMapLiving.tsx` (SVG iso LIVE)
- **Routes data (lecture seule)** : `frontend/src/app/api/cofiatrading-world-control/{snapshot,calendar,linear,notion,obsidian,angel-roster,world-state,green-action-log}/route.ts`
- **Pack visuel de référence** : `frontend/public/cofiatrading/exact-image-pack-v2/` (image cible + 84 assets + manifest)

## 🚫 DOUBLONS — NE PAS éditer (déjà archivés ou à ignorer)

| Chemin | Statut |
|---|---|
| `~/cof-trading/apps/mission-control` | Vite legacy — "diamond source read-only" — RÉFÉRENCE, ne pas étendre |
| `~/cof-trading/cofiatrading-site/apps/cofia-mission-control` | doublon — ignorer |
| `~/.cof-archive/DUPLICATE-openclaw-mission-control-*` | déjà archivé |
| `~/.cof-archive/mission-control-safe-cockpit-*` | déjà archivé |
| `~/.cof-archive/t6b-preserve-mission-control-living-city-*` | déjà archivé |
| `~/.openclaw/state/{custom-mission-control,openclaw-mission-control-adoption,mission-control}` | state — NE PAS déplacer (services), ignorer pour le dev UI |
| `~/.openclaw/automation/mission-control` | automation — NE PAS déplacer (services), ignorer pour le dev UI |
| `~/Obsidian/COF_TRADING/01_DASHBOARD/mission-control` | notes Obsidian, pas du code |

Note : les dirs `state/` + `automation/` ne sont PAS déplacés physiquement (risque de casser des services/LaunchAgents). Ils sont documentés ici comme hors-périmètre dev UI.

## 🔒 HARD LOCKS (règles non négociables apprises cette session)

1. **PAS de poster / image fixe** comme scène. La data change en permanence → la scène doit être LIVE-rendue et refléter le statut/agents/KPI/flux en temps réel. L'image `00_full_reference` = RÉFÉRENCE visuelle seulement, jamais le rendu final.
2. **Tout vit DANS la ville** : maisons fixes, mais agents/anges, flux, boutiques, statuts = vivants et visibles dans la map (pas seulement dans les drawers).
3. **Une seule couche** : pas de titres empilés, pas de villes en double, pas de sections qui scrollent en premier écran. Premier écran = la ville. Clic → drawer.
4. **Attribution canonique** : bon agent → bon bâtiment (via `agentsCanon` config + `ANGEL_HOME_BY_ID`).
5. **Réel uniquement, zéro invention, zéro fake green.** Source down = afficher "source down", jamais inventer.
6. **Vérifier le CONTENU rendu (screenshot navigateur), pas seulement HTTP 200.** 200 ≠ rendu (un crash client renvoie quand même 200).
7. **Process propre** : UN seul serveur sur :3000. Tuer le listener via `lsof -ti:3000 -sTCP:LISTEN` (PAS `lsof -ti:3000` qui inclut les clients). Pas de restarts multiples qui collisionnent (EADDRINUSE).
