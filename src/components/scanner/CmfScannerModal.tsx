import React, { useState } from 'react';
import { CheckCircle2, QrCode, Search, X } from 'lucide-react';
import type {
  MinifigCondition,
  MinifigureMetadata,
  PreferredPriceSource
} from '../../types/minifig';
import { CMF_CODE_DATABASE, lookupCmfCode } from '../../data/cmfCodes';
import { getQuickDualPricesEur } from '../../services/priceAggregator';

interface CmfScannerModalProps {
  open: boolean;
  preferredPriceSource: PreferredPriceSource;
  onClose: () => void;
  onOpenMinifigDetail: (minifig: MinifigureMetadata, condition?: MinifigCondition) => void;
  onQuickAdd: (
    minifig: MinifigureMetadata,
    condition: MinifigCondition,
    quantity: number,
    unitPriceEur: number
  ) => Promise<void>;
}

export const CmfScannerModal: React.FC<CmfScannerModalProps> = ({
  open,
  preferredPriceSource,
  onClose,
  onOpenMinifigDetail,
  onQuickAdd
}) => {
  const [inputCode, setInputCode] = useState('');
  const [result, setResult] = useState<ReturnType<typeof lookupCmfCode> | null>(null);
  const [addedOk, setAddedOk] = useState(false);

  if (!open) return null;

  const handleLookup = (raw: string) => {
    setInputCode(raw);
    if (!raw.trim()) {
      setResult(null);
      return;
    }
    setResult(lookupCmfCode(raw));
    setAddedOk(false);
  };

  const matchedFig = result?.matched ? result.minifig : null;
  const dual = matchedFig ? getQuickDualPricesEur(matchedFig, preferredPriceSource) : null;

  return (
    <div
      className="bm-modal-backdrop"
      id="cmf-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Escáner de cajas sorpresa CMF"
    >
      <div
        className="bm-modal-sheet"
        id="cmf-scanner-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bm-modal-head">
          <div className="bm-modal-title-icon">
            <QrCode size={18} />
            <strong>Escáner de cajas CMF</strong>
          </div>
          <button
            type="button"
            id="btn-close-cmf-modal"
            className="bm-icon-soft sm"
            onClick={onClose}
            aria-label="Cerrar escáner CMF"
          >
            <X size={15} />
          </button>
        </div>

        <p className="bm-muted-p">
          Introduce los 7 dígitos o el código Data Matrix de la base de la caja cerrada (fábricas{' '}
          <strong>S Europa</strong> y <strong>R Norteamérica</strong>).
        </p>

        <form
          className="bm-search-row"
          onSubmit={(e) => {
            e.preventDefault();
            handleLookup(inputCode);
          }}
        >
          <div className="bm-search-input-wrap">
            <Search size={15} className="bm-search-icon" />
            <input
              id="cmf-code-input"
              type="text"
              value={inputCode}
              onChange={(e) => handleLookup(e.target.value)}
              placeholder="Ej. 6522981 114S4"
            />
          </div>
          <button type="submit" id="btn-cmf-lookup" className="bm-btn-primary sm">
            Buscar
          </button>
        </form>

        <div className="bm-theme-chip-strip">
          {CMF_CODE_DATABASE.slice(0, 4).map((entry) => {
            const sampleId = entry.elementIdsEu[0] || entry.elementIdsNa[0] || '';
            return (
              <button
                key={entry.figId}
                type="button"
                className="bm-theme-chip"
                onClick={() => handleLookup(`${sampleId} 114S4`)}
              >
                {sampleId} · {entry.seriesName.split(' ')[0]}
              </button>
            );
          })}
        </div>

        {matchedFig && dual && (
          <div className="bm-cmf-result-card" id="cmf-result-panel">
            <button
              type="button"
              className="bm-cmf-result-top"
              onClick={() => {
                onClose();
                onOpenMinifigDetail(matchedFig, 'new');
              }}
            >
              <img src={matchedFig.imageUrl} alt={matchedFig.name} className="bm-thumb-md" />
              <div className="bm-row-text-stack">
                <strong className="bm-row-title">{matchedFig.name}</strong>
                <span className="bm-row-sub">
                  {result?.entry?.seriesName} · {matchedFig.figId}
                </span>
                <strong className="bm-cmf-price">
                  Nueva €{dual.newEur.toFixed(2)} · Usada €{dual.usedEur.toFixed(2)}
                </strong>
              </div>
            </button>

            <button
              type="button"
              id="btn-cmf-quick-add"
              className="bm-btn-primary full"
              onClick={async () => {
                await onQuickAdd(matchedFig, 'new', 1, dual.newEur);
                setAddedOk(true);
              }}
            >
              {addedOk ? (
                <>
                  <CheckCircle2 size={16} /> Añadida a tu colección
                </>
              ) : (
                '+ Añadir nueva sellada a mi colección'
              )}
            </button>
          </div>
        )}

        {result && !result.matched && (
          <div className="bm-empty-inline" id="cmf-result-empty">
            <p>
              Código <strong>{result.scannedElementId || inputCode}</strong> no encontrado en las
              series cargadas (S25–S29, Space, D&amp;D, F1, Spider-Verse).
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
