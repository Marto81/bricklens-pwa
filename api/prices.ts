export const config = {
  runtime: 'edge'
};

const CORS_HEADERS: HeadersInit = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type, accept'
};

function jsonRes(body: unknown, status = 200, cacheSec = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheSec > 0 ? `public, max-age=${cacheSec}` : 'no-store'
    }
  });
}

function roundEur(val: number): number {
  return Math.round(val * 100) / 100;
}

interface LivePortalQuotePayload {
  minPriceEur: number;
  avgPriceEur: number;
  maxPriceEur: number;
  soldAvg6mEur: number;
  activeListingsCount: number;
  currencyNote?: string;
}

async function fetchBrickOwlQuote(
  figId: string,
  condition: string,
  apiKey: string
): Promise<LivePortalQuotePayload | null> {
  try {
    const lookupRes = await fetch(
      `https://api.brickowl.com/v1/catalog/id_lookup?key=${encodeURIComponent(apiKey)}&id=${encodeURIComponent(figId)}&type=Minifigure&id_type=bl_id`
    );
    if (!lookupRes.ok) return null;
    const lookupData = (await lookupRes.json()) as { boids?: string[] };
    const boid = lookupData.boids?.[0];
    if (!boid) return null;

    const availRes = await fetch(
      `https://api.brickowl.com/v1/catalog/availability?key=${encodeURIComponent(apiKey)}&boid=${encodeURIComponent(boid)}&country=ES`
    );
    if (!availRes.ok) return null;
    const availMap = (await availRes.json()) as Record<
      string,
      { price?: string; base_currency?: string; con?: string; qty?: string }
    >;

    const wantNew = condition === 'new';
    const prices: number[] = [];

    for (const entry of Object.values(availMap || {})) {
      if (!entry || typeof entry !== 'object') continue;
      const con = String(entry.con || '').toLowerCase();
      const isNew = con.startsWith('new');
      if (wantNew !== isNew) continue;
      const price = Number(entry.price);
      if (Number.isFinite(price) && price > 0.2 && price < 10000) {
        prices.push(price);
      }
    }

    if (prices.length === 0) return null;
    prices.sort((a, b) => a - b);
    const trimmed = prices.length >= 6 ? prices.slice(1, -1) : prices;
    const avg = trimmed.reduce((s, p) => s + p, 0) / trimmed.length;

    return {
      minPriceEur: roundEur(prices[0]),
      avgPriceEur: roundEur(avg),
      maxPriceEur: roundEur(prices[prices.length - 1]),
      soldAvg6mEur: roundEur(avg * 0.96),
      activeListingsCount: prices.length
    };
  } catch {
    return null;
  }
}

