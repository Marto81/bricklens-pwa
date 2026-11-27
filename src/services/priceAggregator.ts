import type {
  BulkImportParsedLine,
  LivePortalQuoteSnapshot,
  LotDealEvaluation,
  LotDealVerdict,
  MarketplaceId,
  MarketplaceQuote,
  MinifigCondition,
  MinifigPartBreakdown,
  MinifigureMetadata,
  MissingPartsValuationSummary,
  PreferredPriceSource,
  PriceComparisonReport,
  QuoteDataSource
} from '../types/minifig';
import {
  ALL_MINIFIG_CATALOG,
  createCustomMinifigMetadata,
  findMinifigById
} from '../data/catalogPresets';

interface PortalMultiplierConfig {
  portal: MarketplaceId;
  portalName: string;
  regionLabel: string;
  isOfficialApi: boolean;
  reliabilityWeight: number;
  priceFactor: number;
  spreadLowFactor: number;
  spreadHighFactor: number;
  shippingEstimateEur: number;
  baseListingMultiplier: number;
  buildDeepLink: (figId: string, name: string) => string;
}

export const PREFERRED_PRICE_SOURCE_LABELS: Record<PreferredPriceSource, string> = {
  weighted: 'Media Ponderada (5 Portales)',
  bricklink_sold: 'BrickLink Vendidos (6m)',
  bricklink_stock: 'BrickLink Stock Actual',
  ebay: 'eBay España / UE',
  c2c_eu: 'Wallapop / Vinted (C2C)'
};

export const PORTAL_CONFIGS: PortalMultiplierConfig[] = [
  {
    portal: 'bricklink',
    portalName: 'BrickLink',
    regionLabel: 'Global / UE · Catálogo Oficial',
    isOfficialApi: true,
    reliabilityWeight: 0.45,
    priceFactor: 1.0,
    spreadLowFactor: 0.84,
    spreadHighFactor: 1.28,
    shippingEstimateEur: 4.2,
    baseListingMultiplier: 14,
    buildDeepLink: (figId) =>
      `https://www.bricklink.com/v2/catalog/catalogitem.page?M=${encodeURIComponent(figId)}#T=P`
  },
  {
    portal: 'brickowl',
    portalName: 'BrickOwl',
    regionLabel: 'Europa · Tiendas Especializadas',
    isOfficialApi: true,
    reliabilityWeight: 0.25,
    priceFactor: 1.03,
    spreadLowFactor: 0.87,
    spreadHighFactor: 1.25,
    shippingEstimateEur: 3.9,
    baseListingMultiplier: 8,
    buildDeepLink: (figId, name) =>
      `https://www.brickowl.com/search/catalog?query=${encodeURIComponent(`LEGO ${figId} ${name.split('—')[0].trim()}`)}`
  },
  {
    portal: 'ebay',
    portalName: 'eBay España / UE',
    regionLabel: 'Subastas + Comprar Ahora',
    isOfficialApi: true,
    reliabilityWeight: 0.15,
    priceFactor: 1.12,
    spreadLowFactor: 0.82,
    spreadHighFactor: 1.42,
    shippingEstimateEur: 4.95,
    baseListingMultiplier: 9,
    buildDeepLink: (figId, name) =>
      `https://www.ebay.es/sch/i.html?_nkw=${encodeURIComponent(`LEGO ${figId} ${name.split('(')[0].trim()}`)}&LH_PrefLoc=3`
  },
  {
    portal: 'wallapop',
    portalName: 'Wallapop',
    regionLabel: 'España / Sur UE · C2C',
    isOfficialApi: false,
    reliabilityWeight: 0.08,
    priceFactor: 0.88,
    spreadLowFactor: 0.72,
    spreadHighFactor: 1.18,
    shippingEstimateEur: 2.95,
    baseListingMultiplier: 5,
    buildDeepLink: (figId, name) =>
      `https://es.wallapop.com/app/search?keywords=${encodeURIComponent(`lego ${figId} ${name.split('—')[0].trim()}`)}`
  },
  {
    portal: 'vinted',
    portalName: 'Vinted',
    regionLabel: 'Europa C2C · Envío Económico',
    isOfficialApi: false,
    reliabilityWeight: 0.07,
    priceFactor: 0.85,
    spreadLowFactor: 0.70,
    spreadHighFactor: 1.15,
    shippingEstimateEur: 2.49,
    baseListingMultiplier: 6,
    buildDeepLink: (figId) =>
      `https://www.vinted.es/catalog?search_text=${encodeURIComponent(`lego ${figId}`)}`
  }
];

