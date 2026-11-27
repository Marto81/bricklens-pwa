import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Plus,
  Search,
  Sparkles,
  X
} from 'lucide-react';
import type {
  CollectionItem,
  MinifigCondition,
  MinifigureMetadata,
  PreferredPriceSource,
  PriceComparisonReport,
  UserCollection
} from '../../types/minifig';
import {
  ALL_MINIFIG_CATALOG,
  createCustomMinifigMetadata
} from '../../data/catalogPresets';
import { PriceAverageCard } from '../shared/PriceAverageCard';

interface PriceComparisonViewProps {
  selectedMinifig: MinifigureMetadata;
  selectedCondition: MinifigCondition;
  preferredPriceSource: PreferredPriceSource;
  collections: UserCollection[];
  activeCollectionId: string | null;
  allItems?: CollectionItem[];
  onSelectCollection: (collectionId: string) => void;
  onCreateCollection: (name: string) => Promise<UserCollection>;
  onChangePreferredSource: (source: PreferredPriceSource) => void;
  onChangeMinifig: (minifig: MinifigureMetadata) => void;
  onChangeCondition: (condition: MinifigCondition) => void;
  onOpenMinifigDetail: (minifig: MinifigureMetadata, condition?: MinifigCondition) => void;
  onAddToCollection: (params: {
    collectionId?: string | null;
    minifig: MinifigureMetadata;
    condition: MinifigCondition;
    quantity: number;
    purchasePriceEur: number;
    estimatedUnitValueEur: number;
    notes?: string;
  }) => Promise<void>;
}

