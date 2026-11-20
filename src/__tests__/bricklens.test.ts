import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  allocateLotPurchasePrices,
  computeMissingPartsAdjustment,
  evaluateBulkTextList,
  evaluateLotDeal,
  generatePriceComparisonReport,
  getQuickDualPricesEur
} from '../services/priceAggregator';
import {
  buildCandidatesForPreset,
  identifyBulkLotFromImage,
  identifyMinifigureFromImage,
  identifyPartFromImage
} from '../services/visionService';
import { findMinifigsByScannedParts } from '../services/catalogService';
import { lookupCmfCode } from '../data/cmfCodes';
import {
  bulkUpsertCollectionItems,
  calculateCollectionStats,
  createCollection,
  db,
  deleteCollection,
  deleteObservedPrice,
  DEMO_COLLECTION_ID,
  ensureDemoCollectionSeeded,
  exportCollectionToBrickLinkXml,
  exportCollectionToBsx,
  exportCollectionToCsv,
  exportFullBackupJson,
  getAppSettings,
  getObservedPricesForFig,
  getPortfolioHistorySeries,
  importCollectionFromText,
  importFullBackupJson,
  initializeCollections,
  renameCollection,
  restoreDemoCollection,
  saveAppSettings,
  saveObservedPrice,
  updateItemMissingParts,
  upsertCollectionMinifig
} from '../db/collectionDb';
import {
  createCustomMinifigMetadata,
  DEMO_BULK_LOT_SLOTS,
  MINIFIG_CATALOG
} from '../data/catalogPresets';

describe('BrickLens Multi-Portal Price Aggregator', () => {
  it('generates normalized quotes for BrickLink, BrickOwl, eBay, Wallapop, and Vinted', () => {
    const report = generatePriceComparisonReport('sw0002', 'used_complete');
    expect(report.figId).toBe('sw0002');
    expect(report.quotes).toHaveLength(5);

    const portals = report.quotes.map((q) => q.portal);
    expect(portals).toEqual(['bricklink', 'brickowl', 'ebay', 'wallapop', 'vinted']);

    for (const quote of report.quotes) {
      expect(quote.minPriceEur).toBeGreaterThan(0);
      expect(quote.avgPriceEur).toBeGreaterThanOrEqual(quote.minPriceEur);
      expect(quote.maxPriceEur).toBeGreaterThanOrEqual(quote.avgPriceEur);
      expect(quote.deepLinkUrl).toContain('sw0002');
    }
  });

  it('quotes unknown custom BrickLink IDs cleanly without defaulting to Boba Fett sw0002', () => {
    const report = generatePriceComparisonReport('sw0999', 'used_complete');
    expect(report.figId).toBe('sw0999');
    expect(report.quotes).toHaveLength(5);
    expect(report.quotes[0].deepLinkUrl).toContain('sw0999');
    expect(report.quotes[0].deepLinkUrl).not.toContain('sw0002');
  });

  it('prices New higher than Used Complete, and Used Complete higher than Incomplete', () => {
    const dual = getQuickDualPricesEur('sh0232', 'weighted');
    expect(dual.newEur).toBeGreaterThan(dual.usedEur);
    expect(dual.usedEur).toBeGreaterThan(dual.incompleteEur);
  });

  it('respects preferredPriceSource selector (bricklink_sold vs eBay vs C2C EU)', () => {
    const repWeighted = generatePriceComparisonReport('sh0232', 'used_complete', 'weighted');
    const repEbay = generatePriceComparisonReport('sh0232', 'used_complete', 'ebay');
    const repC2c = generatePriceComparisonReport('sh0232', 'used_complete', 'c2c_eu');

    expect(repEbay.estimatedMarketValueEur).toBeGreaterThan(repWeighted.estimatedMarketValueEur);
    expect(repC2c.estimatedMarketValueEur).toBeLessThan(repWeighted.estimatedMarketValueEur);
  });

  it('parses bulk text lists with quantities, conditions, and explicit paid prices', () => {
    const parsed = evaluateBulkTextList('sw0002, sw0585 x3, sh0232 new 52, col448 @7.50');
    expect(parsed.unknownTokens).toHaveLength(0);
    expect(parsed.items).toHaveLength(4);
    expect(parsed.items[1].quantity).toBe(3);
    expect(parsed.items[2].condition).toBe('new');
    expect(parsed.items[2].purchasePriceEur).toBe(52);
    expect(parsed.items[3].purchasePriceEur).toBe(7.5);
    expect(parsed.totalEstimatedEur).toBeGreaterThan(100);
  });
});

