import React, { useRef, useState } from 'react';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { BulkScanDetectedItem, NormalizedBoundingBox } from '../../types/minifig';

interface InteractiveBulkOverlayProps {
  imageUrl: string;
  aspectRatio?: number;
  items: BulkScanDetectedItem[];
  selectedBoxId: string | null;
  onSelectBox: (boxId: string | null) => void;
  onUpdateBoxRect: (boxId: string, rect: NormalizedBoundingBox) => void;
  onCommitBoxRect: (boxId: string, rect: NormalizedBoundingBox) => void;
  onAddBoxAtRect: (rect: NormalizedBoundingBox) => void;
  onDeleteBox: (boxId: string) => void;
  onRescanBox: (boxId: string) => void;
}

type DragState =
  | {
      kind: 'move';
      boxId: string;
      startClientX: number;
      startClientY: number;
      origin: NormalizedBoundingBox;
      current: NormalizedBoundingBox;
    }
  | {
      kind: 'resize';
      boxId: string;
      startClientX: number;
      startClientY: number;
      origin: NormalizedBoundingBox;
      current: NormalizedBoundingBox;
    }
  | {
      kind: 'draw';
      startX: number;
      startY: number;
      current: NormalizedBoundingBox;
    };

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export const InteractiveBulkOverlay: React.FC<InteractiveBulkOverlayProps> = ({
  imageUrl,
  aspectRatio = 1.5,
  items,
  selectedBoxId,
  onSelectBox,
  onUpdateBoxRect,
  onCommitBoxRect,
  onAddBoxAtRect,
  onDeleteBox,
  onRescanBox
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [addMode, setAddMode] = useState(false);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const selectedItem = items.find((it) => (it.boxId || String(it.slotIndex)) === selectedBoxId) ?? null;

  const getNormalizedPoint = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0.5, y: 0.5, w: 1, h: 1 };
    const rect = el.getBoundingClientRect();
    return {
      x: clamp01((clientX - rect.left) / Math.max(1, rect.width)),
      y: clamp01((clientY - rect.top) / Math.max(1, rect.height)),
      w: Math.max(1, rect.width),
      h: Math.max(1, rect.height)
    };
  };

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!addMode) {
      onSelectBox(null);
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getNormalizedPoint(e.clientX, e.clientY);
    setDragState({
      kind: 'draw',
      startX: pt.x,
      startY: pt.y,
      current: { x: pt.x, y: pt.y, width: 0.01, height: 0.01 }
    });
  };

  const handleBoxPointerDown = (
    e: React.PointerEvent,
    item: BulkScanDetectedItem,
    kind: 'move' | 'resize'
  ) => {
    if (addMode) return;
    e.stopPropagation();
    e.preventDefault();
    const boxId = item.boxId || String(item.slotIndex);
    onSelectBox(boxId);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragState({
      kind,
      boxId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origin: { ...item.boundingBox },
      current: { ...item.boundingBox }
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState || !containerRef.current) return;
    e.preventDefault();
    const stageRect = containerRef.current.getBoundingClientRect();
    const w = Math.max(1, stageRect.width);
    const h = Math.max(1, stageRect.height);

    if (dragState.kind === 'draw') {
      const px = clamp01((e.clientX - stageRect.left) / w);
      const py = clamp01((e.clientY - stageRect.top) / h);
      const x = Math.min(dragState.startX, px);
      const y = Math.min(dragState.startY, py);
      const width = Math.abs(px - dragState.startX);
      const height = Math.abs(py - dragState.startY);
      setDragState({ ...dragState, current: { x, y, width, height } });
      return;
    }

    const dx = (e.clientX - dragState.startClientX) / w;
    const dy = (e.clientY - dragState.startClientY) / h;

    if (dragState.kind === 'move') {
      const nextX = Math.max(0, Math.min(1 - dragState.origin.width, dragState.origin.x + dx));
      const nextY = Math.max(0, Math.min(1 - dragState.origin.height, dragState.origin.y + dy));
      const next: NormalizedBoundingBox = {
        x: Math.round(nextX * 1000) / 1000,
        y: Math.round(nextY * 1000) / 1000,
        width: dragState.origin.width,
        height: dragState.origin.height
      };
      setDragState({ ...dragState, current: next });
      onUpdateBoxRect(dragState.boxId, next);
      return;
    }

    if (dragState.kind === 'resize') {
      const minW = 0.08;
      const minH = 0.1;
      const nextW = Math.max(minW, Math.min(1 - dragState.origin.x, dragState.origin.width + dx));
      const nextH = Math.max(minH, Math.min(1 - dragState.origin.y, dragState.origin.height + dy));
      const next: NormalizedBoundingBox = {
        x: dragState.origin.x,
        y: dragState.origin.y,
        width: Math.round(nextW * 1000) / 1000,
        height: Math.round(nextH * 1000) / 1000
      };
      setDragState({ ...dragState, current: next });
      onUpdateBoxRect(dragState.boxId, next);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragState) return;
    e.stopPropagation();

    if (dragState.kind === 'draw') {
      let box = dragState.current;
      // Si fue un toque rápido sin arrastrar, creamos un recuadro práctico centrado en el dedo
      if (box.width < 0.06 || box.height < 0.08) {
        const defaultW = 0.24;
        const defaultH = 0.36;
        box = {
          x: clamp01(dragState.startX - defaultW / 2),
          y: clamp01(dragState.startY - defaultH / 2),
          width: defaultW,
          height: defaultH
        };
        if (box.x + box.width > 1) box.x = 1 - box.width;
        if (box.y + box.height > 1) box.y = 1 - box.height;
      }
      setDragState(null);
      setAddMode(false);
      onAddBoxAtRect(box);
      return;
    }

    const movedEnough =
      Math.abs(dragState.current.x - dragState.origin.x) > 0.015 ||
      Math.abs(dragState.current.y - dragState.origin.y) > 0.015 ||
      Math.abs(dragState.current.width - dragState.origin.width) > 0.015 ||
      Math.abs(dragState.current.height - dragState.origin.height) > 0.015;

    const { boxId, current } = dragState;
    setDragState(null);

    if (movedEnough) {
      onCommitBoxRect(boxId, current);
    }
  };

  return (
    <div className="interactive-bulk-wrap" id="interactive-bulk-overlay">
      <div className="bulk-editor-toolbar">
        <button
          type="button"
          id="btn-bulk-add-box"
          className={`bulk-tool-btn ${addMode ? 'active' : ''}`}
          onClick={() => setAddMode((v) => !v)}
        >
          <Plus size={14} />
          {addMode ? 'Toca o arrastra en la foto…' : 'Añadir recuadro'}
        </button>

        {selectedItem && !addMode && (
          <div className="bulk-selected-actions">
            <span className="bulk-sel-tag mono">#{selectedItem.slotIndex}</span>
            <button
              type="button"
              id="btn-bulk-rescan-selected"
              className="bulk-tool-btn"
              onClick={() => onRescanBox(selectedItem.boxId || String(selectedItem.slotIndex))}
              disabled={selectedItem.status === 'scanning'}
              title="Re-escanear solo este recuadro"
            >
              <RefreshCw
                size={13}
                className={selectedItem.status === 'scanning' ? 'spin' : ''}
              />
              Re-escanear
            </button>
            <button
              type="button"
              id="btn-bulk-delete-selected"
              className="bulk-tool-btn danger"
              onClick={() => onDeleteBox(selectedItem.boxId || String(selectedItem.slotIndex))}
              title="Quitar recuadro"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className={`bulk-photo-stage ${addMode ? 'add-mode' : ''}`}
        style={{ aspectRatio: String(Math.max(0.75, Math.min(2.2, aspectRatio))) }}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img src={imageUrl} alt="Lote de minifiguras LEGO" className="bulk-stage-img" draggable={false} />

        {items.map((item) => {
          const boxId = item.boxId || String(item.slotIndex);
          const isSelected = selectedBoxId === boxId;
          const isScanning = item.status === 'scanning';
          const isNoMatch = item.status === 'no_match' || item.status === 'error';

          return (
            <div
              key={boxId}
              id={`bulk-box-${item.slotIndex}`}
              className={`bulk-box-frame ${isSelected ? 'selected' : ''} ${
                isScanning ? 'scanning' : isNoMatch ? 'no-match' : item.included ? 'matched' : 'excluded'
              }`}
              style={{
                left: `${item.boundingBox.x * 100}%`,
                top: `${item.boundingBox.y * 100}%`,
                width: `${item.boundingBox.width * 100}%`,
                height: `${item.boundingBox.height * 100}%`
              }}
              onPointerDown={(e) => handleBoxPointerDown(e, item, 'move')}
            >
              <span className="bulk-box-badge mono">
                {isScanning ? <Loader2 size={10} className="spin" /> : `#${item.slotIndex}`}
              </span>

              {isSelected && (
                <span
                  className="bulk-resize-handle"
                  title="Arrastra para ajustar tamaño"
                  onPointerDown={(e) => handleBoxPointerDown(e, item, 'resize')}
                />
              )}
            </div>
          );
        })}

        {dragState?.kind === 'draw' && (
          <div
            className="bulk-box-frame drawing"
            style={{
              left: `${dragState.current.x * 100}%`,
              top: `${dragState.current.y * 100}%`,
              width: `${dragState.current.width * 100}%`,
              height: `${dragState.current.height * 100}%`
            }}
          />
        )}
      </div>

      <p className="bulk-editor-hint">
        {addMode
          ? 'Toca sobre una figura o arrastra un rectángulo para analizarla individualmente.'
          : 'Toca un recuadro para moverlo, ajustar su esquina o re-escanear solo esa figura.'}
      </p>
    </div>
  );
};
