#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// Economic Calendar Scraper — Trading Economics (reliable, no auth)
// Scrapes weekly economic events and inserts into event_releases
// ═══════════════════════════════════════════════════════════════

const https = require('https');
const cheerio = require('cheerio');
const { Pool } = require('pg');

const pool = new Pool({
  host: '127.0.0.1', port: 5432,
  database: 'aegis_terminal', user: 'aegis', password: 'aegis_terminal_2026',
  max: 5,
});

// ─── Event Name Mapping (Trading Economics → DB) ────────────────
// Trading Economics uses names like "ISM Services PMI JUN", "Non-Farm Payrolls MAY"
// We strip the month reference and map to our DB event_name
const EVENT_MAP = {
  // US Employment
  'Non-Farm Payrolls': 'Non-Farm Payrolls',
  'Change in Non-Farm Payrolls': 'Non-Farm Payrolls',
  'Nonfarm Payrolls': 'Non-Farm Payrolls',
  'ADP Employment Change': 'ADP Employment Change',
  'ADP Nonfarm Private Employment': 'ADP Employment Change',
  'Initial Jobless Claims': 'Initial Jobless Claims',
  'Continuing Jobless Claims': 'Continuing Jobless Claims',
  'Unemployment Rate': 'Unemployment Rate',
  'Average Hourly Earnings': 'Average Hourly Earnings',
  'Average Hourly Earnings MoM': 'Average Hourly Earnings',
  'Average Hourly Earnings YoY': 'Average Hourly Earnings YoY',
  'Average Weekly Hours': 'Average Weekly Hours',
  'Manufacturing Payrolls': 'Manufacturing Payrolls',
  'Participation Rate': 'Participation Rate',
  'Private Nonfarm Payrolls': 'Private Nonfarm Payrolls',
  'JOLTs Job Openings': 'JOLTs Job Openings',
  // US Inflation
  'CPI MoM': 'CPI (MoM)',
  'CPI YoY': 'CPI (YoY)',
  'Core CPI MoM': 'Core CPI (MoM)',
  'Core CPI YoY': 'Core CPI (YoY)',
  'CPI (MoM)': 'CPI (MoM)',
  'CPI (YoY)': 'CPI (YoY)',
  'Core CPI (MoM)': 'Core CPI (MoM)',
  'Core CPI (YoY)': 'Core CPI (YoY)',
  'PPI MoM': 'PPI (MoM)',
  'PPI YoY': 'PPI (YoY)',
  'PPI (MoM)': 'PPI (MoM)',
  'PPI (YoY)': 'PPI (YoY)',
  'Core PCE Price Index MoM': 'Core PCE Price Index',
  'Core PCE Price Index': 'Core PCE Price Index',
  'Core PCE Price Index (MoM)': 'Core PCE Price Index',
  // US Growth
  'GDP Growth Rate': 'GDP (Advance)',
  'GDP Growth Rate QoQ Ann.': 'GDP (Advance)',
  'Advance GDP (QoQ)': 'GDP (Advance)',
  'GDP (Advance)': 'GDP (Advance)',
  'Retail Sales MoM': 'Retail Sales (MoM)',
  'Retail Sales (MoM)': 'Retail Sales (MoM)',
  'Core Retail Sales MoM': 'Core Retail Sales (MoM)',
  'Durable Goods Orders MoM': 'Durable Goods Orders',
  'Factory Orders MoM': 'Factory Orders (MoM)',
  'Industrial Production MoM': 'Industrial Production MoM)',
  // US PMI
  'ISM Manufacturing PMI': 'ISM Manufacturing PMI',
  'ISM Services PMI': 'ISM Services PMI',
  'ISM Non-Manufacturing PMI': 'ISM Services PMI',
  'Flash Manufacturing PMI': 'Flash Manufacturing PMI',
  'Flash Services PMI': 'Flash Services PMI',
  'S&P Global Manufacturing PMI Final': 'Flash Manufacturing PMI',
  'S&P Global Services PMI Final': 'Flash Services PMI',
  'S&P Global Composite PMI Final': 'Flash Manufacturing PMI',
  // US Housing
  'New Home Sales': 'New Home Sales',
  'Existing Home Sales': 'Existing Home Sales',
  'Pending Home Sales MoM': 'Pending Home Sales',
  'Building Permits': 'Building Permits',
  'Housing Starts': 'Housing Starts',
  // US Confidence
  'CB Consumer Confidence': 'CB Consumer Confidence',
  'Michigan Consumer Sentiment Final': 'UMich Consumer Sentiment',
  'Michigan Consumer Sentiment Prelim': 'UMich Consumer Sentiment Prelim',
  'UMich Consumer Sentiment Final': 'UMich Consumer Sentiment',
  'UMich Consumer Sentiment Prelim': 'UMich Consumer Sentiment Prelim',
  // US Trade
  'Trade Balance': 'Trade Balance',
  // Central Banks
  'FOMC Interest Rate Decision': 'FOMC Rate Decision',
  'Federal Funds Rate': 'FOMC Rate Decision',
  'FOMC Rate Decision': 'FOMC Rate Decision',
  'ECB Interest Rate Decision': 'ECB Rate Decision',
  'ECB Rate Decision': 'ECB Rate Decision',
  'Main Refinancing Rate': 'ECB Rate Decision',
  'BOE Interest Rate Decision': 'BOE Rate Decision',
  'BOE Rate Decision': 'BOE Rate Decision',
  'Bank Rate': 'BOE Rate Decision',
  'BOJ Interest Rate Decision': 'BOJ Rate Decision',
  'BOJ Rate Decision': 'BOJ Rate Decision',
  'BOJ Policy Rate': 'BOJ Rate Decision',
  // EU
  'German ZEW Economic Sentiment': 'German ZEW Economic Sentiment',
  // UK
  'CPI YoY': 'UK CPI (YoY)',
  'Core CPI YoY': 'UK CPI (YoY)',
  // CN
  'Caixin Manufacturing PMI': 'China Caixin PMI Manufacturing',
  'Caixin Services PMI': 'China Caixin PMI Services',
};

