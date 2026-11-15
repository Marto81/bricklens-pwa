import Dexie, { type Table } from 'dexie';
import type {
  BulkImportParsedLine,
  CollectionItem,
  CollectionStats,
  MinifigCondition,
  MinifigureMetadata,
  PortfolioHistoryPoint,
  PortfolioTimeRange,
  PreferredPriceSource,
  ThemeAllocation,
  UserCollection
} from '../types/minifig';
import {
  createCustomMinifigMetadata,
  findMinifigById,
  MINIFIG_CATALOG
} from '../data/catalogPresets';
import {
  evaluateBulkTextList,
  generatePriceComparisonReport
} from '../services/priceAggregator';

export const DEMO_COLLECTION_ID = 'col-demo';
export const DEFAULT_USER_COLLECTION_NAME = 'Mi Colección';

interface AppMetaRow {
  key: string;
  value: string;
}

export class BrickLensDatabase extends Dexie {
  collections!: Table<UserCollection, string>;
  collectionItems!: Table<CollectionItem, string>;
  appMeta!: Table<AppMetaRow, string>;

  constructor() {
    super('BrickLensCollectionDB');
    this.version(1).stores({
      collectionItems: 'id, minifig.figId, minifig.theme, condition, addedAtIso'
    });
    this.version(2)
      .stores({
        collections: 'id, createdAtIso',
        collectionItems:
          'id, collectionId, minifig.figId, minifig.theme, condition, addedAtIso',
        appMeta: 'key'
      })
      .upgrade(async (tx) => {
        const existingItems = (await tx
          .table('collectionItems')
          .toArray()) as Array<Partial<CollectionItem> & { id: string }>;
        if (existingItems.length > 0) {
          const now = new Date().toISOString();
          await tx.table('collections').put({
            id: DEMO_COLLECTION_ID,
            name: 'Colección de prueba',
            isDemo: true,
            createdAtIso: now,
            updatedAtIso: now
          });
          for (const item of existingItems) {
            if (!item.collectionId) {
              await tx
                .table('collectionItems')
                .update(item.id, { collectionId: DEMO_COLLECTION_ID });
            }
          }
          await tx.table('appMeta').put({ key: 'demoSeeded', value: 'true' });
          await tx
            .table('appMeta')
            .put({ key: 'activeCollectionId', value: DEMO_COLLECTION_ID });
        }
      });
  }
}

export const db = new BrickLensDatabase();

