import React from 'react';
import {
  ChevronRight,
  Download,
  Moon,
  QrCode,
  RotateCcw,
  Settings,
  Sun,
  Upload,
  X
} from 'lucide-react';

interface SideDrawerProps {
  open: boolean;
  themeMode: 'light' | 'dark';
  hasDemoCollection: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenCmfScanner: () => void;
  onOpenImport: () => void;
  onOpenExport: () => void;
  onToggleTheme: () => void;
  onRestoreDemoCollection: () => void;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({
  open,
  themeMode,
  hasDemoCollection,
  onClose,
  onOpenSettings,
  onOpenCmfScanner,
  onOpenImport,
  onOpenExport,
  onToggleTheme,
  onRestoreDemoCollection
}) => {
  if (!open) return null;

  return (
    <div
      className="bm-drawer-backdrop"
      id="side-drawer-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Menú principal"
    >
      <aside
        className="bm-drawer"
        id="side-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bm-drawer-top">
          <div className="bm-drawer-logo">
            <span className="bm-brick-badge" aria-hidden="true">
              <span />
              <span />
            </span>
          </div>
          <div className="bm-drawer-top-actions">
            <button
              type="button"
              id="btn-drawer-gear"
              className="bm-icon-ghost"
              onClick={() => {
                onClose();
                onOpenSettings();
              }}
              aria-label="Abrir ajustes"
            >
              <Settings size={19} />
            </button>
            <button
              type="button"
              id="btn-close-drawer"
              className="bm-icon-ghost"
              onClick={onClose}
              aria-label="Cerrar menú"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        <button
          type="button"
          id="btn-drawer-settings"
          className="bm-drawer-profile"
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
        >
          <strong>BrickLens</strong>
          <span>
            Ajustes, APIs y Backup <ChevronRight size={14} />
          </span>
        </button>

        <div className="bm-drawer-section-label">Herramientas</div>
        <nav className="bm-drawer-nav">
          <button
            type="button"
            id="btn-drawer-cmf"
            className="bm-drawer-item"
            onClick={() => {
              onClose();
              onOpenCmfScanner();
            }}
          >
            <QrCode size={19} />
            <span>Escáner CMF (Cajas sorpresa)</span>
          </button>

          <button
            type="button"
            id="btn-drawer-import"
            className="bm-drawer-item"
            onClick={() => {
              onClose();
              onOpenImport();
            }}
          >
            <Download size={19} />
            <span>Importar (CSV · XML · .bsx)</span>
          </button>

          <button
            type="button"
            id="btn-drawer-export"
            className="bm-drawer-item"
            onClick={() => {
              onClose();
              onOpenExport();
            }}
          >
            <Upload size={19} />
            <span>Exportar / Backup JSON</span>
          </button>
        </nav>

        <div className="bm-drawer-divider" />

        <nav className="bm-drawer-nav">
          <button
            type="button"
            id="btn-drawer-theme"
            className="bm-drawer-item"
            onClick={onToggleTheme}
          >
            {themeMode === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            <span>{themeMode === 'dark' ? 'Cambiar a modo Claro' : 'Cambiar a modo Oscuro'}</span>
          </button>

          {!hasDemoCollection && (
            <button
              type="button"
              id="btn-drawer-restore-demo"
              className="bm-drawer-item"
              onClick={() => {
                onRestoreDemoCollection();
                onClose();
              }}
            >
              <RotateCcw size={18} />
              <span>Restaurar colección de prueba</span>
            </button>
          )}
        </nav>

        <div className="bm-drawer-footer">
          <span>BrickLens PWA · Mercado Europeo (€)</span>
        </div>
      </aside>
    </div>
  );
};
