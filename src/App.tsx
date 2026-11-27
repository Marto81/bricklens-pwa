import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Camera, Home, Search, Tag } from 'lucide-react';
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
import {
  calculateCollectionStats,
  COLLECTION_DOT_COLORS,
  db,
  DEMO_COLLECTION_ID
} from './db/collectionDb';
import { setRuntimeProxyBaseUrl } from './services/apiConfig';
import { fetchHybridPriceReport } from './services/catalogService';
import {
  computeMissingPartsAdjustment,
  generatePriceComparisonReport
} from './services/priceAggregator';
import { storageRepository } from './services/storageRepository';
import { HomeDashboard } from './components/home/HomeDashboard';
import { PriceComparisonView } from './components/prices/PriceComparisonView';
import { CollectionDashboard } from './components/collection/CollectionDashboard';
import { CatalogExploreView } from './components/catalog/CatalogExploreView';
import { CameraScanner, type ScannerSavedPayload } from './components/scanner/CameraScanner';
import {
  ScanCelebrationModal,
  type CelebrationPayload
} from './components/scanner/ScanCelebrationModal';
import { CmfScannerModal } from './components/scanner/CmfScannerModal';
import { MinifigDetailSheet } from './components/shared/MinifigDetailSheet';
import { SettingsSheet } from './components/settings/SettingsSheet';
import { SideDrawer } from './components/shared/SideDrawer';

type ActiveTab = 'home' | 'market' | 'collection' | 'catalog';
type ThemeMode = 'light' | 'dark';

