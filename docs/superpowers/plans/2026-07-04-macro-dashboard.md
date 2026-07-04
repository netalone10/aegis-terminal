# Macro Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable Macro Dashboard to Aegis Terminal with sparkline cards on Dashboard and a detailed /macro page, powered by Firecrawl-scraped data.

**Architecture:** Firecrawl scraper on VPS → PostgreSQL storage → REST API on VPS → React frontend (CF Pages). Reuses existing infra (Firecrawl key, VPS API, CF Pages deploy).

**Tech Stack:** Node.js (VPS scraper + API), PostgreSQL, React, TypeScript, lightweight-charts, Tailwind/CSS (existing), Firecrawl API

## Global Constraints

- VPS: 129.226.151.57, SSH alias `sg2`, PostgreSQL `aegis`/`aegis_terminal_2026`/`aegis_terminal`
- Firecrawl API key: `fc-3673cb1426994104a857455bd3b61a7c`
- Deploy: `wrangler pages deploy dist --project-name=aegis-terminal --branch=main` from `frontend/`
- VPS API base: `https://engine.aegisterminal.app`
- Frontend API helper: `frontend/src/lib/api.ts` routes `/api/macro/*` to VPS
- Style: Dark theme (#12121a cards, #1e1e2e borders, #f59e0b accent)

---

## File Structure

### VPS (scraper + API)
- Create: `vps-api/scrape-macro.js` — Firecrawl scraper for macro indicators
- Modify: `vps-api/server.js` — Add 4 macro API endpoints
- Modify: VPS crontab — Add macro scraper schedule

### Frontend
- Create: `frontend/src/modules/macro/MacroDashboard.tsx` — Full /macro page
- Create: `frontend/src/modules/macro/MacroWidget.tsx` — Dashboard sparkline widget
- Create: `frontend/src/modules/macro/MacroSparkline.tsx` — Reusable sparkline component
- Modify: `frontend/src/App.tsx` — Add /macro route
- Modify: `frontend/src/components/Sidebar.tsx` — Add Macro nav item
- Modify: `frontend/src/components/TopBar.tsx` — Add Macro nav item (mobile)
- Modify: Dashboard page — Add MacroWidget

### Database
- Execute: SQL migration to create macro_indicators + macro_values tables

---

### Task 1: Database Migration

**Files:**
- Execute SQL on VPS PostgreSQL

**Interfaces:**
- Produces: `macro_indicators` table, `macro_values` table, seed data for 11 indicators

- [ ] **Step 1: Create tables**

SSH to VPS and run:

```sql
CREATE TABLE IF NOT EXISTS macro_indicators (
  id SERIAL PRIMARY KEY,
  indicator VARCHAR(20) UNIQUE NOT NULL,
  label VARCHAR(100) NOT NULL,
  category VARCHAR(30) NOT NULL,
  unit VARCHAR(10) NOT NULL,
  source VARCHAR(20) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS macro_values (
  id SERIAL PRIMARY KEY,
  indicator_id INT REFERENCES macro_indicators(id),
  date DATE NOT NULL,
  value NUMERIC,
  prev_value NUMERIC,
  change_pct NUMERIC,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(indicator_id, date)
);

CREATE INDEX IF NOT EXISTS idx_macro_values_indicator_date ON macro_values(indicator_id, date DESC);
```

- [ ] **Step 2: Seed default indicators**

```sql
INSERT INTO macro_indicators (indicator, label, category, unit, source, display_order) VALUES
('CPI', 'CPI YoY%', 'inflation', '%', 'fred', 1),
('UNRATE', 'Unemployment Rate', 'employment', '%', 'fred', 2),
('FEDFUNDS', 'Fed Funds Rate', 'rates', '%', 'fred', 3),
('GDP', 'GDP QoQ%', 'rates', '%', 'fred', 4),
('PMI', 'ISM Manufacturing PMI', 'rates', 'index', 'fred', 5),
('VIX', 'VIX', 'equity', 'index', 'yahoo', 6),
('DGS10', '10Y Treasury Yield', 'rates', '%', 'fred', 7),
('DXY', 'US Dollar Index', 'rates', 'index', 'yahoo', 8),
('GOLD', 'Gold Price', 'commodities', 'USD', 'yahoo', 9),
('WTI', 'WTI Crude Oil', 'commodities', 'USD', 'yahoo', 10),
('SPX', 'S&P 500', 'equity', 'points', 'yahoo', 11)
ON CONFLICT (indicator) DO NOTHING;
```

- [ ] **Step 3: Verify**

```sql
SELECT indicator, label, category, source FROM macro_indicators ORDER BY display_order;
```

Expected: 11 rows.

- [ ] **Step 4: Commit**

No code to commit — DB migration only.

---

### Task 2: Macro Scraper (VPS)

**Files:**
- Create: `vps-api/scrape-macro.js`

**Interfaces:**
- Consumes: `macro_indicators` table (enabled indicators)
- Produces: `macro_values` table (upserted time series)

- [ ] **Step 1: Write scraper skeleton**

Create `vps-api/scrape-macro.js`:

```javascript
#!/usr/bin/env node
const https = require('https');
const { Pool } = require('pg');

const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY || '';
const pool = new Pool({
  host: '127.0.0.1', port: 5432,
  database: 'aegis_terminal', user: 'aegis', password: 'aegis_terminal_2026',
  max: 5,
});

// Yahoo Finance symbols for yahoo-sourced indicators
const YAHOO_SYMBOLS = {
  VIX: '^VIX',
  DXY: 'DX-Y.NYB',
  GOLD: 'GC=F',
  WTI: 'CL=F',
  SPX: '^GSPC',
};

// FRED series IDs for fred-sourced indicators
const FRED_SERIES = {
  CPI: 'CPIAUCSL',
  UNRATE: 'UNRATE',
  FEDFUNDS: 'FEDFUNDS',
  GDP: 'GDP',
  PMI: 'MANEMP',
  DGS10: 'DGS10',
};

async function firecrawlScrape(url) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      url, formats: ['markdown'], waitFor: 5000, onlyMainContent: true,
    });
    const req = https.request({
      hostname: 'api.firecrawl.dev', path: '/v2/scrape', method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.success) reject(new Error(json.error || 'Firecrawl failed'));
          else resolve(json.data.markdown);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function scrapeYahooQuote(symbol) {
  const url = `https://finance.yahoo.com/quote/${symbol}/`;
  const md = await firecrawlScrape(url);
  // Parse price from markdown — look for the main price figure
  const priceMatch = md.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);
  return priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;
}

