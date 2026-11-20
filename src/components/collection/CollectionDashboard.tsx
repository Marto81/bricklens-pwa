import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import type {
  BulkImportParsedLine,
  CollectionItem,
  MinifigCondition,
  MinifigureMetadata,
  PreferredPriceSource,
  UserCollection
} from '../../types/minifig';
import {
  calculateCollectionStats,
  COLLECTION_DOT_COLORS,
  exportCollectionToBrickLinkXml,
  exportCollectionToBsx,
  exportCollectionToCsv,
  importCollectionFromText
} from '../../db/collectionDb';

interface CollectionDashboardProps {
  collections: UserCollection[];
  activeCollection: UserCollection | null;
  allItems: CollectionItem[];
  items: CollectionItem[];
  preferredPriceSource: PreferredPriceSource;
  initialModal?: 'none' | 'import' | 'export';
  onClearInitialModal?: () => void;
  onSelectCollection: (collectionId: string) => void;
  onCreateCollection: (name: string, color?: string) => Promise<UserCollection>;
  onRenameCollection: (collectionId: string, newName: string) => void;
  onDeleteCollection: (collectionId: string) => void;
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
  onOpenItemDetail: (item: CollectionItem, expandParts?: boolean) => void;
  onBulkImportLines: (lines: BulkImportParsedLine[]) => void;
  onQuickAddManual: (
    minifig: MinifigureMetadata,
    condition: MinifigCondition,
    quantity: number,
    purchasePriceEur: number,
    estimatedUnitValueEur: number,
    notes: string
  ) => void;
}

type SortKey = 'newest' | 'value_desc' | 'name_asc';

