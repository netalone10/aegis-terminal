import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, CandlestickChart, Layers } from 'lucide-react'
import { createChart, CandlestickSeries, HistogramSeries, LineStyle } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import { api } from '../../lib/api'

const TIMEFRAMES = ['1h', '4h', '1D', '1W']

interface OHLCVCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface SMCLevel {
  type: string
  zone: [number, number]
  label: string
  strength: string
}

interface SMCData {
  bias: string
  confidence: number
  levels: SMCLevel[]
}

const ZONE_COLORS: Record<string, { bg: string; border: string }> = {
  bullish_ob:       { bg: 'rgba(70,201,127,0.12)', border: 'rgba(70,201,127,0.4)' },
  bearish_ob:       { bg: 'rgba(255,77,79,0.12)',  border: 'rgba(255,77,79,0.4)' },
  bullish_fvg:      { bg: 'rgba(255,191,0,0.10)',  border: 'rgba(255,191,0,0.35)' },
  bearish_fvg:      { bg: 'rgba(255,77,79,0.08)',  border: 'rgba(255,77,79,0.25)' },
  liquidity_high:   { bg: 'rgba(255,77,79,0.06)',  border: 'rgba(255,77,79,0.5)' },
  liquidity_low:    { bg: 'rgba(70,201,127,0.06)', border: 'rgba(70,201,127,0.5)' },
  equilibrium:      { bg: 'rgba(255,191,0,0.06)',  border: 'rgba(255,191,0,0.3)' },
  fib_618:          { bg: 'rgba(77,148,255,0.06)', border: 'rgba(77,148,255,0.4)' },
  fib_382:          { bg: 'rgba(77,148,255,0.06)', border: 'rgba(77,148,255,0.4)' },
}

export default function Chart() {
  const [symbol, setSymbol] = useState('XAUUSD')
  const [timeframe, setTimeframe] = useState('4h')
  const [showOverlays, setShowOverlays] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<SeriesType> | null>(null)
  const volumeRef = useRef<ISeriesApi<SeriesType> | null>(null)
  const priceLinesRef = useRef<any[]>([])
  const currentPriceRef = useRef<any>(null)

  // Fetch OHLCV — live mode polls every 3s via CF Worker (5s cache TTL)
  const { data: candles } = useQuery<OHLCVCandle[]>({
    queryKey: ['ohlcv', symbol, timeframe],
    queryFn: () => api<OHLCVCandle[]>(`/api/analysis/ohlcv?symbol=${symbol}&interval=${timeframe}&limit=200&live=true`),
    refetchInterval: 3000,
  })

  // Fetch SMC data
  const tfMap: Record<string, string> = { '1h': '1h', '4h': '4h', '1D': '1d', '1W': '1d' }
  const { data: smcBatch } = useQuery<SMCData[]>({
    queryKey: ['smc-batch-chart', tfMap[timeframe]],
    queryFn: () => api<SMCData[]>(`/api/smc/batch?tf=${tfMap[timeframe]}`),
    staleTime: 120_000,
  })

  const smcData = smcBatch?.find((s: any) => s.symbol === symbol || s.symbol?.replace('/', '') === symbol)

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
    if (!candles || !candleRef.current || !volumeRef.current) return

    const sorted = [...candles].sort((a, b) => a.time - b.time)
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

    // Current price line — remove old, create new
    if (currentPriceRef.current) {
      try { candleRef.current.removePriceLine(currentPriceRef.current) } catch {}
      currentPriceRef.current = null
    }
    const last = sorted[sorted.length - 1]
    if (last) {
      currentPriceRef.current = candleRef.current.createPriceLine({
        price: last.close,
        color: last.close >= last.open ? '#46c97f' : '#ff4d4f',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '',
      })
    }

    chartRef.current?.timeScale().fitContent()
  }, [candles])

  // Update SMC overlays
  const updateOverlays = useCallback(() => {
    if (!candleRef.current) return

    // Remove old price lines
    for (const pl of priceLinesRef.current) {
      try { candleRef.current.removePriceLine(pl) } catch {}
    }
    priceLinesRef.current = []

    if (!showOverlays || !smcData?.levels) return

    for (const level of smcData.levels) {
      const colors = ZONE_COLORS[level.type] ?? { border: 'rgba(255,255,255,0.2)' }
      const isZone = level.zone[0] !== level.zone[1]
      const isDashed = level.type.startsWith('fib_') || level.type.includes('liquidity')

      if (isZone) {
        // Draw top and bottom of zone as price lines
        for (const price of level.zone) {
          const pl = candleRef.current.createPriceLine({
            price,
            color: colors.border,
            lineWidth: 1,
            lineStyle: isDashed ? LineStyle.Dashed : LineStyle.Solid,
            axisLabelVisible: true,
            title: level.label,
          })
          priceLinesRef.current.push(pl)
        }
      } else {
        // Single line (equilibrium, fib levels)
        const pl = candleRef.current.createPriceLine({
          price: level.zone[0],
          color: colors.border,
          lineWidth: 1,
          lineStyle: isDashed ? LineStyle.Dashed : LineStyle.Dotted,
          axisLabelVisible: true,
          title: level.label,
        })
        priceLinesRef.current.push(pl)
      }
    }
  }, [smcData, showOverlays])

  useEffect(() => { updateOverlays() }, [updateOverlays])

  return (
    <div>
      {/* Header */}
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Lab Chart</div>
          <h1>Chart</h1>
          <p>Candlestick chart with SMC overlay zones</p>
        </div>
      </div>

      {/* Symbol + Timeframe Bar */}
      <div className="kt-card" style={{ marginBottom: 16 }}>
        <div className="kt-card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '0 0 200px' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--kt-dim)' }} />
            <input
              className="kt-input"
              style={{ width: '100%', paddingLeft: 32 }}
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="Symbol..."
            />
          </div>
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
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className={`kt-tag ${showOverlays ? 'gold' : ''}`}
              onClick={() => setShowOverlays(v => !v)}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Layers size={12} /> SMC
            </button>
            {smcData && (
              <span className={`badge-${smcData.bias === 'bullish' ? 'bull' : smcData.bias === 'bearish' ? 'bear' : 'neutral'}`}>
                {smcData.bias.toUpperCase()} {smcData.confidence}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="kt-panel">
        <div className="kt-panel-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CandlestickChart size={16} style={{ color: 'var(--kt-gold)' }} />
            <span className="mono" style={{ color: 'var(--kt-text)', fontWeight: 600 }}>{symbol}</span>
            <span className="kt-tag gold">{timeframe}</span>
          </div>
          <span style={{ color: 'var(--kt-dim)', fontSize: 'var(--xs)', letterSpacing: 1.6, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
            {candles ? `${candles.length} candles` : 'Loading…'}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#46c97f', fontWeight: 600 }}>
              <span className="animate-pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#46c97f' }} />
              LIVE
            </span>
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <div ref={containerRef} style={{ width: '100%', height: 520 }} />
        </div>
      </div>
    </div>
  )
}
