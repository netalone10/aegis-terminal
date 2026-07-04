#!/usr/bin/env node
/**
 * Macro Indicator Scraper
 * Uses Firecrawl API to scrape Yahoo Finance and FRED for macro data,
 * stores results in PostgreSQL macro_values table.
 */

const { Pool } = require('pg');

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || 'fc-3673cb1426994104a857455bd3b61a7c';
const FIRECRAWL_URL = 'https://api.firecrawl.dev/v2/scrape';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'aegis',
  password: 'aegis_terminal_2026',
  database: 'aegis_terminal',
  max: 5,
});

// Yahoo symbols mapping
const YAHOO_SYMBOLS = {
  VIX: '^VIX',
  DXY: 'DX-Y.NYB',
  GOLD: 'GC=F',
  WTI: 'CL=F',
  SPX: '^GSPC',
};

// FRED series mapping
const FRED_SERIES = {
  CPI: 'CPIAUCSL',
  UNRATE: 'UNRATE',
  FEDFUNDS: 'FEDFUNDS',
  GDP: 'GDP',
  PMI: 'MANEMP',
  DGS10: 'DGS10',
};

// URL templates
function yahooUrl(symbol) {
  return `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`;
}

function fredUrl(series) {
  return `https://fred.stlouisfed.org/series/${series}`;
}

