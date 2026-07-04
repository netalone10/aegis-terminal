# Task 2 Report: Macro Indicator Scraper

**Status:** ✅ Complete  
**Date:** 2026-07-04

## What Was Done

Created and deployed `vps-api/scrape-macro.js` — a Node.js scraper that uses Firecrawl API to fetch macro economic data from Yahoo Finance and FRED, parsing markdown responses and upserting values into PostgreSQL `macro_values` table.

## Files Created/Modified

| File | Location | Description |
|------|----------|-------------|
| `scrape-macro.js` | Local + VPS (`vps-api/`) | Main scraper script |
| `run-macro-scrape.sh` | Local + VPS (`vps-api/`) | Cron wrapper script |

## Indicators Scraped (11 total)

| Indicator | Source | Value | Unit |
|-----------|--------|-------|------|
| CPI | FRED (CPIAUCSL) | 333.979 | % (Index 1982-84=100) |
| UNRATE | FRED (UNRATE) | 4.2 | % |
| FEDFUNDS | FRED (FEDFUNDS) | 3.63 | % |
| GDP | FRED (GDP) | 31,865.721 | Billions USD |
| PMI | FRED (MANEMP) | 12,598 | Thousands of persons |
| VIX | Yahoo (^VIX) | 16.15 | index |
| DGS10 | FRED (DGS10) | 4.48 | % |
| DXY | Yahoo (DX-Y.NYB) | 100.86 | index |
| GOLD | Yahoo (GC=F) | 4,125.70 | USD |
| WTI | Yahoo (CL=F) | 68.69 | USD |
| SPX | Yahoo (^GSPC) | 7,483.23 | points |

## Cron Schedule

```
0 */6 * * * FIRECRAWL_API_KEY=fc-... /home/ubuntu/projects/aegis-terminal/vps-api/run-macro-scrape.sh
```

Runs every 6 hours. Logs to `/tmp/macro-scrape.log`.

## Technical Notes

- **FRED parsing** required 7 strategies due to different date formats across series:
  - Monthly: `May 2026: 333.979` (CPI, UNRATE, FEDFUNDS, PMI)
  - Quarterly: `Q1 2026: 31,865.721` (GDP)
  - Daily: `2026-07-01: 4.48` (DGS10)
- **Yahoo parsing** extracts price from standalone numeric lines or "Previous Close" context
- 2-second delay between requests for rate limiting
- UPSERT handles both insert and update on conflict (indicator_id, date)

## Concerns

1. **PMI label mismatch**: The `macro_indicators` table labels indicator "PMI" as "ISM Manufacturing PMI" but maps to FRED series MANEMP ("All Employees, Manufacturing"). These are different metrics. Consider renaming to "Manufacturing Employment" or changing the FRED series to an actual PMI proxy (e.g., `NAPM`).
2. **CPI unit**: Labeled as "%" but actual value is index (333.979). The unit should be "index" or the data should be pre-processed to YoY% change.
3. **First-run change_pct**: Since no historical data existed, all change_pct values are 0. Next scrape cycle will show meaningful changes.