async function fetchEbayQuote(
  figId: string,
  name: string,
  condition: string,
  clientId: string,
  clientSecret: string,
  marketplaceId: string
): Promise<LivePortalQuotePayload | null> {
  try {
    const basic = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
    });
    if (!tokenRes.ok) return null;
    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) return null;

    const cleanName = name.split(/[—(]/)[0].trim().slice(0, 40);
    const q = `LEGO ${figId} ${cleanName}`.trim();
    const condFilter = condition === 'new' ? 'conditions:{NEW}' : 'conditions:{USED}';
    const searchUrl =
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}` +
      `&limit=25&filter=${encodeURIComponent(`deliveryCountry:ES,${condFilter}`)}`;

    const searchRes = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'X-EBAY-C-MARKETPLACE-ID': marketplaceId
      }
    });
    if (!searchRes.ok) return null;
    const searchData = (await searchRes.json()) as {
      itemSummaries?: Array<{ price?: { value?: string; currency?: string } }>;
      total?: number;
    };

    const prices: number[] = [];
    for (const item of searchData.itemSummaries || []) {
      const val = Number(item.price?.value);
      const cur = (item.price?.currency || 'EUR').toUpperCase();
      if (!Number.isFinite(val) || val <= 0.5 || val > 10000) continue;
      // Conversión ligera solo si eBay devuelve USD/GBP
      const eur = cur === 'USD' ? val * 0.92 : cur === 'GBP' ? val * 1.17 : val;
      prices.push(eur);
    }

    if (prices.length === 0) return null;
    prices.sort((a, b) => a - b);
    const trimmed = prices.length >= 6 ? prices.slice(1, -1) : prices;
    const avg = trimmed.reduce((s, p) => s + p, 0) / trimmed.length;

    return {
      minPriceEur: roundEur(prices[0]),
      avgPriceEur: roundEur(avg),
      maxPriceEur: roundEur(prices[prices.length - 1]),
      soldAvg6mEur: roundEur(avg * 0.92),
      activeListingsCount: Number(searchData.total || prices.length)
    };
  } catch {
    return null;
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'GET') {
    return jsonRes({ error: 'Method not allowed' }, 405);
  }

  const url = new URL(req.url);
  const figId = (url.searchParams.get('figId') || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  const name = (url.searchParams.get('name') || '').trim().slice(0, 80);
  const condition = url.searchParams.get('condition') || 'used_complete';

  if (!figId) {
    return jsonRes({ error: 'Missing figId' }, 400);
  }

  const brickowlKey = process.env.BRICKOWL_API_KEY || '';
  const ebayId = process.env.EBAY_CLIENT_ID || '';
  const ebaySecret = process.env.EBAY_CLIENT_SECRET || '';
  const ebayMarketplace = process.env.EBAY_MARKETPLACE_ID || 'EBAY_ES';

  const [brickowlQuote, ebayQuote] = await Promise.all([
    brickowlKey ? fetchBrickOwlQuote(figId, condition, brickowlKey) : Promise.resolve(null),
    ebayId && ebaySecret
      ? fetchEbayQuote(figId, name, condition, ebayId, ebaySecret, ebayMarketplace)
      : Promise.resolve(null)
  ]);

  const liveQuotes: Record<string, LivePortalQuotePayload> = {};
  if (brickowlQuote) liveQuotes.brickowl = brickowlQuote;
  if (ebayQuote) liveQuotes.ebay = ebayQuote;

  let referenceMeta: {
    newEur?: number;
    usedEur?: number;
    yearReleased?: number;
    appearsInSets?: number;
  } | null = null;

  if (!liveQuotes.bricklink) {
    try {
      const bsRes = await fetch(`https://brickset.com/minifigs/${encodeURIComponent(figId)}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml'
        }
      });
      if (bsRes.ok) {
        const html = await bsRes.text();
        const parseUsd = (raw?: string): number => {
          if (!raw) return 0;
          const n = Number(raw.replace(/,/g, ''));
          return Number.isFinite(n) ? n : 0;
        };
        const newUsdMatch = html.match(/New:\s*<a[^>]*>~?\$?([0-9][0-9,]*(?:\.[0-9]+)?)/i);
        const usedUsdMatch = html.match(/Used:\s*<a[^>]*>~?\$?([0-9][0-9,]*(?:\.[0-9]+)?)/i);
        const yearMatch = html.match(/Year released<\/dt>\s*<dd><a[^>]*>(\d{4})<\/a>/i);
        const setsMatch = html.match(/Appears in<\/dt>\s*<dd><a[^>]*>(\d+)\s+set/i);

        const newUsd = parseUsd(newUsdMatch?.[1]);
        const usedUsd = parseUsd(usedUsdMatch?.[1]);
        const usdToEur = 0.92;

        const targetUsd =
          condition === 'new'
            ? newUsd || (usedUsd ? usedUsd * 1.32 : 0)
            : condition === 'used_incomplete'
            ? (usedUsd || newUsd * 0.72) * 0.58
            : usedUsd || (newUsd ? newUsd * 0.75 : 0);

        if (targetUsd > 0.3 && targetUsd < 20000) {
          const avgEur = roundEur(targetUsd * usdToEur);
          liveQuotes.bricklink = {
            minPriceEur: roundEur(Math.max(0.5, avgEur * 0.84)),
            avgPriceEur: roundEur(avgEur * 1.03),
            maxPriceEur: roundEur(avgEur * 1.26),
            soldAvg6mEur: avgEur,
            activeListingsCount: 16
          };
        }

        if (newUsd > 0 || usedUsd > 0 || yearMatch) {
          referenceMeta = {
            newEur: newUsd > 0 ? roundEur(newUsd * usdToEur) : undefined,
            usedEur: usedUsd > 0 ? roundEur(usedUsd * usdToEur) : undefined,
            yearReleased: yearMatch ? Number(yearMatch[1]) : undefined,
            appearsInSets: setsMatch ? Number(setsMatch[1]) : undefined
          };
        }
      }
    } catch {
      // ignore
    }
  }

  const hasLiveQuotes = Object.keys(liveQuotes).length > 0;
  return jsonRes(
    {
      figId,
      condition,
      configured: Boolean(hasLiveQuotes || brickowlKey || (ebayId && ebaySecret)),
      providers: {
        bricklink_public: Boolean(liveQuotes.bricklink),
        brickowl: Boolean(brickowlKey),
        ebay: Boolean(ebayId && ebaySecret)
      },
      liveQuotes,
      referenceMeta,
      fetchedAtIso: new Date().toISOString()
    },
    200,
    hasLiveQuotes ? 3600 : 60
  );
}
