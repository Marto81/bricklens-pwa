import type {
  AppSettings,
  BulkImportParsedLine,
  CollectionItem,
  MarketplaceId,
  MinifigCondition,
  MinifigureMetadata,
  ObservedPriceRecord,
  UserCollection
} from '../types/minifig';
import {
  bulkDeleteCollectionItems,
  bulkUpsertCollectionItems,
  clearApiCaches,
  createCollection,
  db,
  deleteCollection,
  deleteObservedPrice,
  exportFullBackupJson,
  getAppSettings,
  getObservedPricesForFig,
  importFullBackupJson,
  initializeCollections,
  renameCollection,
  restoreDemoCollection,
  saveAppSettings,
  saveObservedPrice,
  setActiveCollectionId,
  updateCollectionItem,
  updateItemMissingParts,
  upsertCollectionMinifig
} from '../db/collectionDb';

/**
 * Interfaz desacoplada de persistencia de BrickLens.
 * Actualmente usa IndexedDB local (Dexie) para cero fricción y soporte 100% offline;
 * preparada para sustituirse o sincronizarse con un proveedor cloud (ej. Supabase) sin tocar la UI.
 */
export interface BrickLensStorageRepository {
  readonly mode: 'local_indexeddb' | 'cloud_sync';
  initialize(): Promise<{
    collections: UserCollection[];
    activeCollectionId: string | null;
    allItems: CollectionItem[];
  }>;
  listCollectionsAndItems(): Promise<{
    collections: UserCollection[];
    items: CollectionItem[];
  }>;
  setActiveCollection(collectionId: string | null): Promise<void>;
  createCollection(name: string, color?: string): Promise<UserCollection>;
  renameCollection(collectionId: string, newName: string): Promise<void>;
  deleteCollection(collectionId: string): Promise<string | null>;
  restoreDemoCollection(): Promise<{ collection: UserCollection; items: CollectionItem[] }>;
  upsertMinifig(params: {
    collectionId?: string | null;
    minifig: MinifigureMetadata;
    condition: MinifigCondition;
    quantity: number;
    purchasePriceEur: number;
    estimatedUnitValueEur?: number;
    missingPartNums?: string[];
    notes?: string;
  }): Promise<CollectionItem>;
  bulkUpsert(lines: BulkImportParsedLine[], collectionId?: string | null): Promise<CollectionItem[]>;
  updateItem(
    itemId: string,
    patch: {
      condition?: MinifigCondition;
      quantity?: number;
      purchasePriceEur?: number;
      estimatedUnitValueEur?: number;
      missingPartNums?: string[];
      minifig?: MinifigureMetadata;
      missingPartsNotes?: string;
    }
  ): Promise<CollectionItem | null>;
  bulkDeleteItems(itemIds: string[]): Promise<void>;
  updateMissingParts(
    itemId: string,
    missingPartNums: string[],
    enrichedMinifig?: MinifigureMetadata
  ): Promise<CollectionItem | null>;
  saveObservedPrice(params: {
    figId: string;
    condition: MinifigCondition;
    portal: MarketplaceId;
    priceEur: number;
  }): Promise<ObservedPriceRecord>;
  deleteObservedPrice(
    figId: string,
    condition: MinifigCondition,
    portal: MarketplaceId
  ): Promise<void>;
  getObservedPrices(
    figId: string,
    condition: MinifigCondition
  ): Promise<Partial<Record<MarketplaceId, number>>>;
  getSettings(): Promise<AppSettings>;
  saveSettings(partial: Partial<AppSettings>): Promise<AppSettings>;
  exportBackupJson(): Promise<string>;
  importBackupJson(
    rawJson: string,
    mode?: 'replace' | 'merge'
  ): Promise<{
    collectionsCount: number;
    itemsCount: number;
    observedPricesCount: number;
    activeCollectionId: string | null;
  }>;
  clearCaches(): Promise<void>;
}

export const storageRepository: BrickLensStorageRepository = {
  mode: 'local_indexeddb',
  initialize: () => initializeCollections(),
  async listCollectionsAndItems() {
    const [collections, items] = await Promise.all([
      db.collections.orderBy('createdAtIso').toArray(),
      db.collectionItems.toArray()
    ]);
    return { collections, items };
  },
  setActiveCollection: (collectionId) => setActiveCollectionId(collectionId),
  createCollection: (name, color) => createCollection(name, { color }),
  renameCollection: (collectionId, newName) => renameCollection(collectionId, newName),
  deleteCollection: (collectionId) => deleteCollection(collectionId),
  restoreDemoCollection: () => restoreDemoCollection(),
  upsertMinifig: (params) => upsertCollectionMinifig(params),
  bulkUpsert: (lines, collectionId) => bulkUpsertCollectionItems(lines, collectionId),
  updateItem: (itemId, patch) => updateCollectionItem(itemId, patch),
  bulkDeleteItems: (itemIds) => bulkDeleteCollectionItems(itemIds),
  updateMissingParts: (itemId, missingPartNums, enrichedMinifig) =>
    updateItemMissingParts(itemId, missingPartNums, enrichedMinifig),
  saveObservedPrice: (params) => saveObservedPrice(params),
  deleteObservedPrice: (figId, condition, portal) =>
    deleteObservedPrice(figId, condition, portal),
  getObservedPrices: (figId, condition) => getObservedPricesForFig(figId, condition),
  getSettings: () => getAppSettings(),
  saveSettings: (partial) => saveAppSettings(partial),
  exportBackupJson: () => exportFullBackupJson(),
  importBackupJson: (rawJson, mode = 'replace') => importFullBackupJson(rawJson, mode),
  clearCaches: () => clearApiCaches()
};