describe('BrickLens Vision & Bulk + CMF Recognition Pipeline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns Top-12 candidates by default and respects custom limits with primary match first', () => {
    const candidates12 = buildCandidatesForPreset('sw0585');
    expect(candidates12).toHaveLength(12);
    expect(candidates12[0].minifig.figId).toBe('sw0585');
    expect(candidates12[0].confidence).toBeGreaterThan(0.85);
    expect(candidates12[0].confidence).toBeGreaterThan(candidates12[1].confidence);

    const candidates3 = buildCandidatesForPreset('sw0585', 3);
    expect(candidates3).toHaveLength(3);
  });

  it('does NOT fake sw0002 when real Brickognize scan fails or returns empty matches', async () => {
    const sampleBlob = new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' });

    // Caso 1: fallo de red / endpoints
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network down'));
    const errorResult = await identifyMinifigureFromImage({
      blob: sampleBlob,
      previewDataUrl: 'data:image/jpeg;base64,test'
    });
    expect(errorResult.apiSource).toBe('error');
    expect(errorResult.candidates).toHaveLength(0);
    expect(errorResult.errorMessage).toBeTruthy();

    // Caso 2: Brickognize devuelve bounding_box pero items: []
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          bounding_box: { left: 10, upper: 10, right: 200, lower: 300, score: 0.72 },
          items: []
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const noMatchResult = await identifyMinifigureFromImage({
      blob: sampleBlob,
      previewDataUrl: 'data:image/jpeg;base64,test'
    });
    expect(noMatchResult.apiSource).toBe('no_match');
    expect(noMatchResult.candidates).toHaveLength(0);
    expect(noMatchResult.detectedBoxScore).toBe(0.72);
  });

  it('parses live Brickognize JSON results including external catalog IDs', async () => {
    const sampleBlob = new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          bounding_box: { left: 10, upper: 10, right: 200, lower: 300, score: 0.96 },
          items: [
            {
              id: 'hp0128',
              name: 'Harry Potter - Dark Blue Open Jacket',
              category: 'Harry Potter',
              img_url: 'https://storage.googleapis.com/brickognize-static/hp0128.jpg',
              score: 0.89
            }
          ]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const liveResult = await identifyMinifigureFromImage({
      blob: sampleBlob,
      previewDataUrl: 'data:image/jpeg;base64,test'
    });
    expect(liveResult.apiSource).toBe('brickognize_live');
    expect(liveResult.candidates).toHaveLength(1);
    expect(liveResult.candidates[0].minifig.figId).toBe('hp0128');
    expect(liveResult.candidates[0].minifig.theme).toBe('Harry Potter');
    expect(liveResult.candidates[0].confidence).toBeCloseTo(0.89, 2);
  });

  it('creates a 6-item bulk lot scan session aligned with numbered slots and 12 alternates each', async () => {
    const session = await identifyBulkLotFromImage({ isDemoLot: true });
    expect(session.items).toHaveLength(DEMO_BULK_LOT_SLOTS.length);
    expect(session.aspectRatio).toBe(1.5);
    session.items.forEach((item, idx) => {
      expect(item.slotIndex).toBe(idx + 1);
      expect(item.selectedMinifig.figId).toBe(DEMO_BULK_LOT_SLOTS[idx].figId);
      expect(item.candidates.length).toBeGreaterThanOrEqual(10);
    });
  });

  it('decodes EU (S) and NA (R) CMF Data Matrix codes cleanly and rejects unknown IDs', () => {
    const wolfpackEu = lookupCmfCode('6522981 114S4 13914011 004122');
    expect(wolfpackEu.matched).toBe(true);
    expect(wolfpackEu.factoryCode).toBe('S');
    expect(wolfpackEu.entry?.seriesCode).toBe('71048');
    expect(wolfpackEu.minifig?.figId).toBe('col2701');

    const paladinNa = lookupCmfCode('6506755 146R4 13896418 011398');
    expect(paladinNa.matched).toBe(true);
    expect(paladinNa.factoryCode).toBe('R');
    expect(paladinNa.entry?.seriesCode).toBe('71047');
    expect(paladinNa.minifig?.figId).toBe('dnd005');

    const spaceIce = lookupCmfCode('6484686');
    expect(spaceIce.matched).toBe(true);
    expect(spaceIce.minifig?.figId).toBe('col2608');

    const spider = lookupCmfCode('6568960 318S5');
    expect(spider.matched).toBe(true);
    expect(spider.minifig).toBeDefined();

    const missing = lookupCmfCode('9999999 100S4');
    expect(missing.matched).toBe(false);
    expect(missing.scannedElementId).toBe('9999999');
  });
});

