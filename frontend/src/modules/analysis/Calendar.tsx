import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  Clock, AlertTriangle, ShieldAlert, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronUp, Activity, Globe, Landmark, BarChart3,
  ShieldCheck, ArrowUpRight, ArrowDownRight, Shield,
} from 'lucide-react'
import { api } from '../../lib/api'

/* ── types ─────────────────────────────────────────────────────────── */
interface CalendarEvent {
  time: string; currency: string; event: string; impact: 'HIGH' | 'MEDIUM' | 'LOW'
  forecast: string; previous: string; actual: string | null
}
interface MacroIndicator { seriesId: string; latest: number | string; previous: number | string; change: number }
interface MacroRates { rates: Record<string, number | null>; spreads: Record<string, string | null>; curveShape: string }
interface MacroRegime { regime: string; riskLevel: string; signals: Record<string, any> }
interface MacroData { dxy?: number; dgs10?: number; dgs2?: number; dtb3?: number; yieldCurve?: number; regime?: string; [k: string]: any }
interface CotEntry { pair: string; label: string; reportDate: string; netPosition: number; longs: number; shorts: number; spread: number; changeLong: number; changeShort: number; netChange: number; openInterest: number; pctLong: number; pctShort: number; bias: 'bullish' | 'bearish' | 'neutral'; commercialNet: number }
interface RetailSentiment { pair: string; longPct: number; shortPct: number; signal: string }

/* ── constants ─────────────────────────────────────────────────────── */
const FLAGS: Record<string, string> = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CNY: '🇨🇳', IDR: '🇮🇩', AUD: '🇦🇺', NZD: '🇳🇿', CAD: '🇨🇦', CHF: '🇨🇭', KRW: '🇰🇷', INR: '🇮🇳', BRL: '🇧🇷', MXN: '🇲🇽', ZAR: '🇿🇦', SEK: '🇸🇪', NOK: '🇳🇴', SGD: '🇸🇬', HKD: '🇭🇰', TRY: '🇹🇷', PLN: '🇵🇱', THB: '🇹🇭', PHP: '🇵🇭', MYR: '🇲🇾' }
const WIB_OFF = 7 * 3600_000
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const REGIME_LABELS: Record<string, { name: string; description: string }> = {
  goldilocks: { name: 'Goldilocks', description: 'Moderate growth, controlled inflation — risk assets favorable' },
  bull: { name: 'Bull Market', description: 'Strong growth momentum, rising confidence' },
  bear: { name: 'Bear Market', description: 'Contracting growth, elevated risk-off' },
  neutral: { name: 'Neutral', description: 'Mixed signals, balanced risk indicators' },
  risk_on: { name: 'Risk-On', description: 'Favorable risk conditions, low volatility' },
  risk_off: { name: 'Risk-Off', description: 'Elevated uncertainty, flight to safety' },
  inflationary: { name: 'Inflationary', description: 'Rising price pressures' },
  recession: { name: 'Recession', description: 'Economic contraction' },
}
const RISK_COLORS: Record<string, string> = { low: 'badge-bull', moderate: 'badge-info', high: 'badge-bear', elevated: 'badge-bear' }
const REGIME_META: Record<string, { label: string; color: string; badge: string; desc: string }> = {
  expansion: { label: 'Expansion', color: 'var(--kt-up)', badge: 'badge-bull', desc: 'Risk-on. Growth rising, USD weak, gold neutral-bullish.' },
  inflation: { label: 'Inflation', color: 'var(--kt-gold)', badge: 'badge-gold', desc: 'Fed hawkish, yields rising, gold volatile.' },
  deflation: { label: 'Deflation', color: 'var(--kt-info)', badge: 'badge-info', desc: 'Fed dovish, yields falling, safe-haven demand.' },
  stagflation: { label: 'Stagflation', color: 'var(--kt-dn)', badge: 'badge-bear', desc: 'Slow growth + high inflation, worst-case scenario.' },
}
const IMPLICATIONS: Record<string, string> = { expansion: 'Buy equities, sell USD, buy AUD/NZD.', inflation: 'Hedge with commodities. Gold bullish. Bonds bearish.', deflation: 'Buy bonds, JPY, CHF. Gold bullish.', stagflation: 'Cash, gold, energy. Avoid growth.' }
const PAIR_BIAS: Record<string, Record<string, string>> = {
  expansion: { 'XAU/USD': 'Neutral-bullish', 'EUR/USD': 'Bullish', 'GBP/USD': 'Bullish', 'USD/JPY': 'Bullish', 'BTC/USD': 'Bullish' },
  inflation: { 'XAU/USD': 'Bullish', 'EUR/USD': 'Bearish', 'GBP/USD': 'Mixed', 'USD/JPY': 'Bullish', 'BTC/USD': 'Volatile' },
  deflation: { 'XAU/USD': 'Bullish', 'EUR/USD': 'Mixed', 'GBP/USD': 'Bearish', 'USD/JPY': 'Bearish', 'BTC/USD': 'Bearish' },
  stagflation: { 'XAU/USD': 'Bullish', 'EUR/USD': 'Bearish', 'GBP/USD': 'Bearish', 'USD/JPY': 'Bearish', 'BTC/USD': 'Bearish' },
}
const CB_LIST = [
  { name: 'FOMC', flag: '🇺🇸', rate: 4.50, pairs: 'EUR/USD, DXY, XAU/USD', kw: ['fomc', 'fed', 'federal reserve'] },
  { name: 'BOJ', flag: '🇯🇵', rate: 0.50, pairs: 'USD/JPY', kw: ['boj', 'bank of japan'] },
  { name: 'BOE', flag: '🇬🇧', rate: 4.50, pairs: 'GBP/USD', kw: ['boe', 'bank of england', 'official bank rate'] },
  { name: 'RBA', flag: '🇦🇺', rate: 3.85, pairs: 'AUD/USD', kw: ['rba', 'reserve bank of australia'] },
  { name: 'ECB', flag: '🇪🇺', rate: 2.65, pairs: 'EUR/USD, EUR/GBP', kw: ['ecb', 'european central bank'] },
  { name: 'SNB', flag: '🇨🇭', rate: 0.25, pairs: 'USD/CHF', kw: ['snb', 'swiss national bank'] },
  { name: 'BI', flag: '🇮🇩', rate: 5.75, pairs: 'USD/IDR', kw: ['bi', 'bank indonesia'] },
]
const RETAIL: RetailSentiment[] = [
  { pair: 'EUR/USD', longPct: 72, shortPct: 28, signal: 'Bearish' },
  { pair: 'GBP/USD', longPct: 65, shortPct: 35, signal: 'Bearish' },
  { pair: 'USD/JPY', longPct: 38, shortPct: 62, signal: 'Bullish' },
  { pair: 'AUD/USD', longPct: 55, shortPct: 45, signal: 'Neutral' },
  { pair: 'XAU/USD', longPct: 42, shortPct: 58, signal: 'Bullish' },
  { pair: 'NZD/USD', longPct: 61, shortPct: 39, signal: 'Bearish' },
]

