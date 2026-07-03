# Plan: MT5 Backend Engine untuk Aegis Terminal

## Problem
Yahoo Finance rate-limited (429), gak reliable buat real-time candle history.
TradingView MCP tools gak support forex/CFD.
TradingView scanner cuma kasih 1 candle per request (latest), bukan history.

## Solution
Pakai MT5 (MetaTrader 5) yang running di VPS SG2 (129.226.151.57) sebagai backend data engine. MT5 connect langsung ke broker (Valetax) — data real-time, no rate limits, candle history unlimited.

## Architecture

```
Browser → aegisterminal.app (CF Pages)
              ↓
         CF Worker API (aegis-terminal-api.akbar-rm10.workers.dev)
              ↓
         VPS SG2 — MT5 API Service (Flask/FastAPI)
              ↓
         MetaTrader 5 Terminal (Valetax Live5)
              ↓
         Broker Server (Valetax)
```

## Components

### 1. MT5 Terminal (VPS SG2)
- Install MT5 Linux (native, no Wine needed since build 2340)
- Login ke Valetax Live5 account ($188)
- Run as background service (systemd)
- Symbol: XAUUSD, juga bisa EURUSD, GBPUSD, dll

### 2. MT5 API Service (VPS SG2)
Flask/FastAPI service yang wrap MT5 Python API jadi HTTP endpoints.

**Stack:** FastAPI + `MetaTrader5` Python package + uvicorn

**Endpoints:**
```
GET /api/mt5/candles?symbol=XAUUSD&timeframe=H1&count=50
  → Returns: [{time, open, high, low, close, volume}, ...]

GET /api/mt5/price?symbol=XAUUSD
  → Returns: {bid, ask, spread, time}

GET /api/mt5/indicators?symbol=XAUUSD&timeframe=H1
  → Returns: {ema20, ema50, sma200, rsi, atr, macd}

GET /api/mt5/health
  → Returns: {status, connected, account, symbols}
```

**Port:** 8443 (HTTPS with self-signed cert, or behind nginx)

**Auth:** Simple API key in header (`X-API-Key: <secret>`)

**Deployment:** systemd service, auto-restart

### 3. CF Worker Update
Replace `fetchOHLCV()` (Yahoo Finance) dengan call ke VPS SG2 MT5 API.

```typescript
// New fetchOHLCV — calls MT5 API instead of Yahoo
async function fetchOHLCV(symbol: string, tf: string, limit: number = 50): Promise<any[]> {
  const res = await fetch(`https://129.226.151.57:8443/api/mt5/candles?symbol=${symbol}&timeframe=${tf}&count=${limit}`, {
    headers: { 'X-API-Key': env.MT5_API_KEY },
  });
  if (!res.ok) return [];
  return res.json();
}
```

Keep TradingView scanner sebagai fallback buat indicators (EMA/RSI/ATR) kalau MT5 down.

### 4. Security
- MT5 API service hanya listen di 0.0.0.0:8443
- API key authentication
- UFW: open port 8443 only
- CF Worker → VPS SG2: HTTPS with API key
- VPS SG2: MT5 account credentials stored in .env, not in code

## Implementation Steps

### Phase 1: MT5 Setup di VPS SG2 (~30 min)
1. Install MT5 Linux terminal
2. Download & install Valetax Live5 platform
3. Login dengan account credentials
4. Verify connection: `mt5.initialize()` + `mt5.account_info()`
5. Test symbol: `mt5.copy_rates_from_pos("XAUUSD", mt5.TIMEFRAME_H1, 0, 50)`
6. Create systemd service supaya MT5 auto-start

### Phase 2: API Service (~45 min)
1. Install deps: `pip install MetaTrader5 fastapi uvicorn`
2. Create `/opt/mt5-api/main.py` — FastAPI app
3. Endpoints: /candles, /price, /indicators, /health
4. API key auth middleware
5. systemd service: `mt5-api.service`
6. UFW: `ufw allow 8443`
7. Test: `curl https://129.226.151.57:8443/api/mt5/health`

### Phase 3: CF Worker Integration (~30 min)
1. Add `MT5_API_KEY` to CF Worker secrets
2. Update `fetchOHLCV()` — try MT5 first, fallback to Yahoo
3. Update `getMultiTFData()` — parallel fetch from MT5 + scanner
4. Deploy worker
5. Test: `/api/analysis/narrative?symbol=XAUUSD&tf=4h`

### Phase 4: Additional Features (~future)
- Trade execution endpoints (open/close/modify positions)
- Real-time tick data streaming (WebSocket)
- Account P&L dashboard
- Multi-symbol support (EURUSD, GBPUSD, etc.)

## Advantages vs Current Setup

| Aspect | Current (Yahoo + Scanner) | MT5 Backend |
|--------|--------------------------|-------------|
| Candle history | Yahoo (rate-limited, 429) | Unlimited, direct broker |
| Data accuracy | Delayed/different prices | Exact broker prices |
| Indicators | Scanner (EMA/RSI/ATR) | MT5 built-in (same) |
| Trade execution | ❌ Not possible | ✅ Same source |
| Tick data | ❌ | ✅ Available |
| Reliability | Yahoo can block anytime | Always connected |
| Cost | Free | Free (already paying broker) |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| MT5 disconnection | Auto-reconnect in service, health check |
| VPS SG2 downtime | Fallback to Yahoo + scanner |
| API service crash | systemd auto-restart, health monitoring |
| Security (API exposed) | API key + UFW + rate limiting |
| MT5 account logout | Store credentials in .env, auto-login on restart |

## Dependencies
- MetaTrader 5 Linux terminal (free download)
- `MetaTrader5` Python package
- Valetax Live5 account credentials
- VPS SG2 (already available)

## Estimated Time
- Phase 1: 30 min
- Phase 2: 45 min
- Phase 3: 30 min
- **Total: ~2 hours**

## Out of Scope (for now)
- Trade execution from Aegis Terminal UI
- WebSocket streaming
- Multi-account support
- Historical data backfill beyond MT5 default