async function scrapeFRED(seriesId) {
  const url = `https://fred.stlouisfed.org/series/${seriesId}`;
  const md = await firecrawlScrape(url);
  // Parse latest value from FRED page
  const valueMatch = md.match(/Latest:\s*([\d.,]+)/i) || md.match(/(\d+\.\d+)\s*%/);
  return valueMatch ? parseFloat(valueMatch[1].replace(/,/g, '')) : null;
}

async function main() {
  console.log(`[${new Date().toISOString()}] Starting macro scrape...`);
  if (!FIRECRAWL_KEY) { console.error('No FIRECRAWL_API_KEY'); process.exit(1); }

  const { rows: indicators } = await pool.query(
    'SELECT * FROM macro_indicators WHERE enabled = true ORDER BY display_order'
  );

  let inserted = 0;
  for (const ind of indicators) {
    try {
      let value = null;
      if (ind.source === 'yahoo' && YAHOO_SYMBOLS[ind.indicator]) {
        value = await scrapeYahooQuote(YAHOO_SYMBOLS[ind.indicator]);
      } else if (ind.source === 'fred' && FRED_SERIES[ind.indicator]) {
        value = await scrapeFRED(FRED_SERIES[ind.indicator]);
      }

      if (value === null) {
        console.log(`  [SKIP] ${ind.indicator}: no value parsed`);
        continue;
      }

      // Get previous value for change calculation
      const prevRes = await pool.query(
        'SELECT value FROM macro_values WHERE indicator_id = $1 ORDER BY date DESC LIMIT 1',
        [ind.id]
      );
      const prevValue = prevRes.rows.length > 0 ? Number(prevRes.rows[0].value) : null;
      const changePct = (prevValue && prevValue !== 0)
        ? ((value - prevValue) / Math.abs(prevValue)) * 100
        : null;

      const today = new Date().toISOString().split('T')[0];
      await pool.query(
        `INSERT INTO macro_values (indicator_id, date, value, prev_value, change_pct)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (indicator_id, date) DO UPDATE SET
           value = EXCLUDED.value, prev_value = EXCLUDED.prev_value, change_pct = EXCLUDED.change_pct`,
        [ind.id, today, value, prevValue, changePct]
      );

      inserted++;
      const changeStr = changePct !== null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}%` : '';
      console.log(`  [OK] ${ind.indicator}: ${value} ${changeStr}`);
    } catch (e) {
      console.error(`  [ERR] ${ind.indicator}: ${e.message}`);
    }

    // Rate limit: 2s between requests
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n[DONE] ${inserted}/${indicators.length} indicators updated`);
  await pool.end();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
```

- [ ] **Step 2: Test scraper manually**

```bash
ssh sg2 "cd /home/ubuntu/projects/aegis-terminal/vps-api && export FIRECRAWL_API_KEY=fc-3673cb1426994104a857455bd3b61a7c && node scrape-macro.js"
```

Expected: At least some indicators return values. Yahoo quotes should work reliably.

- [ ] **Step 3: Verify DB has data**

```bash
ssh sg2 "PGPASSWORD=aegis_terminal_2026 psql -h localhost -U aegis -d aegis_terminal -c \"SELECT i.indicator, v.date, v.value, v.change_pct FROM macro_values v JOIN macro_indicators i ON i.id = v.indicator_id ORDER BY v.date DESC LIMIT 11;\""
```

Expected: 11 rows with today's date.

- [ ] **Step 4: Update crontab**

```bash
ssh sg2 "echo '0 */6 * * * FIRECRAWL_API_KEY=fc-3673cb1426994104a857455bd3b61a7c /home/ubuntu/projects/aegis-terminal/vps-api/run-macro-scrape.sh' | crontab -"
```

Create run script:

```bash
ssh sg2 "cat > /home/ubuntu/projects/aegis-terminal/vps-api/run-macro-scrape.sh << 'EOF'
#!/bin/bash
cd /home/ubuntu/projects/aegis-terminal/vps-api
export FIRECRAWL_API_KEY=fc-3673cb1426994104a857455bd3b61a7c
node scrape-macro.js 2>&1 | tee -a /tmp/macro-scrape.log
EOF
chmod +x /home/ubuntu/projects/aegis-terminal/vps-api/run-macro-scrape.sh"
```

- [ ] **Step 5: Commit**

```bash
git add vps-api/scrape-macro.js
git commit -m "feat: macro indicator scraper via Firecrawl"
```

---

### Task 3: Macro API Endpoints (VPS)

**Files:**
- Modify: `vps-api/server.js` — Add 4 endpoints after fundamental section

**Interfaces:**
- Consumes: `macro_indicators` + `macro_values` tables
- Produces: `/api/macro/latest`, `/api/macro/sparkline`, `/api/macro/history`, `/api/macro/config`

- [ ] **Step 1: Add endpoints to server.js**

Add after the fundamental engine section (after line ~870):

```javascript
// ═══════════════════════════════════════════════════════════════
// PHASE 6: MACRO DASHBOARD
// ═══════════════════════════════════════════════════════════════

// ─── Macro Latest ─────────────────────────────────────────────
app.get('/api/macro/latest', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT i.indicator, i.label, i.category, i.unit,
             v.value, v.prev_value as "prevValue", v.change_pct as "changePct", v.date
      FROM macro_indicators i
      LEFT JOIN LATERAL (
        SELECT value, prev_value, change_pct, date
        FROM macro_values WHERE indicator_id = i.id
        ORDER BY date DESC LIMIT 1
      ) v ON true
      WHERE i.enabled = true
      ORDER BY i.display_order
    `);
    res.json({ status: 'ok', data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Macro Sparkline ──────────────────────────────────────────
app.get('/api/macro/sparkline', async (req, res) => {
  try {
    const { indicator } = req.query;
    const range = req.query.range || '1y';
    const rangeDays = { '3m': 90, '6m': 180, '1y': 365, '2y': 730, '5y': 1825 };
    const days = rangeDays[range] || 365;

    const indRes = await pool.query(
      'SELECT id, indicator, label, unit FROM macro_indicators WHERE indicator = $1',
      [indicator]
    );
    if (indRes.rows.length === 0) return res.status(404).json({ error: 'Unknown indicator' });

    const ind = indRes.rows[0];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const { rows } = await pool.query(
      'SELECT date, value FROM macro_values WHERE indicator_id = $1 AND date >= $2 ORDER BY date ASC',
      [ind.id, cutoff.toISOString().split('T')[0]]
    );

    res.json({
      status: 'ok',
      data: { indicator: ind.indicator, label: ind.label, unit: ind.unit, series: rows },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Macro History ────────────────────────────────────────────
app.get('/api/macro/history', async (req, res) => {
  try {
    const { indicator } = req.query;
    const limit = parseInt(req.query.limit || '100');

    const indRes = await pool.query(
      'SELECT id, indicator, label, unit FROM macro_indicators WHERE indicator = $1',
      [indicator]
    );
    if (indRes.rows.length === 0) return res.status(404).json({ error: 'Unknown indicator' });

    const ind = indRes.rows[0];
    const { rows } = await pool.query(
      'SELECT date, value, prev_value as "prevValue", change_pct as "changePct" FROM macro_values WHERE indicator_id = $1 ORDER BY date DESC LIMIT $2',
      [ind.id, limit]
    );

    res.json({
      status: 'ok',
      data: { indicator: ind.indicator, label: ind.label, unit: ind.unit, records: rows },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Macro Config ─────────────────────────────────────────────
app.get('/api/macro/config', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT indicator, label, category, unit, enabled, display_order as "displayOrder" FROM macro_indicators ORDER BY display_order'
    );
    res.json({ status: 'ok', data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: Test endpoints**

```bash
curl -s https://engine.aegisterminal.app/api/macro/latest | python3 -m json.tool | head -20
curl -s "https://engine.aegisterminal.app/api/macro/sparkline?indicator=VIX&range=1y" | python3 -m json.tool | head -10
curl -s "https://engine.aegisterminal.app/api/macro/history?indicator=CPI" | python3 -m json.tool | head -10
curl -s https://engine.aegisterminal.app/api/macro/config | python3 -m json.tool | head -10
```

Expected: All return `{"status":"ok","data":...}` with real data.

- [ ] **Step 3: Commit**

```bash
git add vps-api/server.js
git commit -m "feat: macro dashboard API endpoints"
```

---

### Task 4: Frontend — MacroSparkline Component

**Files:**
- Create: `frontend/src/modules/macro/MacroSparkline.tsx`

**Interfaces:**
- Consumes: `series: { date: string; value: number }[]`
- Produces: `<MacroSparkline series={...} width={120} height={40} />`

- [ ] **Step 1: Create sparkline component**

```tsx
import { useRef, useEffect } from 'react'

interface Props {
  series: { date: string; value: number }[]
  width?: number
  height?: number
  color?: string
}

export function MacroSparkline({ series, width = 120, height = 40, color = '#f59e0b' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || series.length < 2) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const values = series.map(s => s.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const pad = 2

    ctx.clearRect(0, 0, width, height)

    // Draw line
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'

    values.forEach((v, i) => {
      const x = pad + (i / (values.length - 1)) * (width - pad * 2)
      const y = pad + (1 - (v - min) / range) * (height - pad * 2)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // Fill gradient below line
    const lastX = pad + ((values.length - 1) / (values.length - 1)) * (width - pad * 2)
    ctx.lineTo(lastX, height)
    ctx.lineTo(pad, height)
    ctx.closePath()

    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, color + '30')
    gradient.addColorStop(1, color + '05')
    ctx.fillStyle = gradient
    ctx.fill()
  }, [series, width, height, color])

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height, display: 'block' }}
    />
  )
}
```

- [ ] **Step 2: Build and verify no TS errors**

```bash
cd frontend && npm run build 2>&1 | grep -i error
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/modules/macro/MacroSparkline.tsx
git commit -m "feat: MacroSparkline canvas component"
```

---

### Task 5: Frontend — MacroWidget (Dashboard)

**Files:**
- Create: `frontend/src/modules/macro/MacroWidget.tsx`
- Modify: Dashboard page to include MacroWidget

**Interfaces:**
- Consumes: `/api/macro/latest` response
- Produces: `<MacroWidget />` — 2x3 grid of sparkline cards

- [ ] **Step 1: Create MacroWidget**

```tsx
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { MacroSparkline } from './MacroSparkline'
import { useNavigate } from 'react-router-dom'