function roundEur(value: number): number {
  return Math.round(value * 100) / 100;
}

function deterministicOffset(figId: string, portal: string): number {
  let hash = 0;
  const key = `${figId}:${portal}`;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const normalized = (Math.abs(hash) % 100) / 1000;
  return normalized - 0.045;
}

/**
 * Calcula la media ponderada de los 5 portales priorizando datos reales (En vivo / Anotados)
 * con mayor peso relativo cuando coexisten con estimaciones.
 */
export function computeWeightedMarketValue(quotes: MarketplaceQuote[]): number {
  if (quotes.length === 0) return 0;
  let weightedSum = 0;
  let totalWeight = 0;

  const hasVerifiedData = quotes.some(
    (q) => q.dataSource === 'live_api' || q.dataSource === 'user_observed'
  );

  for (const q of quotes) {
    const referencePrice =
      q.dataSource === 'user_observed'
        ? q.avgPriceEur
        : q.isOfficialApi
        ? q.soldAvg6mEur
        : q.avgPriceEur;

    const confidenceBoost =
      q.dataSource === 'user_observed'
        ? 2.2
        : q.dataSource === 'live_api'
        ? 1.9
        : hasVerifiedData
        ? 0.45
        : 1.0;

    const effectiveWeight = q.reliabilityWeight * confidenceBoost;
    weightedSum += referencePrice * effectiveWeight;
    totalWeight += effectiveWeight;
  }

  return totalWeight > 0 ? roundEur(weightedSum / totalWeight) : 0;
}

export function resolvePreferredPriceFromQuotes(
  quotes: MarketplaceQuote[],
  preferredSource: PreferredPriceSource = 'weighted'
): number {
  if (preferredSource === 'bricklink_sold') {
    const bl = quotes.find((q) => q.portal === 'bricklink');
    if (bl) return bl.soldAvg6mEur;
  }
  if (preferredSource === 'bricklink_stock') {
    const bl = quotes.find((q) => q.portal === 'bricklink');
    if (bl) return bl.avgPriceEur;
  }
  if (preferredSource === 'ebay') {
    const ebay = quotes.find((q) => q.portal === 'ebay');
    if (ebay) return ebay.soldAvg6mEur;
  }
  if (preferredSource === 'c2c_eu') {
    const c2c = quotes.filter((q) => q.portal === 'wallapop' || q.portal === 'vinted');
    if (c2c.length > 0) {
      const avg = c2c.reduce((sum, q) => sum + q.avgPriceEur, 0) / c2c.length;
      return roundEur(avg);
    }
  }
  return computeWeightedMarketValue(quotes);
}

export interface PriceReportOverrides {
  liveQuotes?: Partial<Record<MarketplaceId, LivePortalQuoteSnapshot>>;
  observedPrices?: Partial<Record<MarketplaceId, number>>;
}

