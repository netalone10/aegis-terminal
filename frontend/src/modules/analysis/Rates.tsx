import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

type RatesResponse = {
  status: string
  data: {
    rates: Record<string, number | null>
    spreads: { '2Y-10Y': string | null; '3M-10Y': string | null }
    curveShape: string
  }
}

const rateLabels: Record<string, string> = {
  '3M': '3-Month T-Bill', '6M': '6-Month T-Bill', '1Y': '1-Year Treasury',
  '2Y': '2-Year Treasury', '5Y': '5-Year Treasury', '10Y': '10-Year Treasury', '30Y': '30-Year Treasury',
}

function RateCard({ name, value }: { name: string; value: number | null }) {
  return (
    <div className="kt-stat">
      <div className="kt-stat-label">{rateLabels[name] || name}</div>
      <div className="kt-stat-value" style={{ marginTop: 4 }}>
        {value != null ? `${value.toFixed(2)}%` : 'N/A'}
      </div>
    </div>
  )
}

export default function Rates() {
  const { data, isLoading } = useQuery<RatesResponse>({
    queryKey: ['rates-data'],
    queryFn: () => api('/api/macro/rates'),
    staleTime: 300_000,
    refetchInterval: 300_000,
    retry: false,
  })

  const rates = data?.data?.rates ?? {}
  const spreads: Record<string, string | null> = data?.data?.spreads ?? {}
  const curveShape = data?.data?.curveShape ?? 'N/A'

  return (
    <div>
      <div className="kt-route-head">
        <div>
          <div className="kt-kicker">Rate & Obligasi</div>
          <h1>US Treasury Yields</h1>
          <p>Bentuk kurva yield dan konteks rate untuk posisi emas / USD</p>
        </div>
        <div className="kt-route-actions">
          <span className="kt-status-dot" />
          <span>Auto-refresh 5min</span>
        </div>
      </div>

      {isLoading ? (
        <div className="kt-stat-grid kt-stat-grid-4">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="kt-stat">
              <div className="skeleton w-16 h-3 mb-3" />
              <div className="skeleton w-24 h-7" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="kt-stat-grid kt-stat-grid-4">
            {Object.entries(rateLabels).map(([key]) => (
              <RateCard key={key} name={key} value={rates[key]} />
            ))}
          </div>

          <div className="kt-section" style={{ marginTop: 16 }}>
            <div className="kt-stat-grid kt-stat-grid-3">
              <div className="kt-stat">
                <div className="kt-stat-label">2Y-10Y Spread</div>
                <div className="kt-stat-value" style={{ marginTop: 4 }}>
                  {spreads['2Y-10Y'] ?? 'N/A'}
                </div>
              </div>
              <div className="kt-stat">
                <div className="kt-stat-label">3M-10Y Spread</div>
                <div className="kt-stat-value" style={{ marginTop: 4 }}>
                  {spreads['3M-10Y'] ?? 'N/A'}
                </div>
              </div>
              <div className="kt-stat">
                <div className="kt-stat-label">Curve Shape</div>
                <div className="kt-stat-value gold" style={{ marginTop: 4 }}>
                  {curveShape}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
