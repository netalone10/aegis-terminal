#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// Economic Calendar Scraper — Firecrawl + Investing.com
// Fetches actual/forecast/previous for economic events
// ═══════════════════════════════════════════════════════════════

const https = require('https');
const { Pool } = require('pg');

const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY || '';
const pool = new Pool({
  host: '127.0.0.1', port: 5432,
  database: 'aegis_terminal', user: 'aegis', password: 'aegis_terminal_2026',
  max: 5,
});

// ─── Event Name Mapping ────────────────────────────────────────
const EVENT_MAP = {
  // US
  'Nonfarm Payrolls': 'Non-Farm Payrolls',
  'Non-Farm Employment Change': 'Non-Farm Payrolls',
  'ISM Manufacturing PMI': 'ISM Manufacturing PMI',
  'ISM Services PMI': 'ISM Services PMI',
  'ISM Non-Manufacturing PMI': 'ISM Services PMI',
  'FOMC Interest Rate Decision': 'FOMC Rate Decision',
  'Federal Funds Rate': 'FOMC Rate Decision',
  'Core CPI (MoM)': 'Core CPI (MoM)',
  'Core CPI (YoY)': 'Core CPI (YoY)',
  'CPI (MoM)': 'CPI (MoM)',
  'CPI (YoY)': 'CPI (YoY)',
  'Core PCE Price Index (MoM)': 'Core PCE Price Index',
  'Core PCE Price Index': 'Core PCE Price Index',
  'Initial Jobless Claims': 'Initial Jobless Claims',
  'Unemployment Rate': 'Unemployment Rate',
  'Average Hourly Earnings (MoM)': 'Average Hourly Earnings',
  'Average Hourly Earnings (YoY)': 'Average Hourly Earnings YoY',
  'Retail Sales (MoM)': 'Retail Sales (MoM)',
  'Advance GDP (QoQ)': 'GDP (Advance)',
  'GDP (Advance)': 'GDP (Advance)',
  'PPI (MoM)': 'PPI (MoM)',
  'PPI (YoY)': 'PPI (YoY)',
  // Central Banks
  'ECB Interest Rate Decision': 'ECB Rate Decision',
  'Main Refinancing Rate': 'ECB Rate Decision',
  'BOE Interest Rate Decision': 'BOE Rate Decision',
  'BOJ Interest Rate Decision': 'BOJ Rate Decision',
  // EU
  'German ZEW Economic Sentiment': 'German ZEW Economic Sentiment',
  // UK
  'UK CPI (YoY)': 'UK CPI (YoY)',
  // CN
  'Caixin Manufacturing PMI': 'China Caixin PMI Manufacturing',
  'Unemployment Rate': 'Unemployment Rate',
  'Average Hourly Earnings (MoM)': 'Average Hourly Earnings',
  'Average Hourly Earnings (YoY)': 'Average Hourly Earnings YoY',
  'Initial Jobless Claims': 'Initial Jobless Claims',
  'ISM Manufacturing PMI': 'ISM Manufacturing PMI',
  'ISM Services PMI': 'ISM Services PMI',
  'FOMC Interest Rate Decision': 'FOMC Rate Decision',
  'Core CPI (MoM)': 'Core CPI (MoM)',
  'CPI (MoM)': 'CPI (MoM)',
  'CPI (YoY)': 'CPI (YoY)',
  'Core CPI (YoY)': 'Core CPI (YoY)',
  'Core PCE Price Index (MoM)': 'Core PCE Price Index',
  'PPI (MoM)': 'PPI (MoM)',
  'PPI (YoY)': 'PPI (YoY)',
  'Advance GDP (QoQ)': 'GDP (Advance)',
  'Retail Sales (MoM)': 'Retail Sales (MoM)',
  'Core Retail Sales (MoM)': 'Core Retail Sales (MoM)',
  'Total Vehicle Sales': 'Total Vehicle Sales',
  'Factory Orders (MoM)': 'Factory Orders (MoM)',
  'CB Consumer Confidence': 'CB Consumer Confidence',
  'ADP Employment Change': 'ADP Employment Change',
  'Flash Manufacturing PMI': 'Flash Manufacturing PMI',
  'Flash Services PMI': 'Flash Services PMI',
  'Durable Goods Orders (MoM)': 'Durable Goods Orders',
  'New Home Sales': 'New Home Sales',
  'Existing Home Sales': 'Existing Home Sales',
  'JOLTs Job Openings': 'JOLTs Job Openings',
  'Average Weekly Hours': 'Average Weekly Hours',
  'Manufacturing Payrolls': 'Manufacturing Payrolls',
  'Continuing Jobless Claims': 'Continuing Jobless Claims',
  'Participation Rate': 'Participation Rate',
  'Trade Balance': 'Trade Balance',
  'Building Permits': 'Building Permits',
  'Housing Starts': 'Housing Starts',
  'Michigan Consumer Sentiment (Final)': 'UMich Consumer Sentiment',
  'Michigan Consumer Sentiment (Prelim)': 'UMich Consumer Sentiment Prelim',
  'Pending Home Sales (MoM)': 'Pending Home Sales',
  'Private Nonfarm Payrolls': 'Private Nonfarm Payrolls',
  'German ZEW Economic Sentiment': 'German ZEW Economic Sentiment',
  'UK CPI (YoY)': 'UK CPI (YoY)',
  'ECB Interest Rate Decision': 'ECB Rate Decision',
  'BOE Interest Rate Decision': 'BOE Rate Decision',
  'BOJ Interest Rate Decision': 'BOJ Rate Decision',
};