export const PriceComparisonView: React.FC<PriceComparisonViewProps> = ({
  selectedMinifig,
  selectedCondition,
  preferredPriceSource,
  collections,
  activeCollectionId,
  allItems = [],
  onChangeMinifig,
  onChangeCondition,
  onOpenMinifigDetail,
  onAddToCollection
}) => {
  const [subTab, setSubTab] = useState<'inventory' | 'quote'>('inventory');
  const [invSearch, setInvSearch] = useState('');
  const [quoteSearch, setQuoteSearch] = useState('');
  const [latestReport, setLatestReport] = useState<PriceComparisonReport | null>(null);
  const [addedFeedback, setAddedFeedback] = useState(false);

  const filteredInventory = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (it) =>
        it.minifig.name.toLowerCase().includes(q) ||
        it.minifig.figId.toLowerCase().includes(q) ||
        it.minifig.theme.toLowerCase().includes(q)
    );
  }, [allItems, invSearch]);

  const quoteMatches = useMemo(() => {
    const q = quoteSearch.trim().toLowerCase();
    if (!q) return ALL_MINIFIG_CATALOG.slice(0, 6);
    return ALL_MINIFIG_CATALOG.filter(
      (m) =>
        m.figId.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.theme.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [quoteSearch]);

  const handleQuoteCustomCode = () => {
    const clean = quoteSearch.trim();
    if (!clean) return;
    const exact = ALL_MINIFIG_CATALOG.find(
      (m) => m.figId.toLowerCase() === clean.toLowerCase()
    );
    onChangeMinifig(exact ?? createCustomMinifigMetadata({ figId: clean }));
  };

  const handleQuickAddQuoted = async () => {
    const val =
      latestReport?.estimatedMarketValueEur ??
      selectedMinifig.baseMarketPriceEur[selectedCondition];
    await onAddToCollection({
      collectionId: activeCollectionId ?? collections[0]?.id ?? null,
      minifig: selectedMinifig,
      condition: selectedCondition,
      quantity: 1,
      purchasePriceEur: Math.round(val * 0.8 * 100) / 100,
      estimatedUnitValueEur: val,
      notes: 'Añadida desde Tasador 5 Portales'
    });
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 1800);
  };

  return (
    <div className="bm-screen" id="market-sell-screen">
      {/* Cabecera estilo vídeo 01:52: Inventario | Tasar 5 Portales */}
      <header className="bm-market-head">
        <div className="bm-segmented full" role="tablist">
          <button
            type="button"
            id="market-tab-inventory"
            className={subTab === 'inventory' ? 'active' : ''}
            onClick={() => setSubTab('inventory')}
          >
            Inventario ({allItems.length})
          </button>
          <button
            type="button"
            id="market-tab-quote"
            className={subTab === 'quote' ? 'active' : ''}
            onClick={() => setSubTab('quote')}
          >
            Tasar 5 Portales
          </button>
        </div>
      </header>

      {subTab === 'inventory' ? (
        <>
          <div className="bm-search-row">
            <div className="bm-search-input-wrap">
              <Search size={15} className="bm-search-icon" />
              <input
                id="market-inv-search"
                type="text"
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                placeholder="Buscar en tu inventario..."
              />
              {invSearch && (
                <button
                  type="button"
                  className="bm-clear-btn"
                  onClick={() => setInvSearch('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="bm-table-header">
            <span>FIGURA</span>
            <span>PRECIO UE</span>
          </div>

          {filteredInventory.length === 0 ? (
            <div className="bm-empty-inline">
              <p>No hay figuras en tu inventario todavía.</p>
              <button
                type="button"
                className="bm-btn-primary sm"
                onClick={() => setSubTab('quote')}
              >
                Tasar cualquier código
              </button>
            </div>
          ) : (
            <div className="bm-sell-list">
              {filteredInventory.map((item) => {
                const condTxt =
                  item.condition === 'new'
                    ? 'Nueva'
                    : item.condition === 'used_incomplete'
                    ? 'Incompleta'
                    : 'Usada';
                return (
                  <button
                    key={item.id}
                    type="button"
                    id={`sell-row-${item.minifig.figId}`}
                    className="bm-sell-row"
                    onClick={() => {
                      onChangeMinifig(item.minifig);
                      onChangeCondition(item.condition);
                      setSubTab('quote');
                    }}
                  >
                    <img
                      src={item.minifig.imageUrl}
                      alt={item.minifig.name}
                      className="bm-thumb-sm"
                    />
                    <div className="bm-row-text-stack">
                      <span className="bm-row-title truncate">{item.minifig.name}</span>
                      <span className="bm-row-sub">
                        {item.quantity}x · {item.minifig.figId} · {condTxt}
                      </span>
                    </div>
                    <strong className="bm-sell-price">
                      €{(item.estimatedUnitValueEur * item.quantity).toFixed(2)}
                    </strong>
                    <span className="bm-sell-cta">
                      Tasar <ChevronRight size={14} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="bm-quote-stack">
          <div className="bm-search-row">
            <div className="bm-search-input-wrap">
              <Search size={15} className="bm-search-icon" />
              <input
                id="comparator-search-input"
                type="text"
                value={quoteSearch}
                onChange={(e) => setQuoteSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleQuoteCustomCode();
                  }
                }}
                placeholder="Código BrickLink o nombre (ej. sw0999)..."
              />
              {quoteSearch && (
                <button
                  type="button"
                  className="bm-clear-btn"
                  onClick={() => setQuoteSearch('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {quoteSearch.trim() && (
              <button
                type="button"
                id="btn-quote-custom-code"
                className="bm-btn-primary sm"
                onClick={handleQuoteCustomCode}
              >
                <Sparkles size={13} /> Cotizar
              </button>
            )}
          </div>

          <div className="bm-theme-chip-strip">
            {quoteMatches.map((m) => (
              <button
                key={m.figId}
                type="button"
                className={`bm-theme-chip ${selectedMinifig.figId === m.figId ? 'active' : ''}`}
                onClick={() => onChangeMinifig(m)}
              >
                {m.figId.toUpperCase()} · {m.name.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Cabecera limpia de figura tasada */}
          <div className="bm-quote-hero-card">
            <button
              type="button"
              className="bm-quote-hero-top"
              onClick={() => onOpenMinifigDetail(selectedMinifig, selectedCondition)}
            >
              <img
                src={selectedMinifig.imageUrl}
                alt={selectedMinifig.name}
                className="bm-thumb-md"
              />
              <div className="bm-row-text-stack">
                <strong className="bm-row-title truncate">{selectedMinifig.name}</strong>
                <span className="bm-row-sub">
                  {selectedMinifig.figId} · {selectedMinifig.theme} · {selectedMinifig.yearReleased}
                </span>
              </div>
              <ChevronRight size={16} className="muted-icon" />
            </button>

            <div className="bm-segmented full">
              {(
                [
                  { id: 'new', label: 'Nueva' },
                  { id: 'used_complete', label: 'Usada' },
                  { id: 'used_incomplete', label: 'Incompleta' }
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  id={`comp-cond-${c.id}`}
                  className={selectedCondition === c.id ? 'active' : ''}
                  onClick={() => onChangeCondition(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Comparador 5 portales EU (BrickLink, BrickOwl, eBay, Wallapop, Vinted) */}
          <PriceAverageCard
            minifig={selectedMinifig}
            condition={selectedCondition}
            preferredPriceSource={preferredPriceSource}
            defaultExpanded={false}
            onReportChange={setLatestReport}
          />

          <button
            type="button"
            id="btn-comp-add-collection"
            className="bm-btn-primary full"
            onClick={() => void handleQuickAddQuoted()}
          >
            {addedFeedback ? (
              <>
                <CheckCircle2 size={16} /> Añadida a tu colección
              </>
            ) : (
              <>
                <Plus size={16} /> Añadir a &ldquo;
                {collections.find((c) => c.id === activeCollectionId)?.name ||
                  collections[0]?.name ||
                  'Mi Colección'}
                &rdquo;
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
