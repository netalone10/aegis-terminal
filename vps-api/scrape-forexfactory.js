#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// ForexFactory Calendar Scraper
// Scrapes this week's economic events and inserts into event_releases
// ═══════════════════════════════════════════════════════════════

const axios = require('axios');
const cheerio = require('cheerio');
const { Pool } = require('pg');

const pool = new Pool({
  host: '127.0.0.1',
  port: 5432,
  database: 'aegis_terminal',
  user: 'aegis',
  password: 'aegis_terminal_2026',
  max: 5,
});

// ForexFactory event name → our DB event_name mapping
const EVENT_NAME_MAP = {
  'Non-Farm Employment Change': 'Non-Farm Payrolls',
  'Non-Farm Payrolls': 'Non-Farm Payrolls',
  'NFP': 'Non-Farm Payrolls',
  'ADP Employment Change': 'ADP Employment Change',
  'ADP Non-Farm Employment Change': 'ADP Employment Change',
  'Initial Jobless Claims': 'Initial Jobless Claims',
  'Unemployment Rate': 'Unemployment Rate',
  'Average Hourly Earnings': 'Average Hourly Earnings',
  'CPI m/m': 'Core CPI (MoM)',
  'Core CPI m/m': 'Core CPI (MoM)',
  'CPI y/y': 'CPI (YoY)',
  'CPI (YoY)': 'CPI (YoY)',
  'Core CPI (MoM)': 'Core CPI (MoM)',
  'PPI m/m': 'PPI (YoY)',
  'PPI y/y': 'PPI (YoY)',
  'PPI (YoY)': 'PPI (YoY)',
  'Core PCE Price Index m/m': 'Core PCE Price Index',
  'Core PCE Price Index': 'Core PCE Price Index',
  'ISM Manufacturing PMI': 'ISM Manufacturing PMI',
  'ISM Services PMI': 'ISM Services PMI',
  'ISM Non-Manufacturing PMI': 'ISM Services PMI',
  'Retail Sales m/m': 'Retail Sales (MoM)',
  'Retail Sales (MoM)': 'Retail Sales (MoM)',
  'Advance GDP q/q': 'GDP (Advance)',
  'Revised UoM Consumer Sentiment': 'GDP (Advance)',
  'GDP (Advance)': 'GDP (Advance)',
  'FOMC Rate Decision': 'FOMC Rate Decision',
  'FOMC Statement': 'FOMC Rate Decision',
  'Federal Funds Rate': 'FOMC Rate Decision',
  'FOMC Meeting Minutes': 'FOMC Minutes',
  'ECB Rate Decision': 'ECB Rate Decision',
  'Main Refinancing Rate': 'ECB Rate Decision',
  'BOE Official Bank Rate': 'BOE Rate Decision',
  'BOE Rate Decision': 'BOE Rate Decision',
  'BOJ Policy Rate': 'BOJ Rate Decision',
  'BOJ Rate Decision': 'BOJ Rate Decision',
  'German ZEW Economic Sentiment': 'German ZEW Economic Sentiment',
  'UK CPI y/y': 'UK CPI (YoY)',
  'UK CPI (YoY)': 'UK CPI (YoY)',
  'Caixin Manufacturing PMI': 'China Caixin PMI Manufacturing',
};

// Impact tier mapping from FF icons
function mapImpact(iconClass) {
  if (!iconClass) return 'C';
  const cls = iconClass.toLowerCase();
  if (cls.includes('ff-impact-red')) return 'S+';
  if (cls.includes('ff-impact-ora') || cls.includes('ff-impact-orange')) return 'S';
  if (cls.includes('ff-impact-yel') || cls.includes('ff-impact-yellow')) return 'A';
  if (cls.includes('ff-impact-gra') || cls.includes('ff-impact-gray')) return 'C';
  return 'C';
}

