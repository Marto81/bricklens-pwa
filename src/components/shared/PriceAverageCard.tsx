import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Pencil,
  RefreshCw,
  RotateCcw,
  TrendingUp
} from 'lucide-react';
import type {
  MarketplaceId,
  MarketplaceQuote,
  MinifigCondition,
  MinifigureMetadata,
  PreferredPriceSource,
  PriceComparisonReport
} from '../../types/minifig';
import {
  deleteObservedPrice,
  saveObservedPrice
} from '../../db/collectionDb';
import { fetchHybridPriceReport } from '../../services/catalogService';
import { generatePriceComparisonReport } from '../../services/priceAggregator';

interface PriceAverageCardProps {
  minifig: MinifigureMetadata;
  condition: MinifigCondition;
  preferredPriceSource: PreferredPriceSource;
  defaultExpanded?: boolean;
  compact?: boolean;
  onReportChange?: (report: PriceComparisonReport) => void;
}

const SOURCE_LABELS: Record<MarketplaceQuote['dataSource'], string> = {
  live_api: 'En vivo',
  user_observed: 'Anotado',
  catalog_estimate: 'Estimado'
};

export const PriceAverageCard: React.FC<PriceAverageCardProps> = ({
  minifig,
  condition,
  preferredPriceSource,
  defaultExpanded = false,
  compact = false,
  onReportChange
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [report, setReport] = useState<PriceComparisonReport>(() =>
    generatePriceComparisonReport(minifig, condition, preferredPriceSource)
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingPortal, setEditingPortal] = useState<MarketplaceId | null>(null);
  const [draftPrice, setDraftPrice] = useState('');

  useEffect(() => {
    let cancelled = false;
    const instant = generatePriceComparisonReport(minifig, condition, preferredPriceSource);
    setReport(instant);
    onReportChange?.(instant);

    const hydrate = async () => {
      setIsRefreshing(true);
      try {
        const live = await fetchHybridPriceReport(minifig, condition, preferredPriceSource, false);
        if (!cancelled) {
          setReport(live);
          onReportChange?.(live);
        }
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minifig.figId, condition, preferredPriceSource]);

  const handleForceRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshing(true);
    try {
      const live = await fetchHybridPriceReport(minifig, condition, preferredPriceSource, true);
      setReport(live);
      onReportChange?.(live);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSaveObserved = async (portal: MarketplaceId) => {
    const parsed = Number(draftPrice.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    await saveObservedPrice({
      figId: minifig.figId,
      condition,
      portal,
      priceEur: parsed
    });
    setEditingPortal(null);
    setDraftPrice('');
    const updated = await fetchHybridPriceReport(minifig, condition, preferredPriceSource, false);
    setReport(updated);
    onReportChange?.(updated);
  };

  const handleClearObserved = async (portal: MarketplaceId) => {
    await deleteObservedPrice(minifig.figId, condition, portal);
    const updated = await fetchHybridPriceReport(minifig, condition, preferredPriceSource, false);
    setReport(updated);
    onReportChange?.(updated);
  };

  const sourceSummary = (() => {
    const parts: string[] = [];
    if (report.livePortalsCount > 0) parts.push(`${report.livePortalsCount} en vivo`);
    if (report.observedPortalsCount > 0) parts.push(`${report.observedPortalsCount} anotado${report.observedPortalsCount > 1 ? 's' : ''}`);
    if (parts.length === 0) return 'Estimación · 5 portales UE';
    return `${parts.join(' · ')} · 5 portales`;
  })();

  return (
    <div className={`price-average-card ${compact ? 'compact' : ''}`}>
      <div className="price-avg-header">
        <div>
          <span className="eyebrow">Media de mercado (5 portales)</span>
          <div className="price-avg-value-row">
            <strong className="price-avg-number mono">
              {report.estimatedMarketValueEur.toFixed(2)} €
            </strong>
            <span className={`trend-pill ${report.trendPercentage30d >= 0 ? 'up' : 'down'}`}>
              <TrendingUp size={11} />
              {report.trendPercentage30d >= 0 ? '+' : ''}
              {report.trendPercentage30d.toFixed(1)}%
            </span>
          </div>
          <div className="price-avg-meta">
            <span className="mono">
              {report.priceRangeEur.low.toFixed(2)} € – {report.priceRangeEur.high.toFixed(2)} €
            </span>
            <span className="dot-sep">·</span>
            <span
              className={`price-source-summary ${
                report.livePortalsCount > 0 || report.observedPortalsCount > 0 ? 'verified' : ''
              }`}
            >
              {sourceSummary}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="icon-btn"
          onClick={handleForceRefresh}
          disabled={isRefreshing}
          title="Actualizar cotizaciones en vivo"
          aria-label="Actualizar cotizaciones en vivo"
        >
          <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />
        </button>
      </div>

      <button
        type="button"
        id={`btn-toggle-portals-${minifig.figId}`}
        className="price-avg-disclosure-btn"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span>
          {expanded ? 'Ocultar desglose de portales' : 'Ver desglose por portal (5)'}
        </span>
        {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {expanded && (
        <div className="price-portals-breakdown" id={`portals-breakdown-${minifig.figId}`}>
          {report.quotes.map((q) => {
            const isEditing = editingPortal === q.portal;
            const isBestDeal = q.portal === report.bestDealPortal;
            const isBestSale = q.portal === report.bestSalePortal;

            return (
              <div key={q.portal} className="portal-compact-row">
                <div className="portal-compact-left">
                  <div className="portal-compact-title-line">
                    <strong>{q.portalName}</strong>
                    <span className={`quote-source-tag ${q.dataSource}`}>
                      {SOURCE_LABELS[q.dataSource]}
                    </span>
                    {isBestDeal && <span className="portal-mini-tag deal">Menor coste</span>}
                    {isBestSale && !isBestDeal && (
                      <span className="portal-mini-tag sale">Mayor venta</span>
                    )}
                  </div>
                  <div className="portal-compact-sub mono">
                    Min {q.minPriceEur.toFixed(2)} € · Max {q.maxPriceEur.toFixed(2)} € · Envío ~
                    {q.shippingEstimateEur.toFixed(2)} €
                  </div>
                </div>

                <div className="portal-compact-right">
                  {isEditing ? (
                    <div className="portal-inline-edit">
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        className="portal-price-input mono"
                        value={draftPrice}
                        onChange={(e) => setDraftPrice(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleSaveObserved(q.portal);
                          if (e.key === 'Escape') setEditingPortal(null);
                        }}
                        placeholder="€"
                        autoFocus
                      />
                      <button
                        type="button"
                        className="tiny-action-btn primary"
                        onClick={() => void handleSaveObserved(q.portal)}
                        title="Guardar precio observado"
                      >
                        <Check size={13} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <strong className="portal-compact-price mono">
                        {q.avgPriceEur.toFixed(2)} €
                      </strong>
                      <div className="portal-compact-actions">
                        <button
                          type="button"
                          className="tiny-action-btn"
                          onClick={() => {
                            setEditingPortal(q.portal);
                            setDraftPrice(q.avgPriceEur.toFixed(2));
                          }}
                          title={`Anotar precio real visto en ${q.portalName}`}
                          aria-label={`Anotar precio en ${q.portalName}`}
                        >
                          <Pencil size={12} />
                        </button>
                        {q.dataSource === 'user_observed' && (
                          <button
                            type="button"
                            className="tiny-action-btn"
                            onClick={() => void handleClearObserved(q.portal)}
                            title="Restaurar precio automático"
                            aria-label="Restaurar precio automático"
                          >
                            <RotateCcw size={12} />
                          </button>
                        )}
                        <a
                          id={`link-portal-${q.portal}`}
                          href={q.deepLinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tiny-action-btn link"
                          title={`Buscar en ${q.portalName}`}
                          aria-label={`Abrir ${q.portalName}`}
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <p className="portal-breakdown-hint">
            Pulsa el lápiz en cualquier portal para anotar el precio real que veas; se guarda en tu
            dispositivo y actualiza la media automáticamente.
          </p>
        </div>
      )}
    </div>
  );
};
