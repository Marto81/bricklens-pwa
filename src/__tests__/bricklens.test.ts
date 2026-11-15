import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  evaluateBulkTextList,
  generatePriceComparisonReport,
  getQuickDualPricesEur
} from '../services/priceAggregator';
import {
  buildCandidatesForPreset,
  identifyBulkLotFromImage
} from '../services/visionService';
import { lookupCmfCode } from '../data/cmfCodes';
import {
  bulkUpsertCollectionItems,
  calculateCollectionStats,
  db,
  ensureDemoCollectionSeeded,
  exportCollectionToBrickLinkXml,
  exportCollectionToBsx,
  exportCollectionToCsv,
  getPortfolioHistorySeries,
  importCollectionFromText,
  upsertCollectionMinifig
} from '../db/collectionDb';
import { DEMO_BULK_LOT_SLOTS, MINIFIG_CATALOG } from '../data/catalogPresets';

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
    expect(parsed.totalEstimatedEur).toBeGreaterThan(1500);
  });
});

describe('BrickLens Vision & Bulk + CMF Recognition Pipeline', () => {
  it('returns Top-12 candidates by default and respects custom limits with primary match first', () => {
    const candidates12 = buildCandidatesForPreset('sw0585');
    expect(candidates12).toHaveLength(12);
    expect(candidates12[0].minifig.figId).toBe('sw0585');
    expect(candidates12[0].confidence).toBeGreaterThan(0.85);
    expect(candidates12[0].confidence).toBeGreaterThan(candidates12[1].confidence);

    const candidates3 = buildCandidatesForPreset('sw0585', 3);
    expect(candidates3).toHaveLength(3);
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

describe('BrickLens Collection Valuation, Sparkline & Universal Import/Export', () => {
  beforeEach(async () => {
    await db.collectionItems.clear();
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
