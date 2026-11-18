import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Camera,
  Layers,
  Moon,
  Settings,
  Sun
} from 'lucide-react';
import type {
  AppSettings,
  BulkImportParsedLine,
  CollectionItem,
  MinifigCondition,
  MinifigureMetadata,
  PreferredPriceSource,
  UserCollection
} from './types/minifig';
import { MINIFIG_CATALOG } from './data/catalogPresets';
import { calculateCollectionStats, db } from './db/collectionDb';
import { setRuntimeProxyBaseUrl } from './services/apiConfig';
import {
  computeMissingPartsAdjustment,
  generatePriceComparisonReport
} from './services/priceAggregator';
import { storageRepository } from './services/storageRepository';
import { CameraScanner } from './components/scanner/CameraScanner';
import { PriceComparisonView } from './components/prices/PriceComparisonView';
import { CollectionDashboard } from './components/collection/CollectionDashboard';
import { MinifigDetailSheet } from './components/shared/MinifigDetailSheet';
import { SettingsSheet } from './components/settings/SettingsSheet';

type ActiveTab = 'scanner' | 'comparator' | 'collection';
type ThemeMode = 'dark' | 'light';

const DEFAULT_SETTINGS: AppSettings = {
  proxyBaseUrl: '',
  defaultTargetMarginPct: 35,
  preferredPriceSource: 'weighted'
};

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('scanner');
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [selectedMinifig, setSelectedMinifig] = useState<MinifigureMetadata>(MINIFIG_CATALOG[0]);
  const [selectedCondition, setSelectedCondition] = useState<MinifigCondition>('used_complete');
  const [preferredPriceSource, setPreferredPriceSource] = useState<PreferredPriceSource>('weighted');

  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [detailModal, setDetailModal] = useState<{
    open: boolean;
    minifig: MinifigureMetadata | null;
    collectionItemId?: string | null;
    condition?: MinifigCondition;
  }>({
    open: false,
    minifig: null,
    collectionItemId: null,
    condition: 'used_complete'
  });

  const [collections, setCollections] = useState<UserCollection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<CollectionItem[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    void bootstrapApp();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const bootstrapApp = async () => {
    const [state, settings] = await Promise.all([
      storageRepository.initialize(),
      storageRepository.getSettings()
    ]);
    setCollections(state.collections);
    setActiveCollectionId(state.activeCollectionId);
    setAllItems(state.allItems);
    setAppSettings(settings);
    setPreferredPriceSource(settings.preferredPriceSource);
    setRuntimeProxyBaseUrl(settings.proxyBaseUrl);
  };

  const syncFromDatabase = async (overrideActiveId?: string | null) => {
    const { collections: nextCollections, items: nextItems } =
      await storageRepository.listCollectionsAndItems();
    setCollections(nextCollections);
    setAllItems(nextItems);
    if (overrideActiveId !== undefined) {
      setActiveCollectionId(overrideActiveId);
      await storageRepository.setActiveCollection(overrideActiveId);
    } else if (
      activeCollectionId &&
      !nextCollections.some((c) => c.id === activeCollectionId)
    ) {
      const fallbackId = nextCollections[0]?.id ?? null;
      setActiveCollectionId(fallbackId);
      await storageRepository.setActiveCollection(fallbackId);
    } else if (!activeCollectionId && nextCollections.length > 0) {
      setActiveCollectionId(nextCollections[0].id);
      await storageRepository.setActiveCollection(nextCollections[0].id);
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

  const activeDetailCollectionItem = useMemo(
    () =>
      detailModal.collectionItemId
        ? allItems.find((it) => it.id === detailModal.collectionItemId) ?? null
        : null,
    [allItems, detailModal.collectionItemId]
  );

  const handleSelectCollection = async (collectionId: string) => {
    setActiveCollectionId(collectionId);
    await storageRepository.setActiveCollection(collectionId);
  };

  const handleCreateCollection = async (name: string): Promise<UserCollection> => {
    const created = await storageRepository.createCollection(name);
    await syncFromDatabase(created.id);
    return created;
  };

  const handleRenameCollection = async (collectionId: string, newName: string) => {
    await storageRepository.renameCollection(collectionId, newName);
    await syncFromDatabase();
  };

  const handleDeleteCollection = async (collectionId: string) => {
    const nextActiveId = await storageRepository.deleteCollection(collectionId);
    await syncFromDatabase(nextActiveId);
  };

  const handleRestoreDemoCollection = async () => {
    const { collection } = await storageRepository.restoreDemoCollection();
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

  const handleOpenMinifigDetail = useCallback(
    (minifig: MinifigureMetadata, condition: MinifigCondition = 'used_complete') => {
      setDetailModal({
        open: true,
        minifig,
        collectionItemId: null,
        condition
      });
    },
    []
  );

  const handleOpenCollectionItemDetail = useCallback((item: CollectionItem) => {
    setDetailModal({
      open: true,
      minifig: item.minifig,
      collectionItemId: item.id,
      condition: item.condition
    });
  }, []);

  const handleCloseDetailSheet = useCallback(() => {
    setDetailModal((prev) => ({ ...prev, open: false }));
  }, []);

  const handleCloseSettingsSheet = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const handleQuickAddFromScanner = async (
    minifig: MinifigureMetadata,
    condition: MinifigCondition,
    quantity: number,
    purchasePriceEur: number,
    estimatedUnitValueEur?: number,
    targetCollectionId?: string | null
  ) => {
    const report = generatePriceComparisonReport(minifig, condition, preferredPriceSource);
    const saved = await storageRepository.upsertMinifig({
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
    const saved = await storageRepository.bulkUpsert(
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
    missingPartNums?: string[];
    notes?: string;
  }) => {
    const saved = await storageRepository.upsertMinifig({
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
      baseCompleteUnitValueEur:
        newCondition !== 'used_incomplete'
          ? report.estimatedMarketValueEur
          : item.baseCompleteUnitValueEur,
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

  const handleUpdateCollectionItemMissingParts = async (
    itemId: string,
    missingPartNums: string[],
    enrichedMinifig?: MinifigureMetadata
  ) => {
    await storageRepository.updateMissingParts(itemId, missingPartNums, enrichedMinifig);
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
      const hasMissing = Boolean(item.missingPartNums && item.missingPartNums.length > 0);
      if (hasMissing) {
        const completeRef = generatePriceComparisonReport(
          item.minifig,
          'used_complete',
          activeSource
        ).estimatedMarketValueEur;
        const adj = computeMissingPartsAdjustment(
          completeRef,
          item.minifig.parts,
          item.missingPartNums
        );
        return {
          ...item,
          baseCompleteUnitValueEur: completeRef,
          estimatedUnitValueEur: adj.adjustedValueEur,
          lastValuationIso: nowIso
        };
      }
      const report = generatePriceComparisonReport(item.minifig, item.condition, activeSource);
      return {
        ...item,
        baseCompleteUnitValueEur:
          item.condition !== 'used_incomplete'
            ? report.estimatedMarketValueEur
            : item.baseCompleteUnitValueEur,
        estimatedUnitValueEur: report.estimatedMarketValueEur,
        lastValuationIso: nowIso
      };
    });
    await db.collectionItems.bulkPut(updated);
    await syncFromDatabase();
  };

  const handleChangePreferredSource = async (nextSource: PreferredPriceSource) => {
    setPreferredPriceSource(nextSource);
    const saved = await storageRepository.saveSettings({ preferredPriceSource: nextSource });
    setAppSettings(saved);
    await handleRefreshValuations(nextSource);
  };

  const handleBackupRestored = async (nextActiveId: string | null) => {
    const nextSettings = await storageRepository.getSettings();
    setAppSettings(nextSettings);
    setPreferredPriceSource(nextSettings.preferredPriceSource);
    setRuntimeProxyBaseUrl(nextSettings.proxyBaseUrl);
    await syncFromDatabase(nextActiveId);
  };

  const pillLabel = activeCollection ? activeCollection.name : 'Sin colección';

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
            <span className="app-subtitle">
              {isOnline ? 'Tasación LEGO' : 'Offline · Local'}
            </span>
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

          <button
            type="button"
            id="btn-open-settings"
            className="icon-btn"
            onClick={() => setSettingsOpen(true)}
            title="Ajustes, APIs en vivo y Backup JSON"
            aria-label="Abrir ajustes y copia de seguridad"
          >
            <Settings size={15} />
          </button>
        </div>
      </header>

      <main className="pwa-main-content">
        {activeTab === 'scanner' && (
          <CameraScanner
            preferredPriceSource={preferredPriceSource}
            defaultTargetMarginPct={appSettings.defaultTargetMarginPct}
            collections={collections}
            activeCollectionId={activeCollectionId}
            onSelectCollection={(id) => void handleSelectCollection(id)}
            onCreateCollection={handleCreateCollection}
            onSelectMinifigForComparison={handleSelectForComparison}
            onOpenMinifigDetail={handleOpenMinifigDetail}
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
            onOpenMinifigDetail={handleOpenMinifigDetail}
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
            onOpenItemDetail={handleOpenCollectionItemDetail}
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
          <span>Tasar</span>
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

      {/* Bottom-Sheet Global de Detalle y Despiece Interactivo */}
      <MinifigDetailSheet
        open={detailModal.open}
        minifig={activeDetailCollectionItem?.minifig ?? detailModal.minifig}
        collectionItem={activeDetailCollectionItem}
        initialCondition={detailModal.condition}
        preferredPriceSource={preferredPriceSource}
        collections={collections}
        activeCollectionId={activeCollectionId}
        onClose={handleCloseDetailSheet}
        onUpdateCollectionItemMissingParts={handleUpdateCollectionItemMissingParts}
        onUpdateCollectionItemDetails={handleUpdateItemDetails}
        onAddNewToCollection={handleAddToCollectionFromComparator}
      />

      {/* Bottom-Sheet de Ajustes, Diagnóstico de APIs y Backup JSON */}
      <SettingsSheet
        open={settingsOpen}
        settings={appSettings}
        onClose={handleCloseSettingsSheet}
        onSettingsChange={setAppSettings}
        onBackupRestored={handleBackupRestored}
      />
    </div>
  );
}

export default App;