/* ── helpers ───────────────────────────────────────────────────────── */
const toWIB = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() + WIB_OFF - d.getTimezoneOffset() * 60000) }
const wibTime = (iso: string) => toWIB(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
const wibDayKey = (iso: string) => { const d = toWIB(iso); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}` }
const wibDayLabel = (iso: string) => { const d = toWIB(iso); return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${d.toLocaleString('en-GB',{month:'short',timeZone:'UTC'})} ${d.getUTCFullYear()}` }
const todayWIB = () => wibDayKey(new Date().toISOString())
const fmtCountdown = (ms: number) => { if (ms <= 0) return 'now'; const d = Math.floor(ms/86400_000), h = Math.floor((ms%86400_000)/3600_000), m = Math.floor((ms%3600_000)/60_000); return [d>0&&`${d}d`, h>0&&`${h}h`, `${m}m`].filter(Boolean).join(' ') }
const deriveRegime = (d: MacroData) => { const c = d.yieldCurve ?? ((d.dgs10??0)-(d.dgs2??0)), y = d.dgs10??0; if (c>0.5&&y>4) return 'expansion'; if (y>4.5&&c<0) return 'stagflation'; if (y<3&&c>0) return 'deflation'; return 'inflation' }
const cbDecision = (evts: CalendarEvent[], kw: string[]) => { const today = new Date().toISOString().split('T')[0]; const past = evts.filter(e => kw.some(k => e.event.toLowerCase().includes(k)) && new Date(e.time).toISOString().split('T')[0] >= today && e.actual); if (!past.length) return 'N/A'; const last = past[past.length-1]; if (!last.forecast||!last.actual) return 'HOLD'; const f=parseFloat(last.forecast), a=parseFloat(last.actual); if (isNaN(f)||isNaN(a)) return 'HOLD'; return a>f?'HIKE':a<f?'CUT':'HOLD' }
const cbNextDate = (evts: CalendarEvent[], kw: string[]) => { const today = new Date().toISOString().split('T')[0]; const m = evts.find(e => kw.some(k => e.event.toLowerCase().includes(k)) && new Date(e.time).toISOString().split('T')[0] >= today); return m ? new Date(m.time).toISOString().split('T')[0] : null }
const decColor = (d: string) => d === 'HIKE' ? 'var(--kt-dn)' : d === 'CUT' ? 'var(--kt-up)' : 'var(--kt-muted)'

/* ── gold bias ─────────────────────────────────────────────────────── */
function mapGoldBias(ev: CalendarEvent): 'bullish'|'bearish'|'neutral'|'volatile'|null {
  if (ev.currency !== 'USD' || (ev.impact !== 'HIGH' && ev.impact !== 'MEDIUM')) return null
  const n = ev.event.toLowerCase(), f = parseFloat(ev.forecast), a = ev.actual ? parseFloat(ev.actual) : null
  if (n.includes('fed') && (n.includes('speech') || n.includes('chair') || n.includes('testimony'))) return 'volatile'
  if (n.includes('fomc') || n.includes('interest rate')) return 'volatile'
  if (a === null || isNaN(a) || isNaN(f)) return null
  if (n.includes('unemployment') || n.includes('jobless')) return a > f ? 'bullish' : a < f ? 'bearish' : 'neutral'
  if (n.includes('cpi') || n.includes('gdp') || n.includes('pmi') || n.includes('retail') || n.includes('confidence') || n.includes('employment') || n.includes('non-farm'))
    return a < f ? 'bullish' : a > f ? 'bearish' : 'neutral'
  return a > f ? 'bearish' : a < f ? 'bullish' : 'neutral'
}
function computeGoldBias(events: CalendarEvent[]) {
  const now = Date.now(), goldEvents: any[] = []; let bc = 0, rc = 0, vc = 0
  for (const ev of events.filter(e => e.currency === 'USD' && (e.impact === 'HIGH' || e.impact === 'MEDIUM') && new Date(e.time).getTime() > now - 86400_000)) {
    const bias = mapGoldBias(ev); if (!bias) continue
    goldEvents.push({ ...ev, bias }); if (bias === 'bullish') bc++; else if (bias === 'bearish') rc++; else if (bias === 'volatile') vc++
  }
  const total = bc + rc, pct = total ? Math.round(Math.max(bc, rc) / total * 100) : 50
  const overall = bc > rc ? 'bullish' : rc > bc ? 'bearish' : vc > 0 ? 'volatile' : 'neutral'
  const summary = !total ? 'No recent USD data.' : overall === 'bullish' ? `${bc}/${total} USD weak → Gold bullish.` : overall === 'bearish' ? `${rc}/${total} USD strong → Gold bearish.` : overall === 'volatile' ? 'Fed event — expect volatility.' : 'Mixed — Gold neutral.'
  return { overall, total, pct, events: goldEvents, summary }
}

