
# COFIATRADING Exact Image Asset Pack V2

Ce pack part de l'image exacte générée:
`00_full_reference/cofiatrading_world_control_exact_generated_image.png`

Important:
Ce ne sont pas des calques natifs PSD/Figma. L'image originale est un raster PNG.
Les assets fournis sont donc des crops exacts, extraits de la même image, avec coordonnées.

## Contenu

- Full image exacte.
- Sections de layout.
- 15 bâtiments / maisons.
- Agents visibles et barre agents.
- Camions, routes, flux actifs.
- KPIs, inspector, panels.
- Bottom panels: missions, calendrier, activité, mini-map.
- Sidebar navigation.
- Contact sheet.
- Manifest JSON/CSV avec coordonnées xyxy.

## Destination d'intégration

`~/.openclaw/mission-control-frontend-restored/frontend/src/components/cofiatrading-world-control/WorldControl.tsx`

## Règle pour Claude/Codex

Ne pas recréer une ville moche.
Utiliser cette image comme référence stricte.
Utiliser les crops comme base visuelle ou placeholders.
Chaque asset doit avoir une interaction utile:
- building click -> Department Inspector
- agent click -> Agent Work Card
- truck click -> Truck Mission Card
- route click -> Flow Inspector
- KPI click -> Source Truth
- task click -> Mission Detail

## Données à binder

MRR: 879 EUR
ARR: 10548 EUR
VIP: 7
ACTIFS: 94
CAPTIONS: 51
SERVICES: 5/8
MAISONS: 15

## Coordonnées

Toutes les coordonnées sont dans:
`09_docs_for_claude/assets_manifest.json`

Image source size:
1536x1024