export const CollectionDashboard: React.FC<CollectionDashboardProps> = ({
  collections,
  activeCollection,
  allItems,
  initialModal = 'none',
  onClearInitialModal,
  onSelectCollection,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onGoToScanner,
  onUpdateQuantity,
  onUpdateCondition,
  onUpdateItemDetails,
  onRemoveItem,
  onOpenItemDetail,
  onBulkImportLines
}) => {
  const [viewingAll, setViewingAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('newest');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modales limpios idénticos al vídeo
  const [showNewColModal, setShowNewColModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColColor, setNewColColor] = useState<string>(COLLECTION_DOT_COLORS[0]);

  const [showColPickerSheet, setShowColPickerSheet] = useState(false);
  const [managingColId, setManagingColId] = useState<string | null>(null);
  const [renamingColId, setRenamingColId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteColId, setConfirmDeleteColId] = useState<string | null>(null);

  // Quick Edit modal al tocar una tarjeta (vídeo 00:51)
  const [quickEditItemId, setQuickEditItemId] = useState<string | null>(null);
  const [editCondition, setEditCondition] = useState<MinifigCondition>('used_complete');
  const [editPrice, setEditPrice] = useState('');
  const [editQty, setEditQty] = useState(1);
  const [editNotes, setEditNotes] = useState('');

  // Modales discretos de Importar y Exportar
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xml' | 'bsx'>('csv');
  const [copiedExport, setCopiedExport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialModal === 'import') {
      setShowImportModal(true);
      onClearInitialModal?.();
    } else if (initialModal === 'export') {
      setShowExportModal(true);
      onClearInitialModal?.();
    }
  }, [initialModal, onClearInitialModal]);

  const scopedItems = useMemo(() => {
    if (viewingAll || !activeCollection) return allItems;
    return allItems.filter((it) => it.collectionId === activeCollection.id);
  }, [viewingAll, activeCollection, allItems]);

  const stats = useMemo(() => calculateCollectionStats(scopedItems), [scopedItems]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = q
      ? scopedItems.filter(
          (it) =>
            it.minifig.name.toLowerCase().includes(q) ||
            it.minifig.figId.toLowerCase().includes(q) ||
            it.minifig.theme.toLowerCase().includes(q)
        )
      : [...scopedItems];

    if (sortBy === 'value_desc') {
      list.sort(
        (a, b) =>
          b.estimatedUnitValueEur * b.quantity - a.estimatedUnitValueEur * a.quantity
      );
    } else if (sortBy === 'name_asc') {
      list.sort((a, b) => a.minifig.name.localeCompare(b.minifig.name));
    } else {
      list.sort((a, b) => b.addedAtIso.localeCompare(a.addedAtIso));
    }
    return list;
  }, [scopedItems, searchTerm, sortBy]);

  const quickEditItem = useMemo(
    () => (quickEditItemId ? allItems.find((it) => it.id === quickEditItemId) ?? null : null),
    [allItems, quickEditItemId]
  );

  const openQuickEdit = (item: CollectionItem) => {
    if (selectMode) {
      setSelectedIds((prev) =>
        prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
      );
      return;
    }
    setQuickEditItemId(item.id);
    setEditCondition(item.condition);
    setEditPrice(item.estimatedUnitValueEur.toFixed(2));
    setEditQty(item.quantity);
    setEditNotes(item.missingPartsNotes ?? '');
  };

  const handleSaveQuickEdit = () => {
    if (!quickEditItem) return;
    const parsedPrice = Number(editPrice.replace(',', '.'));
    const safeMarket =
      Number.isFinite(parsedPrice) && parsedPrice > 0
        ? parsedPrice
        : quickEditItem.estimatedUnitValueEur;

    if (editCondition !== quickEditItem.condition) {
      onUpdateCondition(quickEditItem.id, editCondition);
    }
    const qtyDelta = editQty - quickEditItem.quantity;
    if (qtyDelta !== 0) {
      onUpdateQuantity(quickEditItem.id, qtyDelta);
    }
    onUpdateItemDetails(
      quickEditItem.id,
      quickEditItem.purchasePriceEur,
      safeMarket,
      editNotes.trim()
    );
    setQuickEditItemId(null);
  };

  const handleCreateColSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newColName.trim();
    if (!clean) return;
    await onCreateCollection(clean, newColColor);
    setViewingAll(false);
    setNewColName('');
    setShowNewColModal(false);
  };

  const handleDeleteSelectedBulk = () => {
    for (const id of selectedIds) {
      onRemoveItem(id);
    }
    setSelectedIds([]);
    setSelectMode(false);
  };

  const importPreview = useMemo(() => {
    if (!importText.trim()) return null;
    return importCollectionFromText(importText, 'auto');
  }, [importText]);

  const exportOutput = useMemo(() => {
    if (exportFormat === 'xml') return exportCollectionToBrickLinkXml(scopedItems);
    if (exportFormat === 'bsx') return exportCollectionToBsx(scopedItems);
    return exportCollectionToCsv(scopedItems);
  }, [exportFormat, scopedItems]);

  const handleDownloadExport = () => {
    const ext = exportFormat;
    const mime =
      exportFormat === 'csv' ? 'text/csv;charset=utf-8' : 'application/xml;charset=utf-8';
    const blob = new Blob([exportOutput], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bricklens-${(activeCollection?.name || 'coleccion').toLowerCase().replace(/\s+/g, '-')}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportOutput);
      setCopiedExport(true);
      setTimeout(() => setCopiedExport(false), 1600);
    } catch {
      // ignore
    }
  };

  const conditionLabel = (c: MinifigCondition) =>
    c === 'new' ? 'Nueva' : c === 'used_incomplete' ? 'Incompleta' : 'Usada';

  return (
    <div className="bm-screen" id="collection-grid-screen">
      {/* Cabecera estilo vídeo: €568.09 + 19 únicas · 24 total + botones Exportar / Importar */}
      <header className="bm-col-header">
        <div>
          <h1 className="bm-col-total" id="collection-total-value">
            €{stats.totalMarketValueEur.toFixed(2)}
          </h1>
          <span className="bm-col-subtitle">
            <strong>{stats.totalUniqueFigs}</strong> únicas · <strong>{stats.totalUnits}</strong>{' '}
            total
          </span>
        </div>

        <div className="bm-col-header-actions">
          <button
            type="button"
            id="btn-open-export-modal"
            className="bm-circle-soft"
            onClick={() => setShowExportModal(true)}
            aria-label="Exportar colección"
            title="Exportar CSV / XML / .bsx"
          >
            <Upload size={17} />
          </button>
          <button
            type="button"
            id="btn-open-import-modal"
            className="bm-circle-soft"
            onClick={() => setShowImportModal(true)}
            aria-label="Importar figuras"
            title="Importar CSV / XML / .bsx / lista"
          >
            <Download size={17} />
          </button>
        </div>
      </header>

      {/* Píldoras horizontales de colecciones con puntos de color (vídeo 01:41) */}
      <div className="bm-col-strip" id="collections-manager-card">
        <button
          type="button"
          id="collection-pill-all"
          className={`bm-col-tab ${viewingAll ? 'active' : ''}`}
          onClick={() => setViewingAll(true)}
        >
          Todas
        </button>

        {collections.map((col, idx) => {
          const isActive = !viewingAll && activeCollection?.id === col.id;
          const dotColor = col.color || COLLECTION_DOT_COLORS[idx % COLLECTION_DOT_COLORS.length];
          return (
            <button
              key={col.id}
              type="button"
              id={`collection-pill-${col.id}`}
              className={`bm-col-tab ${isActive ? 'active' : ''}`}
              onClick={() => {
                setViewingAll(false);
                onSelectCollection(col.id);
              }}
            >
              <span className="bm-color-dot sm" style={{ backgroundColor: dotColor }} />
              <span className="truncate">{col.name}</span>
            </button>
          );
        })}

        <button
          type="button"
          id="btn-new-collection"
          className="bm-col-tab ghost"
          onClick={() => {
            setNewColName('');
            setNewColColor(
              COLLECTION_DOT_COLORS[collections.length % COLLECTION_DOT_COLORS.length]
            );
            setShowNewColModal(true);
          }}
        >
          <Plus size={14} /> Nueva
        </button>

        <button
          type="button"
          id="btn-manage-collections"
          className="bm-col-tab ghost"
          onClick={() => setShowColPickerSheet(true)}
        >
          Gestionar <ChevronDown size={13} />
        </button>
      </div>

      {/* Buscador + Orden + Seleccionar */}
      <div className="bm-search-row">
        <div className="bm-search-input-wrap">
          <Search size={15} className="bm-search-icon" />
          <input
            id="collection-filter-input"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Buscar en ${viewingAll ? 'todas' : activeCollection?.name || 'colección'} (${scopedItems.length})`}
          />
          {searchTerm && (
            <button
              type="button"
              className="bm-clear-btn"
              onClick={() => setSearchTerm('')}
              aria-label="Limpiar"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          id="btn-col-sort"
          className="bm-icon-soft"
          onClick={() =>
            setSortBy((s) =>
              s === 'newest' ? 'value_desc' : s === 'value_desc' ? 'name_asc' : 'newest'
            )
          }
          title="Cambiar orden"
        >
          <SlidersHorizontal size={16} />
        </button>

        <button
          type="button"
          id="btn-col-select"
          className={`bm-pill-soft ${selectMode ? 'active' : ''}`}
          onClick={() => {
            setSelectMode((v) => !v);
            setSelectedIds([]);
          }}
        >
          {selectMode ? 'Listo' : 'Elegir'}
        </button>
      </div>

      {selectMode && selectedIds.length > 0 && (
        <div className="bm-bulk-select-bar">
          <span>{selectedIds.length} seleccionada(s)</span>
          <button
            type="button"
            className="bm-danger-pill"
            onClick={handleDeleteSelectedBulk}
          >
            <Trash2 size={14} /> Eliminar
          </button>
        </div>
      )}

      {/* Grid de 2 columnas estilo brick'em (o estado vacío limpio) */}
      {filteredItems.length === 0 ? (
        <div className="bm-empty-state" id="empty-collection-card">
          <div className="bm-empty-cube-art" aria-hidden="true">
            <span className="cube c1" />
            <span className="cube c2" />
            <span className="cube c3" />
          </div>
          <h3>
            {searchTerm
              ? 'Sin resultados'
              : `No hay figuras en ${viewingAll ? 'tus colecciones' : activeCollection?.name || 'esta pestaña'}`}
          </h3>
          <p>
            {searchTerm
              ? 'Prueba con otro nombre o código BrickLink.'
              : 'Escanea tus minifiguras con la cámara o impórtalas desde CSV/XML.'}
          </p>
          {!searchTerm && (
            <button
              type="button"
              id="btn-empty-start-scanning"
              className="bm-btn-primary"
              onClick={onGoToScanner}
            >
              <Camera size={16} /> Empezar a escanear
            </button>
          )}
        </div>
      ) : (
        <div className="bm-grid-2">
          {filteredItems.map((item) => {
            const lineTotalEur = item.estimatedUnitValueEur * item.quantity;
            const isSelected = selectedIds.includes(item.id);
            const missingCount = item.missingPartNums?.length ?? 0;

            return (
              <button
                key={item.id}
                type="button"
                id={`collection-card-${item.minifig.figId}-${item.condition}`}
                className={`bm-fig-card ${isSelected ? 'selected' : ''}`}
                onClick={() => openQuickEdit(item)}
              >
                {item.quantity > 1 && (
                  <span className="bm-qty-corner">{item.quantity}x</span>
                )}
                {missingCount > 0 && (
                  <span className="bm-missing-corner">-{missingCount} pza</span>
                )}
                {selectMode && (
                  <span className={`bm-select-corner ${isSelected ? 'checked' : ''}`}>
                    {isSelected && <Check size={11} />}
                  </span>
                )}

                <div className="bm-card-img-box">
                  <img src={item.minifig.imageUrl} alt={item.minifig.name} loading="lazy" />
                </div>

                <div className="bm-fig-card-body">
                  <h3 className="bm-card-title truncate">{item.minifig.name}</h3>
                  <span className="bm-card-code">{item.minifig.figId}</span>
                  <div className="bm-card-price-stack">
                    <strong className="bm-card-price">€{lineTotalEur.toFixed(2)}</strong>
                    {item.quantity > 1 && (
                      <span className="bm-card-unit-sub">
                        (€{item.estimatedUnitValueEur.toFixed(2)} c/u)
                      </span>
                    )}
                  </div>
                  <span className="bm-card-cond-muted">{conditionLabel(item.condition)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Quick Edit (idéntico al vídeo 00:51 y 01:13) */}
      {quickEditItem && (
        <div
          className="bm-modal-backdrop"
          id="quick-edit-backdrop"
          onClick={() => setQuickEditItemId(null)}
        >
          <div
            className="bm-modal-sheet"
            id="quick-edit-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bm-qedit-head">
              <img
                src={quickEditItem.minifig.imageUrl}
                alt={quickEditItem.minifig.name}
                className="bm-thumb-md"
              />
              <div className="bm-qedit-title-col">
                <strong className="truncate">{quickEditItem.minifig.name}</strong>
                <div className="bm-qedit-sub">
                  <span>{quickEditItem.minifig.figId}</span>
                  <button
                    type="button"
                    id="btn-quick-edit-view-details"
                    className="bm-link-accent"
                    onClick={() => {
                      const target = quickEditItem;
                      setQuickEditItemId(null);
                      onOpenItemDetail(target, false);
                    }}
                  >
                    Ver detalles y despiece <ChevronRight size={13} />
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="bm-icon-soft sm"
                onClick={() => setQuickEditItemId(null)}
                aria-label="Cerrar edición"
              >
                <X size={15} />
              </button>
            </div>

            <div className="bm-field-group">
              <label>Estado</label>
              <div className="bm-segmented full">
                <button
                  type="button"
                  className={editCondition === 'used_complete' ? 'active' : ''}
                  onClick={() => setEditCondition('used_complete')}
                >
                  Usada
                </button>
                <button
                  type="button"
                  className={editCondition === 'new' ? 'active' : ''}
                  onClick={() => setEditCondition('new')}
                >
                  Nueva
                </button>
                <button
                  type="button"
                  className={editCondition === 'used_incomplete' ? 'active' : ''}
                  onClick={() => setEditCondition('used_incomplete')}
                >
                  Incompleta
                </button>
              </div>
            </div>

            <div className="bm-qedit-grid-2">
              <div className="bm-field-group">
                <label htmlFor="qedit-price-input">Precio (€)</label>
                <div className="bm-price-input-box">
                  <span>€</span>
                  <input
                    id="qedit-price-input"
                    type="number"
                    step="0.1"
                    min="0.5"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                  />
                </div>
              </div>

              <div className="bm-field-group">
                <label>Cantidad</label>
                <div className="bm-mini-stepper tall">
                  <button
                    type="button"
                    onClick={() => setEditQty((q) => Math.max(1, q - 1))}
                    aria-label="Restar"
                  >
                    <Minus size={15} />
                  </button>
                  <strong>{editQty}</strong>
                  <button
                    type="button"
                    onClick={() => setEditQty((q) => q + 1)}
                    aria-label="Sumar"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>
            </div>

            <div className="bm-field-group">
              <label htmlFor="qedit-notes-input">Descripción / notas</label>
              <textarea
                id="qedit-notes-input"
                rows={2}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Ej. ¡Estado excelente! Comprada en Wallapop..."
              />
            </div>

            <div className="bm-qedit-footer">
              <button
                type="button"
                id="btn-qedit-delete"
                className="bm-trash-square"
                onClick={() => {
                  onRemoveItem(quickEditItem.id);
                  setQuickEditItemId(null);
                }}
                aria-label="Eliminar figura"
              >
                <Trash2 size={18} />
              </button>
              <button
                type="button"
                id="btn-qedit-save"
                className="bm-btn-primary flex-1"
                onClick={handleSaveQuickEdit}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Nueva Colección con selector de 8 colores (idéntico al vídeo 01:33) */}
      {showNewColModal && (
        <div
          className="bm-modal-backdrop"
          id="new-collection-backdrop"
          onClick={() => setShowNewColModal(false)}
        >
          <form
            className="bm-modal-sheet"
            id="new-collection-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void handleCreateColSubmit(e)}
          >
            <div className="bm-modal-head centered">
              <button
                type="button"
                className="bm-icon-soft sm"
                onClick={() => setShowNewColModal(false)}
                aria-label="Cerrar"
              >
                <X size={15} />
              </button>
              <strong>Nueva colección</strong>
              <span style={{ width: 32 }} />
            </div>

            <div className="bm-newcol-input-wrap">
              <span
                className="bm-color-dot"
                style={{ backgroundColor: newColColor }}
              />
              <input
                id="new-collection-name-input"
                type="text"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="Nombre de la colección"
                autoFocus
                required
              />
            </div>

            <div className="bm-color-swatches" role="radiogroup" aria-label="Color de colección">
              {COLLECTION_DOT_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={`bm-color-swatch ${newColColor === hex ? 'active' : ''}`}
                  style={{ backgroundColor: hex }}
                  onClick={() => setNewColColor(hex)}
                  aria-label={`Color ${hex}`}
                />
              ))}
            </div>

            <button
              type="submit"
              id="btn-confirm-create-collection"
              className="bm-btn-primary full lg"
              disabled={!newColName.trim()}
            >
              Crear colección
            </button>
          </form>
        </div>
      )}

      {/* MODAL 3: Gestor de Colecciones (idéntico al vídeo 03:04) */}
      {showColPickerSheet && (
        <div
          className="bm-modal-backdrop"
          id="collections-sheet-backdrop"
          onClick={() => {
            setShowColPickerSheet(false);
            setManagingColId(null);
            setRenamingColId(null);
            setConfirmDeleteColId(null);
          }}
        >
          <div
            className="bm-modal-sheet"
            id="collections-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bm-modal-head centered">
              <span style={{ width: 32 }} />
              <strong>Colecciones</strong>
              <button
                type="button"
                className="bm-icon-soft sm"
                onClick={() => setShowColPickerSheet(false)}
                aria-label="Cerrar"
              >
                <X size={15} />
              </button>
            </div>

            <div className="bm-col-sheet-list">
              <button
                type="button"
                className={`bm-col-sheet-row ${viewingAll ? 'active' : ''}`}
                onClick={() => {
                  setViewingAll(true);
                  setShowColPickerSheet(false);
                }}
              >
                <div>
                  <strong>Todas las figuras</strong>
                  <span>{calculateCollectionStats(allItems).totalUnits} figuras</span>
                </div>
                <strong>€{calculateCollectionStats(allItems).totalMarketValueEur.toFixed(2)}</strong>
              </button>

              {collections.map((col, idx) => {
                const colItems = allItems.filter((it) => it.collectionId === col.id);
                const colStats = calculateCollectionStats(colItems);
                const dotColor =
                  col.color || COLLECTION_DOT_COLORS[idx % COLLECTION_DOT_COLORS.length];
                const isActive = !viewingAll && activeCollection?.id === col.id;
                const isManaging = managingColId === col.id;
                const isRenaming = renamingColId === col.id;
                const isConfirmingDelete = confirmDeleteColId === col.id;

                return (
                  <div
                    key={col.id}
                    className={`bm-col-sheet-item ${isActive ? 'active' : ''}`}
                  >
                    {isRenaming ? (
                      <form
                        className="bm-inline-rename"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (renameDraft.trim()) {
                            onRenameCollection(col.id, renameDraft.trim());
                          }
                          setRenamingColId(null);
                        }}
                      >
                        <input
                          type="text"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          autoFocus
                        />
                        <button type="submit" className="bm-btn-primary sm">
                          Guardar
                        </button>
                      </form>
                    ) : (
                      <div className="bm-col-sheet-row">
                        <button
                          type="button"
                          className="bm-col-sheet-select"
                          onClick={() => {
                            setViewingAll(false);
                            onSelectCollection(col.id);
                            setShowColPickerSheet(false);
                          }}
                        >
                          <div className="bm-col-sheet-name-row">
                            <span
                              className="bm-color-dot sm"
                              style={{ backgroundColor: dotColor }}
                            />
                            <strong>{col.name}</strong>
                            {isActive && <Check size={14} className="accent-icon" />}
                          </div>
                          <span>
                            {colStats.totalUnits} figuras · €
                            {colStats.totalMarketValueEur.toFixed(2)}
                          </span>
                        </button>

                        <button
                          type="button"
                          id={`btn-col-options-${col.id}`}
                          className="bm-icon-soft sm"
                          onClick={() => {
                            setManagingColId(isManaging ? null : col.id);
                            setConfirmDeleteColId(null);
                          }}
                          aria-label={`Opciones de ${col.name}`}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    )}

                    {isManaging && !isRenaming && (
                      <div className="bm-col-manage-bar">
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingColId(col.id);
                            setRenameDraft(col.name);
                            setManagingColId(null);
                          }}
                        >
                          <Pencil size={13} /> Renombrar
                        </button>

                        {isConfirmingDelete ? (
                          <button
                            type="button"
                            id="btn-confirm-delete-collection"
                            className="danger"
                            onClick={() => {
                              onDeleteCollection(col.id);
                              setConfirmDeleteColId(null);
                              setManagingColId(null);
                            }}
                          >
                            Confirmar borrar
                          </button>
                        ) : (
                          <button
                            type="button"
                            id={`btn-delete-col-${col.id}`}
                            className="danger"
                            onClick={() => setConfirmDeleteColId(col.id)}
                          >
                            <Trash2 size={13} /> Borrar colección
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="bm-col-sheet-new-btn"
              onClick={() => {
                setShowColPickerSheet(false);
                setShowNewColModal(true);
              }}
            >
              <Plus size={16} /> Nueva colección
            </button>
          </div>
        </div>
      )}

      {/* MODAL 4: Importar (CSV / BrickLink XML / .bsx / lista rápida) */}
      {showImportModal && (
        <div
          className="bm-modal-backdrop"
          onClick={() => setShowImportModal(false)}
        >
          <div className="bm-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bm-modal-head">
              <strong>Importar figuras</strong>
              <button
                type="button"
                className="bm-icon-soft sm"
                onClick={() => setShowImportModal(false)}
              >
                <X size={15} />
              </button>
            </div>

            <p className="bm-muted-p">
              Pega códigos BrickLink (ej. <code>sw0585 x3, sh0232 nueva</code>) o sube un archivo{' '}
              <strong>CSV, BrickLink XML o BrickStore .bsx</strong>.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xml,.bsx,.txt"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setImportText(await file.text());
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="bm-btn-secondary full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={15} /> Elegir archivo (.csv, .xml, .bsx)
            </button>

            <textarea
              id="bulk-import-textarea"
              rows={4}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="sw0585 x2, sh0232 new 52..."
            />

            {importPreview && importPreview.items.length > 0 && (
              <div className="bm-import-preview-pill">
                Detectadas <strong>{importPreview.items.length}</strong> líneas · Valor est.{' '}
                <strong>
                  €
                  {importPreview.items
                    .reduce((sum, line) => sum + line.quantity * line.estimatedUnitValueEur, 0)
                    .toFixed(2)}
                </strong>
              </div>
            )}

            <button
              type="button"
              id="btn-confirm-bulk-import"
              className="bm-btn-primary full"
              disabled={!importPreview || importPreview.items.length === 0}
              onClick={() => {
                if (!importPreview || importPreview.items.length === 0) return;
                onBulkImportLines(importPreview.items);
                setImportText('');
                setShowImportModal(false);
              }}
            >
              Importar a {activeCollection?.name || 'Mi Colección'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL 5: Exportar (CSV / BrickLink XML / .bsx) */}
      {showExportModal && (
        <div
          className="bm-modal-backdrop"
          onClick={() => setShowExportModal(false)}
        >
          <div className="bm-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bm-modal-head">
              <strong>Exportar inventario</strong>
              <button
                type="button"
                className="bm-icon-soft sm"
                onClick={() => setShowExportModal(false)}
              >
                <X size={15} />
              </button>
            </div>

            <div className="bm-segmented full">
              {(['csv', 'xml', 'bsx'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  className={exportFormat === fmt ? 'active' : ''}
                  onClick={() => setExportFormat(fmt)}
                >
                  {fmt === 'csv' ? 'CSV Excel' : fmt === 'xml' ? 'BrickLink XML' : 'BrickStore .BSX'}
                </button>
              ))}
            </div>

            <pre className="bm-export-code">{exportOutput.slice(0, 1200)}</pre>

            <div className="bm-export-actions">
              <button type="button" className="bm-btn-secondary flex-1" onClick={() => void handleCopyExport()}>
                {copiedExport ? <Check size={15} /> : <Copy size={15} />}
                {copiedExport ? 'Copiado' : 'Copiar'}
              </button>
              <button type="button" className="bm-btn-primary flex-1" onClick={handleDownloadExport}>
                <Download size={15} /> Descargar .{exportFormat}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
