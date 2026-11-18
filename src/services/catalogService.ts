import type {
  LivePortalQuoteSnapshot,
  MarketplaceId,
  MinifigCondition,
  MinifigPartBreakdown,
  MinifigSetAppearance,
  MinifigureMetadata,
  PartMatchedMinifig,
  PreferredPriceSource,
  PriceComparisonReport,
  ScannedPartChip
} from '../types/minifig';
import {
  ALL_MINIFIG_CATALOG,
  createCustomMinifigMetadata,
  findMinifigById,
  searchMinifigCatalog
} from '../data/catalogPresets';
import { db, getObservedPricesForFig } from '../db/collectionDb';
import { fetchProxyJson } from './apiConfig';
import { generatePriceComparisonReport } from './priceAggregator';

const CATALOG_TTL_MS = 14 * 24 * 3600_000; // 14 días
const LIVE_PRICES_TTL_MS = 12 * 3600_000; // 12 horas

function roundEur(v: number): number {
  return Math.round(v * 100) / 100;
}

const CATEGORY_WEIGHTS: Record<MinifigPartBreakdown['category'], number> = {
  torso: 0.38,
  headgear: 0.22,
  legs: 0.22,
  head: 0.13,
  accessory: 0.08
};

/**
 * Asigna precios proporcionales realistas a un despiece real de Rebrickable
 * en función del valor de mercado usado de la minifigura.
 */
function assignProportionalPartPrices(
  rawParts: Array<{
    partNum: string;
    rebrickablePartNum?: string;
    name: string;
    category: MinifigPartBreakdown['category'];
    colorName?: string;
    quantity?: number;
    imageUrl?: string;
  }>,
  usedCompleteValueEur: number
): MinifigPartBreakdown[] {
  if (rawParts.length === 0) return [];
  const weights = rawParts.map((p) => (CATEGORY_WEIGHTS[p.category] ?? 0.12) * Math.max(1, p.quantity ?? 1));
  const sumW = weights.reduce((s, w) => s + w, 0) || 1;
  const totalBudget = Math.max(1.5, usedCompleteValueEur * 1.05);

  return rawParts.map((p, idx) => ({
    partNum: p.partNum,
    rebrickablePartNum: p.rebrickablePartNum,
    name: p.name,
    category: p.category,
    colorName: p.colorName || undefined,
    quantity: p.quantity || 1,
    imageUrl: p.imageUrl || undefined,
    avgPriceEur: roundEur(Math.max(0.35, totalBudget * (weights[idx] / sumW)))
  }));
}

interface RebrickableMinifigResponse {
  configured?: boolean;
  found?: boolean;
  rebrickableId?: string;
  name?: string;
  numParts?: number;
  imageUrl?: string;
  yearReleased?: number;
  appearsInSets?: number;
  sampleSetCode?: string;
  sets?: MinifigSetAppearance[];
  parts?: Array<{
    partNum: string;
    rebrickablePartNum?: string;
    name: string;
    category: MinifigPartBreakdown['category'];
    colorName?: string;
    quantity?: number;
    imageUrl?: string;
  }>;
}

/**
 * Enriquece cualquier minifigura (catálogo local o escaneada) con despiece real,
 * foto oficial y lista de sets desde caché IndexedDB o Rebrickable vía proxy.
 */