describe('BrickLens Multi-Collection Management, Valuation & Universal Import/Export', () => {
  beforeEach(async () => {
    await db.collections.clear();
    await db.collectionItems.clear();
    await db.appMeta.clear();
  });

  it('seeds Colección de prueba only once and keeps it deleted across reloads', async () => {
    const firstBoot = await initializeCollections();
    expect(firstBoot.collections).toHaveLength(1);
    expect(firstBoot.collections[0].id).toBe(DEMO_COLLECTION_ID);
    expect(firstBoot.collections[0].name).toBe('Colección de prueba');
    expect(firstBoot.collections[0].isDemo).toBe(true);
    expect(firstBoot.allItems.length).toBeGreaterThanOrEqual(4);

    // Usuario borra la colección de prueba
    const nextActive = await deleteCollection(DEMO_COLLECTION_ID);
    expect(nextActive).toBeNull();

    // Recarga posterior: NO debe volver a crearla automáticamente
    const secondBoot = await initializeCollections();
    expect(secondBoot.collections).toHaveLength(0);
    expect(secondBoot.activeCollectionId).toBeNull();
    expect(secondBoot.allItems).toHaveLength(0);

    // Restauración explícita funciona cuando se invoca manualmente
    const restored = await restoreDemoCollection();
    expect(restored.collection.id).toBe(DEMO_COLLECTION_ID);
    expect(restored.items.length).toBeGreaterThanOrEqual(4);
  });

  it('creates, renames, isolates items between collections, and deletes cleanly', async () => {
    const colA = await createCollection('Star Wars Vitrina');
    const colB = await createCollection('CMF Serie 27');

    await upsertCollectionMinifig({
      collectionId: colA.id,
      minifig: MINIFIG_CATALOG[1], // sw0585
      condition: 'used_complete',
      quantity: 2,
      purchasePriceEur: 6.0,
      estimatedUnitValueEur: 8.5
    });

    await upsertCollectionMinifig({
      collectionId: colB.id,
      minifig: MINIFIG_CATALOG[2], // sh0232
      condition: 'new',
      quantity: 1,
      purchasePriceEur: 45.0,
      estimatedUnitValueEur: 75.0
    });

    await renameCollection(colA.id, 'Imperio Galáctico');
    const renamed = await db.collections.get(colA.id);
    expect(renamed?.name).toBe('Imperio Galáctico');

    const itemsA = await db.collectionItems.where('collectionId').equals(colA.id).toArray();
    const itemsB = await db.collectionItems.where('collectionId').equals(colB.id).toArray();
    expect(itemsA).toHaveLength(1);
    expect(itemsA[0].minifig.figId).toBe('sw0585');
    expect(itemsB).toHaveLength(1);
    expect(itemsB[0].minifig.figId).toBe('sh0232');

    // Al borrar A, solo queda B
    const remainingActive = await deleteCollection(colA.id);
    expect(remainingActive).toBe(colB.id);
    const itemsAfterDelete = await db.collectionItems.toArray();
    expect(itemsAfterDelete).toHaveLength(1);
    expect(itemsAfterDelete[0].collectionId).toBe(colB.id);
  });

  it('seeds initial demo collection and calculates total portfolio value & ROI accurately', async () => {
    const seeded = await ensureDemoCollectionSeeded();
    expect(seeded.length).toBeGreaterThanOrEqual(4);

    const stats = calculateCollectionStats(seeded);
    expect(stats.totalUniqueFigs).toBe(seeded.length);
    expect(stats.totalUnits).toBe(6);
    expect(stats.totalMarketValueEur).toBeGreaterThan(stats.totalInvestedEur);
    expect(stats.netProfitEur).toBeGreaterThan(0);
    expect(stats.roiPercentage).toBeGreaterThan(0);
    expect(stats.topGrailItem?.minifig.figId).toBe('sh0232');
    expect(stats.byTheme.length).toBeGreaterThanOrEqual(3);

    const series1Y = getPortfolioHistorySeries(seeded, '1Y');
    expect(series1Y).toHaveLength(7);
    expect(series1Y[series1Y.length - 1].valueEur).toBe(stats.totalMarketValueEur);
    expect(series1Y[0].valueEur).toBeLessThan(stats.totalMarketValueEur);
  });

  it('increments quantity and recalculates weighted purchase price on upsert', async () => {
    const stormtrooper = MINIFIG_CATALOG[1]; // sw0585
    await upsertCollectionMinifig({
      minifig: stormtrooper,
      condition: 'used_complete',
      quantity: 2,
      purchasePriceEur: 5.0,
      estimatedUnitValueEur: 8.0
    });

    const updated = await upsertCollectionMinifig({
      minifig: stormtrooper,
      condition: 'used_complete',
      quantity: 2,
      purchasePriceEur: 7.0,
      estimatedUnitValueEur: 8.0
    });

    expect(updated.quantity).toBe(4);
    expect(updated.purchasePriceEur).toBe(6.0);
  });

  it('exports valid CSV, BrickLink XML, and BrickStore .BSX and round-trips imports including external IDs', async () => {
    const seeded = await ensureDemoCollectionSeeded();
    const csv = exportCollectionToCsv(seeded);
    expect(csv).toContain('Codigo_BrickLink,Nombre,Tematica');
    expect(csv).toContain('sw0585');

    const xml = exportCollectionToBrickLinkXml(seeded);
    expect(xml).toContain('<INVENTORY>');
    expect(xml).toContain('<ITEMTYPE>M</ITEMTYPE>');
    expect(xml).toContain('<ITEMID>sh0232</ITEMID>');

    const bsx = exportCollectionToBsx(seeded);
    expect(bsx).toContain('<BrickStoreXML>');
    expect(bsx).toContain('<ItemTypeID>M</ItemTypeID>');

    const importedCsv = importCollectionFromText(csv, 'auto');
    expect(importedCsv.detectedFormat).toBe('csv');
    expect(importedCsv.items.length).toBe(seeded.length);

    const importedXml = importCollectionFromText(xml, 'auto');
    expect(importedXml.detectedFormat).toBe('xml');
    expect(importedXml.items.length).toBe(seeded.length);

    const customBsx = `<?xml version="1.0" encoding="UTF-8"?>
<BrickStoreXML>
  <Inventory>
    <Item>
      <ItemID>sw9999</ItemID>
      <ItemTypeID>M</ItemTypeID>
      <ItemName>Custom Clone Commander</ItemName>
      <CategoryName>Star Wars</CategoryName>
      <Qty>2</Qty>
      <Price>18.50</Price>
      <OrigPrice>12.00</OrigPrice>
      <Condition>N</Condition>
    </Item>
  </Inventory>
</BrickStoreXML>`;

    const importedBsx = importCollectionFromText(customBsx, 'auto');
    expect(importedBsx.detectedFormat).toBe('bsx');
    expect(importedBsx.items).toHaveLength(1);
    expect(importedBsx.items[0].figId).toBe('sw9999');
    expect(importedBsx.items[0].estimatedUnitValueEur).toBe(18.5);
    expect(importedBsx.items[0].purchasePriceEur).toBe(12.0);
    expect(importedBsx.items[0].condition).toBe('new');

    await db.collectionItems.clear();
    const persisted = await bulkUpsertCollectionItems(importedBsx.items);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].quantity).toBe(2);
  });
});