interface MacroLatest {
  indicator: string
  label: string
  category: string
  unit: string
  value: number | null
  prevValue: number | null
  changePct: number | null
  date: string
}

export function MacroWidget() {
  const navigate = useNavigate()
  const { data: indicators } = useQuery<MacroLatest[]>({
    queryKey: ['macro-latest'],
    queryFn: () => api('/api/macro/latest'),
    refetchInterval: 300_000,
    retry: 1,
  })

  if (!indicators || indicators.length === 0) return null

  // Show top 6
  const top6 = indicators.slice(0, 6)

  return (
    <div style={{
      background: '#12121a',
      border: '1px solid #1e1e2e',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid #1e1e2e',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>
          📊 Macro Overview
        </span>
        <button
          onClick={() => navigate('/macro')}
          style={{
            background: 'none', border: 'none', color: '#f59e0b',
            fontSize: 11, cursor: 'pointer', fontWeight: 600,
          }}
        >
          View All →
        </button>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 1,
        background: '#1e1e2e',
      }}>
        {top6.map((ind) => {
          const change = ind.changePct ?? 0
          const changeColor = change > 0 ? '#22c55e' : change < 0 ? '#ef4444' : '#64748b'
          return (
            <div
              key={ind.indicator}
              onClick={() => navigate(`/macro?indicator=${ind.indicator}`)}
              style={{
                background: '#12121a',
                padding: '12px 14px',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#18182a')}
              onMouseLeave={e => (e.currentTarget.style.background = '#12121a')}
            >
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>
                {ind.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
                {ind.value != null ? ind.value.toLocaleString() : '—'}
                <span style={{ fontSize: 10, color: '#64748b', marginLeft: 4 }}>{ind.unit}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: changeColor }}>
                  {change > 0 ? '+' : ''}{change.toFixed(1)}%
                </span>
                <MacroSparkline
                  series={[]} /* Will be populated by parent if needed */
                  width={60}
                  height={20}
                  color={changeColor}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add to Dashboard page**

Find the Dashboard component and add `<MacroWidget />` after existing sections.

- [ ] **Step 3: Add route to App.tsx**

```tsx
// In the routes section
const MacroDashboard = React.lazy(() => import('./modules/macro/MacroDashboard'))
// Add route:
<Route path="/macro" element={<MacroDashboard />} />
```

- [ ] **Step 4: Build and verify**

```bash
cd frontend && npm run build 2>&1 | grep -i error
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/macro/MacroWidget.tsx frontend/src/App.tsx
git commit -m "feat: MacroWidget sparkline cards on Dashboard"
```

---

### Task 6: Frontend — /macro Detail Page

**Files:**
- Create: `frontend/src/modules/macro/MacroDashboard.tsx`

**Interfaces:**
- Consumes: `/api/macro/config`, `/api/macro/sparkline`, `/api/macro/history`
- Produces: Full /macro page with category tabs, large chart, history table

- [ ] **Step 1: Create MacroDashboard page**

Full page component with:
- Left sidebar: Category tabs + indicator list
- Main area: Large sparkline chart + history table
- Top bar: Title + refresh + last updated

(Implementation deferred to subagent — full component is ~300 lines)

- [ ] **Step 2: Add sidebar nav item**

In `Sidebar.tsx`, add under ANALYSIS:

```tsx
{ label: 'Macro', path: '/macro', icon: BarChart3 },
```

- [ ] **Step 3: Add TopBar nav item**

In `TopBar.tsx`, add to mobile nav items.

- [ ] **Step 4: Build, deploy, verify**

```bash
cd frontend && npm run build && npx wrangler pages deploy dist --project-name=aegis-terminal --branch=main
```

Puppeteer test: navigate to `/macro`, verify zero JS errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/modules/macro/MacroDashboard.tsx frontend/src/components/Sidebar.tsx frontend/src/components/TopBar.tsx
git commit -m "feat: /macro detail page with category tabs and history table"
```

---

### Task 7: Integration Test + Deploy Verification

**Files:** None (verification only)

- [ ] **Step 1: Run scraper to populate data**

```bash
ssh sg2 "cd /home/ubuntu/projects/aegis-terminal/vps-api && export FIRECRAWL_API_KEY=fc-3673cb1426994104a857455bd3b61a7c && node scrape-macro.js"
```

- [ ] **Step 2: Verify all API endpoints**

```bash
curl -s https://engine.aegisterminal.app/api/macro/latest | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"data\"])} indicators with data')"
curl -s "https://engine.aegisterminal.app/api/macro/sparkline?indicator=VIX&range=1y" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d[\"data\"][\"series\"])} data points')"
```

- [ ] **Step 3: Puppeteer verify Dashboard + /macro**

Navigate to homepage, verify MacroWidget renders. Navigate to /macro, verify page loads with zero JS errors.

- [ ] **Step 4: Final commit + push**

```bash
git add -A && git commit -m "feat: macro dashboard complete" && git push
```