export async function enrichMinifigMetadata(
  minifig: MinifigureMetadata,
  forceRefresh = false
): Promise<{ minifig: MinifigureMetadata; enrichedFromLive: boolean }> {
  const key = minifig.figId.trim().toLowerCase();
  const cached = await db.catalogCache.get(key);

  if (
    !forceRefresh &&
    cached?.rebrickableData &&
    Date.now() - Date.parse(cached.rebrickableData.fetchedAtIso) < CATALOG_TTL_MS &&
    cached.rebrickableData.parts.length > 0
  ) {
    const rb = cached.rebrickableData;
    return {
      minifig: {
        ...minifig,
        rebrickableId: rb.rebrickableId || minifig.rebrickableId,
        name: minifig.isEstimatedFallbackPrice && rb.name ? rb.name : minifig.name,
        imageUrl:
          minifig.imageUrl.startsWith('data:image/svg+xml') && rb.imageUrl
            ? rb.imageUrl
            : minifig.imageUrl,
        numParts: rb.numParts || rb.parts.length || minifig.numParts,
        yearReleased: rb.yearReleased || minifig.yearReleased,
        appearsInSets: rb.appearsInSets ?? minifig.appearsInSets,
        sampleSetCode: rb.sampleSetCode || minifig.sampleSetCode,
        sets: rb.sets && rb.sets.length > 0 ? rb.sets : minifig.sets,
        parts: rb.parts,
        partsSource: 'rebrickable_live'
      },
      enrichedFromLive: true
    };
  }

  const queryId = minifig.rebrickableId?.startsWith('fig-') && !minifig.rebrickableId.includes(key)
    ? minifig.rebrickableId
    : minifig.figId;

  const { ok, data } = await fetchProxyJson<RebrickableMinifigResponse>(
    'rebrickable',
    `action=minifig&id=${encodeURIComponent(queryId)}`,
    9000
  );

  if (!ok || !data?.configured || !data.found || !data.parts || data.parts.length === 0) {
    return { minifig, enrichedFromLive: false };
  }

  const pricedParts = assignProportionalPartPrices(
    data.parts,
    minifig.baseMarketPriceEur.used_complete
  );
  const nowIso = new Date().toISOString();

  await db.catalogCache.put({
    figId: key,
    rebrickableData: {
      rebrickableId: data.rebrickableId || minifig.rebrickableId,
      name: data.name || minifig.name,
      numParts: data.numParts || pricedParts.length,
      imageUrl: data.imageUrl || undefined,
      yearReleased: data.yearReleased,
      appearsInSets: data.appearsInSets,
      sampleSetCode: data.sampleSetCode,
      sets: data.sets,
      parts: pricedParts,
      fetchedAtIso: nowIso
    },
    livePricesByCondition: cached?.livePricesByCondition,
    updatedAtIso: nowIso
  });

  return {
    minifig: {
      ...minifig,
      rebrickableId: data.rebrickableId || minifig.rebrickableId,
      name: minifig.isEstimatedFallbackPrice && data.name ? data.name : minifig.name,
      imageUrl:
        minifig.imageUrl.startsWith('data:image/svg+xml') && data.imageUrl
          ? data.imageUrl
          : minifig.imageUrl,
      numParts: data.numParts || pricedParts.length,
      yearReleased: data.yearReleased || minifig.yearReleased,
      appearsInSets: data.appearsInSets ?? minifig.appearsInSets,
      sampleSetCode: data.sampleSetCode || minifig.sampleSetCode,
      sets: data.sets && data.sets.length > 0 ? data.sets : minifig.sets,
      parts: pricedParts,
      partsSource: 'rebrickable_live'
    },
    enrichedFromLive: true
  };
}

interface LivePricesProxyResponse {
  configured?: boolean;
  liveQuotes?: Partial<Record<MarketplaceId, LivePortalQuoteSnapshot>>;
  fetchedAtIso?: string;
}

/**
 * Construye el informe híbrido de los 5 portales:
 * 1) Precios anotados manualmente por el usuario en IndexedDB (máxima prioridad)
 * 2) Cotizaciones en vivo de BrickOwl / eBay desde caché IndexedDB o proxy servidor
 * 3) Respaldo de catálogo para portales C2C o sin clave
 */