describe('BrickLens v2.0 — Missing Parts, Observed Prices, Lot Evaluator, Part Cross-Lookup & JSON Backup', () => {
  beforeEach(async () => {
    await db.collections.clear();
    await db.collectionItems.clear();
    await db.observedPrices.clear();
    await db.catalogCache.clear();
    await db.appMeta.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('computes proportional missing-parts deduction, normalizes oversized part sums, and restores 100%', () => {
    const silverCenturion = MINIFIG_CATALOG.find((m) => m.figId === 'sh0232')!;
    // Suma de piezas (19.5 + 28 + 22 + 18 = 87.5) supera 54€ * 0.92 => aplica normalización proporcional
    const oneMissing = computeMissingPartsAdjustment(54.0, silverCenturion.parts, ['24093pb01']);
    expect(oneMissing.totalParts).toBe(4);
    expect(oneMissing.missingCount).toBe(1);
    expect(oneMissing.ownedCount).toBe(3);
    expect(oneMissing.completionPct).toBe(75);
    expect(oneMissing.missingCostEur).toBeGreaterThan(0);
    expect(oneMissing.adjustedValueEur).toBeCloseTo(54.0 - oneMissing.missingCostEur, 2);
    expect(oneMissing.adjustedValueEur).toBeGreaterThan(0.5);

    const allMissing = computeMissingPartsAdjustment(
      54.0,
      silverCenturion.parts,
      silverCenturion.parts.map((p) => p.partNum)
    );
    expect(allMissing.completionPct).toBe(0);
    expect(allMissing.adjustedValueEur).toBeGreaterThanOrEqual(0.5);
    expect(allMissing.adjustedValueEur).toBeLessThan(oneMissing.adjustedValueEur);

    const fullRestore = computeMissingPartsAdjustment(54.0, silverCenturion.parts, []);
    expect(fullRestore.missingCount).toBe(0);
    expect(fullRestore.completionPct).toBe(100);
    expect(fullRestore.missingCostEur).toBe(0);
    expect(fullRestore.adjustedValueEur).toBe(54.0);
  });

  it('persists missing parts in Dexie v3, auto-switches to used_incomplete, and reverts when completed', async () => {
    const col = await createCollection('Mi Vitrina');
    const stormtrooper = MINIFIG_CATALOG.find((m) => m.figId === 'sw0585')!;

    const created = await upsertCollectionMinifig({
      collectionId: col.id,
      minifig: stormtrooper,
      condition: 'used_complete',
      quantity: 1,
      purchasePriceEur: 5.0,
      estimatedUnitValueEur: 8.5
    });

    // Marcar casco como faltante -> pasa a used_incomplete y descuenta
    const incomplete = await updateItemMissingParts(created.id, ['30408pb09']);
    expect(incomplete).not.toBeNull();
    expect(incomplete!.condition).toBe('used_incomplete');
    expect(incomplete!.missingPartNums).toEqual(['30408pb09']);
    expect(incomplete!.baseCompleteUnitValueEur).toBe(8.5);
    expect(incomplete!.estimatedUnitValueEur).toBeLessThan(8.5);

    // Desmarcar pieza -> vuelve a used_complete y recupera valor base completo (8.50€)
    const restored = await updateItemMissingParts(created.id, []);
    expect(restored).not.toBeNull();
    expect(restored!.condition).toBe('used_complete');
    expect(restored!.missingPartNums).toBeUndefined();
    expect(restored!.estimatedUnitValueEur).toBe(8.5);
  });

  it('saves/deletes observed portal prices and reflects user_observed & live_api badges in comparison reports', async () => {
    await saveObservedPrice({
      figId: 'SW0585',
      condition: 'used_complete',
      portal: 'wallapop',
      priceEur: 6.5
    });

    const observedMap = await getObservedPricesForFig('sw0585', 'used_complete');
    expect(observedMap.wallapop).toBe(6.5);

    const report = generatePriceComparisonReport('sw0585', 'used_complete', 'weighted', {
      observedPrices: observedMap,
      liveQuotes: {
        brickowl: {
          minPriceEur: 7.0,
          avgPriceEur: 8.4,
          maxPriceEur: 10.5,
          soldAvg6mEur: 8.1,
          activeListingsCount: 14
        }
      }
    });

    expect(report.observedPortalsCount).toBe(1);
    expect(report.livePortalsCount).toBe(1);

    const wallapopQuote = report.quotes.find((q) => q.portal === 'wallapop')!;
    const brickowlQuote = report.quotes.find((q) => q.portal === 'brickowl')!;
    const bricklinkQuote = report.quotes.find((q) => q.portal === 'bricklink')!;

    expect(wallapopQuote.dataSource).toBe('user_observed');
    expect(wallapopQuote.avgPriceEur).toBe(6.5);
    expect(brickowlQuote.dataSource).toBe('live_api');
    expect(brickowlQuote.avgPriceEur).toBe(8.4);
    expect(bricklinkQuote.dataSource).toBe('catalog_estimate');

    await deleteObservedPrice('sw0585', 'used_complete', 'wallapop');
    const afterDelete = await getObservedPricesForFig('sw0585', 'used_complete');
    expect(afterDelete.wallapop).toBeUndefined();
  });

  it('evaluates Wallapop/Mercadillo lot deals across all 4 verdicts and allocates proportional unit costs', () => {
    const ganga = evaluateLotDeal({
      totalMarketValueEur: 200,
      askingPriceEur: 90,
      shippingEur: 5,
      targetMarginPct: 35
    });
    expect(ganga.verdict).toBe('ganga');
    expect(ganga.totalCostEur).toBe(95);
    expect(ganga.maxRecommendedBidEur).toBe(130);
    expect(ganga.estimatedNetProfitEur).toBe(85); // 200 - 20 (10% fees) - 95

    const buenPrecio = evaluateLotDeal({
      totalMarketValueEur: 200,
      askingPriceEur: 120,
      shippingEur: 5,
      targetMarginPct: 35
    });
    expect(buenPrecio.verdict).toBe('buen_precio');

    const justo = evaluateLotDeal({
      totalMarketValueEur: 200,
      askingPriceEur: 165,
      shippingEur: 5,
      targetMarginPct: 35
    });
    expect(justo.verdict).toBe('justo');

    const caro = evaluateLotDeal({
      totalMarketValueEur: 200,
      askingPriceEur: 195,
      shippingEur: 5,
      targetMarginPct: 35
    });
    expect(caro.verdict).toBe('caro');
    expect(caro.estimatedNetProfitEur).toBeLessThan(0);

    // Reparto proporcional de 100€ entre 2 figuras de 10€ (x2) y 1 figura de 80€ (total mercado = 100€)
    const allocated = allocateLotPurchasePrices(
      [
        { quantity: 2, estimatedUnitValueEur: 10 },
        { quantity: 1, estimatedUnitValueEur: 80 }
      ],
      50
    );
    expect(allocated).toEqual([5, 40]);
    const totalAllocated = allocated[0] * 2 + allocated[1] * 1;
    expect(totalAllocated).toBeCloseTo(50, 2);
  });

  it('intersects multiple scanned loose parts to narrow down exact minifigure matches (2/2)', async () => {
    // Evita llamadas de red reales al proxy Rebrickable en test unitario
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ configured: false, minifigs: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    const { matches } = await findMinifigsByScannedParts([
      {
        partNum: '973pb1795c01',
        name: 'Torso Armadura Imperial 2014',
        category: 'torso'
      },
      {
        partNum: '30408pb09',
        name: 'Casco Stormtrooper Rejillas Dark Blue',
        category: 'headgear'
      }
    ]);

    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].minifig.figId).toBe('sw0585');
    expect(matches[0].matchedPartNums).toHaveLength(2);
    expect(matches[0].totalQueriedParts).toBe(2);
    expect(matches[0].matchScore).toBe(1);
  });

  it('exports and restores full JSON backup in replace and merge modes preserving missing parts, observed prices, and settings', async () => {
    const colA = await createCollection('Star Wars Personal');
    const sw = MINIFIG_CATALOG.find((m) => m.figId === 'sw0585')!;
    const item = await upsertCollectionMinifig({
      collectionId: colA.id,
      minifig: sw,
      condition: 'used_complete',
      quantity: 1,
      purchasePriceEur: 4.5,
      estimatedUnitValueEur: 8.0
    });
    await updateItemMissingParts(item.id, ['30408pb09']);
    await saveObservedPrice({
      figId: 'sw0585',
      condition: 'used_complete',
      portal: 'vinted',
      priceEur: 7.25
    });
    await saveAppSettings({
      proxyBaseUrl: 'https://proxy.example.com',
      defaultTargetMarginPct: 40,
      preferredPriceSource: 'bricklink_sold'
    });

    const jsonBackup = await exportFullBackupJson();
    expect(jsonBackup).toContain('"schemaVersion": 2');
    expect(jsonBackup).toContain('30408pb09');
    expect(jsonBackup).toContain('https://proxy.example.com');

    // Limpiamos todo y restauramos en modo replace
    await db.collections.clear();
    await db.collectionItems.clear();
    await db.observedPrices.clear();
    await db.appMeta.clear();

    const replaced = await importFullBackupJson(jsonBackup, 'replace');
    expect(replaced.collectionsCount).toBe(1);
    expect(replaced.itemsCount).toBe(1);
    expect(replaced.observedPricesCount).toBe(1);

    const restoredItems = await db.collectionItems.toArray();
    expect(restoredItems[0].missingPartNums).toEqual(['30408pb09']);
    expect(restoredItems[0].condition).toBe('used_incomplete');

    const restoredObserved = await getObservedPricesForFig('sw0585', 'used_complete');
    expect(restoredObserved.vinted).toBe(7.25);

    const restoredSettings = await getAppSettings();
    expect(restoredSettings.proxyBaseUrl).toBe('https://proxy.example.com');
    expect(restoredSettings.defaultTargetMarginPct).toBe(40);
    expect(restoredSettings.preferredPriceSource).toBe('bricklink_sold');

    // Creamos una segunda colección local y comprobamos que modo 'merge' NO la borra
    const colB = await createCollection('Mercadillo Local');
    const merged = await importFullBackupJson(jsonBackup, 'merge');
    expect(merged.collectionsCount).toBe(1);
    const allColsAfterMerge = await db.collections.toArray();
    expect(allColsAfterMerge.map((c) => c.id)).toContain(colA.id);
    expect(allColsAfterMerge.map((c) => c.id)).toContain(colB.id);
  });

  it('handles loose part identification honestly (demo preset, live response, and never faking on errors/no_match)', async () => {
    // 1) Demo preset explícito
    const demoRes = await identifyPartFromImage({
      previewDataUrl: '',
      presetPart: {
        partNum: '973pb1795c01',
        name: 'Torso Armadura Imperial 2014',
        category: 'torso'
      }
    });
    expect(demoRes.apiSource).toBe('demo_preset');
    expect(demoRes.candidates).toHaveLength(1);
    expect(demoRes.candidates[0].partNum).toBe('973pb1795c01');

    // 2) Fallo de red -> apiSource: 'error', sin piezas falsas
    const sampleBlob = new Blob(['fake-part-jpeg'], { type: 'image/jpeg' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'));
    const errRes = await identifyPartFromImage({
      blob: sampleBlob,
      previewDataUrl: 'data:image/jpeg;base64,part'
    });
    expect(errRes.apiSource).toBe('error');
    expect(errRes.candidates).toHaveLength(0);

    // 3) Sin coincidencias -> apiSource: 'no_match'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ bounding_box: { score: 0.45 }, items: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    const noMatchRes = await identifyPartFromImage({
      blob: sampleBlob,
      previewDataUrl: 'data:image/jpeg;base64,part'
    });
    expect(noMatchRes.apiSource).toBe('no_match');
    expect(noMatchRes.candidates).toHaveLength(0);

    // 4) Respuesta en vivo de Brickognize /predict/parts/
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          bounding_box: { score: 0.94 },
          items: [
            {
              id: '30408pb09',
              name: 'Minifigure Helmet Stormtrooper Dark Blue Vents',
              category: 'Minifigure, Headgear',
              img_url: 'https://storage.googleapis.com/brickognize-static/30408pb09.jpg',
              score: 0.91
            }
          ]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const liveRes = await identifyPartFromImage({
      blob: sampleBlob,
      previewDataUrl: 'data:image/jpeg;base64,part'
    });
    expect(liveRes.apiSource).toBe('brickognize_live');
    expect(liveRes.candidates).toHaveLength(1);
    expect(liveRes.candidates[0].partNum).toBe('30408pb09');
    expect(liveRes.candidates[0].category).toBe('headgear');
  });

  it('prices real Brickognize minifig IDs accurately (sw1171 Armorer, sw0718 Leia, sw0719 Ackbar, sw0450 Rex) instead of a flat 9.50€', () => {
    const armorer = createCustomMinifigMetadata({ figId: 'sw1171', name: 'The Armorer' });
    const leia = createCustomMinifigMetadata({ figId: 'sw0718', name: 'General Leia' });
    const ackbar = createCustomMinifigMetadata({ figId: 'sw0719', name: 'Admiral Ackbar' });
    const rexP2 = createCustomMinifigMetadata({ figId: 'sw0450', name: 'Clone Trooper Captain Rex' });

    expect(armorer.baseMarketPriceEur.used_complete).toBeCloseTo(17.9, 1);
    expect(leia.baseMarketPriceEur.used_complete).toBeCloseTo(7.2, 1);
    expect(ackbar.baseMarketPriceEur.used_complete).toBeCloseTo(14.2, 1);
    expect(rexP2.baseMarketPriceEur.used_complete).toBeGreaterThan(60);

    // Incluso para códigos completamente nuevos no indexados, diferencia comandante vs droide común
    const unknownCommander = createCustomMinifigMetadata({
      figId: 'sw9801',
      name: 'Clone Commander Pauldron Cloth Kama'
    });
    const unknownDroid = createCustomMinifigMetadata({
      figId: 'sw9802',
      name: 'Battle Droid Standard'
    });
    expect(unknownCommander.baseMarketPriceEur.used_complete).toBeGreaterThan(
      unknownDroid.baseMarketPriceEur.used_complete * 1.4
    );
  });
});
