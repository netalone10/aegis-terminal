import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface Coin {
  symbol: string;
  rank: number;
  volume_24h: number;
}

export function CryptoScreener() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/crypto/screening')
      .then(res => res.json())
      .then(data => {
        setCoins(data.symbols || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Crypto Screener</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {coins.map(coin => (
          <Link
            key={coin.symbol}
            to={`/crypto/${coin.symbol}`}
            className="bg-zinc-800 rounded-lg p-4 hover:bg-zinc-700 transition"
          >
            <div className="text-lg font-semibold">{coin.symbol.replace('USDT', '')}</div>
            <div className="text-sm text-zinc-400">#{coin.rank}</div>
            <div className="text-sm text-zinc-400">
              Vol: ${(coin.volume_24h / 1e9).toFixed(2)}B
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
