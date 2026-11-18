import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Grid,
  ImagePlus,
  Loader2,
  Minus,
  MoreVertical,
  Plus,
  Puzzle,
  QrCode,
  RotateCcw,
  Search,
  Sparkles,
  Zap
} from 'lucide-react';
import type {
  BulkImportParsedLine,
  BulkScanDetectedItem,
  BulkScanSession,
  CmfLookupResult,
  MinifigCondition,
  MinifigureMetadata,
  NormalizedBoundingBox,
  PartRecognitionResult,
  PreferredPriceSource,
  PriceComparisonReport,
  RecognitionCandidate,
  RecognitionResult,
  ScannerMode,
  UserCollection
} from '../../types/minifig';
import {
  createCustomMinifigMetadata,
  DEMO_BULK_LOT_IMAGE,
  findMinifigById,
  MINIFIG_CATALOG
} from '../../data/catalogPresets';
import { lookupCmfCode, SAMPLE_CMF_PRESETS } from '../../data/cmfCodes';
import {
  allocateLotPurchasePrices,
  getQuickDualPricesEur
} from '../../services/priceAggregator';
import {
  encodeFullFrameToJpeg,
  identifyBulkLotFromImage,
  identifyMinifigureFromImage,
  identifyPartFromImage,
  identifySingleBulkBox,
  preprocessImageSourceToBlob
} from '../../services/visionService';
import { PriceAverageCard } from '../shared/PriceAverageCard';
import { InteractiveBulkOverlay } from './InteractiveBulkOverlay';
import { LotEvaluatorBar } from './LotEvaluatorBar';
import { PartScannerPanel } from './PartScannerPanel';