export async function fetchHybridPriceReport(
  minifig: MinifigureMetadata,
  condition: MinifigCondition,
  preferredSource: PreferredPriceSource = 'weighted',
  forceRefresh = false
): Promise<PriceComparisonReport> {
  const key = minifig.figId.trim().toLowerCase();
  const [observedPrices, cached] = await Promise.all([
    getObservedPricesForFig(key, condition),
    db.catalogCache.get(key)
  ]);

  let liveQuotes: Partial<Record<MarketplaceId, LivePortalQuoteSnapshot>> | undefined =
    cached?.livePricesByCondition?.[condition]?.liveQuotes;

  const cachedTs = cached?.livePricesByCondition?.[condition]?.fetchedAtIso;
  const isCacheFresh = Boolean(cachedTs && Date.now() - Date.parse(cachedTs) < LIVE_PRICES_TTL_MS);

  if (forceRefresh || !isCacheFresh) {
    const { ok, data } = await fetchProxyJson<LivePricesProxyResponse>(
      'prices',
      `figId=${encodeURIComponent(minifig.figId)}&name=${encodeURIComponent(minifig.name)}&condition=${encodeURIComponent(condition)}`,
      9000
    );

    if (ok && data?.configured && data.liveQuotes && Object.keys(data.liveQuotes).length > 0) {
      liveQuotes = data.liveQuotes;
      const nowIso = new Date().toISOString();
      await db.catalogCache.put({
        figId: key,
        rebrickableData: cached?.rebrickableData,
        livePricesByCondition: {
          ...cached?.livePricesByCondition,
          [condition]: {
            liveQuotes,
            fetchedAtIso: nowIso
          }
        },
        updatedAtIso: nowIso
      });
    }
  }

  return generatePriceComparisonReport(minifig, condition, preferredSource, {
    liveQuotes,
    observedPrices
  });
}

/**
 * Búsqueda híbrida: catálogo local instantáneo + resultados remotos Rebrickable si está configurado.
 */
export async function searchMinifigsHybrid(query: string): Promise<{
  results: MinifigureMetadata[];
  usedLiveApi: boolean;
}> {
  const local = searchMinifigCatalog(query);
  const q = query.trim();
  if (q.length < 2) {
    return { results: local, usedLiveApi: false };
  }

  const { ok, data } = await fetchProxyJson<{
    configured?: boolean;
    results?: Array<{
      rebrickableId: string;
      name: string;
      numParts: number;
      imageUrl?: string;
    }>;
  }>('rebrickable', `action=search&q=${encodeURIComponent(q)}`, 6500);

  if (!ok || !data?.configured || !data.results || data.results.length === 0) {
    return { results: local, usedLiveApi: false };
  }

  const merged = new Map<string, MinifigureMetadata>();
  for (const m of local) {
    merged.set(m.figId.toLowerCase(), m);
  }

  for (const row of data.results) {
    const existing = findMinifigById(row.rebrickableId);
    if (existing) {
      merged.set(existing.figId.toLowerCase(), existing);
    } else if (row.rebrickableId) {
      const created = createCustomMinifigMetadata({
        figId: row.rebrickableId,
        name: row.name,
        imageUrl: row.imageUrl || undefined
      });
      created.rebrickableId = row.rebrickableId;
      created.numParts = row.numParts || 4;
      merged.set(created.figId.toLowerCase(), created);
    }
  }

  return { results: Array.from(merged.values()), usedLiveApi: true };
}

/**
 * Cruce de piezas sueltas (Part Scanner -> Minifiguras compatibles):
 * - Acepta 1 o varias piezas escaneadas (ej. torso + piernas o casco).
 * - Busca coincidencias en catálogo local Y en Rebrickable (/part_minifigs) si hay clave.
 * - Si hay >= 2 piezas, prioriza la intersección exacta (figuras que contienen TODAS las piezas).
 */
