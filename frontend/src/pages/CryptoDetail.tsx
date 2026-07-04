import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface Setup {
  type: string;
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  reason: string;
}

interface Signal {
  id: number;
  symbol: string;
  timeframe: string;
  bias: string;
  confidence: number;
  price: number;
  structure: any;
  technical: any;
  volume: any;
  setups: Setup[];
  reasoning: string;
  created_at: string;
}

export function CryptoDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/crypto/signals?symbol=${symbol}&limit=1`)
      .then(res => res.json())
      .then(data => {
        setSignal(data.signals?.[0] || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symbol]);

  if (loading) return <div className="p-4">Loading...</div>;
  if (!signal) return <div className="p-4">No active signal for {symbol}</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">{symbol}</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Signal Info */}
        <div className="bg-zinc-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Signal</h2>
          <div className="space-y-2">
            <div>Bias: <span className={signal.bias === 'bullish' ? 'text-green-400' : 'text-red-400'}>{signal.bias}</span></div>
            <div>Confidence: {signal.confidence}%</div>
            <div>Price: ${signal.price.toFixed(2)}</div>
            <div>Timeframe: {signal.timeframe}</div>
          </div>
        </div>

        {/* Setups */}
        <div className="bg-zinc-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Setups</h2>
          {signal.setups.map((setup, i) => (
            <div key={i} className="mb-4 last:mb-0">
              <div className="font-semibold">{setup.type.toUpperCase()}</div>
              <div>Entry: ${setup.entry.toFixed(2)}</div>
              <div>SL: ${setup.sl.toFixed(2)}</div>
              <div>TP: ${setup.tp.toFixed(2)}</div>
              <div>R:R: {setup.rr}</div>
              <div className="text-sm text-zinc-400">{setup.reason}</div>
            </div>
          ))}
        </div>

        {/* Technical */}
        <div className="bg-zinc-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Technical</h2>
          <div className="space-y-2">
            <div>RSI: {signal.technical.rsi.value.toFixed(0)} ({signal.technical.rsi.zone})</div>
            <div>MACD: {signal.technical.macd.signal}</div>
            <div>ATR: {signal.technical.atr.toFixed(2)}</div>
          </div>
        </div>

        {/* Reasoning */}
        <div className="bg-zinc-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-2">Reasoning</h2>
          <p className="text-zinc-300">{signal.reasoning}</p>
        </div>
      </div>
    </div>
  );
}
