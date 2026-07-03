# Aegis Terminal — Page Consolidation Roadmap

## Why

The app has grown to 29 pages/routes. A lot of them show the same underlying data
(bias, confidence, grade, trade setup, macro regime, session stats) in slightly
different layouts, built at different times as separate features. The features
themselves are fine — the problem is fragmentation: the same information is
duplicated across multiple pages instead of being one well-organized view.

This roadmap proposes consolidating 13 overlapping pages into 4 "hub" pages,
keeping every existing feature, just regrouped. Nothing here removes a
capability — it's a reorganization, not a cut.

Current: **29 pages**. Proposed: **15 pages** (~48% fewer navigation entries).

## Proposed structure

### 1. SMC Workbench (replaces: Decision, Screener, Confluence, Structure Map, Scanner)

All five pages show the same core object — a symbol's bias/confidence/levels/trade
setup from `analyzeSMC()` — at different granularities. Consolidate into one page
with a view switcher:

- **Detail view** (was Decision): full per-symbol card — bias, confidence, structure,
  signals, trade setup, meta indicators, 3-timeframe breakdown.
- **Table view** (was Screener + Scanner): sortable/filterable table across all
  symbols × timeframes, grade column, search box, "best setup" pinned row.
- **Ladder view** (was Structure Map): the zone/level visual, symbol-scoped.
- **Confluence tab**: the 3-TF alignment matrix, as a filter/sort dimension on the
  table view rather than a separate page (e.g. "show only strong confluence").

Backend: `/api/smc/analyze/:symbol`, `/api/smc/batch`, `/api/smc/screener`,
`/api/smc/confluence` — no backend changes needed, just one frontend module
consuming all four with tab/view state.

### 2. Macro Dashboard (replaces: Macro, Regime, Central Bank Watch, Rates)

Four pages, all macro/rate context for the same trading decisions. Consolidate
into tabs:

- **Regime & Indicators** (was Macro + Regime) — current regime classification,
  growth/inflation signals, implications for positioning.
- **Rates** (was Rates + Central Bank Watch) — yield curve (2Y–30Y, shape, spreads)
  and CB policy rates/next meeting dates on one page, since they're read together
  in practice (yields move on CB expectations).

Backend: `/api/macro/*` — no changes needed.

### 3. Session Hub (replaces: Kill Zone, Session Analytics, Session Report)

- **Live widget**: current session, time remaining, character (range/manipulation/
  trending), best pairs for this session — always visible at the top.
- **Performance tab** (was Session Analytics): win rate/R:R/PF by session, day-of-
  week heatmap.
- **Snapshot tab** (was Session Report): DXY/XAU/EUR/GBP/JPY/yields snapshot +
  AI-generated regime/bias narrative for the active or selected session.

Backend: `/api/session/*` — no changes needed.

### 4. Analysis Reports (replaces: Narrative Analysis, Trade Plan, Weekly Outlook, Report Archive)

All four are prose/structured-text market reads at different time horizons.
Consolidate into one page with a horizon selector:

- **Daily** (was Trade Plan) — overview, best setup, news callouts, execution checklist.
- **Weekly** (was Weekly Outlook) — pair cards, upcoming calendar events, key levels.
- **Narrative** (was Narrative Analysis) — the prose structure/liquidity/scenario read,
  available as a per-symbol drill-down from either Daily or Weekly.
- **Archive**: a date picker on the same page pulling past snapshots, instead of a
  separate page.

Backend: `/api/plan/*`, `/api/analysis/narrative`, `/api/news/*` — no changes needed.

## Kept as-is (genuinely unique, no overlap)

Chart, Risk Calc, Calendar, Sentiment, Correlation, AI Assistant, Backtest, Market.

## Kept separate but tightened (related, not duplicate)

Trade Manager, Portfolio, Journal — different jobs (entry/edit vs. summary stats vs.
post-trade reflection) on the same underlying positions. Recommend keeping as three
pages but making sure they read from the same data source/hooks so entries made in
Trade Manager show up consistently in Portfolio and can be journaled without
re-entering data.

## Result

| | Before | After |
|---|---|---|
| SMC/Analysis pages | 5 | 1 (with 3 views) |
| Macro pages | 4 | 1 (with 2 tabs) |
| Session pages | 3 | 1 (with 2 tabs + live widget) |
| Report pages | 4 | 1 (with horizon selector) |
| Unique pages | 8 | 8 |
| Trade management | 3 | 3 |
| **Total** | **29** | **~15** |

## Related cleanup (separate from this roadmap, not blocking it)

The backend has 5 near-identical copies of the same TradingView-scanner-fetch
helper across `idx.ts`, `forex.ts`, `market.ts`, `smc.ts`, `session.ts`. Worth
consolidating into one `worker/src/lib/tradingview.ts`, same pattern already
used for `lib/candles.ts`. Flagging here since it surfaced during this audit,
but it's independent of the page consolidation above.

## Explicitly out of scope for this roadmap

Migrating remaining real-time price endpoints (`forex.ts` `/live`/`/ticker`/`/price`,
`session.ts`'s snapshot, `smc.ts`'s current-quote fetch) from TradingView Scanner to
the MT5 bridge — candles are already migrated (see PR #2); the live quote/price
portion is a separate, explicitly deferred follow-up.
