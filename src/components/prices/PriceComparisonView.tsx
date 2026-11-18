import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  FolderPlus,
  Loader2,
  Plus,
  PlusCircle,
  Puzzle,
  Search
} from 'lucide-react';
import type {
  MinifigCondition,
  MinifigureMetadata,
  PreferredPriceSource,
  PriceComparisonReport,
  UserCollection
} from '../../types/minifig';
import {
  ALL_MINIFIG_CATALOG,
  createCustomMinifigMetadata,
  findMinifigById,
  searchMinifigCatalog
} from '../../data/catalogPresets';
import { searchMinifigsHybrid } from '../../services/catalogService';
import {
  generatePriceComparisonReport,
  getQuickDualPricesEur,
  PREFERRED_PRICE_SOURCE_LABELS
} from '../../services/priceAggregator';
import { PriceAverageCard } from '../shared/PriceAverageCard';

interface PriceComparisonViewProps {
  selectedMinifig: MinifigureMetadata;
  selectedCondition: MinifigCondition;
  preferredPriceSource: PreferredPriceSource;
  collections: UserCollection[];
  activeCollectionId: string | null;
  onSelectCollection: (id: string) => void;
  onCreateCollection: (name: string) => Promise<UserCollection>;
  onChangePreferredSource: (source: PreferredPriceSource) => void;
  onChangeMinifig: (minifig: MinifigureMetadata) => void;
  onChangeCondition: (condition: MinifigCondition) => void;
  onOpenMinifigDetail: (minifig: MinifigureMetadata, condition: MinifigCondition) => void;
  onAddToCollection: (params: {
    collectionId?: string | null;
    minifig: MinifigureMetadata;
    condition: MinifigCondition;
    quantity: number;
    purchasePriceEur: number;
    estimatedUnitValueEur: number;
    notes?: string;
  }) => void;
}

