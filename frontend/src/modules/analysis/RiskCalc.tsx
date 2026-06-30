import { useState, useMemo } from 'react'
import { Calculator, CheckCircle2, Circle, RotateCcw } from 'lucide-react'

interface PairSpec {
  label: string
  pipSize: number
  pipValuePerLot: number // USD per pip per standard lot
}

const PAIRS: Record<string, PairSpec> = {
  'XAU/USD': { label: 'XAU/USD', pipSize: 0.10, pipValuePerLot: 10 },
  'EUR/USD': { label: 'EUR/USD', pipSize: 0.0001, pipValuePerLot: 10 },
  'GBP/USD': { label: 'GBP/USD', pipSize: 0.0001, pipValuePerLot: 10 },
  'USD/JPY': { label: 'USD/JPY', pipSize: 0.01, pipValuePerLot: 6.5 },
  'USD/CHF': { label: 'USD/CHF', pipSize: 0.0001, pipValuePerLot: 10 },
  'USD/IDR': { label: 'USD/IDR', pipSize: 1, pipValuePerLot: 0.0062 },
  'AUD/USD': { label: 'AUD/USD', pipSize: 0.0001, pipValuePerLot: 10 },
}

const LOT_PRESETS = [0.01, 0.05, 0.1, 0.5, 1.0]

const CHECKLIST_ITEMS = [
  'Within Kill Zone?',
  'No high impact news < 2h?',
  'Timeframes aligned?',
  'Risk < 1%?',
  'R:R > 1:1.5?',
]

const inputStyle: React.CSSProperties = {
  background: 'var(--kt-bg)',
  border: '1px solid var(--kt-border)',
  borderRadius: 6,
  padding: '8px 10px',
  color: 'var(--kt-text)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--sm)',
  width: '100%',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  color: 'var(--kt-text2)',
  fontSize: 'var(--xs)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 4,
  display: 'block',
}