export function generatePriceComparisonReport(
  figIdOrMeta: string | MinifigureMetadata,
  condition: MinifigCondition,
  preferredSource: PreferredPriceSource = 'weighted',
  overrides?: PriceReportOverrides
): PriceComparisonReport {
  const minifig: MinifigureMetadata =
    typeof figIdOrMeta === 'string'
      ? findMinifigById(figIdOrMeta) ?? createCustomMinifigMetadata({ figId: figIdOrMeta })
      : figIdOrMeta;

  // Si tenemos cotizaciones reales (API o anotadas), anclamos el precio base de estimación para portales sin API
  const liveOrObservedValues: number[] = [];
  if (overrides?.liveQuotes) {
    for (const snap of Object.values(overrides.liveQuotes)) {
      if (snap && snap.avgPriceEur > 0) liveOrObservedValues.push(snap.avgPriceEur);
    }
  }
  if (overrides?.observedPrices) {
    for (const val of Object.values(overrides.observedPrices)) {
      if (typeof val === 'number' && val > 0) liveOrObservedValues.push(val);
    }
  }

  const catalogBasePrice = minifig.baseMarketPriceEur[condition];
  const liveBrickLinkAnchor =
    overrides?.liveQuotes?.bricklink?.soldAvg6mEur &&
    overrides.liveQuotes.bricklink.soldAvg6mEur > 0
      ? overrides.liveQuotes.bricklink.soldAvg6mEur
      : undefined;

  const anchorBasePrice =
    liveBrickLinkAnchor ??
    (minifig.isEstimatedFallbackPrice && liveOrObservedValues.length > 0
      ? liveOrObservedValues.reduce((s, v) => s + v, 0) / liveOrObservedValues.length
      : catalogBasePrice);

  const nowIso = new Date().toISOString();

  const rarityMultiplier =
    minifig.rarity === 'grail'
      ? 0.25
      : minifig.rarity === 'rare'
      ? 0.65
      : minifig.rarity === 'uncommon'
      ? 1.1
      : 2.2;

  let livePortalsCount = 0;
  let observedPortalsCount = 0;

  const quotes: MarketplaceQuote[] = PORTAL_CONFIGS.map((cfg) => {
    const userObserved = overrides?.observedPrices?.[cfg.portal];
    const liveSnap = overrides?.liveQuotes?.[cfg.portal];

    let dataSource: QuoteDataSource = 'catalog_estimate';
    let avgPriceEur: number;
    let soldAvg6mEur: number;
    let minPriceEur: number;
    let maxPriceEur: number;
    let activeListingsCount: number;

    if (typeof userObserved === 'number' && Number.isFinite(userObserved) && userObserved > 0) {
      dataSource = 'user_observed';
      observedPortalsCount += 1;
      avgPriceEur = roundEur(userObserved);
      soldAvg6mEur = roundEur(userObserved);
      minPriceEur = roundEur(Math.max(0.5, userObserved * 0.9));
      maxPriceEur = roundEur(userObserved * 1.12);
      activeListingsCount = 1;
    } else if (liveSnap && liveSnap.avgPriceEur > 0) {
      dataSource = 'live_api';
      livePortalsCount += 1;
      avgPriceEur = roundEur(liveSnap.avgPriceEur);
      soldAvg6mEur = roundEur(liveSnap.soldAvg6mEur || liveSnap.avgPriceEur * 0.96);
      minPriceEur = roundEur(liveSnap.minPriceEur);
      maxPriceEur = roundEur(liveSnap.maxPriceEur);
      activeListingsCount = Math.max(1, liveSnap.activeListingsCount);
    } else {
      const jitter = deterministicOffset(minifig.figId, cfg.portal);
      avgPriceEur = roundEur(Math.max(1.5, anchorBasePrice * (cfg.priceFactor + jitter)));
      soldAvg6mEur = roundEur(avgPriceEur * 0.96);
      minPriceEur = roundEur(Math.max(1.0, avgPriceEur * cfg.spreadLowFactor));
      maxPriceEur = roundEur(avgPriceEur * cfg.spreadHighFactor);
      activeListingsCount = Math.max(
        1,
        Math.round(cfg.baseListingMultiplier * rarityMultiplier * (condition === 'new' ? 0.65 : 1.15))
      );
    }

    return {
      portal: cfg.portal,
      portalName: cfg.portalName,
      regionLabel: cfg.regionLabel,
      condition,
      minPriceEur,
      avgPriceEur,
      maxPriceEur,
      soldAvg6mEur,
      activeListingsCount,
      shippingEstimateEur: cfg.shippingEstimateEur,
      deepLinkUrl: cfg.buildDeepLink(minifig.figId, minifig.name),
      lastUpdatedIso: nowIso,
      isOfficialApi: cfg.isOfficialApi,
      reliabilityWeight: cfg.reliabilityWeight,
      dataSource
    };
  });

  const estimatedMarketValueEur = resolvePreferredPriceFromQuotes(quotes, preferredSource);

  const sortedByMinTotal = [...quotes].sort(
    (a, b) => a.minPriceEur + a.shippingEstimateEur - (b.minPriceEur + b.shippingEstimateEur)
  );
  const sortedByMaxAvg = [...quotes].sort((a, b) => b.avgPriceEur - a.avgPriceEur);

  const low = Math.min(...quotes.map((q) => q.minPriceEur));
  const high = Math.max(...quotes.map((q) => q.maxPriceEur));

  const trendSeed = deterministicOffset(minifig.figId, 'trend30d');
  const trendPercentage30d = roundEur(
    (minifig.rarity === 'grail' ? 6.8 : minifig.rarity === 'rare' ? 4.2 : 1.5) + trendSeed * 40
  );

  return {
    figId: minifig.figId,
    condition,
    estimatedMarketValueEur,
    bestDealPortal: sortedByMinTotal[0].portal,
    bestSalePortal: sortedByMaxAvg[0].portal,
    priceRangeEur: { low, high },
    quotes,
    trendPercentage30d,
    calculatedAtIso: nowIso,
    livePortalsCount,
    observedPortalsCount
  };
}

