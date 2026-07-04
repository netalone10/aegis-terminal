// ═══════════════════════════════════════════════════════════════
// Fundamental Analysis Engine
// ═══════════════════════════════════════════════════════════════

// Get market regime from recent event releases
async function getMarketRegime(pool) {
  try {
    const { rows: releases } = await pool.query(`
      SELECT er.*, e.event_name, e.impact_tier, e.correlation_chain, e.affected_symbols
      FROM event_releases er
      JOIN economic_events e ON e.id = er.event_id
      WHERE er.actual IS NOT NULL
      ORDER BY er.release_date DESC
      LIMIT 15
    `);

    if (releases.length === 0) {
      return {
        regime: 'unknown',
        tone: 'neutral',
        usdStrength: 50,
        confidence: 10,
        details: 'No recent release data available',
        recentReleases: [],
      };
    }

    let beats = 0, misses = 0, totalSurprise = 0;
    let surpriseCount = 0;
    const recentReleases = [];

    for (const r of releases) {
      const surprise = parseFloat(r.surprise_pct) || 0;
      totalSurprise += surprise;
      if (surprise > 0.02) beats++;
      if (surprise < -0.02) misses++;
      if (r.surprise_pct !== null) surpriseCount++;

      recentReleases.push({
        event: r.event_name,
        date: r.release_date,
        actual: r.actual,
        consensus: r.consensus,
        surprise: surprise,
        tier: r.impact_tier,
      });
    }

    const avgSurprise = surpriseCount > 0 ? totalSurprise / surpriseCount : 0;
    const beatRate = releases.length > 0 ? beats / releases.length : 0.5;

    // Determine regime
    let regime, tone, usdStrength;

    if (beatRate > 0.6) {
      regime = 'risk-on';
      tone = 'hawkish';
      usdStrength = 55 + Math.min(35, Math.round(beatRate * 50));
    } else if (beatRate < 0.4) {
      regime = 'risk-off';
      tone = 'dovish';
      usdStrength = 25 + Math.round((1 - beatRate) * 30);
    } else {
      regime = 'mixed';
      tone = 'neutral';
      usdStrength = 45 + Math.round(avgSurprise * 100);
    }

    usdStrength = Math.max(10, Math.min(90, usdStrength));
    const confidence = Math.min(95, 30 + releases.length * 4);

    return {
      regime,
      tone,
      usdStrength,
      confidence,
      avgSurprise: Math.round(avgSurprise * 10000) / 100,
      beatRate: Math.round(beatRate * 100),
      details: `${beats} beats, ${misses} misses out of ${releases.length} releases. Avg surprise: ${Math.round(avgSurprise * 100) / 100}%`,
      recentReleases,
    };
  } catch (e) {
    return { regime: 'error', tone: 'neutral', usdStrength: 50, confidence: 0, details: e.message, recentReleases: [] };
  }
}

