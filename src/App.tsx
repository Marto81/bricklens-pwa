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
  PreferredPriceSource
} from './types/minifig';
import { MINIFIG_CATALOG } from './data/catalogPresets';
import {
  bulkUpsertCollectionItems,
  calculateCollectionStats,
  db,
  ensureDemoCollectionSeeded,
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
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    void loadCollection();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadCollection = async () => {
    const items = await ensureDemoCollectionSeeded();
    setCollectionItems(items);
  };

  const portfolioStats = useMemo(
    () => calculateCollectionStats(collectionItems),
    [collectionItems]
  );

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
    purchasePriceEur: number
  ) => {
    const report = generatePriceComparisonReport(minifig, condition, preferredPriceSource);
    await upsertCollectionMinifig({
      minifig,
      condition,
      quantity,
      purchasePriceEur,
      estimatedUnitValueEur: report.estimatedMarketValueEur,
      notes: 'Añadida desde el escáner óptico'
    });
    setCollectionItems(await db.collectionItems.toArray());
  };

  const handleBulkAddToCollection = async (lines: BulkImportParsedLine[]) => {
    if (lines.length === 0) return;
    const updated = await bulkUpsertCollectionItems(lines);
    setCollectionItems(updated);
  };

  const handleAddToCollectionFromComparator = async (params: {
    minifig: MinifigureMetadata;
    condition: MinifigCondition;
    quantity: number;
    purchasePriceEur: number;
    estimatedUnitValueEur: number;
    notes?: string;
  }) => {
    await upsertCollectionMinifig(params);
    setCollectionItems(await db.collectionItems.toArray());
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
    setCollectionItems(await db.collectionItems.toArray());
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
    setCollectionItems(await db.collectionItems.toArray());
  };

  const handleUpdateItemDetails = async (
    itemId: string,
    purchasePriceEur: number,
    notes: string
  ) => {
    await db.collectionItems.update(itemId, {
      purchasePriceEur,
      missingPartsNotes: notes || undefined
    });
    setCollectionItems(await db.collectionItems.toArray());
  };

  const handleRemoveItem = async (itemId: string) => {
    await db.collectionItems.delete(itemId);
    setCollectionItems(await db.collectionItems.toArray());
  };

  const handleResetDemoData = async () => {
    await db.collectionItems.clear();
    const seeded = await ensureDemoCollectionSeeded();
    setCollectionItems(seeded);
  };

  const handleRefreshValuations = async (sourceOverride?: PreferredPriceSource) => {
    const activeSource = sourceOverride ?? preferredPriceSource;
    const current = await db.collectionItems.toArray();
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
    setCollectionItems(updated);
  };

  const handleChangePreferredSource = async (nextSource: PreferredPriceSource) => {
    setPreferredPriceSource(nextSource);
    await handleRefreshValuations(nextSource);
  };

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
            <span className="app-subtitle">Escáner y Tasación LEGO</span>
          </div>
        </div>

        <div className="header-controls">
          <button
            type="button"
            id="header-portfolio-pill"
            className="portfolio-live-pill"
            onClick={() => setActiveTab('collection')}
            title="Ir a Mi Colección"
          >
            <span className="pill-caption">Colección ({portfolioStats.totalUnits})</span>
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
            onChangePreferredSource={(src) => void handleChangePreferredSource(src)}
            onChangeMinifig={setSelectedMinifig}
            onChangeCondition={setSelectedCondition}
            onAddToCollection={handleAddToCollectionFromComparator}
          />
        )}

        {activeTab === 'collection' && (
          <CollectionDashboard
            items={collectionItems}
            preferredPriceSource={preferredPriceSource}
            onUpdateQuantity={handleUpdateQuantity}
            onUpdateCondition={handleUpdateCondition}
            onUpdateItemDetails={handleUpdateItemDetails}
            onRemoveItem={handleRemoveItem}
            onInspectInComparator={handleSelectForComparison}
            onResetDemoData={handleResetDemoData}
            onRefreshValuations={() => void handleRefreshValuations()}
            onBulkImportLines={handleBulkAddToCollection}
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
          <span>Colección</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