export function getQuickDualPricesEur(
  figIdOrMeta: string | MinifigureMetadata,
  preferredSource: PreferredPriceSource = 'weighted',
  overrides?: PriceReportOverrides
): { usedEur: number; newEur: number; incompleteEur: number } {
  const minifig =
    typeof figIdOrMeta === 'string'
      ? findMinifigById(figIdOrMeta) ?? createCustomMinifigMetadata({ figId: figIdOrMeta })
      : figIdOrMeta;
  return {
    usedEur: generatePriceComparisonReport(minifig, 'used_complete', preferredSource, overrides)
      .estimatedMarketValueEur,
    newEur: generatePriceComparisonReport(minifig, 'new', preferredSource)
      .estimatedMarketValueEur,
    incompleteEur: generatePriceComparisonReport(minifig, 'used_incomplete', preferredSource)
      .estimatedMarketValueEur
  };
}

/**
 * Calcula el descuento automático por piezas faltantes en el despiece interactivo.
 * Normaliza los pesos de las piezas si su suma supera el valor completo de la figura.
 */
export function computeMissingPartsAdjustment(
  baseCompleteValueEur: number,
  parts: MinifigPartBreakdown[],
  missingPartNums: string[] = []
): MissingPartsValuationSummary {
  const safeBase = Math.max(0.5, roundEur(baseCompleteValueEur));
  const totalParts = parts.length;
  if (totalParts === 0 || missingPartNums.length === 0) {
    return {
      totalParts,
      missingCount: 0,
      ownedCount: totalParts,
      completionPct: 100,
      missingCostEur: 0,
      baseCompleteValueEur: safeBase,
      adjustedValueEur: safeBase
    };
  }

  const missingSet = new Set(missingPartNums.map((p) => p.toLowerCase()));
  const totalPartsSum = parts.reduce((sum, p) => sum + Math.max(0.25, p.avgPriceEur || 0.5), 0);
  const scaleFactor = totalPartsSum > safeBase * 0.92 ? (safeBase * 0.9) / totalPartsSum : 1;

  let missingCount = 0;
  let rawMissingCost = 0;

  for (const part of parts) {
    if (missingSet.has(part.partNum.toLowerCase())) {
      missingCount += 1;
      rawMissingCost += Math.max(0.25, part.avgPriceEur || 0.5) * scaleFactor;
    }
  }

  const missingCostEur = roundEur(Math.min(safeBase - 0.5, rawMissingCost));
  const adjustedValueEur = roundEur(Math.max(0.5, safeBase - missingCostEur));
  const ownedCount = Math.max(0, totalParts - missingCount);
  const completionPct = Math.round((ownedCount / totalParts) * 100);

  return {
    totalParts,
    missingCount,
    ownedCount,
    completionPct,
    missingCostEur,
    baseCompleteValueEur: safeBase,
    adjustedValueEur
  };
}

/**
 * Genera enlaces directos para comprar una pieza concreta faltante en BrickLink y BrickOwl.
 */
