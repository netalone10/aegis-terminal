// adaptive-scoring.js — Read performance history, generate weights for signal engine
// Called by signal engine before generating signals. Returns adjusted weights.

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', port: 5432, database: 'aegis_terminal',
  user: 'aegis', password: 'aegis_terminal_2026',
});

const MIN_SIGNALS_FOR_ADJUSTMENT = 5; // Need at least 5 signals per category

// Default weights (before adaptation)
const DEFAULT_WEIGHTS = {
  // Layer weights in confluence scoring
  smc_weight: 1.0,
  tech_weight: 1.0,
  vol_weight: 1.0,

  // Setup type weights
  fvg_weight: 1.0,
  ob_weight: 1.0,
  rsi_weight: 1.0,

  // Per-symbol adjustments (additive to confidence)
  symbol_adjustments: {},

  // Per-bias adjustments
  bias_adjustments: { bullish: 0, bearish: 0 },

  // Confidence floor (signals below this get filtered)
  min_confidence: 60,

  // Metadata
  last_updated: null,
  sample_size: 0,
};

async function calculateSymbolWeights() {
  const result = await pool.query(`
    SELECT
      symbol,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE hit_tp = true) as wins,
      AVG(pnl_pct) as avg_pnl
    FROM crypto_signals
    WHERE status != 'active'
    GROUP BY symbol
    HAVING COUNT(*) >= $1
  `, [MIN_SIGNALS_FOR_ADJUSTMENT]);

  const adjustments = {};
  for (const row of result.rows) {
    const winRate = parseInt(row.wins) / parseInt(row.total);
    // Map win rate to adjustment: 50% = 0, 70% = +5, 30% = -5
    adjustments[row.symbol] = Math.round((winRate - 0.5) * 25 * 10) / 10;
  }
  return adjustments;
}

async function calculateBiasWeights() {
  const result = await pool.query(`
    SELECT
      bias,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE hit_tp = true) as wins,
      AVG(pnl_pct) as avg_pnl
    FROM crypto_signals
    WHERE status != 'active'
    GROUP BY bias
    HAVING COUNT(*) >= $1
  `, [MIN_SIGNALS_FOR_ADJUSTMENT]);

  const adjustments = { bullish: 0, bearish: 0 };
  for (const row of result.rows) {
    const winRate = parseInt(row.wins) / parseInt(row.total);
    adjustments[row.bias] = Math.round((winRate - 0.5) * 20 * 10) / 10;
  }
  return adjustments;
}

async function calculateLayerWeights() {
  // Analyze which layer (SMC, Tech, Vol) contributed most to winning signals
  const result = await pool.query(`
    SELECT
      confluence_score,
      confluence->>'agreeCount' as agree_count,
      bias,
      hit_tp,
      pnl_pct
    FROM crypto_signals
    WHERE status != 'active'
      AND confluence IS NOT NULL
  `);

  if (result.rows.length < MIN_SIGNALS_FOR_ADJUSTMENT) {
    return { smc_weight: 1.0, tech_weight: 1.0, vol_weight: 1.0 };
  }

  // Simplified layer weight calculation based on agreeCount
  let highAgreeCorrect = 0, highAgreeTotal = 0;
  let lowAgreeCorrect = 0, lowAgreeTotal = 0;

  for (const row of result.rows) {
    const agreeCount = parseInt(row.agree_count) || 0;
    const won = row.hit_tp === true;

    if (agreeCount >= 3) {
      highAgreeTotal++;
      if (won) highAgreeCorrect++;
    } else if (agreeCount >= 2) {
      lowAgreeTotal++;
      if (won) lowAgreeCorrect++;
    }
  }

  // If high agreement signals perform better, give SMC more weight
  const highAgreeRate = highAgreeTotal > 0 ? highAgreeCorrect / highAgreeTotal : 0.5;
  const lowAgreeRate = lowAgreeTotal > 0 ? lowAgreeCorrect / lowAgreeTotal : 0.5;

  // Default equal weights, adjusted by performance
  const total = 3.0;
  return {
    smc_weight: Math.round((0.5 + highAgreeRate * 0.5) * 100) / 100,
    tech_weight: Math.round((0.5 + lowAgreeRate * 0.3) * 100) / 100,
    vol_weight: Math.round((total - (0.5 + highAgreeRate * 0.5) - (0.5 + lowAgreeRate * 0.3)) * 100) / 100,
  };
}

