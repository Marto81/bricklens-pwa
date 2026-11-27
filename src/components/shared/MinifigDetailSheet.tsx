import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  ExternalLink,
  Minus,
  Plus,
  RefreshCw,
  Share2,
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
import { COLLECTION_DOT_COLORS } from '../../db/collectionDb';
import { enrichMinifigMetadata, fetchHybridPriceReport } from '../../services/catalogService';
import {
  computeMissingPartsAdjustment,
  generatePriceComparisonReport,
  getPartMarketplaceLinks,
  resolvePreferredPriceFromQuotes
} from '../../services/priceAggregator';
import { PriceAverageCard } from './PriceAverageCard';

interface MinifigDetailSheetProps {
  open: boolean;
  minifig: MinifigureMetadata | null;
  collectionItem?: CollectionItem | null;
  allItems?: CollectionItem[];
  initialCondition?: MinifigCondition;
  initialMissingPartNums?: string[];
  initialExpandParts?: boolean;
  preferredPriceSource: PreferredPriceSource;
  collections: UserCollection[];
  activeCollectionId: string | null;
  onClose: () => void;
  onChangePreferredSource?: (next: PreferredPriceSource) => void;
  onUpdateCollectionItemMissingParts?: (
    itemId: string,
    missingPartNums: string[],
    enrichedMinifig?: MinifigureMetadata
  ) => Promise<void>;
  onUpdateCollectionItemDetails?: (
    itemId: string,
    purchasePriceEur: number,
    marketValueEur: number,
    notes: string,
    extras?: {
      condition?: MinifigCondition;
      quantity?: number;
      missingPartNums?: string[];
      minifig?: MinifigureMetadata;
    }
  ) => Promise<void>;
  onAddNewToCollection?: (params: {
    collectionId?: string | null;
    minifig: MinifigureMetadata;
    condition: MinifigCondition;
    quantity: number;
    purchasePriceEur: number;
    estimatedUnitValueEur: number;
    missingPartNums?: string[];
    notes?: string;
  }) => Promise<void>;
}

const PART_CATEGORY_LABELS: Record<string, string> = {
  headgear: 'Casco / Pelo',
  head: 'Cabeza',
  torso: 'Torso',
  legs: 'Piernas',
  accessory: 'Accesorio'
};

const SOURCE_OPTIONS: Array<{ id: PreferredPriceSource; label: string; badge: string }> = [
  { id: 'weighted', label: 'Media UE (5 portales)', badge: 'UE' },
  { id: 'bricklink_sold', label: 'BrickLink (6m vendidos)', badge: 'BL' },
  { id: 'bricklink_stock', label: 'BrickLink (En venta)', badge: 'BL' },
  { id: 'ebay', label: 'eBay España / UE', badge: 'eB' },
  { id: 'c2c_eu', label: 'Wallapop / Vinted UE', badge: 'C2C' }
];