// Country code mapping
const COUNTRY_MAP = {
  'US': 'USD', 'GB': 'GBP', 'EA': 'EUR', 'EU': 'EUR',
  'JP': 'JPY', 'CA': 'CAD', 'AU': 'AUD', 'NZ': 'NZD',
  'CH': 'CHF', 'CN': 'CNY', 'DE': 'EUR', 'FR': 'EUR',
  'IT': 'EUR', 'ES': 'EUR',
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

// ─── Fetch from Trading Economics ────────────────────────────────
function fetchCalendar() {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'tradingeconomics.com',
      path: '/calendar',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        resolve(data);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ─── Parse events from HTML ─────────────────────────────────────
function parseEvents(html) {
  const $ = cheerio.load(html);
  const events = [];
  const $table = $('#calendar');
  if ($table.length === 0) {
    console.warn('[WARN] No #calendar table found in HTML');
    return events;
  }

  let currentDate = null;

  $table.find('tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 5) return;

    // Cell 0: has date class like "2026-07-06"
    const dateCell = cells.first();
    const dateClass = (dateCell.attr('class') || '').trim();
    const dateMatch = dateClass.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      currentDate = dateMatch[1];
    }

    if (!currentDate) return;

    // Cell 3: country ISO code
    const countryCell = cells.filter('.calendar-iso');
    if (countryCell.length === 0) return;
    const country = countryCell.text().trim();

    // Cell 4: event name (link + reference)
    const eventCell = cells.eq(4);
    const eventLink = eventCell.find('a.calendar-event');
    if (eventLink.length === 0) return;
    const rawName = eventLink.text().trim();

    // Map event name (strip month reference by trying with and without it)
    const mappedName = EVENT_MAP[rawName];
    if (!mappedName) return;

    // Cells 5-8: Actual, Previous, Consensus, Forecast
    // Use IDs to find specific values
    const actualEl = $(row).find('#actual');
    const previousEl = $(row).find('#previous');
    const consensusEl = $(row).find('#consensus');
    const forecastEl = $(row).find('#forecast');

    const actual = actualEl.length ? parseNumber(actualEl.text()) : null;
    const previous = previousEl.length ? parseNumber(previousEl.text()) : null;
    const consensus = consensusEl.length ? parseNumber(consensusEl.text()) : null;
    const forecast = forecastEl.length ? parseNumber(forecastEl.text()) : null;

    // Use forecast as consensus if consensus is empty
    const finalConsensus = consensus || forecast;

    events.push({
      date: currentDate,
      country,
      currency: COUNTRY_MAP[country] || country,
      eventRaw: rawName,
      eventDB: mappedName,
      actual,
      previous,
      consensus: finalConsensus,
      forecast,
    });
  });

  return events;
}

