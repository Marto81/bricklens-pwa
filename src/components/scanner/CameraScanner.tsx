import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Image as ImageIcon,
  Layers,
  Loader2,
  Minus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
  Zap
} from 'lucide-react';
import type {
  BulkImportParsedLine,
  BulkScanDetectedItem,
  BulkScanSession,
  MinifigCondition,
  MinifigureMetadata,
  NormalizedBoundingBox,
  PartRecognitionResult,
  PreferredPriceSource,
  RecognitionResult,
  UserCollection
} from '../../types/minifig';
import { ALL_MINIFIG_CATALOG, createCustomMinifigMetadata } from '../../data/catalogPresets';
import { COLLECTION_DOT_COLORS } from '../../db/collectionDb';
import {
  allocateLotPurchasePrices,
  getQuickDualPricesEur
} from '../../services/priceAggregator';
import { fetchLiveDualPricesForMinifig } from '../../services/catalogService';
import {
  identifyBulkLotFromImage,
  identifyMinifigureFromImage,
  identifyPartFromImage,
  identifySingleBulkBox,
  loadImageElementFromUrl,
  preprocessImageSourceToBlob
} from '../../services/visionService';
import { InteractiveBulkOverlay } from './InteractiveBulkOverlay';
import { LotEvaluatorBar } from './LotEvaluatorBar';
import { PartScannerPanel } from './PartScannerPanel';

export interface ScannerSavedPayload {
  addedItems: Array<{
    minifig: MinifigureMetadata;
    unitPriceEur: number;
    quantity: number;
  }>;
  addedValueEur: number;
  targetCollectionId: string | null;
}

interface CameraScannerProps {
  open: boolean;
  preferredPriceSource: PreferredPriceSource;
  defaultTargetMarginPct?: number;
  collections: UserCollection[];
  activeCollectionId: string | null;
  onClose: () => void;
  onSelectCollection: (collectionId: string) => void;
  onOpenMinifigDetail: (minifig: MinifigureMetadata, condition?: MinifigCondition) => void;
  onQuickAddToCollection: (
    minifig: MinifigureMetadata,
    condition: MinifigCondition,
    quantity: number,
    purchasePriceEur: number,
    estimatedUnitValueEur?: number,
    targetCollectionId?: string | null
  ) => Promise<void>;
  onBulkAddToCollection: (
    lines: BulkImportParsedLine[],
    targetCollectionId?: string | null
  ) => Promise<void>;
  onScanSavedCelebration: (payload: ScannerSavedPayload) => void;
}

type TopTarget = 'minifigs' | 'parts';
type CaptureScope = 'single' | 'bulk';

interface DetectedCardItem {
  key: string;
  slotIndex: number;
  selectedMinifig: MinifigureMetadata;
  candidates: Array<{ minifig: MinifigureMetadata; confidence: number }>;
  condition: MinifigCondition;
  quantity: number;
  included: boolean;
  status?: BulkScanDetectedItem['status'];
}

