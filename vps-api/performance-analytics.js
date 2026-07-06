// performance-analytics.js — Generate performance reports for signal improvement
// Runs daily. Calculates win rate, avg PnL, performance by symbol/bias/setup/confidence.

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost', port: 5432, database: 'aegis_terminal',
  user: 'aegis', password: 'aegis_terminal_2026',
});

async function generateReport(days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Overall stats
  const overall = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE hit_tp = true) as wins,
      COUNT(*) FILTER (WHERE hit_sl = true) as losses,
      COUNT(*) FILTER (WHERE status = 'expired') as expired,
      AVG(pnl_pct) as avg_pnl,
      SUM(pnl_pct) as total_pnl,
      AVG(risk_reward) as avg_rr_planned
    FROM crypto_signals
    WHERE created_at >= $1 AND status != 'active'
  `, [since]);

  // By symbol
  const bySymbol = await pool.query(`
    SELECT
      symbol,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE hit_tp = true) as wins,
      COUNT(*) FILTER (WHERE hit_sl = true) as losses,
      AVG(pnl_pct) as avg_pnl,
      SUM(pnl_pct) as total_pnl
    FROM crypto_signals
    WHERE created_at >= $1 AND status != 'active'
    GROUP BY symbol
    ORDER BY total DESC
  `, [since]);

  // By bias
  const byBias = await pool.query(`
    SELECT
      bias,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE hit_tp = true) as wins,
      COUNT(*) FILTER (WHERE hit_sl = true) as losses,
      AVG(pnl_pct) as avg_pnl
    FROM crypto_signals
    WHERE created_at >= $1 AND status != 'active'
    GROUP BY bias
  `, [since]);

  // By confidence bucket
  const byConfidence = await pool.query(`
    SELECT
      CASE
        WHEN confidence >= 80 THEN '80+'
        WHEN confidence >= 70 THEN '70-79'
        WHEN confidence >= 60 THEN '60-69'
        ELSE '<60'
      END as bucket,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE hit_tp = true) as wins,
      COUNT(*) FILTER (WHERE hit_sl = true) as losses,
      AVG(pnl_pct) as avg_pnl
    FROM crypto_signals
    WHERE created_at >= $1 AND status != 'active'
    GROUP BY bucket
    ORDER BY bucket DESC
  `, [since]);

  // By setup type (from JSONB setups array)
  const bySetup = await pool.query(`
    SELECT
      setup->>'type' as setup_type,
      setup->>'direction' as direction,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE s.hit_tp = true) as wins,
      COUNT(*) FILTER (WHERE s.hit_sl = true) as losses,
      AVG(s.pnl_pct) as avg_pnl
    FROM crypto_signals s,
         LATERAL jsonb_array_elements(s.setups) as setup
    WHERE s.created_at >= $1 AND s.status != 'active'
      AND setup->>'type' = 'primary'
    GROUP BY setup->>'type', setup->>'direction'
  `, [since]);

  // PnL curve (daily)
  const dailyPnl = await pool.query(`
    SELECT
      DATE(closed_at) as day,
      COUNT(*) as signals,
      SUM(pnl_pct) as daily_pnl,
      AVG(pnl_pct) as avg_pnl
    FROM crypto_signals
    WHERE closed_at >= $1 AND status != 'active'
    GROUP BY DATE(closed_at)
    ORDER BY day
  `, [since]);

  // Holding time
  const holdingTime = await pool.query(`
    SELECT
      AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600) as avg_hours,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600) as median_hours
    FROM crypto_signals
    WHERE closed_at >= $1 AND status != 'active'
  `, [since]);

  const total = parseInt(overall.rows[0].total) || 0;
  const wins = parseInt(overall.rows[0].wins) || 0;
  const losses = parseInt(overall.rows[0].losses) || 0;

  const report = {
    period: { days, since },
    overall: {
      total,
      wins,
      losses,
      expired: parseInt(overall.rows[0].expired) || 0,
      win_rate: total > 0 ? Math.round(wins / total * 100) : 0,
      avg_pnl: overall.rows[0].avg_pnl ? Math.round(parseFloat(overall.rows[0].avg_pnl) * 100) / 100 : 0,
      total_pnl: overall.rows[0].total_pnl ? Math.round(parseFloat(overall.rows[0].total_pnl) * 100) / 100 : 0,
      avg_rr_planned: overall.rows[0].avg_rr_planned ? Math.round(parseFloat(overall.rows[0].avg_rr_planned) * 10) / 10 : 0,
    },
    by_symbol: bySymbol.rows.map(r => ({
      symbol: r.symbol,
      total: parseInt(r.total),
      wins: parseInt(r.wins),
      losses: parseInt(r.losses),
      win_rate: parseInt(r.total) > 0 ? Math.round(parseInt(r.wins) / parseInt(r.total) * 100) : 0,
      avg_pnl: r.avg_pnl ? Math.round(parseFloat(r.avg_pnl) * 100) / 100 : 0,
      total_pnl: r.total_pnl ? Math.round(parseFloat(r.total_pnl) * 100) / 100 : 0,
    })),
    by_bias: byBias.rows.map(r => ({
      bias: r.bias,
      total: parseInt(r.total),
      wins: parseInt(r.wins),
      losses: parseInt(r.losses),
      win_rate: parseInt(r.total) > 0 ? Math.round(parseInt(r.wins) / parseInt(r.total) * 100) : 0,
      avg_pnl: r.avg_pnl ? Math.round(parseFloat(r.avg_pnl) * 100) / 100 : 0,
    })),
    by_confidence: byConfidence.rows.map(r => ({
      bucket: r.bucket,
      total: parseInt(r.total),
      wins: parseInt(r.wins),
      losses: parseInt(r.losses),
      win_rate: parseInt(r.total) > 0 ? Math.round(parseInt(r.wins) / parseInt(r.total) * 100) : 0,
      avg_pnl: r.avg_pnl ? Math.round(parseFloat(r.avg_pnl) * 100) / 100 : 0,
    })),
    by_setup: bySetup.rows.map(r => ({
      type: r.setup_type,
      direction: r.direction,
      total: parseInt(r.total),
      wins: parseInt(r.wins),
      losses: parseInt(r.losses),
      win_rate: parseInt(r.total) > 0 ? Math.round(parseInt(r.wins) / parseInt(r.total) * 100) : 0,
      avg_pnl: r.avg_pnl ? Math.round(parseFloat(r.avg_pnl) * 100) / 100 : 0,
    })),
    daily_pnl: dailyPnl.rows.map(r => ({
      date: r.day,
      signals: parseInt(r.signals),
      daily_pnl: r.daily_pnl ? Math.round(parseFloat(r.daily_pnl) * 100) / 100 : 0,
      avg_pnl: r.avg_pnl ? Math.round(parseFloat(r.avg_pnl) * 100) / 100 : 0,
    })),
    holding_time: {
      avg_hours: holdingTime.rows[0]?.avg_hours ? Math.round(parseFloat(holdingTime.rows[0].avg_hours) * 10) / 10 : 0,
      median_hours: holdingTime.rows[0]?.median_hours ? Math.round(parseFloat(holdingTime.rows[0].median_hours) * 10) / 10 : 0,
    },
  };

  // Store report
  await pool.query(
    `INSERT INTO crypto_performance_reports (report_data, period_days, generated_at)
     VALUES ($1, $2, NOW())`,
    [JSON.stringify(report), days]
  );

  return report;
}

async function getPerformanceSummary() {
  // Get latest report
  const latest = await pool.query(
    `SELECT report_data FROM crypto_performance_reports ORDER BY generated_at DESC LIMIT 1`
  );
  if (latest.rows.length > 0) {
    return latest.rows[0].report_data;
  }
  // Fallback: generate fresh
  return generateReport(30);
}

async function main() {
  const args = process.argv.slice(2);
  const days = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1]) : 30;

  console.log(`[Analytics] Generating ${days}-day performance report...`);
  const report = await generateReport(days);

  console.log('\n=== Performance Report ===');
  console.log(`Period: ${report.period.days} days`);
  console.log(`Total signals: ${report.overall.total}`);
  console.log(`Win rate: ${report.overall.win_rate}%`);
  console.log(`Avg PnL: ${report.overall.avg_pnl}%`);
  console.log(`Total PnL: ${report.overall.total_pnl}%`);
  console.log(`Avg R:R planned: ${report.overall.avg_rr_planned}`);

  console.log('\nBy Symbol:');
  for (const s of report.by_symbol) {
    console.log(`  ${s.symbol}: ${s.win_rate}% WR (${s.total} signals, avg ${s.avg_pnl}%)`);
  }

  console.log('\nBy Confidence:');
  for (const c of report.by_confidence) {
    console.log(`  ${c.bucket}: ${c.win_rate}% WR (${c.total} signals)`);
  }

  console.log('\nBy Setup:');
  for (const s of report.by_setup) {
    console.log(`  ${s.type} (${s.direction}): ${s.win_rate}% WR (${s.total} signals, avg ${s.avg_pnl}%)`);
  }

  console.log('\nHolding Time:');
  console.log(`  Avg: ${report.holding_time.avg_hours}h, Median: ${report.holding_time.median_hours}h`);

  await pool.end();
  process.exit(0);
}

if (require.main === module) {
  main().catch(err => { console.error(err); pool.end(); process.exit(1); });
} else {
  module.exports = { generateReport, getPerformanceSummary };
}
