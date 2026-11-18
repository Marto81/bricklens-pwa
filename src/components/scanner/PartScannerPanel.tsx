import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  Layers,
  Loader2,
  Plus,
  Puzzle,
  Search,
  Sparkles,
  X
} from 'lucide-react';
import type {
  MinifigureMetadata,
  PartMatchedMinifig,
  PartRecognitionResult,
  PreferredPriceSource,
  ScannedPartChip
} from '../../types/minifig';
import { ALL_MINIFIG_CATALOG } from '../../data/catalogPresets';
import { findMinifigsByScannedParts } from '../../services/catalogService';
import { getQuickDualPricesEur } from '../../services/priceAggregator';

interface PartScannerPanelProps {
  partResult: PartRecognitionResult | null;
  isScanning: boolean;
  preferredPriceSource: PreferredPriceSource;
  onTriggerDemoPartCross: () => void;
  onOpenMinifigDetail: (minifig: MinifigureMetadata) => void;
}

const CAT_LABELS: Record<ScannedPartChip['category'], string> = {
  headgear: 'Casco / Pelo',
  head: 'Cabeza',
  torso: 'Torso',
  legs: 'Piernas',
  accessory: 'Accesorio'
};

export const PartScannerPanel: React.FC<PartScannerPanelProps> = ({
  partResult,
  isScanning,
  preferredPriceSource,
  onTriggerDemoPartCross,
  onOpenMinifigDetail
}) => {
  const [scannedChips, setScannedChips] = useState<ScannedPartChip[]>([]);
  const [matches, setMatches] = useState<PartMatchedMinifig[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [usedLiveCatalog, setUsedLiveCatalog] = useState(false);
  const [manualPartInput, setManualPartInput] = useState('');

  // Al llegar un nuevo resultado de escaneo de pieza, añadimos automáticamente la candidata #1 a la mesa de cruce
  useEffect(() => {
    if (!partResult || partResult.candidates.length === 0) return;
    const top = partResult.candidates[0];
    setScannedChips((prev) => {
      if (prev.some((c) => c.partNum.toLowerCase() === top.partNum.toLowerCase())) {
        return prev;
      }
      return [
        ...prev,
        {
          partNum: top.partNum,
          name: top.name,
          category: top.category,
          imageUrl: top.imageUrl
        }
      ];
    });
  }, [partResult]);

  // Ejecutar intersección cada vez que cambian las piezas en la mesa de cruce
  useEffect(() => {
    if (scannedChips.length === 0) {
      setMatches([]);
      setUsedLiveCatalog(false);
      return;
    }

    let cancelled = false;
    const runMatch = async () => {
      setIsMatching(true);
      try {
        const res = await findMinifigsByScannedParts(scannedChips);
        if (!cancelled) {
          setMatches(res.matches);
          setUsedLiveCatalog(res.usedLiveApi);
        }
      } finally {
        if (!cancelled) setIsMatching(false);
      }
    };
    void runMatch();
    return () => {
      cancelled = true;
    };
  }, [scannedChips]);

  const handleAddChip = (chip: ScannedPartChip) => {
    setScannedChips((prev) => {
      if (prev.some((c) => c.partNum.toLowerCase() === chip.partNum.toLowerCase())) return prev;
      return [...prev, chip];
    });
  };

  const handleRemoveChip = (partNum: string) => {
    setScannedChips((prev) => prev.filter((c) => c.partNum !== partNum));
  };

  const handleAddManualPart = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualPartInput.trim();
    if (!clean) return;
    const lower = clean.toLowerCase();

    let resolvedCategory: ScannedPartChip['category'] = 'accessory';
    let resolvedName = `Pieza ${clean}`;

    for (const fig of ALL_MINIFIG_CATALOG) {
      const match = fig.parts.find((p) => p.partNum.toLowerCase() === lower);
      if (match) {
        resolvedCategory = match.category;
        resolvedName = match.name;
        break;
      }
    }

    if (resolvedName === `Pieza ${clean}`) {
      if (lower.startsWith('973')) resolvedCategory = 'torso';
      else if (lower.startsWith('970')) resolvedCategory = 'legs';
      else if (lower.startsWith('3626')) resolvedCategory = 'head';
      else if (/^(30408|24087|30124|2446|61183|87990)/.test(lower)) resolvedCategory = 'headgear';
    }

    handleAddChip({
      partNum: clean,
      name: resolvedName,
      category: resolvedCategory
    });
    setManualPartInput('');
  };

  return (
    <div className="part-scanner-panel" id="part-scanner-panel">
      {/* Diagnóstico si el escaneo de pieza falló o no hubo match */}
      {!isScanning && partResult && partResult.candidates.length === 0 && (
        <div className="scanner-diagnostic-card" id="part-diagnostic-panel">
          <div className="diagnostic-head">
            <AlertCircle size={18} />
            <div>
              <h3>No se identificó la pieza</h3>
              <p>{partResult.errorMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Candidatas del último escaneo de pieza */}
      {partResult && partResult.candidates.length > 0 && (
        <section className="panel-card">
          <div className="panel-card-head">
            <div>
              <span className="eyebrow">
                <Puzzle size={12} /> Piezas detectadas por Brickognize
              </span>
              <p className="panel-card-sub">
                Pulsa otra candidata si la primera no coincide exactamente con tu pieza.
              </p>
            </div>
          </div>

          <div className="part-candidates-strip">
            {partResult.candidates.slice(0, 6).map((cand) => {
              const isInTray = scannedChips.some(
                (c) => c.partNum.toLowerCase() === cand.partNum.toLowerCase()
              );
              return (
                <button
                  key={cand.partNum}
                  type="button"
                  className={`part-cand-card ${isInTray ? 'active' : ''}`}
                  onClick={() =>
                    handleAddChip({
                      partNum: cand.partNum,
                      name: cand.name,
                      category: cand.category,
                      imageUrl: cand.imageUrl
                    })
                  }
                >
                  {cand.imageUrl ? (
                    <img src={cand.imageUrl} alt={cand.name} className="part-cand-thumb" />
                  ) : (
                    <div className="part-cand-placeholder">
                      <Puzzle size={16} />
                    </div>
                  )}
                  <div className="part-cand-meta">
                    <span className="mono part-cand-code">{cand.partNum}</span>
                    <span className="part-cand-name">{cand.name}</span>
                    <span className="part-cand-conf mono">
                      {Math.round(cand.confidence * 100)}% · {CAT_LABELS[cand.category]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Mesa de cruce de piezas (1 pieza o intersección de varias piezas) */}
      <section className="panel-card" id="part-cross-tray">
        <div className="panel-card-head">
          <div>
            <span className="eyebrow">
              <Layers size={12} /> Cruce de piezas ({scannedChips.length})
            </span>
            <p className="panel-card-sub">
              Escanea un torso y luego añade casco o piernas para acotar la minifigura exacta.
            </p>
          </div>
          {scannedChips.length > 0 && (
            <button
              type="button"
              className="text-link-btn"
              onClick={() => setScannedChips([])}
            >
              Limpiar
            </button>
          )}
        </div>

        {scannedChips.length > 0 ? (
          <div className="part-chips-row">
            {scannedChips.map((chip) => (
              <span key={chip.partNum} className="scanned-part-chip">
                <span className="part-cat-dot">{CAT_LABELS[chip.category]}</span>
                <strong className="mono">{chip.partNum}</strong>
                <button
                  type="button"
                  className="chip-remove-btn"
                  onClick={() => handleRemoveChip(chip.partNum)}
                  aria-label={`Quitar pieza ${chip.partNum}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <div className="part-empty-hint">
            <p>
              Haz una foto a una pieza suelta arriba o introduce su código BrickLink (ej.{' '}
              <code className="mono">973pb1795c01</code>) para descubrir a qué minifigura pertenece.
            </p>
            <button
              type="button"
              id="btn-demo-part-cross"
              className="text-link-accent"
              onClick={onTriggerDemoPartCross}
            >
              <Sparkles size={13} /> Probar con torso de ejemplo
            </button>
          </div>
        )}

        <form className="manual-part-form" onSubmit={handleAddManualPart}>
          <div className="search-input-wrap compact">
            <Search size={14} />
            <input
              id="manual-part-code-input"
              type="text"
              className="text-input mono"
              value={manualPartInput}
              onChange={(e) => setManualPartInput(e.target.value)}
              placeholder="Añadir código de pieza (ej. 973pb1795c01)"
            />
          </div>
          <button
            type="submit"
            id="btn-add-manual-part"
            className="btn-secondary compact"
            disabled={!manualPartInput.trim()}
          >
            <Plus size={14} /> Cruzar
          </button>
        </form>
      </section>

      {/* Minifiguras compatibles resultantes */}
      {scannedChips.length > 0 && (
        <section className="panel-card" id="part-matched-minifigs">
          <div className="panel-card-head">
            <div>
              <span className="eyebrow">
                Minifiguras compatibles ({matches.length})
              </span>
              <p className="panel-card-sub">
                {usedLiveCatalog
                  ? 'Resultados cruzados con catálogo en vivo Rebrickable'
                  : 'Resultados en catálogo local · activa Rebrickable en Ajustes para +15.000 figuras'}
              </p>
            </div>
            {isMatching && <Loader2 size={15} className="spin" />}
          </div>

          {!isMatching && matches.length === 0 ? (
            <div className="part-no-matches">
              <p>
                No hay coincidencias locales para{' '}
                <strong className="mono">
                  {scannedChips.map((c) => c.partNum).join(' + ')}
                </strong>
                . Puedes consultar directamente qué minifiguras llevan esta pieza en BrickLink:
              </p>
              <div className="part-external-fallbacks">
                {scannedChips.map((chip) => (
                  <a
                    key={chip.partNum}
                    href={`https://www.bricklink.com/catalogItemIn.asp?P=${encodeURIComponent(chip.partNum)}&in=M`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="part-buy-link"
                  >
                    Ver {chip.partNum} en BrickLink <ExternalLink size={11} />
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="matched-figs-list">
              {matches.map((m) => {
                const prices = getQuickDualPricesEur(m.minifig, preferredPriceSource);
                const exactAll =
                  m.totalQueriedParts > 1 && m.matchedPartNums.length === m.totalQueriedParts;

                return (
                  <button
                    key={m.minifig.figId}
                    type="button"
                    id={`part-match-fig-${m.minifig.figId}`}
                    className={`matched-fig-row ${exactAll ? 'exact-cross' : ''}`}
                    onClick={() => onOpenMinifigDetail(m.minifig)}
                  >
                    <img src={m.minifig.imageUrl} alt={m.minifig.name} className="matched-fig-thumb" />
                    <div className="matched-fig-info">
                      <div className="matched-fig-top">
                        <span className="fig-code-badge mono">{m.minifig.figId.toUpperCase()}</span>
                        <span className={`match-ratio-pill ${exactAll ? 'exact' : ''}`}>
                          {m.matchedPartNums.length}/{m.totalQueriedParts} pieza
                          {m.totalQueriedParts > 1 ? 's' : ''}
                        </span>
                      </div>
                      <strong className="matched-fig-name">{m.minifig.name}</strong>
                      <span className="matched-fig-sub">
                        {m.minifig.theme} · Abrir ficha y despiece →
                      </span>
                    </div>
                    <div className="matched-fig-price mono">
                      <strong>{prices.usedEur.toFixed(2)} €</strong>
                      <span>Usada</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
