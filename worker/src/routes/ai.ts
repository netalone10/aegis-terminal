import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';
import { getMultiTFData, analyzeSMC } from './smc';

export const aiRoutes = new Hono<{ Bindings: Bindings }>();

// Kill zone labels for display
const KILL_ZONE_LABELS: Record<string, string> = {
  asian: 'Asian Session (07:00–11:00 WIB)',
  london: 'London Session (13:00–17:00 WIB)',
  new_york_am: 'New York AM (19:00–23:00 WIB)',
  new_york_pm: 'New York PM (00:00–03:00 WIB)',
  none: 'Dead Zone — No active kill zone',
};

// Gather live XAUUSD market context for the AI system prompt
async function gatherMarketContext(env: Bindings): Promise<string> {
  try {
    const cache = new Cache(env.AEGIS_CACHE, 120);
    const rawData = await getMultiTFData(env, 'XAUUSD', 'cfd', '1D', cache);
    if (!rawData) return 'XAU/USD: Market data unavailable at this time.';

    const analysis = analyzeSMC(rawData);
    if (!analysis) return 'XAU/USD: Analysis unavailable at this time.';

    const { bias, confidence, killZone, meta } = analysis;
    const rsi = meta?.rsi?.toFixed(1) ?? 'N/A';
    const atr = meta?.atr?.toFixed(2) ?? 'N/A';
    const zoneLabel = KILL_ZONE_LABELS[killZone] ?? killZone;

    // Current WIB time
    const now = new Date();
    const wibHour = (now.getUTCHours() + 7) % 24;
    const wibMin = now.getUTCMinutes();
    const wibTime = `${String(wibHour).padStart(2, '0')}:${String(wibMin).padStart(2, '0')} WIB`;

    // Trade setup summary
    let setupLine = '';
    if (analysis.tradeSetup) {
      const ts = analysis.tradeSetup;
      setupLine = `\n- Trade Setup: ${ts.direction.toUpperCase()} @ ${ts.entry?.toFixed(2)}, SL ${ts.sl?.toFixed(2)}, TP1 ${ts.tp1?.toFixed(2)} (R:R ${ts.rr1?.toFixed(1)})`;
    }

    // Key signals
    const sigLines = analysis.signals?.slice(0, 4).map((s: string) => `  • ${s}`).join('\n') ?? '';

    return [
      `- XAU/USD: **${bias}**, ${confidence}% confidence, RSI ${rsi}, ATR ${atr}`,
      `- Premium/Discount: ${analysis.premiumDiscount}`,
      `- Current Session: ${zoneLabel}`,
      `- Time: ${wibTime}`,
      setupLine,
      sigLines ? `- Active Signals:\n${sigLines}` : '',
    ].filter(Boolean).join('\n');
  } catch (e) {
    console.error('gatherMarketContext error:', e);
    return 'XAU/USD: Market context unavailable (fetch error).';
  }
}

// Build full system prompt with live context
async function buildSystemPrompt(env: Bindings): Promise<string> {
  const marketContext = await gatherMarketContext(env);

  return `You are Aegis AI — an institutional-grade trading assistant specializing in Smart Money Concepts (SMC) and ICT methodology.

Current Market Context:
${marketContext}

Your capabilities:
- Analyze market structure (BOS, CHoCH, Order Blocks, FVG)
- Identify premium/discount zones
- Suggest trade setups with entry, SL, TP
- Risk management advice
- Kill zone timing
- Multi-timeframe confluence analysis

Rules:
- Always include risk warnings
- Never guarantee profits
- Use SMC/ICT terminology
- Be concise and actionable
- Format with markdown bold/bullets`;
}

// Fallback response when no Groq API key — still return market data
function buildFallbackResponse(): string {
  const now = new Date();
  const wibHour = (now.getUTCHours() + 7) % 24;
  const wibMin = now.getUTCMinutes();
  const wibTime = `${String(wibHour).padStart(2, '0')}:${String(wibMin).padStart(2, '0')} WIB`;

  return `**⚠️ AI Chat Unavailable** — Groq API key not configured.

**Current Time:** ${wibTime}

The AI assistant requires a valid \`GROQ_API_KEY\` to function. In the meantime, you can:

• Check the **SMC Analysis** panel for live XAU/USD structure
• Review the **Screener** for multi-pair setups
• Use the **Trade Plan** tool for risk-calculated entries

*Contact your administrator to configure the API key.*`;
}