// Country code from FF
function mapCountry(currency) {
  const map = {
    'USD': 'US', 'EUR': 'EU', 'GBP': 'UK', 'JPY': 'JP',
    'CAD': 'CA', 'AUD': 'AU', 'NZD': 'NZ', 'CHF': 'CH',
    'CNY': 'CN', 'CNH': 'CN',
  };
  return map[currency?.toUpperCase()] || currency || 'XX';
}

// Parse number from FF text (handle K, M suffixes and N/A)
function parseNumber(text) {
  if (!text || text.trim() === '' || text.trim() === '—' || text.trim() === 'n/a' || text.trim().includes('N/A')) {
    return null;
  }
  let cleaned = text.trim().replace(/,/g, '').replace(/%/g, '');
  // Handle K/M suffixes
  if (cleaned.endsWith('K')) return parseFloat(cleaned) * 1000;
  if (cleaned.endsWith('M')) return parseFloat(cleaned) * 1000000;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

async function scrapeForexFactory() {
  console.log(`[${new Date().toISOString()}] Starting ForexFactory scrape...`);

  // Get this week's Monday
  const now = new Date();
  const day = now.getUTCDay();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((day + 6) % 7));
  monday.setUTCHours(0, 0, 0, 0);
  const weekStart = monday.toISOString().split('T')[0];

  console.log(`Week starting: ${weekStart}`);

  try {
    // Fetch FF calendar page
    const response = await axios.get('https://www.forexfactory.com/calendar', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 30000,
    });

    const $ = cheerio.load(response.data);
    let eventsFound = 0;
    let releasesInserted = 0;

    // ForexFactory calendar structure:
    // .calendar__row contains each event
    // .calendar__time - time
    // .calendar__currency - currency
    // .calendar__impact - impact icon (has ff-impact-* class)
    // .calendar__event - event name
    // .calendar__actual - actual value
    // .calendar__forecast - forecast/consensus
    // .calendar__previous - previous value

    let currentDate = null;

    // Process each row
    $('.calendar__row, .calendar__row--new, tr').each((i, row) => {
      const $row = $(row);

      // Check for date separator (day row)
      const dayCell = $row.find('.calendar__date, td.calendar__date');
      if (dayCell.length > 0) {
        const dateText = dayCell.text().trim();
        // Try to parse date like "Jul 04" or "Friday July 04"
        const match = dateText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{1,2})/i);
        if (match) {
          const monthMap = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
          const monthNum = monthMap[match[1].toLowerCase()];
          const dayNum = match[2].padStart(2, '0');
          const year = now.getUTCFullYear();
          currentDate = `${year}-${monthNum}-${dayNum}`;
        }
        return;
      }

      // Skip if no date set or if date is outside this week
      if (!currentDate) return;

      // Check if this row has event data
      const timeEl = $row.find('.calendar__time, td.time');
      const currencyEl = $row.find('.calendar__currency, td.currency');
      const impactEl = $row.find('.calendar__impact, td.sentiment');
      const eventEl = $row.find('.calendar__event, td.event');
      const actualEl = $row.find('.calendar__actual, td.actual');
      const forecastEl = $row.find('.calendar__forecast, td.forecast');
      const previousEl = $row.find('.calendar__previous, td.previous');

      if (eventEl.length === 0) return;

      const time = timeEl.text().trim();
      const currency = currencyEl.text().trim();
      const impactIcon = impactEl.find('i').attr('class') || impactEl.find('[class*="impact"]').attr('class') || '';
      const impactTier = mapImpact(impactIcon);
      const eventNameRaw = eventEl.text().trim();
      const actual = parseNumber(actualEl.text());
      const consensus = parseNumber(forecastEl.text());
      const previous = parseNumber(previousEl.text());

      // Map to our event name
      const eventNameMapped = EVENT_NAME_MAP[eventNameRaw] || EVENT_NAME_MAP[eventNameRaw.replace(/\s+/g, ' ')] || null;

      eventsFound++;

      // Only process events we track
      if (!eventNameMapped) {
        console.log(`  [SKIP] Unmapped event: "${eventNameRaw}" (${currency})`);
        return;
      }

      console.log(`  [FOUND] ${eventNameMapped} on ${currentDate} - consensus:${consensus} actual:${actual} previous:${previous}`);

      // We'll insert asynchronously after the loop
      releasesInserted++;
      // Use a promise that we'll await later
      pool.query(
        `SELECT id FROM economic_events WHERE event_name = $1 AND $2 = ANY(affected_symbols)`,
        [eventNameMapped, currency]
      ).then(({ rows }) => {
        if (rows.length === 0) {
          // Try without currency match
          return pool.query(
            `SELECT id FROM economic_events WHERE event_name = $1 LIMIT 1`,
            [eventNameMapped]
          );
        }
        return rows;
      }).then(({ rows }) => {
        if (rows.length === 0) {
          console.log(`  [WARN] No matching event for: ${eventNameMapped}`);
          return;
        }

        const eventId = rows[0].id;
        const surprisePct = (consensus && consensus !== 0 && actual !== null)
          ? ((actual - consensus) / Math.abs(consensus))
          : null;

        return pool.query(
          `INSERT INTO event_releases (event_id, release_date, consensus, previous, actual, surprise_pct)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [eventId, currentDate, consensus, previous, actual, surprisePct]
        ).then(() => {
          console.log(`  [OK] Inserted release: ${eventNameMapped} on ${currentDate}`);
        });
      }).catch(err => {
        console.error(`  [ERR] ${eventNameMapped}: ${err.message}`);
      });
    });

    // If FF scraping fails or returns empty, generate from economic_events schedule
    if (eventsFound === 0) {
      console.log('[INFO] No FF events found (likely blocked). Generating from schedule...');
      await generateFromSchedule(weekStart);
    } else {
      console.log(`[DONE] Found ${eventsFound} events, ${releasesInserted} mapped to DB`);
    }

    // Small delay to let async inserts finish
    await new Promise(r => setTimeout(r, 2000));

  } catch (err) {
    console.error(`[ERROR] FF scrape failed: ${err.message}`);
    console.log('[INFO] Falling back to schedule-based generation...');
    await generateFromSchedule(weekStart);
  }

  console.log(`[${new Date().toISOString()}] Scrape complete.`);
  await pool.end();
}

// Generate event_releases from economic_events schedule (fallback)
async function generateFromSchedule(weekStart) {
  const eventsRes = await pool.query('SELECT * FROM economic_events');
  const events = eventsRes.rows;

  const dayMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
  const monday = new Date(weekStart + 'T00:00:00Z');

  let inserted = 0;

  for (const event of events) {
    if (!event.release_day || !event.release_time_utc) continue;

    const dow = dayMap[event.release_day?.toLowerCase()];
    if (!dow || dow < 1 || dow > 5) continue;

    const eventDate = new Date(monday);
    eventDate.setUTCDate(monday.getUTCDate() + (dow - 1));
    const dateStr = eventDate.toISOString().split('T')[0];

    // Check if release already exists
    const exists = await pool.query(
      `SELECT 1 FROM event_releases WHERE event_id = $1 AND release_date = $2`,
      [event.id, dateStr]
    );

    if (exists.rows.length > 0) continue;

    // Get previous value from most recent release
    const prevRes = await pool.query(
      `SELECT actual FROM event_releases WHERE event_id = $1 ORDER BY release_date DESC LIMIT 1`,
      [event.id]
    );
    const previous = prevRes.rows.length > 0 ? prevRes.rows[0].actual : null;

    // Insert schedule entry (no actual/consensus yet — those come from FF or manual)
    // We'll set consensus to null for now since we can't generate it
    await pool.query(
      `INSERT INTO event_releases (event_id, release_date, consensus, previous)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [event.id, dateStr, null, previous]
    );

    inserted++;
    console.log(`  [SCHEDULE] ${event.event_name} → ${dateStr}`);
  }

  console.log(`[SCHEDULE] Generated ${inserted} scheduled releases for week ${weekStart}`);
}

scrapeForexFactory().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