export const PriceComparisonView: React.FC<PriceComparisonViewProps> = ({
  selectedMinifig,
  selectedCondition,
  preferredPriceSource,
  collections,
  activeCollectionId,
  onSelectCollection,
  onCreateCollection,
  onChangePreferredSource,
  onChangeMinifig,
  onChangeCondition,
  onOpenMinifigDetail,
  onAddToCollection
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [hybridResults, setHybridResults] = useState<MinifigureMetadata[]>(ALL_MINIFIG_CATALOG);
  const [searchingLive, setSearchingLive] = useState(false);

  const [quantityToAdd, setQuantityToAdd] = useState<number>(1);
  const [purchasePriceInput, setPurchasePriceInput] = useState<string>('');
  const [marketPriceInput, setMarketPriceInput] = useState<string>('');
  const [notesInput, setNotesInput] = useState<string>('');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const [targetCollectionId, setTargetCollectionId] = useState<string | null>(activeCollectionId);
  const [creatingCollectionMode, setCreatingCollectionMode] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  const [activeReport, setActiveReport] = useState<PriceComparisonReport>(() =>
    generatePriceComparisonReport(selectedMinifig, selectedCondition, preferredPriceSource)
  );

  useEffect(() => {
    setTargetCollectionId(activeCollectionId);
  }, [activeCollectionId]);

  useEffect(() => {
    const local = searchMinifigCatalog(searchQuery);
    setHybridResults(local);

    if (searchQuery.trim().length < 2) {
      setSearchingLive(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchingLive(true);
      try {
        const res = await searchMinifigsHybrid(searchQuery);
        if (!cancelled) setHybridResults(res.results);
      } finally {
        if (!cancelled) setSearchingLive(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  const cleanTypedCode = useMemo(
    () => searchQuery.trim().replace(/\s+/g, '').toLowerCase(),
    [searchQuery]
  );

  const canQuoteCustomCode = useMemo(() => {
    if (cleanTypedCode.length < 2) return false;
    return !findMinifigById(cleanTypedCode);
  }, [cleanTypedCode]);

  const displayedPills = useMemo(() => {
    const base = hybridResults.length > 0 ? hybridResults : ALL_MINIFIG_CATALOG;
    const selectedAlreadyVisible = base.some((m) => m.figId === selectedMinifig.figId);
    return (selectedAlreadyVisible ? base : [selectedMinifig, ...base]).slice(0, 18);
  }, [hybridResults, selectedMinifig]);

  useEffect(() => {
    setMarketPriceInput(activeReport.estimatedMarketValueEur.toFixed(2));
  }, [selectedMinifig.figId, selectedCondition, activeReport.estimatedMarketValueEur]);

  const dualPrices = useMemo(
    () => getQuickDualPricesEur(selectedMinifig, preferredPriceSource),
    [selectedMinifig, preferredPriceSource]
  );

  const handleSelectCustomCode = (codeRaw: string) => {
    const clean = codeRaw.trim().replace(/\s+/g, '');
    if (!clean) return;
    const resolved = findMinifigById(clean) ?? createCustomMinifigMetadata({ figId: clean });
    onChangeMinifig(resolved);
    setSearchQuery('');
  };

  const handleCreateTargetCollection = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;
    const created = await onCreateCollection(trimmed);
    setTargetCollectionId(created.id);
    setNewCollectionName('');
    setCreatingCollectionMode(false);
  };

  const resolvedMarketValueEur = useMemo(() => {
    const parsed = Number(marketPriceInput.replace(',', '.'));
    if (marketPriceInput.trim() !== '' && Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed * 100) / 100;
    }
    return activeReport.estimatedMarketValueEur;
  }, [marketPriceInput, activeReport.estimatedMarketValueEur]);

  const targetCollectionName = useMemo(() => {
    const found = collections.find((c) => c.id === targetCollectionId) ?? collections[0];
    return found ? found.name : 'Mi Colección';
  }, [collections, targetCollectionId]);

  const handleConfirmAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPurchase =
      purchasePriceInput.trim() !== ''
        ? Math.max(0, Number(purchasePriceInput.replace(',', '.')) || 0)
        : Math.round(resolvedMarketValueEur * 0.8 * 100) / 100;

    const updatedMinifig: MinifigureMetadata =
      Math.abs(resolvedMarketValueEur - activeReport.estimatedMarketValueEur) > 0.01
        ? {
            ...selectedMinifig,
            baseMarketPriceEur: {
              ...selectedMinifig.baseMarketPriceEur,
              [selectedCondition]: resolvedMarketValueEur
            },
            isEstimatedFallbackPrice: false
          }
        : selectedMinifig;

    onAddToCollection({
      collectionId: targetCollectionId,
      minifig: updatedMinifig,
      condition: selectedCondition,
      quantity: Math.max(1, quantityToAdd),
      purchasePriceEur: Math.round(parsedPurchase * 100) / 100,
      estimatedUnitValueEur: resolvedMarketValueEur,
      notes: notesInput.trim() || undefined
    });

    onChangeMinifig(updatedMinifig);
    setSavedNotice(`Guardada en «${targetCollectionName}»`);
    setNotesInput('');
    window.setTimeout(() => setSavedNotice(null), 2600);
  };

  return (
    <section className="screen-stack" aria-label="Tasar y buscar minifiguras">
      {/* Buscador Universal (Catálogo local + Rebrickable + Código BrickLink) */}
      <div className="surface-card">
        <form
          className="search-bar-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            if (hybridResults.length === 1) {
              onChangeMinifig(hybridResults[0]);
            } else if (canQuoteCustomCode) {
              handleSelectCustomCode(cleanTypedCode);
            }
          }}
        >
          <Search size={16} className="search-bar-icon" />
          <input
            type="search"
            id="comparator-search-input"
            className="search-input"
            placeholder="Busca figura o código BrickLink (ej. sw0999, vader)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchingLive && <Loader2 size={14} className="spin search-bar-spinner" />}
        </form>

        <div className="catalog-pills-scroll" role="list">
          {canQuoteCustomCode && (
            <button
              type="button"
              id="btn-quote-custom-code"
              className="catalog-pill active"
              onClick={() => handleSelectCustomCode(cleanTypedCode)}
            >
              <Plus size={12} />
              <span>Cotizar «{cleanTypedCode.toUpperCase()}»</span>
            </button>
          )}
          {displayedPills.map((item) => (
            <button
              key={item.figId}
              type="button"
              id={`comp-select-${item.figId}`}
              className={`catalog-pill ${item.figId === selectedMinifig.figId ? 'active' : ''}`}
              onClick={() => onChangeMinifig(item)}
            >
              <span className="mono">{item.figId.toUpperCase()}</span>
              <span>{item.name.split('—')[0].split('(')[0].trim()}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tarjeta Principal: Identidad + Estado + Media Desplegable */}
      <div className="surface-card">
        <div className="comp-fig-header">
          <img
            src={selectedMinifig.imageUrl}
            alt={selectedMinifig.name}
            className="comp-fig-avatar"
          />
          <div className="comp-fig-meta">
            <div className="fig-id-row">
              <span className="fig-code-badge mono">{selectedMinifig.figId.toUpperCase()}</span>
              <span className="fig-theme-label">{selectedMinifig.theme}</span>
              <span className="fig-year-label">· {selectedMinifig.yearReleased}</span>
            </div>
            <h2 className="comp-fig-title">{selectedMinifig.name}</h2>
            <button
              type="button"
              id="btn-open-detail-from-comparator"
              className="inline-parts-link"
              onClick={() => onOpenMinifigDetail(selectedMinifig, selectedCondition)}
            >
              <Puzzle size={13} />
              <span>Ver despiece ({selectedMinifig.parts.length} piezas) y faltantes →</span>
            </button>
          </div>
        </div>

        {/* Selector de condición */}
        <div className="condition-segmented-grid" style={{ marginTop: '14px' }}>
          {(
            [
              { id: 'new', label: 'Nueva', eur: dualPrices.newEur },
              { id: 'used_complete', label: 'Usada Completa', eur: dualPrices.usedEur },
              { id: 'used_incomplete', label: 'Incompleta', eur: dualPrices.incompleteEur }
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              id={`comp-cond-${item.id}`}
              className={`condition-segment ${selectedCondition === item.id ? 'active' : ''}`}
              onClick={() => onChangeCondition(item.id)}
            >
              <span>{item.label}</span>
              <strong className="mono">{item.eur.toFixed(2)} €</strong>
            </button>
          ))}
        </div>

        {/* Media de mercado + desglose desplegable de los 5 portales */}
        <div style={{ marginTop: '14px' }}>
          <PriceAverageCard
            minifig={selectedMinifig}
            condition={selectedCondition}
            preferredPriceSource={preferredPriceSource}
            onReportChange={setActiveReport}
          />
        </div>

        {/* Fuente preferida compacta */}
        <div className="preferred-source-bar" style={{ marginTop: '12px' }}>
          <label htmlFor="preferred-price-source-select" className="eyebrow">
            Cálculo de media
          </label>
          <div className="select-wrap">
            <select
              id="preferred-price-source-select"
              className="compact-select"
              value={preferredPriceSource}
              onChange={(e) => onChangePreferredSource(e.target.value as PreferredPriceSource)}
            >
              {(Object.keys(PREFERRED_PRICE_SOURCE_LABELS) as PreferredPriceSource[]).map((src) => (
                <option key={src} value={src}>
                  {PREFERRED_PRICE_SOURCE_LABELS[src]}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="select-chevron" />
          </div>
        </div>
      </div>

      {/* Guardar directamente en colección */}
      <form className="surface-card comp-add-form" onSubmit={handleConfirmAdd}>
        <div className="target-collection-row">
          <div className="target-col-select-wrap">
            <label htmlFor="comp-target-collection">Guardar en colección</label>
            <select
              id="comp-target-collection"
              className="compact-select"
              value={targetCollectionId ?? ''}
              onChange={(e) => {
                setTargetCollectionId(e.target.value);
                onSelectCollection(e.target.value);
              }}
            >
              {collections.length === 0 ? (
                <option value="">Mi Colección (nueva)</option>
              ) : (
                collections.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="button"
            className="btn-secondary-inline"
            onClick={() => setCreatingCollectionMode((v) => !v)}
            title="Crear nueva colección"
          >
            <FolderPlus size={14} /> Nueva
          </button>
        </div>

        {creatingCollectionMode && (
          <div className="inline-new-col-form">
            <input
              type="text"
              className="text-input"
              placeholder="Ej. Star Wars, Vitrina..."
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleCreateTargetCollection(e);
                }
              }}
            />
            <button
              type="button"
              className="btn-primary-inline"
              onClick={(e) => void handleCreateTargetCollection(e)}
            >
              Crear
            </button>
          </div>
        )}

        <div className="comp-add-grid three-cols">
          <div className="sheet-field">
            <label htmlFor="comp-qty-input">Uds.</label>
            <input
              id="comp-qty-input"
              type="number"
              min={1}
              max={999}
              className="text-input mono"
              value={quantityToAdd}
              onChange={(e) => setQuantityToAdd(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          <div className="sheet-field">
            <label htmlFor="comp-paid-input">Pagado (€)</label>
            <input
              id="comp-paid-input"
              type="number"
              step="0.5"
              min="0"
              className="text-input mono"
              placeholder={(resolvedMarketValueEur * 0.8).toFixed(2)}
              value={purchasePriceInput}
              onChange={(e) => setPurchasePriceInput(e.target.value)}
            />
          </div>

          <div className="sheet-field">
            <label htmlFor="comp-market-input">Valor (€)</label>
            <input
              id="comp-market-input"
              type="number"
              step="0.5"
              min="0.5"
              className="text-input mono"
              value={marketPriceInput}
              onChange={(e) => setMarketPriceInput(e.target.value)}
            />
          </div>
        </div>

        <div className="sheet-field">
          <label htmlFor="comp-notes-input">Notas opcionales</label>
          <input
            id="comp-notes-input"
            type="text"
            className="text-input"
            placeholder="Ej. Comprada en Wallapop, estado 9/10..."
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
          />
        </div>

        <button type="submit" id="btn-comp-add-collection" className="btn-primary full-width">
          {savedNotice ? (
            <>
              <Check size={16} /> {savedNotice}
            </>
          ) : (
            <>
              <PlusCircle size={16} /> Guardar en «{targetCollectionName}» (
              {(resolvedMarketValueEur * quantityToAdd).toFixed(2)} €)
            </>
          )}
        </button>
      </form>
    </section>
  );
};
