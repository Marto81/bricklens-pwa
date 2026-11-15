import type {
  BulkImportParsedLine,
  MarketplaceId,
  MarketplaceQuote,
  MinifigCondition,
  MinifigureMetadata,
  PreferredPriceSource,
  PriceComparisonReport
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
  ebay: 'eBay España / UE (Vendidos)',
  c2c_eu: 'Wallapop / Vinted (C2C Europa)'
};

export const PORTAL_CONFIGS: PortalMultiplierConfig[] = [
  {
    portal: 'bricklink',
    portalName: 'BrickLink',
    regionLabel: 'Global / UE (Catálogo Oficial)',
    isOfficialApi: true,
    reliabilityWeight: 0.50,
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
    regionLabel: 'Europa (Tiendas Especializadas)',
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
    regionLabel: 'Subastas + Comprar Ahora (Vendidos)',
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
    regionLabel: 'España / Italia / Portugal (C2C)',
    isOfficialApi: false,
    reliabilityWeight: 0.05,
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
    regionLabel: 'Europa C2C (Envío Económico)',
    isOfficialApi: false,
    reliabilityWeight: 0.05,
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

/**
 * Genera una semilla determinista a partir del código de la minifigura para simular
 * variaciones realistas de mercado consistentes entre sesiones.
 */
function deterministicOffset(figId: string, portal: string): number {
  let hash = 0;
  const key = `${figId}:${portal}`;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const normalized = (Math.abs(hash) % 100) / 1000; // 0.000 .. 0.099
  return normalized - 0.045; // -4.5% .. +5.4%
}

export function computeWeightedMarketValue(quotes: MarketplaceQuote[]): number {
  if (quotes.length === 0) return 0;
  let weightedSum = 0;
  let totalWeight = 0;

  for (const q of quotes) {
    const referencePrice = q.isOfficialApi ? q.soldAvg6mEur : q.avgPriceEur;
    weightedSum += referencePrice * q.reliabilityWeight;
    totalWeight += q.reliabilityWeight;
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

export function generatePriceComparisonReport(
  figIdOrMeta: string | MinifigureMetadata,
  condition: MinifigCondition,
  preferredSource: PreferredPriceSource = 'weighted'
): PriceComparisonReport {
  const minifig: MinifigureMetadata =
    typeof figIdOrMeta === 'string'
      ? findMinifigById(figIdOrMeta) ?? createCustomMinifigMetadata({ figId: figIdOrMeta })
      : figIdOrMeta;

  const basePrice = minifig.baseMarketPriceEur[condition];
  const nowIso = new Date().toISOString();

  const rarityMultiplier =
    minifig.rarity === 'grail'
      ? 0.25
      : minifig.rarity === 'rare'
      ? 0.65
      : minifig.rarity === 'uncommon'
      ? 1.1
      : 2.2;

  const quotes: MarketplaceQuote[] = PORTAL_CONFIGS.map((cfg) => {
    const jitter = deterministicOffset(minifig.figId, cfg.portal);
    const avgPriceEur = roundEur(Math.max(1.5, basePrice * (cfg.priceFactor + jitter)));
    const soldAvg6mEur = roundEur(avgPriceEur * 0.96);
    const minPriceEur = roundEur(Math.max(1.0, avgPriceEur * cfg.spreadLowFactor));
    const maxPriceEur = roundEur(avgPriceEur * cfg.spreadHighFactor);

    const activeListingsCount = Math.max(
      1,
      Math.round(cfg.baseListingMultiplier * rarityMultiplier * (condition === 'new' ? 0.65 : 1.15))
    );

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
      reliabilityWeight: cfg.reliabilityWeight
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
    calculatedAtIso: nowIso
  };
}

/**
 * Devuelve precios paralelos instantáneos (Usada vs. Nueva) estilo brick'em
 * respetando la fuente de precio preferida.
 */
export function getQuickDualPricesEur(
  figIdOrMeta: string | MinifigureMetadata,
  preferredSource: PreferredPriceSource = 'weighted'
): { usedEur: number; newEur: number; incompleteEur: number } {
  const minifig =
    typeof figIdOrMeta === 'string'
      ? findMinifigById(figIdOrMeta) ?? createCustomMinifigMetadata({ figId: figIdOrMeta })
      : figIdOrMeta;
  return {
    usedEur: generatePriceComparisonReport(minifig, 'used_complete', preferredSource)
      .estimatedMarketValueEur,
    newEur: generatePriceComparisonReport(minifig, 'new', preferredSource)
      .estimatedMarketValueEur,
    incompleteEur: generatePriceComparisonReport(minifig, 'used_incomplete', preferredSource)
      .estimatedMarketValueEur
  };
}

/**
 * Analiza una lista rápida pegada por el usuario (ej. "sw0002, sw0585 x3, sh0232 new 52")
 * y devuelve las líneas tasadas listas para importar.
 */
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
      // Fallback: búsqueda parcial por nombre si es un texto descriptivo suficientemente largo
      const cleanChunk = chunk.replace(/\b(\d+x|x\d+|new|nueva|used|usada)\b/gi, '').trim().toLowerCase();
      if (cleanChunk.length >= 3) {
        matchedFig = ALL_MINIFIG_CATALOG.find((m) =>
          m.name.toLowerCase().includes(cleanChunk)
        );
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

    // Precio pagado opcional explícito (ej: "@12.50", "€12.50", "12.50€" o número suelto "sh0232 new 52")
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