// Get correlation chains analysis
async function getCorrelationChains(pool) {
  const chains = [
    {
      name: 'Employment',
      events: [
        'Initial Jobless Claims',
        'ADP Employment Change',
        'Non-Farm Payrolls',
        'Average Hourly Earnings',
        'Retail Sales (MoM)',
        'GDP (Advance)',
      ],
    },
    {
      name: 'Inflation',
      events: [
        'ISM Manufacturing PMI',  // Prices paid proxy
        'PPI (YoY)',
        'CPI (YoY)',
        'Core PCE Price Index',
        'FOMC Rate Decision',
      ],
    },
    {
      name: 'Growth',
      events: [
        'ISM Manufacturing PMI',
        'ISM Services PMI',
        'Retail Sales (MoM)',
        'GDP (Advance)',
      ],
    },
    {
      name: 'Central Bank',
      events: [
        'ECB Rate Decision',
        'FOMC Rate Decision',
        'BOE Rate Decision',
        'BOJ Rate Decision',
      ],
    },
  ];

  const result = [];

  for (const chain of chains) {
    const chainResult = {
      name: chain.name,
      status: 'active',
      trend: 'neutral',
      releases: [],
      prediction: null,
    };

    let last30daysReleases = [];
    let hasAnyData = false;

    for (const eventName of chain.events) {
      const { rows } = await pool.query(`
        SELECT er.*, e.event_name, e.impact_tier
        FROM event_releases er
        JOIN economic_events e ON e.id = er.event_id
        WHERE e.event_name = $1
        ORDER BY er.release_date DESC
        LIMIT 3
      `, [eventName]);

      for (const r of rows) {
        hasAnyData = true;
        const surprise = parseFloat(r.surprise_pct) || 0;
        last30daysReleases.push({
          event: r.event_name,
          date: r.release_date,
          consensus: r.consensus,
          actual: r.actual,
          surprise: surprise,
          tier: r.impact_tier,
        });
      }

      chainResult.releases.push({
        event: eventName,
        data: rows.map(r => ({
          date: r.release_date,
          consensus: r.consensus,
          actual: r.actual,
          surprise: parseFloat(r.surprise_pct) || 0,
        })),
      });
    }

    // Sort all releases by date
    last30daysReleases.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate trend
    const recent5 = last30daysReleases.slice(0, 5);
    if (recent5.length >= 2) {
      const recentBeats = recent5.filter(r => r.surprise > 0.02).length;
      const recentMisses = recent5.filter(r => r.surprise < -0.02).length;

      if (recentBeats > recentMisses + 1) {
        chainResult.trend = 'rising';
      } else if (recentMisses > recentBeats + 1) {
        chainResult.trend = 'falling';
      } else {
        chainResult.trend = 'mixed';
      }
    }

    // Status
    if (!hasAnyData) {
      chainResult.status = 'stalled';
    } else if (recent5.length < 2) {
      chainResult.status = 'emerging';
    }

    // Prediction (next event in chain based on trend)
    const trendDirection = chainResult.trend === 'rising' ? 'beat' : chainResult.trend === 'falling' ? 'miss' : 'in-line';
    chainResult.prediction = {
      nextEvent: chain.events.find(name => {
        const found = chainResult.releases.find(r => r.event === name);
        return found && found.data.length === 0;
      }) || chain.events[chain.events.length - 1],
      expectation: trendDirection,
      confidence: chainResult.status === 'active' ? Math.min(70, 30 + recent5.length * 8) : 20,
    };

    // Use recent releases as the flat list
    chainResult.releases = last30daysReleases;

    result.push(chainResult);
  }

  return { chains: result };
}