async function calculateConfidenceThreshold() {
  // Analyze win rate by confidence bucket to find optimal threshold
  const result = await pool.query(`
    SELECT
      CASE
        WHEN confidence >= 80 THEN 80
        WHEN confidence >= 70 THEN 70
        WHEN confidence >= 60 THEN 60
        ELSE 50
      END as bucket,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE hit_tp = true) as wins
    FROM crypto_signals
    WHERE status != 'active'
    GROUP BY bucket
    ORDER BY bucket DESC
  `);

  // Find lowest bucket with >50% win rate
  let threshold = 60; // default
  for (const row of result.rows) {
    const winRate = parseInt(row.wins) / parseInt(row.total);
    if (winRate >= 0.5) {
      threshold = parseInt(row.bucket);
    }
  }

  return threshold;
}

async function generateWeights() {
  const [symbolAdj, biasAdj, layerWeights, confThreshold] = await Promise.all([
    calculateSymbolWeights(),
    calculateBiasWeights(),
    calculateLayerWeights(),
    calculateConfidenceThreshold(),
  ]);

  // Count total closed signals for metadata
  const countResult = await pool.query(
    "SELECT COUNT(*) as count FROM crypto_signals WHERE status != 'active'"
  );

  const weights = {
    ...DEFAULT_WEIGHTS,
    ...layerWeights,
    symbol_adjustments: symbolAdj,
    bias_adjustments: biasAdj,
    min_confidence: confThreshold,
    last_updated: new Date().toISOString(),
    sample_size: parseInt(countResult.rows[0].count),
  };

  // Store weights
  await pool.query(
    `INSERT INTO adaptive_weights (weights, sample_size, generated_at)
     VALUES ($1, $2, NOW())`,
    [JSON.stringify(weights), weights.sample_size]
  );

  return weights;
}

async function getWeights() {
  // Get latest weights
  const result = await pool.query(
    `SELECT weights FROM adaptive_weights ORDER BY generated_at DESC LIMIT 1`
  );

  if (result.rows.length > 0) {
    return result.rows[0].weights;
  }

  // No weights yet — generate from defaults
  return DEFAULT_WEIGHTS;
}

async function applyAdaptation(signal, weights) {
  // Apply symbol adjustment
  const symbolAdj = weights.symbol_adjustments?.[signal.symbol] || 0;

  // Apply bias adjustment
  const biasAdj = weights.bias_adjustments?.[signal.bias] || 0;

  // Adjust confidence
  const adjustedConfidence = Math.min(95, Math.max(20,
    signal.confidence + symbolAdj + biasAdj
  ));

  return {
    ...signal,
    confidence: Math.round(adjustedConfidence),
    adjustments: {
      symbol: symbolAdj,
      bias: biasAdj,
      total: Math.round(symbolAdj + biasAdj),
    },
  };
}

// ─── Main ──────────────────────────────────────────────────
async function main() {
  console.log('[Adaptive] Generating weights...');
  const weights = await generateWeights();

  console.log('\n=== Adaptive Weights ===');
  console.log(`Sample size: ${weights.sample_size} signals`);
  console.log(`Layer weights: SMC=${weights.smc_weight}, Tech=${weights.tech_weight}, Vol=${weights.vol_weight}`);
  console.log(`Min confidence: ${weights.min_confidence}%`);
  console.log('Symbol adjustments:', weights.symbol_adjustments);
  console.log('Bias adjustments:', weights.bias_adjustments);

  await pool.end();
  process.exit(0);
}

if (require.main === module) {
  main().catch(err => { console.error(err); pool.end(); process.exit(1); });
} else {
  module.exports = { generateWeights, getWeights, applyAdaptation };
}
