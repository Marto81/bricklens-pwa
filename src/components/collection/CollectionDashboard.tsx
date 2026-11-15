import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Code,
  Copy,
  Download,
  FileCode2,
  FileSpreadsheet,
  FolderPlus,
  Layers,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  TrendingUp,
  Upload,
  X
} from 'lucide-react';
import type {
  BulkImportParsedLine,
  CollectionItem,
  MinifigCondition,
  MinifigureMetadata,
  PortfolioTimeRange,
  PreferredPriceSource,
  UserCollection
} from '../../types/minifig';
import {
  createCustomMinifigMetadata,
  findMinifigById,
  guessThemeFromFigId
} from '../../data/catalogPresets';
import {
  calculateCollectionStats,
  exportCollectionToBrickLinkXml,
  exportCollectionToBsx,
  exportCollectionToCsv,
  getPortfolioHistorySeries,
  importCollectionFromText
} from '../../db/collectionDb';

type SortOption = 'value_desc' | 'profit_desc' | 'recent' | 'name_asc';

const SERIES_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];
const COMMON_THEMES = [
  'Star Wars',
  'Marvel / DC Super Heroes',
  'Harry Potter',
  'Ninjago',
  'Collectible Minifigures',
  'Classic Space',
  'Castle',
  'City',
  'Lord of the Rings',
  'LEGO System'
];

interface CollectionDashboardProps {
  collections: UserCollection[];
  activeCollection: UserCollection | null;
  allItems: CollectionItem[];
  items: CollectionItem[];
  preferredPriceSource: PreferredPriceSource;
  onSelectCollection: (id: string) => void;
  onCreateCollection: (name: string) => Promise<UserCollection>;
  onRenameCollection: (id: string, name: string) => void;
  onDeleteCollection: (id: string) => void;
  onRestoreDemoCollection: () => void;
  onGoToScanner: () => void;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onUpdateCondition: (itemId: string, newCondition: MinifigCondition) => void;
  onUpdateItemDetails: (
    itemId: string,
    purchasePriceEur: number,
    marketValueEur: number,
    notes: string
  ) => void;
  onRemoveItem: (itemId: string) => void;
  onInspectInComparator: (minifig: MinifigureMetadata, condition: MinifigCondition) => void;
  onRefreshValuations: () => void;
  onBulkImportLines: (lines: BulkImportParsedLine[]) => void;
  onQuickAddManual: (
    minifig: MinifigureMetadata,
    condition: MinifigCondition,
    quantity: number,
    purchasePriceEur: number,
    estimatedUnitValueEur: number,
    notes?: string
  ) => void;
}

