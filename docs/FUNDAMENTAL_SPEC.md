# Aegis Terminal — Fundamental Analysis Framework
## Economic Calendar × ICT Weekly Profile Integration

> Combined with: `FRAMEWORK_SPEC.md` (Technical / SMC-ICT 4-Layer)
> This document: Fundamental layer that feeds INTO the technical framework

---

## 1. THE FUNDAMENTAL PREMISE

Technical analysis tells you WHERE price might go. Fundamental analysis tells you WHY and WHEN price moves.

Aegis Terminal combines both:
- **Technical**: 4-Layer SMC/ICT (Weekly Profile → H4 → H1 → M15)
- **Fundamental**: Economic calendar events → Weekly narrative → Daily profiles

The fundamental layer operates as a FILTER and AMPLIFIER:
- **Filter**: "Don't take long entries on NFP Friday if USD data expected strong"
- **Amplifier**: "FOMC week + bullish weekly profile = 2x normal conviction"

---

## 2. EVENT CLASSIFICATION SYSTEM

### Impact Tiers

| Tier | Events | Avg DXY Move | Position Sizing |
|------|--------|-------------|----------------|
| **S+** | FOMC Decision + SEP (dot plot) | 0.8-1.5% | 0.25x normal |
| **S** | NFP (Non-Farm Payrolls) | 0.5-1.0% | 0.33x normal |
| **A** | CPI, Core CPI, Core PCE | 0.4-0.8% | 0.5x normal |
| **B** | ISM Mfg/Services, Retail Sales, Unemployment Rate | 0.2-0.5% | 0.75x normal |
| **C** | GDP, Industrial Production, JOLTS, Philly Fed | 0.1-0.3% | 1.0x normal |
| **D** | Housing data, Consumer Confidence, Import/Export | <0.1% | 1.0x normal |

### Event Calendar Database Schema

```sql
CREATE TABLE economic_events (
    id SERIAL PRIMARY KEY,
    event_name VARCHAR(100) NOT NULL,
    country VARCHAR(10) NOT NULL,          -- 'US','EU','UK','JP'
    impact_tier VARCHAR(2) NOT NULL,       -- 'S+','S','A','B','C','D'
    frequency VARCHAR(20) NOT NULL,        -- 'weekly','monthly','quarterly'
    release_day VARCHAR(10),               -- 'mon','tue','wed','thu','fri'
    release_time_utc TIME NOT NULL,
    affected_symbols TEXT[],               -- {'EURUSD','XAUUSD','GBPUSD','USDJPY','BTCUSD'}
    avg_move_pips JSONB,                   -- {"EURUSD": 80, "GBPUSD": 65, ...}
    max_move_pips JSONB,
    correlation_chain VARCHAR(50),         -- 'employment','inflation','growth','housing'
    description TEXT
);

CREATE TABLE event_releases (
    id SERIAL PRIMARY KEY,
    event_id INT REFERENCES economic_events(id),
    release_date DATE NOT NULL,
    consensus DECIMAL,
    previous DECIMAL,
    actual DECIMAL,
    revision_prev DECIMAL,                 -- revision to previous period
    surprise_pct DECIMAL,                  -- (actual - consensus) / consensus
    total_surprise DECIMAL,                -- surprise + revisions
    affected_pairs_move JSONB,             -- actual pip moves after release
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 3. THE 4 CORRELATION CHAINS

Economic indicators don't move in isolation. They form predictable CHAINS where one indicator predicts the next.

### Chain 1: Employment Pipeline

```
Initial Jobless Claims (weekly, Thu)
    ↓ predicts (2-4 week lead)
ADP Employment (monthly, Wed before NFP)
    ↓ predicts (2-day lead)
NFP (monthly, 1st Fri) + Average Hourly Earnings (same day)
    ↓ drives
Consumer Spending / Retail Sales (1 month lag)
    ↓ drives
GDP (1 quarter lag)
    ↓ drives
Fed Policy
```

**Trading Application:**
- Claims trending UP for 3+ weeks → NFP likely weak → short USD pre-NFP
- ADP beats by >50K → NFP likely beats → long USD pre-NFP
- AHE (wages) matters MORE than headline NFP for Fed policy

### Chain 2: Inflation Pipeline

```
UMich Inflation Expectations (mid-month)
    ↓ predicts
