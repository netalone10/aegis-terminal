# Task 4: MacroSparkline Component

## Status: ✅ Complete

## What was created
- **File**: `src/modules/macro/MacroSparkline.tsx`
- **Component**: `MacroSparkline` — canvas-based sparkline chart

## Implementation details
- Renders HTML5 Canvas sparkline from `{date, value}[]` series data
- DPI-aware (scales with `devicePixelRatio` for retina displays)
- Draws line chart with `round` join for smooth curves
- Fills gradient below the line (`color + '30'` → `color + '05'` alpha stops)
- Props: `series`, `width` (default 120), `height` (default 40), `color` (default `#f59e0b`)
- Graceful fallback: shows dark placeholder div when fewer than 2 data points
- Handles edge case where `range === 0` (flat line) via `|| 1`

## Compilation
- `npx tsc --noEmit --project tsconfig.app.json` — **0 errors**

## Notes
- Created `src/modules/macro/` directory (did not previously exist)
