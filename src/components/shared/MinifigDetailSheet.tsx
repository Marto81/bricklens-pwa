import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Layers,
  PackageCheck,
  Plus,
  RefreshCw,
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
import { enrichMinifigMetadata } from '../../services/catalogService';
import {
  computeMissingPartsAdjustment,
  generatePriceComparisonReport,
  getPartMarketplaceLinks
} from '../../services/priceAggregator';
import { PriceAverageCard } from './PriceAverageCard';

interface MinifigDetailSheetProps {
  open: boolean;
  minifig: MinifigureMetadata | null;
  collectionItem?: CollectionItem | null;
  initialCondition?: MinifigCondition;
  initialMissingPartNums?: string[];
  preferredPriceSource: PreferredPriceSource;
  collections: UserCollection[];
  activeCollectionId: string | null;
  onClose: () => void;
  onUpdateCollectionItemMissingParts?: (
    itemId: string,
    missingPartNums: string[],
    enrichedMinifig?: MinifigureMetadata
  ) => Promise<void>;
  onUpdateCollectionItemDetails?: (
    itemId: string,
    purchasePriceEur: number,
    marketValueEur: number,
    notes: string
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

export const MinifigDetailSheet: React.FC<MinifigDetailSheetProps> = ({
  open,
  minifig,
  collectionItem,
  initialCondition = 'used_complete',
  initialMissingPartNums,
  preferredPriceSource,
  collections,
  activeCollectionId,
  onClose,
  onUpdateCollectionItemMissingParts,
  onUpdateCollectionItemDetails,
  onAddNewToCollection
}) => {
  const [resolvedFig, setResolvedFig] = useState<MinifigureMetadata | null>(minifig);
  const [isEnriching, setIsEnriching] = useState(false);
  const [condition, setCondition] = useState<MinifigCondition>(
    collectionItem?.condition ?? initialCondition
  );
  const [missingParts, setMissingParts] = useState<string[]>(
    collectionItem?.missingPartNums ?? initialMissingPartNums ?? []
  );
  const [latestReport, setLatestReport] = useState<PriceComparisonReport | null>(null);
  const [targetCollectionId, setTargetCollectionId] = useState<string>(activeCollectionId ?? '');
  const [paidInput, setPaidInput] = useState<string>(
    collectionItem ? collectionItem.purchasePriceEur.toFixed(2) : ''
  );
  const [notesInput, setNotesInput] = useState<string>(collectionItem?.missingPartsNotes ?? '');
  const [savedToast, setSavedToast] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !minifig) return;
    setResolvedFig(minifig);
    setCondition(collectionItem?.condition ?? initialCondition);
    setMissingParts(collectionItem?.missingPartNums ?? initialMissingPartNums ?? []);
    setTargetCollectionId(collectionItem?.collectionId ?? activeCollectionId ?? collections[0]?.id ?? '');
    setPaidInput(collectionItem ? collectionItem.purchasePriceEur.toFixed(2) : '');
    setNotesInput(collectionItem?.missingPartsNotes ?? '');
    setSavedToast(null);

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

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', handleKey);
    };
  }, [
    open,
    minifig,
    collectionItem,
    initialCondition,
    initialMissingPartNums,
    activeCollectionId,
    collections,
    onClose
  ]);

  const activeFig = resolvedFig ?? minifig;

  const baseCompleteReferenceEur = useMemo(() => {
    if (!activeFig) return 0;
    if (collectionItem?.baseCompleteUnitValueEur) {
      return collectionItem.baseCompleteUnitValueEur;
    }
    if (latestReport && condition !== 'used_incomplete') {
      return latestReport.estimatedMarketValueEur;
    }
    return generatePriceComparisonReport(
      activeFig,
      condition === 'new' ? 'new' : 'used_complete',
      preferredPriceSource
    ).estimatedMarketValueEur;
  }, [activeFig, collectionItem, latestReport, condition, preferredPriceSource]);

  const missingSummary = useMemo(() => {
    if (!activeFig) {
      return computeMissingPartsAdjustment(0, [], []);
    }
    return computeMissingPartsAdjustment(baseCompleteReferenceEur, activeFig.parts, missingParts);
  }, [activeFig, baseCompleteReferenceEur, missingParts]);

  if (!open || !activeFig) return null;

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
          ? `Valor ajustado (-${computeMissingPartsAdjustment(baseCompleteReferenceEur, activeFig.parts, nextMissing).missingCostEur.toFixed(2)} €)`
          : 'Figura marcada como completa'
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

  const handleSaveDetailsOrAdd = async () => {
    const paid = Number(paidInput.replace(',', '.'));
    const safePaid =
      Number.isFinite(paid) && paid >= 0
        ? paid
        : Math.round(missingSummary.adjustedValueEur * 0.8 * 100) / 100;

    if (collectionItem && onUpdateCollectionItemDetails) {
      await onUpdateCollectionItemDetails(
        collectionItem.id,
        safePaid,
        missingSummary.adjustedValueEur,
        notesInput.trim()
      );
      if (onUpdateCollectionItemMissingParts) {
        await onUpdateCollectionItemMissingParts(collectionItem.id, missingParts, activeFig);
      }
      setSavedToast('Cambios guardados en tu colección');
      setTimeout(() => setSavedToast(null), 2200);
      return;
    }

    if (onAddNewToCollection) {
      await onAddNewToCollection({
        collectionId: targetCollectionId || activeCollectionId,
        minifig: activeFig,
        condition: missingParts.length > 0 ? 'used_incomplete' : condition,
        quantity: 1,
        purchasePriceEur: safePaid,
        estimatedUnitValueEur: missingSummary.adjustedValueEur,
        missingPartNums: missingParts.length > 0 ? missingParts : undefined,
        notes:
          notesInput.trim() ||
          (missingParts.length > 0
            ? `Faltan ${missingParts.length} pieza(s)`
            : 'Añadida desde ficha detallada')
      });
      setSavedToast('Guardada en tu colección');
      setTimeout(() => {
        setSavedToast(null);
        onClose();
      }, 950);
    }
  };

  return (
    <div
      className="sheet-backdrop"
      id="minifig-detail-sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle y despiece de ${activeFig.name}`}
    >
      <div
        className="bottom-sheet"
        id="minifig-detail-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-drag-handle" aria-hidden="true" />

        <div className="sheet-header">
          <div className="sheet-fig-identity">
            <img src={activeFig.imageUrl} alt={activeFig.name} className="sheet-fig-thumb" />
            <div className="sheet-fig-title-col">
              <div className="fig-id-row">
                <span className="fig-code-badge mono">{activeFig.figId.toUpperCase()}</span>
                <span className="fig-theme-label">{activeFig.theme}</span>
                {activeFig.yearReleased > 0 && (
                  <span className="fig-year-label">· {activeFig.yearReleased}</span>
                )}
              </div>
              <h2 className="sheet-title">{activeFig.name}</h2>
              {activeFig.sampleSetCode && (
                <span className="sheet-sub-meta">
                  {activeFig.appearsInSets > 1
                    ? `${activeFig.appearsInSets} sets · ej. ${activeFig.sampleSetCode}`
                    : activeFig.sampleSetCode}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            id="btn-close-detail-sheet"
            className="icon-btn"
            onClick={onClose}
            aria-label="Cerrar ficha"
          >
            <X size={16} />
          </button>
        </div>

        <div className="sheet-body">
          {/* Selector de estado */}
          <div className="condition-pills-compact">
            {(
              [
                { id: 'new', label: 'Nueva' },
                { id: 'used_complete', label: 'Usada completa' },
                { id: 'used_incomplete', label: 'Incompleta' }
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`cond-mini-pill ${condition === opt.id ? 'active' : ''}`}
                onClick={() => setCondition(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Media de mercado + desglose desplegable 5 portales */}
          <PriceAverageCard
            minifig={activeFig}
            condition={condition}
            preferredPriceSource={preferredPriceSource}
            compact
            onReportChange={setLatestReport}
          />

          {/* Despiece interactivo (Checklist de piezas) */}
          <section className="sheet-section" id="parts-checklist-section">
            <div className="sheet-section-head">
              <div>
                <span className="eyebrow">Despiece interactivo ({activeFig.parts.length} piezas)</span>
                <p className="sheet-section-sub">
                  Toca cualquier pieza si te falta: descontamos su coste y te damos enlace para
                  comprarla.
                </p>
              </div>
              <button
                type="button"
                className="tiny-action-btn"
                onClick={() => void handleRefreshRebrickable()}
                disabled={isEnriching}
                title="Consultar despiece oficial en Rebrickable"
              >
                <RefreshCw size={12} className={isEnriching ? 'spin' : ''} />
              </button>
            </div>

            <div className="parts-progress-bar-wrap">
              <div className="parts-progress-meta">
                <span className="parts-progress-label">
                  {missingSummary.missingCount === 0 ? (
                    <>
                      <PackageCheck size={14} /> Completa ({missingSummary.ownedCount}/
                      {missingSummary.totalParts})
                    </>
                  ) : (
                    <>
                      <CircleAlert size={14} /> Faltan {missingSummary.missingCount} de{' '}
                      {missingSummary.totalParts} piezas ({missingSummary.completionPct}%)
                    </>
                  )}
                </span>
                {activeFig.partsSource === 'rebrickable_live' && (
                  <span className="quote-source-tag live_api">Rebrickable</span>
                )}
              </div>
              <div className="parts-progress-track">
                <div
                  className={`parts-progress-fill ${missingSummary.missingCount > 0 ? 'incomplete' : ''}`}
                  style={{ width: `${missingSummary.completionPct}%` }}
                />
              </div>
            </div>

            {missingSummary.missingCount > 0 && (
              <div className="missing-deduction-banner" id="missing-deduction-banner">
                <div className="deduction-col">
                  <span>Completa</span>
                  <strong className="mono">{missingSummary.baseCompleteValueEur.toFixed(2)} €</strong>
                </div>
                <div className="deduction-col negative">
                  <span>Faltantes</span>
                  <strong className="mono">-{missingSummary.missingCostEur.toFixed(2)} €</strong>
                </div>
                <div className="deduction-col accent">
                  <span>Valor ajustado</span>
                  <strong className="mono">{missingSummary.adjustedValueEur.toFixed(2)} €</strong>
                </div>
              </div>
            )}

            <div className="parts-checklist-list">
              {activeFig.parts.map((part) => {
                const isMissing = missingParts.some(
                  (p) => p.toLowerCase() === part.partNum.toLowerCase()
                );
                const buyLinks = getPartMarketplaceLinks(part, activeFig.figId);

                return (
                  <div
                    key={part.partNum}
                    id={`part-row-${part.partNum}`}
                    className={`part-check-row ${isMissing ? 'is-missing' : ''}`}
                  >
                    <button
                      type="button"
                      className="part-check-toggle"
                      onClick={() => void handleTogglePartMissing(part.partNum)}
                      aria-pressed={isMissing}
                    >
                      <span className={`part-check-indicator ${isMissing ? 'missing' : 'owned'}`}>
                        {isMissing ? <X size={12} /> : <Check size={12} />}
                      </span>
                      <div className="part-check-info">
                        <div className="part-check-top">
                          <span className="part-cat-pill">
                            {PART_CATEGORY_LABELS[part.category] || 'Pieza'}
                          </span>
                          <span className="part-code-mono mono">{part.partNum}</span>
                          {part.colorName && (
                            <span className="part-color-tag">· {part.colorName}</span>
                          )}
                        </div>
                        <span className="part-check-name">{part.name}</span>
                      </div>
                      <div className="part-check-price-col">
                        <strong className="mono">~{part.avgPriceEur.toFixed(2)} €</strong>
                        <span className={`part-status-text ${isMissing ? 'missing' : 'owned'}`}>
                          {isMissing ? 'Me falta' : 'La tengo'}
                        </span>
                      </div>
                    </button>

                    {isMissing && (
                      <div className="part-buy-links-row">
                        <span className="part-buy-caption">Comprar repuesto:</span>
                        <a
                          href={buyLinks.bricklinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="part-buy-link"
                        >
                          BrickLink <ExternalLink size={11} />
                        </a>
                        <a
                          href={buyLinks.brickowlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="part-buy-link"
                        >
                          BrickOwl <ExternalLink size={11} />
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Sets donde aparece (si Rebrickable los devolvió) */}
          {activeFig.sets && activeFig.sets.length > 0 && (
            <section className="sheet-section">
              <span className="eyebrow">Aparece en {activeFig.sets.length} sets</span>
              <div className="sets-chip-list">
                {activeFig.sets.slice(0, 6).map((s) => (
                  <span key={s.setNum} className="set-appearance-chip">
                    <strong className="mono">{s.setNum}</strong> {s.name}
                    {s.year ? ` (${s.year})` : ''}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Guardar o actualizar detalles en colección */}
          <section className="sheet-section sheet-save-box">
            {!collectionItem && collections.length > 0 && (
              <div className="sheet-field">
                <label htmlFor="sheet-target-col">
                  <Layers size={13} /> Guardar en colección
                </label>
                <select
                  id="sheet-target-col"
                  className="compact-select"
                  value={targetCollectionId}
                  onChange={(e) => setTargetCollectionId(e.target.value)}
                >
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="sheet-two-cols">
              <div className="sheet-field">
                <label htmlFor="sheet-paid-input">Pagado / ud. (€)</label>
                <input
                  id="sheet-paid-input"
                  type="number"
                  step="0.5"
                  min="0"
                  className="text-input mono"
                  value={paidInput}
                  onChange={(e) => setPaidInput(e.target.value)}
                  placeholder={(missingSummary.adjustedValueEur * 0.8).toFixed(2)}
                />
              </div>
              <div className="sheet-field">
                <label htmlFor="sheet-notes-input">Notas (estado, grietas…)</label>
                <input
                  id="sheet-notes-input"
                  type="text"
                  className="text-input"
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Ej. Sin grietas, capa intacta"
                />
              </div>
            </div>

            {savedToast && (
              <div className="sheet-toast">
                <CheckCircle2 size={14} /> {savedToast}
              </div>
            )}

            <button
              type="button"
              id="btn-sheet-primary-save"
              className="btn-primary full-width"
              onClick={() => void handleSaveDetailsOrAdd()}
            >
              {collectionItem ? (
                <>
                  <Check size={16} /> Guardar cambios ({missingSummary.adjustedValueEur.toFixed(2)}{' '}
                  €)
                </>
              ) : (
                <>
                  <Plus size={16} /> Añadir a colección (
                  {missingSummary.adjustedValueEur.toFixed(2)} €)
                </>
              )}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};
