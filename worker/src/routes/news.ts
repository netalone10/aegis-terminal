import { Hono } from 'hono';
import { Cache } from '../cache';
import type { Bindings } from '../index';

export const newsRoutes = new Hono<{ Bindings: Bindings }>();

// RSS feed parser helper (minimal XML parse for RSS/Atom)
function parseRSS(xml: string, limit: number): any[] {
  const items: any[] = [];
  // Match RSS <item> entries
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
    const block = match[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i);
    const link = block.match(/<link>(.*?)<\/link>/i);
    const desc = block.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/i);
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/i);
    const guid = block.match(/<guid[^>]*>(.*?)<\/guid>/i);
    items.push({
      title: title?.[1] ?? title?.[2] ?? '',
      link: link?.[1] ?? '',
      description: (desc?.[1] ?? desc?.[2] ?? '').replace(/<[^>]+>/g, '').slice(0, 300),
      pubDate: pubDate?.[1] ?? null,
      guid: guid?.[1] ?? null,
    });
  }
  // If no RSS items, try Atom <entry>
  if (items.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null && items.length < limit) {
      const block = match[1];
      const title = block.match(/<title[^>]*>(.*?)<\/title>/i);
      const link = block.match(/<link[^>]*href="(.*?)"[^>]*\/?>/i);
      const summary = block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
      const updated = block.match(/<updated>(.*?)<\/updated>/i);
      items.push({
        title: title?.[1] ?? '',
        link: link?.[1] ?? '',
        description: (summary?.[1] ?? '').replace(/<[^>]+>/g, '').slice(0, 300),
        pubDate: updated?.[1] ?? null,
      });
    }
  }
  return items;
}

// RSS feeds to aggregate
const RSS_FEEDS: Record<string, { url: string; label: string }[]> = {
  crypto: [
    { url: 'https://cointelegraph.com/rss', label: 'CoinTelegraph' },
    { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', label: 'CoinDesk' },
    { url: 'https://decrypt.co/feed', label: 'Decrypt' },
  ],
  stocks: [
    { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US', label: 'Yahoo Finance (S&P500)' },
    { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL&region=US&lang=en-US', label: 'Yahoo Finance (AAPL)' },
    { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=MSFT&region=US&lang=en-US', label: 'Yahoo Finance (MSFT)' },
  ],
  macro: [
    { url: 'https://www.investing.com/rss/news.rss', label: 'Investing.com' },
    { url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', label: 'CNBC Economy' },
  ],
};

// GET /api/news/latest — aggregated news from RSS
newsRoutes.get('/latest', async (c) => {
  const category = c.req.query('category') ?? 'all'; // crypto, stocks, macro, all
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 50);
  const cache = new Cache(c.env.AEGIS_CACHE, 180); // 3 min TTL

  try {
    const key = `news:latest:${category}:${limit}`;
    const data = await cache.getOrSet(key, async () => {
      const categories = category === 'all' ? Object.keys(RSS_FEEDS) : [category];
      const allItems: any[] = [];

      for (const cat of categories) {
        const feeds = RSS_FEEDS[cat] ?? [];
        await Promise.all(feeds.map(async (feed) => {
          try {
            const res = await fetch(feed.url, {
              headers: { 'User-Agent': 'AegisTerminal/1.0' },
              signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) return;
            const xml = await res.text();
            const items = parseRSS(xml, 10);
            for (const item of items) {
              allItems.push({ ...item, source: feed.label, category: cat });
            }
          } catch { /* skip failed feed */ }
        }));
      }

      // Sort by date (newest first), dedupe by title
      const seen = new Set<string>();
      return allItems
        .filter(item => {
          const key = item.title.toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => {
          const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
          const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
          return db - da;
        })
        .slice(0, limit);
    }, { ttl: 180 });

    return c.json({ status: 'ok', total: data.length, data });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/news/symbol/:symbol — news filtered by symbol keyword
newsRoutes.get('/symbol/:symbol', async (c) => {
  const symbol = c.req.param('symbol').toUpperCase();
  const cache = new Cache(c.env.AEGIS_CACHE, 300);

  try {
    const key = `news:symbol:${symbol}`;
    const allNews = await cache.getOrSet('news:all:50', async () => {
      const items: any[] = [];
      for (const [, feeds] of Object.entries(RSS_FEEDS)) {
        await Promise.all(feeds.map(async (feed) => {
          try {
            const res = await fetch(feed.url, {
              headers: { 'User-Agent': 'AegisTerminal/1.0' },
              signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) return;
            const xml = await res.text();
            const parsed = parseRSS(xml, 15);
            for (const item of parsed) {
              items.push({ ...item, source: feed.label });
            }
          } catch { /* skip */ }
        }));
      }
      return items;
    }, { ttl: 300 });

    // Filter by symbol in title or description
    const symbolLower = symbol.toLowerCase();
    const filtered = allNews.filter((item: any) =>
      item.title?.toLowerCase().includes(symbolLower) ||
      item.description?.toLowerCase().includes(symbolLower) ||
      item.title?.toLowerCase().includes(symbolLower.replace('$', ''))
    );

    return c.json({ status: 'ok', symbol, total: filtered.length, data: filtered.slice(0, 20) });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/news/feeds — list available feed sources
newsRoutes.get('/feeds', (c) => {
  const sources: any[] = [];
  for (const [category, feeds] of Object.entries(RSS_FEEDS)) {
    for (const feed of feeds) {
      sources.push({ category, label: feed.label, url: feed.url });
    }
  }
  return c.json({ status: 'ok', data: sources });
});