const DEFAULT_SETTINGS: AppSettings = {
  proxyBaseUrl: '',
  defaultTargetMarginPct: 35,
  preferredPriceSource: 'weighted',
  themeMode: 'light'
};

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [selectedMinifig, setSelectedMinifig] = useState<MinifigureMetadata>(MINIFIG_CATALOG[1]);
  const [selectedCondition, setSelectedCondition] = useState<MinifigCondition>('used_complete');
  const [preferredPriceSource, setPreferredPriceSource] = useState<PreferredPriceSource>('weighted');

  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cmfOpen, setCmfOpen] = useState(false);
  const [collectionModalTrigger, setCollectionModalTrigger] = useState<'none' | 'import' | 'export'>('none');
  const [celebration, setCelebration] = useState<CelebrationPayload | null>(null);

  const [detailModal, setDetailModal] = useState<{
    open: boolean;
    minifig: MinifigureMetadata | null;
    collectionItemId?: string | null;
    condition?: MinifigCondition;
    expandParts?: boolean;
  }>({
    open: false,
    minifig: null,
    collectionItemId: null,
    condition: 'used_complete',
    expandParts: false
  });

  const [collections, setCollections] = useState<UserCollection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<CollectionItem[]>([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', themeMode === 'dark' ? '#0f1115' : '#ffffff');
    }
  }, [themeMode]);

  useEffect(() => {
    void bootstrapApp();
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
    setThemeMode(settings.themeMode === 'dark' ? 'dark' : 'light');
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
    return { nextCollections, nextItems };
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

  const activeDetailCollectionItem = useMemo(
    () =>
      detailModal.collectionItemId
        ? allItems.find((it) => it.id === detailModal.collectionItemId) ?? null
        : null,
    [allItems, detailModal.collectionItemId]
  );

  const hasDemoCollection = useMemo(
    () => collections.some((c) => c.id === DEMO_COLLECTION_ID || c.isDemo),
    [collections]
  );

  const handleToggleTheme = async () => {
    const next: ThemeMode = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(next);
    const saved = await storageRepository.saveSettings({ themeMode: next });
    setAppSettings(saved);
  };

  const handleSelectCollection = async (collectionId: string) => {
    setActiveCollectionId(collectionId);
    await storageRepository.setActiveCollection(collectionId);
  };

  const handleSelectCollectionAndGo = async (collectionId: string) => {
    await handleSelectCollection(collectionId);
    setActiveTab('collection');
  };

  const handleCreateCollection = async (
    name: string,
    color?: string
  ): Promise<UserCollection> => {
    const created = await storageRepository.createCollection(name, color);
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

  const handleOpenMinifigDetail = useCallback(
    (minifig: MinifigureMetadata, condition: MinifigCondition = 'used_complete') => {
      setDetailModal({
        open: true,
        minifig,
        collectionItemId: null,
        condition,
        expandParts: false
      });
    },
    []
  );

  const handleOpenCollectionItemDetail = useCallback(
    (item: CollectionItem, expandParts = false) => {
      setDetailModal({
        open: true,
        minifig: item.minifig,
        collectionItemId: item.id,
        condition: item.condition,
        expandParts
      });
    },
    []
  );

  const handleCloseDetailSheet = useCallback(() => {
    setDetailModal((prev) => ({ ...prev, open: false }));
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

  const handleScanSavedCelebration = async (payload: ScannerSavedPayload) => {
    const { nextCollections, nextItems } = await syncFromDatabase(payload.targetCollectionId);
    const targetCol =
      nextCollections.find((c) => c.id === payload.targetCollectionId) ??
      nextCollections[0] ??
      null;
    const colItems = targetCol
      ? nextItems.filter((it) => it.collectionId === targetCol.id)
      : nextItems;
    const newTotal = calculateCollectionStats(colItems).totalMarketValueEur;
    const previousTotal = Math.max(0, newTotal - payload.addedValueEur);
    const pctGain =
      previousTotal > 0
        ? Math.round((payload.addedValueEur / previousTotal) * 1000) / 10
        : 100;

    setScannerOpen(false);
    setCelebration({
      addedItems: payload.addedItems,
      addedValueEur: payload.addedValueEur,
      collectionName: targetCol?.name || 'Mi Colección',
      collectionColor: targetCol?.color || COLLECTION_DOT_COLORS[0],
      newCollectionTotalEur: newTotal,
      percentGain: pctGain
    });
  };

  const handleAddToCollectionFromAny = async (params: {
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

  const handleUpdateCondition = async (itemId: string, newCondition: MinifigCondition) => {
    const item = await db.collectionItems.get(itemId);
    if (!item) return;
    const report = await fetchHybridPriceReport(
      item.minifig,
      newCondition,
      preferredPriceSource,
      false
    );
    await storageRepository.updateItem(itemId, {
      condition: newCondition,
      estimatedUnitValueEur: report.estimatedMarketValueEur
    });
    await syncFromDatabase();
  };

  const handleUpdateItemDetails = async (
    itemId: string,
    purchasePriceEur: number,
    marketValueEur: number,
    notes: string,
    extras?: {
      condition?: MinifigCondition;
      quantity?: number;
      missingPartNums?: string[];
      minifig?: MinifigureMetadata;
    }
  ) => {
    await storageRepository.updateItem(itemId, {
      purchasePriceEur,
      estimatedUnitValueEur: marketValueEur,
      missingPartsNotes: notes,
      condition: extras?.condition,
      quantity: extras?.quantity,
      missingPartNums: extras?.missingPartNums,
      minifig: extras?.minifig
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

  const handleRemoveItemsBulk = async (itemIds: string[]) => {
    await storageRepository.bulkDeleteItems(itemIds);
    await syncFromDatabase();
  };

  const handleRefreshValuations = async (sourceOverride?: PreferredPriceSource) => {
    const activeSource = sourceOverride ?? preferredPriceSource;
    const current = await db.collectionItems.toArray();
    const nowIso = new Date().toISOString();
    const updated = await Promise.all(
      current.map(async (item) => {
        const hasMissing = Boolean(item.missingPartNums && item.missingPartNums.length > 0);
        if (hasMissing) {
          const completeRep = await fetchHybridPriceReport(
            item.minifig,
            'used_complete',
            activeSource,
            false
          );
          const adj = computeMissingPartsAdjustment(
            completeRep.estimatedMarketValueEur,
            item.minifig.parts,
            item.missingPartNums
          );
          return {
            ...item,
            baseCompleteUnitValueEur: completeRep.estimatedMarketValueEur,
            estimatedUnitValueEur: adj.adjustedValueEur,
            lastValuationIso: nowIso
          };
        }
        const report = await fetchHybridPriceReport(
          item.minifig,
          item.condition,
          activeSource,
          false
        );
        return {
          ...item,
          baseCompleteUnitValueEur:
            item.condition !== 'used_incomplete'
              ? report.estimatedMarketValueEur
              : item.baseCompleteUnitValueEur,
          estimatedUnitValueEur: report.estimatedMarketValueEur,
          lastValuationIso: nowIso
        };
      })
    );
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
    setThemeMode(nextSettings.themeMode === 'dark' ? 'dark' : 'light');
    setRuntimeProxyBaseUrl(nextSettings.proxyBaseUrl);
    await syncFromDatabase(nextActiveId);
  };

  return (
    <div className="bm-app-shell">
      <main className="bm-main">
        {activeTab === 'home' && (
          <HomeDashboard
            collections={collections}
            allItems={allItems}
            onOpenDrawer={() => setDrawerOpen(true)}
            onSelectCollectionAndNavigate={(id) => void handleSelectCollectionAndGo(id)}
            onOpenItemDetail={(item) => handleOpenCollectionItemDetail(item, false)}
            onOpenScanner={() => setScannerOpen(true)}
          />
        )}

        {activeTab === 'market' && (
          <PriceComparisonView
            selectedMinifig={selectedMinifig}
            selectedCondition={selectedCondition}
            preferredPriceSource={preferredPriceSource}
            collections={collections}
            activeCollectionId={activeCollectionId}
            allItems={allItems}
            onSelectCollection={(id) => void handleSelectCollection(id)}
            onCreateCollection={handleCreateCollection}
            onChangePreferredSource={(src) => void handleChangePreferredSource(src)}
            onChangeMinifig={setSelectedMinifig}
            onChangeCondition={setSelectedCondition}
            onOpenMinifigDetail={handleOpenMinifigDetail}
            onAddToCollection={handleAddToCollectionFromAny}
          />
        )}

        {activeTab === 'collection' && (
          <CollectionDashboard
            collections={collections}
            activeCollection={activeCollection}
            allItems={allItems}
            items={activeCollectionItems}
            preferredPriceSource={preferredPriceSource}
            initialModal={collectionModalTrigger}
            onClearInitialModal={() => setCollectionModalTrigger('none')}
            onSelectCollection={(id) => void handleSelectCollection(id)}
            onCreateCollection={handleCreateCollection}
            onRenameCollection={(id, name) => void handleRenameCollection(id, name)}
            onDeleteCollection={(id) => void handleDeleteCollection(id)}
            onGoToScanner={() => setScannerOpen(true)}
            onUpdateQuantity={(id, delta) => void handleUpdateQuantity(id, delta)}
            onUpdateCondition={(id, cond) => void handleUpdateCondition(id, cond)}
            onUpdateItemDetails={(id, paid, mkt, notes, extras) =>
              void handleUpdateItemDetails(id, paid, mkt, notes, extras)
            }
            onRemoveItem={(id) => void handleRemoveItem(id)}
            onRemoveItemsBulk={(ids) => void handleRemoveItemsBulk(ids)}
            onOpenItemDetail={handleOpenCollectionItemDetail}
            onBulkImportLines={(lines) =>
              void handleBulkAddToCollection(lines, activeCollectionId)
            }
            onQuickAddManual={(minifig, condition, qty, paid, market, notes) =>
              void handleAddToCollectionFromAny({
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

        {activeTab === 'catalog' && (
          <CatalogExploreView
            collections={collections}
            activeCollectionId={activeCollectionId}
            preferredPriceSource={preferredPriceSource}
            onOpenMinifigDetail={handleOpenMinifigDetail}
            onQuickAdd={async (minifig, cond, qty, targetColId) => {
              const report = await fetchHybridPriceReport(
                minifig,
                cond,
                preferredPriceSource,
                false
              );
              await handleAddToCollectionFromAny({
                collectionId: targetColId,
                minifig,
                condition: cond,
                quantity: qty,
                purchasePriceEur: Math.round(report.estimatedMarketValueEur * 0.8 * 100) / 100,
                estimatedUnitValueEur: report.estimatedMarketValueEur,
                notes: 'Añadida desde Catálogo'
              });
            }}
          />
        )}
      </main>

      {/* Barra inferior flotante tipo cápsula + Botón central Brick Vermilion de cámara (estilo vídeo) */}
      <nav className="bm-floating-dock" aria-label="Navegación principal">
        <div className="bm-dock-capsule">
          <button
            type="button"
            id="nav-tab-home"
            className={`bm-dock-btn ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
            aria-label="Inicio"
            title="Inicio"
          >
            <Home size={21} strokeWidth={activeTab === 'home' ? 2.4 : 1.9} />
          </button>

          <button
            type="button"
            id="nav-tab-market"
            className={`bm-dock-btn ${activeTab === 'market' ? 'active' : ''}`}
            onClick={() => setActiveTab('market')}
            aria-label="Tasar y vender"
            title="Tasar y 5 portales"
          >
            <Tag size={20} strokeWidth={activeTab === 'market' ? 2.4 : 1.9} />
          </button>
        </div>

        <button
          type="button"
          id="nav-btn-camera"
          className="bm-camera-fab"
          onClick={() => setScannerOpen(true)}
          aria-label="Abrir escáner de cámara"
          title="Escanear minifiguras o piezas"
        >
          <Camera size={24} strokeWidth={2.2} />
        </button>

        <div className="bm-dock-capsule">
          <button
            type="button"
            id="nav-tab-collection"
            className={`bm-dock-btn ${activeTab === 'collection' ? 'active' : ''}`}
            onClick={() => setActiveTab('collection')}
            aria-label="Colecciones"
            title="Mis Colecciones"
          >
            <Box size={21} strokeWidth={activeTab === 'collection' ? 2.4 : 1.9} />
          </button>

          <button
            type="button"
            id="nav-tab-catalog"
            className={`bm-dock-btn ${activeTab === 'catalog' ? 'active' : ''}`}
            onClick={() => setActiveTab('catalog')}
            aria-label="Catálogo"
            title="Explorar catálogo"
          >
            <Search size={20} strokeWidth={activeTab === 'catalog' ? 2.4 : 1.9} />
          </button>
        </div>
      </nav>

      {/* Menú lateral ☰ */}
      <SideDrawer
        open={drawerOpen}
        themeMode={themeMode}
        hasDemoCollection={hasDemoCollection}
        onClose={() => setDrawerOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenCmfScanner={() => setCmfOpen(true)}
        onOpenImport={() => {
          setActiveTab('collection');
          setCollectionModalTrigger('import');
        }}
        onOpenExport={() => {
          setActiveTab('collection');
          setCollectionModalTrigger('export');
        }}
        onToggleTheme={() => void handleToggleTheme()}
        onRestoreDemoCollection={() => void handleRestoreDemoCollection()}
      />

      {/* Escáner de cámara a pantalla completa */}
      <CameraScanner
        open={scannerOpen}
        preferredPriceSource={preferredPriceSource}
        defaultTargetMarginPct={appSettings.defaultTargetMarginPct}
        collections={collections}
        activeCollectionId={activeCollectionId}
        onClose={() => setScannerOpen(false)}
        onSelectCollection={(id) => void handleSelectCollection(id)}
        onOpenMinifigDetail={handleOpenMinifigDetail}
        onQuickAddToCollection={handleQuickAddFromScanner}
        onBulkAddToCollection={handleBulkAddToCollection}
        onScanSavedCelebration={(payload) => void handleScanSavedCelebration(payload)}
      />

      {/* Pantalla blanca de celebración al guardar un escaneo */}
      <ScanCelebrationModal
        payload={celebration}
        onClose={() => {
          setCelebration(null);
          setActiveTab('collection');
        }}
        onScanMore={() => {
          setCelebration(null);
          setScannerOpen(true);
        }}
      />

      {/* Escáner de cajas sorpresa CMF */}
      <CmfScannerModal
        open={cmfOpen}
        preferredPriceSource={preferredPriceSource}
        onClose={() => setCmfOpen(false)}
        onOpenMinifigDetail={handleOpenMinifigDetail}
        onQuickAdd={async (fig, cond, qty, priceEur) => {
          await handleAddToCollectionFromAny({
            collectionId: activeCollectionId,
            minifig: fig,
            condition: cond,
            quantity: qty,
            purchasePriceEur: Math.round(priceEur * 0.8 * 100) / 100,
            estimatedUnitValueEur: priceEur,
            notes: 'Identificada desde caja CMF'
          });
        }}
      />

      {/* Ficha completa blanca deslizante (Detalle, Fuente de Precio + 5 Portales, Despiece interactivo) */}
      <MinifigDetailSheet
        open={detailModal.open}
        minifig={activeDetailCollectionItem?.minifig ?? detailModal.minifig}
        collectionItem={activeDetailCollectionItem}
        allItems={allItems}
        initialCondition={detailModal.condition}
        initialExpandParts={detailModal.expandParts}
        preferredPriceSource={preferredPriceSource}
        collections={collections}
        activeCollectionId={activeCollectionId}
        onClose={handleCloseDetailSheet}
        onChangePreferredSource={(src) => void handleChangePreferredSource(src)}
        onUpdateCollectionItemMissingParts={handleUpdateCollectionItemMissingParts}
        onUpdateCollectionItemDetails={handleUpdateItemDetails}
        onAddNewToCollection={handleAddToCollectionFromAny}
      />

      {/* Ajustes, APIs en vivo, Modo Oscuro opcional y Backup JSON */}
      <SettingsSheet
        open={settingsOpen}
        settings={appSettings}
        themeMode={themeMode}
        onToggleTheme={() => void handleToggleTheme()}
        onClose={() => setSettingsOpen(false)}
        onSettingsChange={setAppSettings}
        onBackupRestored={handleBackupRestored}
      />
    </div>
  );
}

export default App;