export default function RiskCalc() {
  const [balance, setBalance] = useState(10000)
  const [riskPct, setRiskPct] = useState(1)
  const [pair, setPair] = useState('XAU/USD')
  const [entry, setEntry] = useState<number | ''>('')
  const [sl, setSl] = useState<number | ''>('')
  const [tp1, setTp1] = useState<number | ''>('')
  const [tp2, setTp2] = useState<number | ''>('')
  const [presetLots, setPresetLots] = useState<number | null>(null)
  const [checklist, setChecklist] = useState<boolean[]>(CHECKLIST_ITEMS.map(() => false))

  const toggleCheck = (i: number) => {
    setChecklist(prev => { const n = [...prev]; n[i] = !n[i]; return n })
  }

  const reset = () => {
    setBalance(10000); setRiskPct(1); setPair('XAU/USD')
    setEntry(''); setSl(''); setTp1(''); setTp2('')
    setPresetLots(null); setChecklist(CHECKLIST_ITEMS.map(() => false))
  }

  const spec = PAIRS[pair]

  const calc = useMemo(() => {
    if (!entry || !sl || entry === sl) return null
    const isBuy = sl < entry
    const slDist = Math.abs(entry - sl)
    const slPips = slDist / spec.pipSize
    if (slPips === 0) return null

    const riskAmt = balance * (riskPct / 100)
    const autoLots = riskAmt / (slPips * spec.pipValuePerLot)
    const lots = presetLots !== null ? presetLots : autoLots

    const tp1Pips = tp1 ? Math.abs(tp1 - entry) / spec.pipSize : 0
    const tp2Pips = tp2 ? Math.abs(tp2 - entry) / spec.pipSize : 0

    const rr1 = tp1Pips > 0 ? tp1Pips / slPips : 0
    const rr2 = tp2Pips > 0 ? tp2Pips / slPips : 0

    const profit1 = lots * tp1Pips * spec.pipValuePerLot
    const profit2 = lots * tp2Pips * spec.pipValuePerLot
    const riskDollar = lots * slPips * spec.pipValuePerLot

    return { slPips, riskAmt, lots, tp1Pips, tp2Pips, rr1, rr2, profit1, profit2, riskDollar, isBuy }
  }, [balance, riskPct, pair, entry, sl, tp1, tp2, presetLots, spec])

  const allChecked = checklist.every(Boolean)

  return (
    <div>
      {/* Header */}
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Position Management</div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Calculator size={22} style={{ color: 'var(--kt-gold)' }} />
            Risk Calculator
          </h1>
        </div>
        <button onClick={reset} style={{
          background: 'var(--kt-bg2)', border: '1px solid var(--kt-border)',
          borderRadius: 6, padding: '6px 14px', color: 'var(--kt-text2)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)',
        }}>
          <RotateCcw size={12} /> RESET
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* Left: Inputs */}
        <div className="kt-card">
          <div className="kt-card-pad">
            <div className="kt-kicker" style={{ marginBottom: 12 }}>Trade Parameters</div>

            {/* Account & Risk */}
            <div className="kt-grid-2" style={{ marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Account Balance (USD)</label>
                <input type="number" style={inputStyle} value={balance}
                  onChange={e => setBalance(Number(e.target.value) || 0)} />
              </div>
              <div>
                <label style={labelStyle}>Risk per Trade (%)</label>
                <input type="number" style={inputStyle} value={riskPct} min={0.1} max={5} step={0.1}
                  onChange={e => setRiskPct(Math.min(5, Math.max(0.1, Number(e.target.value) || 0.1)))} />
              </div>
            </div>

            {/* Pair */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Select Pair</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={pair}
                onChange={e => setPair(e.target.value)}>
                {Object.keys(PAIRS).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Entry / SL / TPs */}
            <div className="kt-grid-2" style={{ marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Entry Price</label>
                <input type="number" style={inputStyle} value={entry} step="any"
                  onChange={e => setEntry(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div>
                <label style={labelStyle}>Stop Loss Price</label>
                <input type="number" style={inputStyle} value={sl} step="any"
                  onChange={e => setSl(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
            </div>
            <div className="kt-grid-2" style={{ marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Take Profit 1</label>
                <input type="number" style={inputStyle} value={tp1} step="any"
                  onChange={e => setTp1(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
              <div>
                <label style={labelStyle}>Take Profit 2 (optional)</label>
                <input type="number" style={inputStyle} value={tp2} step="any"
                  onChange={e => setTp2(e.target.value === '' ? '' : Number(e.target.value))} />
              </div>
            </div>

            {/* Lot Presets */}
            <div>
              <label style={labelStyle}>Position Preset</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {LOT_PRESETS.map(l => (
                  <button key={l} onClick={() => setPresetLots(presetLots === l ? null : l)}
                    style={{
                      background: presetLots === l ? 'var(--kt-gold)' : 'var(--kt-bg)',
                      color: presetLots === l ? '#000' : 'var(--kt-text2)',
                      border: `1px solid ${presetLots === l ? 'var(--kt-gold)' : 'var(--kt-border)'}`,
                      borderRadius: 4, padding: '4px 12px', cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', fontSize: 'var(--xs)',
                    }}>
                    {l} lot
                  </button>
                ))}
                {presetLots !== null && (
                  <button onClick={() => setPresetLots(null)}
                    style={{
                      background: 'transparent', color: 'var(--kt-dn)',
                      border: '1px solid var(--kt-dn)', borderRadius: 4,
                      padding: '4px 10px', cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', fontSize: 'var(--xs)',
                    }}>
                    AUTO
                  </button>
                )}
              </div>
              {presetLots !== null && (
                <p style={{ color: 'var(--kt-muted)', fontSize: 'var(--xs)', marginTop: 6 }}>
                  Using manual lot size. Risk will adjust accordingly.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Stats Grid */}
          <div className="kt-card">
            <div className="kt-card-pad">
              <div className="kt-kicker" style={{ marginBottom: 12 }}>Calculation Results</div>
              {calc ? (
                <div className="kt-stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <Stat label="Risk Amount" value={`$${calc.riskDollar.toFixed(2)}`} color="var(--kt-dn)" />
                  <Stat label="SL Pips" value={calc.slPips.toFixed(1)} color="var(--kt-dn)" />
                  <Stat label="Position Size" value={`${calc.lots.toFixed(4)} lots`} color="var(--kt-gold)" />
                  <Stat label="R:R TP1" value={calc.rr1 > 0 ? `1 : ${calc.rr1.toFixed(2)}` : '—'} color="var(--kt-up)" />
                  <Stat label="R:R TP2" value={calc.rr2 > 0 ? `1 : ${calc.rr2.toFixed(2)}` : '—'} color="var(--kt-up)" />
                  <Stat label="Risk %" value={`${riskPct}%`} color="var(--kt-dn)" />
                  {calc.tp1Pips > 0 && <Stat label="Profit TP1" value={`+$${calc.profit1.toFixed(2)}`} color="var(--kt-up)" />}
                  {calc.tp2Pips > 0 && <Stat label="Profit TP2" value={`+$${calc.profit2.toFixed(2)}`} color="var(--kt-up)" />}
                  <Stat label="Direction" value={calc.isBuy ? 'LONG' : 'SHORT'} color={calc.isBuy ? 'var(--kt-up)' : 'var(--kt-dn)'} />
                </div>
              ) : (
                <p style={{ color: 'var(--kt-muted)', fontSize: 'var(--sm)', textAlign: 'center', padding: '24px 0' }}>
                  Enter Entry & Stop Loss prices to calculate
                </p>
              )}
            </div>
          </div>

          {/* R:R Visual Bar */}
          {calc && (calc.tp1Pips > 0 || calc.tp2Pips > 0) && (
            <div className="kt-card">
              <div className="kt-card-pad">
                <div className="kt-kicker" style={{ marginBottom: 12 }}>Risk : Reward Visual</div>
                <div style={{ display: 'flex', height: 32, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--kt-border)' }}>
                  <div style={{
                    background: 'var(--kt-dn)', width: `${calc.tp2Pips > 0 ? (calc.slPips / (calc.slPips + calc.tp2Pips)) * 100 : (calc.slPips / (calc.slPips + calc.tp1Pips)) * 100}%`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)',
                    fontWeight: 700, minWidth: 50,
                  }}>
                    SL {calc.slPips.toFixed(1)}p
                  </div>
                  {calc.tp1Pips > 0 && (
                    <div style={{
                      background: 'var(--kt-up)',
                      width: `${calc.tp2Pips > 0 ? (calc.tp1Pips / (calc.slPips + calc.tp2Pips)) * 100 : (calc.tp1Pips / (calc.slPips + calc.tp1Pips)) * 100}%`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)',
                      fontWeight: 700, minWidth: 50,
                    }}>
                      TP1 {calc.tp1Pips.toFixed(1)}p
                    </div>
                  )}
                  {calc.tp2Pips > 0 && (
                    <div style={{
                      background: 'color-mix(in srgb, var(--kt-up) 70%, #fff)',
                      width: `${(calc.tp2Pips / (calc.slPips + calc.tp2Pips)) * 100}%`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)',
                      fontWeight: 700, minWidth: 50,
                    }}>
                      TP2 {calc.tp2Pips.toFixed(1)}p
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  {calc.rr1 > 0 && (
                    <span style={{ color: 'var(--kt-up)', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>
                      TP1 R:R = 1:{calc.rr1.toFixed(2)}
                    </span>
                  )}
                  {calc.rr2 > 0 && (
                    <span style={{ color: 'var(--kt-up)', fontSize: 'var(--xs)', fontFamily: 'var(--font-mono)' }}>
                      TP2 R:R = 1:{calc.rr2.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Pre-Trade Checklist */}
          <div className="kt-card">
            <div className="kt-card-pad">
              <div className="kt-kicker" style={{ marginBottom: 12 }}>Pre-Trade Checklist</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CHECKLIST_ITEMS.map((item, i) => (
                  <label key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                    color: checklist[i] ? 'var(--kt-up)' : 'var(--kt-text2)',
                    fontSize: 'var(--sm)', transition: 'color 0.15s',
                  }}>
                    <input type="checkbox" checked={checklist[i]} onChange={() => toggleCheck(i)}
                      style={{ display: 'none' }} />
                    {checklist[i]
                      ? <CheckCircle2 size={16} style={{ color: 'var(--kt-up)' }} />
                      : <Circle size={16} style={{ color: 'var(--kt-dim)' }} />}
                    {item}
                  </label>
                ))}
              </div>
              <button style={{
                marginTop: 16, width: '100%', padding: '10px 0', borderRadius: 6,
                border: 'none', fontFamily: 'var(--font-mono)', fontWeight: 700,
                fontSize: 'var(--sm)', letterSpacing: '0.06em', cursor: allChecked ? 'pointer' : 'not-allowed',
                background: allChecked ? 'var(--kt-up)' : 'var(--kt-bg2)',
                color: allChecked ? '#000' : 'var(--kt-dim)',
                transition: 'all 0.2s',
              }} disabled={!allChecked}>
                {allChecked ? '✓ READY TO TRADE' : `${checklist.filter(Boolean).length}/${CHECKLIST_ITEMS.length} CHECKED`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="kt-stat">
      <span className="kt-stat-label">{label}</span>
      <span className="kt-stat-value" style={{ color }}>{value}</span>
    </div>
  )
}
