import React, { useMemo } from 'react';
import { Calculator, CheckCircle2, Flame, Scale, TriangleAlert } from 'lucide-react';
import { evaluateLotDeal } from '../../services/priceAggregator';

interface LotEvaluatorBarProps {
  totalMarketValueEur: number;
  selectedUnitsCount: number;
  askingPriceInput: string;
  shippingInput: string;
  targetMarginPct: number;
  distributeCostProportionally: boolean;
  onChangeAskingPrice: (val: string) => void;
  onChangeShipping: (val: string) => void;
  onChangeTargetMargin: (pct: number) => void;
  onToggleDistributeCost: (checked: boolean) => void;
}

export const LotEvaluatorBar: React.FC<LotEvaluatorBarProps> = ({
  totalMarketValueEur,
  selectedUnitsCount,
  askingPriceInput,
  shippingInput,
  targetMarginPct,
  distributeCostProportionally,
  onChangeAskingPrice,
  onChangeShipping,
  onChangeTargetMargin,
  onToggleDistributeCost
}) => {
  const askingNum = Number(askingPriceInput.replace(',', '.')) || 0;
  const shippingNum = Number(shippingInput.replace(',', '.')) || 0;

  const evaluation = useMemo(
    () =>
      evaluateLotDeal({
        totalMarketValueEur,
        askingPriceEur: askingNum,
        shippingEur: shippingNum,
        targetMarginPct
      }),
    [totalMarketValueEur, askingNum, shippingNum, targetMarginPct]
  );

  const hasPrice = askingNum > 0;

  const verdictIcon =
    evaluation.verdict === 'ganga' ? (
      <Flame size={15} />
    ) : evaluation.verdict === 'buen_precio' ? (
      <CheckCircle2 size={15} />
    ) : evaluation.verdict === 'caro' ? (
      <TriangleAlert size={15} />
    ) : (
      <Scale size={15} />
    );

  return (
    <div className="lot-evaluator-card" id="lot-evaluator-card">
      <div className="lot-eval-head">
        <div className="lot-eval-title">
          <Calculator size={15} />
          <div>
            <span className="eyebrow">Evaluador de Lote · Wallapop / Mercadillo</span>
            <p className="lot-eval-sub">
              Valor de {selectedUnitsCount} figura{selectedUnitsCount === 1 ? '' : 's'}:{' '}
              <strong className="mono">{totalMarketValueEur.toFixed(2)} €</strong>
            </p>
          </div>
        </div>
      </div>

      <div className="lot-eval-inputs">
        <div className="sheet-field">
          <label htmlFor="lot-asking-price-input">Pide el vendedor (€)</label>
          <input
            id="lot-asking-price-input"
            type="number"
            step="1"
            min="0"
            className="text-input mono"
            value={askingPriceInput}
            onChange={(e) => onChangeAskingPrice(e.target.value)}
            placeholder="Ej. 45"
          />
        </div>
        <div className="sheet-field">
          <label htmlFor="lot-shipping-price-input">Envío (€)</label>
          <input
            id="lot-shipping-price-input"
            type="number"
            step="0.5"
            min="0"
            className="text-input mono"
            value={shippingInput}
            onChange={(e) => onChangeShipping(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="lot-margin-presets">
        {[
          { pct: 20, label: 'Colección (80%)' },
          { pct: 35, label: 'Buen trato (65%)' },
          { pct: 50, label: 'Reventa (50%)' }
        ].map((opt) => (
          <button
            key={opt.pct}
            type="button"
            className={`cond-mini-pill ${targetMarginPct === opt.pct ? 'active' : ''}`}
            onClick={() => onChangeTargetMargin(opt.pct)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div
        className={`lot-verdict-banner ${hasPrice ? evaluation.verdict : 'neutral'}`}
        id="lot-verdict-banner"
      >
        <div className="lot-verdict-top">
          <span className="lot-verdict-badge">
            {verdictIcon}
            <strong>{evaluation.verdictLabel}</strong>
          </span>
          {hasPrice && (
            <span className="lot-verdict-discount mono">
              {evaluation.discountVsMarketPct >= 0
                ? `-${evaluation.discountVsMarketPct.toFixed(0)}% vs mercado`
                : `+${Math.abs(evaluation.discountVsMarketPct).toFixed(0)}% sobre mercado`}
            </span>
          )}
        </div>
        <p className="lot-verdict-summary">{evaluation.verdictSummary}</p>

        <div className="lot-verdict-metrics">
          <div>
            <span>Puja máx.</span>
            <strong className="mono">{evaluation.maxRecommendedBidEur.toFixed(2)} €</strong>
          </div>
          <div>
            <span>Coste total</span>
            <strong className="mono">
              {hasPrice ? `${evaluation.totalCostEur.toFixed(2)} €` : '—'}
            </strong>
          </div>
          <div>
            <span>Beneficio neto est.</span>
            <strong
              className={`mono ${
                !hasPrice
                  ? ''
                  : evaluation.estimatedNetProfitEur >= 0
                  ? 'text-positive'
                  : 'text-negative'
              }`}
            >
              {hasPrice
                ? `${evaluation.estimatedNetProfitEur >= 0 ? '+' : ''}${evaluation.estimatedNetProfitEur.toFixed(2)} €`
                : '—'}
            </strong>
          </div>
        </div>
      </div>

      {hasPrice && (
        <label className="lot-split-toggle" htmlFor="chk-distribute-lot-cost">
          <input
            id="chk-distribute-lot-cost"
            type="checkbox"
            checked={distributeCostProportionally}
            onChange={(e) => onToggleDistributeCost(e.target.checked)}
          />
          <span>
            Repartir los <strong className="mono">{evaluation.totalCostEur.toFixed(2)} €</strong>{' '}
            proporcionalmente entre cada figura al guardarlas en tu colección
          </span>
        </label>
      )}
    </div>
  );
};
