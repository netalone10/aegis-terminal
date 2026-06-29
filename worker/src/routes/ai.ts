import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';

export const aiRoutes = new Hono<{ Bindings: Bindings }>();

const SYSTEM_PROMPT = `You are Aegis Terminal AI, a quantitative trading assistant. You provide:
- Technical analysis insights based on price action, indicators, and patterns
- Risk assessment for trades (position sizing, stop losses, risk/reward ratios)
- Market regime analysis (trending, ranging, volatile)
- Portfolio review and optimization suggestions
- Trade journal pattern recognition

Always include risk warnings. Never give financial advice - frame as analysis and education.
Be concise, data-driven, and actionable. Use bullet points.`;

// POST /api/ai/chat — Groq chat completion
aiRoutes.post('/chat', async (c) => {
  const apiKey = c.env.GROQ_API_KEY;
  if (!apiKey) return c.json({ error: 'GROQ_API_KEY not configured' }, 500);

  try {
    const body = await c.req.json();
    const { messages, model, temperature, maxTokens } = body;
    if (!messages || !Array.isArray(messages)) {
      return c.json({ error: 'messages array required' }, 400);
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model ?? 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens ?? 2048,
        stream: false,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return c.json({ error: `Groq API error: ${res.status}`, detail: err }, 502);
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
  if (!apiKey) return c.json({ error: 'GROQ_API_KEY not configured' }, 500);

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
          { role: 'system', content: SYSTEM_PROMPT },
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
  if (!apiKey) return c.json({ error: 'GROQ_API_KEY not configured' }, 500);

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
  if (!apiKey) return c.json({ error: 'GROQ_API_KEY not configured' }, 500);

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
