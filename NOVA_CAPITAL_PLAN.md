# Nova Capital Adoption Plan — Aegis Terminal

## Goal
Adopt Nova Capital's content-delivery pattern into Aegis Terminal: marketing landing page + dedicated research content pages. No auth yet.

## Phase 1: Landing Page Redesign
**File:** `frontend/src/modules/landing/Landing.tsx`
- [ ] Ticker bar at top (reuse existing TickerBar component)
- [ ] Hero: headline + subheadline + badge "Early Access · Institutional Grade"
- [ ] Stats row: 6+ Modules, 3 Sessions, 8+ Pairs, Live Data
- [ ] Features grid (6 cards): Session Reports, Economic Calendar, SMC Analysis, Market Scanner, Macro Regime, Trade Suite
- [ ] Sample reports section (3 preview cards with real data snippets)
- [ ] Philosophy/trust section
- [ ] Bottom CTA: "Buka Terminal" → /market
- [ ] Route: `/` becomes landing (move current Home to `/terminal`)

## Phase 2: New Content Pages

### 2a. Central Bank Watch — `/central-bank`
**File:** `frontend/src/modules/analysis/CentralBank.tsx`
- [ ] Upcoming CB meetings calendar (FOMC, BOJ, BOE, RBA, ECB, SNB, BI)
- [ ] Current rate + last decision per bank
- [ ] Yield curve visualization (10Y vs 2Y from FRED)
- [ ] Impact map: which pairs affected by each CB
- [ ] API: `/api/macro` (FRED yields) + `/api/calendar` (CB events)

### 2b. Regime Analysis — `/regime`
**File:** `frontend/src/modules/analysis/Regime.tsx`
- [ ] Current regime badge: Expansion / Inflation / Deflation / Stagflation
- [ ] Key indicators: DXY, 10Y yield, 2Y yield, yield curve spread
- [ ] Regime history (last 4 weeks)
- [ ] Implications per regime (risk-on/off, gold direction, USD strength)
- [ ] API: `/api/macro`

### 2c. Weekly Outlook — `/weekly`
**File:** `frontend/src/modules/analysis/WeeklyOutlook.tsx`
- [ ] Week summary: key events, CB meetings, high-impact data
- [ ] Pair-by-pair bias (bull/bear/neutral) with reasoning
- [ ] Risk map: which days are high-volatility
- [ ] Gold Bias integration
- [ ] API: `/api/calendar` + `/api/session/report`

### 2d. Report Archive — `/archive`
**File:** `frontend/src/modules/analysis/ReportArchive.tsx`
- [ ] List of all generated reports (session + weekly)
- [ ] Filter: by date, session type, pair
- [ ] Expandable preview cards
- [ ] API: new endpoint `/api/reports/archive` (store in D1)

## Phase 3: Routing & Navigation
- [ ] Move Landing to `/`, current Home to `/terminal`
- [ ] Add new routes to App.tsx
- [ ] Add nav items to TopBar.tsx groupNavItems() — new "RESEARCH" group
- [ ] Add nav items to navItems array
- [ ] TickerBar on landing page only (or on all pages — decide)

## Phase 4: Backend Additions
- [ ] `/api/reports/archive` — D1 table for storing published reports
- [ ] Weekly outlook generator (extend session report to weekly scope)

## Files to Touch
- `frontend/src/modules/landing/Landing.tsx` — full rewrite
- `frontend/src/modules/analysis/CentralBank.tsx` — new
- `frontend/src/modules/analysis/Regime.tsx` — new
- `frontend/src/modules/analysis/WeeklyOutlook.tsx` — new
- `frontend/src/modules/analysis/ReportArchive.tsx` — new
- `frontend/src/App.tsx` — new routes + navItems
- `frontend/src/components/TopBar.tsx` — new nav group
- `frontend/src/index.css` — landing page styles

## Design Tokens (existing)
- Dark theme: `--kt-bg`, `--kt-bg2`, `--kt-bg3`
- Gold accent: `--kt-gold`
- Text: `--kt-text`, `--kt-text2`, `--kt-muted`
- Semantic: `--kt-up` (green), `--kt-dn` (red)
- Font: Geist + Geist Mono