export function getPartMarketplaceLinks(
  part: MinifigPartBreakdown,
  figId?: string
): { bricklinkUrl: string; brickowlUrl: string } {
  const isSyntheticTemplate =
    /-(hg|hd|tr|lg|h|t|l)$/i.test(part.partNum) || part.partNum.includes(' ');

  if (isSyntheticTemplate && figId) {
    const query = `LEGO ${figId} ${part.name}`;
    return {
      bricklinkUrl: `https://www.bricklink.com/catalogItemInv.asp?M=${encodeURIComponent(figId)}`,
      brickowlUrl: `https://www.brickowl.com/search/catalog?query=${encodeURIComponent(query)}`
    };
  }

  return {
    bricklinkUrl: `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(part.partNum)}#T=S`,
    brickowlUrl: `https://www.brickowl.com/search/catalog?query=${encodeURIComponent(`LEGO ${part.partNum}`)}`
  };
}

/**
 * Evaluador de Lotes para Wallapop / Vinted / Mercadillos.
 */
export function evaluateLotDeal(params: {
  totalMarketValueEur: number;
  askingPriceEur: number;
  shippingEur?: number;
  targetMarginPct?: number;
}): LotDealEvaluation {
  const market = Math.max(0, roundEur(params.totalMarketValueEur));
  const asking = Math.max(0, roundEur(params.askingPriceEur));
  const shipping = Math.max(0, roundEur(params.shippingEur ?? 0));
  const totalCostEur = roundEur(asking + shipping);
  const targetMarginPct = Math.max(5, Math.min(75, params.targetMarginPct ?? 35));

  const maxRecommendedBidEur = roundEur(market * (1 - targetMarginPct / 100));
  // Estimación de costes de venta + envío/comisión media si se revende (~10%)
  const estimatedResaleFeesEur = roundEur(market * 0.1);
  const estimatedNetProfitEur = roundEur(market - estimatedResaleFeesEur - totalCostEur);
  const discountVsMarketPct =
    market > 0 ? Math.round(((market - totalCostEur) / market) * 1000) / 10 : 0;
  const roiPct =
    totalCostEur > 0 ? Math.round((estimatedNetProfitEur / totalCostEur) * 1000) / 10 : 0;

  let verdict: LotDealVerdict = 'justo';
  let verdictLabel = 'Precio justo';
  let verdictSummary = 'En línea con el mercado. Negocia un poco si buscas margen.';

  if (market <= 0 || totalCostEur <= 0) {
    verdict = 'justo';
    verdictLabel = 'Introduce precio';
    verdictSummary = 'Indica cuánto pide el vendedor para calcular el margen.';
  } else if (totalCostEur <= market * 0.55) {
    verdict = 'ganga';
    verdictLabel = 'Ganga clara';
    verdictSummary = `Pagas un ${Math.round(discountVsMarketPct)}% por debajo de mercado. Excelente oportunidad.`;
  } else if (totalCostEur <= maxRecommendedBidEur) {
    verdict = 'buen_precio';
    verdictLabel = 'Buen precio';
    verdictSummary = `Por debajo de tu tope recomendado (${maxRecommendedBidEur.toFixed(2)} €).`;
  } else if (totalCostEur <= market * 0.92) {
    verdict = 'justo';
    verdictLabel = 'Precio justo';
    verdictSummary = `Correcto para colección propia; intenta bajar a ${maxRecommendedBidEur.toFixed(2)} €.`;
  } else {
    verdict = 'caro';
    verdictLabel = 'Caro / Sin margen';
    verdictSummary = `Supera el valor estimado o deja margen nulo. Puja máx.: ${maxRecommendedBidEur.toFixed(2)} €.`;
  }

  return {
    totalMarketValueEur: market,
    askingPriceEur: asking,
    shippingEur: shipping,
    totalCostEur,
    targetMarginPct,
    maxRecommendedBidEur,
    estimatedResaleFeesEur,
    estimatedNetProfitEur,
    discountVsMarketPct,
    roiPct,
    verdict,
    verdictLabel,
    verdictSummary
  };
}

/**
 * Reparte automáticamente el coste pagado por un lote entre todas las figuras
 * de forma proporcional a su peso en el valor de mercado total.
 */