export async function findMinifigsByScannedParts(
  parts: ScannedPartChip[]
): Promise<{ matches: PartMatchedMinifig[]; usedLiveApi: boolean }> {
  if (parts.length === 0) return { matches: [], usedLiveApi: false };

  const candidateMap = new Map<
    string,
    {
      minifig: MinifigureMetadata;
      matchedParts: Set<string>;
      source: 'rebrickable_live' | 'local_catalog';
    }
  >();

  let usedLiveApi = false;

  // 1) Búsqueda en catálogo local (por partNum exacto, prefijo o palabras clave del nombre)
  for (const chip of parts) {
    const cleanNum = chip.partNum.trim().toLowerCase();
    const keywords = chip.name
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúñ\s]/gi, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !/^(lego|part|with|pattern|print|minifig|torso|head|legs|helmet)$/.test(w));

    for (const fig of ALL_MINIFIG_CATALOG) {
      const exactPartMatch = fig.parts.some(
        (p) =>
          p.partNum.toLowerCase() === cleanNum ||
          p.partNum.toLowerCase().includes(cleanNum) ||
          cleanNum.includes(p.partNum.toLowerCase())
      );

      let keywordMatch = false;
      if (!exactPartMatch && keywords.length > 0) {
        const figHaystack = `${fig.name} ${fig.theme} ${fig.parts.map((p) => p.name).join(' ')}`.toLowerCase();
        const hits = keywords.filter((kw) => figHaystack.includes(kw));
        keywordMatch = hits.length >= Math.min(2, keywords.length);
      }

      if (exactPartMatch || keywordMatch) {
        const mapKey = fig.figId.toLowerCase();
        const existing = candidateMap.get(mapKey) ?? {
          minifig: fig,
          matchedParts: new Set<string>(),
          source: 'local_catalog' as const
        };
        existing.matchedParts.add(chip.partNum);
        candidateMap.set(mapKey, existing);
      }
    }
  }

  // 2) Enriquecimiento en paralelo vía proxy Rebrickable si está configurado
  const liveLookups = await Promise.all(
    parts.map((chip) =>
      fetchProxyJson<{
        configured?: boolean;
        minifigs?: Array<{
          rebrickableId: string;
          name: string;
          numParts: number;
          imageUrl?: string;
        }>;
      }>('rebrickable', `action=part_minifigs&part=${encodeURIComponent(chip.partNum)}`, 8000).then(
        (res) => ({ chip, res })
      )
    )
  );

  for (const { chip, res } of liveLookups) {
    if (res.ok && res.data?.configured && Array.isArray(res.data.minifigs)) {
      usedLiveApi = true;
      for (const row of res.data.minifigs) {
        if (!row.rebrickableId) continue;
        const catalogMatch = findMinifigById(row.rebrickableId);
        const fig =
          catalogMatch ??
          createCustomMinifigMetadata({
            figId: row.rebrickableId,
            name: row.name,
            imageUrl: row.imageUrl || undefined
          });
        fig.rebrickableId = row.rebrickableId;
        const mapKey = fig.figId.toLowerCase();
        const existing = candidateMap.get(mapKey) ?? {
          minifig: fig,
          matchedParts: new Set<string>(),
          source: 'rebrickable_live' as const
        };
        existing.matchedParts.add(chip.partNum);
        existing.source = 'rebrickable_live';
        candidateMap.set(mapKey, existing);
      }
    }
  }

  const totalQueried = parts.length;
  const matches: PartMatchedMinifig[] = Array.from(candidateMap.values())
    .map((entry) => {
      const matchedPartNums = Array.from(entry.matchedParts);
      return {
        minifig: entry.minifig,
        matchedPartNums,
        totalQueriedParts: totalQueried,
        matchScore: matchedPartNums.length / totalQueried,
        source: entry.source
      };
    })
    .sort((a, b) => {
      if (b.matchedPartNums.length !== a.matchedPartNums.length) {
        return b.matchedPartNums.length - a.matchedPartNums.length;
      }
      if (a.source !== b.source) return a.source === 'rebrickable_live' ? -1 : 1;
      return b.minifig.baseMarketPriceEur.used_complete - a.minifig.baseMarketPriceEur.used_complete;
    })
    .slice(0, 12);

  return { matches, usedLiveApi };
}