export const MinifigDetailSheet: React.FC<MinifigDetailSheetProps> = ({
  open,
  minifig,
  collectionItem,
  allItems = [],
  initialCondition = 'used_complete',
  initialMissingPartNums,
  initialExpandParts = false,
  preferredPriceSource,
  collections,
  activeCollectionId,
  onClose,
  onChangePreferredSource,
  onUpdateCollectionItemMissingParts,
  onUpdateCollectionItemDetails,
  onAddNewToCollection
}) => {
  const [resolvedFig, setResolvedFig] = useState<MinifigureMetadata | null>(minifig);
  const [isEnriching, setIsEnriching] = useState(false);
  const [condition, setCondition] = useState<MinifigCondition>(
    collectionItem?.condition ?? initialCondition
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [missingParts, setMissingParts] = useState<string[]>(
    collectionItem?.missingPartNums ?? initialMissingPartNums ?? []
  );
  const [liveUsedReport, setLiveUsedReport] = useState<PriceComparisonReport | null>(null);
  const [liveNewReport, setLiveNewReport] = useState<PriceComparisonReport | null>(null);
  const [targetCollectionId, setTargetCollectionId] = useState<string>(activeCollectionId ?? '');
  const [showPriceSourceModal, setShowPriceSourceModal] = useState(false);
  const [showAdvancedPortals, setShowAdvancedPortals] = useState(false);
  const [partsExpanded, setPartsExpanded] = useState(false);
  const [setsExpanded, setSetsExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [showColPicker, setShowColPicker] = useState(false);

  useEffect(() => {
    if (!open || !minifig) return;
    setResolvedFig(minifig);
    setCondition(collectionItem?.condition ?? initialCondition);
    setQuantity(1);
    setMissingParts(collectionItem?.missingPartNums ?? initialMissingPartNums ?? []);
    setLiveUsedReport(null);
    setLiveNewReport(null);
    setTargetCollectionId(
      collectionItem?.collectionId ?? activeCollectionId ?? collections[0]?.id ?? ''
    );
    setShowPriceSourceModal(false);
    setShowAdvancedPortals(false);
    setPartsExpanded(
      initialExpandParts ||
        Boolean(collectionItem?.missingPartNums && collectionItem.missingPartNums.length > 0)
    );
    setSetsExpanded(false);
    setSavedToast(null);
    setShowColPicker(false);

    let cancelled = false;
    const loadRealParts = async () => {
      setIsEnriching(true);
      try {
        const { minifig: enriched } = await enrichMinifigMetadata(minifig, false);
        if (!cancelled) {
          setResolvedFig(enriched);
        }
      } finally {
        if (!cancelled) setIsEnriching(false);
      }
    };
    void loadRealParts();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    minifig,
    collectionItem,
    initialCondition,
    initialMissingPartNums,
    initialExpandParts,
    activeCollectionId,
    collections
  ]);

  // Hidratar precios híbridos en vivo (BrickLink/Brickset + anotados por usuario) al abrir la ficha
  useEffect(() => {
    if (!open || !minifig) return;
    let cancelled = false;
    const loadLivePrices = async () => {
      const [usedRep, newRep] = await Promise.all([
        fetchHybridPriceReport(minifig, 'used_complete', preferredPriceSource, false),
        fetchHybridPriceReport(minifig, 'new', preferredPriceSource, false)
      ]);
      if (!cancelled) {
        setLiveUsedReport(usedRep);
        setLiveNewReport(newRep);
      }
    };
    void loadLivePrices();
    return () => {
      cancelled = true;
    };
  }, [open, minifig, preferredPriceSource]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPriceSourceModal) setShowPriceSourceModal(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, showPriceSourceModal, onClose]);

  const activeFig = resolvedFig ?? minifig;

  const usedPriceEur = useMemo(() => {
    if (!activeFig) return 0;
    if (liveUsedReport) return liveUsedReport.estimatedMarketValueEur;
    return generatePriceComparisonReport(activeFig, 'used_complete', preferredPriceSource)
      .estimatedMarketValueEur;
  }, [activeFig, liveUsedReport, preferredPriceSource]);

  const newPriceEur = useMemo(() => {
    if (!activeFig) return 0;
    if (liveNewReport) return liveNewReport.estimatedMarketValueEur;
    return generatePriceComparisonReport(activeFig, 'new', preferredPriceSource)
      .estimatedMarketValueEur;
  }, [activeFig, liveNewReport, preferredPriceSource]);

  const baseCompleteReferenceEur = useMemo(() => {
    if (!activeFig) return 0;
    if (condition === 'new') return newPriceEur;
    if (liveUsedReport) return liveUsedReport.estimatedMarketValueEur;
    if (collectionItem?.baseCompleteUnitValueEur) {
      return collectionItem.baseCompleteUnitValueEur;
    }
    return usedPriceEur;
  }, [activeFig, condition, newPriceEur, usedPriceEur, liveUsedReport, collectionItem]);

  const missingSummary = useMemo(() => {
    if (!activeFig) {
      return computeMissingPartsAdjustment(0, [], []);
    }
    return computeMissingPartsAdjustment(baseCompleteReferenceEur, activeFig.parts, missingParts);
  }, [activeFig, baseCompleteReferenceEur, missingParts]);

  const myEntries = useMemo(() => {
    if (!activeFig) return [];
    return allItems.filter(
      (it) => it.minifig.figId.toLowerCase() === activeFig.figId.toLowerCase()
    );
  }, [allItems, activeFig]);

  if (!open || !activeFig) return null;

  const displayPrimaryPriceEur =
    missingParts.length > 0
      ? missingSummary.adjustedValueEur
      : condition === 'new'
      ? newPriceEur
      : usedPriceEur;

  const displaySecondaryPriceEur = condition === 'new' ? usedPriceEur : newPriceEur;
  const activeConditionReport = condition === 'new' ? liveNewReport : liveUsedReport;

  const activeSourceObj =
    SOURCE_OPTIONS.find((s) => s.id === preferredPriceSource) ?? SOURCE_OPTIONS[0];

  const selectedCol =
    collections.find((c) => c.id === targetCollectionId) ?? collections[0] ?? null;
  const selectedColDot = selectedCol?.color || COLLECTION_DOT_COLORS[0];

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(activeFig.figId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1400);
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    const shareText = `${activeFig.name} (${activeFig.figId}) · €${displayPrimaryPriceEur.toFixed(2)} en BrickLens`;
    try {
      if (navigator.share) {
        await navigator.share({ title: activeFig.name, text: shareText });
      } else {
        await navigator.clipboard.writeText(shareText);
        setSavedToast('Resumen copiado al portapapeles');
        setTimeout(() => setSavedToast(null), 1800);
      }
    } catch {
      // ignore cancel
    }
  };

  const handleTogglePartMissing = async (partNum: string) => {
    const exists = missingParts.some((p) => p.toLowerCase() === partNum.toLowerCase());
    const nextMissing = exists
      ? missingParts.filter((p) => p.toLowerCase() !== partNum.toLowerCase())
      : [...missingParts, partNum];

    setMissingParts(nextMissing);
    if (nextMissing.length > 0 && condition !== 'used_incomplete') {
      setCondition('used_incomplete');
    } else if (nextMissing.length === 0 && condition === 'used_incomplete') {
      setCondition('used_complete');
    }

    if (collectionItem && onUpdateCollectionItemMissingParts) {
      await onUpdateCollectionItemMissingParts(collectionItem.id, nextMissing, activeFig);
      setSavedToast(
        nextMissing.length > 0
          ? `Descontado -€${computeMissingPartsAdjustment(baseCompleteReferenceEur, activeFig.parts, nextMissing).missingCostEur.toFixed(2)}`
          : 'Figura completa al 100%'
      );
      setTimeout(() => setSavedToast(null), 2200);
    }
  };

  const handleRefreshRebrickable = async () => {
    setIsEnriching(true);
    try {
      const { minifig: enriched } = await enrichMinifigMetadata(activeFig, true);
      setResolvedFig(enriched);
    } finally {
      setIsEnriching(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (collectionItem && onUpdateCollectionItemDetails) {
      await onUpdateCollectionItemDetails(
        collectionItem.id,
        collectionItem.purchasePriceEur,
        displayPrimaryPriceEur,
        collectionItem.missingPartsNotes ?? '',
        {
          condition: missingParts.length > 0 ? 'used_incomplete' : condition,
          missingPartNums: missingParts,
          minifig: activeFig
        }
      );
      setSavedToast('Actualizada en tu colección');
      setTimeout(() => setSavedToast(null), 1800);
      return;
    }

    if (onAddNewToCollection) {
      await onAddNewToCollection({
        collectionId: selectedCol?.id ?? activeCollectionId,
        minifig: activeFig,
        condition: missingParts.length > 0 ? 'used_incomplete' : condition,
        quantity,
        purchasePriceEur: Math.round(displayPrimaryPriceEur * 0.8 * 100) / 100,
        estimatedUnitValueEur: displayPrimaryPriceEur,
        missingPartNums: missingParts.length > 0 ? missingParts : undefined,
        notes:
          missingParts.length > 0
            ? `Faltan ${missingParts.length} pieza(s)`
            : 'Añadida desde ficha'
      });
      setSavedToast(`Añadida a ${selectedCol?.name || 'Mi Colección'}`);
      setTimeout(() => {
        setSavedToast(null);
      }, 1800);
    }
  };

  return (
    <div
      className="bm-detail-page"
      id="minifig-detail-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de ${activeFig.name}`}
    >
      {/* Top Bar limpio estilo push view iOS */}
      <header className="bm-detail-topbar">
        <button
          type="button"
          id="btn-close-detail-sheet"
          className="bm-icon-ghost"
          onClick={onClose}
          aria-label="Volver"
        >
          <ChevronLeft size={22} />
        </button>

        <div className="bm-detail-top-actions">
          <button
            type="button"
            className="bm-icon-ghost"
            onClick={() => void handleShare()}
            aria-label="Compartir"
          >
            <Share2 size={18} />
          </button>
          <a
            href={`https://www.bricklink.com/v2/catalog/catalogitem.page?M=${encodeURIComponent(activeFig.figId)}#T=P`}
            target="_blank"
            rel="noopener noreferrer"
            className="bm-icon-ghost"
            aria-label="Abrir en BrickLink"
            title="Abrir en BrickLink"
          >
            <ExternalLink size={18} />
          </a>
        </div>
      </header>

      <div className="bm-detail-scroll">
        {/* Hero figura centrada */}
        <div className="bm-detail-hero">
          <div className="bm-detail-photo">
            <img src={activeFig.imageUrl} alt={activeFig.name} />
          </div>
          <h1 className="bm-detail-title">{activeFig.name}</h1>
          <div className="bm-detail-meta">
            <span>MINIFIGURA · {activeFig.figId}</span>
            <button
              type="button"
              className="bm-copy-inline"
              onClick={() => void handleCopyId()}
              aria-label="Copiar código"
              title="Copiar código BrickLink"
            >
              {copiedId ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <span className="bm-detail-year">
            {activeFig.yearReleased} · {activeFig.theme}
          </span>
        </div>

        {/* Tarjeta limpia de precio + Usada/Nueva + Cantidad + Fuente de precio */}
        <section className="bm-detail-price-card">
          <div className="bm-detail-price-row">
            <div className="bm-detail-price-left">
              <strong className="bm-detail-main-price">€{displayPrimaryPriceEur.toFixed(2)}</strong>
              <span className="bm-detail-alt-price">
                {condition === 'new' ? 'Usada' : 'Nueva'} €{displaySecondaryPriceEur.toFixed(2)}
              </span>
            </div>

            <div className="bm-detail-price-right">
              <div className="bm-segmented compact">
                <button
                  type="button"
                  className={condition !== 'new' ? 'active' : ''}
                  onClick={() =>
                    setCondition(missingParts.length > 0 ? 'used_incomplete' : 'used_complete')
                  }
                >
                  Usada
                </button>
                <button
                  type="button"
                  className={condition === 'new' ? 'active' : ''}
                  onClick={() => {
                    setCondition('new');
                    if (missingParts.length > 0) setMissingParts([]);
                  }}
                >
                  Nueva
                </button>
              </div>

              {!collectionItem && (
                <div className="bm-mini-stepper wide">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    aria-label="Restar cantidad"
                  >
                    <Minus size={14} />
                  </button>
                  <strong>{quantity}</strong>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    aria-label="Sumar cantidad"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            id="btn-open-price-source"
            className="bm-detail-subrow-btn"
            onClick={() => setShowPriceSourceModal(true)}
          >
            <span className="bm-muted-inline">Fuente de precio</span>
            <span className="bm-source-pill-inline">
              <i className="bm-source-badge">{activeSourceObj.badge}</i>
              {activeSourceObj.label}
              <ChevronRight size={15} />
            </span>
          </button>
        </section>

        {savedToast && (
          <div className="bm-inline-toast" role="status">
            <CheckCircle2 size={15} />
            {savedToast}
          </div>
        )}

        {/* Fila expandible: Piezas (Despiece interactivo + descuento faltantes) */}
        <section className="bm-detail-group" id="parts-checklist-section">
          <button
            type="button"
            id="btn-toggle-parts-section"
            className="bm-detail-chevron-row"
            onClick={() => setPartsExpanded((v) => !v)}
          >
            <span className="bm-chevron-row-title">
              Piezas
              {missingSummary.missingCount > 0 && (
                <span className="bm-missing-pill">
                  -{missingSummary.missingCount} falta{missingSummary.missingCount > 1 ? 'n' : ''}
                </span>
              )}
            </span>
            <span className="bm-chevron-row-right">
              <span className="bm-count-muted">{activeFig.parts.length}</span>
              <ChevronRight
                size={16}
                className={partsExpanded ? 'bm-rot-90' : ''}
              />
            </span>
          </button>

          {partsExpanded && (
            <div className="bm-parts-drawer">
              <div className="bm-parts-drawer-head">
                <p>
                  Toca cualquier pieza que te falte: descontamos su valor y te damos enlace directo
                  al repuesto.
                </p>
                <button
                  type="button"
                  className="bm-icon-soft sm"
                  onClick={() => void handleRefreshRebrickable()}
                  disabled={isEnriching}
                  title="Actualizar despiece desde Rebrickable"
                >
                  <RefreshCw size={13} className={isEnriching ? 'spin' : ''} />
                </button>
              </div>

              {missingSummary.missingCount > 0 && (
                <div className="bm-deduction-box" id="missing-deduction-banner">
                  <div>
                    <span>Completa</span>
                    <strong>€{missingSummary.baseCompleteValueEur.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span>Faltantes</span>
                    <strong className="negative">-€{missingSummary.missingCostEur.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span>Valor ajustado</span>
                    <strong className="accent">€{missingSummary.adjustedValueEur.toFixed(2)}</strong>
                  </div>
                </div>
              )}

              <div className="bm-parts-list">
                {activeFig.parts.map((part) => {
                  const isMissing = missingParts.some(
                    (p) => p.toLowerCase() === part.partNum.toLowerCase()
                  );
                  const links = getPartMarketplaceLinks(part, activeFig.figId);

                  return (
                    <div
                      key={part.partNum}
                      id={`part-row-${part.partNum}`}
                      className={`bm-part-row ${isMissing ? 'missing' : ''}`}
                    >
                      <button
                        type="button"
                        className="bm-part-toggle"
                        onClick={() => void handleTogglePartMissing(part.partNum)}
                      >
                        <span className={`bm-part-check ${isMissing ? 'missing' : 'owned'}`}>
                          {isMissing ? <X size={12} /> : <Check size={12} />}
                        </span>
                        <div className="bm-part-info">
                          <span className="bm-part-cat">
                            {PART_CATEGORY_LABELS[part.category] || 'Pieza'} · {part.partNum}
                          </span>
                          <strong>{part.name}</strong>
                        </div>
                        <div className="bm-part-cost">
                          <span>~€{part.avgPriceEur.toFixed(2)}</span>
                          <small className={isMissing ? 'negative' : 'positive'}>
                            {isMissing ? 'Falta' : 'La tengo'}
                          </small>
                        </div>
                      </button>

                      {isMissing && (
                        <div className="bm-part-buy-row">
                          <span>
                            <CircleAlert size={12} /> Comprar repuesto:
                          </span>
                          <a href={links.bricklinkUrl} target="_blank" rel="noopener noreferrer">
                            BrickLink <ExternalLink size={11} />
                          </a>
                          <a href={links.brickowlUrl} target="_blank" rel="noopener noreferrer">
                            BrickOwl <ExternalLink size={11} />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bm-row-sep" />

          {/* En sets */}
          <button
            type="button"
            className="bm-detail-chevron-row"
            onClick={() => setSetsExpanded((v) => !v)}
          >
            <span className="bm-chevron-row-title">En sets</span>
            <span className="bm-chevron-row-right">
              <span className="bm-count-muted">{activeFig.appearsInSets}</span>
              <ChevronRight size={16} className={setsExpanded ? 'bm-rot-90' : ''} />
            </span>
          </button>

          {setsExpanded && (
            <div className="bm-sets-drawer">
              <p>
                Aparece en <strong>{activeFig.appearsInSets}</strong> set(s) oficiales.
                {activeFig.sampleSetCode ? ` Referencia principal: ${activeFig.sampleSetCode}.` : ''}
              </p>
            </div>
          )}
        </section>

        {/* Mis entradas */}
        <section className="bm-entries-section">
          <h3>Mis entradas</h3>
          {myEntries.length === 0 ? (
            <p className="bm-entries-empty">Aún no tienes esta minifigura en tu inventario.</p>
          ) : (
            <div className="bm-entries-table">
              <div className="bm-entries-head">
                <span>COLECCIÓN</span>
                <span>CANT.</span>
                <span>PRECIO</span>
                <span>FECHA</span>
              </div>
              {myEntries.map((entry) => {
                const col = collections.find((c) => c.id === entry.collectionId);
                return (
                  <div key={entry.id} className="bm-entries-row">
                    <span className="truncate">{col?.name || 'Colección'}</span>
                    <span>{entry.quantity}</span>
                    <span>€{entry.estimatedUnitValueEur.toFixed(2)}</span>
                    <span>
                      {new Date(entry.addedAtIso).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short'
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Barra fija inferior: Selector de colección + Botón principal Brick Vermilion */}
      <footer className="bm-detail-bottom-bar">
        {!collectionItem && (
          <div className="bm-col-dropdown-wrap">
            <button
              type="button"
              id="btn-detail-col-picker"
              className="bm-col-pill-btn"
              onClick={() => setShowColPicker((v) => !v)}
            >
              <span
                className="bm-color-dot"
                style={{ backgroundColor: selectedColDot }}
              />
              <span className="truncate">{selectedCol?.name || 'Mi Colección'}</span>
            </button>

            {showColPicker && (
              <div className="bm-col-popover">
                {collections.map((col, idx) => (
                  <button
                    key={col.id}
                    type="button"
                    className={col.id === selectedCol?.id ? 'active' : ''}
                    onClick={() => {
                      setTargetCollectionId(col.id);
                      setShowColPicker(false);
                    }}
                  >
                    <span
                      className="bm-color-dot"
                      style={{
                        backgroundColor:
                          col.color || COLLECTION_DOT_COLORS[idx % COLLECTION_DOT_COLORS.length]
                      }}
                    />
                    <span className="truncate">{col.name}</span>
                    {col.id === selectedCol?.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          id="btn-sheet-primary-save"
          className="bm-btn-primary flex-1"
          onClick={() => void handlePrimaryAction()}
        >
          {collectionItem
            ? `Guardar · €${displayPrimaryPriceEur.toFixed(2)}`
            : `+ Añadir a "${selectedCol?.name || 'Colección'}" · €${(
                displayPrimaryPriceEur * quantity
              ).toFixed(2)}`}
        </button>
      </footer>

      {/* Modal limpio de Fuente de Precio + Desglose 5 Portales UE (estilo vídeo 00:57) */}
      {showPriceSourceModal && (
        <div
          className="bm-modal-backdrop"
          id="price-source-modal-backdrop"
          onClick={() => setShowPriceSourceModal(false)}
        >
          <div
            className="bm-modal-sheet"
            id="price-source-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bm-modal-head">
              <strong>Fuente de precio</strong>
              <div className="bm-modal-head-right">
                <div className="bm-segmented compact">
                  <button
                    type="button"
                    className={condition !== 'new' ? 'active' : ''}
                    onClick={() =>
                      setCondition(missingParts.length > 0 ? 'used_incomplete' : 'used_complete')
                    }
                  >
                    Usada
                  </button>
                  <button
                    type="button"
                    className={condition === 'new' ? 'active' : ''}
                    onClick={() => setCondition('new')}
                  >
                    Nueva
                  </button>
                </div>
                <button
                  type="button"
                  className="bm-icon-soft sm"
                  onClick={() => setShowPriceSourceModal(false)}
                  aria-label="Cerrar fuentes de precio"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="bm-radio-list">
              {SOURCE_OPTIONS.map((opt) => {
                const quoteVal = activeConditionReport
                  ? resolvePreferredPriceFromQuotes(activeConditionReport.quotes, opt.id)
                  : generatePriceComparisonReport(
                      activeFig,
                      condition === 'new' ? 'new' : 'used_complete',
                      opt.id
                    ).estimatedMarketValueEur;
                const active = preferredPriceSource === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    id={`price-source-opt-${opt.id}`}
                    className={`bm-radio-row ${active ? 'active' : ''}`}
                    onClick={() => {
                      onChangePreferredSource?.(opt.id);
                    }}
                  >
                    <div className="bm-radio-left">
                      <span className="bm-source-badge">{opt.badge}</span>
                      <span>{opt.label}</span>
                    </div>
                    <div className="bm-radio-right">
                      <strong>€{quoteVal.toFixed(2)}</strong>
                      <span className={`bm-radio-circle ${active ? 'checked' : ''}`}>
                        {active && <Check size={11} />}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="bm-switch-row">
              <span>Ver los 5 portales UE y editar precios</span>
              <button
                type="button"
                id="btn-toggle-advanced-portals"
                role="switch"
                aria-checked={showAdvancedPortals}
                className={`bm-switch ${showAdvancedPortals ? 'on' : ''}`}
                onClick={() => setShowAdvancedPortals((v) => !v)}
              >
                <span />
              </button>
            </div>

            {showAdvancedPortals && (
              <div className="bm-modal-portals-wrap">
                <PriceAverageCard
                  minifig={activeFig}
                  condition={condition === 'new' ? 'new' : 'used_complete'}
                  preferredPriceSource={preferredPriceSource}
                  defaultExpanded
                  compact
                  onReportChange={(rep) => {
                    if (rep.condition === 'new') setLiveNewReport(rep);
                    else setLiveUsedReport(rep);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
