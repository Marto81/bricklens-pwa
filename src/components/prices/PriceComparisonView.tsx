import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ExternalLink,
  FolderPlus,
  Info,
  Plus,
  PlusCircle,
  Search,
  TrendingUp
} from 'lucide-react';
import type {
  MinifigCondition,
  MinifigureMetadata,
  PreferredPriceSource,
  UserCollection
} from '../../types/minifig';
import {
  ALL_MINIFIG_CATALOG,
  createCustomMinifigMetadata,
  findMinifigById,
  searchMinifigCatalog
} from '../../data/catalogPresets';
import {
  generatePriceComparisonReport,
  getQuickDualPricesEur,
  PREFERRED_PRICE_SOURCE_LABELS
} from '../../services/priceAggregator';

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
  onAddToCollection
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [quantityToAdd, setQuantityToAdd] = useState<number>(1);
  const [purchasePriceInput, setPurchasePriceInput] = useState<string>('');
  const [marketPriceInput, setMarketPriceInput] = useState<string>('');
  const [notesInput, setNotesInput] = useState<string>('');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const [targetCollectionId, setTargetCollectionId] = useState<string | null>(activeCollectionId);
  const [creatingCollectionMode, setCreatingCollectionMode] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  useEffect(() => {
    setTargetCollectionId(activeCollectionId);
  }, [activeCollectionId]);

  const searchResults = useMemo(() => searchMinifigCatalog(searchQuery), [searchQuery]);

  const cleanTypedCode = useMemo(
    () => searchQuery.trim().replace(/\s+/g, '').toLowerCase(),
    [searchQuery]
  );

  const canQuoteCustomCode = useMemo(() => {
    if (cleanTypedCode.length < 2) return false;
    return !findMinifigById(cleanTypedCode);
  }, [cleanTypedCode]);

  const displayedPills = useMemo(() => {
    const base = searchResults.length > 0 ? searchResults : ALL_MINIFIG_CATALOG;
    const selectedAlreadyVisible = base.some((m) => m.figId === selectedMinifig.figId);
    return selectedAlreadyVisible ? base : [selectedMinifig, ...base];
  }, [searchResults, selectedMinifig]);

  const report = useMemo(
    () =>
      generatePriceComparisonReport(
        selectedMinifig,
        selectedCondition,
        preferredPriceSource
      ),
    [selectedMinifig, selectedCondition, preferredPriceSource]
  );

  useEffect(() => {
    setMarketPriceInput(report.estimatedMarketValueEur.toFixed(2));
  }, [selectedMinifig.figId, selectedCondition, report.estimatedMarketValueEur]);

  const dualPrices = useMemo(
    () => getQuickDualPricesEur(selectedMinifig, preferredPriceSource),
    [selectedMinifig, preferredPriceSource]
  );

  const partsSumEur = useMemo(
    () =>
      Math.round(selectedMinifig.parts.reduce((acc, p) => acc + p.avgPriceEur, 0) * 100) /
      100,
    [selectedMinifig]
  );

  const partOutDiffPct = useMemo(() => {
    if (report.estimatedMarketValueEur <= 0) return 0;
    return (
      Math.round(
        ((partsSumEur - report.estimatedMarketValueEur) /
          report.estimatedMarketValueEur) *
          1000
      ) / 10
    );
  }, [partsSumEur, report.estimatedMarketValueEur]);

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
    return report.estimatedMarketValueEur;
  }, [marketPriceInput, report.estimatedMarketValueEur]);

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
      Math.abs(resolvedMarketValueEur - report.estimatedMarketValueEur) > 0.01
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
    <section className="screen-stack" aria-label="Comparador de precios multi-portal">
      {/* Buscador Rápido + Cotizador Universal de Código */}
      <div className="surface-card">
        <form
          className="search-bar-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            if (searchResults.length === 1) {
              onChangeMinifig(searchResults[0]);
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
            placeholder="Busca o escribe cualquier código BrickLink (ej. sw0999, hp0128)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
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

      {/* Tarjeta de Valor de Mercado Ponderado / Fuente Elegida */}
      <div className="surface-card">
        <div className="hero-fig-row">
          <img
            src={selectedMinifig.imageUrl}
            alt={selectedMinifig.name}
            className="hero-fig-thumb"
          />
          <div>
            <div className="fig-meta-line" style={{ marginTop: 0 }}>
              <span className="code-chip">{selectedMinifig.figId.toUpperCase()}</span>
              <span>{selectedMinifig.theme}</span>
              <span>· {selectedMinifig.yearReleased}</span>
            </div>
            <h2 className="fig-title-lg">{selectedMinifig.name}</h2>
          </div>
        </div>

        <div
          className="segmented-control"
          role="radiogroup"
          aria-label="Filtrar estado en portales"
          style={{ marginTop: 12 }}
        >
          {(
            [
              { id: 'new', label: 'Nueva / Sellada', price: dualPrices.newEur },
              { id: 'used_complete', label: 'Usada Completa', price: dualPrices.usedEur },
              { id: 'used_incomplete', label: 'Incompleta', price: dualPrices.incompleteEur }
            ] as const
          ).map((c) => (
            <button
              key={c.id}
              type="button"
              id={`price-cond-${c.id}`}
              className={`seg-option ${selectedCondition === c.id ? 'active' : ''}`}
              onClick={() => onChangeCondition(c.id)}
            >
              <span>{c.label}</span>
              <strong>{c.price.toFixed(2)} €</strong>
            </button>
          ))}
        </div>

        <div className="valuation-readout-row">
          <div>
            <span className="eyebrow">
              {preferredPriceSource === 'weighted'
                ? 'Valor de Mercado Ponderado'
                : PREFERRED_PRICE_SOURCE_LABELS[preferredPriceSource]}
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
              <strong className="valuation-big-num mono" id="weighted-market-value">
                {report.estimatedMarketValueEur.toFixed(2)} €
              </strong>
              <span className="trend-chip">
                <TrendingUp size={12} /> +{report.trendPercentage30d.toFixed(1)}% (30d)
              </span>
            </div>
            <span className="section-hint">
              Horquilla: {report.priceRangeEur.low.toFixed(2)} € –{' '}
              {report.priceRangeEur.high.toFixed(2)} €
            </span>
          </div>

          <div className="best-deals-col">
            <div>
              <span className="eyebrow" style={{ display: 'block' }}>
                Mejor compra
              </span>
              <strong className="mono" style={{ color: 'var(--positive)' }}>
                {report.bestDealPortal.toUpperCase()}
              </strong>
            </div>
            <div>
              <span className="eyebrow" style={{ display: 'block' }}>
                Mayor venta
              </span>
              <strong className="mono">{report.bestSalePortal.toUpperCase()}</strong>
            </div>
          </div>
        </div>

        {selectedMinifig.isEstimatedFallbackPrice && (
          <p className="section-hint" style={{ marginTop: 6, color: 'var(--accent)' }}>
            Referencia externa con precio base orientativo. Consulta los enlaces reales y ajusta el valor debajo antes de guardarla.
          </p>
        )}

        <div className="source-select-row">
          <label htmlFor="preferred-price-source-select" className="eyebrow">
            Fuente de precio base
          </label>
          <select
            id="preferred-price-source-select"
            className="source-select-mini"
            value={preferredPriceSource}
            onChange={(e) =>
              onChangePreferredSource(e.target.value as PreferredPriceSource)
            }
          >
            {(
              Object.entries(PREFERRED_PRICE_SOURCE_LABELS) as Array<
                [PreferredPriceSource, string]
              >
            ).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparativa Limpia por Portales (Separadores Hairline) */}
      <div className="surface-card">
        <div className="section-header-line">
          <div>
            <h3 className="section-title">Cotizaciones por Portal (5 Marketplaces)</h3>
            <p className="section-hint">
              Ponderación: 50% BrickLink · 25% BrickOwl · 15% eBay · 5% Wallapop · 5% Vinted
            </p>
          </div>
        </div>

        <div className="portal-list">
          {report.quotes.map((q) => {
            const isBestDeal = q.portal === report.bestDealPortal;
            const totalSpan = Math.max(1, report.priceRangeEur.high - report.priceRangeEur.low);
            const leftPct = Math.max(
              0,
              Math.min(84, ((q.minPriceEur - report.priceRangeEur.low) / totalSpan) * 100)
            );
            const widthPct = Math.max(
              14,
              Math.min(100 - leftPct, ((q.maxPriceEur - q.minPriceEur) / totalSpan) * 100)
            );

            return (
              <div key={q.portal} id={`portal-quote-${q.portal}`} className="portal-row">
                <div className="portal-row-top">
                  <div className="portal-identity">
                    <strong className="portal-title">{q.portalName}</strong>
                    <span className="portal-source-tag">
                      {q.isOfficialApi ? 'Price Guide' : 'C2C'}
                    </span>
                    {isBestDeal && <span className="best-buy-tag">Mejor compra</span>}
                  </div>

                  <a
                    href={q.deepLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    id={`link-portal-${q.portal}`}
                    className="portal-open-link"
                  >
                    <span>Abrir ({q.activeListingsCount})</span>
                    <ExternalLink size={12} />
                  </a>
                </div>

                <div className="portal-numbers-row">
                  <div>
                    <span className="p-stat-label">Mínimo</span>
                    <strong className="mono" style={{ color: 'var(--positive)' }}>
                      {q.minPriceEur.toFixed(2)} €
                    </strong>
                  </div>
                  <div>
                    <span className="p-stat-label">Media (6m)</span>
                    <strong className="mono" style={{ color: 'var(--accent)' }}>
                      {q.soldAvg6mEur.toFixed(2)} €
                    </strong>
                  </div>
                  <div>
                    <span className="p-stat-label">Máximo</span>
                    <strong className="mono">{q.maxPriceEur.toFixed(2)} €</strong>
                  </div>
                  <div>
                    <span className="p-stat-label">Envío est.</span>
                    <strong className="mono">+{q.shippingEstimateEur.toFixed(2)} €</strong>
                  </div>
                </div>

                <div className="spectrum-track" aria-hidden="true">
                  <div
                    className="spectrum-bar"
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="data-transparency-note">
          <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Los enlaces «Abrir» buscan directamente {selectedMinifig.figId.toUpperCase()} en cada portal real.
          </span>
        </div>
      </div>

      {/* Desglose por Piezas Colapsable + Veredicto Part-Out */}
      <div className="surface-card">
        <details className="optical-disclosure">
          <summary>
            <span>Desglose por piezas sueltas (Part-Out: {partsSumEur.toFixed(2)} €)</span>
            <ChevronDown size={15} />
          </summary>
          <div style={{ marginTop: 10 }}>
            <div
              id="part-out-verdict"
              className={`verdict-pill ${partOutDiffPct >= 5 ? 'partout' : 'complete'}`}
            >
              {partOutDiffPct >= 5
                ? `Conviene vender por piezas (+${partOutDiffPct.toFixed(1)}% · +${(
                    partsSumEur - report.estimatedMarketValueEur
                  ).toFixed(2)} €)`
                : `Mejor vender completa (${
                    partOutDiffPct >= 0
                      ? `+${partOutDiffPct.toFixed(1)}%`
                      : `${partOutDiffPct.toFixed(1)}%`
                  } en piezas)`}
            </div>
            {selectedMinifig.parts.map((part) => (
              <div key={part.partNum} className="part-row-flat">
                <div>
                  <span className="mono" style={{ color: 'var(--text-muted)', marginRight: 8 }}>
                    {part.partNum}
                  </span>
                  <span>{part.name}</span>
                </div>
                <strong className="mono">{part.avgPriceEur.toFixed(2)} €</strong>
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* Guardar en Colección Destino */}
      <form className="surface-card" onSubmit={handleConfirmAdd}>
        <div className="section-header-line">
          <h3 className="section-title">
            Guardar {selectedMinifig.figId.toUpperCase()} en colección
          </h3>
        </div>

        <div className="target-collection-row" style={{ marginBottom: 10 }}>
          <label htmlFor="comp-target-col" className="eyebrow">
            Colección destino
          </label>
          <div className="target-collection-controls">
            {collections.length > 0 ? (
              <select
                id="comp-target-col"
                className="source-select-mini"
                value={targetCollectionId ?? collections[0].id}
                onChange={(e) => {
                  setTargetCollectionId(e.target.value);
                  onSelectCollection(e.target.value);
                }}
              >
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.isDemo ? ' (Prueba)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <span className="section-hint">Se creará «Mi Colección»</span>
            )}
            <button
              type="button"
              className="btn-chip"
              onClick={() => setCreatingCollectionMode((v) => !v)}
            >
              <FolderPlus size={12} />
              <span>Nueva</span>
            </button>
          </div>

          {creatingCollectionMode && (
            <div className="inline-create-bar">
              <input
                type="text"
                className="field-input"
                placeholder="Nombre de tu colección..."
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
                className="btn-chip active"
                onClick={(e) => void handleCreateTargetCollection(e)}
              >
                Crear
              </button>
            </div>
          )}
        </div>

        <div className="form-grid-3">
          <div className="field-group" style={{ marginBottom: 0 }}>
            <label htmlFor="add-qty-input">Cantidad</label>
            <input
              id="add-qty-input"
              type="number"
              className="field-input mono"
              min={1}
              max={999}
              value={quantityToAdd}
              onChange={(e) => setQuantityToAdd(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          <div className="field-group" style={{ marginBottom: 0 }}>
            <label htmlFor="add-paid-input">Pagado / ud. (€)</label>
            <input
              id="add-paid-input"
              type="number"
              className="field-input mono"
              step="0.01"
              min={0}
              placeholder={`${(resolvedMarketValueEur * 0.8).toFixed(2)}`}
              value={purchasePriceInput}
              onChange={(e) => setPurchasePriceInput(e.target.value)}
            />
          </div>

          <div className="field-group" style={{ marginBottom: 0 }}>
            <label htmlFor="add-market-input">Valor / ud. (€)</label>
            <input
              id="add-market-input"
              type="number"
              className="field-input mono"
              step="0.01"
              min={0.5}
              value={marketPriceInput}
              onChange={(e) => setMarketPriceInput(e.target.value)}
            />
          </div>
        </div>

        <div className="field-group" style={{ marginTop: 10 }}>
          <label htmlFor="add-notes-input">Notas (opcional)</label>
          <input
            id="add-notes-input"
            type="text"
            className="field-input"
            placeholder="Ej: Comprada en Wallapop completa..."
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
          />
        </div>

        {savedNotice && (
          <div className="feedback-banner" role="status" style={{ marginBottom: 10 }}>
            <Check size={16} />
            <span>{savedNotice}</span>
          </div>
        )}

        <button type="submit" id="btn-submit-add-collection" className="btn-primary btn-full">
          <PlusCircle size={16} />
          <span>
            Guardar en «{targetCollectionName}» (
            {(quantityToAdd * resolvedMarketValueEur).toFixed(2)} €)
          </span>
        </button>
      </form>
    </section>
  );
};
