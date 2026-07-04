import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface Signal {
  id: number;
  symbol: string;
  timeframe: string;
  bias: string;
  confidence: number;
  price: number;
  setups: Array<{
    type: string;
    entry: number;
    sl: number;
    tp: number;
    rr: number;
  }>;
  created_at: string;
}

export function CryptoSignals() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/crypto/signals?limit=50')
      .then(res => res.json())
      .then(data => {
        setSignals(data.signals || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Active Signals</h1>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-zinc-400 border-b border-zinc-700">
              <th className="pb-2">Symbol</th>
              <th className="pb-2">TF</th>
              <th className="pb-2">Bias</th>
              <th className="pb-2">Conf</th>
              <th className="pb-2">Entry</th>
              <th className="pb-2">SL</th>
              <th className="pb-2">TP</th>
              <th className="pb-2">R:R</th>
            </tr>
          </thead>
          <tbody>
            {signals.map(signal => (
              <tr key={signal.id} className="border-b border-zinc-800">
                <td className="py-2">
                  <Link to={`/crypto/${signal.symbol}`} className="text-blue-400 hover:underline">
                    {signal.symbol}
                  </Link>
                </td>
                <td className="py-2">{signal.timeframe}</td>
                <td className="py-2">
                  <span className={signal.bias === 'bullish' ? 'text-green-400' : signal.bias === 'bearish' ? 'text-red-400' : 'text-zinc-400'}>
                    {signal.bias}
                  </span>
                </td>
                <td className="py-2">{signal.confidence}%</td>
                <td className="py-2">${signal.setups[0]?.entry.toFixed(2) || '-'}</td>
                <td className="py-2">${signal.setups[0]?.sl.toFixed(2) || '-'}</td>
                <td className="py-2">${signal.setups[0]?.tp.toFixed(2) || '-'}</td>
                <td className="py-2">{signal.setups[0]?.rr || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
