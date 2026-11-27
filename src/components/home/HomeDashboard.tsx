import React, { useMemo, useState } from 'react';
import { Menu, SlidersHorizontal } from 'lucide-react';
import type {
  CollectionItem,
  PortfolioTimeRange,
  UserCollection
} from '../../types/minifig';
import {
  calculateCollectionStats,
  COLLECTION_DOT_COLORS,
  getPortfolioHistorySeries
} from '../../db/collectionDb';

interface HomeDashboardProps {
  collections: UserCollection[];
  allItems: CollectionItem[];
  onOpenDrawer: () => void;
  onSelectCollectionAndNavigate: (collectionId: string) => void;
  onOpenItemDetail: (item: CollectionItem) => void;
  onOpenScanner: () => void;
}

type ValuationDisplayMode = 'my_prices' | 'live_market';
type HomeChartRange = PortfolioTimeRange | 'ALL';

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  collections,
  allItems,
  onOpenDrawer,
  onSelectCollectionAndNavigate,
  onOpenItemDetail,
  onOpenScanner
}) => {
  const [priceMode, setPriceMode] = useState<ValuationDisplayMode>('live_market');
  const [range, setRange] = useState<HomeChartRange>('1M');

  const stats = useMemo(() => calculateCollectionStats(allItems), [allItems]);

  const effectiveTotalEur =
    priceMode === 'my_prices' ? stats.totalInvestedEur : stats.totalMarketValueEur;

  const avgUnitValueEur =
    stats.totalUnits > 0 ? Math.round((effectiveTotalEur / stats.totalUnits) * 100) / 100 : 0;

  const series = useMemo(() => {
    const mappedRange: PortfolioTimeRange = range === 'ALL' ? '1Y' : range;
    const baseSeries = getPortfolioHistorySeries(allItems, mappedRange);
    if (priceMode === 'my_prices') {
      return baseSeries.map((pt) => ({
        ...pt,
        valueEur: pt.investedEur
      }));
    }
    return baseSeries;
  }, [allItems, range, priceMode]);

  const firstVal = series[0]?.valueEur ?? 0;
  const lastVal = series[series.length - 1]?.valueEur ?? 0;
  const deltaEur = Math.round((lastVal - firstVal) * 100) / 100;
  const deltaPct = firstVal > 0 ? Math.round((deltaEur / firstVal) * 1000) / 10 : 0;

  const chartGeometry = useMemo(() => {
    const width = 290;
    const height = 104;
    const padTop = 10;
    const padBottom = 10;
    const values = series.map((s) => s.valueEur);
    const rawMin = Math.min(...values, 0);
    const rawMax = Math.max(...values, 10);
    const spread = Math.max(rawMax - rawMin, Math.max(4, rawMax * 0.14));
    const minY = Math.max(0, rawMin - spread * 0.25);
    const maxY = rawMax + spread * 0.25;
    const rangeY = Math.max(1, maxY - minY);

    const pts = series.map((pt, idx) => {
      const x = series.length > 1 ? (idx / (series.length - 1)) * width : width;
      const y = height - padBottom - ((pt.valueEur - minY) / rangeY) * (height - padTop - padBottom);
      return { x, y, val: pt.valueEur };
    });

    const linePath = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
    const areaPath =
      pts.length > 0
        ? `${linePath} L${width},${height} L0,${height} Z`
        : '';

    const ticks = [maxY, minY + rangeY * 0.66, minY + rangeY * 0.33, minY].map((v) =>
      Math.round(v)
    );
    const lastPt = pts[pts.length - 1] ?? { x: width, y: height / 2 };

    return { width, height, linePath, areaPath, ticks, lastPt };
  }, [series]);

  const byCollection = useMemo(() => {
    return collections.map((col, idx) => {
      const colItems = allItems.filter((it) => it.collectionId === col.id);
      const colStats = calculateCollectionStats(colItems);
      const value =
        priceMode === 'my_prices' ? colStats.totalInvestedEur : colStats.totalMarketValueEur;
      return {
        collection: col,
        dotColor: col.color || COLLECTION_DOT_COLORS[idx % COLLECTION_DOT_COLORS.length],
        totalValueEur: value,
        units: colStats.totalUnits
      };
    });
  }, [collections, allItems, priceMode]);

  const topMostValuable = useMemo(() => {
    return [...allItems]
      .sort((a, b) => b.estimatedUnitValueEur - a.estimatedUnitValueEur)
      .slice(0, 5);
  }, [allItems]);

  const rangeLabel =
    range === '1D'
      ? 'Hoy'
      : range === '1W'
      ? '7 días'
      : range === '1M'
      ? '30 días'
      : range === '1Y'
      ? '1 año'
      : 'Histórico';

  return (
    <div className="bm-screen" id="home-dashboard-screen">
      {/* Cabecera minimalista estilo brick'em */}
      <header className="bm-top-bar">
        <div className="bm-top-left">
          <button
            type="button"
            id="btn-open-drawer"
            className="bm-icon-ghost"
            onClick={onOpenDrawer}
            aria-label="Abrir menú lateral"
          >
            <Menu size={21} />
          </button>
          <span className="bm-brand-text">BrickLens</span>
        </div>

        <div className="bm-segmented compact" role="tablist" aria-label="Modo de valoración">
          <button
            type="button"
            id="btn-home-my-prices"
            className={priceMode === 'my_prices' ? 'active' : ''}
            onClick={() => setPriceMode('my_prices')}
          >
            Coste
          </button>
          <button
            type="button"
            id="btn-home-live-market"
            className={priceMode === 'live_market' ? 'active' : ''}
            onClick={() => setPriceMode('live_market')}
          >
            Mercado
          </button>
        </div>
      </header>

      {/* Hero de Valor de Inventario */}
      <section className="bm-hero-value">
        <span className="bm-muted-label">
          {priceMode === 'my_prices' ? 'Coste total invertido' : 'Valor del inventario'}
        </span>
        <h1 className="bm-big-number" id="home-total-value">
          €{effectiveTotalEur.toFixed(2)}
        </h1>
        <div className={`bm-delta-row ${deltaEur < 0 ? 'negative' : 'positive'}`}>
          <span>{deltaEur < 0 ? '▼' : '▲'}</span>
          <strong>
            €{Math.abs(deltaEur).toFixed(2)} ({deltaEur >= 0 ? '+' : ''}
            {deltaPct.toFixed(1)}%)
          </strong>
          <span className="bm-delta-period">{rangeLabel}</span>
        </div>
      </section>

      {/* Gráfica lineal verde minimalista con eje derecho */}
      <section className="bm-chart-wrap" aria-label="Evolución del inventario">
        <div className="bm-chart-stage">
          <svg
            viewBox={`0 0 ${chartGeometry.width} ${chartGeometry.height}`}
            preserveAspectRatio="none"
            className="bm-chart-svg"
          >
            <defs>
              <linearGradient id="bmGreenFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16A34A" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#16A34A" stopOpacity="0.01" />
              </linearGradient>
            </defs>
            {[0.2, 0.5, 0.8].map((ratio) => (
              <line
                key={ratio}
                x1="0"
                y1={(chartGeometry.height * ratio).toFixed(1)}
                x2={chartGeometry.width}
                y2={(chartGeometry.height * ratio).toFixed(1)}
                stroke="var(--hairline)"
                strokeWidth="1"
              />
            ))}
            {chartGeometry.areaPath && (
              <path d={chartGeometry.areaPath} fill="url(#bmGreenFill)" />
            )}
            {chartGeometry.linePath && (
              <path
                d={chartGeometry.linePath}
                fill="none"
                stroke="#16A34A"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            <circle
              cx={chartGeometry.lastPt.x}
              cy={chartGeometry.lastPt.y}
              r="3.5"
              fill="#16A34A"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
          </svg>
          <div className="bm-chart-yaxis">
            {chartGeometry.ticks.map((tick, i) => (
              <span key={i}>€{tick}</span>
            ))}
          </div>
        </div>

        <div className="bm-chart-controls">
          <div className="bm-range-pills">
            {(['1D', '1W', '1M', '1Y', 'ALL'] as const).map((r) => (
              <button
                key={r}
                type="button"
                id={`home-range-${r}`}
                className={range === r ? 'active' : ''}
                onClick={() => setRange(r)}
              >
                {r === '1W' ? '1S' : r === '1Y' ? '1A' : r === 'ALL' ? 'TODO' : r}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="bm-icon-soft"
            onClick={onOpenDrawer}
            aria-label="Opciones de visualización"
            title="Ajustes y herramientas"
          >
            <SlidersHorizontal size={15} />
          </button>
        </div>
      </section>

      {/* 4 Tarjetas KPI limpias (2x2) */}
      <section className="bm-kpi-grid" aria-label="Resumen de métricas">
        <div className="bm-kpi-card">
          <span className="bm-kpi-label">VALOR TOTAL</span>
          <strong className="bm-kpi-val">€{effectiveTotalEur.toFixed(2)}</strong>
        </div>
        <div className="bm-kpi-card">
          <span className="bm-kpi-label">ARTÍCULOS</span>
          <strong className="bm-kpi-val">{stats.totalUnits}</strong>
        </div>
        <div className="bm-kpi-card">
          <span className="bm-kpi-label">ÚNICAS</span>
          <strong className="bm-kpi-val">{stats.totalUniqueFigs}</strong>
        </div>
        <div className="bm-kpi-card">
          <span className="bm-kpi-label">VALOR MEDIO</span>
          <strong className="bm-kpi-val">€{avgUnitValueEur.toFixed(2)}</strong>
        </div>
      </section>

      {/* Por colección */}
      <section className="bm-section">
        <div className="bm-section-head">
          <h2>Por colección</h2>
        </div>

        {byCollection.length === 0 ? (
          <div className="bm-empty-inline">
            <p>Todavía no tienes colecciones creadas.</p>
            <button type="button" className="bm-btn-primary sm" onClick={onOpenScanner}>
              Empezar a escanear
            </button>
          </div>
        ) : (
          <div className="bm-list-card">
            {byCollection.map(({ collection, dotColor, totalValueEur, units }) => (
              <button
                key={collection.id}
                type="button"
                id={`home-col-row-${collection.id}`}
                className="bm-list-row"
                onClick={() => onSelectCollectionAndNavigate(collection.id)}
              >
                <div className="bm-list-row-left">
                  <span
                    className="bm-color-dot"
                    style={{ backgroundColor: dotColor }}
                    aria-hidden="true"
                  />
                  <span className="bm-row-title">{collection.name}</span>
                </div>
                <div className="bm-list-row-right">
                  <strong className="bm-row-price">€{totalValueEur.toFixed(2)}</strong>
                  <span className="bm-row-sub">
                    {units} {units === 1 ? 'figura' : 'figuras'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Más valiosas (Top 5) */}
      <section className="bm-section">
        <div className="bm-section-head">
          <h2>Más valiosas</h2>
          <span className="bm-muted-inline">Top 5</span>
        </div>

        {topMostValuable.length === 0 ? (
          <div className="bm-empty-inline">
            <p>Escanea o añade tu primera minifigura para ver tu ranking.</p>
          </div>
        ) : (
          <div className="bm-list-card">
            {topMostValuable.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                id={`home-top-fig-${item.minifig.figId}`}
                className="bm-list-row"
                onClick={() => onOpenItemDetail(item)}
              >
                <div className="bm-list-row-left">
                  <span className="bm-rank-num">{idx + 1}</span>
                  <img
                    src={item.minifig.imageUrl}
                    alt={item.minifig.name}
                    className="bm-thumb-sm"
                  />
                  <div className="bm-row-text-stack">
                    <span className="bm-row-title truncate">{item.minifig.name}</span>
                    <span className="bm-row-sub">
                      {item.minifig.figId} · Minifig
                    </span>
                  </div>
                </div>
                <div className="bm-list-row-right">
                  <strong className="bm-row-price">
                    €{item.estimatedUnitValueEur.toFixed(2)}
                  </strong>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