export const CollectionDashboard: React.FC<CollectionDashboardProps> = ({
  collections,
  activeCollection,
  allItems,
  items,
  preferredPriceSource,
  onSelectCollection,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onRestoreDemoCollection,
  onGoToScanner,
  onUpdateQuantity,
  onUpdateCondition,
  onUpdateItemDetails,
  onRemoveItem,
  onInspectInComparator,
  onRefreshValuations,
  onBulkImportLines,
  onQuickAddManual
}) => {
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  // Estado de gestión de colecciones
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [zeroCollectionName, setZeroCollectionName] = useState('Mi Colección');
  const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Filtros y exportación
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('value_desc');
  const [timeRange, setTimeRange] = useState<PortfolioTimeRange>('1M');
  const [exportFormat, setExportFormat] = useState<'csv' | 'xml' | 'bsx' | null>(null);
  const [copiedFeedback, setCopiedFeedback] = useState(false);

  // Alta manual de figura
  const [showManualAddPanel, setShowManualAddPanel] = useState(false);
  const [manualFigId, setManualFigId] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualTheme, setManualTheme] = useState('LEGO System');
  const [manualCondition, setManualCondition] = useState<MinifigCondition>('used_complete');
  const [manualQty, setManualQty] = useState(1);
  const [manualPaid, setManualPaid] = useState('');
  const [manualMarket, setManualMarket] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualFeedback, setManualFeedback] = useState<string | null>(null);

  // Importador / Cotizador en lote
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  // Tarjeta Compartible de Cartera
  const [showShareCard, setShowShareCard] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Edición inline de ítem
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState<string>('');
  const [editMarketValue, setEditMarketValue] = useState<string>('');
  const [editNotesValue, setEditNotesValue] = useState<string>('');

  useEffect(() => {
    setSelectedTheme('ALL');
    setFilterQuery('');
    setEditingItemId(null);
    setConfirmDeleteId(null);
    setRenamingCollectionId(null);
    setExportFormat(null);
  }, [activeCollection?.id]);

  const unitCountsByCollection = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of allItems) {
      map.set(item.collectionId, (map.get(item.collectionId) ?? 0) + item.quantity);
    }
    return map;
  }, [allItems]);

  const stats = useMemo(() => calculateCollectionStats(items), [items]);

  const sparklineSeries = useMemo(
    () => getPortfolioHistorySeries(items, timeRange),
    [items, timeRange]
  );

  const sparklineSvgData = useMemo(() => {
    const w = 320;
    const h = 52;
    const padY = 6;
    if (sparklineSeries.length < 2) {
      return { linePath: '', areaPath: '', deltaEur: 0, deltaPct: 0 };
    }
    const vals = sparklineSeries.map((p) => p.valueEur);
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    const span = Math.max(0.5, maxVal - minVal);

    const coords = sparklineSeries.map((pt, idx) => {
      const x = (idx / (sparklineSeries.length - 1)) * w;
      const y = h - padY - ((pt.valueEur - minVal) / span) * (h - padY * 2);
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    });

    const linePath = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x},${c.y}`)
      .join(' ');
    const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
    const firstVal = sparklineSeries[0].valueEur;
    const lastVal = sparklineSeries[sparklineSeries.length - 1].valueEur;
    const deltaEur = Math.round((lastVal - firstVal) * 100) / 100;
    const deltaPct = firstVal > 0 ? Math.round((deltaEur / firstVal) * 1000) / 10 : 0;

    return { linePath, areaPath, deltaEur, deltaPct };
  }, [sparklineSeries]);

  const parsedImport = useMemo(
    () => importCollectionFromText(importText, 'auto', preferredPriceSource),
    [importText, preferredPriceSource]
  );

  const importTotalUnits = useMemo(
    () => parsedImport.items.reduce((sum, l) => sum + l.quantity, 0),
    [parsedImport]
  );

  const importTotalValueEur = useMemo(
    () =>
      Math.round(
        parsedImport.items.reduce(
          (sum, l) => sum + l.quantity * l.estimatedUnitValueEur,
          0
        ) * 100
      ) / 100,
    [parsedImport]
  );

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      if (selectedTheme !== 'ALL' && item.minifig.theme !== selectedTheme) {
        return false;
      }
      if (!filterQuery.trim()) return true;
      const q = filterQuery.toLowerCase();
      return (
        item.minifig.figId.toLowerCase().includes(q) ||
        item.minifig.name.toLowerCase().includes(q) ||
        item.minifig.theme.toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'value_desc') {
        return b.quantity * b.estimatedUnitValueEur - a.quantity * a.estimatedUnitValueEur;
      }
      if (sortBy === 'profit_desc') {
        const profA = a.quantity * (a.estimatedUnitValueEur - a.purchasePriceEur);
        const profB = b.quantity * (b.estimatedUnitValueEur - b.purchasePriceEur);
        return profB - profA;
      }
      if (sortBy === 'name_asc') {
        return a.minifig.name.localeCompare(b.minifig.name);
      }
      return b.addedAtIso.localeCompare(a.addedAtIso);
    });
  }, [items, filterQuery, selectedTheme, sortBy]);

  const exportContent = useMemo(() => {
    if (exportFormat === 'csv') return exportCollectionToCsv(items);
    if (exportFormat === 'xml') return exportCollectionToBrickLinkXml(items);
    if (exportFormat === 'bsx') return exportCollectionToBsx(items);
    return '';
  }, [exportFormat, items]);

  const handleDownloadExport = (format: 'csv' | 'xml' | 'bsx') => {
    const content =
      format === 'csv'
        ? exportCollectionToCsv(items)
        : format === 'xml'
        ? exportCollectionToBrickLinkXml(items)
        : exportCollectionToBsx(items);
    const mime =
      format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/xml;charset=utf-8;';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const slug = (activeCollection?.name || 'coleccion')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const a = document.createElement('a');
    a.href = url;
    a.download = `bricklens_${slug || 'coleccion'}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyExport = async () => {
    if (!exportContent) return;
    await navigator.clipboard.writeText(exportContent);
    setCopiedFeedback(true);
    setTimeout(() => setCopiedFeedback(false), 2000);
  };

  const handleUploadImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setImportText(text);
    setShowImportPanel(true);
    e.target.value = '';
  };

  const handleCommitImport = () => {
    if (parsedImport.items.length === 0) return;
    onBulkImportLines(parsedImport.items);
    setImportFeedback(
      `${importTotalUnits} uds. importadas (${importTotalValueEur.toFixed(2)} €)`
    );
    setImportText('');
    window.setTimeout(() => setImportFeedback(null), 3000);
  };

  const handleCopyShareSummary = async () => {
    const topStr = stats.topGrailItem
      ? `${stats.topGrailItem.minifig.figId.toUpperCase()} (${stats.topGrailItem.estimatedUnitValueEur.toFixed(2)} €)`
      : '—';
    const colTitle = activeCollection?.name || 'Mi Colección';
    const summary = `BrickLens · ${colTitle}\n${stats.totalUnits} minifiguras (${stats.totalUniqueFigs} refs)\nValor Total: ${stats.totalMarketValueEur.toFixed(2)} € · Invertido: ${stats.totalInvestedEur.toFixed(2)} €\nPlusvalía: ${stats.netProfitEur >= 0 ? '+' : ''}${stats.netProfitEur.toFixed(2)} € (${stats.roiPercentage.toFixed(1)}% ROI)\nPieza Estrella: ${topStr}`;
    await navigator.clipboard.writeText(summary);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 2000);
  };

  const handleCreateCollectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;
    await onCreateCollection(trimmed);
    setNewCollectionName('');
    setShowCreateCollection(false);
  };

  const handleRenameSubmit = (e: React.FormEvent, collectionId: string) => {
    e.preventDefault();
    const trimmed = renameValue.trim();
    if (trimmed) {
      onRenameCollection(collectionId, trimmed);
    }
    setRenamingCollectionId(null);
  };

  const handleManualFigCodeChange = (raw: string) => {
    setManualFigId(raw);
    const trimmed = raw.trim();
    if (!trimmed) return;
    const catalogHit = findMinifigById(trimmed);
    if (catalogHit) {
      if (!manualName.trim()) setManualName(catalogHit.name);
      setManualTheme(catalogHit.theme);
      if (!manualMarket.trim()) {
        setManualMarket(catalogHit.baseMarketPriceEur[manualCondition].toFixed(2));
      }
    } else {
      setManualTheme(guessThemeFromFigId(trimmed));
    }
  };

  const handleManualAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode =
      manualFigId.trim().toLowerCase() ||
      `custom-${Date.now().toString(36).slice(-5)}`;
    const parsedMarket = Math.max(0.5, Number(manualMarket.replace(',', '.')) || 9.5);
    const parsedPaid =
      manualPaid.trim() !== ''
        ? Math.max(0, Number(manualPaid.replace(',', '.')) || 0)
        : Math.round(parsedMarket * 0.8 * 100) / 100;

    const catalogHit = findMinifigById(cleanCode);
    const baseMeta =
      catalogHit ??
      createCustomMinifigMetadata({
        figId: cleanCode,
        name: manualName.trim() || `Minifigura ${cleanCode.toUpperCase()}`,
        theme: manualTheme.trim() || guessThemeFromFigId(cleanCode),
        usedEur:
          manualCondition === 'new'
            ? parsedMarket / 1.4
            : manualCondition === 'used_incomplete'
            ? parsedMarket / 0.56
            : parsedMarket,
        notes: manualNotes.trim() || 'Añadida manualmente'
      });

    const finalMeta: MinifigureMetadata = {
      ...baseMeta,
      name: manualName.trim() || baseMeta.name,
      theme: manualTheme.trim() || baseMeta.theme,
      baseMarketPriceEur: {
        ...baseMeta.baseMarketPriceEur,
        [manualCondition]: Math.round(parsedMarket * 100) / 100
      },
      isEstimatedFallbackPrice: !manualMarket.trim() && !catalogHit
    };

    onQuickAddManual(
      finalMeta,
      manualCondition,
      Math.max(1, manualQty),
      Math.round(parsedPaid * 100) / 100,
      Math.round(parsedMarket * 100) / 100,
      manualNotes.trim() || undefined
    );

    setManualFigId('');
    setManualName('');
    setManualPaid('');
    setManualMarket('');
    setManualNotes('');
    setManualQty(1);
    setManualFeedback(`${finalMeta.figId.toUpperCase()} añadida a «${activeCollection?.name || 'tu colección'}»`);
    window.setTimeout(() => setManualFeedback(null), 2600);
  };

  const startEditingItem = (item: CollectionItem) => {
    if (editingItemId === item.id) {
      setEditingItemId(null);
      return;
    }
    setEditingItemId(item.id);
    setEditPriceValue(item.purchasePriceEur.toFixed(2));
    setEditMarketValue(item.estimatedUnitValueEur.toFixed(2));
    setEditNotesValue(item.missingPartsNotes || '');
  };

  const saveEditedItem = (itemId: string) => {
    const parsedPaid = Math.max(0, Number(editPriceValue.replace(',', '.')) || 0);
    const parsedMarket = Math.max(0.5, Number(editMarketValue.replace(',', '.')) || 0.5);
    onUpdateItemDetails(
      itemId,
      Math.round(parsedPaid * 100) / 100,
      Math.round(parsedMarket * 100) / 100,
      editNotesValue.trim()
    );
    setEditingItemId(null);
  };

  return (
    <section className="screen-stack" aria-label="Mis Colecciones y Valoración de Cartera">
      {/* GESTOR MULTI-COLECCIÓN (Pills + Crear / Renombrar / Borrar) */}
      <div className="surface-card" id="collections-manager-card">
        <div className="section-header-line" style={{ marginBottom: 8 }}>
          <div>
            <span className="eyebrow">Mis Colecciones ({collections.length})</span>
          </div>
          <button
            type="button"
            id="btn-new-collection"
            className={`btn-chip ${showCreateCollection ? 'active' : ''}`}
            onClick={() => setShowCreateCollection((v) => !v)}
          >
            <FolderPlus size={13} />
            <span>Nueva</span>
          </button>
        </div>

        {collections.length > 0 && (
          <div className="collection-switcher-bar" role="tablist" aria-label="Seleccionar colección">
            {collections.map((col) => {
              const isActive = col.id === activeCollection?.id;
              const unitCount = unitCountsByCollection.get(col.id) ?? 0;
              return (
                <button
                  key={col.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  id={`collection-pill-${col.id}`}
                  className={`collection-pill ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectCollection(col.id)}
                >
                  <span className="collection-pill-name">{col.name}</span>
                  {col.isDemo && <span className="demo-tag-mini">Prueba</span>}
                  <span className="collection-pill-count mono">{unitCount}</span>
                </button>
              );
            })}
          </div>
        )}

        {showCreateCollection && (
          <form
            className="inline-create-bar"
            style={{ marginTop: 10 }}
            onSubmit={(e) => void handleCreateCollectionSubmit(e)}
          >
            <input
              type="text"
              id="new-collection-name-input"
              className="field-input"
              placeholder="Ej: Star Wars, Vitrina, Repes..."
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              id="btn-confirm-create-collection"
              className="btn-chip active"
            >
              Crear
            </button>
            <button
              type="button"
              className="btn-chip"
              onClick={() => setShowCreateCollection(false)}
              aria-label="Cancelar"
            >
              <X size={13} />
            </button>
          </form>
        )}

        {activeCollection && (
          <div className="active-collection-bar">
            {renamingCollectionId === activeCollection.id ? (
              <form
                className="inline-create-bar"
                style={{ width: '100%' }}
                onSubmit={(e) => handleRenameSubmit(e, activeCollection.id)}
              >
                <input
                  type="text"
                  id="rename-collection-input"
                  className="field-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn-chip active">
                  Guardar
                </button>
                <button
                  type="button"
                  className="btn-chip"
                  onClick={() => setRenamingCollectionId(null)}
                >
                  <X size={13} />
                </button>
              </form>
            ) : (
              <>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: '0.84rem' }}>{activeCollection.name}</strong>
                  {activeCollection.isDemo && (
                    <span className="section-hint" style={{ display: 'block', fontSize: '0.7rem' }}>
                      Colección de prueba inicial — puedes borrarla cuando quieras.
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    id="btn-rename-active-collection"
                    className="btn-chip"
                    onClick={() => {
                      setRenamingCollectionId(activeCollection.id);
                      setRenameValue(activeCollection.name);
                      setConfirmDeleteId(null);
                    }}
                    title="Renombrar colección"
                  >
                    <Pencil size={12} />
                    <span>Renombrar</span>
                  </button>
                  <button
                    type="button"
                    id="btn-delete-active-collection"
                    className="btn-chip danger"
                    onClick={() => setConfirmDeleteId(activeCollection.id)}
                    title="Borrar colección"
                  >
                    <Trash2 size={12} />
                    <span>Borrar</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {activeCollection && confirmDeleteId === activeCollection.id && (
          <div className="confirm-delete-bar" id="confirm-delete-collection-bar">
            <span className="section-hint">
              ¿Eliminar «{activeCollection.name}» ({items.length} refs)? No se volverá a crear sola.
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn-chip"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                id="btn-confirm-delete-collection"
                className="btn-chip danger active"
                onClick={() => {
                  onDeleteCollection(activeCollection.id);
                  setConfirmDeleteId(null);
                }}
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ESTADO SIN COLECCIONES (tras borrar la colección de prueba u otras) */}
      {!activeCollection ? (
        <div className="surface-card zero-collections-card" id="zero-collections-card">
          <div className="scanner-empty-icon">
            <Layers size={24} />
          </div>
          <h2 className="fig-title-lg" style={{ textAlign: 'center' }}>
            Crea tu primera colección
          </h2>
          <p className="section-hint" style={{ textAlign: 'center', maxWidth: 340 }}>
            Organiza tus minifiguras por vitrina, temática o lote con valoración automática en euros.
          </p>

          <form
            className="inline-create-bar"
            style={{ width: '100%', maxWidth: 360 }}
            onSubmit={async (e) => {
              e.preventDefault();
              await onCreateCollection(zeroCollectionName.trim() || 'Mi Colección');
            }}
          >
            <input
              type="text"
              id="zero-collection-name-input"
              className="field-input"
              placeholder="Ej: Mi Colección"
              value={zeroCollectionName}
              onChange={(e) => setZeroCollectionName(e.target.value)}
            />
            <button type="submit" id="btn-create-first-collection" className="btn-primary">
              <Plus size={15} />
              <span>Crear</span>
            </button>
          </form>

          <button
            type="button"
            id="btn-restore-demo-discreet"
            className="link-btn-mini"
            onClick={onRestoreDemoCollection}
          >
            Restaurar colección de prueba
          </button>
        </div>
      ) : (
        <>
          {/* Cabecera Editorial de Valor Total de Cartera + Sparkline */}
          <div className="surface-card">
            <div className="portfolio-hero-top">
              <div>
                <span className="eyebrow">Valor de · {activeCollection.name}</span>
                <div className="portfolio-total-num mono" id="collection-total-value">
                  {stats.totalMarketValueEur.toFixed(2)} €
                </div>
                <span
                  className={`roi-pill ${stats.netProfitEur >= 0 ? 'positive' : 'negative'}`}
                  id="collection-roi-badge"
                >
                  <TrendingUp size={12} />
                  {stats.netProfitEur >= 0 ? '+' : ''}
                  {stats.netProfitEur.toFixed(2)} € ({stats.roiPercentage >= 0 ? '+' : ''}
                  {stats.roiPercentage.toFixed(1)}% ROI)
                </span>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  id="btn-toggle-share-card"
                  className="icon-btn"
                  title="Tarjeta compartible"
                  onClick={() => setShowShareCard((v) => !v)}
                >
                  <Share2 size={15} />
                </button>
                <button
                  type="button"
                  id="btn-refresh-valuations"
                  className="icon-btn"
                  title="Recalcular cotizaciones"
                  onClick={onRefreshValuations}
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            </div>

            {/* Gráfica Sparkline Minimalista (1D · 1S · 1M · 1A) */}
            {items.length > 0 && (
              <div className="sparkline-box" id="portfolio-sparkline-box">
                <div className="sparkline-top">
                  <span className="section-hint mono">
                    {sparklineSvgData.deltaEur >= 0 ? '+' : ''}
                    {sparklineSvgData.deltaEur.toFixed(2)} € (
                    {sparklineSvgData.deltaPct >= 0 ? '+' : ''}
                    {sparklineSvgData.deltaPct.toFixed(1)}%)
                  </span>
                  <div className="range-pills-mini" role="group" aria-label="Periodo de evolución">
                    {(
                      [
                        { id: '1D', label: '1D' },
                        { id: '1W', label: '1S' },
                        { id: '1M', label: '1M' },
                        { id: '1Y', label: '1A' }
                      ] as const
                    ).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        id={`spark-range-${r.id}`}
                        className={timeRange === r.id ? 'active' : ''}
                        onClick={() => setTimeRange(r.id)}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
                {sparklineSvgData.linePath && (
                  <svg
                    className="sparkline-svg"
                    viewBox="0 0 320 52"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="bricklensSparkGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    <path d={sparklineSvgData.areaPath} fill="url(#bricklensSparkGrad)" />
                    <path
                      d={sparklineSvgData.linePath}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            )}

            {showShareCard && (
              <div className="share-card-panel" id="portfolio-share-card">
                <div className="section-header-line" style={{ marginBottom: 4 }}>
                  <span className="eyebrow">BrickLens · {activeCollection.name}</span>
                  <button
                    type="button"
                    id="btn-copy-share-card"
                    className="btn-chip active"
                    onClick={() => void handleCopyShareSummary()}
                  >
                    <Copy size={12} />
                    <span>{shareCopied ? 'Copiado' : 'Copiar resumen'}</span>
                  </button>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 8
                  }}
                >
                  <strong className="mono" style={{ fontSize: '1.25rem', color: 'var(--accent)' }}>
                    {stats.totalMarketValueEur.toFixed(2)} €
                  </strong>
                  <span className="mono" style={{ fontSize: '0.76rem', color: 'var(--positive)' }}>
                    {stats.roiPercentage >= 0 ? '+' : ''}
                    {stats.roiPercentage.toFixed(1)}% ROI
                  </span>
                </div>
                <div className="share-card-grid">
                  <div>
                    <span className="p-stat-label">Minifiguras</span>
                    <strong className="mono" style={{ fontSize: '0.82rem' }}>
                      {stats.totalUnits} uds.
                    </strong>
                  </div>
                  <div>
                    <span className="p-stat-label">Invertido</span>
                    <strong className="mono" style={{ fontSize: '0.82rem' }}>
                      {stats.totalInvestedEur.toFixed(2)} €
                    </strong>
                  </div>
                  <div>
                    <span className="p-stat-label">Grial Top</span>
                    <strong className="mono" style={{ fontSize: '0.82rem' }}>
                      {stats.topGrailItem
                        ? stats.topGrailItem.minifig.figId.toUpperCase()
                        : '—'}
                    </strong>
                  </div>
                </div>
                <p className="section-hint">
                  Top temáticas:{' '}
                  {stats.byTheme
                    .slice(0, 3)
                    .map((t) => `${t.theme} (${t.sharePercentage}%)`)
                    .join(' · ') || '—'}
                </p>
              </div>
            )}

            <div className="portfolio-inline-stats">
              <div className="inline-stat-cell">
                <span>Invertido</span>
                <strong className="mono">{stats.totalInvestedEur.toFixed(2)} €</strong>
              </div>
              <div className="inline-stat-cell">
                <span>Minifiguras</span>
                <strong className="mono">
                  {stats.totalUnits} uds. ({stats.totalUniqueFigs})
                </strong>
              </div>
              <div className="inline-stat-cell">
                <span>Pieza Estrella</span>
                <strong className="mono">
                  {stats.topGrailItem
                    ? `${stats.topGrailItem.minifig.figId.toUpperCase()} · ${stats.topGrailItem.estimatedUnitValueEur.toFixed(0)}€`
                    : '—'}
                </strong>
              </div>
            </div>

            {/* Barra de Proporción por Temática + Filtros Interactivos */}
            {stats.byTheme.length > 0 && (
              <div style={{ paddingTop: 10 }}>
                <span className="eyebrow">Peso por temática LEGO</span>
                <div className="stacked-bar-track" aria-hidden="true">
                  {stats.byTheme.map((t, i) => (
                    <div
                      key={t.theme}
                      className="stacked-bar-seg"
                      style={{
                        width: `${Math.max(4, t.sharePercentage)}%`,
                        backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length]
                      }}
                    />
                  ))}
                </div>

                <div className="theme-legend-row">
                  <button
                    type="button"
                    id="filter-theme-ALL"
                    className={`theme-legend-btn ${selectedTheme === 'ALL' ? 'active' : ''}`}
                    onClick={() => setSelectedTheme('ALL')}
                  >
                    <span>Todas ({stats.totalUnits})</span>
                  </button>
                  {stats.byTheme.map((t, i) => (
                    <button
                      key={t.theme}
                      type="button"
                      id={`filter-theme-${t.theme.replace(/\s+/g, '-')}`}
                      className={`theme-legend-btn ${selectedTheme === t.theme ? 'active' : ''}`}
                      onClick={() => setSelectedTheme(t.theme)}
                    >
                      <span
                        className="legend-dot"
                        style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
                      />
                      <span>{t.theme}</span>
                      <span className="mono">{t.sharePercentage}%</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Buscador, Alta Manual, Importación y Exportación */}
          <div className="surface-card">
            <div className="toolbar-row">
              <div className="search-bar-wrap" style={{ flex: 1 }}>
                <Search size={15} className="search-bar-icon" />
                <input
                  type="search"
                  id="collection-filter-input"
                  className="search-input"
                  placeholder="Buscar en esta colección..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                />
              </div>

              <select
                aria-label="Ordenar colección"
                className="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
              >
                <option value="value_desc">Mayor Valor</option>
                <option value="profit_desc">Mayor Plusvalía</option>
                <option value="recent">Más Reciente</option>
                <option value="name_asc">Nombre A-Z</option>
              </select>
            </div>

            <div className="export-actions-bar">
              <button
                type="button"
                id="btn-toggle-manual-add"
                className={`btn-chip ${showManualAddPanel ? 'active' : ''}`}
                onClick={() => setShowManualAddPanel((v) => !v)}
              >
                <Plus size={14} />
                <span>Añadir figura</span>
              </button>

              <button
                type="button"
                id="btn-toggle-bulk-import"
                className={`btn-chip ${showImportPanel ? 'active' : ''}`}
                onClick={() => setShowImportPanel((v) => !v)}
              >
                <Upload size={14} />
                <span>Importar</span>
              </button>

              <button
                type="button"
                id="btn-export-csv"
                className={`btn-chip ${exportFormat === 'csv' ? 'active' : ''}`}
                onClick={() => setExportFormat(exportFormat === 'csv' ? null : 'csv')}
              >
                <FileSpreadsheet size={14} />
                <span>CSV</span>
              </button>

              <button
                type="button"
                id="btn-export-xml"
                className={`btn-chip ${exportFormat === 'xml' ? 'active' : ''}`}
                onClick={() => setExportFormat(exportFormat === 'xml' ? null : 'xml')}
              >
                <Code size={14} />
                <span>XML</span>
              </button>

              <button
                type="button"
                id="btn-export-bsx"
                className={`btn-chip ${exportFormat === 'bsx' ? 'active' : ''}`}
                onClick={() => setExportFormat(exportFormat === 'bsx' ? null : 'bsx')}
              >
                <FileCode2 size={14} />
                <span>.BSX</span>
              </button>
            </div>

            {/* Cajón Alta Manual de Minifigura */}
            {showManualAddPanel && (
              <form
                className="export-drawer manual-add-panel"
                id="manual-add-drawer"
                onSubmit={handleManualAddSubmit}
              >
                <div className="section-header-line" style={{ marginBottom: 6 }}>
                  <strong style={{ fontSize: '0.8rem' }}>
                    Añadir minifigura a «{activeCollection.name}»
                  </strong>
                  <button
                    type="button"
                    className="btn-chip"
                    onClick={() => setShowManualAddPanel(false)}
                    aria-label="Cerrar"
                  >
                    <X size={12} />
                  </button>
                </div>

                <div className="form-grid-2">
                  <div className="field-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="manual-figid-input">Código BrickLink (opc.)</label>
                    <input
                      id="manual-figid-input"
                      type="text"
                      className="field-input mono"
                      placeholder="Ej: sw0585, col448"
                      value={manualFigId}
                      onChange={(e) => handleManualFigCodeChange(e.target.value)}
                    />
                  </div>
                  <div className="field-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="manual-theme-input">Temática</label>
                    <input
                      id="manual-theme-input"
                      type="text"
                      list="bricklens-themes-list"
                      className="field-input"
                      value={manualTheme}
                      onChange={(e) => setManualTheme(e.target.value)}
                    />
                    <datalist id="bricklens-themes-list">
                      {COMMON_THEMES.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="field-group" style={{ marginTop: 8 }}>
                  <label htmlFor="manual-name-input">Nombre de la minifigura</label>
                  <input
                    id="manual-name-input"
                    type="text"
                    className="field-input"
                    placeholder="Ej: Luke Skywalker (Episodio IV)"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="field-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="manual-condition-select">Estado</label>
                    <select
                      id="manual-condition-select"
                      className="field-input"
                      value={manualCondition}
                      onChange={(e) =>
                        setManualCondition(e.target.value as MinifigCondition)
                      }
                    >
                      <option value="used_complete">Usada Completa</option>
                      <option value="new">Nueva / Sellada</option>
                      <option value="used_incomplete">Usada Incompleta</option>
                    </select>
                  </div>
                  <div className="field-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="manual-qty-input">Cantidad</label>
                    <input
                      id="manual-qty-input"
                      type="number"
                      min={1}
                      max={999}
                      className="field-input mono"
                      value={manualQty}
                      onChange={(e) =>
                        setManualQty(Math.max(1, Number(e.target.value) || 1))
                      }
                    />
                  </div>
                </div>

                <div className="form-grid-2" style={{ marginTop: 8 }}>
                  <div className="field-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="manual-paid-input">Pagado / ud. (€)</label>
                    <input
                      id="manual-paid-input"
                      type="number"
                      step="0.01"
                      min={0}
                      className="field-input mono"
                      placeholder="0.00"
                      value={manualPaid}
                      onChange={(e) => setManualPaid(e.target.value)}
                    />
                  </div>
                  <div className="field-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="manual-market-input">Valor mercado / ud. (€)</label>
                    <input
                      id="manual-market-input"
                      type="number"
                      step="0.01"
                      min={0.5}
                      className="field-input mono"
                      placeholder="9.50"
                      value={manualMarket}
                      onChange={(e) => setManualMarket(e.target.value)}
                    />
                  </div>
                </div>

                <div className="field-group" style={{ marginTop: 8 }}>
                  <label htmlFor="manual-notes-input">Notas (opcional)</label>
                  <input
                    id="manual-notes-input"
                    type="text"
                    className="field-input"
                    placeholder="Ej: Con accesorio original..."
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                  />
                </div>

                {manualFeedback && (
                  <div className="feedback-banner" role="status" style={{ marginBottom: 8 }}>
                    <Check size={14} />
                    <span>{manualFeedback}</span>
                  </div>
                )}

                <button type="submit" id="btn-submit-manual-fig" className="btn-primary btn-full">
                  <Plus size={15} />
                  <span>Guardar en colección</span>
                </button>
              </form>
            )}

            {/* Cajón Importar / Cotizar Lote (CSV, XML, .bsx o lista de códigos) */}
            {showImportPanel && (
              <div className="export-drawer" id="bulk-import-drawer">
                <div className="section-header-line" style={{ marginBottom: 6 }}>
                  <div>
                    <strong style={{ fontSize: '0.78rem' }}>
                      Importar o Cotizar en Lote
                    </strong>
                    <p className="section-hint">
                      Pega códigos (<span className="mono">sw0002, sw0585 x3, sh0232 new</span>) o sube BrickLink XML / BrickStore .bsx / CSV.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-chip"
                    onClick={() => importFileInputRef.current?.click()}
                  >
                    <Upload size={12} />
                    <span>Subir Archivo</span>
                  </button>
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept=".csv,.xml,.bsx,.txt"
                    className="sr-only"
                    onChange={(e) => void handleUploadImportFile(e)}
                  />
                </div>

                <textarea
                  id="bulk-import-textarea"
                  className="import-textarea"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Ej: sw0585 x3, sh0232 new, col448..."
                />

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginTop: 8
                  }}
                >
                  <span className="section-hint mono" id="bulk-import-preview-summary">
                    {parsedImport.items.length > 0
                      ? `Formato: ${parsedImport.detectedFormat.toUpperCase()} · ${importTotalUnits} uds. · ${importTotalValueEur.toFixed(2)} €`
                      : 'Pega tus referencias para previsualizar'}
                  </span>
                  <button
                    type="button"
                    id="btn-confirm-bulk-import"
                    className="btn-chip active"
                    disabled={parsedImport.items.length === 0}
                    onClick={handleCommitImport}
                  >
                    <Check size={13} />
                    <span>Importar a «{activeCollection.name}»</span>
                  </button>
                </div>

                {parsedImport.unknownTokens.length > 0 && (
                  <p className="section-hint" style={{ marginTop: 4, color: 'var(--negative)' }}>
                    No reconocidos: {parsedImport.unknownTokens.slice(0, 4).join(', ')}
                  </p>
                )}

                {importFeedback && (
                  <div className="feedback-banner" role="status">
                    <Check size={14} />
                    <span>{importFeedback}</span>
                  </div>
                )}
              </div>
            )}

            {exportFormat && (
              <div className="export-drawer" id="export-preview-panel">
                <div className="section-header-line" style={{ marginBottom: 4 }}>
                  <strong style={{ fontSize: '0.76rem' }}>
                    Exportación (
                    {exportFormat === 'csv'
                      ? 'CSV'
                      : exportFormat === 'xml'
                      ? 'BrickLink XML'
                      : 'BrickStore .BSX'}
                    )
                  </strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      id="btn-copy-export"
                      className="btn-chip"
                      onClick={handleCopyExport}
                    >
                      <Copy size={12} />
                      <span>{copiedFeedback ? 'Copiado' : 'Copiar'}</span>
                    </button>
                    <button
                      type="button"
                      id="btn-download-export"
                      className="btn-chip active"
                      onClick={() => handleDownloadExport(exportFormat)}
                    >
                      <Download size={12} />
                      <span>Descargar</span>
                    </button>
                  </div>
                </div>
                <pre className="export-pre mono">{exportContent}</pre>
              </div>
            )}
          </div>

          {/* Lista de Minifiguras de la Colección Activa */}
          {items.length === 0 ? (
            <div
              className="surface-card"
              id="empty-collection-card"
              style={{ textAlign: 'center', padding: '24px 16px' }}
            >
              <strong style={{ fontSize: '0.94rem', display: 'block', marginBottom: 4 }}>
                «{activeCollection.name}» está vacía
              </strong>
              <p className="section-hint" style={{ marginBottom: 14 }}>
                Escanea tus minifiguras con la cámara o añádelas manualmente con su código.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                <button type="button" className="btn-primary" onClick={onGoToScanner}>
                  <Camera size={15} />
                  <span>Escanear minifigura</span>
                </button>
                <button
                  type="button"
                  className="btn-tonal"
                  onClick={() => setShowManualAddPanel(true)}
                >
                  <Plus size={15} />
                  <span>Añadir figura manual</span>
                </button>
              </div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="surface-card" style={{ textAlign: 'center', padding: '24px 16px' }}>
              <p className="section-hint" style={{ marginBottom: 12 }}>
                No hay minifiguras que coincidan con el filtro actual.
              </p>
              <button
                type="button"
                className="btn-tonal"
                onClick={() => {
                  setFilterQuery('');
                  setSelectedTheme('ALL');
                }}
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="collection-items-list" role="list">
              {filteredItems.map((item) => {
                const lineTotalEur = item.quantity * item.estimatedUnitValueEur;
                const lineCostEur = item.quantity * item.purchasePriceEur;
                const lineProfitEur = lineTotalEur - lineCostEur;
                const isEditing = editingItemId === item.id;

                return (
                  <article
                    key={item.id}
                    id={`collection-card-${item.minifig.figId}-${item.condition}`}
                    className="collection-row-card"
                  >
                    <div className="c-item-top">
                      <img
                        src={item.minifig.imageUrl}
                        alt={item.minifig.name}
                        className="c-item-thumb"
                      />
                      <div className="c-item-body">
                        <div className="fig-meta-line" style={{ marginTop: 0 }}>
                          <span className="code-chip">{item.minifig.figId.toUpperCase()}</span>
                          <span>{item.minifig.theme}</span>
                        </div>
                        <h3 className="c-item-title">{item.minifig.name}</h3>
                        {item.missingPartsNotes && (
                          <p className="section-hint" style={{ marginTop: 2 }}>
                            {item.missingPartsNotes}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="c-item-metrics">
                      <div>
                        <span className="p-stat-label">Valor Ud.</span>
                        <strong className="mono">{item.estimatedUnitValueEur.toFixed(2)} €</strong>
                      </div>
                      <div>
                        <span className="p-stat-label">Pagado Ud.</span>
                        <strong className="mono">{item.purchasePriceEur.toFixed(2)} €</strong>
                      </div>
                      <div>
                        <span className="p-stat-label">Total</span>
                        <strong className="mono" style={{ color: 'var(--accent)' }}>
                          {lineTotalEur.toFixed(2)} €
                        </strong>
                      </div>
                      <div>
                        <span className="p-stat-label">Plusvalía</span>
                        <strong
                          className="mono"
                          style={{
                            color: lineProfitEur >= 0 ? 'var(--positive)' : 'var(--negative)'
                          }}
                        >
                          {lineProfitEur >= 0 ? '+' : ''}
                          {lineProfitEur.toFixed(2)} €
                        </strong>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="inline-edit-box">
                        <div className="form-grid-2" style={{ marginBottom: 0 }}>
                          <div className="field-group" style={{ marginBottom: 0 }}>
                            <label>Valor mercado / ud. (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              min={0.5}
                              className="field-input mono"
                              value={editMarketValue}
                              onChange={(e) => setEditMarketValue(e.target.value)}
                            />
                          </div>
                          <div className="field-group" style={{ marginBottom: 0 }}>
                            <label>Precio pagado / ud. (€)</label>
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              className="field-input mono"
                              value={editPriceValue}
                              onChange={(e) => setEditPriceValue(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="field-group" style={{ marginBottom: 0 }}>
                          <label>Notas</label>
                          <input
                            type="text"
                            className="field-input"
                            value={editNotesValue}
                            onChange={(e) => setEditNotesValue(e.target.value)}
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                          <button
                            type="button"
                            className="btn-chip"
                            onClick={() => setEditingItemId(null)}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className="btn-chip active"
                            onClick={() => saveEditedItem(item.id)}
                          >
                            <Check size={13} />
                            <span>Guardar cambios</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="c-item-footer">
                      <select
                        aria-label={`Estado de ${item.minifig.name}`}
                        className="sort-select"
                        style={{ padding: '5px 8px', fontSize: '0.74rem' }}
                        value={item.condition}
                        onChange={(e) =>
                          onUpdateCondition(item.id, e.target.value as MinifigCondition)
                        }
                      >
                        <option value="new">Nueva / Sellada</option>
                        <option value="used_complete">Usada Completa</option>
                        <option value="used_incomplete">Usada Incompleta</option>
                      </select>

                      <div className="qty-stepper" aria-label="Control de cantidad">
                        <button
                          type="button"
                          id={`qty-dec-${item.minifig.figId}`}
                          className="stepper-btn"
                          onClick={() => onUpdateQuantity(item.id, -1)}
                          aria-label="Reducir cantidad"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="qty-val">{item.quantity}</span>
                        <button
                          type="button"
                          id={`qty-inc-${item.minifig.figId}`}
                          className="stepper-btn"
                          onClick={() => onUpdateQuantity(item.id, 1)}
                          aria-label="Aumentar cantidad"
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className="btn-chip"
                          title="Editar valoración, precio o notas"
                          onClick={() => startEditingItem(item)}
                        >
                          <Pencil size={12} />
                        </button>

                        <button
                          type="button"
                          className="btn-chip"
                          onClick={() => onInspectInComparator(item.minifig, item.condition)}
                        >
                          5 Portales
                        </button>

                        <button
                          type="button"
                          id={`delete-item-${item.minifig.figId}`}
                          className="btn-chip"
                          title="Eliminar"
                          onClick={() => onRemoveItem(item.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
};
