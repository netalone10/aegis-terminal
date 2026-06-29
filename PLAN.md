# Aegis Terminal — Build Plan

## Overview
Trading terminal deployed on Cloudflare (Pages + Workers + D1 + KV).
Domain: aegisterminal.app

## Phase 1: P0 Core (NOW)

### 1. CF Worker API (`/root/aegis-terminal/worker/`)
Single worker handling all API routes:

```
/api/health          → health check
/api/market/overview → global indices, forex, crypto via TradingView Scanner
/api/market/quote/:symbol → single quote via Yahoo Finance
/api/idx/scanner     → IDX stock scanner (Aegis Fund 12 filters)
/api/screener        → multi-exchange screener
/api/analysis/:symbol → TA analysis (RSI, MACD, BB, etc)
/api/news            → RSS feed aggregation
```

Data sources (all HTTP, zero Playwright):
- TradingView Scanner API: https://scanner.tradingview.com/indonesia/scan
- Yahoo Finance: https://query1.finance.yahoo.com/v8/finance/chart/
- RSS feeds for news

Storage:
- KV: market data cache (TTL 30s-5min)
- D1: positions, journal entries (later)

Tech: CF Worker (JavaScript/TypeScript), wrangler.toml

### 2. Frontend (`/root/aegis-terminal/frontend/`)
Vite + React 19 + TypeScript + Tailwind CSS 4

Components:
- Shell: sidebar nav, dark theme, ticker bar
- MarketOverview: global indices table, forex, crypto
- IDXScreener: Aegis Fund 12 filter screener
- Chart: TradingView Lightweight Charts embed
- News: RSS feed display

Design: Dark theme, terminal-style (think Bloomberg/Kuantara)

### 3. Deploy
- Frontend: CF Pages (aegisterminal.app)
- Worker: CF Worker (aegisterminal.app/api/*)
- Route: worker handles /api/*, pages handles /*

## Phase 2: P1 (LATER)
- Portfolio monitor
- AI analysis (Groq)
- Macro regime
- Bandarmologi
- Alert system

## TradingView MCP Integration
MCP tools run on VPS via Hermes. Worker can proxy to VPS for:
- Backtest results
- Multi-timeframe analysis
- Sentiment analysis
- Walk-forward validation

VPS endpoint: internal HTTP call to Hermes gateway
Alerts: Hermes cron → MCP tools → Telegram

## Config
- Cloudflare Account: 79fdd818525ef00a96d4437a45f0baf6
- Domain: aegisterminal.app
- Existing: tempmail-worker (keep running)
