import React, { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ExternalLink,
  Info,
  PlusCircle,
  Search,
  TrendingUp
} from 'lucide-react';
import type {
  MinifigCondition,
  MinifigureMetadata,
  PreferredPriceSource
} from '../../types/minifig';
import {
  ALL_MINIFIG_CATALOG,
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
  onChangePreferredSource: (source: PreferredPriceSource) => void;
  onChangeMinifig: (minifig: MinifigureMetadata) => void;
  onChangeCondition: (condition: MinifigCondition) => void;
  onAddToCollection: (params: {
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
  onChangePreferredSource,
  onChangeMinifig,
  onChangeCondition,
  onAddToCollection
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [quantityToAdd, setQuantityToAdd] = useState<number>(1);
  const [purchasePriceInput, setPurchasePriceInput] = useState<string>('');
  const [notesInput, setNotesInput] = useState<string>('');
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  const searchResults = useMemo(() => searchMinifigCatalog(searchQuery), [searchQuery]);

  const report = useMemo(
    () =>
      generatePriceComparisonReport(
        selectedMinifig,
        selectedCondition,
        preferredPriceSource
      ),
    [selectedMinifig, selectedCondition, preferredPriceSource]
  );

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

  const handleConfirmAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPurchase =
      purchasePriceInput.trim() !== ''
        ? Math.max(0, Number(purchasePriceInput))
        : Math.round(report.estimatedMarketValueEur * 0.8 * 100) / 100;

    onAddToCollection({
      minifig: selectedMinifig,
      condition: selectedCondition,
      quantity: Math.max(1, quantityToAdd),
      purchasePriceEur: parsedPurchase,
      estimatedUnitValueEur: report.estimatedMarketValueEur,
      notes: notesInput.trim() || undefined
    });

    setSavedNotice(true);
    setNotesInput('');
    setTimeout(() => setSavedNotice(false), 2600);
  };

  return (
    <section className="screen-stack" aria-label="Comparador de precios multi-portal">
      {/* Buscador Rápido */}
      <div className="surface-card">
        <div className="search-bar-wrap">
          <Search size={16} className="search-bar-icon" />
          <input
            type="search"
            id="comparator-search-input"
            className="search-input"
            placeholder="Buscar código BrickLink (ej. sw0002, sh0232, col448) o nombre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="catalog-pills-scroll" role="list">
          {(searchResults.length > 0 ? searchResults : ALL_MINIFIG_CATALOG).map((item) => (
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
              <span className="eyebrow" style={{ display: 'block' }}>Mejor compra</span>
              <strong className="mono" style={{ color: 'var(--positive)' }}>
                {report.bestDealPortal.toUpperCase()}
              </strong>
            </div>
            <div>
              <span className="eyebrow" style={{ display: 'block' }}>Mayor venta</span>
              <strong className="mono">{report.bestSalePortal.toUpperCase()}</strong>
            </div>
          </div>
        </div>

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
            Los enlaces «Abrir» ejecutan búsquedas reales en cada portal. Las cifras de prueba usan referencias de catálogo hasta configurar claves OAuth/API en proxy backend.
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
                    partOutDiffPct >= 0 ? `+${partOutDiffPct.toFixed(1)}%` : `${partOutDiffPct.toFixed(1)}%`
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

      <form className="surface-card" onSubmit={handleConfirmAdd}>
        <div className="section-header-line">
          <h3 className="section-title">Registrar {selectedMinifig.figId.toUpperCase()} en Mi Colección</h3>
        </div>

        <div className="form-grid-2">
          <div className="field-group" style={{ marginBottom: 0 }}>
            <label htmlFor="add-qty-input">Cantidad (uds.)</label>
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
            <label htmlFor="add-paid-input">Precio pagado / ud. (€)</label>
            <input
              id="add-paid-input"
              type="number"
              className="field-input mono"
              step="0.01"
              min={0}
              placeholder={`${(report.estimatedMarketValueEur * 0.8).toFixed(2)}`}
              value={purchasePriceInput}
              onChange={(e) => setPurchasePriceInput(e.target.value)}
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
            <span>Guardada en Mi Colección y recalculado el total</span>
          </div>
        )}

        <button type="submit" id="btn-submit-add-collection" className="btn-primary btn-full">
          <PlusCircle size={16} />
          <span>
            Guardar en Colección ({(quantityToAdd * report.estimatedMarketValueEur).toFixed(2)} €)
          </span>
        </button>
      </form>
    </section>
  );
};
