import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Loader2,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  X
} from 'lucide-react';
import type {
  MinifigCondition,
  MinifigureMetadata,
  PreferredPriceSource,
  UserCollection
} from '../../types/minifig';
import {
  ALL_MINIFIG_CATALOG,
  createCustomMinifigMetadata
} from '../../data/catalogPresets';
import { COLLECTION_DOT_COLORS } from '../../db/collectionDb';
import { searchMinifigsHybrid } from '../../services/catalogService';
import { getQuickDualPricesEur } from '../../services/priceAggregator';

interface CatalogExploreViewProps {
  collections: UserCollection[];
  activeCollectionId: string | null;
  preferredPriceSource: PreferredPriceSource;
  onOpenMinifigDetail: (minifig: MinifigureMetadata, condition?: MinifigCondition) => void;
  onQuickAdd: (
    minifig: MinifigureMetadata,
    condition: MinifigCondition,
    quantity: number,
    targetCollectionId?: string | null
  ) => Promise<void>;
}

type CatalogKind = 'minifigs' | 'parts' | 'sets';

export const CatalogExploreView: React.FC<CatalogExploreViewProps> = ({
  collections,
  activeCollectionId,
  preferredPriceSource,
  onOpenMinifigDetail,
  onQuickAdd
}) => {
  const [kind, setKind] = useState<CatalogKind>('minifigs');
  const [query, setQuery] = useState('');
  const [selectedTheme, setSelectedTheme] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'year_desc' | 'price_desc' | 'name_asc'>('year_desc');
  const [remoteResults, setRemoteResults] = useState<MinifigureMetadata[]>([]);
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);

  // Estado local por tarjeta (Usada/Nueva + Qty + feedback añadido)
  const [cardConds, setCardConds] = useState<Record<string, MinifigCondition>>({});
  const [cardQtys, setCardQtys] = useState<Record<string, number>>({});
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const activeCol = useMemo(
    () => collections.find((c) => c.id === activeCollectionId) ?? collections[0] ?? null,
    [collections, activeCollectionId]
  );
  const activeColDot = activeCol?.color || COLLECTION_DOT_COLORS[0];

  // Búsqueda híbrida (local + Rebrickable si hay clave) con debounce
  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      setRemoteResults([]);
      setIsSearchingRemote(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearchingRemote(true);
      try {
        const res = await searchMinifigsHybrid(clean);
        if (!cancelled) {
          setRemoteResults(res.results);
        }
      } finally {
        if (!cancelled) setIsSearchingRemote(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const baseList = useMemo(() => {
    const clean = query.trim();
    if (clean.length >= 2 && remoteResults.length > 0) {
      return remoteResults;
    }
    if (!clean) return ALL_MINIFIG_CATALOG;

    const lower = clean.toLowerCase();
    const localHits = ALL_MINIFIG_CATALOG.filter(
      (m) =>
        m.figId.toLowerCase().includes(lower) ||
        m.name.toLowerCase().includes(lower) ||
        m.theme.toLowerCase().includes(lower) ||
        (m.sampleSetCode && m.sampleSetCode.toLowerCase().includes(lower))
    );

    if (localHits.length === 0 && /^[a-z]{2,5}\d{2,6}[a-z]?$/i.test(clean)) {
      return [createCustomMinifigMetadata({ figId: clean })];
    }
    return localHits;
  }, [query, remoteResults]);

  const themeChips = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of baseList) {
      map.set(m.theme, (map.get(m.theme) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count);
  }, [baseList]);

  const yearHistogram = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of baseList) {
      if (selectedTheme !== 'ALL' && m.theme !== selectedTheme) continue;
      map.set(m.yearReleased, (map.get(m.yearReleased) ?? 0) + 1);
    }
    const entries = Array.from(map.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year);
    const maxCount = Math.max(1, ...entries.map((e) => e.count));
    return entries.map((e) => ({ ...e, heightPct: Math.max(22, Math.round((e.count / maxCount) * 100)) }));
  }, [baseList, selectedTheme]);

  const filteredMinifigs = useMemo(() => {
    let list = [...baseList];
    if (selectedTheme !== 'ALL') {
      list = list.filter((m) => m.theme === selectedTheme);
    }
    if (selectedYear !== null) {
      list = list.filter((m) => m.yearReleased === selectedYear);
    }
    if (sortBy === 'price_desc') {
      list.sort((a, b) => b.baseMarketPriceEur.used_complete - a.baseMarketPriceEur.used_complete);
    } else if (sortBy === 'name_asc') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => b.yearReleased - a.yearReleased);
    }
    return list;
  }, [baseList, selectedTheme, selectedYear, sortBy]);

  const groupedByYear = useMemo(() => {
    const map = new Map<number, MinifigureMetadata[]>();
    for (const fig of filteredMinifigs) {
      const group = map.get(fig.yearReleased) ?? [];
      group.push(fig);
      map.set(fig.yearReleased, group);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [filteredMinifigs]);

  const partsList = useMemo(() => {
    const clean = query.trim().toLowerCase();
    const out: Array<{
      partNum: string;
      name: string;
      category: string;
      avgPriceEur: number;
      parentFig: MinifigureMetadata;
    }> = [];
    for (const fig of ALL_MINIFIG_CATALOG) {
      for (const p of fig.parts) {
        if (
          !clean ||
          p.partNum.toLowerCase().includes(clean) ||
          p.name.toLowerCase().includes(clean) ||
          fig.figId.toLowerCase().includes(clean)
        ) {
          out.push({
            partNum: p.partNum,
            name: p.name,
            category: p.category,
            avgPriceEur: p.avgPriceEur,
            parentFig: fig
          });
        }
      }
    }
    return out.slice(0, 40);
  }, [query]);

  const setsList = useMemo(() => {
    const clean = query.trim().toLowerCase();
    return ALL_MINIFIG_CATALOG.filter((m) => m.sampleSetCode)
      .filter(
        (m) =>
          !clean ||
          (m.sampleSetCode || '').toLowerCase().includes(clean) ||
          m.theme.toLowerCase().includes(clean) ||
          m.name.toLowerCase().includes(clean)
      )
      .slice(0, 24);
  }, [query]);

  const handleCardAdd = async (fig: MinifigureMetadata) => {
    const cond = cardConds[fig.figId] ?? 'used_complete';
    const qty = cardQtys[fig.figId] ?? 1;
    await onQuickAdd(fig, cond, qty, activeCol?.id ?? null);
    setJustAddedId(fig.figId);
    setTimeout(() => setJustAddedId(null), 1400);
  };

  return (
    <div className="bm-screen" id="catalog-explore-screen">
      {/* Selector superior: Minifiguras | Piezas | Sets */}
      <div className="bm-catalog-head">
        <div className="bm-segmented full" role="tablist" aria-label="Tipo de catálogo">
          <button
            type="button"
            id="catalog-tab-minifigs"
            className={kind === 'minifigs' ? 'active' : ''}
            onClick={() => setKind('minifigs')}
          >
            Minifiguras
          </button>
          <button
            type="button"
            id="catalog-tab-parts"
            className={kind === 'parts' ? 'active' : ''}
            onClick={() => setKind('parts')}
          >
            Piezas
          </button>
          <button
            type="button"
            id="catalog-tab-sets"
            className={kind === 'sets' ? 'active' : ''}
            onClick={() => setKind('sets')}
          >
            Sets
          </button>
        </div>

        {/* Buscador limpio */}
        <div className="bm-search-row">
          <div className="bm-search-input-wrap">
            <Search size={16} className="bm-search-icon" />
            <input
              id="catalog-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                kind === 'parts'
                  ? 'Buscar código de pieza (ej. 973pb...)'
                  : kind === 'sets'
                  ? 'Buscar set o temática...'
                  : 'Buscar por ID o nombre (ej. sw0999, rex)...'
              }
            />
            {isSearchingRemote && <Loader2 size={14} className="spin bm-search-spinner" />}
            {query && !isSearchingRemote && (
              <button
                type="button"
                className="bm-clear-btn"
                onClick={() => setQuery('')}
                aria-label="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {kind === 'minifigs' && (
            <button
              type="button"
              id="btn-catalog-sort"
              className="bm-icon-soft"
              onClick={() =>
                setSortBy((prev) =>
                  prev === 'year_desc'
                    ? 'price_desc'
                    : prev === 'price_desc'
                    ? 'name_asc'
                    : 'year_desc'
                )
              }
              title={`Ordenar (${sortBy === 'year_desc' ? 'Año' : sortBy === 'price_desc' ? 'Precio' : 'Nombre'})`}
            >
              <SlidersHorizontal size={16} />
            </button>
          )}
        </div>
      </div>

      {kind === 'minifigs' && (
        <>
          {/* Chips de temáticas con contador */}
          <div className="bm-theme-chip-strip">
            <button
              type="button"
              className={`bm-theme-chip ${selectedTheme === 'ALL' ? 'active' : ''}`}
              onClick={() => {
                setSelectedTheme('ALL');
                setSelectedYear(null);
              }}
            >
              Todas <span>{baseList.length}</span>
            </button>
            {themeChips.map((chip) => (
              <button
                key={chip.theme}
                type="button"
                className={`bm-theme-chip ${selectedTheme === chip.theme ? 'active' : ''}`}
                onClick={() => {
                  setSelectedTheme(selectedTheme === chip.theme ? 'ALL' : chip.theme);
                  setSelectedYear(null);
                }}
              >
                {chip.theme} <span>{chip.count}</span>
              </button>
            ))}
          </div>

          {/* Mini histograma interactivo por años (estilo vídeo) */}
          {yearHistogram.length > 1 && (
            <div className="bm-year-scrubber" aria-label="Filtrar por año">
              <div className="bm-year-bars">
                {yearHistogram.map((bar) => (
                  <button
                    key={bar.year}
                    type="button"
                    className={`bm-year-bar-btn ${selectedYear === bar.year ? 'active' : ''}`}
                    onClick={() =>
                      setSelectedYear(selectedYear === bar.year ? null : bar.year)
                    }
                    title={`${bar.year}: ${bar.count} figuras`}
                  >
                    <span
                      className="bm-year-bar-fill"
                      style={{ height: `${bar.heightPct}%` }}
                    />
                  </button>
                ))}
              </div>
              <div className="bm-year-caption">
                <span>{yearHistogram[0].year}</span>
                {selectedYear ? (
                  <button
                    type="button"
                    className="bm-link-inline"
                    onClick={() => setSelectedYear(null)}
                  >
                    Año {selectedYear} · Quitar filtro
                  </button>
                ) : (
                  <span>Toca una barra para filtrar por año</span>
                )}
                <span>{yearHistogram[yearHistogram.length - 1].year}</span>
              </div>
            </div>
          )}

          {/* Grid 2 columnas agrupado por año */}
          {groupedByYear.length === 0 ? (
            <div className="bm-empty-card">
              <p>No encontramos figuras para &ldquo;{query}&rdquo;.</p>
            </div>
          ) : (
            groupedByYear.map(([year, figs]) => (
              <section key={year} className="bm-year-group">
                <div className="bm-year-group-head">
                  <strong>{year}</strong>
                  <span>{figs.length}</span>
                </div>

                <div className="bm-grid-2">
                  {figs.map((fig) => {
                    const cond = cardConds[fig.figId] ?? 'used_complete';
                    const qty = cardQtys[fig.figId] ?? 1;
                    const dual = getQuickDualPricesEur(fig, preferredPriceSource);
                    const price = cond === 'new' ? dual.newEur : dual.usedEur;
                    const isAdded = justAddedId === fig.figId;

                    return (
                      <article
                        key={fig.figId}
                        id={`catalog-card-${fig.figId}`}
                        className="bm-catalog-card"
                      >
                        <button
                          type="button"
                          className="bm-catalog-card-top"
                          onClick={() => onOpenMinifigDetail(fig, cond)}
                        >
                          <div className="bm-card-img-box">
                            <img src={fig.imageUrl} alt={fig.name} loading="lazy" />
                          </div>
                          <h3 className="bm-card-title truncate">{fig.name}</h3>
                          <span className="bm-card-code">{fig.figId}</span>
                          <strong className="bm-card-price">€{price.toFixed(2)}</strong>
                        </button>

                        <div className="bm-card-cond-toggle">
                          <button
                            type="button"
                            className={cond !== 'new' ? 'active' : ''}
                            onClick={() =>
                              setCardConds((prev) => ({ ...prev, [fig.figId]: 'used_complete' }))
                            }
                          >
                            Usada
                          </button>
                          <button
                            type="button"
                            className={cond === 'new' ? 'active' : ''}
                            onClick={() =>
                              setCardConds((prev) => ({ ...prev, [fig.figId]: 'new' }))
                            }
                          >
                            Nueva
                          </button>
                        </div>

                        <div className="bm-card-qty-row">
                          <span>Cant.</span>
                          <div className="bm-mini-stepper">
                            <button
                              type="button"
                              onClick={() =>
                                setCardQtys((prev) => ({
                                  ...prev,
                                  [fig.figId]: Math.max(1, (prev[fig.figId] ?? 1) - 1)
                                }))
                              }
                              aria-label="Restar"
                            >
                              <Minus size={12} />
                            </button>
                            <strong>{qty}</strong>
                            <button
                              type="button"
                              onClick={() =>
                                setCardQtys((prev) => ({
                                  ...prev,
                                  [fig.figId]: (prev[fig.figId] ?? 1) + 1
                                }))
                              }
                              aria-label="Sumar"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </div>

                        <div className="bm-card-add-footer">
                          <span className="bm-col-mini-label">
                            <i style={{ backgroundColor: activeColDot }} />
                            {activeCol?.name || 'Mi Colección'}
                          </span>
                          <button
                            type="button"
                            id={`btn-catalog-add-${fig.figId}`}
                            className={`bm-add-inline-btn ${isAdded ? 'added' : ''}`}
                            onClick={() => void handleCardAdd(fig)}
                          >
                            {isAdded ? (
                              <>
                                <Check size={12} /> Añadida
                              </>
                            ) : (
                              '+ Añadir'
                            )}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </>
      )}

      {kind === 'parts' && (
        <div className="bm-list-card">
          {partsList.map((part, idx) => (
            <button
              key={`${part.partNum}-${idx}`}
              type="button"
              className="bm-list-row"
              onClick={() => onOpenMinifigDetail(part.parentFig, 'used_complete')}
            >
              <div className="bm-list-row-left">
                <img
                  src={part.parentFig.imageUrl}
                  alt={part.name}
                  className="bm-thumb-sm"
                />
                <div className="bm-row-text-stack">
                  <span className="bm-row-title truncate">{part.name}</span>
                  <span className="bm-row-sub">
                    {part.partNum} · de {part.parentFig.figId}
                  </span>
                </div>
              </div>
              <div className="bm-list-row-right">
                <strong className="bm-row-price">~€{part.avgPriceEur.toFixed(2)}</strong>
              </div>
            </button>
          ))}
        </div>
      )}

      {kind === 'sets' && (
        <div className="bm-list-card">
          {setsList.map((fig) => (
            <button
              key={fig.figId}
              type="button"
              className="bm-list-row"
              onClick={() => onOpenMinifigDetail(fig, 'used_complete')}
            >
              <div className="bm-list-row-left">
                <img src={fig.imageUrl} alt={fig.name} className="bm-thumb-sm" />
                <div className="bm-row-text-stack">
                  <span className="bm-row-title truncate">{fig.sampleSetCode}</span>
                  <span className="bm-row-sub">
                    {fig.theme} · {fig.yearReleased} · incluye {fig.figId}
                  </span>
                </div>
              </div>
              <div className="bm-list-row-right">
                <span className="bm-row-sub">{fig.appearsInSets} sets</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
