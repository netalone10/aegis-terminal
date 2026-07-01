import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, Wifi, WifiOff } from 'lucide-react'
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import { api } from '../../lib/api'

const SYMBOLS = ['XAUUSD.vxc']
const TIMEFRAMES = ['M5', 'M15', 'H1', 'H4', 'D1']

interface PriceTick {
  symbol: string
  bid: number
  ask: number
  spread: number
  time: string
}

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface CandlesResponse {
  symbol: string
  timeframe: string
  count: number
  candles: Candle[]
}

interface Indicators {
  ema20: number
  ema50: number
  rsi: number
  atr: number
}

export default function MT5Live() {
  const [symbol, setSymbol] = useState('XAUUSD.vxc')
  const [timeframe, setTimeframe] = useState('H1')
  const [prevBid, setPrevBid] = useState<number | null>(null)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<SeriesType> | null>(null)
  const volumeRef = useRef<ISeriesApi<SeriesType> | null>(null)

  // Live price — refetch every 5s
  const { data: price, isSuccess: priceOk, isError: priceErr } = useQuery<PriceTick>({
    queryKey: ['mt5-price', symbol],
    queryFn: () => api<PriceTick>(`/api/mt5/price?symbol=${symbol}`),
    refetchInterval: 5000,
    retry: 2,
  })

  // Candles — refetch every 30s
  const { data: candleResp } = useQuery<CandlesResponse>({
    queryKey: ['mt5-candles', symbol, timeframe],
    queryFn: () => api<CandlesResponse>(`/api/mt5/candles?symbol=${symbol}&timeframe=${timeframe}&count=100`),
    refetchInterval: 30_000,
    retry: 2,
  })

  // Indicators — refetch every 30s
  const { data: indicators } = useQuery<Indicators>({
    queryKey: ['mt5-indicators', symbol, timeframe],
    queryFn: () => api<Indicators>(`/api/mt5/indicators?symbol=${symbol}&timeframe=${timeframe}`),
    refetchInterval: 30_000,
    retry: 2,
  })

  // Flash animation on price change
  useEffect(() => {
    if (!price) return
    if (prevBid !== null && price.bid !== prevBid) {
      setFlash(price.bid > prevBid ? 'up' : 'down')
      const t = setTimeout(() => setFlash(null), 600)
      return () => clearTimeout(t)
    }
    setPrevBid(price.bid)
  }, [price?.bid])

  // Create chart on mount
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#0a0a0a' }, textColor: '#9b9b9b' },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: { mode: 0 },
      timeScale: { borderColor: '#2b2b2b', timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: '#2b2b2b' },
      autoSize: true,
    })

    chartRef.current = chart

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#46c97f',
      downColor: '#ff4d4f',
      borderUpColor: '#46c97f',
      borderDownColor: '#ff4d4f',
      wickUpColor: '#46c97f',
      wickDownColor: '#ff4d4f',
    })
    candleRef.current = candleSeries

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    })
    volumeRef.current = volumeSeries

    return () => {
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      volumeRef.current = null
    }
  }, [])

  // Update candle data
  useEffect(() => {
    if (!candleResp?.candles || !candleRef.current || !volumeRef.current) return

    const sorted = [...candleResp.candles].sort((a, b) => a.time - b.time)
    const candleData = sorted.map(c => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }))
    const volData = sorted.map(c => ({
      time: c.time as any,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(70,201,127,0.3)' : 'rgba(255,77,79,0.3)',
    }))

    candleRef.current.setData(candleData)
    volumeRef.current.setData(volData)
    chartRef.current?.timeScale().fitContent()
  }, [candleResp])

  const connected = priceOk && !priceErr
  const spreadColor = price
    ? price.spread < 30 ? 'var(--kt-up)' : price.spread <= 50 ? 'var(--kt-gold)' : 'var(--kt-dn)'
    : 'var(--kt-muted)'

  const rsiColor = indicators
    ? indicators.rsi > 70 ? 'var(--kt-dn)' : indicators.rsi < 30 ? 'var(--kt-up)' : 'var(--kt-text)'
    : 'var(--kt-muted)'

  const emaColor = indicators
    ? indicators.ema20 > indicators.ema50 ? 'var(--kt-up)' : 'var(--kt-dn)'
    : 'var(--kt-muted)'

  const lastCandleTime = candleResp?.candles?.length
    ? new Date(candleResp.candles[candleResp.candles.length - 1].time * 1000).toLocaleString()
    : '—'

  return (
    <div>
      {/* Header */}
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Broker Feed</div>
          <h1>MT5 Live — Valetax</h1>
          <p>Real-time broker data via MetaTrader 5</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
          {connected ? (
            <span className="badge-bull" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wifi size={12} /> Connected
            </span>
          ) : (
            <span className="badge-bear" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <WifiOff size={12} /> Disconnected
            </span>
          )}
        </div>
      </div>

      {/* Symbol + Timeframe Bar */}
      <div className="kt-card" style={{ marginBottom: 16 }}>
        <div className="kt-card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <select
            className="kt-input"
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            style={{ width: 180 }}
          >
            {SYMBOLS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 4 }}>
            {TIMEFRAMES.map(tf => (
              <button
                key={tf}
                className={`kt-tag ${timeframe === tf ? 'gold' : ''}`}
                onClick={() => setTimeframe(tf)}
                style={{ cursor: 'pointer', minWidth: 36, justifyContent: 'center' }}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live Price Card */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={16} style={{ color: 'var(--kt-gold)' }} />
            <span style={{ color: 'var(--kt-text)', fontWeight: 600 }}>Live Price</span>
          </div>
          {price && (
            <span style={{ color: 'var(--kt-dim)', fontSize: 'var(--xs)' }}>
              {price.time}
            </span>
          )}
        </div>
        <div style={{ padding: 18 }}>
          {price ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 32, flexWrap: 'wrap' }}>
              <div>
                <div className="kt-stat-label">Symbol</div>
                <div style={{ color: 'var(--kt-gold)', fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {price.symbol}
                </div>
              </div>
              <div>
                <div className="kt-stat-label">Bid</div>
                <div
                  className="mono"
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: flash === 'up' ? 'var(--kt-up)' : flash === 'down' ? 'var(--kt-dn)' : 'var(--kt-text)',
                    transition: 'color 0.3s',
                  }}
                >
                  {price.bid.toFixed(symbol.includes('JPY') ? 3 : 2)}
                </div>
              </div>
              <div>
                <div className="kt-stat-label">Ask</div>
                <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--kt-text)' }}>
                  {price.ask.toFixed(symbol.includes('JPY') ? 3 : 2)}
                </div>
              </div>
              <div>
                <div className="kt-stat-label">Spread</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: spreadColor }}>
                  {price.spread} pts
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--kt-muted)', fontSize: 'var(--sm)' }}>
              {priceErr ? 'Failed to connect to MT5 feed.' : 'Loading price data…'}
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={16} style={{ color: 'var(--kt-gold)' }} />
            <span className="mono" style={{ color: 'var(--kt-text)', fontWeight: 600 }}>{symbol}</span>
            <span className="kt-tag gold">{timeframe}</span>
          </div>
          <span style={{ color: 'var(--kt-dim)', fontSize: 'var(--xs)', letterSpacing: 1.6, textTransform: 'uppercase' }}>
            {candleResp ? `${candleResp.count} candles` : 'Loading…'}
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <div ref={containerRef} style={{ width: '100%', height: 480 }} />
        </div>
      </div>

      {/* Indicators */}
      <div className="kt-panel" style={{ marginBottom: 16 }}>
        <div className="kt-panel-head">
          <span style={{ color: 'var(--kt-text)', fontWeight: 600 }}>Indicators</span>
          <span className="kt-tag gold">{timeframe}</span>
        </div>
        <div className="kt-stat-grid kt-stat-grid-4">
          <div className="kt-stat">
            <div className="kt-stat-label">EMA 20</div>
            <div className="kt-stat-value mono" style={{ color: emaColor }}>
              {indicators?.ema20?.toFixed(2) ?? '—'}
            </div>
          </div>
          <div className="kt-stat">
            <div className="kt-stat-label">EMA 50</div>
            <div className="kt-stat-value mono" style={{ color: emaColor }}>
              {indicators?.ema50?.toFixed(2) ?? '—'}
            </div>
          </div>
          <div className="kt-stat">
            <div className="kt-stat-label">RSI</div>
            <div className="kt-stat-value mono" style={{ color: rsiColor }}>
              {indicators?.rsi?.toFixed(1) ?? '—'}
            </div>
          </div>
          <div className="kt-stat">
            <div className="kt-stat-label">ATR</div>
            <div className="kt-stat-value mono">
              {indicators?.atr?.toFixed(2) ?? '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Connection Status */}
      <div className="kt-panel">
        <div className="kt-panel-head">
          <span style={{ color: 'var(--kt-text)', fontWeight: 600 }}>Connection Details</span>
        </div>
        <div className="kt-stat-grid kt-stat-grid-4">
          <div className="kt-stat">
            <div className="kt-stat-label">Account</div>
            <div className="kt-stat-value mono">Valetax (2171080308)</div>
          </div>
          <div className="kt-stat">
            <div className="kt-stat-label">Server</div>
            <div className="kt-stat-value mono">ValetaxIntl-Live7</div>
          </div>
          <div className="kt-stat">
            <div className="kt-stat-label">Data Source</div>
            <div className="kt-stat-value mono" style={{ fontSize: 12 }}>CF Tunnel</div>
          </div>
          <div className="kt-stat">
            <div className="kt-stat-label">Last Candle</div>
            <div className="kt-stat-value mono" style={{ fontSize: 12 }}>{lastCandleTime}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