// ─── CLI args: node scrape-calendar.js [this|next|YYYY-MM-DD] ───
function parseArgs() {
  const args = process.argv.slice(2);
  const now = new Date();
  const day = now.getUTCDay();

  if (args.length === 0 || args[0] === 'this') {
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - ((day + 6) % 7));
    monday.setUTCHours(0, 0, 0, 0);
    const friday = new Date(monday);
    friday.setUTCDate(monday.getUTCDate() + 6);
    return {
      start: monday.toISOString().split('T')[0],
      end: friday.toISOString().split('T')[0],
    };
  }

  if (args[0] === 'next') {
    const nextMon = new Date(now);
    nextMon.setUTCDate(now.getUTCDate() + ((8 - day) % 7 || 7));
    nextMon.setUTCHours(0, 0, 0, 0);
    const fri = new Date(nextMon);
    fri.setUTCDate(nextMon.getUTCDate() + 6);
    return {
      start: nextMon.toISOString().split('T')[0],
      end: fri.toISOString().split('T')[0],
    };
  }

  return { start: args[0], end: args[1] || args[0] };
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  const now = new Date();
  const day = now.getUTCDay();

  // Calculate this week range (Mon-Fri)
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((day + 6) % 7));
  monday.setUTCHours(0, 0, 0, 0);
  const thisFriday = new Date(monday);
  thisFriday.setUTCDate(monday.getUTCDate() + 4);

  // Calculate next week range (Mon-Fri)
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  const nextFriday = new Date(nextMonday);
  nextFriday.setUTCDate(nextMonday.getUTCDate() + 4);

  const weekStart = monday.toISOString().split('T')[0];
  const weekEnd = nextFriday.toISOString().split('T')[0];
  console.log(`[${now.toISOString()}] Economic calendar scraper starting...`);
  console.log(`Range: ${weekStart} to ${weekEnd} (this week + next week)`);

  try {
    // Fetch calendar page
    const html = await fetchCalendar();
    console.log(`[OK] Fetched ${html.length} chars from Trading Economics`);

    // Parse events
    const allEvents = parseEvents(html);
    console.log(`[OK] Parsed ${allEvents.length} total calendar events`);

    // Filter to tracked events within date range
    const trackedEvents = allEvents.filter(e => e.date >= weekStart && e.date <= weekEnd);
    console.log(`[OK] ${trackedEvents.length} tracked events in range ${weekStart} to ${weekEnd}`);

    // Deduplicate (same event might appear from multiple header rows)
    const seen = new Set();
    const uniqueEvents = trackedEvents.filter(e => {
      const key = `${e.eventDB}|${e.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Insert into DB
    let inserted = 0;
    let skipped = 0;

    for (const ev of uniqueEvents) {
      let surprisePct = null;
      if (ev.actual !== null && ev.consensus !== null && ev.consensus !== 0) {
        surprisePct = (ev.actual - ev.consensus) / Math.abs(ev.consensus);
      }

      try {
        // First try insert, then update if actual/consensus became available
        const result = await pool.query(
          `INSERT INTO event_releases (event_id, release_date, consensus, previous, actual, surprise_pct)
           SELECT id, $1, $2, $3, $4, $5
           FROM economic_events WHERE event_name = $6
           ON CONFLICT (event_id, release_date) DO UPDATE SET
             consensus = COALESCE(EXCLUDED.consensus, event_releases.consensus),
             previous = COALESCE(EXCLUDED.previous, event_releases.previous),
             actual = COALESCE(EXCLUDED.actual, event_releases.actual),
             surprise_pct = COALESCE(EXCLUDED.surprise_pct, event_releases.surprise_pct)`,
          [ev.date, ev.consensus, ev.previous, ev.actual, surprisePct, ev.eventDB]
        );
        if (result.rowCount > 0) {
          inserted++;
          const parts = [];
          if (ev.consensus !== null) parts.push(`fcst=${ev.consensus}`);
          if (ev.actual !== null) parts.push(`actual=${ev.actual}`);
          if (ev.previous !== null) parts.push(`prev=${ev.previous}`);
          if (surprisePct !== null) parts.push(`surprise=${(surprisePct * 100).toFixed(1)}%`);
          console.log(`  [UPSERT] ${ev.eventDB} ${ev.date} (${ev.country}) ${parts.join(' ')}`);
        } else {
          skipped++;
        }
      } catch (e) {
        console.error(`  [ERR] ${ev.eventDB}: ${e.message}`);
      }
    }

    console.log(`\n[DONE] ${inserted} new releases inserted, ${skipped} skipped (already exist)`);
    console.log(`[SOURCE] Trading Economics (tradingeconomics.com/calendar)`);

    const result = { events: inserted, source: 'Trading Economics', totalParsed: uniqueEvents.length };
    console.log(`[RESULT] ${JSON.stringify(result)}`);

  } catch (err) {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
  }

  await pool.end();
}

main();