// Calculate symbol-specific bias
async function getSymbolBias(pool) {
  const symbols = [
    'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD',
  ];

  const regime = await getMarketRegime(pool);
  const chains = await getCorrelationChains(pool);

  const result = [];

  for (const symbol of symbols) {
    // Get latest fundamental bias from DB
    const { rows: biasRows } = await pool.query(
      `SELECT * FROM fundamental_bias WHERE symbol = $1 ORDER BY bias_date DESC LIMIT 1`,
      [symbol]
    );

    const dbBias = biasRows.length > 0 ? biasRows[0] : null;

    let score = 5; // Neutral default
    let bias = 'neutral';
    let reasoning = [];

    switch (symbol) {
      case 'XAUUSD': {
        // Gold: strong USD = bearish gold, high inflation = bullish gold
        const usd = regime.usdStrength;
        const inflationChain = chains.chains.find(c => c.name === 'Inflation');
        const inflationTrend = inflationChain?.trend || 'mixed';

        if (usd > 65) {
          score -= 2;
          reasoning.push(`Strong USD (${usd}) weighs on gold`);
        } else if (usd < 40) {
          score += 2;
          reasoning.push(`Weak USD (${usd}) supports gold`);
        }

        if (inflationTrend === 'rising') {
          score += 1.5;
          reasoning.push('Rising inflation supports gold as hedge');
        } else if (inflationTrend === 'falling') {
          score -= 1;
          reasoning.push('Falling inflation reduces gold appeal');
        }

        if (regime.regime === 'risk-off') {
          score += 1;
          reasoning.push('Risk-off environment supports safe-haven gold');
        } else if (regime.regime === 'risk-on') {
          score -= 0.5;
          reasoning.push('Risk-on reduces gold demand');
        }
        break;
      }

      case 'EURUSD': {
        // Euro: ECB vs FOMC, growth differential
        const usd = regime.usdStrength;
        const growthChain = chains.chains.find(c => c.name === 'Growth');
        const growthTrend = growthChain?.trend || 'mixed';

        if (usd > 65) {
          score -= 2;
          reasoning.push(`Strong USD (${usd}) pushes EUR/USD lower`);
        } else if (usd < 40) {
          score += 2;
          reasoning.push(`Weak USD (${usd}) lifts EUR/USD`);
        }

        if (growthTrend === 'rising') {
          score += 1;
          reasoning.push('US growth strength supports USD');
        } else if (growthTrend === 'falling') {
          score += 0.5;
          reasoning.push('Weakening US growth weighs on USD');
        }

        if (regime.tone === 'hawkish') {
          score -= 1.5;
          reasoning.push('Hawkish Fed expectations boost USD');
        } else if (regime.tone === 'dovish') {
          score += 1.5;
          reasoning.push('Dovish Fed expectations weaken USD');
        }
        break;
      }

      case 'GBPUSD': {
        // GBP: BOE vs FOMC
        const usd = regime.usdStrength;

        if (usd > 65) {
          score -= 1.5;
          reasoning.push(`Strong USD (${usd}) pressures GBP/USD`);
        } else if (usd < 40) {
          score += 1.5;
          reasoning.push(`Weak USD (${usd}) lifts GBP/USD`);
        }

        const cbChain = chains.chains.find(c => c.name === 'Central Bank');
        if (cbChain?.trend === 'rising') {
          score -= 1;
          reasoning.push('Tightening cycle supports USD');
        } else if (cbChain?.trend === 'falling') {
          score += 1;
          reasoning.push('Easing cycle weakens USD');
        }

        if (regime.regime === 'risk-off') {
          score -= 0.5;
          reasoning.push('Risk-off tends to favor USD over GBP');
        }
        break;
      }

      case 'USDJPY': {
        // JPY: BOJ vs FOMC, risk sentiment
        const usd = regime.usdStrength;

        if (usd > 65) {
          score += 2;
          reasoning.push(`Strong USD (${usd}) pushes USD/JPY higher`);
        } else if (usd < 40) {
          score -= 2;
          reasoning.push(`Weak USD (${usd}) drags USD/JPY lower`);
        }

        if (regime.regime === 'risk-on') {
          score += 1;
          reasoning.push('Risk-on reduces JPY safe-haven demand');
        } else if (regime.regime === 'risk-off') {
          score -= 1;
          reasoning.push('Risk-off increases JPY safe-haven demand');
        }

        const cbChain = chains.chains.find(c => c.name === 'Central Bank');
        if (regime.tone === 'hawkish') {
          score += 1;
          reasoning.push('Hawkish Fed widens rate differential vs BOJ');
        }
        break;
      }

      case 'BTCUSD': {
        // BTC: risk sentiment, USD strength
        const usd = regime.usdStrength;

        if (usd > 65) {
          score -= 1.5;
          reasoning.push(`Strong USD (${usd}) weighs on BTC`);
        } else if (usd < 40) {
          score += 1.5;
          reasoning.push(`Weak USD (${usd}) supports BTC`);
        }

        if (regime.regime === 'risk-on') {
          score += 2;
          reasoning.push('Risk-on environment fuels crypto speculation');
        } else if (regime.regime === 'risk-off') {
          score -= 1.5;
          reasoning.push('Risk-off hurts speculative assets like BTC');
        }

        if (regime.tone === 'dovish') {
          score += 1;
          reasoning.push('Dovish Fed expectations favor BTC');
        } else if (regime.tone === 'hawkish') {
          score -= 0.5;
          reasoning.push('Hawkish Fed expectations suppress BTC');
        }
        break;
      }
    }

    // Clamp score 0-10
    score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

    if (score > 6) bias = 'bullish';
    else if (score < 4) bias = 'bearish';
    else bias = 'neutral';

    result.push({
      symbol,
      bias,
      score,
      reasoning: reasoning.join('. ') || 'Insufficient data for meaningful bias',
      lastUpdate: dbBias?.created_at || null,
      dbBias: dbBias ? {
        bias: dbBias.bias,
        score: dbBias.score,
        lastSurprise: dbBias.last_surprise,
      } : null,
    });
  }

  return { symbols: result };
}

module.exports = {
  getMarketRegime,
  getCorrelationChains,
  getSymbolBias,
};