ISM Prices Paid (1st of month)
    ↓ predicts
PPI (2nd week)
    ↓ predicts
CPI (2nd-3rd week)
    ↓ drives
Core PCE (last week, Fed's preferred gauge)
    ↓ drives
Fed Rate Decision (8x/year)
    ↓ drives
Treasury Yields → DXY → All FX/Gold/BTC
```

**Trading Application:**
- PPI beats + UMich expectations rising → CPI likely beats (70% accuracy)
- Pre-position: short EURUSD, short Gold before CPI release
- Core CPI matters 1.2-1.5x more than headline CPI

### Chain 3: Growth Pipeline

```
ISM Manufacturing PMI (1st business day)
    ↓ confirms
ISM Services PMI (3rd business day)
    ↓ confirms
Durable Goods Orders (3rd-4th week)
    ↓ confirms
Industrial Production (mid-month)
    ↓ drives
GDP Advance (last week of month after quarter end)
```

**Trading Application:**
- ISM Mfg < 50 (contraction) → Services likely follows → GDP slows
- ISM > 55 (expansion) → Retail Sales strong → GDP grows
- ISM crossing the 50 level (expansion/contraction boundary) = ±40-70 pips

### Chain 4: Central Bank Decision Chain

```
ECB Decision (Thu) → FOMC Decision (Wed, 1 week later)
    → BOE Decision (Thu, same week) → BOJ Decision (Fri, same week)
```

**Trading Application:**
- ECB hawkish → FOMC likely hawkish → USD strength
- BOJ dovish → USDJPY rallies hard
- "Super Weeks" (Jun/Sep/Dec): FOMC + ECB + BOE + BOJ in same week = max volatility

---

## 4. WEEKLY PROFILE × FUNDAMENTAL MAPPING

### ICT Weekly Profile + Economic Calendar Integration

The ICT Weekly Profile defines the CHARACTER of each day. Economic events AMPLIFY or MODIFY that character.

#### MONDAY — "Manipulation Day"

**ICT Profile:** Range establishment, stop hunts, manipulation
**Fundamental Layer:**

| Session | Activity | Events |
|---------|----------|--------|
| Asian (00:00-07:00 UTC) | Weekend gap fill, range setup | Occasional Chinese PMI (1st day) |
| London (07:00-16:00 UTC) | Manipulation at range boundaries | Rare major events |
| NY (12:00-21:00 UTC) | Conviction builds, direction starts | ISM Mfg (1st Mon of month) |

**Fundamental Rules:**
- Holiday Mondays (thin liquidity) → NO ENTRY. Weekend gaps dominate.
- ISM Manufacturing (1st Mon) → creates Monday's range, trade the REACTION not the spike
- Chinese PMI → affects AUD, gold indirectly via commodity demand narrative
- Monday = "Positioning Day" — institutions re-establishing from Friday

**Daily Profile Score:**
```
Fundamental Weight: LOW (0.3x)
Primary Driver: Technical (range manipulation)
Event Amplifier: ISM Mfg on 1st Mon → boost to 0.6x
```

#### TUESDAY — "Continuation Day"

**ICT Profile:** True direction, trend continuation
**Fundamental Layer:**

| Session | Activity | Events |
|---------|----------|--------|
| Asian | Pre-positioning for NY data | Nothing major |
| London | Clean trending setup | German ZEW (3rd Tue), UK data |
| NY (08:30-12:00) | Data reaction dominant | JOLTS, CPI (~13th), Consumer Confidence |

**Fundamental Rules:**
- CPI Tuesday = biggest moves of the month. Gold ±$20-50, EURUSD ±80-200 pips
- JOLTS (10:00 AM ET) = labor market secondary signal
- Consumer Confidence = sentiment gauge for consumer spending chain
- Tuesday is "Data Day" — most economic data concentrates here in many weeks

**Daily Profile Score:**
```
Fundamental Weight: HIGH (0.8x) on CPI/JOLTS days
Primary Driver: Technical (continuation) + Fundamental (data reaction)
Event Amplifier: CPI → 1.5x, JOLTS → 0.7x
```

#### WEDNESDAY — "Reversal Day"

**ICT Profile:** Mid-week reversal, takes out Monday AND Tuesday extremes
**Fundamental Layer:**

| Session | Activity | Events |
|---------|----------|--------|
| Asian | Low activity | Nothing major |
| London | Positioning for FOMC (if FOMC week) | ADP Employment (1st Wed before NFP) |
| NY 08:30 | ADP reaction | ADP Employment |
| NY 10:00 | ISM Services (3rd Wed) | ISM Services PMI |
| NY 14:00 | **FOMC MINUTES** (3rd Wed) | FOMC Minutes + Beige Book |

**Fundamental Rules:**
- FOMC Wednesday = "Dead Money" pre-2PM, explosion at 2PM
- Pre-FOMC: Gold compresses to $5-8 range, then explodes $20-40
- ADP Wednesday (before NFP) = moderate event, sets NFP expectations
- ISM Services (3rd Wed) = Services = 70% of US economy
- Wednesday reversal is AMPLIFIED by FOMC Minutes — the week's biggest reversal potential

**Daily Profile Score:**
```
Fundamental Weight: VERY HIGH (1.2x) on FOMC Minutes weeks
Primary Driver: Fundamental (event reversal) + Technical (mid-week pivot)
Event Amplifier: FOMC Minutes → 1.5x, ISM Services → 0.8x, ADP → 0.6x
```

#### THURSDAY — "Expansion Day"

**ICT Profile:** Trending moves, continuation of Wednesday's reversal
**Fundamental Layer:**

| Session | Activity | Events |
|---------|----------|--------|
| Asian | Follow-through positioning | Nothing major |
| London | **ECB Decision** (if ECB week, 8:15 AM ET) | ECB Rate Decision + Press Conference |
| NY 08:30 | Weekly claims + data | Initial Jobless Claims (weekly) |
| NY 08:30 | Data reactions | PPI, Retail Sales, Philly Fed |

**Fundamental Rules:**
- ECB Thursday = "ECB Reversal" pattern. First move on statement often FADED during press conference (8:45 AM ET)
- Jobless Claims every Thursday = most frequent data point, watch 4-week trend
- PPI = CPI preview (1-2 days before CPI in many weeks)
- Retail Sales = consumer spending direct measure
- Thursday = "Second Derivative Day" — market processes Wednesday/Thursday events

**Daily Profile Score:**
```
Fundamental Weight: HIGH (0.9x) on ECB weeks
Primary Driver: Technical (expansion) + Fundamental (follow-through)
Event Amplifier: ECB → 1.3x, Jobless Claims → 0.5x, PPI → 0.7x
```

#### FRIDAY — "Distribution Day"

**ICT Profile:** Profit taking, reversal, smart money distributes
**Fundamental Layer:**

| Session | Activity | Events |
|---------|----------|--------|
| Asian | Risk-off for weekend | Nothing major |
| London | Pre-NFP positioning (if 1st Fri) | Nothing major |
| NY 08:30 | **NFP** (1st Fri), CPI/PCE (other weeks) | NFP + Unemployment + AHE |
| NY 10:00 | Secondary data | UMich Consumer Sentiment |
| NY 12:00+ | **PROFIT TAKING** | Position squaring, reversals |

**Fundamental Rules:**
- NFP Friday = the week's final move, massive manipulation then distribution
- Post-NFP: trend 2-3 hours, then reverse if overextended
- UMich Sentiment = final sentiment check before weekend
- Friday 12:00-16:00 ET = WORST time to enter new positions
- PCE Friday (last Fri of month) = Fed's preferred inflation gauge
- Smart money distributes INTO buying pressure on Friday PM

**Daily Profile Score:**
```
Fundamental Weight: EXTREME (1.5x) on NFP Fridays
Primary Driver: Fundamental (NFP reaction) + Technical (distribution)
Event Amplifier: NFP → 2.0x, CPI/PCE → 1.5x, UMich → 0.5x
```

---

## 5. WEEK TYPE CLASSIFICATION

### Input: List of events in a given week
### Output: Week type + expected volatility profile

```python
def classify_week(events):
    """
    Classify week by impact level based on scheduled events.
    Returns: week_type, volatility_multiplier, risk_rules
    """
    tier_counts = count_by_tier(events)
    
    if tier_counts['S+'] >= 1 or tier_counts['S'] >= 1:
        return {
            "type": "HIGH_IMPACT",
            "volatility_multiplier": 1.8,
            "max_positions": 2,
            "stop_loss_widen": 1.5,      # widen stops 50%
            "entry_rule": "event_only",   # only trade around events
            "avoid_times": ["30min_before_event"],
            "best_strategy": "event_breakout_or_fade"
        }
    elif tier_counts['A'] >= 1 or (tier_counts['S'] >= 1 and tier_counts['B'] >= 1):
        return {
            "type": "MEDIUM_IMPACT",
            "volatility_multiplier": 1.3,
            "max_positions": 3,
            "stop_loss_widen": 1.2,
            "entry_rule": "standard_with_caution",
            "avoid_times": ["15min_before_event"],
            "best_strategy": "trend_following"
        }
    elif tier_counts['B'] >= 2 or tier_counts['C'] >= 3:
        return {
            "type": "LOW_MEDIUM_IMPACT",
            "volatility_multiplier": 1.0,
            "max_positions": 4,
            "stop_loss_widen": 1.0,
            "entry_rule": "standard",
            "avoid_times": [],
            "best_strategy": "standard"
        }
    else:
        return {
            "type": "LOW_IMPACT",
            "volatility_multiplier": 0.7,
            "max_positions": 5,
            "stop_loss_widen": 0.8,       # tighter stops (smaller range)
            "entry_rule": "aggressive",
            "avoid_times": [],
            "best_strategy": "mean_reversion"  # no catalyst = reversion
        }
```

### Week-Type Behavior Matrix

| Aspect | HIGH | MEDIUM | LOW |
|--------|------|--------|-----|
| EURUSD ADR | 80-120 pips | 60-80 pips | 40-60 pips |
| Gold ADR | $30-50 | $20-30 | $12-20 |
| BTC ADR | 3-6% | 2-4% | 1-3% |
| Best Days | Wed-Fri (event days) | Thu-Fri | Tue-Thu |
| Avoid | Mon-Tue (positioning) | Mon | Fri PM |
| Strategy | Event breakout/fade | Trend following | Mean reversion |

---

## 6. DAILY FUNDAMENTAL PROFILES (Session-Level)

### Daily Session Budget (What portion of the day's range each session creates)

```
MONDAY:
  Asian:  15-20% of daily range
  London: 35-40% of daily range (manipulation)
  NY:     40-50% of daily range (direction set)

TUESDAY:
  Asian:  10-15% of daily range
  London: 25-30% of daily range (pre-positioning)
  NY:     55-65% of daily range (data reaction DOMINATES)

WEDNESDAY:
  Asian:  10-15% of daily range
  London: 20-25% of daily range
  NY:     60-70% of daily range (FOMC Minutes or event spike)

THURSDAY:
  Asian:  10-15% of daily range
  London: 40-50% of daily range (ECB if applicable)
  NY:     40-50% of daily range (Jobless Claims, data)

FRIDAY:
  Asian:  10-15% of daily range
  London: 20-25% of daily range (pre-NFP if 1st Fri)
  NY:     60-70% of daily range (NFP or distribution)
```

### Gold (XAUUSD) Session Profile

| Session | UTC | Avg Range | Key Driver |
|---------|-----|-----------|------------|
| Sydney | 22:00-07:00 | $3-5 | Risk sentiment, AUD correlation |
| Tokyo | 00:00-09:00 | $5-8 | JPY flows, physical demand |
| London | 07:00-16:00 | $10-15 | EUR strength, LBMA fix (10:30, 15:00 GMT), 60% daily volume |
| New York | 12:00-21:00 | $10-15 | US data, COMEX futures, ETF flows |
| Overlap | 12:00-16:00 | $8-12 | Max liquidity, best execution |

---

## 7. PRE/POST EVENT BEHAVIOR PATTERNS

### Pre-Event Behavior (48 Hours Before Major Event)

1. **Range Compression**: ATR(5) / ATR(20) < 0.7 = "coiled spring" → expect expansion post-event (65% directional follow-through)
2. **Implied Vol Spike**: 1-week ATM IV increases 20-40% vs 1-month IV (term structure inverts)
3. **Position Lightening**: CFTC data shows leveraged funds reducing gross exposure 15-30%
4. **Options Wall**: Large options expiries at round numbers act as magnets
5. **Spread Widening**: Interbank spreads 0.2 → 0.5-1.0 pips; retail 3-5x

### Post-Event Behavior

**First 5 Minutes ("Whipsaw Zone"):**
- First move is "correct" only ~55-60% of the time
- Volume 10-20x normal
- Spreads peak at 3-5x, normalize in 2-3 min
- DO NOT TRADE first 5 minutes

**30 Min to 2 Hours ("Trend Day Formation"):**
- If surprise ≥ 1σ deviation: market trends for 1-2 hours
- This is the HIGHEST PROBABILITY institutional entry window
- "Second leg" entry (T+30 min to T+2 hours)

**T+1 to T+2 Days ("Post-Event Drift"):**
- Momentum persists 1-2 trading days
- EUR/USD post-NFP drift: 15-25 pips in surprise direction
- Gold post-FOMC drift: $5-10/day in surprise direction

**T+3+ Days ("Mean Reversion"):**
- By day 3, mean-reversion begins
- "Fading" the event move on day 3 = common institutional strategy

---

## 8. SYMBOL-SPECIFIC FUNDAMENTAL SENSITIVITY

### XAUUSD (Gold)

**Primary Drivers:**
1. Real yields (10Y TIPS) — correlation ~-0.85
2. DXY — correlation ~-0.78
3. Central bank buying (structural demand)
4. Geopolitical risk (safe haven)

**Event Sensitivity:**

| Event | Avg Move | Direction Logic |
|-------|----------|----------------|
| NFP Strong | -$20-40 | USD strength → Gold sells |
| NFP Weak | +$20-40 | USD weakness → Gold buys |
| CPI High | -$15-30 | Hawkish FED → Gold sells |
| CPI Low | +$15-30 | Dovish FED → Gold buys |
| FOMC Hike | -$30-50 | Rate hikes → Gold sells |
| FOMC Dovish | +$30-50 | Rate cuts → Gold buys |
| Geopolitical | +$20-40 (max +$100) | Safe haven bid |

**Key Nuance:** Gold rallies when REAL yields fall, regardless of nominal direction. Hot CPI can actually RALLY gold if breakeven inflation rises faster than nominal yields.

### EURUSD

**Primary Drivers:**
1. ECB vs Fed policy divergence
2. EUR-USD 2Y rate differential
3. Risk sentiment (EUR = risk-on proxy vs USD)
4. DXY composition (EUR = 57.6% of DXY)

**Event Sensitivity:**

| Event | Avg Move | Direction Logic |
|-------|----------|----------------|
| NFP Strong | -60 to -120 pips | USD strength |
| CPI High | -40 to -80 pips | Hawkish FED |
| ECB Hike | +40 to +80 pips | Hawkish ECB |
| ECB Cut | -40 to -80 pips | Dovish ECB |
| FOMC Hike | -60 to -100 pips | USD strength |

### GBPUSD

**Primary Drivers:**
1. BOE vs Fed policy divergence
2. UK-specific data (CPI, employment)
3. EURUSD correlation (0.82) — often moves as EURUSD proxy
4. Brexit risk premium (occasionally reactivates)

**Event Sensitivity:**

| Event | Avg Move | Direction Logic |
|-------|----------|----------------|
| NFP Strong | -50 to -100 pips | USD strength |
| BOE Hike | +40 to +80 pips | Hawkish BOE |
| UK CPI | ±30 to ±60 pips | Inflation → BOE reaction |

### USDJPY

**Primary Drivers:**
1. US-Japan 2Y rate differential (MOST important)
2. Risk sentiment (risk-on = USDJPY up, risk-off = down)
3. BOJ policy / YCC adjustments
4. MOF/BOJ intervention risk (>155 or <140)

**Event Sensitivity:**

| Event | Avg Move | Direction Logic |
|-------|----------|----------------|
| NFP Strong | +80 to +150 pips | USD strength |
| FOMC Hike | +60 to +120 pips | Rate differential widens |
| BOJ Dovish | +80 to +150 pips | Yield gap widens |
| BOJ Intervention | -100 to -300 pips (max -500) | Government sells USD |

### BTCUSD

**Primary Drivers:**
1. Risk sentiment (SPX correlation ~0.65)
2. Liquidity conditions (Fed balance sheet, reverse repo)
3. Rate expectations (1-4 hour lag vs gold/FX)
4. DXY (medium-term inverse correlation)

**Event Sensitivity:**

| Event | Avg Move | Direction Logic |
|-------|----------|----------------|
| NFP Strong | -2 to -4% | Risk-off → BTC sells |
| FOMC Hike | -3 to -6% | Higher rates → risk-off |
| FOMC Dovish | +3 to +6% | Lower rates → risk-on |
| CPI High | -1 to -3% | Hawkish FED |

**Key Nuance:** BTC = "leveraged long on liquidity." Responds to same events as gold/FX but with 1-30 minute lag (less direct algorithmic trading). BTC acts as HIGH-BETA RISK ASSET, not safe haven.

---

## 9. CROSS-ASSET CORRELATION MATRIX

### Normal Conditions

| | EURUSD | GBPUSD | USDJPY | XAUUSD | BTCUSD | DXY |
|---|--------|--------|--------|--------|--------|-----|
| **EURUSD** | 1.00 | +0.82 | -0.45 | +0.50 | +0.30 | -0.85 |
| **GBPUSD** | +0.82 | 1.00 | -0.42 | +0.40 | +0.25 | -0.80 |
| **USDJPY** | -0.45 | -0.42 | 1.00 | -0.40 | +0.20 | +0.70 |
| **XAUUSD** | +0.50 | +0.40 | -0.40 | 1.00 | +0.28 | -0.78 |
| **BTCUSD** | +0.30 | +0.25 | +0.20 | +0.28 | 1.00 | -0.45 |

### During Stress Events (Correlation Breaks)

| | EURUSD | GBPUSD | USDJPY | XAUUSD | BTCUSD |
|---|--------|--------|--------|--------|--------|
| **EURUSD** | 1.00 | +0.90 | -0.30 | +0.70 | -0.10 |
| **GBPUSD** | +0.90 | 1.00 | -0.35 | +0.65 | -0.15 |
| **USDJPY** | -0.30 | -0.35 | 1.00 | -0.20 | +0.10 |
| **XAUUSD** | +0.70 | +0.65 | -0.20 | 1.00 | +0.05 |
| **BTCUSD** | -0.10 | -0.15 | +0.10 | +0.05 | 1.00 |

**Key Insight:** During extreme risk-off (COVID, SVB, UK gilt crisis):
- JPY and CHF strengthen (safe haven)
- Gold initially sells (margin calls) then rallies (safe haven) — NONLINEAR
- BTC crashes (high-beta risk asset, NOT safe haven)
- DXY surges (global USD funding squeeze)

---

## 10. EVENT-DRIVEN ENTRY RULES

### Before High-Impact Event

```
1. Identify the weekly range (Monday high/low)
2. Check: Is price near range boundary? → WAIT for manipulation
3. NO NEW POSITIONS 30 minutes before event
4. Tighten existing stops to breakeven
5. Check: ATR(5)/ATR(20) ratio → if < 0.7, expect explosive move
```

### During High-Impact Event

```
1. FIRST 5 MINUTES: DO NOT TRADE (whipsaw zone)
2. Identify: What was the surprise? (actual vs consensus)
3. Wait for the "second leg" (T+30 min to T+2 hours)
4. Look for FVG (Fair Value Gap) creation on H1/M15
5. Enter on retracement to FVG with 2R minimum target
```

### After High-Impact Event

```
1. Identify the NEW range (post-event high/low)
2. T+0 to T+2 days: Follow the trend (momentum persistence)
3. T+3+ days: Prepare for mean-reversion
4. Take profits before next session (especially Friday PM)
5. Adjust Weekly Profile bias based on event outcome
```

### Multi-Event Week Rules

```
NFP + CPI in same week:
- NFP Friday moves first, CPI creates follow-through
- Combined effect: 1.5x-2x individual moves
- Position for: NFP direction, CPI continuation or reversal

FOMC + NFP week:
- Monday-Tuesday: positioning (reduced size)
- Wednesday: FOMC (the main event)
- Thursday: post-FOMC drift
- Friday: NFP (secondary event, but still massive)
- Most weekly PnL concentrated Wed-Fri
```

---

## 11. SEASONAL PATTERNS (Monthly Anchors)

### Monthly Calendar Structure

| Week | Dominant Theme | Key Events |
|------|---------------|------------|
| **Week 1** | Employment | ISM Mfg (Mon), ISM Svc (Wed), **NFP (Fri)** |
| **Week 2** | Inflation | PPI (Tue), **CPI (Wed)**, Retail Sales |
| **Week 3** | Housing/Activity | Housing Starts, Existing Home Sales, LEI |
| **Week 4** | Growth/Fed | Durable Goods, **Core PCE (Fri)**, GDP Advance |

### Quarterly "Super Weeks" (Mar, Jun, Sep, Dec)

- FOMC + ECB + BOE + BOJ all within same week possible
- NFP or CPI may also fall
- Maximum volatility. Gold can move $50-80 in a single super week
- Institutional desks run dedicated "event risk desk"

### Annual Seasonal Patterns

| Month | Pattern |
|-------|---------|
| Jan | "January Effect", FOMC sets annual tone |
| Mar | Quarterly FOMC (dot plot), Q1 positioning |
| Jun | Quarterly FOMC (dot plot), "Sell in May" unwind |
| Aug | Jackson Hole (late Aug) = Fed Chair speech = market-moving |
| Sep | Quarterly FOMC (dot plot), Q3 begin |
| Dec | Quarterly FOMC (dot plot), year-end profit taking, Santa Claus Rally (Dec 24 - Jan 2) |

---

## 12. IMPLEMENTATION: FUNDAMENTAL SIGNAL GENERATION

### Fundamental Bias Calculation

```python
def calculate_fundamental_bias(symbol, date, week_events):
    """
    Returns fundamental bias for a symbol on a given date.
    Combines: week type, day of week, event proximity, correlation chain.
    """
    
    # 1. Classify the week
    week_type = classify_week(week_events)
    
    # 2. Get day profile
    day_profile = get_day_profile(date)  # monday=manipulation, etc.
    
    # 3. Check upcoming events (next 48 hours)
    upcoming = get_upcoming_events(date, hours=48)
    
    # 4. Check recent surprise (last event)
    last_release = get_last_release(symbol, date)
    
    # 5. Calculate composite bias
    bias_score = 0
    
    # Day weight
    bias_score += day_profile['fundamental_weight']
    
    # Week type modifier
    bias_score *= week_type['volatility_multiplier']
    
    # Event proximity penalty (no entries 30min before)
    if is_near_event(date, minutes=30):
        return {"bias": "NEUTRAL", "reason": "event_proximity"}
    
    # Recent surprise momentum
    if last_release and last_release['surprise_pct']:
        if last_release['surprise_pct'] > 0.1:
            bias_score += 0.3  # strong positive surprise
        elif last_release['surprise_pct'] < -0.1:
            bias_score -= 0.3  # strong negative surprise
    
    # Direction based on symbol + surprise
    if symbol in ['EURUSD', 'GBPUSD', 'XAUUSD']:
        direction = 'BULLISH' if bias_score > 0.3 else 'BEARISH' if bias_score < -0.3 else 'NEUTRAL'
    elif symbol in ['USDJPY']:
        direction = 'BULLISH' if bias_score > 0.3 else 'BEARISH' if bias_score < -0.3 else 'NEUTRAL'
    elif symbol == 'BTCUSD':
        direction = 'BULLISH' if bias_score > 0.3 else 'BEARISH' if bias_score < -0.3 else 'NEUTRAL'
    
    return {
        "bias": direction,
        "score": bias_score,
        "week_type": week_type['type'],
        "day_profile": day_profile['type'],
        "upcoming_events": upcoming,
        "position_sizing": week_type['max_positions'],
        "stop_adjustment": week_type['stop_loss_widen']
    }
```

### Pre-Data Positioning Signals

**Signal 1: Inflation Chain Trade**
```
Trigger: PPI beats AND UMich expectations rising
Prediction: CPI likely to beat (70% accuracy)
Action: Short EURUSD, short Gold, long USDJPY
Timeframe: Pre-CPI (1-2 weeks out)
```

**Signal 2: Employment Chain Trade**
```
Trigger: ADP beats by >50K AND Claims below 4-week average
Prediction: NFP likely to beat (65% accuracy)
Action: Long USDJPY, short EURUSD, short Gold
Timeframe: Pre-NFP (2-3 days out)
```

**Signal 3: Fed Reaction Function**
```
Trigger: Core PCE rising + NFP strong + ISM > 50
Prediction: Fed signals hawkish tilt
Action: Short bonds, long USD, short Gold
Timeframe: 1-6 weeks before FOMC
```

**Signal 4: Risk Regime Change**
```
Trigger: VIX spike + DXY surge + Gold initially falls + BTC crashes
Meaning: Classic risk-off / USD funding stress
Action: Reduce all risk, prepare for Gold reversal (safe haven lag)
Timeframe: Days
```

---

## 13. QUICK REFERENCE CARD

### Highest Impact Events (Ranked)
1. FOMC Rate Decision + Dot Plot (S+)
2. NFP (Non-Farm Payrolls) (S)
3. CPI / Core CPI (A)
4. FOMC Minutes (A)
5. Core PCE (A)
6. ECB / BOE / BOJ Rate Decisions (A)
7. ISM Manufacturing PMI (B)
8. ISM Services PMI (B)
9. Retail Sales (B)
10. GDP Advance (C)

### Best Days for Fundamental Trading
1. **Wednesday** — FOMC Minutes, ISM Services, ADP
2. **Friday** — NFP, CPI, PCE
3. **Thursday** — ECB, Jobless Claims, PPI, Retail Sales
4. **Tuesday** — CPI, JOLTS, Consumer Confidence
5. **Monday** — ISM Mfg (1st Mon), otherwise low priority

### Worst Times to Trade
1. 30 min before high-impact event
2. First 5 min after event (whipsaw zone)
3. Friday 12:00-16:00 ET (profit taking)
4. Holiday Mondays (thin liquidity)
5. Month-end (portfolio rebalancing)

---

## 14. RELATIONSHIP TO TECHNICAL FRAMEWORK

### How Fundamental Feeds Into Technical

```
Fundamental Layer                    Technical Layer (FRAMEWORK_SPEC.md)
─────────────────                    ──────────────────────────────────
Week Type Classification     →      Weekly Profile projection
Day Fundamental Profile      →      Daily bias confirmation
Event Surprise Calculation   →      H4 Profiling adjustment
Post-Event Drift             →      H1 Confirmation filter
Cross-Asset Correlation      →      Multi-pair SMT detection
Seasonal Pattern             →      Entry timing optimization
```

### Confluence Scoring

| Source | Weight | Example |
|--------|--------|---------|
| Technical (4-layer ICT) | 60% | Bullish weekly profile + H1 BOS + M15 FVG |
| Fundamental (calendar) | 25% | Low-impact week + post-CPI drift bullish |
| Correlation (cross-asset) | 15% | EURUSD + GBPUSD + Gold all showing same direction |

**Minimum threshold for signal: Technical 60% + (Fundamental 25% OR Correlation 15%) = 75%+**

---

*This document is Layer 0 of the Aegis Terminal framework. Technical layers (Weekly Profile → H4 → H1 → M15) build on top of this fundamental foundation.*
