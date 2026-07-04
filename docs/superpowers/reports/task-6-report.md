# Task 6 — MacroDashboard.tsx

## What was done
Created `/home/ubuntu/projects/aegis-terminal/frontend/src/modules/macro/MacroDashboard.tsx` — full `/macro` detail page.

## Structure
- **Header**: "Fundamental Analysis" breadcrumb, "Macro Dashboard" title, Refresh button, live indicator
- **Left sidebar**: Category tabs (All, Inflation, Employment, Rates, Commodities, Equity) + clickable indicator list filtered by category
- **Current value card**: Latest value, unit, change% badge with trend icon, time range selector (3m/6m/1y/2y/5y)
- **Chart area**: lightweight-charts LineSeries (v5 API), dark theme, 360px height, auto-resize via ResizeObserver
- **History table**: Date, Value, Previous, Change%, Trend arrow columns with hover highlight

## API endpoints used
- `GET /api/macro/config` → indicator list with categories
- `GET /api/macro/sparkline?indicator=X&range=1y` → chart series data
- `GET /api/macro/history?indicator=X&limit=50` → historical records

## Key details
- URL search params: `?indicator=VIX` for deep linking
- `@tanstack/react-query` for data fetching (staleTime: 300-600s)
- lightweight-charts v5 API (`createChart`, `LineSeries` via `addSeries`)
- Matches existing Aegis dark theme: `#12121a` bg, `#1e1e2e` borders, `#f59e0b` accent
- Inline React styles throughout (matches project convention)
- TypeScript compilation: **zero errors**
