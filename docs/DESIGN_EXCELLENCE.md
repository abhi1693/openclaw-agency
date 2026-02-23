# Design Excellence Spec — Mission Control V5

## Philosophy
"When someone opens this dashboard, they should think it was built by a well-funded startup's design team."

## Animation Library: Framer Motion
Every state change should be animated. No jarring transitions.

### Micro-interactions
| Element | Animation | Duration |
|---------|-----------|----------|
| KPI numbers | Count up from 0 | 800ms ease-out |
| Charts | Draw-in / trace line | 1200ms |
| Kanban drag | Spring physics | spring(stiffness: 300) |
| Live feed messages | Slide + slight bounce from right | 300ms |
| Agent status dots | Breathing pulse (scale 1→1.3→1) | 2s infinite |
| Goal gauge rings | SVG stroke-dashoffset animate | 1500ms |
| Sidebar agent hover | Glow + expand quick stats | 200ms |
| Page transitions | Fade + slide-up | 200ms |
| Org chart nodes | Staggered float-in | 100ms delay each |
| Org chart lines | SVG path draw | 800ms |
| Brand filter select | Color morph | 150ms |
| Privacy toggle | Gaussian blur transition | 300ms |
| Data loading | Skeleton shimmer | continuous |
| Notifications | Slide from top-right + auto-dismiss | 300ms in, 5s stay |
| Mission timeline bars | Width grows real-time | CSS transition 1s |
| Milestone celebrations | Confetti particle burst | 2s |

### Visual Design
- **Glassmorphism** on hero cards: `backdrop-filter: blur(20px); background: rgba(255,255,255,0.7)`
- **Gradient accents**: Subtle animated gradient on dashboard header
- **Sparklines**: 7-day mini trend charts inline in KPI cards
- **Dark mode**: Full dark theme toggle, persisted in localStorage
- **Agent emotion states**: 😤 error, 😴 idle >1hr, 🔥 3+ tasks completed today, 💤 overnight

### Power User Features
1. **Cmd+K Command Palette** (cmdk) — fuzzy search everything
2. **Keyboard shortcuts**: 1-9 switch tabs, Cmd+B broadcast, N new task, R refresh, P privacy, ? help
3. **Right-click context menus** on agents and tasks
4. **Resizable panels** (drag borders like VS Code)
5. **Toast notification system** with queue

### Sound Design (optional, toggle in settings)
- Click: subtle tap on button press
- Notification: gentle chime on new alerts
- Success: satisfying ding on task completion
- Error: low tone on failures

### Loading States
NEVER show blank white. Always:
1. Skeleton screens with shimmer animation
2. Progressive loading (show what you have, load more)
3. Optimistic updates (show change immediately, sync in background)

### npm packages
```json
{
  "framer-motion": "^11.x",
  "@dnd-kit/core": "^6.x",
  "@dnd-kit/sortable": "^8.x",
  "recharts": "^2.x",
  "cmdk": "^1.x",
  "lucide-react": "^0.x",
  "date-fns": "^3.x",
  "sonner": "^1.x"
}
```