function parseNumber(text) {
  if (!text || text.trim() === '' || text.trim() === '-' || text.trim() === 'N/A') return null;
  let cleaned = text.trim().replace(/,/g, '').replace(/%/g, '');
  if (cleaned.endsWith('K')) return parseFloat(cleaned) * 1000;
  if (cleaned.endsWith('M')) return parseFloat(cleaned) * 1e6;
  if (cleaned.endsWith('B')) return parseFloat(cleaned) * 1e9;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ─── Fetch from Firecrawl ───────────────────────────────────────
async function fetchCalendar() {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      url: 'https://www.investing.com/economic-calendar/',
      formats: ['markdown'],
      waitFor: 8000,
      onlyMainContent: true,
    });

    const req = https.request({
      hostname: 'api.firecrawl.dev',
      path: '/v2/scrape',
      method: 'POST',
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

// ─── Parse events from markdown ─────────────────────────────────
function parseEvents(markdown) {
  const events = [];
  let currentDate = null;
  const monthMap = { January:'01',February:'02',March:'03',April:'04',May:'05',June:'06',
    July:'07',August:'08',September:'09',October:'10',November:'11',December:'12' };

  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();

    // Date header: "| Sunday, July 5, 2026 |" or "Sunday, July 5, 2026"
    const dm = trimmed.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\w+)\s+(\d{1,2}),?\s*(\d{4})?/);
    if (dm) {
      const month = monthMap[dm[2]] || '01';
      const day = dm[3].padStart(2, '0');
      const year = dm[4] || new Date().getUTCFullYear();
      currentDate = `${year}-${month}-${day}`;
      continue;
    }
    if (!currentDate) continue;

    // Only process rows that have Act: data (actual calendar events, not sidebar)
    if (!trimmed.includes('Act:')) continue;

    // Event name from markdown link [Event Name](url)
    const eventMatch = trimmed.match(/\[([^\]]+)\]\(/);
    if (!eventMatch) continue;
    let rawName = eventMatch[1];
    // Clean month/year suffix like "(Jun)" or "(Jul 2026)"
    rawName = rawName.replace(/\s*\((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*\d{0,4}\)\s*$/, '').trim();

    const mappedName = EVENT_MAP[rawName];
    if (!mappedName) continue;

    // Parse embedded data: "Act:<br>52.0<br>Cons:<br>-<br>Prev.:<br>50.4"
    let actual = null, forecast = null, previous = null;

    // Try embedded format first (Investing.com via Firecrawl)
    const actMatch = trimmed.match(/Act:<br>-?([\d.,]+[%KMBTk]?)/i);
    const consMatch = trimmed.match(/Cons:<br>-?([\d.,]+[%KMBTk]?)/i);
    const prevMatch = trimmed.match(/Prev\.:?<br>-?([\d.,]+[%KMBTk]?)/i);

    if (actMatch) actual = parseNumber(actMatch[1]);
    if (consMatch && consMatch[1] !== '-') forecast = parseNumber(consMatch[1]);
    if (prevMatch) previous = parseNumber(prevMatch[1]);

    // Fallback: table cells after event
    if (actual === null && forecast === null) {
      const cells = trimmed.split('|');
      const numberVals = [];
      let foundEvent = false;
      for (const c of cells) {
        const cs = c.trim();
        if (cs.includes('[')) { foundEvent = true; continue; }
        if (!foundEvent || cs === '') continue;
        if (/^[-\d.,]+[%KMBTk]?$/.test(cs)) {
          numberVals.push(parseNumber(cs));
        }
      }
      actual = numberVals[0] ?? null;
      forecast = numberVals[1] ?? null;
      previous = numberVals[2] ?? null;
    }

    if (actual !== null || forecast !== null) {
      events.push({ date: currentDate, eventDB: mappedName, actual, consensus: forecast, previous });
    }
  }
  return events;
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  console.log(`[${new Date().toISOString()}] Starting economic calendar scrape...`);

  if (!FIRECRAWL_KEY) {
    console.error('[ERR] FIRECRAWL_API_KEY not set');
    process.exit(1);
  }

  try {
    const markdown = await fetchCalendar();
    console.log(`[OK] Fetched ${markdown.length} chars from Investing.com`);

    const events = parseEvents(markdown);
    console.log(`[OK] Parsed ${events.length} tracked events`);

    let inserted = 0;
    for (const ev of events) {
      let surprisePct = null;
      if (ev.actual !== null && ev.consensus !== null && ev.consensus !== 0) {
        surprisePct = (ev.actual - ev.consensus) / Math.abs(ev.consensus);
      }

      const actualS = ev.actual !== null ? ev.actual : 'NULL';
      const consensusS = ev.consensus !== null ? ev.consensus : 'NULL';
      const previousS = ev.previous !== null ? ev.previous : 'NULL';
      const surpriseS = surprisePct !== null ? surprisePct.toFixed(6) : 'NULL';

      try {
        const result = await pool.query(
          `INSERT INTO event_releases (event_id, release_date, consensus, previous, actual, surprise_pct)
           SELECT id, $1, $2, $3, $4, $5
           FROM economic_events WHERE event_name = $6
           ON CONFLICT DO NOTHING`,
          [ev.date, ev.consensus, ev.previous, ev.actual, surprisePct, ev.eventDB]
        );
        if (result.rowCount > 0) {
          inserted++;
          const parts = [];
          if (ev.consensus !== null) parts.push(`fcst=${ev.consensus}`);
          if (ev.actual !== null) parts.push(`actual=${ev.actual}`);
          if (surprisePct !== null) parts.push(`surprise=${(surprisePct * 100).toFixed(1)}%`);
          console.log(`  [OK] ${ev.eventDB} ${ev.date} ${parts.join(' ')}`);
        }
      } catch (e) {
        console.error(`  [ERR] ${ev.eventDB}: ${e.message}`);
      }
    }

    console.log(`\n[DONE] ${inserted} new releases inserted`);
  } catch (e) {
    console.error(`[FATAL] ${e.message}`);
  }

  await pool.end();
}

main();