// POST /api/ai/chat — Real-time AI chat with market context
aiRoutes.post('/chat', async (c) => {
  const apiKey = c.env.GROQ_API_KEY;

  try {
    const body = await c.req.json();
    const { message, history } = body as {
      message: string;
      history?: { role: string; content: string }[];
    };

    if (!message || typeof message !== 'string') {
      return c.json({ error: 'message (string) required' }, 400);
    }

    // If no API key, return fallback with market data
    if (!apiKey || apiKey.trim() === '') {
      // Still try to gather market data for fallback
      let marketSnippet = '';
      try {
        const rawData = await getMultiTFData(c.env, 'XAUUSD', 'cfd', '1D', new Cache(c.env.AEGIS_CACHE, 120));
        if (rawData) {
          const analysis = analyzeSMC(rawData);
          if (analysis) {
            marketSnippet = [
              '',
              '**📊 Live XAU/USD Snapshot:**',
              `• Bias: **${analysis.bias}** (${analysis.confidence}%)`,
              `• RSI: ${analysis.meta?.rsi?.toFixed(1) ?? 'N/A'}`,
              `• ATR: ${analysis.meta?.atr?.toFixed(2) ?? 'N/A'}`,
              `• Zone: ${analysis.premiumDiscount}`,
              `• Session: ${KILL_ZONE_LABELS[analysis.killZone] ?? 'Dead Zone'}`,
              '',
              analysis.tradeSetup
                ? `• Setup: **${analysis.tradeSetup.direction.toUpperCase()}** @ ${analysis.tradeSetup.entry?.toFixed(2)}, SL ${analysis.tradeSetup.sl?.toFixed(2)}, TP1 ${analysis.tradeSetup.tp1?.toFixed(2)}`
                : '',
            ].filter(Boolean).join('\n');
          }
        }
      } catch { /* ignore */ }

      return c.json({
        status: 'ok',
        reply: buildFallbackResponse() + marketSnippet,
        model: 'fallback',
        usage: null,
        fallback: true,
      });
    }

    // Build system prompt with live market context
    const systemPrompt = await buildSystemPrompt(c.env);

    // Assemble messages: system + history + current user message
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(Array.isArray(history) ? history.slice(-10) : []), // cap history at 10 msgs
      { role: 'user', content: message },
    ];

    // Call Groq
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.7,
        max_tokens: 1024,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      // If auth fails, return fallback
      if (res.status === 401) {
        return c.json({
          status: 'ok',
          reply: buildFallbackResponse(),
          model: 'fallback',
          usage: null,
          fallback: true,
        });
      }
      return c.json({ error: `Groq API error: ${res.status}`, detail: errText }, 502);
    }

    const data: any = await res.json();
    const reply = data.choices?.[0]?.message?.content ?? '';

    return c.json({
      status: 'ok',
      reply,
      model: data.model,
      usage: data.usage,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// POST /api/ai/analyze — AI decision engine (analyzes market data + generates trading signal)
aiRoutes.post('/analyze', async (c) => {
  const apiKey = c.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return c.json({ error: 'GROQ_API_KEY not configured' }, 500);
  }

  try {
    const body = await c.req.json();
    const { symbol, price, indicators, portfolioContext, journalInsights } = body;
    if (!symbol) return c.json({ error: 'symbol required' }, 400);

    const context = `Analyze this trading opportunity:

Symbol: ${symbol}
Current Price: ${price ?? 'N/A'}
Technical Indicators: ${JSON.stringify(indicators ?? {}, null, 2)}
Portfolio Context: ${portfolioContext ?? 'None provided'}
Journal Insights: ${journalInsights ?? 'None provided'}

Provide:
1. Trade signal (BUY/SELL/HOLD) with confidence (0-100%)
2. Entry/stop-loss/target prices if applicable
3. Risk assessment (risk/reward ratio)
4. Key reasoning (bullet points)
5. Potential risks to watch

Respond in JSON format: { "signal": "BUY|SELL|HOLD", "confidence": 0-100, "entry": number|null, "stopLoss": number|null, "target": number|null, "riskReward": number|null, "reasoning": ["..."], "risks": ["..."] }`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a quantitative trading analyst. Respond only in valid JSON.' },
          { role: 'user', content: context },
        ],
        temperature: 0.3,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return c.json({ error: `Groq API error: ${res.status}`, detail: err }, 502);
    }

    const data: any = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '{}';

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch {
      analysis = { raw: content };
    }

    return c.json({
      status: 'ok',
      symbol,
      analysis,
      model: data.model,
      usage: data.usage,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// POST /api/ai/summarize — summarize journal/prompt text
aiRoutes.post('/summarize', async (c) => {
  const apiKey = c.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return c.json({ error: 'GROQ_API_KEY not configured' }, 500);
  }

  try {
    const body = await c.req.json();
    const { text, context } = body;
    if (!text) return c.json({ error: 'text required' }, 400);

    const prompt = context
      ? `Context: ${context}\n\nSummarize and extract key insights:\n\n${text}`
      : `Summarize and extract key trading insights from this:\n\n${text}`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a trading analyst. Extract actionable insights concisely.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return c.json({ error: `Groq API error: ${res.status}`, detail: err }, 502);
    }

    const data: any = await res.json();
    return c.json({
      status: 'ok',
      summary: data.choices?.[0]?.message?.content ?? '',
      usage: data.usage,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/ai/models — list available Groq models
aiRoutes.get('/models', async (c) => {
  const apiKey = c.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return c.json({ error: 'GROQ_API_KEY not configured' }, 500);
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const data: any = await res.json();
    return c.json({ status: 'ok', models: data.data ?? [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});
