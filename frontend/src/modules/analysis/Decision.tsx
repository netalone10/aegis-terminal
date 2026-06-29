import { useQuery } from '@tanstack/react-query'
import { Crosshair, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Minus, Shield, Target, Clock } from 'lucide-react'
import { api } from '../../lib/api'

type SMCLevel = {
  type: string
  zone: [number, number]
  label: string
  strength: string
}

type SMCData = {
  bias: string
  confidence: number
  premiumDiscount: string
  killZone: string
  bullScore: number
  bearScore: number
  signals: string[]
  levels: SMCLevel[]
  tradeSetup: {
    direction: string
    entry: number
    sl: number
    tp1: number
    tp2: number
    tp3: number
    rr1: number
    rr2: number
  } | null
  structure: {
    emaBias: string
    longTermBias: string
    priceVsEma: string
  }
  meta: {
    atr: number
    rsi: number
    ema20: number
    ema50: number
    sma200: number
  }
}

type SMCSymbol = {
  symbol: string
} & SMCData

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

const levelColors: Record<string, string> = {
  bullish_ob: 'border-primary/40 bg-primary/5',
  bearish_ob: 'border-danger/40 bg-danger/5',
  bullish_fvg: 'border-primary/30 bg-primary/3',
  bearish_fvg: 'border-danger/30 bg-danger/3',
  equilibrium: 'border-warning/30 bg-warning/5',
  fib_618: 'border-info/30 bg-info/5',
  fib_382: 'border-info/30 bg-info/5',
  liquidity_high: 'border-danger/20 bg-danger/3',
  liquidity_low: 'border-primary/20 bg-primary/3',
}

function BiasCard({ data }: { data: SMCSymbol }) {
  const biasColor = data.bias === 'bullish' ? 'text-primary' : data.bias === 'bearish' ? 'text-danger' : 'text-warning'
  const biasBg = data.bias === 'bullish' ? 'bg-primary/10 border-primary/30' : data.bias === 'bearish' ? 'bg-danger/10 border-danger/30' : 'bg-warning/10 border-warning/30'

  return (
    <div className="glass glass-hover gradient-border p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-fg-muted font-mono uppercase tracking-widest">{data.symbol}</span>
        <span className={`chip ${data.bias === 'bullish' ? 'chip-primary' : data.bias === 'bearish' ? 'chip-danger' : 'chip-warning'}`}>
          {data.bias.toUpperCase()}
        </span>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${biasBg} border`}>
          {data.bias === 'bullish' ? <TrendingUp size={20} className="text-primary" /> :
           data.bias === 'bearish' ? <TrendingDown size={20} className="text-danger" /> :
           <Minus size={20} className="text-warning" />}
        </div>
        <div>
          <div className={`text-2xl font-bold font-mono ${biasColor}`}>{data.confidence}%</div>
          <div className="text-[10px] text-fg-muted">Confidence</div>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-fg-muted">P/D Zone</span>
          <span className={`font-mono font-semibold ${data.premiumDiscount === 'premium' ? 'text-danger' : 'text-primary'}`}>
            {data.premiumDiscount.toUpperCase()}
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-fg-muted">Kill Zone</span>
          <span className={`font-mono ${data.killZone !== 'none' ? 'text-primary' : 'text-fg-muted'}`}>
            {data.killZone.replace('_', ' ').toUpperCase()}
          </span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-fg-muted">EMA Bias</span>
          <span className={`font-mono ${data.structure.emaBias === 'bullish' ? 'text-primary' : 'text-danger'}`}>
            {data.structure.emaBias.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  )
}

function TradeSetupCard({ setup }: { setup: NonNullable<SMCData['tradeSetup']> }) {
  return (
    <div className="glass gradient-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target size={16} className="text-primary" />
        <span className="text-[13px] font-semibold">Trade Setup</span>
        <span className={`ml-auto chip ${setup.direction === 'bullish' ? 'chip-primary' : 'chip-danger'}`}>
          {setup.direction.toUpperCase()}
        </span>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-[11px] text-fg-muted">Entry</span>
          <span className="text-sm font-mono font-bold">{setup.entry.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[11px] text-fg-muted">Stop Loss</span>
          <span className="text-sm font-mono font-bold text-danger">{setup.sl.toFixed(2)}</span>
        </div>
        <div className="divider-gradient my-2" />
        <div className="flex justify-between">
          <span className="text-[11px] text-fg-muted">TP1 (RR {setup.rr1?.toFixed(1)})</span>
          <span className="text-sm font-mono font-bold text-primary">{setup.tp1.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[11px] text-fg-muted">TP2 (RR {setup.rr2?.toFixed(1)})</span>
          <span className="text-sm font-mono font-bold text-primary">{setup.tp2.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[11px] text-fg-muted">TP3</span>
          <span className="text-sm font-mono font-bold text-primary">{setup.tp3.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}

export default function DecisionEngine() {
  const { data: smcData, isLoading } = useQuery<{ data: SMCSymbol[] }>({
    queryKey: ['smc-batch'],
    queryFn: () => api('/api/smc/batch'),
    refetchInterval: 120_000,
    retry: false,
  })

  const pairs = smcData?.data ?? []

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-primary" />
            SMC Analysis
          </h1>
          <p className="text-[13px] text-fg-muted mt-1">Smart Money Concepts — Order Blocks, FVG, Structure, Kill Zones</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-fg-muted font-mono">
          <Clock size={12} />
          <span>Auto-refresh 2min</span>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass p-5 space-y-3">
              <Skeleton className="w-20 h-3" />
              <Skeleton className="w-32 h-8" />
              <Skeleton className="w-full h-20" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Bias Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pairs.map((pair) => (
              <BiasCard key={pair.symbol} data={pair} />
            ))}
          </div>

          {/* Detailed Analysis — first pair (XAU/USD) */}
          {pairs.length > 0 && pairs[0] && (
            <div className="grid grid-cols-3 gap-4">
              {/* Signals */}
              <div className="col-span-2 glass p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Shield size={16} className="text-warning" />
                  <span className="text-[13px] font-semibold">Signals & Key Levels</span>
                </div>
                <div className="space-y-2 mb-4">
                  {pairs[0].signals.map((sig, i) => (
                    <div key={i} className="flex items-start gap-2 text-[12px]">
                      <span className="text-primary mt-0.5">→</span>
                      <span className="text-fg-secondary">{sig}</span>
                    </div>
                  ))}
                </div>
                <div className="divider-gradient my-3" />
                <h4 className="text-[11px] text-fg-muted uppercase tracking-widest mb-3 font-mono">Key Levels</h4>
                <div className="space-y-1.5">
                  {pairs[0].levels.map((level, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${levelColors[level.type] || 'border-border/20 bg-surface/20'}`}>
                      <span className="text-[11px] text-fg-secondary">{level.label}</span>
                      <span className="text-[11px] font-mono font-semibold">
                        {level.zone[0].toFixed(2)} — {level.zone[1].toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Trade Setup */}
              {pairs[0].tradeSetup ? (
                <TradeSetupCard setup={pairs[0].tradeSetup} />
              ) : (
                <div className="glass p-5 flex flex-col items-center justify-center text-center">
                  <AlertTriangle size={24} className="text-warning mb-3" />
                  <span className="text-[13px] font-semibold mb-1">No Setup</span>
                  <span className="text-[11px] text-fg-muted">Wait for clear structure (BOS/CHoCH)</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
