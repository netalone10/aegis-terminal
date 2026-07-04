# Macro Dashboard — Design Spec

**Date**: 2026-07-04
**Status**: Approved
**Inspired by**: [Quant](https://github.com/eisenjimmy/Quant) macro overlays

## Overview

Add a configurable Macro Dashboard to Aegis Terminal showing key economic indicators (CPI, unemployment, VIX, 10Y yield, oil, etc.) with sparkline cards on the Dashboard and a detailed /macro page. Data sourced via Firecrawl scraping, stored in PostgreSQL.

## Goals

- Give traders at-a-glance macro context without leaving the terminal
- Historical sparklines for trend recognition
- Configurable indicator list — add/remove indicators without code changes
- Zero paid API costs (Firecrawl already in use)

## Non-Goals

- Real-time intraday macro feeds (macro data is daily/weekly/monthly)
- Overlay on TradingView charts (standalone dashboard only for now)
- AI narrative for macro data (separate feature)

---

## Data Layer

### Database Tables

```sql
CREATE TABLE macro_indicators (
  id SERIAL PRIMARY KEY,
  indicator VARCHAR(20) UNIQUE NOT NULL,    -- e.g. 'CPI', 'UNRATE', 'VIX'
  label VARCHAR(100) NOT NULL,              -- e.g. 'CPI YoY%'
  category VARCHAR(30) NOT NULL,            -- 'inflation','employment','rates','commodities','equity'
  unit VARCHAR(10) NOT NULL,                -- '%','USD','index','points'
  source VARCHAR(20) NOT NULL,              -- 'fred','yahoo'
  enabled BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE macro_values (
  id SERIAL PRIMARY KEY,
  indicator_id INT REFERENCES macro_indicators(id),
  date DATE NOT NULL,
  value NUMERIC,
  prev_value NUMERIC,
  change_pct NUMERIC,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(indicator_id, date)
);

CREATE INDEX idx_macro_values_indicator_date ON macro_values(indicator_id, date DESC);
```

### Default Indicators

| Indicator | Label | Category | Unit | Source | Yahoo Symbol |
|-----------|-------|----------|------|--------|-------------|
| CPI | CPI YoY% | inflation | % | fred | — |
| UNRATE | Unemployment Rate | employment | % | fred | — |
| FEDFUNDS | Fed Funds Rate | rates | % | fred | — |
| GDP | GDP QoQ% | rates | % | fred | — |
| PMI | ISM Manufacturing PMI | rates | index | fred | — |
| VIX | VIX | equity | index | yahoo | ^VIX |
| DGS10 | 10-Year Treasury Yield | rates | % | fred | — |
| DXY | US Dollar Index | rates | index | yahoo | DX-Y.NYB |
| GOLD | Gold Price | commodities | USD | yahoo | GC=F |
| WTI | WTI Crude Oil | commodities | USD | yahoo | CL=F |
| SPX | S&P 500 | equity | points | yahoo | ^GSPC |

### Configuration

Indicator list stored in `macro_indicators` table. Toggle enabled/disabled via SQL or future admin UI. Adding a new indicator = INSERT into `macro_indicators` + add to scraper config.

---

## Scraper (VPS)

### Source: Firecrawl + Yahoo Finance / FRED

**Source**: Firecrawl scraping of public financial data pages

**Data sources by indicator type**:

| Type | Source URL Pattern | Parse Strategy |
|------|-------------------|----------------|
| Yahoo (^VIX, ^GSPC, DX-Y.NYB, GC=F, CL=F) | `finance.yahoo.com/quote/{symbol}` | Extract price from page |
| FRED (CPI, UNRATE, FEDFUNDS, GDP, PMI, DGS10) | `fred.stlouisfed.org/series/{series_id}` | Extract latest value from data table |

**Fallback**: If Firecrawl fails for an indicator, keep existing DB data. No degradation.

**Script**: `vps-api/scrape-macro.js`

**Process**:
1. Read enabled indicators from DB
2. For each indicator, Firecrawl scrape the data page
3. Parse latest value + historical series
4. UPSERT into `macro_values`
5. Log results

**Schedule**: Every 6 hours via VPS crontab (same pattern as economic calendar scraper)

**Fallback**: If Firecrawl fails, keep existing data (no degradation)

---

## API Endpoints (VPS)

All endpoints on `engine.aegisterminal.app`:

### GET /api/macro/latest

Returns latest value for each enabled indicator.

```json
{
  "status": "ok",
  "data": [
    {
      "indicator": "CPI",
      "label": "CPI YoY%",
      "category": "inflation",
      "unit": "%",
      "value": 3.2,
      "prevValue": 3.4,
      "changePct": -5.9,
      "date": "2026-06-28"
    }
  ]
}
```

### GET /api/macro/sparkline?indicator=CPI&range=1y

Returns time series for sparkline rendering.

Query params:
- `indicator` (required): Indicator key
- `range` (optional): `3m`, `6m`, `1y`, `2y`, `5y` (default: `1y`)

```json
{
  "status": "ok",
  "data": {
    "indicator": "CPI",
    "label": "CPI YoY%",
    "unit": "%",
    "series": [
      { "date": "2025-07-01", "value": 3.0 },
      { "date": "2025-08-01", "value": 2.9 }
    ]
  }
}
```

### GET /api/macro/history?indicator=CPI

Full historical data for /macro detail table.

```json
{
  "status": "ok",
  "data": {
    "indicator": "CPI",
    "label": "CPI YoY%",
    "unit": "%",
    "records": [
      { "date": "2026-06-28", "value": 3.2, "prevValue": 3.4, "changePct": -5.9 }
    ]
  }
}
```

### GET /api/macro/config

Returns enabled indicators list.

```json
{
  "status": "ok",
  "data": [
    { "indicator": "CPI", "label": "CPI YoY%", "category": "inflation", "unit": "%", "enabled": true, "displayOrder": 1 }
  ]
}
```

---

## Frontend

### Dashboard Widget

**Location**: Main Dashboard page, below existing sections
**Layout**: 2x3 grid of sparkline cards (top 6 indicators by displayOrder)

**Each card contains**:
- Indicator label (small, top)
- Current value (large, bold)
- Change % with color (green positive, red negative, gray flat)
- Mini sparkline (last 12 data points, SVG or canvas)
- Click → navigates to `/macro?indicator=CPI`

**Refresh**: 5-minute auto-refresh via React Query

**Styling**: Matches existing Aegis Terminal dark theme (#12121a cards, #1e1e2e borders)

### /macro Detail Page

**Layout**:
- Left sidebar: Category tabs (All, Inflation, Employment, Rates, Commodities, Equity) + indicator list
- Main area: Large sparkline chart for selected indicator
- Below chart: Historical data table

**Sparkline chart**:
- TradingView lightweight-charts (already a dependency in Aegis)
- Time range selector: 3m, 6m, 1y, 2y, 5y
- Crosshair + tooltip showing date + value

**Historical table**:
- Columns: Date, Value, Previous, Change %, Trend (↑↓→)
- Sorted by date descending
- Pagination or virtual scroll for long histories

**Top bar**:
- "Last updated: X hours ago" timestamp
- Refresh button
- Current indicator name + category badge

**Navigation**:
- New sidebar item: "Macro" under ANALYSIS section
- New TopBar item for mobile
- Route: `/macro`

---

## Error Handling

- Scraper failure: Log error, keep existing data, alert via console
- API failure: Frontend shows "Data unavailable" with last-known values
- Empty data: Show placeholder cards with "No data" state
- Rate limiting: Firecrawl handles retries; scraper has 2s delay between requests

## Testing

- Scraper: Run manually, verify DB insert
- API: curl each endpoint, verify response shape
- Frontend: Puppeteer test for page render + zero JS errors
- Data integrity: Verify sparkline has >= 10 data points per indicator

## Deployment

1. Run DB migration (create tables)
2. Deploy scraper to VPS + crontab
3. Build + deploy frontend to CF Pages
4. Verify API endpoints
5. Verify dashboard renders with data
