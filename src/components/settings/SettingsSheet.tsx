import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import type { ApiProvidersStatus, AppSettings } from '../../types/minifig';
import {
  normalizeProxyBaseUrl,
  probeApiProviders,
  setRuntimeProxyBaseUrl
} from '../../services/apiConfig';
import { storageRepository } from '../../services/storageRepository';

interface SettingsSheetProps {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSettingsChange: (next: AppSettings) => void;
  onBackupRestored: (nextActiveCollectionId: string | null) => Promise<void>;
}

export const SettingsSheet: React.FC<SettingsSheetProps> = ({
  open,
  settings,
  onClose,
  onSettingsChange,
  onBackupRestored
}) => {
  const [status, setStatus] = useState<ApiProvidersStatus | null>(null);
  const [probing, setProbing] = useState(false);
  const [proxyInput, setProxyInput] = useState(settings.proxyBaseUrl);
  const [marginPct, setMarginPct] = useState(settings.defaultTargetMarginPct);
  const [showKeyGuide, setShowKeyGuide] = useState(false);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setProxyInput(settings.proxyBaseUrl);
    setMarginPct(settings.defaultTargetMarginPct);
    setFeedback(null);
    void runProbe(true);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, settings.proxyBaseUrl, settings.defaultTargetMarginPct, onClose]);

  const runProbe = async (force = false) => {
    setProbing(true);
    try {
      const res = await probeApiProviders(force);
      setStatus(res);
    } finally {
      setProbing(false);
    }
  };

  if (!open) return null;

  const handleSaveProxyAndMargin = async () => {
    const cleanUrl = normalizeProxyBaseUrl(proxyInput);
    setRuntimeProxyBaseUrl(cleanUrl);
    const saved = await storageRepository.saveSettings({
      proxyBaseUrl: cleanUrl,
      defaultTargetMarginPct: marginPct
    });
    onSettingsChange(saved);
    await runProbe(true);
    setFeedback({ type: 'ok', text: 'Ajustes guardados y conexión comprobada.' });
  };

  const handleExportJson = async () => {
    try {
      const json = await storageRepository.exportBackupJson();
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bricklens-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setFeedback({ type: 'ok', text: 'Copia de seguridad JSON descargada.' });
    } catch {
      setFeedback({ type: 'err', text: 'No se pudo generar la copia de seguridad.' });
    }
  };

  const handleImportJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const summary = await storageRepository.importBackupJson(text, restoreMode);
      await onBackupRestored(summary.activeCollectionId);
      setFeedback({
        type: 'ok',
        text: `Backup restaurado: ${summary.collectionsCount} colección(es), ${summary.itemsCount} figuras y ${summary.observedPricesCount} precios anotados.`
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error al leer el archivo de backup.'
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleClearCaches = async () => {
    await storageRepository.clearCaches();
    setFeedback({ type: 'ok', text: 'Caché local de catálogo y precios vaciada.' });
  };

  return (
    <div
      className="sheet-backdrop"
      id="settings-sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Ajustes, APIs y copia de seguridad"
    >
      <div
        className="bottom-sheet"
        id="settings-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-drag-handle" aria-hidden="true" />

        <div className="sheet-header compact">
          <div>
            <span className="eyebrow">BrickLens v2.0</span>
            <h2 className="sheet-title">Ajustes, APIs y Backup</h2>
          </div>
          <button
            type="button"
            id="btn-close-settings-sheet"
            className="icon-btn"
            onClick={onClose}
            aria-label="Cerrar ajustes"
          >
            <X size={16} />
          </button>
        </div>

        <div className="sheet-body">
          {feedback && (
            <div className={`settings-feedback ${feedback.type}`}>
              <CheckCircle2 size={14} /> {feedback.text}
            </div>
          )}

          {/* Estado de APIs en vivo */}
          <section className="sheet-section">
            <div className="sheet-section-head">
              <div>
                <span className="eyebrow">Estado de APIs en vivo</span>
                <p className="sheet-section-sub">
                  {status?.reachable
                    ? `Proxy conectado (${status.runtime})`
                    : 'Modo cliente estático · Brickognize directo activo'}
                </p>
              </div>
              <button
                type="button"
                id="btn-probe-apis"
                className="tiny-action-btn"
                onClick={() => void runProbe(true)}
                disabled={probing}
                title="Volver a comprobar APIs"
              >
                <RefreshCw size={13} className={probing ? 'spin' : ''} />
              </button>
            </div>

            <div className="api-status-grid">
              {[
                {
                  name: 'Brickognize',
                  desc: 'Escáner visual figuras y piezas',
                  active: true
                },
                {
                  name: 'Rebrickable',
                  desc: 'Catálogo +15k y despiece real',
                  active: Boolean(status?.rebrickable)
                },
                {
                  name: 'BrickOwl',
                  desc: 'Precios tiendas UE en vivo',
                  active: Boolean(status?.brickowl)
                },
                {
                  name: 'eBay España / UE',
                  desc: 'Precios anuncios en vivo',
                  active: Boolean(status?.ebay)
                }
              ].map((api) => (
                <div key={api.name} className="api-status-item">
                  <span className={`api-dot ${api.active ? 'live' : 'fallback'}`} />
                  <div>
                    <strong>{api.name}</strong>
                    <span className="api-desc">{api.desc}</span>
                  </div>
                  <span className={`api-pill ${api.active ? 'live' : 'fallback'}`}>
                    {api.active ? 'Activa' : 'Respaldo'}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="price-avg-disclosure-btn"
              onClick={() => setShowKeyGuide((v) => !v)}
            >
              <span>Cómo activar tus claves gratis (Rebrickable, BrickOwl, eBay)</span>
              {showKeyGuide ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            {showKeyGuide && (
              <div className="api-guide-box">
                <p>
                  Las claves se guardan siempre en el servidor (nunca en el código del navegador):
                </p>
                <ol>
                  <li>
                    <strong>Rebrickable (gratis):</strong> regístrate en <code>rebrickable.com/api</code>{' '}
                    y copia tu <code>REBRICKABLE_API_KEY</code>.
                  </li>
                  <li>
                    <strong>BrickOwl (gratis):</strong> genera tu clave en{' '}
                    <code>brickowl.com/mystuff/api_keys</code> → <code>BRICKOWL_API_KEY</code>.
                  </li>
                  <li>
                    <strong>eBay UE (gratis):</strong> crea una app en <code>developer.ebay.com</code>{' '}
                    → <code>EBAY_CLIENT_ID</code> y <code>EBAY_CLIENT_SECRET</code>.
                  </li>
                  <li>
                    <strong>En Hostinger Node.js / Vercel:</strong> añádelas en{' '}
                    <em>Variables de entorno</em>. Si usas Hostinger solo estático, despliega este
                    mismo repo gratis en Vercel y pega aquí abajo su URL como proxy.
                  </li>
                </ol>
              </div>
            )}
          </section>

          {/* Proxy externo + Margen objetivo por defecto */}
          <section className="sheet-section">
            <span className="eyebrow">
              <Server size={12} /> Proxy y Evaluador de Lotes
            </span>

            <div className="sheet-field">
              <label htmlFor="settings-proxy-url">URL de proxy externa (vacío = mismo dominio)</label>
              <input
                id="settings-proxy-url"
                type="url"
                className="text-input mono"
                value={proxyInput}
                onChange={(e) => setProxyInput(e.target.value)}
                placeholder="https://tu-proxy.vercel.app (opcional)"
              />
            </div>

            <div className="sheet-field">
              <label>Perfil por defecto al evaluar lotes (puja máx.)</label>
              <div className="margin-preset-row">
                {[
                  { pct: 20, label: 'Colección (80%)' },
                  { pct: 35, label: 'Buen trato (65%)' },
                  { pct: 50, label: 'Reventa (50%)' }
                ].map((opt) => (
                  <button
                    key={opt.pct}
                    type="button"
                    className={`cond-mini-pill ${marginPct === opt.pct ? 'active' : ''}`}
                    onClick={() => setMarginPct(opt.pct)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              id="btn-save-settings"
              className="btn-secondary full-width"
              onClick={() => void handleSaveProxyAndMargin()}
            >
              Guardar ajustes y probar proxy
            </button>
          </section>

          {/* Backup JSON en 1 toque */}
          <section className="sheet-section">
            <span className="eyebrow">
              <ShieldCheck size={12} /> Copia de seguridad local (1 toque)
            </span>
            <p className="sheet-section-sub">
              Guarda todas tus colecciones, figuras, despieces faltantes y precios anotados en un
              único archivo JSON para no perder nada si cambias de móvil.
            </p>

            <div className="backup-actions-row">
              <button
                type="button"
                id="btn-export-json-backup"
                className="btn-primary"
                onClick={() => void handleExportJson()}
              >
                <Download size={15} /> Descargar Backup
              </button>

              <button
                type="button"
                id="btn-import-json-backup"
                className="btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={15} /> Restaurar JSON
              </button>
              <input
                ref={fileInputRef}
                id="input-json-backup-file"
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(e) => void handleImportJsonFile(e)}
              />
            </div>

            <div className="restore-mode-row">
              <span>Al restaurar:</span>
              <button
                type="button"
                className={`mini-chip ${restoreMode === 'replace' ? 'active' : ''}`}
                onClick={() => setRestoreMode('replace')}
              >
                Reemplazar todo
              </button>
              <button
                type="button"
                className={`mini-chip ${restoreMode === 'merge' ? 'active' : ''}`}
                onClick={() => setRestoreMode('merge')}
              >
                Combinar con lo actual
              </button>
            </div>

            <button
              type="button"
              className="btn-ghost-danger full-width"
              onClick={() => void handleClearCaches()}
            >
              <Trash2 size={14} /> Limpiar caché de APIs (conserva tus colecciones)
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};