// Firecrawl scrape
async function firecrawlScrape(url) {
  const res = await fetch(FIRECRAWL_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      waitFor: 5000,
      onlyMainContent: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  if (!json.success) {
    throw new Error(`Firecrawl failed: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json.data.markdown || '';
}

// Parse Yahoo Finance markdown to extract current price
function parseYahooMarkdown(markdown, indicator) {
  // Look for price patterns like "XX.XX" near the symbol or "Previous Close"
  // Yahoo pages have the price prominently displayed
  const lines = markdown.split('\n');
  let price = null;

  // Strategy 1: Look for standalone price numbers (large numbers for index/commodity)
  for (const line of lines) {
    const trimmed = line.trim();
    // Match lines that are just a number (price)
    if (/^\d{1,6}(,\d{3})*\.?\d{0,4}$/.test(trimmed)) {
      const val = parseFloat(trimmed.replace(/,/g, ''));
      if (val > 0) {
        price = val;
        break;
      }
    }
  }

  // Strategy 2: Look for "Previous Close" pattern and extract nearby number
  if (!price) {
    for (let i = 0; i < lines.length; i++) {
      if (/previous\s*close/i.test(lines[i])) {
        for (let j = i - 3; j <= i + 3 && j < lines.length; j++) {
          if (j < 0) continue;
          const m = lines[j].match(/(\d{1,6}(,\d{3})*\.?\d{0,4})/);
          if (m) {
            price = parseFloat(m[1].replace(/,/g, ''));
            if (price > 0) break;
          }
        }
        if (price) break;
      }
    }
  }

  // Strategy 3: Look for any significant number after "regularMarketPrice" or in table
  if (!price) {
    for (const line of lines) {
      const m = line.match(/(?:regular\s*market|last|current|price)[^\d]*(\d{1,6}(,\d{3})*\.?\d{0,4})/i);
      if (m) {
        price = parseFloat(m[1].replace(/,/g, ''));
        if (price > 0) break;
      }
    }
  }

  return price;
}

// Parse FRED markdown to extract latest value
// FRED pages have format like "May 2026: 333.979" and table rows "May 2026: | 333.979 |"
function parseFredMarkdown(markdown, series) {
  const lines = markdown.split('\n');
  let value = null;

  // Strategy 1: Look for "Mon YYYY: <value>" pattern (FRED's observation format)
  for (const line of lines) {
    const m = line.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s*:\s*([\d,]+\.?\d*)/i);
    if (m) {
      value = parseFloat(m[2].replace(/,/g, ''));
      if (value > 0) break;
    }
  }

  // Strategy 2: Look for "Qn YYYY: <value>" (quarterly, e.g. GDP)
  if (!value) {
    for (const line of lines) {
      const m = line.match(/\bQ[1-4]\s+\d{4}\s*:\s*([\d,]+\.?\d*)/i);
      if (m) {
        value = parseFloat(m[1].replace(/,/g, ''));
        if (value > 0) break;
      }
    }
  }

  // Strategy 3: Look for "YYYY-MM-DD: <value>" (daily, e.g. DGS10)
  if (!value) {
    for (const line of lines) {
      const m = line.match(/\b(\d{4}-\d{2}-\d{2})\s*:\s*([\d,]+\.?\d*)/);
      if (m) {
        value = parseFloat(m[2].replace(/,/g, ''));
        if (value > 0) break;
      }
    }
  }

  // Strategy 4: Look for table row "| Mon YYYY: | <value> |"
  if (!value) {
    for (const line of lines) {
      const m = line.match(/\|\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s*:\s*\|\s*([\d,]+\.?\d*)\s*\|/i);
      if (m) {
        value = parseFloat(m[2].replace(/,/g, ''));
        if (value > 0) break;
      }
    }
  }

  // Strategy 5: Look for table row "| Qn YYYY: | <value> |"
  if (!value) {
    for (const line of lines) {
      const m = line.match(/\|\s*Q[1-4]\s+\d{4}\s*:\s*\|\s*([\d,]+\.?\d*)\s*\|/i);
      if (m) {
        value = parseFloat(m[1].replace(/,/g, ''));
        if (value > 0) break;
      }
    }
  }

  // Strategy 6: Look for table row "| YYYY-MM-DD: | <value> |"
  if (!value) {
    for (const line of lines) {
      const m = line.match(/\|\s*(\d{4}-\d{2}-\d{2})\s*:\s*\|\s*([\d,]+\.?\d*)\s*\|/);
      if (m) {
        value = parseFloat(m[2].replace(/,/g, ''));
        if (value > 0) break;
      }
    }
  }

  // Strategy 7: Look for "observed value: XX" or "as of YYYY"
  if (!value) {
    for (const line of lines) {
      const m = line.match(/(?:observed|latest|current|value)[^\d-]*(-?\d{1,6}\.?\d{0,6})/i);
      if (m) {
        value = parseFloat(m[1]);
        if (value > 0) break;
      }
    }
  }

  return value;
}

// Sleep helper
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Main
async function main() {
  const client = await pool.connect();
  try {
    // Get all enabled indicators
    const { rows: indicators } = await client.query(
      'SELECT id, indicator, label, source FROM macro_indicators WHERE enabled = true ORDER BY display_order'
    );
    console.log(`Found ${indicators.length} enabled indicators`);

    const today = new Date().toISOString().split('T')[0];
    let scraped = 0;
    let failed = 0;

    for (const ind of indicators) {
      const { indicator, source } = ind;
      let url, value = null;

      try {
        if (source === 'yahoo') {
          const symbol = YAHOO_SYMBOLS[indicator];
          if (!symbol) {
            console.warn(`No Yahoo symbol for ${indicator}, skipping`);
            failed++;
            continue;
          }
          url = yahooUrl(symbol);
          console.log(`Scraping Yahoo: ${indicator} (${symbol})...`);
        } else if (source === 'fred') {
          const series = FRED_SERIES[indicator];
          if (!series) {
            console.warn(`No FRED series for ${indicator}, skipping`);
            failed++;
            continue;
          }
          url = fredUrl(series);
          console.log(`Scraping FRED: ${indicator} (${series})...`);
        } else {
          console.warn(`Unknown source "${source}" for ${indicator}, skipping`);
          failed++;
          continue;
        }

        const markdown = await firecrawlScrape(url);

        if (source === 'yahoo') {
          value = parseYahooMarkdown(markdown, indicator);
        } else {
          value = parseFredMarkdown(markdown, indicator);
        }

        if (value === null || isNaN(value)) {
          console.warn(`  Could not parse value for ${indicator} from markdown (length=${markdown.length})`);
          // Save raw snippet for debugging
          const snippet = markdown.slice(0, 500).replace(/\n/g, ' ');
          console.warn(`  Markdown snippet: ${snippet}`);
          failed++;
          continue;
        }

        // Get previous value
        const prevResult = await client.query(
          'SELECT value FROM macro_values WHERE indicator_id = $1 ORDER BY date DESC LIMIT 1',
          [ind.id]
        );
        const prevValue = prevResult.rows.length > 0 ? Number(prevResult.rows[0].value) : null;

        const changePct = prevValue && prevValue !== 0
          ? ((value - prevValue) / prevValue * 100)
          : null;

        // UPSERT
        await client.query(
          `INSERT INTO macro_values (indicator_id, date, value, prev_value, change_pct)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (indicator_id, date)
           DO UPDATE SET value = $3, prev_value = $4, change_pct = $5`,
          [ind.id, today, value, prevValue, changePct !== null ? Math.round(changePct * 100) / 100 : null]
        );

        console.log(`  ✓ ${indicator}: ${value} (prev: ${prevValue ?? 'N/A'}, chg: ${changePct !== null ? Math.round(changePct * 100) / 100 + '%' : 'N/A'})`);
        scraped++;
      } catch (err) {
        console.error(`  ✗ ${indicator}: ${err.message}`);
        failed++;
      }

      // Rate limit: 2s between requests
      await sleep(2000);
    }

    console.log(`\nDone. Scraped: ${scraped}, Failed: ${failed}, Total: ${indicators.length}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
