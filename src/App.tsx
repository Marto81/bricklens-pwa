import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Camera,
  Layers,
  Moon,
  Sun,
  Wifi,
  WifiOff
} from 'lucide-react';
import type {
  BulkImportParsedLine,
  CollectionItem,
  MinifigCondition,
  MinifigureMetadata,
  PreferredPriceSource,
  UserCollection
} from './types/minifig';
import { MINIFIG_CATALOG } from './data/catalogPresets';
import {
  bulkUpsertCollectionItems,
  calculateCollectionStats,
  createCollection,
  db,
  deleteCollection,
  initializeCollections,
  renameCollection,
  restoreDemoCollection,
  setActiveCollectionId as persistActiveCollectionId,
  upsertCollectionMinifig
} from './db/collectionDb';
import { generatePriceComparisonReport } from './services/priceAggregator';
import { CameraScanner } from './components/scanner/CameraScanner';
import { PriceComparisonView } from './components/prices/PriceComparisonView';
import { CollectionDashboard } from './components/collection/CollectionDashboard';

type ActiveTab = 'scanner' | 'comparator' | 'collection';
type ThemeMode = 'dark' | 'light';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('scanner');
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [selectedMinifig, setSelectedMinifig] = useState<MinifigureMetadata>(MINIFIG_CATALOG[0]);
  const [selectedCondition, setSelectedCondition] = useState<MinifigCondition>('used_complete');
  const [preferredPriceSource, setPreferredPriceSource] = useState<PreferredPriceSource>('weighted');

  const [collections, setCollections] = useState<UserCollection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<CollectionItem[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    void loadCollectionsAndItems();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadCollectionsAndItems = async () => {
    const state = await initializeCollections();
    setCollections(state.collections);
    setActiveCollectionId(state.activeCollectionId);
    setAllItems(state.allItems);
  };

  const syncFromDatabase = async (overrideActiveId?: string | null) => {
    const [nextCollections, nextItems] = await Promise.all([
      db.collections.orderBy('createdAtIso').toArray(),
      db.collectionItems.toArray()
    ]);
    setCollections(nextCollections);
    setAllItems(nextItems);
    if (overrideActiveId !== undefined) {
      setActiveCollectionId(overrideActiveId);
      await persistActiveCollectionId(overrideActiveId);
    } else if (
      activeCollectionId &&
      !nextCollections.some((c) => c.id === activeCollectionId)
    ) {
      const fallbackId = nextCollections[0]?.id ?? null;
      setActiveCollectionId(fallbackId);
      await persistActiveCollectionId(fallbackId);
    } else if (!activeCollectionId && nextCollections.length > 0) {
      setActiveCollectionId(nextCollections[0].id);
      await persistActiveCollectionId(nextCollections[0].id);
    }
  };

  const activeCollection = useMemo(
    () => collections.find((c) => c.id === activeCollectionId) ?? null,
    [collections, activeCollectionId]
  );

  const activeCollectionItems = useMemo(
    () =>
      activeCollectionId
        ? allItems.filter((item) => item.collectionId === activeCollectionId)
        : [],
    [allItems, activeCollectionId]
  );

  const portfolioStats = useMemo(
    () => calculateCollectionStats(activeCollectionItems),
    [activeCollectionItems]
  );

  const handleSelectCollection = async (collectionId: string) => {
    setActiveCollectionId(collectionId);
    await persistActiveCollectionId(collectionId);
  };

  const handleCreateCollection = async (name: string): Promise<UserCollection> => {
    const created = await createCollection(name);
    await syncFromDatabase(created.id);
    return created;
  };

  const handleRenameCollection = async (collectionId: string, newName: string) => {
    await renameCollection(collectionId, newName);
    await syncFromDatabase();
  };

  const handleDeleteCollection = async (collectionId: string) => {
    const nextActiveId = await deleteCollection(collectionId);
    await syncFromDatabase(nextActiveId);
  };

  const handleRestoreDemoCollection = async () => {
    const { collection } = await restoreDemoCollection();
    await syncFromDatabase(collection.id);
  };

  const handleSelectForComparison = (
    minifig: MinifigureMetadata,
    condition: MinifigCondition
  ) => {
    setSelectedMinifig(minifig);
    setSelectedCondition(condition);
    setActiveTab('comparator');
  };

  const handleQuickAddFromScanner = async (
    minifig: MinifigureMetadata,
    condition: MinifigCondition,
    quantity: number,
    purchasePriceEur: number,
    estimatedUnitValueEur?: number,
    targetCollectionId?: string | null
  ) => {
    const report = generatePriceComparisonReport(minifig, condition, preferredPriceSource);
    const saved = await upsertCollectionMinifig({
      collectionId: targetCollectionId ?? activeCollectionId,
      minifig,
      condition,
      quantity,
      purchasePriceEur,
      estimatedUnitValueEur: estimatedUnitValueEur ?? report.estimatedMarketValueEur,
      notes: 'Añadida desde el escáner'
    });
    await syncFromDatabase(saved.collectionId);
  };

  const handleBulkAddToCollection = async (
    lines: BulkImportParsedLine[],
    targetCollectionId?: string | null
  ) => {
    if (lines.length === 0) return;
    const saved = await bulkUpsertCollectionItems(
      lines,
      targetCollectionId ?? activeCollectionId
    );
    const resolvedCollectionId = saved[0]?.collectionId ?? targetCollectionId ?? activeCollectionId;
    await syncFromDatabase(resolvedCollectionId);
  };

  const handleAddToCollectionFromComparator = async (params: {
    collectionId?: string | null;
    minifig: MinifigureMetadata;
    condition: MinifigCondition;
    quantity: number;
    purchasePriceEur: number;
    estimatedUnitValueEur: number;
    notes?: string;
  }) => {
    const saved = await upsertCollectionMinifig({
      ...params,
      collectionId: params.collectionId ?? activeCollectionId
    });
    await syncFromDatabase(saved.collectionId);
  };

  const handleUpdateQuantity = async (itemId: string, delta: number) => {
    const item = await db.collectionItems.get(itemId);
    if (!item) return;
    const nextQty = item.quantity + delta;
    if (nextQty <= 0) {
      await db.collectionItems.delete(itemId);
    } else {
      await db.collectionItems.update(itemId, { quantity: nextQty });
    }
    await syncFromDatabase();
  };

  const handleUpdateCondition = async (
    itemId: string,
    newCondition: MinifigCondition
  ) => {
    const item = await db.collectionItems.get(itemId);
    if (!item) return;
    const report = generatePriceComparisonReport(item.minifig, newCondition, preferredPriceSource);
    await db.collectionItems.update(itemId, {
      condition: newCondition,
      estimatedUnitValueEur: report.estimatedMarketValueEur,
      lastValuationIso: new Date().toISOString()
    });
    await syncFromDatabase();
  };

  const handleUpdateItemDetails = async (
    itemId: string,
    purchasePriceEur: number,
    marketValueEur: number,
    notes: string
  ) => {
    const item = await db.collectionItems.get(itemId);
    if (!item) return;

    const cleanMarket = Math.max(0.5, Math.round(marketValueEur * 100) / 100);
    const updatedMinifig: MinifigureMetadata = {
      ...item.minifig,
      baseMarketPriceEur: {
        ...item.minifig.baseMarketPriceEur,
        [item.condition]: cleanMarket
      },
      isEstimatedFallbackPrice: false
    };

    await db.collectionItems.update(itemId, {
      minifig: updatedMinifig,
      purchasePriceEur: Math.max(0, Math.round(purchasePriceEur * 100) / 100),
      estimatedUnitValueEur: cleanMarket,
      lastValuationIso: new Date().toISOString(),
      missingPartsNotes: notes || undefined
    });
    await syncFromDatabase();
  };

  const handleRemoveItem = async (itemId: string) => {
    await db.collectionItems.delete(itemId);
    await syncFromDatabase();
  };

  const handleRefreshValuations = async (sourceOverride?: PreferredPriceSource) => {
    const activeSource = sourceOverride ?? preferredPriceSource;
    if (!activeCollectionId) return;
    const current = await db.collectionItems
      .where('collectionId')
      .equals(activeCollectionId)
      .toArray();
    const nowIso = new Date().toISOString();
    const updated = current.map((item) => {
      const report = generatePriceComparisonReport(item.minifig, item.condition, activeSource);
      return {
        ...item,
        estimatedUnitValueEur: report.estimatedMarketValueEur,
        lastValuationIso: nowIso
      };
    });
    await db.collectionItems.bulkPut(updated);
    await syncFromDatabase();
  };

  const handleChangePreferredSource = async (nextSource: PreferredPriceSource) => {
    setPreferredPriceSource(nextSource);
    await handleRefreshValuations(nextSource);
  };

  const pillLabel = activeCollection
    ? activeCollection.name.length > 13
      ? `${activeCollection.name.slice(0, 12)}…`
      : activeCollection.name
    : 'Sin colección';

  return (
    <div className="app-shell">
      <header className="pwa-header">
        <div className="header-brand">
          <div className="brand-brick-mark" aria-hidden="true">
            <span className="stud" />
            <span className="stud" />
          </div>
          <div>
            <h1 className="app-title">BrickLens</h1>
            <span className="app-subtitle">Tasación LEGO</span>
          </div>
        </div>

        <div className="header-controls">
          <button
            type="button"
            id="header-portfolio-pill"
            className="portfolio-live-pill"
            onClick={() => setActiveTab('collection')}
            title="Ir a Mis Colecciones"
          >
            <span className="pill-caption">
              {pillLabel} ({portfolioStats.totalUnits})
            </span>
            <strong className="pill-total mono">
              {portfolioStats.totalMarketValueEur.toFixed(2)} €
            </strong>
          </button>

          <button
            type="button"
            id="btn-toggle-theme"
            className="icon-btn"
            onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
            title={themeMode === 'dark' ? 'Cambiar a modo Día' : 'Cambiar a modo Estudio Oscuro'}
            aria-label="Cambiar tema visual"
          >
            {themeMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <span
            className="icon-btn"
            style={{ color: isOnline ? 'var(--positive)' : 'var(--accent)', cursor: 'default' }}
            title={isOnline ? 'En línea · IndexedDB activo' : 'Sin conexión · IndexedDB Offline'}
          >
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          </span>
        </div>
      </header>

      <main className="pwa-main-content">
        {activeTab === 'scanner' && (
          <CameraScanner
            preferredPriceSource={preferredPriceSource}
            collections={collections}
            activeCollectionId={activeCollectionId}
            onSelectCollection={(id) => void handleSelectCollection(id)}
            onCreateCollection={handleCreateCollection}
            onSelectMinifigForComparison={handleSelectForComparison}
            onQuickAddToCollection={handleQuickAddFromScanner}
            onBulkAddToCollection={handleBulkAddToCollection}
          />
        )}

        {activeTab === 'comparator' && (
          <PriceComparisonView
            selectedMinifig={selectedMinifig}
            selectedCondition={selectedCondition}
            preferredPriceSource={preferredPriceSource}
            collections={collections}
            activeCollectionId={activeCollectionId}
            onSelectCollection={(id) => void handleSelectCollection(id)}
            onCreateCollection={handleCreateCollection}
            onChangePreferredSource={(src) => void handleChangePreferredSource(src)}
            onChangeMinifig={setSelectedMinifig}
            onChangeCondition={setSelectedCondition}
            onAddToCollection={handleAddToCollectionFromComparator}
          />
        )}

        {activeTab === 'collection' && (
          <CollectionDashboard
            collections={collections}
            activeCollection={activeCollection}
            allItems={allItems}
            items={activeCollectionItems}
            preferredPriceSource={preferredPriceSource}
            onSelectCollection={(id) => void handleSelectCollection(id)}
            onCreateCollection={handleCreateCollection}
            onRenameCollection={(id, name) => void handleRenameCollection(id, name)}
            onDeleteCollection={(id) => void handleDeleteCollection(id)}
            onRestoreDemoCollection={() => void handleRestoreDemoCollection()}
            onGoToScanner={() => setActiveTab('scanner')}
            onUpdateQuantity={handleUpdateQuantity}
            onUpdateCondition={handleUpdateCondition}
            onUpdateItemDetails={handleUpdateItemDetails}
            onRemoveItem={handleRemoveItem}
            onInspectInComparator={handleSelectForComparison}
            onRefreshValuations={() => void handleRefreshValuations()}
            onBulkImportLines={(lines) => void handleBulkAddToCollection(lines, activeCollectionId)}
            onQuickAddManual={(minifig, condition, qty, paid, market, notes) =>
              void handleAddToCollectionFromComparator({
                collectionId: activeCollectionId,
                minifig,
                condition,
                quantity: qty,
                purchasePriceEur: paid,
                estimatedUnitValueEur: market,
                notes
              })
            }
          />
        )}
      </main>

      <nav className="pwa-bottom-nav" aria-label="Navegación principal">
        <button
          type="button"
          id="nav-tab-scanner"
          className={`bottom-nav-item ${activeTab === 'scanner' ? 'active' : ''}`}
          onClick={() => setActiveTab('scanner')}
        >
          <Camera size={20} />
          <span>Escanear</span>
        </button>

        <button
          type="button"
          id="nav-tab-comparator"
          className={`bottom-nav-item ${activeTab === 'comparator' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparator')}
        >
          <BarChart3 size={20} />
          <span>5 Portales</span>
        </button>

        <button
          type="button"
          id="nav-tab-collection"
          className={`bottom-nav-item ${activeTab === 'collection' ? 'active' : ''}`}
          onClick={() => setActiveTab('collection')}
        >
          <div className="nav-icon-wrap">
            <Layers size={20} />
            <span className="nav-badge">{portfolioStats.totalUnits}</span>
          </div>
          <span>Colecciones</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