function roundEur(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Calcula las métricas financieras consolidadas de una colección:
 * Valor Total de Mercado (€), Total Invertido (€), Plusvalía Neta (€ y %),
 * la pieza más valiosa (Top Grail) y la distribución porcentual por temática LEGO.
 */
export function calculateCollectionStats(items: CollectionItem[]): CollectionStats {
  let totalUnits = 0;
  let totalMarketValueEur = 0;
  let totalInvestedEur = 0;
  let topGrailItem: CollectionItem | null = null;

  const themeMap = new Map<string, { count: number; totalValueEur: number }>();

  for (const item of items) {
    const lineMarketValue = item.quantity * item.estimatedUnitValueEur;
    const lineInvested = item.quantity * item.purchasePriceEur;

    totalUnits += item.quantity;
    totalMarketValueEur += lineMarketValue;
    totalInvestedEur += lineInvested;

    if (
      !topGrailItem ||
      item.estimatedUnitValueEur > topGrailItem.estimatedUnitValueEur
    ) {
      topGrailItem = item;
    }

    const currentTheme = themeMap.get(item.minifig.theme) ?? { count: 0, totalValueEur: 0 };
    currentTheme.count += item.quantity;
    currentTheme.totalValueEur = roundEur(currentTheme.totalValueEur + lineMarketValue);
    themeMap.set(item.minifig.theme, currentTheme);
  }

  totalMarketValueEur = roundEur(totalMarketValueEur);
  totalInvestedEur = roundEur(totalInvestedEur);
  const netProfitEur = roundEur(totalMarketValueEur - totalInvestedEur);
  const roiPercentage =
    totalInvestedEur > 0
      ? Math.round(((totalMarketValueEur - totalInvestedEur) / totalInvestedEur) * 1000) / 10
      : 0;

  const byTheme: ThemeAllocation[] = Array.from(themeMap.entries())
    .map(([theme, data]) => ({
      theme,
      count: data.count,
      totalValueEur: data.totalValueEur,
      sharePercentage:
        totalMarketValueEur > 0
          ? Math.round((data.totalValueEur / totalMarketValueEur) * 1000) / 10
          : 0
    }))
    .sort((a, b) => b.totalValueEur - a.totalValueEur);

  return {
    totalUniqueFigs: items.length,
    totalUnits,
    totalMarketValueEur,
    totalInvestedEur,
    netProfitEur,
    roiPercentage,
    topGrailItem,
    byTheme
  };
}

function buildDemoSeedItems(collectionId: string): CollectionItem[] {
  const now = new Date().toISOString();
  const initialSeeds: Array<{
    minifig: MinifigureMetadata;
    condition: MinifigCondition;
    quantity: number;
    purchasePriceEur: number;
    notes?: string;
  }> = [
    {
      minifig: MINIFIG_CATALOG[1], // sw0585 Stormtrooper
      condition: 'used_complete',
      quantity: 3,
      purchasePriceEur: 5.5,
      notes: 'Ejemplo: lote imperial comprado en Wallapop'
    },
    {
      minifig: MINIFIG_CATALOG[2], // sh0232 Iron Man Silver Centurion
      condition: 'new',
      quantity: 1,
      purchasePriceEur: 42.0,
      notes: 'Ejemplo: polybag promocional sellado'
    },
    {
      minifig: MINIFIG_CATALOG[3], // njo0070 Lloyd ZX Golden Ninja
      condition: 'used_complete',
      quantity: 1,
      purchasePriceEur: 12.0,
      notes: 'Ejemplo: completa con katana dorada'
    },
    {
      minifig: MINIFIG_CATALOG[5], // sp0002 Classic Space Blue Astronaut
      condition: 'used_complete',
      quantity: 1,
      purchasePriceEur: 16.5,
      notes: 'Ejemplo: logo dorado intacto'
    }
  ];

  return initialSeeds.map((seed, idx) => {
    const report = generatePriceComparisonReport(seed.minifig, seed.condition);
    return {
      id: `item-${collectionId}-${seed.minifig.figId}-${seed.condition}-${idx}`,
      collectionId,
      minifig: seed.minifig,
      condition: seed.condition,
      quantity: seed.quantity,
      purchasePriceEur: seed.purchasePriceEur,
      estimatedUnitValueEur: report.estimatedMarketValueEur,
      lastValuationIso: now,
      missingPartsNotes: seed.notes,
      addedAtIso: now
    };
  });
}

/**
 * Inicializa las colecciones del usuario.
 * La "Colección de prueba" se crea SOLO en el primer arranque: si el usuario la elimina,
 * no vuelve a aparecer automáticamente al recargar la app.
 */
export async function initializeCollections(): Promise<{
  collections: UserCollection[];
  activeCollectionId: string | null;
  allItems: CollectionItem[];
}> {
  const existingCollections = await db.collections.orderBy('createdAtIso').toArray();
  const demoSeededMeta = await db.appMeta.get('demoSeeded');

  if (!demoSeededMeta && existingCollections.length === 0) {
    const now = new Date().toISOString();
    const demoCollection: UserCollection = {
      id: DEMO_COLLECTION_ID,
      name: 'Colección de prueba',
      isDemo: true,
      createdAtIso: now,
      updatedAtIso: now
    };
    const seedItems = buildDemoSeedItems(DEMO_COLLECTION_ID);
    await db.transaction('rw', db.collections, db.collectionItems, db.appMeta, async () => {
      await db.collections.put(demoCollection);
      await db.collectionItems.bulkPut(seedItems);
      await db.appMeta.put({ key: 'demoSeeded', value: 'true' });
      await db.appMeta.put({ key: 'activeCollectionId', value: DEMO_COLLECTION_ID });
    });

    return {
      collections: [demoCollection],
      activeCollectionId: DEMO_COLLECTION_ID,
      allItems: seedItems
    };
  }

  const allItems = await db.collectionItems.toArray();
  const savedActiveMeta = await db.appMeta.get('activeCollectionId');
  const savedActiveId = savedActiveMeta?.value;
  const activeCollectionId =
    existingCollections.find((c) => c.id === savedActiveId)?.id ??
    existingCollections[0]?.id ??
    null;

  return {
    collections: existingCollections,
    activeCollectionId,
    allItems
  };
}

export async function setActiveCollectionId(collectionId: string | null): Promise<void> {
  if (collectionId) {
    await db.appMeta.put({ key: 'activeCollectionId', value: collectionId });
  } else {
    await db.appMeta.delete('activeCollectionId');
  }
}

export async function createCollection(
  name: string,
  options?: { isDemo?: boolean; id?: string }
): Promise<UserCollection> {
  const cleanName = name.trim() || DEFAULT_USER_COLLECTION_NAME;
  const now = new Date().toISOString();
  const created: UserCollection = {
    id: options?.id || `col-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: cleanName,
    isDemo: options?.isDemo,
    createdAtIso: now,
    updatedAtIso: now
  };
  await db.collections.put(created);
  await db.appMeta.put({ key: 'activeCollectionId', value: created.id });
  return created;
}

export async function renameCollection(collectionId: string, newName: string): Promise<void> {
  const clean = newName.trim();
  if (!clean) return;
  await db.collections.update(collectionId, {
    name: clean,
    updatedAtIso: new Date().toISOString()
  });
}

export async function deleteCollection(collectionId: string): Promise<string | null> {
  let nextActiveId: string | null = null;
  await db.transaction('rw', db.collections, db.collectionItems, db.appMeta, async () => {
    await db.collectionItems.where('collectionId').equals(collectionId).delete();
    await db.collections.delete(collectionId);
    // Marcar demoSeeded para evitar que borrar la colección de prueba la vuelva a crear al recargar
    await db.appMeta.put({ key: 'demoSeeded', value: 'true' });

    const remaining = await db.collections.orderBy('createdAtIso').toArray();
    nextActiveId = remaining[0]?.id ?? null;
    if (nextActiveId) {
      await db.appMeta.put({ key: 'activeCollectionId', value: nextActiveId });
    } else {
      await db.appMeta.delete('activeCollectionId');
    }
  });
  return nextActiveId;
}

export async function restoreDemoCollection(): Promise<{
  collection: UserCollection;
  items: CollectionItem[];
}> {
  const now = new Date().toISOString();
  const demoCollection: UserCollection = {
    id: DEMO_COLLECTION_ID,
    name: 'Colección de prueba',
    isDemo: true,
    createdAtIso: now,
    updatedAtIso: now
  };
  const seedItems = buildDemoSeedItems(DEMO_COLLECTION_ID);

  await db.transaction('rw', db.collections, db.collectionItems, db.appMeta, async () => {
    await db.collectionItems.where('collectionId').equals(DEMO_COLLECTION_ID).delete();
    await db.collections.put(demoCollection);
    await db.collectionItems.bulkPut(seedItems);
    await db.appMeta.put({ key: 'demoSeeded', value: 'true' });
    await db.appMeta.put({ key: 'activeCollectionId', value: DEMO_COLLECTION_ID });
  });

  return { collection: demoCollection, items: seedItems };
}

/**
 * Mantiene compatibilidad directa para pruebas y restauración manual de ejemplos.
 */
export async function ensureDemoCollectionSeeded(): Promise<CollectionItem[]> {
  const count = await db.collectionItems.where('collectionId').equals(DEMO_COLLECTION_ID).count();
  if (count > 0) {
    return db.collectionItems.where('collectionId').equals(DEMO_COLLECTION_ID).toArray();
  }
  const { items } = await restoreDemoCollection();
  return items;
}

async function resolveTargetCollectionId(requestedId?: string | null): Promise<string> {
  if (requestedId) {
    const found = await db.collections.get(requestedId);
    if (found) return found.id;
  }

  const activeMeta = await db.appMeta.get('activeCollectionId');
  if (activeMeta?.value) {
    const found = await db.collections.get(activeMeta.value);
    if (found) return found.id;
  }

  const first = await db.collections.orderBy('createdAtIso').first();
  if (first) return first.id;

  // Si el usuario borró todas las colecciones y escanea/añade una figura nueva, creamos "Mi Colección"
  const created = await createCollection(DEFAULT_USER_COLLECTION_NAME);
  await db.appMeta.put({ key: 'demoSeeded', value: 'true' });
  return created.id;
}

export async function upsertCollectionMinifig(params: {
  collectionId?: string | null;
  minifig: MinifigureMetadata;
  condition: MinifigCondition;
  quantity: number;
  purchasePriceEur: number;
  estimatedUnitValueEur?: number;
  notes?: string;
}): Promise<CollectionItem> {
  const targetCollectionId = await resolveTargetCollectionId(params.collectionId);

  const existing = await db.collectionItems
    .where('collectionId')
    .equals(targetCollectionId)
    .filter(
      (item) =>
        item.minifig.figId === params.minifig.figId && item.condition === params.condition
    )
    .first();

  const now = new Date().toISOString();
  const unitValue =
    params.estimatedUnitValueEur ??
    generatePriceComparisonReport(params.minifig, params.condition).estimatedMarketValueEur;

  if (existing) {
    const updatedQuantity = existing.quantity + params.quantity;
    const weightedPurchase = roundEur(
      (existing.purchasePriceEur * existing.quantity +
        params.purchasePriceEur * params.quantity) /
        updatedQuantity
    );

    const updated: CollectionItem = {
      ...existing,
      quantity: updatedQuantity,
      purchasePriceEur: weightedPurchase,
      estimatedUnitValueEur: unitValue,
      lastValuationIso: now,
      missingPartsNotes: params.notes || existing.missingPartsNotes
    };
    await db.collectionItems.put(updated);
    await db.collections.update(targetCollectionId, { updatedAtIso: now });
    return updated;
  }

  const created: CollectionItem = {
    id: `item-${targetCollectionId}-${params.minifig.figId}-${params.condition}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    collectionId: targetCollectionId,
    minifig: params.minifig,
    condition: params.condition,
    quantity: params.quantity,
    purchasePriceEur: params.purchasePriceEur,
    estimatedUnitValueEur: unitValue,
    lastValuationIso: now,
    missingPartsNotes: params.notes,
    addedAtIso: now
  };

  await db.collectionItems.put(created);
  await db.collections.update(targetCollectionId, { updatedAtIso: now });
  return created;
}

export async function bulkUpsertCollectionItems(
  lines: BulkImportParsedLine[],
  collectionId?: string | null
): Promise<CollectionItem[]> {
  const targetCollectionId = await resolveTargetCollectionId(collectionId);
  for (const line of lines) {
    await upsertCollectionMinifig({
      collectionId: targetCollectionId,
      minifig: line.minifig,
      condition: line.condition,
      quantity: line.quantity,
      purchasePriceEur: line.purchasePriceEur,
      estimatedUnitValueEur: line.estimatedUnitValueEur,
      notes: line.notes
    });
  }
  return db.collectionItems.where('collectionId').equals(targetCollectionId).toArray();
}

export function exportCollectionToCsv(items: CollectionItem[]): string {
  const headers = [
    'Codigo_BrickLink',
    'Nombre',
    'Tematica',
    'Año',
    'Estado',
    'Cantidad',
    'Coste_Compra_Unit_EUR',
    'Valor_Mercado_Unit_EUR',
    'Valor_Total_Linea_EUR',
    'Plusvalia_Linea_EUR',
    'Notas'
  ];

  const rows = items.map((item) => {
    const totalLine = (item.quantity * item.estimatedUnitValueEur).toFixed(2);
    const profitLine = (
      item.quantity *
      (item.estimatedUnitValueEur - item.purchasePriceEur)
    ).toFixed(2);
    const safeName = `"${item.minifig.name.replace(/"/g, '""')}"`;
    const safeNotes = `"${(item.missingPartsNotes || '').replace(/"/g, '""')}"`;

    return [
      item.minifig.figId,
      safeName,
      `"${item.minifig.theme}"`,
      item.minifig.yearReleased,
      item.condition,
      item.quantity,
      item.purchasePriceEur.toFixed(2),
      item.estimatedUnitValueEur.toFixed(2),
      totalLine,
      profitLine,
      safeNotes
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function exportCollectionToBrickLinkXml(items: CollectionItem[]): string {
  const xmlItems = items
    .map((item) => {
      const blCondition = item.condition === 'new' ? 'N' : 'U';
      const remarks = item.missingPartsNotes
        ? `\n    <REMARKS>${escapeXml(item.missingPartsNotes)}</REMARKS>`
        : '';
      return `  <ITEM>
    <ITEMTYPE>M</ITEMTYPE>
    <ITEMID>${escapeXml(item.minifig.figId)}</ITEMID>
    <CONDITION>${blCondition}</CONDITION>
    <MINQTY>${item.quantity}</MINQTY>
    <PRICE>${item.estimatedUnitValueEur.toFixed(2)}</PRICE>${remarks}
  </ITEM>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<INVENTORY>\n${xmlItems}\n</INVENTORY>`;
}

export function exportCollectionToBsx(items: CollectionItem[]): string {
  const bsxItems = items
    .map((item) => {
      const bsxCond = item.condition === 'new' ? 'N' : 'U';
      return `    <Item>
      <ItemID>${escapeXml(item.minifig.figId)}</ItemID>
      <ItemTypeID>M</ItemTypeID>
      <ColorID>0</ColorID>
      <ItemName>${escapeXml(item.minifig.name)}</ItemName>
      <CategoryName>${escapeXml(item.minifig.theme)}</CategoryName>
      <Status>I</Status>
      <Qty>${item.quantity}</Qty>
      <Price>${item.estimatedUnitValueEur.toFixed(2)}</Price>
      <Condition>${bsxCond}</Condition>
      <OrigPrice>${item.purchasePriceEur.toFixed(2)}</OrigPrice>
      <Comments>${escapeXml(item.missingPartsNotes || '')}</Comments>
    </Item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE BrickStoreXML>\n<BrickStoreXML>\n  <Inventory>\n${bsxItems}\n  </Inventory>\n</BrickStoreXML>`;
}

function buildSyntheticExternalMinifig(params: {
  figId: string;
  name?: string;
  theme?: string;
  unitPriceEur?: number;
  condition: MinifigCondition;
}): MinifigureMetadata {
  const existing = findMinifigById(params.figId);
  if (existing) return existing;

  const base = params.unitPriceEur && params.unitPriceEur > 0 ? params.unitPriceEur : 10.0;
  const estUsed =
    params.condition === 'new'
      ? roundEur(base * 0.72)
      : params.condition === 'used_incomplete'
      ? roundEur(base * 1.45)
      : roundEur(base);

  return createCustomMinifigMetadata({
    figId: params.figId,
    name: params.name || `Minifigura BrickLink ${params.figId.toUpperCase()}`,
    theme: params.theme,
    usedEur: estUsed,
    notes: `Código importado: ${params.figId}`
  });
}

function extractXmlTag(block: string, tagName: string): string | undefined {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match?.[1]?.trim();
}

function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeConditionCode(raw?: string): MinifigCondition {
  const val = (raw || '').trim().toLowerCase();
  if (val === 'n' || val === 'new' || val.includes('nueva') || val.includes('sellad')) {
    return 'new';
  }
  if (val === 'i' || val.includes('incomp')) {
    return 'used_incomplete';
  }
  return 'used_complete';
}

export function importCollectionFromText(
  content: string,
  format: 'auto' | 'csv' | 'xml' | 'bsx' | 'list' = 'auto',
  preferredSource: PreferredPriceSource = 'weighted'
): {
  items: BulkImportParsedLine[];
  detectedFormat: 'csv' | 'xml' | 'bsx' | 'list';
  unknownTokens: string[];
} {
  const trimmed = content.trim();
  if (!trimmed) {
    return { items: [], detectedFormat: 'list', unknownTokens: [] };
  }

  let detectedFormat: 'csv' | 'xml' | 'bsx' | 'list';
  if (format !== 'auto') {
    detectedFormat = format;
  } else if (/<BrickStoreXML/i.test(trimmed)) {
    detectedFormat = 'bsx';
  } else if (/<INVENTORY/i.test(trimmed) || /<ITEM>/i.test(trimmed)) {
    detectedFormat = 'xml';
  } else if (
    trimmed.includes('\n') &&
    trimmed.split('\n')[0].split(',').length >= 3
  ) {
    detectedFormat = 'csv';
  } else {
    detectedFormat = 'list';
  }

  if (detectedFormat === 'list') {
    const evalRes = evaluateBulkTextList(trimmed, preferredSource);
    return {
      items: evalRes.items,
      detectedFormat: 'list',
      unknownTokens: evalRes.unknownTokens
    };
  }

  const parsedLines: BulkImportParsedLine[] = [];
  const unknownTokens: string[] = [];

  if (detectedFormat === 'xml' || detectedFormat === 'bsx') {
    const itemBlocks = trimmed.match(/<ITEM>[\s\S]*?<\/ITEM>/gi) || [];
    for (const block of itemBlocks) {
      const itemType = (extractXmlTag(block, 'ITEMTYPE') || extractXmlTag(block, 'ItemTypeID') || 'M').toUpperCase();
      const itemId = extractXmlTag(block, 'ITEMID') || extractXmlTag(block, 'ItemID');
      if (!itemId || (itemType && itemType !== 'M')) {
        if (itemId) unknownTokens.push(`${itemId} (no es minifig)`);
        continue;
      }

      const condition = normalizeConditionCode(
        extractXmlTag(block, 'CONDITION') || extractXmlTag(block, 'Condition')
      );
      const qtyRaw = extractXmlTag(block, 'MINQTY') || extractXmlTag(block, 'QTY') || extractXmlTag(block, 'Qty') || '1';
      const quantity = Math.max(1, Number(qtyRaw) || 1);
      const priceRaw = extractXmlTag(block, 'PRICE') || extractXmlTag(block, 'Price');
      const origPriceRaw = extractXmlTag(block, 'ORIGPRICE') || extractXmlTag(block, 'OrigPrice');
      const unitPriceNum = priceRaw ? Number(priceRaw.replace(',', '.')) : undefined;
      const origPriceNum = origPriceRaw ? Number(origPriceRaw.replace(',', '.')) : undefined;
      const itemName = extractXmlTag(block, 'ITEMNAME') || extractXmlTag(block, 'ItemName');
      const themeName = extractXmlTag(block, 'CATEGORYNAME') || extractXmlTag(block, 'CategoryName');
      const notes = extractXmlTag(block, 'REMARKS') || extractXmlTag(block, 'Comments');

      const catalogMatch = findMinifigById(itemId);
      const minifig =
        catalogMatch ??
        buildSyntheticExternalMinifig({
          figId: itemId,
          name: itemName,
          theme: themeName,
          unitPriceEur: unitPriceNum,
          condition
        });

      const report = generatePriceComparisonReport(minifig, condition, preferredSource);
      const estValue =
        catalogMatch
          ? report.estimatedMarketValueEur
          : unitPriceNum && Number.isFinite(unitPriceNum) && unitPriceNum > 0
          ? roundEur(unitPriceNum)
          : report.estimatedMarketValueEur;
      const paidValue =
        origPriceNum && Number.isFinite(origPriceNum) && origPriceNum >= 0
          ? roundEur(origPriceNum)
          : roundEur(estValue * 0.78);

      parsedLines.push({
        figId: minifig.figId,
        minifig,
        condition,
        quantity,
        purchasePriceEur: paidValue,
        estimatedUnitValueEur: estValue,
        notes: notes || `Importado (${detectedFormat.toUpperCase()})`
      });
    }

    return { items: parsedLines, detectedFormat, unknownTokens };
  }

  // Formato CSV
  const rows = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (rows.length === 0) return { items: [], detectedFormat: 'csv', unknownTokens: [] };

  const firstCells = parseCsvRow(rows[0]).map((c) => c.toLowerCase());
  const hasHeader =
    firstCells.some((c) => c.includes('codigo') || c.includes('itemid') || c.includes('figid'));
  const startRow = hasHeader ? 1 : 0;

  for (let r = startRow; r < rows.length; r++) {
    const cells = parseCsvRow(rows[r]);
    if (cells.length === 0 || !cells[0]) continue;

    const figId = cells[0].trim();
    const isFullBrickLensCsv = cells.length >= 8;
    const rawName = isFullBrickLensCsv ? cells[1] : undefined;
    const rawTheme = isFullBrickLensCsv ? cells[2] : undefined;
    const condition = normalizeConditionCode(isFullBrickLensCsv ? cells[4] : cells[1]);
    const quantity = Math.max(1, Number(isFullBrickLensCsv ? cells[5] : cells[2]) || 1);
    const paidRaw = Number((isFullBrickLensCsv ? cells[6] : cells[3] || '').replace(',', '.'));
    const marketRaw = Number((isFullBrickLensCsv ? cells[7] : cells[4] || '').replace(',', '.'));
    const notes = isFullBrickLensCsv ? cells[10] : undefined;

    const catalogMatch = findMinifigById(figId);
    const minifig =
      catalogMatch ??
      buildSyntheticExternalMinifig({
        figId,
        name: rawName,
        theme: rawTheme,
        unitPriceEur: Number.isFinite(marketRaw) ? marketRaw : undefined,
        condition
      });

    const report = generatePriceComparisonReport(minifig, condition, preferredSource);
    const estValue =
      catalogMatch
        ? report.estimatedMarketValueEur
        : Number.isFinite(marketRaw) && marketRaw > 0
        ? roundEur(marketRaw)
        : report.estimatedMarketValueEur;

    const paidValue =
      Number.isFinite(paidRaw) && paidRaw >= 0
        ? roundEur(paidRaw)
        : roundEur(estValue * 0.78);

    parsedLines.push({
      figId: minifig.figId,
      minifig,
      condition,
      quantity,
      purchasePriceEur: paidValue,
      estimatedUnitValueEur: estValue,
      notes: notes || 'Importado desde CSV'
    });
  }

  return { items: parsedLines, detectedFormat: 'csv', unknownTokens };
}

/**
 * Genera una serie temporal determinista de valoración para el Sparkline minimalista
 * acorde al mix de rareza actual del portfolio, terminando exactamente en el valor actual.
 */
export function getPortfolioHistorySeries(
  items: CollectionItem[],
  range: PortfolioTimeRange
): PortfolioHistoryPoint[] {
  const stats = calculateCollectionStats(items);
  const currentVal = stats.totalMarketValueEur;
  const currentInvested = stats.totalInvestedEur;

  const labelsByRange: Record<PortfolioTimeRange, string[]> = {
    '1D': ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', 'Ahora'],
    '1W': ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Hoy'],
    '1M': ['S-4', 'S-3', 'S-2', 'S-1', '-14d', '-7d', 'Hoy'],
    '1Y': ['Ene', 'Mar', 'May', 'Jul', 'Sep', 'Nov', 'Hoy']
  };

  const labels = labelsByRange[range];
  if (currentVal <= 0) {
    return labels.map((label) => ({ label, valueEur: 0, investedEur: 0 }));
  }

  // Los griales y raras muestran mayor revalorización anual que los sets recientes
  const grailShare =
    items.reduce(
      (sum, item) =>
        sum +
        (item.minifig.rarity === 'grail' || item.minifig.rarity === 'rare'
          ? item.quantity * item.estimatedUnitValueEur
          : 0),
      0
    ) / Math.max(1, currentVal);

  const driftStartByRange: Record<PortfolioTimeRange, number> = {
    '1D': 0.992,
    '1W': 0.974,
    '1M': 0.935 - grailShare * 0.025,
    '1Y': 0.78 - grailShare * 0.08
  };

  const startFactor = Math.max(0.55, driftStartByRange[range]);
  const n = labels.length;

  return labels.map((label, idx) => {
    if (idx === n - 1) {
      return {
        label,
        valueEur: currentVal,
        investedEur: currentInvested
      };
    }
    const progress = idx / (n - 1);
    const wave = Math.sin((idx + 1) * 1.45) * (range === '1D' ? 0.003 : 0.011) * (1 - progress);
    const factor = startFactor + (1 - startFactor) * progress + wave;
    return {
      label,
      valueEur: roundEur(currentVal * factor),
      investedEur: roundEur(currentInvested * (0.9 + 0.1 * progress))
    };
  });
}