export const CameraScanner: React.FC<CameraScannerProps> = ({
  open,
  preferredPriceSource,
  defaultTargetMarginPct = 35,
  collections,
  activeCollectionId,
  onClose,
  onSelectCollection,
  onOpenMinifigDetail,
  onQuickAddToCollection,
  onBulkAddToCollection,
  onScanSavedCelebration
}) => {
  const [topTarget, setTopTarget] = useState<TopTarget>('minifigs');
  const [captureScope, setCaptureScope] = useState<CaptureScope>('bulk');
  const [cameraActive, setCameraActive] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Resultados Single
  const [singleResult, setSingleResult] = useState<RecognitionResult | null>(null);
  const [singleCondition, setSingleCondition] = useState<MinifigCondition>('used_complete');
  const [singleQty, setSingleQty] = useState(1);
  const [singleCandidateIdx, setSingleCandidateIdx] = useState(0);

  // Resultados Bulk
  const [bulkSession, setBulkSession] = useState<BulkScanSession | null>(null);
  const [selectedBulkBoxId, setSelectedBulkBoxId] = useState<string | null>(null);
  const [bulkEditBoxes, setBulkEditBoxes] = useState(false);

  // Resultados Part
  const [partResult, setPartResult] = useState<PartRecognitionResult | null>(null);

  // UI del sheet de Resultados (idéntico al vídeo)
  const [altModalCardKey, setAltModalCardKey] = useState<string | null>(null);
  const [showLotEvaluator, setShowLotEvaluator] = useState(false);
  const [lotAskingPriceEur, setLotAskingPriceEur] = useState('');
  const [lotShippingEur, setLotShippingEur] = useState('');
  const [lotMarginPct, setLotMarginPct] = useState(defaultTargetMarginPct);
  const [distributeLotCost, setDistributeLotCost] = useState(true);
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [showColPicker, setShowColPicker] = useState(false);
  const [addedCardKeys, setAddedCardKeys] = useState<Record<string, boolean>>({});
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [targetCollectionId, setTargetCollectionId] = useState<string>(activeCollectionId ?? '');
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
  const [torchHint, setTorchHint] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const inFlightLiveRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setTargetCollectionId(activeCollectionId ?? collections[0]?.id ?? '');
  }, [activeCollectionId, collections]);

  useEffect(() => {
    setLotMarginPct(defaultTargetMarginPct);
  }, [defaultTargetMarginPct]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setTorchOn(false);
  };

  // Arrancar cámara trasera automáticamente al abrir el escáner fullscreen (si hay soporte)
  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    let cancelled = false;
    const startRearCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 1920 }
          },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setCameraActive(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        // Sin permiso o sin cámara: el botón disparador abre cámara nativa/galería sin bloquear
        setCameraActive(false);
      }
    };

    void startRearCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open]);

  const hasResults =
    (topTarget === 'minifigs' &&
      ((captureScope === 'single' && singleResult !== null) ||
        (captureScope === 'bulk' && bulkSession !== null))) ||
    (topTarget === 'parts' && partResult !== null);

  // Re-vincular el MediaStream al elemento <video> al volver desde Resultados (evita pantalla negra en móvil)
  useEffect(() => {
    if (!open || !cameraActive || hasResults) return;
    const videoEl = videoRef.current;
    const stream = streamRef.current;
    if (videoEl && stream && videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
      void videoEl.play().catch(() => {});
    }
  }, [open, cameraActive, hasResults]);

  const activeCol = useMemo(
    () => collections.find((c) => c.id === targetCollectionId) ?? collections[0] ?? null,
    [collections, targetCollectionId]
  );
  const activeColDot = activeCol?.color || COLLECTION_DOT_COLORS[0];

  // Unificar lista de tarjetas detectadas (1 para Single, N para Bulk)
  const detectedCards: DetectedCardItem[] = useMemo(() => {
    if (topTarget !== 'minifigs') return [];
    if (captureScope === 'bulk' && bulkSession) {
      return bulkSession.items
        .filter((it) => it.status !== 'no_match' && it.status !== 'error')
        .map((it) => ({
          key: it.boxId || String(it.slotIndex),
          slotIndex: it.slotIndex,
          selectedMinifig: it.selectedMinifig,
          candidates: it.candidates.map((c) => ({ minifig: c.minifig, confidence: c.confidence })),
          condition: it.condition,
          quantity: it.quantity,
          included: it.included,
          status: it.status
        }));
    }
    if (captureScope === 'single' && singleResult && singleResult.candidates.length > 0) {
      const chosen =
        singleResult.candidates[singleCandidateIdx] ?? singleResult.candidates[0];
      return [
        {
          key: 'single-0',
          slotIndex: 1,
          selectedMinifig: chosen.minifig,
          candidates: singleResult.candidates.map((c) => ({
            minifig: c.minifig,
            confidence: c.confidence
          })),
          condition: singleCondition,
          quantity: singleQty,
          included: true,
          status: 'matched'
        }
      ];
    }
    return [];
  }, [
    topTarget,
    captureScope,
    bulkSession,
    singleResult,
    singleCandidateIdx,
    singleCondition,
    singleQty
  ]);

  const [liveDualMap, setLiveDualMap] = useState<
    Record<string, { usedEur: number; newEur: number; incompleteEur: number }>
  >({});

  useEffect(() => {
    if (detectedCards.length === 0) return;
    let cancelled = false;
    const runLiveFetch = async () => {
      const toFetch = detectedCards.filter((c) => {
        const cacheKey = `${preferredPriceSource}:${c.selectedMinifig.figId.toLowerCase()}`;
        return !liveDualMap[cacheKey] && !inFlightLiveRef.current.has(cacheKey);
      });
      if (toFetch.length === 0) return;
      for (const c of toFetch) {
        inFlightLiveRef.current.add(
          `${preferredPriceSource}:${c.selectedMinifig.figId.toLowerCase()}`
        );
      }

      const results = await Promise.all(
        toFetch.map(async (c) => {
          const cacheKey = `${preferredPriceSource}:${c.selectedMinifig.figId.toLowerCase()}`;
          try {
            const dual = await fetchLiveDualPricesForMinifig(
              c.selectedMinifig,
              preferredPriceSource
            );
            return { cacheKey, dual };
          } catch {
            return null;
          } finally {
            inFlightLiveRef.current.delete(cacheKey);
          }
        })
      );
      if (cancelled) return;
      setLiveDualMap((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r && r.dual.usedEur > 0) {
            next[r.cacheKey] = r.dual;
          }
        }
        return next;
      });
    };
    void runLiveFetch();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedCards, preferredPriceSource]);

  const cardPriceMap = useMemo(() => {
    const out: Record<string, { primary: number; secondary: number; used: number; newVal: number }> =
      {};
    for (const card of detectedCards) {
      const cacheKey = `${preferredPriceSource}:${card.selectedMinifig.figId.toLowerCase()}`;
      const dual =
        liveDualMap[cacheKey] ??
        getQuickDualPricesEur(card.selectedMinifig, preferredPriceSource);
      const primary = card.condition === 'new' ? dual.newEur : dual.usedEur;
      const secondary = card.condition === 'new' ? dual.usedEur : dual.newEur;
      out[card.key] = { primary, secondary, used: dual.usedEur, newVal: dual.newEur };
    }
    return out;
  }, [detectedCards, preferredPriceSource, liveDualMap]);

  const overlayPriceByBoxId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [k, v] of Object.entries(cardPriceMap)) {
      map[k] = v.primary;
    }
    return map;
  }, [cardPriceMap]);

  const totalDetectedValueEur = useMemo(() => {
    let sum = 0;
    for (const card of detectedCards) {
      if (!card.included) continue;
      sum += (cardPriceMap[card.key]?.primary ?? 0) * card.quantity;
    }
    return Math.round(sum * 100) / 100;
  }, [detectedCards, cardPriceMap]);

  const totalDetectedUnits = useMemo(
    () => detectedCards.filter((c) => c.included).reduce((s, c) => s + c.quantity, 0),
    [detectedCards]
  );

  const allAreNew =
    detectedCards.length > 0 && detectedCards.every((c) => c.condition === 'new');

  const [appendToBulkOnNextCapture, setAppendToBulkOnNextCapture] = useState(false);

  if (!open) return null;

  const resetResults = () => {
    setSingleResult(null);
    setBulkSession(null);
    setPartResult(null);
    setDiagnosticError(null);
    setSelectedBulkBoxId(null);
    setBulkEditBoxes(false);
    setAltModalCardKey(null);
    setShowLotEvaluator(false);
    setAddedCardKeys({});
    setAppendToBulkOnNextCapture(false);
    setScanProgress(null);
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (track && 'applyConstraints' in track) {
      try {
        const next = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: next } as MediaTrackConstraintSet]
        });
        setTorchOn(next);
        setTorchHint(null);
        return;
      } catch {
        // dispositivo sin flash web
      }
    }
    setTorchHint('Flash no disponible en este navegador · usa ✨ arriba para demo');
    setTimeout(() => setTorchHint(null), 2600);
  };

  const runRecognitionFromFile = async (file: Blob, forceAppend = false) => {
    setIsScanning(true);
    setDiagnosticError(null);
    setScanProgress(null);
    const shouldAppend = forceAppend || appendToBulkOnNextCapture;
    setAppendToBulkOnNextCapture(false);
    if (!shouldAppend) {
      setAddedCardKeys({});
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await loadImageElementFromUrl(objectUrl);
      const prepared = await preprocessImageSourceToBlob(img);
      if (topTarget === 'parts') {
        const res = await identifyPartFromImage({
          blob: prepared.blob,
          previewDataUrl: prepared.dataUrl
        });
        setPartResult(res);
        if (res.candidates.length === 0) {
          setDiagnosticError(res.errorMessage || 'No se identificó ninguna pieza LEGO.');
        }
        return;
      }

      if (captureScope === 'bulk') {
        const session = await identifyBulkLotFromImage({
          sourceElement: img,
          previewDataUrl: prepared.dataUrl,
          onProgress: (done, total) => setScanProgress({ done, total })
        });
        const newMatched = session.items.filter(
          (i) => i.status !== 'no_match' && i.status !== 'error'
        );

        if (shouldAppend && bulkSession && newMatched.length > 0) {
          setBulkSession((prev) => {
            if (!prev) return session;
            const startIdx = prev.items.length;
            const appended = newMatched.map((it, idx) => ({
              ...it,
              boxId: `box-${Date.now()}-${startIdx + idx + 1}`,
              slotIndex: startIdx + idx + 1
            }));
            return {
              ...session,
              items: [...prev.items, ...appended]
            };
          });
        } else {
          setBulkSession(session);
        }

        if (newMatched.length === 0 && (!shouldAppend || !bulkSession)) {
          setDiagnosticError(
            session.errorMessage ||
              'No se detectaron figuras automáticamente. Toca "+ Añadir recuadro" sobre la foto o escribe el código.'
          );
        }
      } else {
        const res = await identifyMinifigureFromImage({
          blob: prepared.blob,
          previewDataUrl: prepared.dataUrl
        });
        setSingleResult(res);
        setSingleCandidateIdx(0);
        setSingleCondition('used_complete');
        setSingleQty(1);
        if (res.candidates.length === 0) {
          setDiagnosticError(
            res.errorMessage || 'No se reconoció una minifigura clara en la foto.'
          );
        }
      }
    } catch (err) {
      setDiagnosticError(
        err instanceof Error ? err.message : 'Error al procesar la imagen.'
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
      setIsScanning(false);
      setScanProgress(null);
    }
  };

  const handleShutterClick = async () => {
    if (cameraActive && videoRef.current && videoRef.current.videoWidth > 0) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', 0.9)
        );
        if (blob) {
          await runRecognitionFromFile(blob);
          return;
        }
      }
    }
    nativeCameraInputRef.current?.click();
  };

  const triggerDemoScan = async () => {
    setIsScanning(true);
    setDiagnosticError(null);
    setAddedCardKeys({});
    try {
      if (topTarget === 'parts') {
        const res = await identifyPartFromImage({
          previewDataUrl: '/samples/sw0585.jpg',
          presetPart: {
            partNum: '973pb1795c01',
            name: 'Torso Armadura Imperial 2014 (Stormtrooper)',
            category: 'torso',
            imageUrl: '/samples/sw0585.jpg'
          }
        });
        setPartResult(res);
      } else if (captureScope === 'bulk') {
        const session = await identifyBulkLotFromImage({ isDemoLot: true });
        setBulkSession(session);
      } else {
        const res = await identifyMinifigureFromImage({
          previewDataUrl: '/samples/sw0585.jpg',
          presetFigId: 'sw0585'
        });
        setSingleResult(res);
        setSingleCandidateIdx(0);
        setSingleCondition('used_complete');
        setSingleQty(1);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void runRecognitionFromFile(file);
    e.target.value = '';
  };

  const setGlobalCondition = (cond: MinifigCondition) => {
    if (captureScope === 'single') {
      setSingleCondition(cond);
      return;
    }
    setBulkSession((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) => ({ ...it, condition: cond }))
          }
        : prev
    );
  };

  const updateCardCondition = (cardKey: string, cond: MinifigCondition) => {
    if (captureScope === 'single') {
      setSingleCondition(cond);
      return;
    }
    setBulkSession((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              (it.boxId || String(it.slotIndex)) === cardKey ? { ...it, condition: cond } : it
            )
          }
        : prev
    );
  };

  const updateCardQty = (cardKey: string, delta: number) => {
    if (captureScope === 'single') {
      setSingleQty((q) => Math.max(1, q + delta));
      return;
    }
    setBulkSession((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              (it.boxId || String(it.slotIndex)) === cardKey
                ? { ...it, quantity: Math.max(1, it.quantity + delta) }
                : it
            )
          }
        : prev
    );
  };

  const swapCardCandidate = (cardKey: string, minifig: MinifigureMetadata) => {
    setAddedCardKeys((prev) => {
      if (!prev[cardKey]) return prev;
      const copy = { ...prev };
      delete copy[cardKey];
      return copy;
    });
    if (captureScope === 'single' && singleResult) {
      const idx = singleResult.candidates.findIndex((c) => c.minifig.figId === minifig.figId);
      if (idx >= 0) setSingleCandidateIdx(idx);
      setAltModalCardKey(null);
      return;
    }
    setBulkSession((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              (it.boxId || String(it.slotIndex)) === cardKey
                ? { ...it, selectedMinifig: minifig }
                : it
            )
          }
        : prev
    );
    setAltModalCardKey(null);
  };

  // Callbacks del editor interactivo de recuadros Bulk
  const handleUpdateBoxRect = (boxId: string, rect: NormalizedBoundingBox) => {
    setBulkSession((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              (it.boxId || String(it.slotIndex)) === boxId ? { ...it, boundingBox: rect } : it
            )
          }
        : prev
    );
  };

  const handleRescanBox = async (boxId: string) => {
    if (!bulkSession) return;
    const target = bulkSession.items.find((it) => (it.boxId || String(it.slotIndex)) === boxId);
    if (!target) return;

    setBulkSession((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              (it.boxId || String(it.slotIndex)) === boxId ? { ...it, status: 'scanning' } : it
            )
          }
        : prev
    );

    try {
      const updated = await identifySingleBulkBox({
        sourceImageUrl: bulkSession.sourceImageDataUrl,
        boundingBox: target.boundingBox,
        slotIndex: target.slotIndex,
        boxId
      });
      setBulkSession((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                (it.boxId || String(it.slotIndex)) === boxId ? updated : it
              )
            }
          : prev
      );
    } catch {
      // ignore
    }
  };

  const handleAddBoxAtRect = async (rect: NormalizedBoundingBox) => {
    if (!bulkSession) return;
    const nextSlot =
      bulkSession.items.reduce((max, it) => Math.max(max, it.slotIndex), 0) + 1;
    const newBoxId = `box-${Date.now()}-${nextSlot}`;
    const placeholder: BulkScanDetectedItem = {
      boxId: newBoxId,
      slotIndex: nextSlot,
      boundingBox: rect,
      selectedMinifig: createCustomMinifigMetadata({
        figId: `lote-${nextSlot}`,
        name: `Analizando #${nextSlot}...`
      }),
      candidates: [],
      condition: 'used_complete',
      quantity: 1,
      included: false,
      status: 'scanning'
    };

    setBulkSession((prev) => (prev ? { ...prev, items: [...prev.items, placeholder] } : prev));
    setSelectedBulkBoxId(newBoxId);

    try {
      const scanned = await identifySingleBulkBox({
        sourceImageUrl: bulkSession.sourceImageDataUrl,
        boundingBox: rect,
        slotIndex: nextSlot,
        boxId: newBoxId
      });
      setBulkSession((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) => (it.boxId === newBoxId ? scanned : it))
            }
          : prev
      );
    } catch {
      // ignore
    }
  };

  const handleDeleteBox = (boxId: string) => {
    setBulkSession((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.filter((it) => (it.boxId || String(it.slotIndex)) !== boxId)
          }
        : prev
    );
    if (selectedBulkBoxId === boxId) setSelectedBulkBoxId(null);
  };

  const handleAddSingleCard = async (card: DetectedCardItem) => {
    const unitVal = cardPriceMap[card.key]?.primary ?? 8;
    const targetId = activeCol?.id ?? null;
    await onQuickAddToCollection(
      card.selectedMinifig,
      card.condition,
      card.quantity,
      Math.round(unitVal * 0.8 * 100) / 100,
      unitVal,
      targetId
    );
    setAddedCardKeys((prev) => ({ ...prev, [card.key]: true }));
  };

  const handleAddAllToCollection = async () => {
    const activeCards = detectedCards.filter((c) => c.included);
    if (activeCards.length === 0) return;

    const targetId = activeCol?.id ?? null;
    const ask = Number(lotAskingPriceEur.replace(',', '.')) || 0;
    const ship = Number(lotShippingEur.replace(',', '.')) || 0;
    const totalLotCost = ask + ship;

    const baseLines = activeCards.map((c) => ({
      quantity: c.quantity,
      estimatedUnitValueEur: cardPriceMap[c.key]?.primary ?? 8
    }));

    const allocatedCosts =
      distributeLotCost && totalLotCost > 0
        ? allocateLotPurchasePrices(baseLines, totalLotCost)
        : baseLines.map((l) => Math.round(l.estimatedUnitValueEur * 0.8 * 100) / 100);

    const bulkLines: BulkImportParsedLine[] = activeCards.map((c, idx) => ({
      figId: c.selectedMinifig.figId,
      minifig: c.selectedMinifig,
      condition: c.condition,
      quantity: c.quantity,
      purchasePriceEur: allocatedCosts[idx],
      estimatedUnitValueEur: cardPriceMap[c.key]?.primary ?? 8,
      notes:
        totalLotCost > 0
          ? `Lote escaneado (coste repartido de €${totalLotCost.toFixed(2)})`
          : 'Añadida desde el escáner'
    }));

    await onBulkAddToCollection(bulkLines, targetId);

    onScanSavedCelebration({
      addedItems: activeCards.map((c) => ({
        minifig: c.selectedMinifig,
        unitPriceEur: cardPriceMap[c.key]?.primary ?? 8,
        quantity: c.quantity
      })),
      addedValueEur: totalDetectedValueEur,
      targetCollectionId: targetId
    });
    resetResults();
  };

  const handleManualFallbackLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCodeInput.trim();
    if (!clean) return;
    const existing = ALL_MINIFIG_CATALOG.find(
      (m) => m.figId.toLowerCase() === clean.toLowerCase()
    );
    const meta = existing ?? createCustomMinifigMetadata({ figId: clean });
    setDiagnosticError(null);
    setAddedCardKeys({});
    setSingleCandidateIdx(0);
    setSingleCondition('used_complete');
    setSingleQty(1);
    setSingleResult({
      scanId: `manual-${Date.now()}`,
      capturedAtIso: new Date().toISOString(),
      processedImageDataUrl: meta.imageUrl,
      latencyMs: 0,
      apiSource: 'brickognize_live',
      candidates: [{ minifig: meta, confidence: 1, matchedFeatures: ['Código manual'], source: 'brickognize_api' }]
    });
    setCaptureScope('single');
    setManualCodeInput('');
  };

  const altModalCard = detectedCards.find((c) => c.key === altModalCardKey) ?? null;

  return (
    <div
      className="bm-scanner-fullscreen"
      id="fullscreen-camera-scanner"
      role="dialog"
      aria-modal="true"
      aria-label="Escáner de minifiguras y piezas"
    >
      {/* Inputs ocultos de galería y cámara nativa */}
      <input
        ref={galleryInputRef}
        id="gallery-file-input"
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileInput}
      />
      <input
        ref={nativeCameraInputRef}
        id="native-camera-file-input"
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleFileInput}
      />

      {/* Cabecera flotante sobre el visor oscuro */}
      <header className="bm-scanner-topbar">
        <button
          type="button"
          id="btn-close-scanner"
          className="bm-cam-circle-btn"
          onClick={onClose}
          aria-label="Cerrar escáner"
        >
          <ChevronLeft size={21} />
        </button>

        {hasResults && topTarget === 'minifigs' && detectedCards.length > 0 ? (
          <div className="bm-scanner-live-pill" id="scanner-running-total">
            <strong>€{totalDetectedValueEur.toFixed(2)}</strong>
            <span>ITEMS {totalDetectedUnits}</span>
          </div>
        ) : (
          <div className="bm-cam-pill-toggle" role="tablist">
            <button
              type="button"
              id="mode-tab-minifigs"
              className={topTarget === 'minifigs' ? 'active' : ''}
              onClick={() => {
                setTopTarget('minifigs');
                resetResults();
              }}
            >
              Minifigs
            </button>
            <button
              type="button"
              id="mode-tab-part"
              className={topTarget === 'parts' ? 'active' : ''}
              onClick={() => {
                setTopTarget('parts');
                resetResults();
              }}
            >
              Piezas
            </button>
          </div>
        )}

        <button
          type="button"
          id="btn-demo-scan-quick"
          className="bm-cam-circle-btn"
          onClick={() => void triggerDemoScan()}
          title="Probar escaneo de ejemplo"
          aria-label="Probar escaneo de ejemplo"
        >
          <Sparkles size={17} />
        </button>
      </header>

      {/* Zona de Cámara / Imagen congelada con recuadros verdes */}
      <div
        className={`bm-scanner-viewport ${hasResults ? 'compact' : ''} ${
          hasResults && bulkEditBoxes ? 'expanded-editor' : ''
        }`}
      >
        {!hasResults ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`bm-cam-video ${cameraActive ? 'visible' : ''}`}
            />
            {!cameraActive && (
              <div className="bm-cam-placeholder">
                <div className="bm-cam-reticle">
                  <Camera size={32} />
                  <p>
                    {topTarget === 'parts'
                      ? 'Enfoca una pieza suelta (torso, casco o piernas)'
                      : captureScope === 'bulk'
                      ? 'Coloca varias minifiguras sobre fondo liso'
                      : 'Encuadra 1 minifigura de pies a cabeza'}
                  </p>
                  <span>Pulsa el obturador, sube desde galería o toca ✨ para probar</span>
                </div>
              </div>
            )}
            {torchHint && (
              <div className="bm-cam-toast" role="status">
                {torchHint}
              </div>
            )}
          </>
        ) : topTarget === 'minifigs' && captureScope === 'bulk' && bulkSession ? (
          <div className="bm-frozen-overlay-wrap">
            <InteractiveBulkOverlay
              imageUrl={bulkSession.sourceImageDataUrl}
              aspectRatio={bulkSession.aspectRatio}
              expanded={bulkEditBoxes}
              items={bulkSession.items}
              priceByBoxId={overlayPriceByBoxId}
              selectedBoxId={selectedBulkBoxId}
              onSelectBox={setSelectedBulkBoxId}
              onUpdateBoxRect={handleUpdateBoxRect}
              onCommitBoxRect={(boxId) => void handleRescanBox(boxId)}
              onAddBoxAtRect={(rect) => void handleAddBoxAtRect(rect)}
              onDeleteBox={handleDeleteBox}
              onRescanBox={(boxId) => void handleRescanBox(boxId)}
            />
          </div>
        ) : (
          <div className="bm-frozen-single">
            <img
              src={
                topTarget === 'parts'
                  ? partResult?.processedImageDataUrl || '/samples/sw0585.jpg'
                  : singleResult?.processedImageDataUrl || '/samples/sw0585.jpg'
              }
              alt="Captura analizada"
            />
            {detectedCards[0] && (
              <div className="bm-single-price-float">
                €{(cardPriceMap[detectedCards[0].key]?.primary ?? 0).toFixed(2)}
              </div>
            )}
          </div>
        )}

        {isScanning && (
          <div className="bm-scanning-hud">
            <Loader2 size={24} className="spin" />
            <span>
              {scanProgress && scanProgress.total > 1
                ? `Analizando lote (${scanProgress.done}/${scanProgress.total})…`
                : 'Identificando con Brickognize…'}
            </span>
          </div>
        )}
      </div>

      {/* Controles inferiores de cámara (cuando aún no hay resultados) */}
      {!hasResults && (
        <div className="bm-cam-controls-dock">
          <div className="bm-shutter-row">
            <button
              type="button"
              id="btn-upload-photo"
              className="bm-cam-circle-btn lg"
              onClick={() => {
                setAppendToBulkOnNextCapture(false);
                galleryInputRef.current?.click();
              }}
              aria-label="Subir desde galería"
            >
              <ImageIcon size={21} />
            </button>

            <button
              type="button"
              id="btn-shutter-scan"
              className="bm-shutter-btn"
              onClick={() => void handleShutterClick()}
              disabled={isScanning}
              aria-label="Hacer foto y escanear"
            >
              <span />
            </button>

            <button
              type="button"
              id="btn-torch-or-demo"
              className={`bm-cam-circle-btn lg ${torchOn ? 'active' : ''}`}
              onClick={() => void toggleTorch()}
              aria-label="Flash o demo"
              title="Flash / Demo rápida"
            >
              <Zap size={20} />
            </button>
          </div>

          {topTarget === 'minifigs' && (
            <div className="bm-scope-row" role="tablist">
              <button
                type="button"
                id="mode-tab-single"
                className={captureScope === 'single' ? 'active' : ''}
                onClick={() => setCaptureScope('single')}
              >
                Individual
              </button>
              <button
                type="button"
                id="mode-tab-bulk"
                className={captureScope === 'bulk' ? 'active' : ''}
                onClick={() => setCaptureScope('bulk')}
              >
                Lote
              </button>
            </div>
          )}
        </div>
      )}

      {/* HOJA BLANCA DESLIZANTE DE RESULTADOS (idéntica al vídeo 00:16–00:24) */}
      {hasResults && (
        <div className="bm-results-sheet" id="scanner-results-sheet">
          <div className="bm-sheet-grabber" />

          {topTarget === 'parts' ? (
            <div className="bm-results-scroll">
              <div className="bm-results-head">
                <h2>Pieza y cruce</h2>
                <button
                  type="button"
                  className="bm-link-muted"
                  onClick={resetResults}
                >
                  Nueva foto
                </button>
              </div>
              <PartScannerPanel
                partResult={partResult}
                isScanning={isScanning}
                preferredPriceSource={preferredPriceSource}
                onTriggerDemoPartCross={() => void triggerDemoScan()}
                onOpenMinifigDetail={(fig) => onOpenMinifigDetail(fig, 'used_complete')}
              />
            </div>
          ) : (
            <>
              <div className="bm-results-head">
                <div>
                  <h2>Resultados</h2>
                  {captureScope === 'bulk' && bulkSession && (
                    <button
                      type="button"
                      id="btn-toggle-bulk-boxes"
                      className="bm-tiny-link"
                      onClick={() => setBulkEditBoxes((v) => !v)}
                    >
                      <Layers size={12} /> {bulkEditBoxes ? 'Ocultar editor' : 'Ajustar recuadros'}
                    </button>
                  )}
                </div>

                {detectedCards.length > 0 && (
                  <div className="bm-segmented compact">
                    <button
                      type="button"
                      id="btn-results-all-used"
                      className={!allAreNew ? 'active' : ''}
                      onClick={() => setGlobalCondition('used_complete')}
                    >
                      Usada
                    </button>
                    <button
                      type="button"
                      id="btn-results-all-new"
                      className={allAreNew ? 'active' : ''}
                      onClick={() => setGlobalCondition('new')}
                    >
                      Nueva
                    </button>
                  </div>
                )}
              </div>

              <div className="bm-results-scroll">
                {diagnosticError && detectedCards.length === 0 ? (
                  <div className="bm-diagnostic-clean" id="scanner-diagnostic-panel">
                    <AlertCircle size={22} />
                    <h3>No se identificó ninguna minifigura</h3>
                    <p>{diagnosticError}</p>
                    <form className="bm-search-row" onSubmit={handleManualFallbackLookup}>
                      <div className="bm-search-input-wrap">
                        <input
                          id="scanner-manual-code-input"
                          type="text"
                          value={manualCodeInput}
                          onChange={(e) => setManualCodeInput(e.target.value)}
                          placeholder="Escribe código BrickLink (ej. sw0585)"
                        />
                      </div>
                      <button type="submit" className="bm-btn-primary sm">
                        Buscar
                      </button>
                    </form>
                    <button
                      type="button"
                      className="bm-btn-secondary full"
                      onClick={resetResults}
                    >
                      <RotateCcw size={15} /> Repetir foto
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Grid 2 columnas idéntico al vídeo */}
                    <div className="bm-grid-2" id="recognition-result-panel">
                      {detectedCards.map((card) => {
                        const prices = cardPriceMap[card.key] ?? {
                          primary: 0,
                          secondary: 0
                        };
                        const isAdded = Boolean(addedCardKeys[card.key]);

                        return (
                          <article
                            key={card.key}
                            id={`scan-card-${card.slotIndex}`}
                            className="bm-scan-card"
                          >
                            <button
                              type="button"
                              id={`btn-scan-more-${card.slotIndex}`}
                              className="bm-card-more-btn"
                              onClick={() => setAltModalCardKey(card.key)}
                              aria-label="Alternativas y detalle"
                            >
                              <MoreHorizontal size={15} />
                            </button>

                            <button
                              type="button"
                              className="bm-catalog-card-top"
                              onClick={() =>
                                onOpenMinifigDetail(card.selectedMinifig, card.condition)
                              }
                            >
                              <div className="bm-card-img-box">
                                <img
                                  src={card.selectedMinifig.imageUrl}
                                  alt={card.selectedMinifig.name}
                                />
                              </div>
                              <h3 className="bm-card-title truncate">
                                {card.selectedMinifig.name}
                              </h3>
                              <span className="bm-card-code">{card.selectedMinifig.figId}</span>
                              <div className="bm-scan-dual-price">
                                <strong>€{prices.primary.toFixed(2)}</strong>
                                <span>€{prices.secondary.toFixed(2)}</span>
                              </div>
                            </button>

                            <div className="bm-card-cond-toggle">
                              <button
                                type="button"
                                className={card.condition !== 'new' ? 'active' : ''}
                                onClick={() => updateCardCondition(card.key, 'used_complete')}
                              >
                                Usada
                              </button>
                              <button
                                type="button"
                                className={card.condition === 'new' ? 'active' : ''}
                                onClick={() => updateCardCondition(card.key, 'new')}
                              >
                                Nueva
                              </button>
                            </div>

                            <div className="bm-card-qty-row">
                              <span>Cant.</span>
                              <div className="bm-mini-stepper">
                                <button
                                  type="button"
                                  onClick={() => updateCardQty(card.key, -1)}
                                  aria-label="Restar"
                                >
                                  <Minus size={12} />
                                </button>
                                <strong>{card.quantity}</strong>
                                <button
                                  type="button"
                                  onClick={() => updateCardQty(card.key, 1)}
                                  aria-label="Sumar"
                                >
                                  <Plus size={12} />
                                </button>
                              </div>
                            </div>

                            <div className="bm-card-add-footer">
                              <span className="bm-col-mini-label">
                                <i style={{ backgroundColor: activeColDot }} />
                                {activeCol?.name || 'Colección'}
                              </span>
                              <button
                                type="button"
                                className={`bm-add-inline-btn ${isAdded ? 'added' : ''}`}
                                onClick={() => void handleAddSingleCard(card)}
                              >
                                {isAdded ? (
                                  <>
                                    <Check size={12} /> Hecho
                                  </>
                                ) : (
                                  '+ Añadir'
                                )}
                              </button>
                            </div>
                          </article>
                        );
                      })}

                      {/* Tarjeta punteada "+ Escanear otra" idéntica al vídeo */}
                      <button
                        type="button"
                        id="btn-scan-another-tile"
                        className="bm-scan-another-card"
                        onClick={() => {
                          if (captureScope === 'bulk') {
                            setAppendToBulkOnNextCapture(true);
                            nativeCameraInputRef.current?.click();
                          } else {
                            resetResults();
                          }
                        }}
                      >
                        <Plus size={22} />
                        <span>Escanear otra</span>
                      </button>
                    </div>

                    {/* Superpoder BrickLens oculto tras un toggle discreto: Evaluador Wallapop/Mercadillo */}
                    {detectedCards.length > 0 && (
                      <div className="bm-lot-eval-collapsible">
                        <button
                          type="button"
                          id="btn-toggle-lot-evaluator"
                          className="bm-lot-eval-trigger"
                          onClick={() => setShowLotEvaluator((v) => !v)}
                        >
                          <span>
                            <Calculator size={15} /> Evaluar oferta de lote (Wallapop / Mercadillo)
                          </span>
                          {showLotEvaluator ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </button>

                        {showLotEvaluator && (
                          <div className="bm-lot-eval-body">
                            <LotEvaluatorBar
                              totalMarketValueEur={totalDetectedValueEur}
                              selectedUnitsCount={totalDetectedUnits}
                              askingPriceInput={lotAskingPriceEur}
                              shippingInput={lotShippingEur}
                              targetMarginPct={lotMarginPct}
                              distributeCostProportionally={distributeLotCost}
                              onChangeAskingPrice={setLotAskingPriceEur}
                              onChangeShipping={setLotShippingEur}
                              onChangeTargetMargin={setLotMarginPct}
                              onToggleDistributeCost={setDistributeLotCost}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Pie fijo estilo vídeo: ● Colección ▾ | Reset + botón principal Brick Vermilion */}
              {detectedCards.length > 0 && (
                <footer className="bm-results-footer">
                  <div className="bm-results-footer-top">
                    <div className="bm-col-dropdown-wrap">
                      <button
                        type="button"
                        className="bm-col-link-trigger"
                        onClick={() => setShowColPicker((v) => !v)}
                      >
                        <span
                          className="bm-color-dot sm"
                          style={{ backgroundColor: activeColDot }}
                        />
                        <span>{activeCol?.name || 'Mi Colección'}</span>
                        <ChevronDown size={14} />
                      </button>

                      {showColPicker && (
                        <div className="bm-col-popover">
                          {collections.map((col, idx) => (
                            <button
                              key={col.id}
                              type="button"
                              className={col.id === activeCol?.id ? 'active' : ''}
                              onClick={() => {
                                setTargetCollectionId(col.id);
                                onSelectCollection(col.id);
                                setShowColPicker(false);
                              }}
                            >
                              <span
                                className="bm-color-dot sm"
                                style={{
                                  backgroundColor:
                                    col.color ||
                                    COLLECTION_DOT_COLORS[idx % COLLECTION_DOT_COLORS.length]
                                }}
                              />
                              <span className="truncate">{col.name}</span>
                              {col.id === activeCol?.id && <Check size={14} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      id="btn-results-reset"
                      className="bm-link-muted"
                      onClick={resetResults}
                    >
                      Reiniciar
                    </button>
                  </div>

                  <button
                    type="button"
                    id="btn-bulk-add-all"
                    className="bm-btn-primary full lg"
                    onClick={() => void handleAddAllToCollection()}
                  >
                    Añadir {totalDetectedUnits === 1 ? '1 figura' : `las ${totalDetectedUnits}`} a
                    &ldquo;{activeCol?.name || 'Mi Colección'}&rdquo;
                  </button>
                </footer>
              )}
            </>
          )}
        </div>
      )}

      {/* Modal de alternativas (hasta 12 candidatos) y acceso rápido a Ficha/Despiece */}
      {altModalCard && (
        <div
          className="bm-modal-backdrop"
          onClick={() => setAltModalCardKey(null)}
        >
          <div className="bm-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bm-modal-head">
              <strong>Elegir alternativa ({altModalCard.candidates.length})</strong>
              <button
                type="button"
                className="bm-icon-soft sm"
                onClick={() => setAltModalCardKey(null)}
              >
                <X size={15} />
              </button>
            </div>

            <button
              type="button"
              className="bm-btn-secondary full"
              onClick={() => {
                const fig = altModalCard.selectedMinifig;
                const cond = altModalCard.condition;
                setAltModalCardKey(null);
                onOpenMinifigDetail(fig, cond);
              }}
            >
              Ver ficha completa, 5 portales y despiece
            </button>

            <div className="bm-alt-list">
              {altModalCard.candidates.map((cand) => {
                const isSelected = cand.minifig.figId === altModalCard.selectedMinifig.figId;
                return (
                  <button
                    key={cand.minifig.figId}
                    type="button"
                    className={`bm-alt-row ${isSelected ? 'active' : ''}`}
                    onClick={() => swapCardCandidate(altModalCard.key, cand.minifig)}
                  >
                    <img src={cand.minifig.imageUrl} alt={cand.minifig.name} className="bm-thumb-sm" />
                    <div className="bm-row-text-stack">
                      <span className="bm-row-title truncate">{cand.minifig.name}</span>
                      <span className="bm-row-sub">
                        {cand.minifig.figId} · {Math.round(cand.confidence * 100)}% similitud
                      </span>
                    </div>
                    {isSelected && <Check size={16} className="accent-icon" />}
                  </button>
                );
              })}
            </div>

            {captureScope === 'bulk' && (
              <button
                type="button"
                className="bm-btn-secondary full"
                onClick={() => {
                  const key = altModalCard.key;
                  setAltModalCardKey(null);
                  void handleRescanBox(key);
                }}
              >
                <RefreshCw size={14} /> Re-escanear solo este recuadro
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
