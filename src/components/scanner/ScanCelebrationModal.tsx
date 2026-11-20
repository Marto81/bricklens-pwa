import React from 'react';
import { Camera, Check, X } from 'lucide-react';
import type { MinifigureMetadata } from '../../types/minifig';

export interface CelebrationPayload {
  addedItems: Array<{
    minifig: MinifigureMetadata;
    unitPriceEur: number;
    quantity: number;
  }>;
  addedValueEur: number;
  collectionName: string;
  collectionColor: string;
  newCollectionTotalEur: number;
  percentGain: number;
}

interface ScanCelebrationModalProps {
  payload: CelebrationPayload | null;
  onClose: () => void;
  onScanMore: () => void;
}

export const ScanCelebrationModal: React.FC<ScanCelebrationModalProps> = ({
  payload,
  onClose,
  onScanMore
}) => {
  if (!payload) return null;

  const totalUnitsAdded = payload.addedItems.reduce((sum, it) => sum + it.quantity, 0);
  const previewCards = payload.addedItems.slice(0, 3);
  const centerIdx = previewCards.length === 3 ? 1 : 0;

  return (
    <div
      className="bm-celebration-overlay"
      id="scan-celebration-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Figuras añadidas a tu colección"
    >
      <button
        type="button"
        id="btn-close-celebration"
        className="bm-celebration-close"
        onClick={onClose}
        aria-label="Cerrar resumen"
      >
        <X size={20} />
      </button>

      {/* Confeti sutil verde */}
      <div className="bm-confetti-burst" aria-hidden="true">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className={`bm-confetti-piece c-${i + 1}`} />
        ))}
      </div>

      <div className="bm-celebration-center">
        <div className="bm-celebration-check">
          <Check size={28} strokeWidth={2.8} />
        </div>

        <div className="bm-celebration-fan">
          {previewCards.map((entry, idx) => {
            const isCenter = idx === centerIdx;
            const posClass =
              previewCards.length === 1
                ? 'center'
                : previewCards.length === 2
                ? idx === 0
                  ? 'center'
                  : 'right'
                : idx === 0
                ? 'left'
                : idx === 1
                ? 'center'
                : 'right';

            return (
              <div
                key={`${entry.minifig.figId}-${idx}`}
                className={`bm-fan-card ${posClass} ${isCenter ? 'primary' : ''}`}
              >
                <img src={entry.minifig.imageUrl} alt={entry.minifig.name} />
                <strong className="truncate">{entry.minifig.name}</strong>
                <span>€{entry.unitPriceEur.toFixed(2)}</span>
              </div>
            );
          })}
        </div>

        <div className="bm-celebration-collection-row">
          <span
            className="bm-color-dot"
            style={{ backgroundColor: payload.collectionColor }}
          />
          <span>{payload.collectionName}</span>
        </div>

        <div className="bm-celebration-total">
          €{payload.newCollectionTotalEur.toFixed(2)}
        </div>

        <div className="bm-celebration-delta">
          <span>
            ▲ +€{payload.addedValueEur.toFixed(2)}
            {payload.percentGain > 0 ? ` (+${payload.percentGain.toFixed(1)}%)` : ''}
          </span>
          <span className="bm-celebration-count">
            · {totalUnitsAdded} {totalUnitsAdded === 1 ? 'figura añadida' : 'figuras añadidas'}
          </span>
        </div>
      </div>

      <div className="bm-celebration-footer">
        <button
          type="button"
          id="btn-celebration-scan-more"
          className="bm-btn-primary full lg"
          onClick={onScanMore}
        >
          <Camera size={18} />
          Escanear más
        </button>
      </div>
    </div>
  );
};