export function allocateLotPurchasePrices(
  lines: Array<{
    quantity: number;
    estimatedUnitValueEur: number;
  }>,
  totalPaidEur: number
): number[] {
  const safeTotal = Math.max(0, totalPaidEur);
  if (lines.length === 0) return [];
  const totalMarket = lines.reduce(
    (sum, line) => sum + Math.max(0.01, line.quantity * line.estimatedUnitValueEur),
    0
  );

  if (totalMarket <= 0) {
    const totalUnits = lines.reduce((sum, l) => sum + Math.max(1, l.quantity), 0);
    const flat = roundEur(safeTotal / Math.max(1, totalUnits));
    return lines.map(() => flat);
  }

  return lines.map((line) => {
    const lineMarket = Math.max(0.01, line.quantity * line.estimatedUnitValueEur);
    const share = lineMarket / totalMarket;
    const allocatedLineCost = safeTotal * share;
    return roundEur(allocatedLineCost / Math.max(1, line.quantity));
  });
}

export function evaluateBulkTextList(
  rawText: string,
  preferredSource: PreferredPriceSource = 'weighted'
): {
  items: BulkImportParsedLine[];
  unknownTokens: string[];
  totalEstimatedEur: number;
} {
  const chunks = rawText
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items: BulkImportParsedLine[] = [];
  const unknownTokens: string[] = [];

  for (const chunk of chunks) {
    const tokens = chunk.split(/\s+/).filter(Boolean);
    let matchedFig: MinifigureMetadata | undefined;

    for (const tok of tokens) {
      const cleaned = tok.replace(/[^a-zA-Z0-9-]/g, '');
      const exact = findMinifigById(cleaned);
      if (exact) {
        matchedFig = exact;
        break;
      }
    }

    if (!matchedFig) {
      const cleanChunk = chunk
        .replace(/\b(\d+x|x\d+|new|nueva|used|usada)\b/gi, '')
        .trim()
        .toLowerCase();
      if (cleanChunk.length >= 3) {
        matchedFig = ALL_MINIFIG_CATALOG.find((m) => m.name.toLowerCase().includes(cleanChunk));
      }
    }

    if (!matchedFig) {
      unknownTokens.push(chunk);
      continue;
    }

    let quantity = 1;
    const qtyMatch = chunk.match(/(?:^|\s)(?:x\s*(\d+)|(\d+)\s*x)(?=\s|$)/i);
    if (qtyMatch) {
      quantity = Math.max(1, Number(qtyMatch[1] || qtyMatch[2]) || 1);
    }

    let condition: MinifigCondition = 'used_complete';
    if (/\b(new|nueva|sellada|sealed|\bN\b)\b/i.test(chunk)) {
      condition = 'new';
    } else if (/\b(inc|incompleta|incomplete)\b/i.test(chunk)) {
      condition = 'used_incomplete';
    }

    const report = generatePriceComparisonReport(matchedFig, condition, preferredSource);

    let purchasePriceEur = roundEur(report.estimatedMarketValueEur * 0.78);
    const explicitPriceMatch = chunk.match(
      /(?:@|€)\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*€/
    );
    if (explicitPriceMatch) {
      const parsed = Number((explicitPriceMatch[1] || explicitPriceMatch[2]).replace(',', '.'));
      if (Number.isFinite(parsed) && parsed >= 0) {
        purchasePriceEur = roundEur(parsed);
      }
    } else {
      const chunkWithoutQty = qtyMatch ? chunk.replace(qtyMatch[0], ' ') : chunk;
      const figLower = matchedFig.figId.toLowerCase();
      const trailingNum = chunkWithoutQty
        .split(/\s+/)
        .filter(Boolean)
        .find((tok) => {
          if (tok.toLowerCase().includes(figLower)) return false;
          return /^\d{1,4}(?:[.,]\d{1,2})?$/.test(tok);
        });
      if (trailingNum) {
        const parsed = Number(trailingNum.replace(',', '.'));
        if (Number.isFinite(parsed) && parsed >= 0 && parsed < 5000) {
          purchasePriceEur = roundEur(parsed);
        }
      }
    }

    items.push({
      figId: matchedFig.figId,
      minifig: matchedFig,
      condition,
      quantity,
      purchasePriceEur,
      estimatedUnitValueEur: report.estimatedMarketValueEur,
      notes: 'Importado desde lista rápida'
    });
  }

  const totalEstimatedEur = roundEur(
    items.reduce((sum, line) => sum + line.quantity * line.estimatedUnitValueEur, 0)
  );

  return { items, unknownTokens, totalEstimatedEur };
}
