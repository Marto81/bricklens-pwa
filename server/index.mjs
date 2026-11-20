import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PORT = Number(process.env.PORT || 3000);

// Carga opcional de .env local sin dependencias externas
const envFile = path.join(ROOT_DIR, '.env');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};

const responseCache = new Map();
let cachedEbayToken = { token: '', expiresAt: 0 };

function getCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value, ttlMs) {
  if (responseCache.size > 300) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
  responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function sendJson(res, status, payload, cacheSec = 0) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheSec > 0 ? `public, max-age=${cacheSec}` : 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function inferPartCategory(partName) {
  const n = String(partName || '').toLowerCase();
  if (/(helmet|hair|hat|hood|cap|crown|mask|headgear|visor|beanie|turban)/.test(n)) {
    return 'headgear';
  }
  if (/(minifig head|\bhead\b|cabeza)/.test(n) && !/(headdress|headgear)/.test(n)) {
    return 'head';
  }
  if (/(torso|body|upper)/.test(n)) return 'torso';
  if (/(hips|legs|skirt|dress|lower|tail)/.test(n)) return 'legs';
  return 'accessory';
}

function roundEur(v) {
  return Math.round(v * 100) / 100;
}

async function rbFetch(apiPath, apiKey) {
  const res = await fetch(`https://rebrickable.com/api/v3/lego${apiPath}`, {
    headers: { Accept: 'application/json', Authorization: `key ${apiKey}` },
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) return null;
  return res.json();
}

async function handleRebrickable(url, res) {
  const apiKey = process.env.REBRICKABLE_API_KEY || '';
  if (!apiKey) {
    return sendJson(res, 200, { configured: false, provider: 'rebrickable', results: [] });
  }

  const cacheKey = `rb:${url.search}`;
  const hit = getCached(cacheKey);
  if (hit) return sendJson(res, 200, hit, 3600);

  const action = url.searchParams.get('action') || 'minifig';

  try {
    if (action === 'search') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
      if (q.length < 2) return sendJson(res, 200, { configured: true, results: [] });
      const data = await rbFetch(`/minifigs/?search=${encodeURIComponent(q)}&page_size=12`, apiKey);
      const results = (data?.results || []).map((row) => ({
        rebrickableId: String(row.set_num || ''),
        name: String(row.name || ''),
        numParts: Number(row.num_parts || 4),
        imageUrl: String(row.set_img_url || '')
      }));
      const payload = { configured: true, results };
      setCached(cacheKey, payload, 3600_000);
      return sendJson(res, 200, payload, 3600);
    }

    if (action === 'part_minifigs') {
      const partNum = (url.searchParams.get('part') || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
      if (!partNum) return sendJson(res, 200, { configured: true, partNum: '', minifigs: [] });

      const partInfo = await rbFetch(`/parts/${encodeURIComponent(partNum)}/`, apiKey);
      const colorsData = await rbFetch(`/parts/${encodeURIComponent(partNum)}/colors/?page_size=8`, apiKey);
      const minifigMap = new Map();

      for (const col of (colorsData?.results || []).slice(0, 4)) {
        const setsData = await rbFetch(
          `/parts/${encodeURIComponent(partNum)}/colors/${col.color_id}/sets/?page_size=25`,
          apiKey
        );
        for (const s of setsData?.results || []) {
          const setNum = String(s.set_num || '');
          if (setNum.startsWith('fig-')) {
            minifigMap.set(setNum, {
              rebrickableId: setNum,
              name: String(s.name || setNum),
              numParts: Number(s.num_parts || 4),
              imageUrl: String(s.set_img_url || '')
            });
          }
        }
      }

      const payload = {
        configured: true,
        partNum,
        partName: partInfo?.name || partNum,
        partImageUrl: partInfo?.part_img_url || '',
        minifigs: Array.from(minifigMap.values()).slice(0, 16)
      };
      setCached(cacheKey, payload, 3600_000);
      return sendJson(res, 200, payload, 3600);
    }

    const rawId = (url.searchParams.get('id') || '').trim().slice(0, 48);
    if (!rawId) return sendJson(res, 400, { error: 'Missing id' });

    let minifigRow = null;
    if (rawId.toLowerCase().startsWith('fig-')) {
      minifigRow = await rbFetch(`/minifigs/${encodeURIComponent(rawId.toLowerCase())}/`, apiKey);
    }
    if (!minifigRow) {
      const searchRes = await rbFetch(`/minifigs/?search=${encodeURIComponent(rawId)}&page_size=5`, apiKey);
      minifigRow = searchRes?.results?.[0] || null;
    }
    if (!minifigRow?.set_num) {
      return sendJson(res, 200, { configured: true, found: false, id: rawId }, 600);
    }

    const setNum = String(minifigRow.set_num);
    const [partsRes, setsRes] = await Promise.all([
      rbFetch(`/minifigs/${encodeURIComponent(setNum)}/parts/?page_size=40`, apiKey),
      rbFetch(`/minifigs/${encodeURIComponent(setNum)}/sets/?page_size=12`, apiKey)
    ]);

    const parts = (partsRes?.results || []).map((entry) => {
      const p = entry.part || {};
      const c = entry.color || {};
      const blIds = Array.isArray(p.external_ids?.BrickLink) ? p.external_ids.BrickLink : [];
      const partNum = String(blIds[0] || p.part_num || 'part');
      const name = String(p.name || 'Pieza LEGO');
      return {
        partNum,
        rebrickablePartNum: String(p.part_num || partNum),
        name,
        category: inferPartCategory(name),
        colorName: String(c.name || ''),
        quantity: Number(entry.quantity || 1),
        imageUrl: String(p.part_img_url || '')
      };
    });

    const sets = (setsRes?.results || []).map((s) => ({
      setNum: String(s.set_num || ''),
      name: String(s.name || ''),
      year: Number(s.year || 0),
      imageUrl: String(s.set_img_url || '')
    }));

    const years = sets.map((s) => s.year).filter((y) => y >= 1978 && y <= 2030).sort((a, b) => a - b);

    const payload = {
      configured: true,
      found: true,
      rebrickableId: setNum,
      name: String(minifigRow.name || rawId),
      numParts: Number(minifigRow.num_parts || parts.length || 4),
      imageUrl: String(minifigRow.set_img_url || ''),
      yearReleased: years[0],
      appearsInSets: sets.length,
      sampleSetCode: sets[0] ? `${sets[0].setNum} (${sets[0].name})` : undefined,
      sets,
      parts
    };
    setCached(cacheKey, payload, 6 * 3600_000);
    return sendJson(res, 200, payload, 21600);
  } catch (err) {
    return sendJson(res, 502, {
      configured: true,
      error: err instanceof Error ? err.message : 'Rebrickable proxy error'
    });
  }
}

async function getEbayAppToken(clientId, clientSecret) {
  if (cachedEbayToken.token && Date.now() < cachedEbayToken.expiresAt) {
    return cachedEbayToken.token;
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.access_token) return null;
  const expiresInMs = Math.max(60, Number(data.expires_in || 7200) - 120) * 1000;
  cachedEbayToken = { token: data.access_token, expiresAt: Date.now() + expiresInMs };
  return cachedEbayToken.token;
}

async function handlePrices(url, res) {
  const figId = (url.searchParams.get('figId') || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
  const name = (url.searchParams.get('name') || '').trim().slice(0, 80);
  const condition = url.searchParams.get('condition') || 'used_complete';
  if (!figId) return sendJson(res, 400, { error: 'Missing figId' });

  const cacheKey = `prices:${figId.toLowerCase()}:${condition}`;
  const hit = getCached(cacheKey);
  if (hit) return sendJson(res, 200, hit, 1800);

  const brickowlKey = process.env.BRICKOWL_API_KEY || '';
  const ebayId = process.env.EBAY_CLIENT_ID || '';
  const ebaySecret = process.env.EBAY_CLIENT_SECRET || '';
  const ebayMarketplace = process.env.EBAY_MARKETPLACE_ID || 'EBAY_ES';

  const liveQuotes = {};

  const tasks = [];

  if (brickowlKey) {
    tasks.push(
      (async () => {
        try {
          const lookupRes = await fetch(
            `https://api.brickowl.com/v1/catalog/id_lookup?key=${encodeURIComponent(brickowlKey)}&id=${encodeURIComponent(figId)}&type=Minifigure&id_type=bl_id`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (!lookupRes.ok) return;
          const lookup = await lookupRes.json();
          const boid = lookup?.boids?.[0];
          if (!boid) return;

          const availRes = await fetch(
            `https://api.brickowl.com/v1/catalog/availability?key=${encodeURIComponent(brickowlKey)}&boid=${encodeURIComponent(boid)}&country=ES`,
            { signal: AbortSignal.timeout(10000) }
          );
          if (!availRes.ok) return;
          const avail = await availRes.json();
          const wantNew = condition === 'new';
          const prices = [];
          for (const entry of Object.values(avail || {})) {
            if (!entry || typeof entry !== 'object') continue;
            const isNew = String(entry.con || '').toLowerCase().startsWith('new');
            if (wantNew !== isNew) continue;
            const p = Number(entry.price);
            if (Number.isFinite(p) && p > 0.2 && p < 10000) prices.push(p);
          }
          if (prices.length === 0) return;
          prices.sort((a, b) => a - b);
          const trimmed = prices.length >= 6 ? prices.slice(1, -1) : prices;
          const avg = trimmed.reduce((s, p) => s + p, 0) / trimmed.length;
          liveQuotes.brickowl = {
            minPriceEur: roundEur(prices[0]),
            avgPriceEur: roundEur(avg),
            maxPriceEur: roundEur(prices[prices.length - 1]),
            soldAvg6mEur: roundEur(avg * 0.96),
            activeListingsCount: prices.length
          };
        } catch {
          // ignore
        }
      })()
    );
  }

  if (ebayId && ebaySecret) {
    tasks.push(
      (async () => {
        try {
          const token = await getEbayAppToken(ebayId, ebaySecret);
          if (!token) return;
          const cleanName = name.split(/[—(]/)[0].trim().slice(0, 40);
          const q = `LEGO ${figId} ${cleanName}`.trim();
          const condFilter = condition === 'new' ? 'conditions:{NEW}' : 'conditions:{USED}';
          const searchRes = await fetch(
            `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=25&filter=${encodeURIComponent(`deliveryCountry:ES,${condFilter}`)}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'X-EBAY-C-MARKETPLACE-ID': ebayMarketplace
              },
              signal: AbortSignal.timeout(10000)
            }
          );
          if (!searchRes.ok) return;
          const data = await searchRes.json();
          const prices = [];
          for (const item of data?.itemSummaries || []) {
            const val = Number(item?.price?.value);
            const cur = String(item?.price?.currency || 'EUR').toUpperCase();
            if (!Number.isFinite(val) || val <= 0.5 || val > 10000) continue;
            const eur = cur === 'USD' ? val * 0.92 : cur === 'GBP' ? val * 1.17 : val;
            prices.push(eur);
          }
          if (prices.length === 0) return;
          prices.sort((a, b) => a - b);
          const trimmed = prices.length >= 6 ? prices.slice(1, -1) : prices;
          const avg = trimmed.reduce((s, p) => s + p, 0) / trimmed.length;
          liveQuotes.ebay = {
            minPriceEur: roundEur(prices[0]),
            avgPriceEur: roundEur(avg),
            maxPriceEur: roundEur(prices[prices.length - 1]),
            soldAvg6mEur: roundEur(avg * 0.92),
            activeListingsCount: Number(data?.total || prices.length)
          };
        } catch {
          // ignore
        }
      })()
    );
  }

  await Promise.all(tasks);

  // Fuente pública sin API key: Brickset Current Value (derivado de BrickLink New / Used)
  let referenceMeta = null;
  if (!liveQuotes.bricklink) {
    try {
      const bsRes = await fetch(`https://brickset.com/minifigs/${encodeURIComponent(figId)}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml'
        },
        signal: AbortSignal.timeout(6500)
      });
      if (bsRes.ok) {
        const html = await bsRes.text();
        const newUsdMatch = html.match(/New:\s*<a[^>]*>~?\$?([0-9]+(?:[.,][0-9]+)?)/i);
        const usedUsdMatch = html.match(/Used:\s*<a[^>]*>~?\$?([0-9]+(?:[.,][0-9]+)?)/i);
        const yearMatch = html.match(/Year released<\/dt>\s*<dd><a[^>]*>(\d{4})<\/a>/i);
        const setsMatch = html.match(/Appears in<\/dt>\s*<dd><a[^>]*>(\d+)\s+set/i);

        const newUsd = newUsdMatch ? Number(newUsdMatch[1].replace(',', '.')) : 0;
        const usedUsd = usedUsdMatch ? Number(usedUsdMatch[1].replace(',', '.')) : 0;
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
      // ignore timeout or rate limit
    }
  }

  const hasLiveQuotes = Object.keys(liveQuotes).length > 0;
  const payload = {
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
  };

  setCached(cacheKey, payload, 6 * 3600_000);
  return sendJson(res, 200, payload, 3600);
}

async function handleBrickognizeProxy(req, url, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST' });
  try {
    const mode = url.searchParams.get('mode') === 'parts' ? 'parts' : 'figs';
    const topK = Math.max(1, Math.min(50, Number(url.searchParams.get('top_k_items')) || 12));
    const minSim = Math.max(0.05, Math.min(1, Number(url.searchParams.get('min_similarity_items')) || 0.2));

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyBuf = Buffer.concat(chunks);

    const upstreamRes = await fetch(
      `https://api.brickognize.com/predict/${mode}/?top_k_items=${topK}&min_similarity_items=${minSim}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': req.headers['content-type'] || 'application/octet-stream',
          Accept: 'application/json'
        },
        body: bodyBuf,
        signal: AbortSignal.timeout(15000)
      }
    );
    const text = await upstreamRes.text();
    res.writeHead(upstreamRes.status, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': upstreamRes.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(text);
  } catch (err) {
    return sendJson(res, 502, {
      error: err instanceof Error ? err.message : 'Brickognize proxy error'
    });
  }
}

function serveStaticFile(urlPath, res) {
  if (!fs.existsSync(DIST_DIR)) {
    return sendJson(res, 404, { error: 'dist/ not built. Run npm run build first.' });
  }
  const safePath = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST_DIR, safePath === '/' ? 'index.html' : safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath);
  const noCacheFiles = new Set(['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest']);
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': noCacheFiles.has(baseName)
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000, immutable'
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (!req.url) return sendJson(res, 400, { error: 'Bad request' });
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/health' || url.pathname === '/api/health.php') {
    return sendJson(res, 200, {
      ok: true,
      status: 'ok',
      runtime: 'node',
      service: 'BrickLens PWA Server v2',
      providers: {
        brickognize: true,
        rebrickable: Boolean(process.env.REBRICKABLE_API_KEY),
        brickowl: Boolean(process.env.BRICKOWL_API_KEY),
        ebay: Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET)
      },
      timestamp: new Date().toISOString()
    });
  }

  if (url.pathname === '/api/rebrickable' || url.pathname === '/api/rebrickable.php') {
    return handleRebrickable(url, res);
  }

  if (url.pathname === '/api/prices' || url.pathname === '/api/prices.php') {
    return handlePrices(url, res);
  }

  if (url.pathname === '/api/brickognize' || url.pathname === '/api/brickognize.php') {
    return handleBrickognizeProxy(req, url, res);
  }

  return serveStaticFile(url.pathname, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`BrickLens PWA Server v2 escuchando en http://0.0.0.0:${PORT}`);
});