/* ── tiny UI atoms ─────────────────────────────────────────────────── */
const TrendIcon = ({ change }: { change: number }) => change > 0 ? <TrendingUp size={14} style={{color:'var(--kt-up)'}}/> : change < 0 ? <TrendingDown size={14} style={{color:'var(--kt-dn)'}}/> : <Minus size={14} style={{color:'var(--kt-muted)'}}/>
const DirArrow = ({ v }: { v?: number }) => v == null ? <span style={{color:'var(--kt-muted)'}}>—</span> : v > 0 ? <TrendingUp size={14} style={{color:'var(--kt-up)'}}/> : v < 0 ? <TrendingDown size={14} style={{color:'var(--kt-dn)'}}/> : <Minus size={14} style={{color:'var(--kt-muted)'}}/>
const ImpactBadge = ({ impact }: { impact: string }) => {
  const s: React.CSSProperties = { display:'inline-block', padding:'2px 8px', borderRadius:4, fontSize:'var(--xs,11px)', fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase', lineHeight:'18px' }
  return impact === 'HIGH' ? <span style={{...s,background:'rgba(239,68,68,.25)',color:'#f87171'}}>HIGH</span> : impact === 'MEDIUM' ? <span style={{...s,background:'rgba(245,158,11,.20)',color:'#f59e0b'}}>MED</span> : <span style={{...s,background:'rgba(148,163,184,.15)',color:'var(--kt-muted)'}}>LOW</span>
}
const BiasBadge = ({ bias }: { bias: string }) => bias === 'bullish' ? <span className="badge-bull">BULLISH</span> : bias === 'bearish' ? <span className="badge-bear">BEARISH</span> : <span className="badge-neutral">NEUTRAL</span>
const SigBadge = ({ signal }: { signal: string }) => signal === 'Bullish' ? <span className="badge-bull">↑ BULL</span> : signal === 'Bearish' ? <span className="badge-bear">↓ BEAR</span> : <span className="badge-neutral">— FLAT</span>
const ChgArrow = ({ v }: { v: number }) => v > 0 ? <span style={{color:'var(--kt-up)',display:'inline-flex',alignItems:'center',gap:2,fontSize:'var(--xs)',fontFamily:'var(--font-mono)'}}><ArrowUpRight size={12}/>+{(v/1000).toFixed(1)}K</span> : v < 0 ? <span style={{color:'var(--kt-dn)',display:'inline-flex',alignItems:'center',gap:2,fontSize:'var(--xs)',fontFamily:'var(--font-mono)'}}><ArrowDownRight size={12}/>{(v/1000).toFixed(1)}K</span> : <span style={{color:'var(--kt-muted)',fontSize:'var(--xs)'}}>—</span>
const HeatBg = ({ v, max }: { v: number; max: number }) => { const r = Math.min(Math.abs(v)/(max||1),1); return v > 0 ? {background:`rgba(0,200,120,${.15+r*.45})`} : v < 0 ? {background:`rgba(255,60,60,${.15+r*.45})`} : {background:'transparent'} }

/* ── GoldBiasCard ──────────────────────────────────────────────────── */
function GoldBiasCard({ result }: { result: ReturnType<typeof computeGoldBias> }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = result.overall === 'bullish' ? TrendingUp : result.overall === 'bearish' ? TrendingDown : Minus
  const col = result.overall === 'bullish' ? 'var(--kt-up)' : result.overall === 'bearish' ? 'var(--kt-dn)' : result.overall === 'volatile' ? '#f59e0b' : 'var(--kt-muted)'
  const lbl = result.overall === 'volatile' ? '→ Volatile' : result.overall === 'bullish' ? '↑ Bullish' : result.overall === 'bearish' ? '↓ Bearish' : '→ Neutral'
  return (
    <div className="kt-card" style={{marginBottom:12}}>
      <button onClick={() => setExpanded(v=>!v)} style={{width:'100%',display:'flex',alignItems:'center',gap:12,padding:'14px 18px',background:'transparent',border:'none',cursor:'pointer',textAlign:'left'}}>
        <Icon size={20} style={{color:col}}/>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontWeight:700,color:'var(--kt-text)',fontSize:'var(--md)'}}>USD → Gold Bias</span>
            <span style={{color:col,fontWeight:800,fontSize:'var(--md)',fontFamily:'var(--font-mono)'}}>{lbl}</span>
          </div>
          <div style={{fontSize:'var(--xs)',color:'var(--kt-muted)',marginTop:2}}>{result.summary}</div>
        </div>
        {result.total > 0 && <span className="mono" style={{color:col,fontSize:'var(--lg)',fontWeight:700}}>{result.pct}%</span>}
        {expanded ? <ChevronUp size={16} style={{color:'var(--kt-muted)'}}/> : <ChevronDown size={16} style={{color:'var(--kt-muted)'}}/>}
      </button>
      {expanded && result.events.length > 0 && (
        <div style={{padding:'0 18px 14px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 72px 100px',gap:8,padding:'6px 0',fontSize:'var(--xs)',color:'var(--kt-muted)',fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase',borderBottom:'1px solid var(--kt-border)'}}>
            <span>Event</span><span>Impact</span><span>Gold Bias</span>
          </div>
          {result.events.map((ev: any, i: number) => {
            const ec = ev.bias==='bullish'?'var(--kt-up)':ev.bias==='bearish'?'var(--kt-dn)':'#f59e0b'
            const EI = ev.bias==='bullish'?TrendingUp:ev.bias==='bearish'?TrendingDown:Minus
            return <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 72px 100px',gap:8,padding:'8px 0',fontSize:'var(--sm)',borderBottom:'1px solid var(--kt-border-soft)',alignItems:'center'}}>
              <span style={{color:'var(--kt-text2)'}}>{ev.event}</span>
              <ImpactBadge impact={ev.impact}/>
              <span style={{display:'flex',alignItems:'center',gap:4,color:ec,fontWeight:700,fontSize:'var(--xs)'}}><EI size={12}/>{ev.bias[0].toUpperCase()+ev.bias.slice(1)}</span>
            </div>
          })}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ── MAIN COMPONENT ────────────────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════════ */
export default function Calendar() {
  const { data: events = [], isLoading: calLoading, error: calError } = useQuery<CalendarEvent[]>({ queryKey:['calendar'], queryFn:()=>api<CalendarEvent[]>('/api/calendar'), refetchInterval:300_000 })
  const { data: macroIndicators } = useQuery<Record<string, MacroIndicator>>({ queryKey:['macro-indicators'], queryFn:()=>api('/api/macro/indicators'), staleTime:300_000 })
  useQuery<MacroRates>({ queryKey:['macro-rates'], queryFn:()=>api('/api/macro/rates'), staleTime:300_000 })
  const { data: macroRegime } = useQuery<MacroRegime>({ queryKey:['macro-regime'], queryFn:()=>api('/api/macro/regime'), staleTime:300_000 })
  const { data: macroData } = useQuery<MacroData>({ queryKey:['macro'], queryFn:()=>api<MacroData>('/api/macro'), staleTime:300_000 })
  const { data: cot } = useQuery<CotEntry[]>({ queryKey:['sentiment','cot'], queryFn:()=>api('/api/sentiment/cot'), refetchInterval:3_600_000, staleTime:3_600_000 })

  const now = Date.now()
  const nextHigh = useMemo(() => events.filter(e=>e.impact==='HIGH'&&new Date(e.time).getTime()>now).sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime())[0]??null, [events, now])
  const preNews2h = useMemo(() => events.filter(e=>{if(e.impact!=='HIGH')return false;const ms=new Date(e.time).getTime()-now;return ms>0&&ms<2*3_600_000}), [events, now])
  const preNewsBlock = useMemo(() => events.filter(e=>{if(e.impact!=='HIGH')return false;const ms=new Date(e.time).getTime()-now;return ms>0&&ms<3_600_000}), [events, now])
  const grouped = useMemo(() => { const m=new Map<string,CalendarEvent[]>(); [...events].sort((a,b)=>new Date(a.time).getTime()-new Date(b.time).getTime()).forEach(e=>{const k=wibDayKey(e.time);if(!m.has(k))m.set(k,[]);m.get(k)!.push(e)}); return m }, [events])
  const today = todayWIB()
  const indList = macroIndicators ? Object.entries(macroIndicators).map(([k,v])=>({label:k,...v})) : []

  const rKey = macroRegime?.regime?.toLowerCase() ?? 'neutral'
  const regLabel = REGIME_LABELS[rKey] ?? REGIME_LABELS.neutral
  const riskLvl = macroRegime?.riskLevel ?? 'moderate'
  const curve = macroData?.yieldCurve ?? ((macroData?.dgs10??0)-(macroData?.dgs2??0))
  const regType = macroData ? deriveRegime(macroData) : 'inflation'
  const regMeta = REGIME_META[regType] ?? REGIME_META.inflation
  const pairBias = PAIR_BIAS[regType] ?? PAIR_BIAS.inflation
  const maxChg = cot ? Math.max(...cot.map(c=>Math.abs(c.netChange)),1) : 1
  const maxRate = Math.max(...CB_LIST.map(c=>c.rate))

  return (
    <div>
      {/* ═══ SECTION 1: CALENDAR ═══ */}
      {nextHigh && (() => { const ms = new Date(nextHigh.time).getTime()-now; return (
        <div style={{display:'flex',alignItems:'center',gap:10,background:'rgba(245,158,11,.10)',border:'1px solid rgba(245,158,11,.30)',borderRadius:8,padding:'10px 16px',marginBottom:12,fontSize:'var(--sm,13px)'}}>
          <Clock size={16} style={{color:'var(--kt-gold,#f59e0b)'}}/>
          <span style={{color:'var(--kt-text)'}}>Next High Impact:</span>
          <span style={{fontWeight:700,color:'var(--kt-gold,#f59e0b)'}}>{FLAGS[nextHigh.currency]} {nextHigh.currency} {nextHigh.event}</span>
          <span style={{marginLeft:'auto',fontFamily:'var(--font-mono)',fontWeight:600,color:'var(--kt-gold,#f59e0b)'}}>in {fmtCountdown(ms)}</span>
        </div>
      )})()}
      {preNews2h.length > 0 && (
        <div style={{display:'flex',alignItems:'center',gap:10,background:'rgba(239,68,68,.12)',border:'1px solid rgba(239,68,68,.30)',borderRadius:8,padding:'10px 16px',marginBottom:12,fontSize:'var(--sm,13px)',color:'#f87171'}}>
          <AlertTriangle size={16}/><span style={{fontWeight:600}}>HIGH IMPACT INCOMING</span>
          <span style={{color:'var(--kt-text)'}}>{preNews2h.map(e=>`${FLAGS[e.currency]} ${e.currency} ${e.event}`).join(' · ')}</span>
        </div>
      )}
      {preNewsBlock.map((e,i) => {
        const ms=new Date(e.time).getTime()-now, mins=Math.round(ms/60_000)
        const lbl = mins<=0?'NOW':mins<60?`T-${mins}m`:`T-${Math.round(mins/60)}h`
        return <div key={i} style={{display:'flex',alignItems:'center',gap:10,background:'rgba(239,68,68,.15)',border:'1px solid rgba(239,68,68,.35)',borderRadius:8,padding:'10px 16px',marginBottom:12,fontSize:'var(--sm,13px)',color:'#f87171'}}>
          <ShieldAlert size={18}/><span style={{fontWeight:600}}>PRE-NEWS BLOCK</span>
          <span style={{color:'var(--kt-text)'}}>{FLAGS[e.currency]} {e.currency} — {e.event}</span>
          <span style={{marginLeft:'auto',fontWeight:700,fontFamily:'var(--font-mono)'}}>{lbl}</span>
        </div>
      })}
      {events.length > 0 && <GoldBiasCard result={computeGoldBias(events)}/>}

      <div className="kt-panel" style={{marginBottom:16}}>
        <div className="kt-panel-head">
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{color:'var(--kt-text)',fontWeight:600,fontSize:'var(--md,14px)'}}>Economic Calendar</span>
            <span style={{color:'var(--kt-muted)',fontSize:'var(--xs,11px)'}}>All times WIB (UTC+7)</span>
          </div>
          {calLoading && <span style={{color:'var(--kt-muted)',fontSize:'var(--xs)'}}>Loading…</span>}
          {calError && <span style={{color:'#f87171',fontSize:'var(--xs)'}}>Failed to load</span>}
        </div>
        <div className="kt-panel-body" style={{padding:0}}>
          {!calLoading && !events.length && <div style={{padding:24,textAlign:'center',color:'var(--kt-muted)',fontSize:'var(--sm)'}}>No calendar events available.</div>}
          {Array.from(grouped.entries()).map(([dayKey,dayEvents]) => {
            const isToday = dayKey === today
            return <div key={dayKey}>
              <div style={{padding:'8px 16px',background:isToday?'rgba(245,158,11,.08)':'var(--kt-bg2,rgba(255,255,255,.03))',borderBottom:'1px solid var(--kt-border,rgba(255,255,255,.06))',display:'flex',alignItems:'center',gap:8}}>
                {isToday && <span className="kt-status-dot" style={{background:'var(--kt-gold,#f59e0b)'}}/>}
                <span style={{fontWeight:700,fontSize:'var(--sm,13px)',color:isToday?'var(--kt-gold,#f59e0b)':'var(--kt-text)',fontFamily:'var(--font-mono)'}}>
                  {wibDayLabel(dayEvents[0].time)}{isToday && <span style={{marginLeft:8,fontSize:'var(--xs)',opacity:.7}}>TODAY</span>}
                </span>
              </div>
              {dayKey === Array.from(grouped.keys())[0] && (
                <div style={{display:'grid',gridTemplateColumns:'64px 56px 1fr 72px 80px 80px 80px',padding:'6px 16px',borderBottom:'1px solid var(--kt-border,rgba(255,255,255,.06))',fontSize:'var(--xs,11px)',color:'var(--kt-muted)',fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase'}}>
                  <span>Time</span><span>Ccy</span><span>Event</span><span>Impact</span><span>Forecast</span><span>Previous</span><span>Actual</span>
                </div>
              )}
              {dayEvents.map((ev,i) => {
                const isHN = ev.impact==='HIGH'&&(()=>{const ms=new Date(ev.time).getTime()-now;return ms>0&&ms<2*3_600_000})()
                return <div key={i} style={{display:'grid',gridTemplateColumns:'64px 56px 1fr 72px 80px 80px 80px',padding:'7px 16px',borderBottom:'1px solid var(--kt-border,rgba(255,255,255,.04))',fontSize:'var(--sm,13px)',color:'var(--kt-text)',background:isHN?'rgba(239,68,68,.06)':'transparent',transition:'background .15s'}}>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:'var(--xs,12px)',color:'var(--kt-text2)'}}>{wibTime(ev.time)}</span>
                  <span title={ev.currency}>{FLAGS[ev.currency]??'🏳️'} <span style={{fontSize:'var(--xs)',color:'var(--kt-muted)'}}>{ev.currency}</span></span>
                  <span style={{color:isToday?'var(--kt-text)':'var(--kt-text2)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{ev.event}</span>
                  <span><ImpactBadge impact={ev.impact}/></span>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:'var(--xs)'}}>{ev.forecast||'—'}</span>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:'var(--xs)',color:'var(--kt-muted)'}}>{ev.previous||'—'}</span>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:'var(--xs)',fontWeight:ev.actual?700:400,color:ev.actual?'var(--kt-gold,#f59e0b)':'var(--kt-dim)'}}>{ev.actual??'—'}</span>
                </div>
              })}
            </div>
          })}
        </div>
      </div>

      {/* ═══ SECTION 2: MACRO + REGIME ═══ */}
      <div className="kt-panel" style={{marginBottom:16}}>
        <div className="kt-panel-head">
          <div style={{display:'flex',alignItems:'center',gap:8}}><Globe size={16} style={{color:'var(--kt-gold)'}}/><span style={{color:'var(--kt-text)',fontSize:'var(--md)',fontWeight:600}}>Macro Regime</span></div>
          <span className={RISK_COLORS[riskLvl]??'badge-info'}>{riskLvl} risk</span>
        </div>
        <div className="kt-panel-body">
          <div style={{display:'flex',alignItems:'baseline',gap:12,marginBottom:6}}><span className="kt-stat-value gold" style={{fontSize:'var(--xl)'}}>{regLabel.name}</span></div>
          <p style={{color:'var(--kt-text2)',fontSize:'var(--md)'}}>{regLabel.description}</p>
        </div>
      </div>

      {indList.length > 0 && <div className="kt-stat-grid kt-stat-grid-5" style={{marginBottom:16}}>
        {indList.map(ind => <div key={ind.label} className="kt-stat">
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}><TrendIcon change={ind.change}/><span className="kt-stat-label" style={{margin:0}}>{ind.label}</span></div>
          <div className="kt-stat-value">{ind.latest}</div>
        </div>)}
      </div>}

      <div className="kt-panel" style={{marginBottom:16}}>
        <div className="kt-panel-head">
          <div style={{display:'flex',alignItems:'center',gap:8}}><Activity size={16} style={{color:'var(--kt-gold)'}}/><span style={{color:'var(--kt-text)',fontSize:'var(--md)',fontWeight:600}}>Regime Analysis</span></div>
          <span className={regMeta.badge}>{regMeta.label}</span>
        </div>
        <div className="kt-panel-body">
          <p style={{color:'var(--kt-text2)',fontSize:'var(--md)',marginBottom:12}}>{regMeta.desc}</p>
          <div className="kt-stat-grid kt-stat-grid-4" style={{gap:12}}>
            <div className="kt-stat"><div className="kt-stat-label">DXY</div><div className="kt-stat-value">{macroData?.dxy?.toFixed(2)??'—'}</div></div>
            <div className="kt-stat"><div className="kt-stat-label">10Y</div><div className="kt-stat-value">{macroData?.dgs10?.toFixed(3)??'—'}%</div></div>
            <div className="kt-stat"><div className="kt-stat-label">2Y</div><div className="kt-stat-value">{macroData?.dgs2?.toFixed(3)??'—'}%</div></div>
            <div className="kt-stat">
              <div style={{display:'flex',alignItems:'center',gap:6}}><DirArrow v={curve}/><span className="kt-stat-label" style={{margin:0}}>Spread</span></div>
              <div className="kt-stat-value" style={{color:curve>0?'var(--kt-up)':'var(--kt-dn)'}}>{curve.toFixed(3)}%</div>
              <span style={{color:curve>0?'var(--kt-up)':'var(--kt-dn)',fontSize:'var(--xs)'}}>{curve>0?'Normal':'Inverted'}</span>
            </div>
          </div>
          <div style={{marginTop:12,padding:'8px 12px',borderLeft:`3px solid ${regMeta.color}`,background:'var(--kt-bg2)',borderRadius:4,fontSize:'var(--sm)',color:'var(--kt-text)'}}>{IMPLICATIONS[regType]}</div>
        </div>
      </div>

      <div className="kt-panel" style={{marginBottom:16}}>
        <div className="kt-panel-head">
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {(regType==='stagflation'||regType==='deflation') ? <AlertTriangle size={16} style={{color:'var(--kt-gold)'}}/> : <Activity size={16} style={{color:'var(--kt-gold)'}}/>}
            <span style={{color:'var(--kt-text)',fontSize:'var(--md)',fontWeight:600}}>Pair Bias — {regMeta.label}</span>
          </div>
        </div>
        <div className="kt-panel-body" style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'var(--sm)',fontFamily:'var(--font-mono)'}}>
            <thead><tr style={{borderBottom:'1px solid var(--kt-border)'}}><th style={{textAlign:'left',padding:'8px 12px',color:'var(--kt-muted)',fontWeight:500}}>Pair</th><th style={{textAlign:'left',padding:'8px 12px',color:'var(--kt-muted)',fontWeight:500}}>Bias</th></tr></thead>
            <tbody>{Object.entries(pairBias).map(([p,b])=><tr key={p} style={{borderBottom:'1px solid var(--kt-border)'}}><td style={{padding:'8px 12px',color:'var(--kt-text)',fontWeight:700}}>{p}</td><td style={{padding:'8px 12px',color:'var(--kt-text2)'}}>{b}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      {macroRegime?.signals && Object.keys(macroRegime.signals).length > 0 && (
        <div className="kt-panel" style={{marginBottom:16}}>
          <div className="kt-panel-head"><div style={{display:'flex',alignItems:'center',gap:8}}><Shield size={16} style={{color:'var(--kt-gold)'}}/><span style={{color:'var(--kt-text)',fontSize:'var(--md)',fontWeight:600}}>Regime Signals</span></div></div>
          <div className="kt-panel-body" style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'var(--sm)',fontFamily:'var(--font-mono)'}}>
              <thead><tr style={{borderBottom:'1px solid var(--kt-border)'}}><th style={{textAlign:'left',padding:'8px 12px',color:'var(--kt-muted)',fontWeight:500}}>Signal</th><th style={{textAlign:'right',padding:'8px 12px',color:'var(--kt-muted)',fontWeight:500}}>Value</th><th style={{textAlign:'right',padding:'8px 12px',color:'var(--kt-muted)',fontWeight:500}}>Δ</th></tr></thead>
              <tbody>{Object.entries(macroRegime.signals).map(([k,v])=>{const sv=v as any;return <tr key={k} style={{borderBottom:'1px solid var(--kt-border)'}}><td style={{padding:'8px 12px',color:'var(--kt-text)',fontWeight:700}}>{k.toUpperCase()}</td><td style={{padding:'8px 12px',textAlign:'right'}}>{sv?.value??sv?.latest??'—'}</td><td style={{padding:'8px 12px',textAlign:'right'}}><TrendIcon change={sv?.change??0}/></td></tr>})}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ SECTION 3: SENTIMENT + CENTRAL BANK ═══ */}
      <div className="kt-panel" style={{marginBottom:16}}>
        <div className="kt-panel-head">
          <div style={{display:'flex',alignItems:'center',gap:8}}><BarChart3 size={16} style={{color:'var(--kt-gold)'}}/><span style={{color:'var(--kt-text)',fontSize:'var(--md)',fontWeight:600}}>COT — Institutional Positioning</span></div>
          {cot?.[0]?.reportDate && <span style={{color:'var(--kt-muted)',fontSize:'var(--xs)',fontFamily:'var(--font-mono)'}}>Report: {cot[0].reportDate}</span>}
        </div>
        <div className="kt-panel-body">
          <div className="kt-grid-4" style={{gap:12}}>
            {cot?.map(e => {
              const bp = e.openInterest>0?Math.abs(e.netPosition)/e.openInterest:0, isL = e.netPosition>0
              return <div key={e.pair} className="kt-card-pad" style={{borderLeft:`3px solid ${e.bias==='bullish'?'var(--kt-up)':e.bias==='bearish'?'var(--kt-dn)':'var(--kt-muted)'}`}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <span style={{color:'var(--kt-text)',fontWeight:700,fontSize:'var(--md)',fontFamily:'var(--font-mono)'}}>{e.label}</span><BiasBadge bias={e.bias}/>
                </div>
                <div style={{marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{color:'var(--kt-text2)',fontSize:'var(--xs)'}}>Net: {isL?'+':''}{(e.netPosition/1000).toFixed(1)}K</span>
                    <ChgArrow v={e.netChange}/>
                  </div>
                  <div style={{height:8,background:'var(--kt-bg2)',borderRadius:4,overflow:'hidden',position:'relative'}}>
                    <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:1,background:'var(--kt-border)',zIndex:1}}/>
                    <div style={{position:'absolute',height:'100%',borderRadius:4,...(isL?{left:'50%',width:`${bp*50}%`,background:'var(--kt-up)'}:{right:'50%',width:`${bp*50}%`,background:'var(--kt-dn)'})}}/>
                  </div>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'var(--xs)',color:'var(--kt-muted)'}}>
                  <span>L: {(e.longs/1000).toFixed(0)}K</span><span>S: {(e.shorts/1000).toFixed(0)}K</span><span>Chg: <ChgArrow v={e.netChange}/></span>
                </div>
                <div style={{marginTop:8,padding:'4px 8px',background:'var(--kt-bg2)',borderRadius:4,fontSize:'var(--xs)',color:e.bias==='bullish'?'var(--kt-up)':e.bias==='bearish'?'var(--kt-dn)':'var(--kt-muted)'}}>
                  {e.bias==='bullish'?'⚡ Institutions net long':e.bias==='bearish'?'⚡ Institutions net short':'— Neutral'}
                </div>
              </div>
            })}
          </div>
        </div>
      </div>

      <div className="kt-panel" style={{marginBottom:16}}>
        <div className="kt-panel-head"><div style={{display:'flex',alignItems:'center',gap:8}}><Activity size={16} style={{color:'var(--kt-gold)'}}/><span style={{color:'var(--kt-text)',fontSize:'var(--md)',fontWeight:600}}>Retail Positioning</span></div></div>
        <div className="kt-panel-body">
          <div className="kt-grid-2" style={{gap:12}}>
            {RETAIL.map(r => <div key={r.pair} className="kt-card-pad">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <span style={{color:'var(--kt-text)',fontWeight:700,fontFamily:'var(--font-mono)',fontSize:'var(--md)'}}>{r.pair}</span><SigBadge signal={r.signal}/>
              </div>
              <div style={{display:'flex',height:24,borderRadius:4,overflow:'hidden',marginBottom:6}}>
                <div style={{width:`${r.longPct}%`,background:'rgba(0,200,120,.6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'var(--xs)',fontWeight:600,color:'#fff',fontFamily:'var(--font-mono)'}}>{r.longPct}% Long</div>
                <div style={{width:`${r.shortPct}%`,background:'rgba(255,60,60,.6)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'var(--xs)',fontWeight:600,color:'#fff',fontFamily:'var(--font-mono)'}}>{r.shortPct}% Short</div>
              </div>
              <div style={{fontSize:'var(--xs)',color:'var(--kt-muted)'}}>{r.longPct>65?'⚠ Retail heavily long — contrarian bearish':r.shortPct>65?'⚡ Retail heavily short — contrarian bullish':'— Balanced'}</div>
            </div>)}
          </div>
        </div>
      </div>

      <div className="kt-panel" style={{marginBottom:16}}>
        <div className="kt-panel-head"><div style={{display:'flex',alignItems:'center',gap:8}}><AlertTriangle size={16} style={{color:'var(--kt-gold)'}}/><span style={{color:'var(--kt-text)',fontSize:'var(--md)',fontWeight:600}}>Contrarian Signals</span></div></div>
        <div className="kt-panel-body">
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {RETAIL.filter(r=>r.longPct>60||r.shortPct>60).map(r=>{
              const heavy = r.longPct>60
              return <div key={r.pair} className="kt-card-pad" style={{display:'flex',alignItems:'center',gap:12,borderLeft:`3px solid ${heavy?'var(--kt-dn)':'var(--kt-up)'}`}}>
                {heavy?<TrendingDown size={18} style={{color:'var(--kt-dn)',flexShrink:0}}/>:<TrendingUp size={18} style={{color:'var(--kt-up)',flexShrink:0}}/>}
                <div><div style={{color:'var(--kt-text)',fontWeight:600,fontSize:'var(--sm)'}}>Retail {heavy?'heavily long':'heavily short'} {r.pair}</div><div style={{color:'var(--kt-text2)',fontSize:'var(--xs)'}}>{heavy?`→ Smart money likely short`:`→ Smart money likely long`}</div></div>
                <span style={{marginLeft:'auto'}}>{heavy?<span className="badge-bear">BEARISH</span>:<span className="badge-bull">BULLISH</span>}</span>
              </div>
            })}
            {cot?.filter(e=>e.bias!=='neutral').map(e=>(
              <div key={e.pair} className="kt-card-pad" style={{display:'flex',alignItems:'center',gap:12,borderLeft:`3px solid ${e.bias==='bullish'?'var(--kt-up)':'var(--kt-dn)'}`}}>
                {e.bias==='bullish'?<ShieldCheck size={18} style={{color:'var(--kt-up)',flexShrink:0}}/>:<AlertTriangle size={18} style={{color:'var(--kt-dn)',flexShrink:0}}/>}
                <div><div style={{color:'var(--kt-text)',fontWeight:600,fontSize:'var(--sm)'}}>COT: Institutions net {e.bias==='bullish'?'long':'short'} {e.label}</div><div style={{color:'var(--kt-text2)',fontSize:'var(--xs)'}}>Net {(e.netPosition/1000).toFixed(1)}K contracts{e.netChange!==0&&` (${e.netChange>0?'+':''}${(e.netChange/1000).toFixed(1)}K WoW)`}</div></div>
                <span style={{marginLeft:'auto'}}>{e.bias==='bullish'?<span className="badge-bull">BULLISH</span>:<span className="badge-bear">BEARISH</span>}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="kt-panel" style={{marginBottom:16}}>
        <div className="kt-panel-head"><div style={{display:'flex',alignItems:'center',gap:8}}><Landmark size={16} style={{color:'var(--kt-gold)'}}/><span style={{color:'var(--kt-text)',fontSize:'var(--md)',fontWeight:600}}>Central Bank Watch</span></div></div>
        <div className="kt-panel-body">
          <div className="kt-grid-3" style={{gap:12}}>
            {CB_LIST.map(cb=>{
              const nd = cbNextDate(events,cb.kw), dec = cbDecision(events,cb.kw)
              return <div key={cb.name} className="kt-card kt-card-pad">
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}><span style={{fontSize:20}}>{cb.flag}</span><span style={{fontWeight:600,color:'var(--kt-text)',fontSize:'var(--md)'}}>{cb.name}</span></div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><span className="kt-stat-label" style={{margin:0}}>Rate</span><span className="mono kt-stat-value">{cb.rate.toFixed(2)}%</span></div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><span className="kt-stat-label" style={{margin:0}}>Decision</span><span className="mono" style={{color:decColor(dec),fontWeight:600}}>{dec}</span></div>
                <div style={{display:'flex',justifyContent:'space-between'}}><span className="kt-stat-label" style={{margin:0}}>Next</span><span className="mono" style={{color:'var(--kt-text2)'}}>{nd??'TBD'}</span></div>
              </div>
            })}
          </div>
        </div>
      </div>

      <div className="kt-panel" style={{marginBottom:16}}>
        <div className="kt-panel-head"><div style={{display:'flex',alignItems:'center',gap:8}}><TrendingUp size={16} style={{color:'var(--kt-gold)'}}/><span style={{color:'var(--kt-text)',fontSize:'var(--md)',fontWeight:600}}>US Yield Curve + Rate Comparison</span></div></div>
        <div className="kt-panel-body">
          <div className="kt-stat-grid kt-stat-grid-4">
            <div className="kt-stat"><div className="kt-stat-label">3M</div><div className="kt-stat-value mono">{macroData?.dtb3!=null?`${macroData.dtb3}%`:'N/A'}</div></div>
            <div className="kt-stat"><div className="kt-stat-label">2Y</div><div className="kt-stat-value mono">{macroData?.dgs2!=null?`${macroData.dgs2}%`:'N/A'}</div></div>
            <div className="kt-stat"><div className="kt-stat-label">10Y</div><div className="kt-stat-value mono">{macroData?.dgs10!=null?`${macroData.dgs10}%`:'N/A'}</div></div>
            <div className="kt-stat"><div className="kt-stat-label">Spread</div><div className="kt-stat-value mono" style={{color:curve>0?'var(--kt-up)':'var(--kt-dn)'}}>{curve>0?'+':''}{curve.toFixed(3)}%</div></div>
          </div>
          <div style={{marginTop:12}}>
            <div style={{fontSize:'var(--xs)',color:'var(--kt-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:8}}>Rate Comparison</div>
            {[...CB_LIST].sort((a,b)=>b.rate-a.rate).map(cb=>(
              <div key={cb.name} style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                <span style={{fontSize:16}}>{cb.flag}</span>
                <span className="mono" style={{color:'var(--kt-text)',width:100,fontSize:13,flexShrink:0}}>{cb.name}</span>
                <div style={{flex:1,background:'var(--kt-bg2)',borderRadius:6,height:18,overflow:'hidden'}}>
                  <div style={{width:`${(cb.rate/maxRate)*100}%`,height:'100%',background:'var(--kt-gold)',borderRadius:6,transition:'width .4s ease'}}/>
                </div>
                <span className="mono" style={{color:'var(--kt-gold)',fontWeight:600,width:50,textAlign:'right',fontSize:13}}>{cb.rate.toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="kt-panel">
        <div className="kt-panel-head">
          <div style={{display:'flex',alignItems:'center',gap:8}}><BarChart3 size={16} style={{color:'var(--kt-gold)'}}/><span style={{color:'var(--kt-text)',fontSize:'var(--md)',fontWeight:600}}>Positioning Changes Heatmap</span></div>
          <span style={{color:'var(--kt-muted)',fontSize:'var(--xs)'}}>Week-over-week</span>
        </div>
        <div className="kt-panel-body" style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'var(--sm)',fontFamily:'var(--font-mono)'}}>
            <thead><tr style={{borderBottom:'1px solid var(--kt-border)'}}>
              {['Pair','Net Pos','Net Chg','Long Chg','Short Chg','OI','Bias'].map(h=><th key={h} style={{textAlign:h==='Pair'?'left':h==='Bias'?'center':'right',padding:'8px 12px',color:'var(--kt-muted)',fontWeight:500}}>{h}</th>)}
            </tr></thead>
            <tbody>{cot?.map(e=>(
              <tr key={e.pair} style={{borderBottom:'1px solid var(--kt-border)'}}>
                <td style={{padding:'8px 12px',color:'var(--kt-text)',fontWeight:700}}>{e.label}</td>
                <td style={{padding:'8px 12px',textAlign:'right',color:e.netPosition>0?'var(--kt-up)':e.netPosition<0?'var(--kt-dn)':'var(--kt-muted)'}}>{e.netPosition>0?'+':''}{(e.netPosition/1000).toFixed(1)}K</td>
                <td style={{padding:'8px 12px',textAlign:'right'}}><div style={{display:'inline-block',padding:'2px 8px',borderRadius:4,fontWeight:600,...HeatBg({v:e.netChange,max:maxChg}),color:e.netChange>0?'var(--kt-up)':e.netChange<0?'var(--kt-dn)':'var(--kt-muted)'}}>{e.netChange>0?'+':''}{(e.netChange/1000).toFixed(1)}K</div></td>
                <td style={{padding:'8px 12px',textAlign:'right'}}><div style={{display:'inline-block',padding:'2px 8px',borderRadius:4,...HeatBg({v:e.changeLong,max:maxChg}),color:e.changeLong>0?'var(--kt-up)':e.changeLong<0?'var(--kt-dn)':'var(--kt-muted)'}}>{e.changeLong>0?'+':''}{(e.changeLong/1000).toFixed(1)}K</div></td>
                <td style={{padding:'8px 12px',textAlign:'right'}}><div style={{display:'inline-block',padding:'2px 8px',borderRadius:4,...HeatBg({v:e.changeShort,max:maxChg}),color:e.changeShort>0?'var(--kt-up)':e.changeShort<0?'var(--kt-dn)':'var(--kt-muted)'}}>{e.changeShort>0?'+':''}{(e.changeShort/1000).toFixed(1)}K</div></td>
                <td style={{padding:'8px 12px',textAlign:'right',color:'var(--kt-muted)'}}>{(e.openInterest/1000).toFixed(0)}K</td>
                <td style={{padding:'8px 12px',textAlign:'center'}}><BiasBadge bias={e.bias}/></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
