export const config = {
  runtime: 'edge'
};

const CORS_HEADERS: HeadersInit = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type, accept'
};

const REBRICKABLE_BASE = 'https://rebrickable.com/api/v3/lego';

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

async function rbFetch(path: string, apiKey: string): Promise<unknown | null> {
  const res = await fetch(`${REBRICKABLE_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `key ${apiKey}`
    }
  });
  if (!res.ok) return null;
  return res.json();
}

function inferPartCategory(partName: string): 'headgear' | 'head' | 'torso' | 'legs' | 'accessory' {
  const n = partName.toLowerCase();
  if (/(helmet|hair|hat|hood|cap|crown|mask|headgear|visor|beanie|turban)/.test(n)) {
    return 'headgear';
  }
  if (/(minifig head|\bhead\b|cabeza)/.test(n) && !/(headdress|headgear)/.test(n)) {
    return 'head';
  }
  if (/(torso|body|upper)/.test(n)) {
    return 'torso';
  }
  if (/(hips|legs|skirt|dress|lower|tail)/.test(n)) {
    return 'legs';
  }
  return 'accessory';
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'GET') {
    return jsonRes({ error: 'Method not allowed' }, 405);
  }

  const apiKey = process.env.REBRICKABLE_API_KEY || '';
  if (!apiKey) {
    return jsonRes({ configured: false, provider: 'rebrickable', results: [] }, 200);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'minifig';

  try {
    if (action === 'search') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
      if (q.length < 2) return jsonRes({ configured: true, results: [] });

      const data = (await rbFetch(
        `/minifigs/?search=${encodeURIComponent(q)}&page_size=12`,
        apiKey
      )) as { results?: Array<Record<string, unknown>> } | null;

      const results = (data?.results || []).map((row) => ({
        rebrickableId: String(row.set_num || ''),
        name: String(row.name || ''),
        numParts: Number(row.num_parts || 4),
        imageUrl: String(row.set_img_url || '')
      }));

      return jsonRes({ configured: true, results }, 200, 3600);
    }

    if (action === 'part_minifigs') {
      const partNum = (url.searchParams.get('part') || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
      if (!partNum) return jsonRes({ configured: true, partNum: '', minifigs: [] });

      // Buscar primero en sets/minifigs que incluyen la pieza vía inventario de colores
      const partInfo = (await rbFetch(`/parts/${encodeURIComponent(partNum)}/`, apiKey)) as {
        part_num?: string;
        name?: string;
        part_img_url?: string;
      } | null;

      const colorsData = (await rbFetch(
        `/parts/${encodeURIComponent(partNum)}/colors/?page_size=12`,
        apiKey
      )) as {
        results?: Array<{
          color_id: number;
          color_name: string;
          num_sets: number;
          part_img_url?: string;
        }>;
      } | null;

      const topColors = (colorsData?.results || []).slice(0, 4);
      const minifigMap = new Map<
        string,
        { rebrickableId: string; name: string; numParts: number; imageUrl: string }
      >();

      for (const color of topColors) {
        const setsData = (await rbFetch(
          `/parts/${encodeURIComponent(partNum)}/colors/${color.color_id}/sets/?page_size=25`,
          apiKey
        )) as { results?: Array<Record<string, unknown>> } | null;

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

      // Fallback de búsqueda directa si el filtro de sets devolvió pocos fig-*
      if (minifigMap.size === 0 && partInfo?.name) {
        const cleanQuery = partInfo.name
          .replace(/\b(torso|head|legs|helmet|hair|with|and|print|pattern)\b/gi, '')
          .trim()
          .split(/\s+/)
          .slice(0, 3)
          .join(' ');
        if (cleanQuery.length >= 3) {
          const fallback = (await rbFetch(
            `/minifigs/?search=${encodeURIComponent(cleanQuery)}&page_size=8`,
            apiKey
          )) as { results?: Array<Record<string, unknown>> } | null;
          for (const row of fallback?.results || []) {
            const setNum = String(row.set_num || '');
            if (setNum) {
              minifigMap.set(setNum, {
                rebrickableId: setNum,
                name: String(row.name || setNum),
                numParts: Number(row.num_parts || 4),
                imageUrl: String(row.set_img_url || '')
              });
            }
          }
        }
      }

      return jsonRes(
        {
          configured: true,
          partNum,
          partName: partInfo?.name || partNum,
          partImageUrl: partInfo?.part_img_url || '',
          minifigs: Array.from(minifigMap.values()).slice(0, 16)
        },
        200,
        3600
      );
    }

    // action === 'minifig': resolver por fig-xxxxxx o por código BrickLink (ej. sw0585)
    const rawId = (url.searchParams.get('id') || '').trim().slice(0, 48);
    if (!rawId) return jsonRes({ error: 'Missing id' }, 400);

    let minifigRow: Record<string, unknown> | null = null;
    if (rawId.toLowerCase().startsWith('fig-')) {
      minifigRow = (await rbFetch(
        `/minifigs/${encodeURIComponent(rawId.toLowerCase())}/`,
        apiKey
      )) as Record<string, unknown> | null;
    }

    if (!minifigRow) {
      const searchRes = (await rbFetch(
        `/minifigs/?search=${encodeURIComponent(rawId)}&page_size=5`,
        apiKey
      )) as { results?: Array<Record<string, unknown>> } | null;
      minifigRow = searchRes?.results?.[0] || null;
    }

    if (!minifigRow || !minifigRow.set_num) {
      return jsonRes({ configured: true, found: false, id: rawId }, 200, 600);
    }

    const setNum = String(minifigRow.set_num);
    const [partsRes, setsRes] = await Promise.all([
      rbFetch(`/minifigs/${encodeURIComponent(setNum)}/parts/?page_size=40`, apiKey) as Promise<{
        results?: Array<Record<string, unknown>>;
      } | null>,
      rbFetch(`/minifigs/${encodeURIComponent(setNum)}/sets/?page_size=12`, apiKey) as Promise<{
        results?: Array<Record<string, unknown>>;
      } | null>
    ]);

    const parts = (partsRes?.results || []).map((entry) => {
      const p = (entry.part || {}) as Record<string, unknown>;
      const c = (entry.color || {}) as Record<string, unknown>;
      const ext = (p.external_ids || {}) as Record<string, unknown>;
      const blIds = Array.isArray(ext.BrickLink) ? ext.BrickLink : [];
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

    const earliestYear = sets
      .map((s) => s.year)
      .filter((y) => y >= 1978 && y <= 2030)
      .sort((a, b) => a - b)[0];

    return jsonRes(
      {
        configured: true,
        found: true,
        rebrickableId: setNum,
        name: String(minifigRow.name || rawId),
        numParts: Number(minifigRow.num_parts || parts.length || 4),
        imageUrl: String(minifigRow.set_img_url || ''),
        yearReleased: earliestYear || undefined,
        appearsInSets: sets.length,
        sampleSetCode: sets[0] ? `${sets[0].setNum} (${sets[0].name})` : undefined,
        sets,
        parts
      },
      200,
      21600
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Rebrickable upstream error';
    return jsonRes({ configured: true, error: message }, 502);
  }
}