interface CameraScannerProps {
  preferredPriceSource: PreferredPriceSource;
  defaultTargetMarginPct: number;
  collections: UserCollection[];
  activeCollectionId: string | null;
  onSelectCollection: (id: string) => void;
  onCreateCollection: (name: string) => Promise<UserCollection>;
  onSelectMinifigForComparison: (minifig: MinifigureMetadata, condition: MinifigCondition) => void;
  onOpenMinifigDetail: (minifig: MinifigureMetadata, condition?: MinifigCondition) => void;
  onQuickAddToCollection: (
    minifig: MinifigureMetadata,
    condition: MinifigCondition,
    quantity: number,
    purchasePriceEur: number,
    estimatedUnitValueEur?: number,
    targetCollectionId?: string | null
  ) => void;
  onBulkAddToCollection: (
    lines: BulkImportParsedLine[],
    targetCollectionId?: string | null
  ) => void;
}

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({
  preferredPriceSource,
  defaultTargetMarginPct,
  collections,
  activeCollectionId,
  onSelectCollection,
  onCreateCollection,
  onSelectMinifigForComparison,
  onOpenMinifigDetail,
  onQuickAddToCollection,
  onBulkAddToCollection
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

  const [scannerMode, setScannerMode] = useState<ScannerMode>('single');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Colección destino y creación rápida inline
  const [targetCollectionId, setTargetCollectionId] = useState<string | null>(activeCollectionId);
  const [creatingCollectionMode, setCreatingCollectionMode] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  // Estado Modo Individual (arranca limpio, sin muestras de prueba precargadas)
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [showDemoStrip, setShowDemoStrip] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<RecognitionResult | null>(null);
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number>(0);
  const [showAllCandidates, setShowAllCandidates] = useState<boolean>(false);
  const [selectedCondition, setSelectedCondition] = useState<MinifigCondition>('used_complete');
  const [singlePriceReport, setSinglePriceReport] = useState<PriceComparisonReport | null>(null);
  const [customUnitValueInput, setCustomUnitValueInput] = useState<string>('');
  const [userEditedUnitValue, setUserEditedUnitValue] = useState<boolean>(false);
  const [manualCodeInput, setManualCodeInput] = useState<string>('');

  // Estado Modo Pieza Suelta (Brickognize /predict/parts/ + cruce multi-pieza)
  const [partScanResult, setPartScanResult] = useState<PartRecognitionResult | null>(null);

  // Estado Modo Lote (Bulk interactivo + Evaluador Wallapop/Mercadillo)
  const [bulkSession, setBulkSession] = useState<BulkScanSession | null>(null);
  const [focusedBulkSlot, setFocusedBulkSlot] = useState<number>(1);
  const [selectedBulkBoxId, setSelectedBulkBoxId] = useState<string | null>(null);
  const [expandedAltSlot, setExpandedAltSlot] = useState<number | null>(null);
  const [lotAskingPrice, setLotAskingPrice] = useState<string>('');
  const [lotShippingPrice, setLotShippingPrice] = useState<string>('');
  const [lotTargetMarginPct, setLotTargetMarginPct] = useState<number>(defaultTargetMarginPct);
  const [distributeLotCost, setDistributeLotCost] = useState<boolean>(true);

  // Estado Modo Cajas CMF
  const [cmfInput, setCmfInput] = useState<string>('');
  const [cmfResult, setCmfResult] = useState<CmfLookupResult | null>(null);
  const [cmfCondition, setCmfCondition] = useState<MinifigCondition>('new');
  const [showCmfExamples, setShowCmfExamples] = useState<boolean>(false);

  const [addedFeedback, setAddedFeedback] = useState<string | null>(null);

  useEffect(() => {
    setTargetCollectionId(activeCollectionId);
  }, [activeCollectionId]);

  useEffect(() => {
    setLotTargetMarginPct(defaultTargetMarginPct);
  }, [defaultTargetMarginPct]);

  // Vincula el MediaStream al <video> en cuanto el elemento se monte o active
  useEffect(() => {
    if (cameraActive && videoRef.current && mediaStreamRef.current) {
      const videoEl = videoRef.current;
      if (videoEl.srcObject !== mediaStreamRef.current) {
        videoEl.srcObject = mediaStreamRef.current;
        void videoEl.play().catch(() => undefined);
      }
    }
  }, [cameraActive, scannerMode]);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  // Lectura continua Data Matrix en modo CMF si el navegador soporta BarcodeDetector
  useEffect(() => {
    if (scannerMode !== 'cmf' || !cameraActive) return;
    const win = window as unknown as {
      BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
    };
    if (!win.BarcodeDetector) return;

    let cancelled = false;
    const detector = new win.BarcodeDetector({ formats: ['data_matrix', 'qr_code'] });
    const intervalId = window.setInterval(async () => {
      if (cancelled || !videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const codes = await detector.detect(videoRef.current);
        const firstRaw = codes.find((c) => c.rawValue)?.rawValue;
        if (firstRaw) {
          setCmfInput(firstRaw);
          setCmfResult(lookupCmfCode(firstRaw));
          stopCameraStream();
        }
      } catch {
        // Ignorar fotogramas sin detección
      }
    }, 650);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [scannerMode, cameraActive]);

  const showToast = (msg: string) => {
    setAddedFeedback(msg);
    window.setTimeout(() => setAddedFeedback(null), 2800);
  };

  const stopCameraStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const switchMode = (nextMode: ScannerMode) => {
    stopCameraStream();
    setScannerMode(nextMode);
    setCameraError(null);
  };

  const toggleCamera = async () => {
    if (cameraActive) {
      stopCameraStream();
      return;
    }
    setCameraError(null);

    if (scannerMode === 'cmf') {
      const win = window as unknown as { BarcodeDetector?: unknown };
      if (!win.BarcodeDetector) {
        setCameraError(
          'Este navegador no soporta lectura automática de Data Matrix (iOS Safari lo restringe). Escribe o pega los 7 dígitos impresos bajo la caja.'
        );
        return;
      }
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Navegador sin WebRTC');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 960 }
        },
        audio: false
      });

      const [track] = stream.getVideoTracks();
      if (track && 'applyConstraints' in track) {
        try {
          await track.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet]
          });
        } catch {
          // Algunos dispositivos ignoran constraints avanzadas
        }
      }

      mediaStreamRef.current = stream;
      setCameraActive(true);
    } catch {
      setCameraError(
        scannerMode === 'cmf'
          ? 'Cámara no accesible. Introduce manualmente los 7 dígitos impresos bajo la caja.'
          : 'No se pudo abrir el vídeo en vivo. Usa el botón central para tomar la foto con la cámara nativa del móvil o elige una foto de tu galería.'
      );
      setCameraActive(false);
    }
  };

  const handleScanPreset = async (figId: string) => {
    stopCameraStream();
    setSelectedPresetId(figId);
    setIsScanning(true);
    setShowAllCandidates(false);
    setCameraError(null);
    const preset = MINIFIG_CATALOG.find((m) => m.figId === figId) ?? MINIFIG_CATALOG[0];
    try {
      const result = await identifyMinifigureFromImage({
        previewDataUrl: preset.imageUrl,
        presetFigId: preset.figId
      });
      setScanResult(result);
      setSelectedCandidateIdx(0);
    } finally {
      setIsScanning(false);
    }
  };

  const handleDemoPartCross = async () => {
    stopCameraStream();
    setIsScanning(true);
    setCameraError(null);
    try {
      const result = await identifyPartFromImage({
        previewDataUrl: '/samples/sw0585.jpg',
        presetPart: {
          partNum: '973pb1795c01',
          name: 'Torso Armadura Imperial 2014 (Stormtrooper)',
          category: 'torso',
          imageUrl: '/samples/sw0585.jpg'
        }
      });
      setPartScanResult(result);
    } finally {
      setIsScanning(false);
    }
  };

  const handleScanDemoBulkLot = async () => {
    stopCameraStream();
    setIsScanning(true);
    setExpandedAltSlot(null);
    setCameraError(null);
    try {
      const img = new Image();
      img.src = DEMO_BULK_LOT_IMAGE;
      const loaded = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
      });

      const session = await identifyBulkLotFromImage({
        sourceElement: loaded ? img : undefined,
        previewDataUrl: DEMO_BULK_LOT_IMAGE,
        isDemoLot: true
      });
      setBulkSession(session);
      setFocusedBulkSlot(1);
      setSelectedBulkBoxId(session.items[0]?.boxId ?? '1');
    } finally {
      setIsScanning(false);
    }
  };

  const handleShutterAction = async () => {
    setCameraError(null);

    if (cameraActive && videoRef.current) {
      setIsScanning(true);
      try {
        if (scannerMode === 'bulk') {
          const { dataUrl } = await encodeFullFrameToJpeg(videoRef.current, 1080);
          const session = await identifyBulkLotFromImage({
            sourceElement: videoRef.current,
            previewDataUrl: dataUrl,
            isDemoLot: false
          });
          setBulkSession(session);
          setFocusedBulkSlot(1);
          setSelectedBulkBoxId(session.items[0]?.boxId ?? null);
          setExpandedAltSlot(null);
          stopCameraStream();
        } else if (scannerMode === 'part') {
          const { blob, dataUrl } = await preprocessImageSourceToBlob(videoRef.current, 840);
          stopCameraStream();
          const result = await identifyPartFromImage({
            blob,
            previewDataUrl: dataUrl
          });
          setPartScanResult(result);
        } else {
          const { blob, dataUrl } = await preprocessImageSourceToBlob(videoRef.current, 840);
          stopCameraStream();
          const result = await identifyMinifigureFromImage({
            blob,
            previewDataUrl: dataUrl
          });
          setSelectedPresetId(null);
          setScanResult(result);
          setSelectedCandidateIdx(0);
          setShowAllCandidates(false);
          setUserEditedUnitValue(false);
        }
      } catch (err) {
        stopCameraStream();
        setCameraError(
          err instanceof Error
            ? err.message
            : 'No se pudo capturar el fotograma. Intenta hacer una foto directa.'
        );
      } finally {
        setIsScanning(false);
      }
      return;
    }

    // Sin vídeo WebRTC activo -> abrir directamente cámara nativa móvil (autofocus + alta resolución)
    nativeCameraInputRef.current?.click();
  };

  const processImageFile = async (file: File) => {
    setIsScanning(true);
    setCameraError(null);
    stopCameraStream();
    let imgUrl: string | null = null;

    try {
      imgUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = imgUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Formato de imagen no compatible en este navegador.'));
      });
      if (typeof img.decode === 'function') {
        await img.decode().catch(() => undefined);
      }

      if (scannerMode === 'bulk') {
        const { dataUrl } = await encodeFullFrameToJpeg(img, 1080);
        const session = await identifyBulkLotFromImage({
          sourceElement: img,
          previewDataUrl: dataUrl,
          isDemoLot: false
        });
        setBulkSession(session);
        setFocusedBulkSlot(1);
        setSelectedBulkBoxId(session.items[0]?.boxId ?? null);
        setExpandedAltSlot(null);
      } else if (scannerMode === 'part') {
        const { blob, dataUrl } = await preprocessImageSourceToBlob(img, 840);
        const result = await identifyPartFromImage({
          blob,
          previewDataUrl: dataUrl
        });
        setPartScanResult(result);
      } else {
        const { blob, dataUrl } = await preprocessImageSourceToBlob(img, 840);
        const result = await identifyMinifigureFromImage({
          blob,
          previewDataUrl: dataUrl
        });
        setSelectedPresetId(null);
        setScanResult(result);
        setSelectedCandidateIdx(0);
        setShowAllCandidates(false);
        setUserEditedUnitValue(false);
      }
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? err.message
          : 'No se pudo leer la imagen seleccionada. Prueba otra foto (JPG/PNG).'
      );
    } finally {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
      setIsScanning(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processImageFile(file);
    }
    e.target.value = '';
  };

  const handleDropOnViewfinder = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await processImageFile(file);
    }
  };

  const handleManualCodeLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCodeInput.trim();
    if (!clean) return;
    const meta = findMinifigById(clean) ?? createCustomMinifigMetadata({ figId: clean });
    setScanResult({
      scanId: `manual-${Date.now()}`,
      capturedAtIso: new Date().toISOString(),
      processedImageDataUrl: scanResult?.processedImageDataUrl || meta.imageUrl,
      latencyMs: 1,
      apiSource: 'hybrid_fallback',
      candidates: [
        {
          minifig: meta,
          confidence: 1,
          matchedFeatures: meta.distinguishingFeatures.slice(0, 2),
          source: 'local_vision_hybrid'
        }
      ]
    });
    setSelectedCandidateIdx(0);
    setUserEditedUnitValue(false);
    setManualCodeInput('');
  };

  const activeCandidate: RecognitionCandidate | undefined =
    scanResult?.candidates[selectedCandidateIdx] ?? scanResult?.candidates[0];

  const singleDualPrices = useMemo(() => {
    if (!activeCandidate) return null;
    return getQuickDualPricesEur(activeCandidate.minifig, preferredPriceSource);
  }, [activeCandidate, preferredPriceSource]);

  const currentConditionPriceEur = useMemo(() => {
    if (
      singlePriceReport &&
      activeCandidate &&
      singlePriceReport.figId === activeCandidate.minifig.figId &&
      singlePriceReport.condition === selectedCondition
    ) {
      return singlePriceReport.estimatedMarketValueEur;
    }
    if (!singleDualPrices) return 0;
    return selectedCondition === 'new'
      ? singleDualPrices.newEur
      : selectedCondition === 'used_incomplete'
      ? singleDualPrices.incompleteEur
      : singleDualPrices.usedEur;
  }, [singlePriceReport, activeCandidate, singleDualPrices, selectedCondition]);

  useEffect(() => {
    setUserEditedUnitValue(false);
  }, [activeCandidate?.minifig.figId, selectedCondition]);

  useEffect(() => {
    if (userEditedUnitValue) return;
    if (activeCandidate && currentConditionPriceEur > 0) {
      setCustomUnitValueInput(currentConditionPriceEur.toFixed(2));
    } else {
      setCustomUnitValueInput('');
    }
  }, [activeCandidate?.minifig.figId, currentConditionPriceEur, userEditedUnitValue]);

  const resolvedSingleUnitValueEur = useMemo(() => {
    const parsed = Number(customUnitValueInput.replace(',', '.'));
    if (customUnitValueInput.trim() !== '' && Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed * 100) / 100;
    }
    return currentConditionPriceEur;
  }, [customUnitValueInput, currentConditionPriceEur]);

  const handleInlineCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;
    const created = await onCreateCollection(trimmed);
    setTargetCollectionId(created.id);
    setNewCollectionName('');
    setCreatingCollectionMode(false);
    showToast(`Colección «${created.name}» creada`);
  };

  const resolvedTargetCollectionName = useMemo(() => {
    const found = collections.find((c) => c.id === targetCollectionId) ?? collections[0];
    return found ? found.name : 'Mi Colección';
  }, [collections, targetCollectionId]);

  const handleQuickAdd = (
    minifig: MinifigureMetadata,
    condition: MinifigCondition,
    qty = 1,
    overrideUnitValueEur?: number
  ) => {
    const dual = getQuickDualPricesEur(minifig, preferredPriceSource);
    const baseVal =
      condition === 'new'
        ? dual.newEur
        : condition === 'used_incomplete'
        ? dual.incompleteEur
        : dual.usedEur;
    const finalUnitVal = overrideUnitValueEur ?? baseVal;
    const adjustedMinifig: MinifigureMetadata =
      overrideUnitValueEur !== undefined && Math.abs(overrideUnitValueEur - baseVal) > 0.01
        ? {
            ...minifig,
            baseMarketPriceEur: {
              ...minifig.baseMarketPriceEur,
              [condition]: finalUnitVal
            },
            isEstimatedFallbackPrice: false
          }
        : minifig;

    const defaultPaid = Math.round(finalUnitVal * 0.78 * 100) / 100;
    onQuickAddToCollection(
      adjustedMinifig,
      condition,
      qty,
      defaultPaid,
      finalUnitVal,
      targetCollectionId
    );
    showToast(`${qty}× ${minifig.figId.toUpperCase()} guardada en «${resolvedTargetCollectionName}»`);
  };

  // Manipuladores de filas y editor interactivo del Modo Lote (Bulk)
  const updateBulkItem = (
    slotIndex: number,
    updater: (item: BulkScanDetectedItem) => BulkScanDetectedItem
  ) => {
    setBulkSession((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) => (it.slotIndex === slotIndex ? updater(it) : it))
          }
        : prev
    );
  };

  const handleSelectBulkBox = (boxId: string | null) => {
    setSelectedBulkBoxId(boxId);
    if (!boxId || !bulkSession) return;
    const matched = bulkSession.items.find((it) => (it.boxId || String(it.slotIndex)) === boxId);
    if (matched) {
      setFocusedBulkSlot(matched.slotIndex);
    }
  };

  const handleUpdateBulkBoxRect = (boxId: string, rect: NormalizedBoundingBox) => {
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

  const handleRescanBulkBox = async (boxId: string, rectOverride?: NormalizedBoundingBox) => {
    if (!bulkSession) return;
    const target = bulkSession.items.find((it) => (it.boxId || String(it.slotIndex)) === boxId);
    if (!target) return;
    const rectToScan = rectOverride ?? target.boundingBox;

    setBulkSession((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              (it.boxId || String(it.slotIndex)) === boxId
                ? { ...it, boundingBox: rectToScan, status: 'scanning' }
                : it
            )
          }
        : prev
    );

    try {
      const scanned = await identifySingleBulkBox({
        sourceImageUrl: bulkSession.sourceImageDataUrl,
        boundingBox: rectToScan,
        slotIndex: target.slotIndex,
        boxId: target.boxId || boxId
      });

      setBulkSession((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                (it.boxId || String(it.slotIndex)) === boxId
                  ? {
                      ...scanned,
                      condition: it.condition,
                      quantity: it.quantity
                    }
                  : it
              )
            }
          : prev
      );
    } catch {
      setBulkSession((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                (it.boxId || String(it.slotIndex)) === boxId ? { ...it, status: 'error' } : it
              )
            }
          : prev
      );
    }
  };

  const handleAddBulkBoxAtRect = async (rect: NormalizedBoundingBox) => {
    if (!bulkSession) return;
    const nextSlot =
      bulkSession.items.reduce((max, it) => Math.max(max, it.slotIndex), 0) + 1;
    const newBoxId = `box-${Date.now()}-${nextSlot}`;
    const placeholderFig = createCustomMinifigMetadata({
      figId: `lote-${nextSlot}`,
      name: `Analizando figura #${nextSlot}…`,
      imageUrl: bulkSession.sourceImageDataUrl
    });

    const pendingItem: BulkScanDetectedItem = {
      boxId: newBoxId,
      slotIndex: nextSlot,
      boundingBox: rect,
      cropDataUrl: bulkSession.sourceImageDataUrl,
      selectedMinifig: placeholderFig,
      candidates: [],
      condition: 'used_complete',
      quantity: 1,
      included: false,
      status: 'scanning'
    };

    setBulkSession((prev) =>
      prev
        ? {
            ...prev,
            items: [...prev.items, pendingItem]
          }
        : prev
    );
    setSelectedBulkBoxId(newBoxId);
    setFocusedBulkSlot(nextSlot);

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
      setBulkSession((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                it.boxId === newBoxId ? { ...it, status: 'error' } : it
              )
            }
          : prev
      );
    }
  };

  const handleDeleteBulkBox = (boxId: string) => {
    setBulkSession((prev) => {
      if (!prev) return prev;
      const remaining = prev.items
        .filter((it) => (it.boxId || String(it.slotIndex)) !== boxId)
        .map((it, idx) => ({ ...it, slotIndex: idx + 1 }));
      return {
        ...prev,
        items: remaining
      };
    });
    setSelectedBulkBoxId(null);
    setExpandedAltSlot(null);
  };

  const setAllBulkCondition = (cond: MinifigCondition) => {
    setBulkSession((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) => ({ ...it, condition: cond }))
          }
        : prev
    );
  };

  const bulkSummary = useMemo(() => {
    if (!bulkSession) return { activeCount: 0, totalUnits: 0, totalValueEur: 0 };
    let activeCount = 0;
    let totalUnits = 0;
    let totalValueEur = 0;
    for (const item of bulkSession.items) {
      if (!item.included || item.status === 'scanning') continue;
      activeCount++;
      totalUnits += item.quantity;
      const dual = getQuickDualPricesEur(item.selectedMinifig, preferredPriceSource);
      const unitVal =
        item.condition === 'new'
          ? dual.newEur
          : item.condition === 'used_incomplete'
          ? dual.incompleteEur
          : dual.usedEur;
      totalValueEur += item.quantity * unitVal;
    }
    return {
      activeCount,
      totalUnits,
      totalValueEur: Math.round(totalValueEur * 100) / 100
    };
  }, [bulkSession, preferredPriceSource]);

  const handleBulkCommitAll = () => {
    if (!bulkSession) return;
    const rawLines: BulkImportParsedLine[] = bulkSession.items
      .filter((it) => it.included && it.quantity > 0 && it.status !== 'scanning')
      .map((it) => {
        const dual = getQuickDualPricesEur(it.selectedMinifig, preferredPriceSource);
        const unitVal =
          it.condition === 'new'
            ? dual.newEur
            : it.condition === 'used_incomplete'
            ? dual.incompleteEur
            : dual.usedEur;
        return {
          figId: it.selectedMinifig.figId,
          minifig: it.selectedMinifig,
          condition: it.condition,
          quantity: it.quantity,
          purchasePriceEur: Math.round(unitVal * 0.78 * 100) / 100,
          estimatedUnitValueEur: unitVal,
          notes: 'Escaneado en Lote (Bulk)'
        };
      });

    if (rawLines.length === 0) return;

    const askingNum = Number(lotAskingPrice.replace(',', '.')) || 0;
    const shippingNum = Number(lotShippingPrice.replace(',', '.')) || 0;
    const totalLotPaid = Math.round((askingNum + shippingNum) * 100) / 100;

    let finalLines = rawLines;
    if (distributeLotCost && askingNum > 0 && totalLotPaid > 0) {
      const allocatedUnitCosts = allocateLotPurchasePrices(rawLines, totalLotPaid);
      finalLines = rawLines.map((line, idx) => ({
        ...line,
        purchasePriceEur: allocatedUnitCosts[idx] ?? line.purchasePriceEur,
        notes: `Lote (${totalLotPaid.toFixed(2)} € repartidos proporcionalmente)`
      }));
    }

    onBulkAddToCollection(finalLines, targetCollectionId);
    showToast(
      distributeLotCost && askingNum > 0
        ? `${bulkSummary.totalUnits} uds. guardadas (${totalLotPaid.toFixed(2)} € repartidos)`
        : `${bulkSummary.totalUnits} uds. guardadas en «${resolvedTargetCollectionName}»`
    );
  };

  const handleCmfSearch = (raw?: string) => {
    const query = raw ?? cmfInput;
    setCmfInput(query);
    if (!query.trim()) {
      setCmfResult(null);
      return;
    }
    setCmfResult(lookupCmfCode(query));
  };

  const visibleCandidates = useMemo(() => {
    if (!scanResult) return [];
    return showAllCandidates
      ? scanResult.candidates.slice(0, 12)
      : scanResult.candidates.slice(0, 3);
  }, [scanResult, showAllCandidates]);

  const renderTargetCollectionSelector = (idSuffix: string) => (
    <div className="target-collection-row">
      <label htmlFor={`target-col-${idSuffix}`} className="eyebrow">
        Guardar en
      </label>
      <div className="target-collection-controls">
        {collections.length > 0 ? (
          <select
            id={`target-col-${idSuffix}`}
            className="source-select-mini"
            value={targetCollectionId ?? collections[0].id}
            onChange={(e) => {
              setTargetCollectionId(e.target.value);
              onSelectCollection(e.target.value);
            }}
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isDemo ? ' (Prueba)' : ''}
              </option>
            ))}
          </select>
        ) : (
          <span className="section-hint">Se creará «Mi Colección»</span>
        )}
        <button
          type="button"
          className="btn-chip"
          onClick={() => setCreatingCollectionMode((v) => !v)}
          title="Crear colección nueva"
        >
          <FolderPlus size={12} />
          <span>Nueva</span>
        </button>
      </div>

      {creatingCollectionMode && (
        <form className="inline-create-bar" onSubmit={(e) => void handleInlineCreateCollection(e)}>
          <input
            type="text"
            className="field-input"
            placeholder="Nombre de tu colección..."
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-chip active">
            Crear
          </button>
        </form>
      )}
    </div>
  );

  const singleHudLabel = useMemo(() => {
    if (cameraActive) return 'Cámara en vivo · Apunta a la figura';
    if (!scanResult) return 'Brickognize AI · Listo';
    if (scanResult.apiSource === 'brickognize_live') return 'Brickognize API (En Vivo)';
    if (scanResult.apiSource === 'demo_preset') return 'Ejemplo de Estudio';
    if (scanResult.apiSource === 'hybrid_fallback') return 'Búsqueda Manual';
    if (scanResult.apiSource === 'no_match') return 'Sin coincidencia';
    return 'Error de conexión';
  }, [cameraActive, scanResult]);

  const partHudLabel = useMemo(() => {
    if (cameraActive) return 'Cámara en vivo · Enfoca la pieza';
    if (!partScanResult) return 'Brickognize Piezas · Listo';
    if (partScanResult.apiSource === 'brickognize_live') {
      return `Piezas · ${partScanResult.candidates.length} candidatas`;
    }
    if (partScanResult.apiSource === 'demo_preset') return 'Pieza de ejemplo';
    if (partScanResult.apiSource === 'no_match') return 'Pieza no reconocida';
    return 'Error de conexión';
  }, [cameraActive, partScanResult]);

  const bulkHudLabel = useMemo(() => {
    if (cameraActive) return 'Cámara en vivo · Encuadra el lote';
    if (!bulkSession) return 'Escáner de Lote · Listo';
    if (bulkSession.apiSource === 'brickognize_live') {
      return `Lote · ${bulkSession.items.length} recuadros`;
    }
    if (bulkSession.apiSource === 'demo_preset') {
      return `Lote demo · ${bulkSession.items.length} figs`;
    }
    if (bulkSession.apiSource === 'no_match') return 'Añade recuadros sobre la foto';
    return 'Error en escaneo de lote';
  }, [cameraActive, bulkSession]);

  return (
    <section className="screen-stack" aria-label="Escáner óptico de minifiguras LEGO">
      {/* Conmutador Sutil de 4 Modos + Visor */}
      <div className="surface-card viewfinder-shell">
        <div className="mode-pill-bar four-cols" role="tablist" aria-label="Modo de escáner">
          <button
            type="button"
            id="mode-tab-single"
            role="tab"
            aria-selected={scannerMode === 'single'}
            className={`mode-pill-btn ${scannerMode === 'single' ? 'active' : ''}`}
            onClick={() => switchMode('single')}
          >
            <Camera size={13} />
            <span>Individual</span>
          </button>
          <button
            type="button"
            id="mode-tab-part"
            role="tab"
            aria-selected={scannerMode === 'part'}
            className={`mode-pill-btn ${scannerMode === 'part' ? 'active' : ''}`}
            onClick={() => switchMode('part')}
          >
            <Puzzle size={13} />
            <span>Pieza</span>
          </button>
          <button
            type="button"
            id="mode-tab-bulk"
            role="tab"
            aria-selected={scannerMode === 'bulk'}
            className={`mode-pill-btn ${scannerMode === 'bulk' ? 'active' : ''}`}
            onClick={() => switchMode('bulk')}
          >
            <Grid size={13} />
            <span>Lote</span>
          </button>
          <button
            type="button"
            id="mode-tab-cmf"
            role="tab"
            aria-selected={scannerMode === 'cmf'}
            className={`mode-pill-btn ${scannerMode === 'cmf' ? 'active' : ''}`}
            onClick={() => switchMode('cmf')}
          >
            <QrCode size={13} />
            <span>CMF</span>
          </button>
        </div>

        {/* MODO CMF: Decodificador de Código Data Matrix */}
        {scannerMode === 'cmf' ? (
          <div className="cmf-lookup-panel">
            {cameraActive && (
              <div className="viewfinder-stage" style={{ borderRadius: 12, maxHeight: 200 }}>
                <video ref={videoRef} className="viewfinder-media" playsInline muted autoPlay />
                <div className="reticle-frame" aria-hidden="true">
                  <div className="reticle-corner tl" />
                  <div className="reticle-corner tr" />
                  <div className="reticle-corner bl" />
                  <div className="reticle-corner br" />
                </div>
              </div>
            )}

            <div>
              <span className="eyebrow">Escáner de Cajas Sorpresa (Data Matrix)</span>
              <p className="section-hint" style={{ marginTop: 2 }}>
                Introduce los primeros 7 dígitos impresos en la base de la caja (Series 25–27, Space, D&D, Spider-Verse).
              </p>
            </div>

            <form
              className="cmf-input-row"
              onSubmit={(e) => {
                e.preventDefault();
                handleCmfSearch();
              }}
            >
              <input
                type="text"
                id="cmf-code-input"
                className="field-input mono"
                placeholder="Ej. 6522981 114S4..."
                value={cmfInput}
                onChange={(e) => handleCmfSearch(e.target.value)}
              />
              <button type="submit" id="btn-cmf-lookup" className="btn-primary">
                <Search size={15} />
                <span>Identificar</span>
              </button>
              <button
                type="button"
                id="btn-cmf-camera"
                className={`btn-tonal ${cameraActive ? 'active' : ''}`}
                onClick={() => void toggleCamera()}
                title="Escanear Data Matrix con cámara"
              >
                <Camera size={15} />
              </button>
            </form>

            {cameraError && (
              <p className="camera-notice" style={{ borderRadius: 8 }}>
                {cameraError}
              </p>
            )}

            <div>
              <button
                type="button"
                className="link-btn-mini"
                onClick={() => setShowCmfExamples((v) => !v)}
              >
                {showCmfExamples ? 'Ocultar códigos de ejemplo' : 'Probar con un código de ejemplo'}
              </button>
              {showCmfExamples && (
                <div className="catalog-pills-scroll" style={{ marginTop: 6 }}>
                  {SAMPLE_CMF_PRESETS.map((preset) => (
                    <button
                      key={preset.code}
                      type="button"
                      className={`catalog-pill ${cmfInput === preset.code ? 'active' : ''}`}
                      onClick={() => handleCmfSearch(preset.code)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {cmfResult && cmfResult.matched && cmfResult.entry && cmfResult.minifig && (
              <div className="cmf-result-banner" id="cmf-result-panel">
                <div className="hero-fig-row" style={{ paddingBottom: 8 }}>
                  <img
                    src={cmfResult.minifig.imageUrl}
                    alt={cmfResult.entry.characterName}
                    className="hero-fig-thumb"
                    style={{ width: 52, height: 52 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="fig-meta-line" style={{ marginTop: 0 }}>
                      <span className="code-chip">{cmfResult.entry.seriesCode}</span>
                      <span>
                        #{cmfResult.entry.figNumInSeries}/{cmfResult.entry.totalInSeries} ·{' '}
                        {cmfResult.entry.seriesName}
                      </span>
                    </div>
                    <h3 className="fig-title-lg" style={{ fontSize: '0.96rem' }}>
                      {cmfResult.entry.characterName}
                    </h3>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8
                  }}
                >
                  <span className="cmf-factory-tag">{cmfResult.factoryLabel}</span>
                  <div className="brickem-dual-prices">
                    <span className="used">Nueva {cmfResult.entry.estNewEur.toFixed(2)} €</span>
                    <span className="new">Usada {cmfResult.entry.estUsedEur.toFixed(2)} €</span>
                  </div>
                </div>

                {cmfResult.entry.rarityNote && (
                  <p className="section-hint">{cmfResult.entry.rarityNote}</p>
                )}

                {renderTargetCollectionSelector('cmf')}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginTop: 2
                  }}
                >
                  <div className="brickem-cond-mini" role="group" aria-label="Estado CMF">
                    <button
                      type="button"
                      className={cmfCondition === 'new' ? 'active' : ''}
                      onClick={() => setCmfCondition('new')}
                    >
                      Sellada (Caja)
                    </button>
                    <button
                      type="button"
                      className={cmfCondition === 'used_complete' ? 'active' : ''}
                      onClick={() => setCmfCondition('used_complete')}
                    >
                      Abierta / Usada
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn-chip"
                      onClick={() =>
                        onSelectMinifigForComparison(cmfResult.minifig!, cmfCondition)
                      }
                    >
                      Tasar
                    </button>
                    <button
                      type="button"
                      id="btn-cmf-quick-add"
                      className="btn-chip active"
                      onClick={() => handleQuickAdd(cmfResult.minifig!, cmfCondition, 1)}
                    >
                      +1 Colección
                    </button>
                  </div>
                </div>

                {addedFeedback && (
                  <div className="feedback-banner" role="status">
                    <CheckCircle2 size={15} />
                    <span>{addedFeedback}</span>
                  </div>
                )}
              </div>
            )}

            {cmfResult && !cmfResult.matched && (
              <div className="cmf-result-banner" id="cmf-result-empty">
                <strong style={{ fontSize: '0.82rem' }}>
                  Código no encontrado en series CMF locales
                </strong>
                <span className="section-hint">
                  Código detectado: <span className="mono">{cmfResult.scannedElementId || '—'}</span> ·{' '}
                  {cmfResult.factoryLabel}. Compatible con Series 25, 26 Space, D&D, Serie 27 y Spider-Verse.
                </span>
              </div>
            )}
          </div>
        ) : (
          /* MODOS INDIVIDUAL, PIEZA SUELTA Y LOTE INTERACTIVO */
          <>
            {scannerMode === 'bulk' && !cameraActive && bulkSession && !isScanning ? (
              <div className="bulk-interactive-stage-shell">
                <div className="bulk-stage-status-bar">
                  <span className="hud-pill">{bulkHudLabel}</span>
                  {bulkSession.latencyMs ? (
                    <span className="hud-pill latency" id="scanner-latency-badge">
                      <Zap size={11} /> {bulkSession.latencyMs} ms
                    </span>
                  ) : null}
                </div>
                <InteractiveBulkOverlay
                  imageUrl={bulkSession.sourceImageDataUrl}
                  aspectRatio={bulkSession.aspectRatio}
                  items={bulkSession.items}
                  selectedBoxId={selectedBulkBoxId}
                  onSelectBox={handleSelectBulkBox}
                  onUpdateBoxRect={handleUpdateBulkBoxRect}
                  onCommitBoxRect={(boxId, rect) => void handleRescanBulkBox(boxId, rect)}
                  onAddBoxAtRect={(rect) => void handleAddBulkBoxAtRect(rect)}
                  onDeleteBox={handleDeleteBulkBox}
                  onRescanBox={(boxId) => void handleRescanBulkBox(boxId)}
                />
              </div>
            ) : (
              <div
                className={`viewfinder-stage ${scannerMode === 'bulk' ? 'bulk-mode' : ''} ${
                  isDragging ? 'drag-over' : ''
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDropOnViewfinder}
              >
                {cameraActive ? (
                  <video ref={videoRef} className="viewfinder-media" playsInline muted autoPlay />
                ) : scannerMode === 'part' && partScanResult?.processedImageDataUrl ? (
                  <img
                    src={partScanResult.processedImageDataUrl}
                    alt="Captura de pieza LEGO"
                    className={`viewfinder-media ${isScanning ? 'scanning' : ''}`}
                    style={{ objectFit: 'contain' }}
                  />
                ) : scannerMode === 'single' && scanResult?.processedImageDataUrl ? (
                  <img
                    src={scanResult.processedImageDataUrl}
                    alt={activeCandidate?.minifig.name || 'Captura de minifigura'}
                    className={`viewfinder-media ${isScanning ? 'scanning' : ''}`}
                    style={{ objectFit: 'contain' }}
                  />
                ) : (
                  <div className="scanner-empty-stage">
                    <div className="scanner-empty-icon">
                      {scannerMode === 'bulk' ? (
                        <Grid size={26} />
                      ) : scannerMode === 'part' ? (
                        <Puzzle size={26} />
                      ) : (
                        <Camera size={26} />
                      )}
                    </div>
                    <strong>
                      {scannerMode === 'bulk'
                        ? 'Escanea un lote sobre fondo liso'
                        : scannerMode === 'part'
                        ? 'Fotografía una pieza suelta'
                        : 'Fotografía o sube 1 minifigura'}
                    </strong>
                    <span>
                      {scannerMode === 'bulk'
                        ? 'Separa ligeramente las figuras sobre una mesa clara y ajusta o dibuja recuadros sobre la foto.'
                        : scannerMode === 'part'
                        ? 'Torso, casco, cabeza o piernas sobre fondo liso. Cruzamos la pieza para hallar su minifigura.'
                        : 'Encuadra de pies a cabeza con buena luz. Identificación real vía Brickognize.'}
                    </span>
                  </div>
                )}

                {/* HUD Minimalista */}
                <div className="hud-top">
                  <span className="hud-pill">
                    {scannerMode === 'bulk'
                      ? bulkHudLabel
                      : scannerMode === 'part'
                      ? partHudLabel
                      : singleHudLabel}
                  </span>
                  {(scannerMode === 'bulk'
                    ? bulkSession?.latencyMs
                    : scannerMode === 'part'
                    ? partScanResult?.latencyMs
                    : scanResult?.latencyMs) ? (
                    <span className="hud-pill latency" id="scanner-latency-badge">
                      <Zap size={11} />{' '}
                      {scannerMode === 'bulk'
                        ? bulkSession?.latencyMs
                        : scannerMode === 'part'
                        ? partScanResult?.latencyMs
                        : scanResult?.latencyMs}{' '}
                      ms
                    </span>
                  ) : null}
                </div>

                {(scannerMode === 'single' || scannerMode === 'part') && (
                  <div
                    className={`reticle-frame ${isScanning ? 'scanning' : ''}`}
                    aria-hidden="true"
                  >
                    <div className="reticle-corner tl" />
                    <div className="reticle-corner tr" />
                    <div className="reticle-corner bl" />
                    <div className="reticle-corner br" />
                    {isScanning && <div className="laser-sweep" />}
                  </div>
                )}

                {scannerMode === 'single' && activeCandidate && !isScanning && (
                  <div className="hud-match-badge">
                    <strong>{activeCandidate.minifig.figId.toUpperCase()}</strong>
                    <span>{Math.round(activeCandidate.confidence * 100)}% match</span>
                  </div>
                )}

                {scannerMode === 'part' &&
                  partScanResult &&
                  partScanResult.candidates.length > 0 &&
                  !isScanning && (
                    <div className="hud-match-badge">
                      <strong>{partScanResult.candidates[0].partNum}</strong>
                      <span>{Math.round(partScanResult.candidates[0].confidence * 100)}%</span>
                    </div>
                  )}
              </div>
            )}

            {cameraError && <p className="camera-notice">{cameraError}</p>}

            {/* Barra Táctil de Cámara (Galería · Foto Nativa/Captura · Vídeo en vivo) */}
            <div className="camera-control-deck">
              <button
                type="button"
                id="btn-upload-photo"
                className="deck-side-btn"
                disabled={isScanning}
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImagePlus size={16} />
                <span>Galería</span>
              </button>

              <button
                type="button"
                id="btn-shutter-scan"
                className="shutter-trigger"
                onClick={() => void handleShutterAction()}
                disabled={isScanning}
                aria-label={
                  cameraActive
                    ? 'Capturar y analizar'
                    : scannerMode === 'bulk'
                    ? 'Hacer foto de lote con cámara'
                    : scannerMode === 'part'
                    ? 'Hacer foto de pieza suelta con cámara'
                    : 'Hacer foto de minifigura con cámara'
                }
                title={
                  cameraActive
                    ? 'Capturar fotograma'
                    : 'Abrir cámara del móvil y escanear'
                }
              >
                <span className="shutter-core">
                  {cameraActive ? <Sparkles size={20} /> : <Camera size={20} />}
                </span>
              </button>

              <button
                type="button"
                id="btn-toggle-camera"
                className={`deck-side-btn ${cameraActive ? 'active' : ''}`}
                disabled={isScanning}
                onClick={() => void toggleCamera()}
              >
                <Zap size={16} />
                <span>{cameraActive ? 'Cerrar' : 'En vivo'}</span>
              </button>

              {/* Input de Galería (sin capture, abre carrete / archivos en iOS y Android) */}
              <input
                ref={galleryInputRef}
                id="gallery-file-input"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleFileUpload}
              />

              {/* Input de Cámara Nativa (con capture="environment", mejor enfoque macro en móviles) */}
              <input
                ref={nativeCameraInputRef}
                id="native-camera-file-input"
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={handleFileUpload}
              />
            </div>

            {/* Opción discreta de ejemplos (oculta por defecto para cero ruido de prueba) */}
            <div className="filmstrip-bar">
              {scannerMode === 'single' ? (
                <>
                  <div className="demo-optin-row">
                    <span className="section-hint">
                      Usa el botón central para foto directa con autofocus.
                    </span>
                    <button
                      type="button"
                      id="btn-toggle-demo-strip"
                      className="link-btn-mini"
                      onClick={() => setShowDemoStrip((v) => !v)}
                    >
                      {showDemoStrip ? 'Ocultar ejemplos' : 'Probar ejemplo'}
                    </button>
                  </div>
                  {showDemoStrip && (
                    <div className="filmstrip-scroll" role="list" style={{ marginTop: 8 }}>
                      {MINIFIG_CATALOG.map((item) => {
                        const isSelected = item.figId === selectedPresetId;
                        return (
                          <button
                            key={item.figId}
                            type="button"
                            id={`sample-preset-${item.figId}`}
                            className={`filmstrip-thumb ${isSelected ? 'active' : ''}`}
                            onClick={() => void handleScanPreset(item.figId)}
                          >
                            <img src={item.imageUrl} alt={item.name} />
                            <span>{item.figId.toUpperCase()}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : scannerMode === 'part' ? (
                <div className="demo-optin-row">
                  <span className="section-hint">
                    Escanea un torso y luego añade casco o piernas para acotar la minifigura.
                  </span>
                  <button
                    type="button"
                    id="btn-demo-part-top"
                    className="link-btn-mini"
                    onClick={() => void handleDemoPartCross()}
                  >
                    Probar torso
                  </button>
                </div>
              ) : (
                <div className="demo-optin-row">
                  <span className="section-hint">
                    Foto de mesa/lote; podrás mover, redimensionar o añadir recuadros.
                  </span>
                  <button
                    type="button"
                    id="btn-demo-bulk-lot"
                    className="link-btn-mini"
                    onClick={() => void handleScanDemoBulkLot()}
                  >
                    Probar lote demo
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* TARJETA DE DIAGNÓSTICO HONESTA (Individual: sin coincidencia o error de red) */}
      {scannerMode === 'single' &&
        scanResult &&
        (scanResult.apiSource === 'no_match' || scanResult.apiSource === 'error') &&
        !isScanning && (
          <div className="surface-card scanner-diagnostic-card" id="scanner-diagnostic-panel">
            <div className="diagnostic-header">
              <AlertTriangle size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div>
                <h2 className="fig-title-lg" style={{ fontSize: '0.96rem', marginTop: 0 }}>
                  {scanResult.apiSource === 'no_match'
                    ? 'No se encontró coincidencia fiable'
                    : 'No se pudo completar el escaneo'}
                </h2>
                <p className="section-hint" style={{ marginTop: 3 }}>
                  {scanResult.errorMessage}
                </p>
              </div>
            </div>

            <div className="diagnostic-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => nativeCameraInputRef.current?.click()}
              >
                <RotateCcw size={14} />
                <span>Reintentar foto</span>
              </button>
              <button
                type="button"
                className="btn-tonal"
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImagePlus size={14} />
                <span>Elegir de galería</span>
              </button>
            </div>

            <form className="manual-fallback-row" onSubmit={handleManualCodeLookup}>
              <input
                type="text"
                id="scanner-manual-code-input"
                className="field-input mono"
                placeholder="¿Sabes el código? Ej: sw0585, col448..."
                value={manualCodeInput}
                onChange={(e) => setManualCodeInput(e.target.value)}
              />
              <button type="submit" className="btn-chip active">
                <Search size={13} />
                <span>Buscar código</span>
              </button>
            </form>
          </div>
        )}

      {/* PANEL DE MODO PIEZA SUELTA (Cruce de piezas + Minifiguras compatibles) */}
      {scannerMode === 'part' && (
        <PartScannerPanel
          partResult={partScanResult}
          isScanning={isScanning}
          preferredPriceSource={preferredPriceSource}
          onTriggerDemoPartCross={() => void handleDemoPartCross()}
          onOpenMinifigDetail={(fig) => onOpenMinifigDetail(fig, 'used_complete')}
        />
      )}

      {/* DIAGNÓSTICO MODO LOTE (Bulk vacío o con error) */}
      {scannerMode === 'bulk' &&
        bulkSession &&
        bulkSession.items.length === 0 &&
        !isScanning && (
          <div className="surface-card scanner-diagnostic-card" id="bulk-diagnostic-panel">
            <div className="diagnostic-header">
              <AlertTriangle size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <div>
                <h2 className="fig-title-lg" style={{ fontSize: '0.96rem', marginTop: 0 }}>
                  {bulkSession.apiSource === 'error'
                    ? 'Error al analizar el lote'
                    : 'No se detectaron figuras automáticamente'}
                </h2>
                <p className="section-hint" style={{ marginTop: 3 }}>
                  {bulkSession.errorMessage ||
                    'Puedes pulsar «Añadir recuadro» sobre la foto de arriba para marcar manualmente cada figura, o hacer otra foto sobre fondo claro.'}
                </p>
              </div>
            </div>
            <div className="diagnostic-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => nativeCameraInputRef.current?.click()}
              >
                <RotateCcw size={14} />
                <span>Hacer nueva foto</span>
              </button>
              <button
                type="button"
                className="btn-tonal"
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImagePlus size={14} />
                <span>Subir de galería</span>
              </button>
            </div>
          </div>
        )}

      {/* PANEL DE RESULTADO: MODO LOTE (Estilo brick'em + Evaluador Wallapop) */}
      {scannerMode === 'bulk' && bulkSession && bulkSession.items.length > 0 && (
        <div className="surface-card" id="bulk-result-panel">
          <div className="bulk-summary-bar">
            <div>
              <span className="eyebrow">Escáner de Lote</span>
              <div className="bulk-summary-numbers">
                <strong className="mono" id="bulk-total-value">
                  {bulkSummary.totalValueEur.toFixed(2)} €
                </strong>
                <span className="section-hint">
                  {bulkSummary.activeCount}/{bulkSession.items.length} figs · {bulkSummary.totalUnits}{' '}
                  uds.
                </span>
              </div>
            </div>

            <div className="brickem-cond-mini" role="group" aria-label="Estado global del lote">
              <button
                type="button"
                id="btn-bulk-all-used"
                onClick={() => setAllBulkCondition('used_complete')}
              >
                Todas Usadas
              </button>
              <button
                type="button"
                id="btn-bulk-all-new"
                onClick={() => setAllBulkCondition('new')}
              >
                Todas Nuevas
              </button>
            </div>
          </div>

          <div className="brickem-row-list" role="list">
            {bulkSession.items.map((item) => {
              const boxId = item.boxId || String(item.slotIndex);
              const dual = getQuickDualPricesEur(item.selectedMinifig, preferredPriceSource);
              const isFocused = focusedBulkSlot === item.slotIndex || selectedBulkBoxId === boxId;
              const isAltOpen = expandedAltSlot === item.slotIndex;
              const isRowScanning = item.status === 'scanning';

              return (
                <div
                  key={boxId}
                  id={`bulk-row-${item.slotIndex}`}
                  className={`brickem-row ${isFocused ? 'focused' : ''}`}
                  style={{ opacity: item.included || isRowScanning ? 1 : 0.5 }}
                >
                  <div
                    className="brickem-row-main"
                    onClick={() => {
                      setFocusedBulkSlot(item.slotIndex);
                      setSelectedBulkBoxId(boxId);
                    }}
                  >
                    <span className="brickem-slot-num">
                      {isRowScanning ? <Loader2 size={11} className="spin" /> : item.slotIndex}
                    </span>
                    <img
                      src={item.cropDataUrl || item.selectedMinifig.imageUrl}
                      alt={item.selectedMinifig.name}
                      className="brickem-thumb"
                    />
                    <div className="brickem-info">
                      <div className="brickem-title">{item.selectedMinifig.name}</div>
                      <div className="brickem-subline">
                        <span
                          className="code-chip"
                          style={{ fontSize: '0.64rem', padding: '1px 5px' }}
                        >
                          {item.selectedMinifig.figId.toUpperCase()}
                        </span>
                        {isRowScanning ? (
                          <span className="section-hint">Analizando recuadro…</span>
                        ) : item.status === 'no_match' || item.status === 'error' ? (
                          <span className="section-hint">Ajusta el recuadro y re-escanea</span>
                        ) : (
                          <div className="brickem-dual-prices">
                            <span className="used">Usada {dual.usedEur.toFixed(2)} €</span>
                            <span className="new">Nueva {dual.newEur.toFixed(2)} €</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {!isRowScanning && (
                    <div className="brickem-row-actions">
                      <div className="brickem-cond-mini">
                        <button
                          type="button"
                          className={item.condition !== 'new' ? 'active' : ''}
                          onClick={() =>
                            updateBulkItem(item.slotIndex, (cur) => ({
                              ...cur,
                              condition: 'used_complete'
                            }))
                          }
                        >
                          Usada
                        </button>
                        <button
                          type="button"
                          className={item.condition === 'new' ? 'active' : ''}
                          onClick={() =>
                            updateBulkItem(item.slotIndex, (cur) => ({ ...cur, condition: 'new' }))
                          }
                        >
                          Nueva
                        </button>
                      </div>

                      <div className="qty-stepper" aria-label={`Cantidad ítem ${item.slotIndex}`}>
                        <button
                          type="button"
                          className="stepper-btn"
                          onClick={() =>
                            updateBulkItem(item.slotIndex, (cur) =>
                              cur.quantity <= 1
                                ? { ...cur, included: false }
                                : { ...cur, quantity: cur.quantity - 1 }
                            )
                          }
                          aria-label="Reducir"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="qty-val" style={{ fontSize: '0.74rem' }}>
                          {item.included ? item.quantity : 0}
                        </span>
                        <button
                          type="button"
                          className="stepper-btn"
                          onClick={() =>
                            updateBulkItem(item.slotIndex, (cur) => ({
                              ...cur,
                              included: true,
                              quantity: cur.included ? cur.quantity + 1 : 1
                            }))
                          }
                          aria-label="Aumentar"
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <button
                          type="button"
                          className="btn-chip"
                          style={{ padding: '4px 7px', fontSize: '0.7rem' }}
                          onClick={() => onOpenMinifigDetail(item.selectedMinifig, item.condition)}
                          title="Abrir despiece y detalle"
                        >
                          <Puzzle size={12} />
                        </button>

                        {item.candidates.length > 0 && (
                          <button
                            type="button"
                            id={`btn-bulk-alt-${item.slotIndex}`}
                            className={`btn-chip ${isAltOpen ? 'active' : ''}`}
                            style={{ padding: '4px 7px', fontSize: '0.7rem' }}
                            onClick={() =>
                              setExpandedAltSlot(isAltOpen ? null : item.slotIndex)
                            }
                            title="Cambiar entre alternativas"
                          >
                            <MoreVertical size={12} />
                            <span>{item.candidates.length} alt.</span>
                          </button>
                        )}

                        <button
                          type="button"
                          className="btn-chip"
                          style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                          onClick={() =>
                            handleQuickAdd(item.selectedMinifig, item.condition, item.quantity)
                          }
                        >
                          + Añadir
                        </button>
                      </div>
                    </div>
                  )}

                  {isAltOpen && (
                    <div className="brickem-alt-drawer" id={`bulk-alt-drawer-${item.slotIndex}`}>
                      <span className="eyebrow">
                        Alternativas detectadas (Top-{item.candidates.length})
                      </span>
                      <div className="brickem-alt-grid">
                        {item.candidates.map((cand) => {
                          const selected = cand.minifig.figId === item.selectedMinifig.figId;
                          return (
                            <button
                              key={cand.minifig.figId}
                              type="button"
                              className={`variant-btn ${selected ? 'selected' : ''}`}
                              onClick={() => {
                                updateBulkItem(item.slotIndex, (cur) => ({
                                  ...cur,
                                  selectedMinifig: cand.minifig
                                }));
                                setExpandedAltSlot(null);
                              }}
                            >
                              <img src={cand.minifig.imageUrl} alt={cand.minifig.name} />
                              <div className="variant-btn-text">
                                <strong>{cand.minifig.figId.toUpperCase()}</strong>
                                <span>{Math.round(cand.confidence * 100)}%</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Evaluador de Lotes Wallapop / Vinted / Mercadillo */}
          <div style={{ marginTop: 14 }}>
            <LotEvaluatorBar
              totalMarketValueEur={bulkSummary.totalValueEur}
              selectedUnitsCount={bulkSummary.totalUnits}
              askingPriceInput={lotAskingPrice}
              shippingInput={lotShippingPrice}
              targetMarginPct={lotTargetMarginPct}
              distributeCostProportionally={distributeLotCost}
              onChangeAskingPrice={setLotAskingPrice}
              onChangeShipping={setLotShippingPrice}
              onChangeTargetMargin={setLotTargetMarginPct}
              onToggleDistributeCost={setDistributeLotCost}
            />
          </div>

          <div style={{ marginTop: 12 }}>{renderTargetCollectionSelector('bulk')}</div>

          {addedFeedback && (
            <div className="feedback-banner" role="status">
              <CheckCircle2 size={16} />
              <span>{addedFeedback}</span>
            </div>
          )}

          <button
            type="button"
            id="btn-bulk-add-all"
            className="btn-primary btn-full"
            style={{ marginTop: 12 }}
            disabled={bulkSummary.totalUnits === 0}
            onClick={handleBulkCommitAll}
          >
            <CheckCircle2 size={16} />
            <span>
              Guardar todas ({bulkSummary.totalUnits} uds. · {bulkSummary.totalValueEur.toFixed(2)}{' '}
              €)
            </span>
          </button>
        </div>
      )}

      {/* PANEL DE RESULTADO: MODO INDIVIDUAL */}
      {scannerMode === 'single' && activeCandidate && singleDualPrices && (
        <div className="surface-card" id="recognition-result-panel">
          <div className="sheet-header">
            <div>
              <span className="eyebrow">
                {scanResult?.apiSource === 'brickognize_live'
                  ? 'Identificada por Brickognize'
                  : 'Minifigura Identificada'}
              </span>
              <h2 className="fig-title-lg">{activeCandidate.minifig.name}</h2>
              <div className="fig-meta-line">
                <span className="code-chip">{activeCandidate.minifig.figId.toUpperCase()}</span>
                <span>{activeCandidate.minifig.theme}</span>
                {activeCandidate.minifig.yearReleased > 0 && (
                  <span>· {activeCandidate.minifig.yearReleased}</span>
                )}
                <span>· {activeCandidate.minifig.sampleSetCode}</span>
              </div>
            </div>
            <span className={`rarity-tag ${activeCandidate.minifig.rarity}`}>
              {activeCandidate.minifig.rarity === 'grail'
                ? 'Santo Grial'
                : activeCandidate.minifig.rarity === 'rare'
                ? 'Rara'
                : activeCandidate.minifig.rarity === 'uncommon'
                ? 'Poco Común'
                : 'Común'}
            </span>
          </div>

          {/* Estado de Conservación con Estimación Lado a Lado */}
          <div className="sheet-section">
            <span className="eyebrow">Estado de conservación (Usada / Nueva)</span>
            <div className="segmented-control" role="radiogroup" aria-label="Estado de conservación">
              {(
                [
                  {
                    id: 'new',
                    label: 'Nueva',
                    price: singleDualPrices.newEur
                  },
                  {
                    id: 'used_complete',
                    label: 'Usada Completa',
                    price: singleDualPrices.usedEur
                  },
                  {
                    id: 'used_incomplete',
                    label: 'Incompleta',
                    price: singleDualPrices.incompleteEur
                  }
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  id={`scanner-cond-${opt.id}`}
                  className={`seg-option ${selectedCondition === opt.id ? 'active' : ''}`}
                  onClick={() => setSelectedCondition(opt.id)}
                >
                  <span>{opt.label}</span>
                  <strong>{opt.price.toFixed(2)} €</strong>
                </button>
              ))}
            </div>
          </div>

          {/* Media de mercado + desglose desplegable en 1 toque (5 portales) */}
          <div className="sheet-section">
            <PriceAverageCard
              minifig={activeCandidate.minifig}
              condition={selectedCondition}
              preferredPriceSource={preferredPriceSource}
              compact
              onReportChange={setSinglePriceReport}
            />
          </div>

          {/* Ajuste rápido de precio antes de guardar */}
          <div className="sheet-section">
            <div className="price-override-row">
              <div>
                <label htmlFor="scanner-unit-value-input" className="eyebrow">
                  Valor a guardar (€)
                </label>
                {activeCandidate.minifig.isEstimatedFallbackPrice && (
                  <p className="section-hint" style={{ fontSize: '0.7rem' }}>
                    Precio orientativo. Abre el desglose de portales o ajústalo aquí.
                  </p>
                )}
              </div>
              <input
                id="scanner-unit-value-input"
                type="number"
                step="0.01"
                min={0.5}
                className="field-input mono price-override-input"
                value={customUnitValueInput}
                onChange={(e) => {
                  setUserEditedUnitValue(true);
                  setCustomUnitValueInput(e.target.value);
                }}
              />
            </div>
          </div>

          {/* Desambiguación hasta Top-12 */}
          {scanResult && scanResult.candidates.length > 1 && (
            <div className="sheet-section">
              <div className="section-toggle-inline">
                <span className="eyebrow">
                  Candidatos similares ({visibleCandidates.length}/{scanResult.candidates.length})
                </span>
                {scanResult.candidates.length > 3 && (
                  <button
                    type="button"
                    id="btn-toggle-12-candidates"
                    className="link-btn-mini"
                    onClick={() => setShowAllCandidates((v) => !v)}
                  >
                    {showAllCandidates
                      ? 'Mostrar Top-3'
                      : `Ver ${scanResult.candidates.length} alternativas`}
                  </button>
                )}
              </div>
              <div className={showAllCandidates ? 'candidates-grid-expand' : 'variants-strip'}>
                {visibleCandidates.map((cand, idx) => (
                  <button
                    key={cand.minifig.figId}
                    type="button"
                    id={`candidate-option-${idx}`}
                    className={`variant-btn ${selectedCandidateIdx === idx ? 'selected' : ''}`}
                    onClick={() => setSelectedCandidateIdx(idx)}
                  >
                    <img src={cand.minifig.imageUrl} alt={cand.minifig.name} />
                    <div className="variant-btn-text">
                      <strong>{cand.minifig.figId.toUpperCase()}</strong>
                      <span>{Math.round(cand.confidence * 100)}%</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rasgos Ópticos Colapsables */}
          <div className="sheet-section">
            <details className="optical-disclosure">
              <summary>
                <span>
                  Detalles de la referencia ({activeCandidate.minifig.distinguishingFeatures.length})
                </span>
                <ChevronDown size={15} />
              </summary>
              <ul>
                {activeCandidate.minifig.distinguishingFeatures.map((feat, i) => (
                  <li key={i}>{feat}</li>
                ))}
              </ul>
            </details>
          </div>

          <div className="sheet-section">{renderTargetCollectionSelector('single')}</div>

          {addedFeedback && (
            <div className="feedback-banner" role="status">
              <CheckCircle2 size={16} />
              <span>{addedFeedback}</span>
            </div>
          )}

          <button
            type="button"
            id="btn-scanner-open-detail"
            className="btn-tonal btn-full"
            style={{ marginTop: 10 }}
            onClick={() => onOpenMinifigDetail(activeCandidate.minifig, selectedCondition)}
          >
            <Puzzle size={15} />
            <span>Ver despiece interactivo y faltantes</span>
          </button>

          <div className="action-pair">
            <button
              type="button"
              id="btn-compare-prices-from-scan"
              className="btn-primary"
              onClick={() => {
                const updatedFig: MinifigureMetadata =
                  Math.abs(resolvedSingleUnitValueEur - currentConditionPriceEur) > 0.01
                    ? {
                        ...activeCandidate.minifig,
                        baseMarketPriceEur: {
                          ...activeCandidate.minifig.baseMarketPriceEur,
                          [selectedCondition]: resolvedSingleUnitValueEur
                        },
                        isEstimatedFallbackPrice: false
                      }
                    : activeCandidate.minifig;
                onSelectMinifigForComparison(updatedFig, selectedCondition);
              }}
            >
              <Search size={16} />
              <span>Abrir Tasador</span>
              <ChevronRight size={15} />
            </button>

            <button
              type="button"
              id="btn-quick-add-collection"
              className="btn-tonal"
              onClick={() =>
                handleQuickAdd(
                  activeCandidate.minifig,
                  selectedCondition,
                  1,
                  resolvedSingleUnitValueEur
                )
              }
            >
              <CheckCircle2 size={16} />
              <span>+1 a Colección</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
