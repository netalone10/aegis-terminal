# Task 5: MacroWidget.tsx — Dashboard Sparkline Cards

## Status: ✅ Complete

## What was done

### Created: `src/modules/macro/MacroWidget.tsx`

Dashboard widget showing top 6 macro indicators as a 2×3 sparkline grid.

**Features:**
- Fetches `/api/macro/latest` via `@tanstack/react-query` (5min refetch)
- Renders top 6 indicators in a 3-column grid
- Each card: label, current value (with unit), change %, MiniSparkline placeholder
- Cards are clickable → navigate to `/macro?indicator=X`
- "View All →" link → navigate to `/macro`
- Hover state: background shifts from `#12121a` to `#18182a`
- Change color: green `#22c55e` (up), red `#ef4444` (down), gray `#64748b` (flat)
- Returns `null` if no data (graceful empty state)

**UI styling:** All inline, matching Aegis dark theme:
- Card bg: `#12121a`, border: `1px solid #1e1e2e`, radius: 10
- Primary text: `#e2e8f0`, secondary: `#64748b`, accent: `#f59e0b`

### Modified: `src/lib/api.ts`

Added `'/api/macro'` to `VPS_PREFIXES` array so macro API routes to `engine.aegisterminal.app` (VPS) instead of CF Workers.

## Files

| File | Action |
|------|--------|
| `src/modules/macro/MacroWidget.tsx` | Created |
| `src/lib/api.ts` | Modified (added `/api/macro` prefix) |

## TypeScript verification

`npx tsc --noEmit` — **0 errors** (including macro files)

## Notes

- Sparkline renders empty placeholder for now (`series={[]}`) — MacroSparkline handles this with a gray box. Real series data enhancement planned for future task.
- Component depends on `MacroSparkline` at `./MacroSparkline` (already exists).
