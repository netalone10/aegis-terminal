import { TrendingUp, TrendingDown, Minus, Target, Clock, Layers } from 'lucide-react'

interface SMCData {
  symbol: string
  bias: string
  confidence: number
  premiumDiscount: string
  killZone: string
  bullScore: number
  bearScore: number
  signals: string[]
  levels: { type: string; zone: [number, number]; label: string; strength: string }[]
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

const levelColors: Record<string, string> = {
  bullish_ob: 'border-emerald/30 bg-emerald/5',
  bearish_ob: 'border-red/30 bg-red/5',
  bullish_fvg: 'border-emerald/20 bg-emerald/3',
  bearish_fvg: 'border-red/20 bg-red/3',
  equilibrium: 'border-amber/30 bg-amber/5',
  fib_618: 'border-blue/30 bg-blue/5',
  fib_382: 'border-blue/30 bg-blue/5',
  liquidity_high: 'border-red/20 bg-red/3',
  liquidity_low: 'border-emerald/20 bg-emerald/3',
}

function BiasIcon({ bias }: { bias: string }) {
  if (bias === 'bullish') return <TrendingUp size={18} className="text-emerald" />
  if (bias === 'bearish') return <TrendingDown size={18} className="text-red" />
  return <Minus size={18} className="text-amber" />
}

export default function SMCPanel({ data }: { data: SMCData }) {
  const biasClass = data.bias === 'bullish' ? 'badge-bull' : data.bias === 'bearish' ? 'badge-bear' : 'badge-neutral'
  const pdColor = data.premiumDiscount === 'premium' ? 'text-red' : 'text-emerald'

  return (
    <div className="bg-card rounded-xl border border-border p-6" id={`smc-${data.symbol.replace('/', '-')}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono font-bold text-text">{data.symbol}</span>
          <span className={biasClass}>{data.bias.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-mono font-bold text-text">{data.confidence}%</span>
          <span className="text-[10px] text-text-dim">confidence</span>
        </div>
      </div>

      {/* Bias icon + P/D + Kill Zone */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="flex items-center gap-2.5 bg-bg-raised rounded-lg p-3 border border-border/50">
          <BiasIcon bias={data.bias} />
          <div>
            <div className="text-[10px] text-text-dim font-mono">Bias</div>
            <div className={`text-sm font-bold ${data.bias === 'bullish' ? 'text-emerald' : data.bias === 'bearish' ? 'text-red' : 'text-amber'}`}>
              {data.bias.charAt(0).toUpperCase() + data.bias.slice(1)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 bg-bg-raised rounded-lg p-3 border border-border/50">
          <Layers size={18} className={pdColor} />
          <div>
            <div className="text-[10px] text-text-dim font-mono">Zone</div>
            <div className={`text-sm font-bold ${pdColor}`}>
              {data.premiumDiscount.charAt(0).toUpperCase() + data.premiumDiscount.slice(1)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 bg-bg-raised rounded-lg p-3 border border-border/50">
          <Clock size={18} className={data.killZone !== 'none' ? 'text-emerald' : 'text-text-muted'} />
          <div>
            <div className="text-[10px] text-text-dim font-mono">Kill Zone</div>
            <div className={`text-sm font-bold ${data.killZone !== 'none' ? 'text-emerald' : 'text-text-muted'}`}>
              {data.killZone.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </div>
          </div>
        </div>
      </div>

      {/* Score bars */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div>
          <div className="flex justify-between text-[10px] font-mono text-text-dim mb-1">
            <span>Bull Score</span>
            <span className="text-emerald">{data.bullScore.toFixed(0)}</span>
          </div>
          <div className="h-1.5 bg-bg-raised rounded-full overflow-hidden">
            <div className="h-full bg-emerald rounded-full transition-all" style={{ width: `${data.bullScore}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] font-mono text-text-dim mb-1">
            <span>Bear Score</span>
            <span className="text-red">{data.bearScore.toFixed(0)}</span>
          </div>
          <div className="h-1.5 bg-bg-raised rounded-full overflow-hidden">
            <div className="h-full bg-red rounded-full transition-all" style={{ width: `${data.bearScore}%` }} />
          </div>
        </div>
      </div>

      {/* Structure */}
      <div className="mb-5">
        <h4 className="text-[10px] text-text-dim font-mono uppercase tracking-widest mb-2">Structure</h4>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'EMA Bias', value: data.structure.emaBias },
            { label: 'Long-term', value: data.structure.longTermBias },
            { label: 'Price vs EMA', value: data.structure.priceVsEma },
          ].map(s => (
            <div key={s.label} className="bg-bg-raised rounded-lg p-2.5 border border-border/50 text-center">
              <div className="text-[9px] text-text-dim font-mono">{s.label}</div>
              <div className={`text-xs font-bold font-mono mt-0.5 ${
                s.value === 'bullish' ? 'text-emerald' : s.value === 'bearish' ? 'text-red' : 'text-amber'
              }`}>
                {s.value.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Signals */}
      {data.signals.length > 0 && (
        <div className="mb-5">
          <h4 className="text-[10px] text-text-dim font-mono uppercase tracking-widest mb-2">Signals</h4>
          <div className="space-y-1.5">
            {data.signals.map((sig, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-emerald mt-0.5">→</span>
                <span className="text-text-secondary">{sig}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Levels */}
      {data.levels.length > 0 && (
        <div className="mb-5">
          <h4 className="text-[10px] text-text-dim font-mono uppercase tracking-widest mb-2">Key Levels</h4>
          <div className="space-y-1.5">
            {data.levels.map((level, i) => (
              <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${levelColors[level.type] || 'border-border/30 bg-bg-raised/50'}`}>
                <span className="text-[11px] text-text-secondary">{level.label}</span>
                <span className="text-[11px] font-mono font-semibold text-text">
                  {level.zone[0].toFixed(2)} — {level.zone[1].toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trade Setup */}
      {data.tradeSetup && (
        <div className="bg-bg-raised rounded-lg border border-border/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target size={14} className="text-emerald" />
            <span className="text-xs font-semibold text-text">Trade Setup</span>
            <span className={`ml-auto ${data.tradeSetup.direction === 'bullish' ? 'badge-bull' : 'badge-bear'}`}>
              {data.tradeSetup.direction.toUpperCase()}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-text-dim">Entry</span>
              <span className="font-mono font-bold text-text">{data.tradeSetup.entry.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-dim">Stop Loss</span>
              <span className="font-mono font-bold text-red">{data.tradeSetup.sl.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-dim">TP1 (R:R {data.tradeSetup.rr1?.toFixed(1)})</span>
              <span className="font-mono font-bold text-emerald">{data.tradeSetup.tp1.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-dim">TP2 (R:R {data.tradeSetup.rr2?.toFixed(1)})</span>
              <span className="font-mono font-bold text-emerald">{data.tradeSetup.tp2.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-dim">TP3</span>
              <span className="font-mono font-bold text-emerald">{data.tradeSetup.tp3.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Meta */}
      {data.meta && (
        <div className="mt-4 pt-3 border-t border-border/30 grid grid-cols-5 gap-2 text-center">
          {[
            { label: 'RSI', value: data.meta.rsi?.toFixed(1) },
            { label: 'ATR', value: data.meta.atr?.toFixed(2) },
            { label: 'EMA20', value: data.meta.ema20?.toFixed(0) },
            { label: 'EMA50', value: data.meta.ema50?.toFixed(0) },
            { label: 'SMA200', value: data.meta.sma200?.toFixed(0) },
          ].map(m => (
            <div key={m.label}>
              <div className="text-[9px] text-text-dim font-mono">{m.label}</div>
              <div className="text-xs font-mono font-semibold text-text-secondary">{m.value ?? '—'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
