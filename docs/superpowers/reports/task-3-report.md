# Task 3: Macro API Endpoints

## Summary

Added 4 macro dashboard API endpoints to VPS server.js (`/home/ubuntu/projects/aegis-terminal/vps-api/server.js`). All endpoints verified working in production.

## What Was Done

1. **Read server.js** on VPS to find insertion point (after PHASE 5: FUNDAMENTAL ENGINE, before SMT ENGINE)
2. **Inserted 4 endpoints** at line 1156, under new `// PHASE 6: MACRO DASHBOARD` section
3. **Renumbered phases**: SMT → PHASE 7, Unified Signal → PHASE 8
4. **Restarted systemd service** `aegis-pg-api`
5. **Tested all 4 endpoints** via production URL

## Endpoints Added

| Endpoint | Purpose | Test Result |
|----------|---------|-------------|
| `GET /api/macro/latest` | Latest value for each enabled indicator | ✅ Returns CPI, UNRATE, FEDFUNDS, GDP, PMI, VIX, DXY, etc. |
| `GET /api/macro/sparkline?indicator=VIX&range=1y` | Time series for sparkline chart | ✅ Returns `{indicator, label, unit, series}` |
| `GET /api/macro/history?indicator=CPI&limit=100` | Historical data table | ✅ Returns `{indicator, label, unit, records}` |
| `GET /api/macro/config` | Enabled indicators list | ✅ Returns all indicators with metadata |

## Test Output Snapshots

### /api/macro/latest
```json
{
  "status": "ok",
  "data": [
    {"indicator":"CPI","label":"CPI Index","category":"inflation","unit":"index","value":"333.979","prevValue":"333.979","changePct":"0","date":"2026-07-03T16:00:00.000Z"},
    {"indicator":"UNRATE","label":"Unemployment Rate","category":"employment","unit":"%","value":"4.2","prevValue":"4.2","changePct":"0","date":"2026-07-03T16:00:00.000Z"},
    {"indicator":"FEDFUNDS","label":"Fed Funds Rate","category":"rates","unit":"%","value":"3.63","prevValue":"3.63","changePct":"0","date":"2026-07-03T16:00:00.000Z"}
  ]
}
```

### /api/macro/sparkline?indicator=VIX&range=1y
```json
{
  "status": "ok",
  "data": {
    "indicator": "VIX",
    "label": "VIX",
    "unit": "index",
    "series": [{"date":"2026-07-03T16:00:00.000Z","value":"16.15"}]
  }
}
```

### /api/macro/history?indicator=CPI
```json
{
  "status": "ok",
  "data": {
    "indicator": "CPI",
    "label": "CPI Index",
    "unit": "index",
    "records": [{"date":"2026-07-03T16:00:00.000Z","value":"333.979","prevValue":"333.979","changePct":"0"}]
  }
}
```

### /api/macro/config
```json
{
  "status": "ok",
  "data": [
    {"indicator":"CPI","label":"CPI Index","category":"inflation","unit":"index","enabled":true,"displayOrder":1},
    {"indicator":"UNRATE","label":"Unemployment Rate","category":"employment","unit":"%","enabled":true,"displayOrder":2},
    {"indicator":"FEDFUNDS","label":"Fed Funds Rate","category":"rates","unit":"%","enabled":true,"displayOrder":3},
    {"indicator":"GDP","label":"GDP QoQ%","category":"rates","unit":"%","enabled":true,"displayOrder":4},
    {"indicator":"PMI","label":"ISM Manufacturing PMI","category":"employment","unit":"index","enabled":true,"displayOrder":5},
    {"indicator":"VIX","label":"VIX","category":"sentiment","unit":"index","enabled":true,"displayOrder":6},
    {"indicator":"DXY","label":"US Dollar Index","category":"rates","unit":"index","enabled":true,"displayOrder":7}
  ]
}
```

## File Modified

- `/home/ubuntu/projects/aegis-terminal/vps-api/server.js` — Inserted 74 lines of macro endpoint code between fundamental engine and SMT engine sections

## Issues Encountered

- Initial `sed` insertion corrupted file (inserted garbage throughout). Fixed by `git checkout -- vps-api/server.js` and re-inserting with Python script.
- Phase numbering required manual fix after insertion (SMT → PHASE 7, Unified → PHASE 8)
