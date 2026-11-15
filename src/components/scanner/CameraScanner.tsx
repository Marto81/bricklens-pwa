import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Grid,
  ImagePlus,
  Minus,
  MoreVertical,
  Plus,
  QrCode,
  Search,
  Sparkles,
  Zap
} from 'lucide-react';
import type {
  BulkImportParsedLine,
  BulkScanSession,
  CmfLookupResult,
  MinifigCondition,
  MinifigureMetadata,
  PreferredPriceSource,
  RecognitionCandidate,
  RecognitionResult,
  ScannerMode
} from '../../types/minifig';
import {
  ALL_MINIFIG_CATALOG,
  DEMO_BULK_LOT_IMAGE,
  MINIFIG_CATALOG
} from '../../data/catalogPresets';
import { lookupCmfCode, SAMPLE_CMF_PRESETS } from '../../data/cmfCodes';
import { getQuickDualPricesEur } from '../../services/priceAggregator';
import {
  encodeFullFrameToWebP,
  identifyBulkLotFromImage,
  identifyMinifigureFromImage,
  preprocessImageSourceToBlob
} from '../../services/visionService';

interface CameraScannerProps {
  preferredPriceSource: PreferredPriceSource;
  onSelectMinifigForComparison: (minifig: MinifigureMetadata, condition: MinifigCondition) => void;
  onQuickAddToCollection: (
    minifig: MinifigureMetadata,
    condition: MinifigCondition,
    quantity: number,
    purchasePriceEur: number
  ) => void;
  onBulkAddToCollection: (lines: BulkImportParsedLine[]) => void;
}

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({
  preferredPriceSource,
  onSelectMinifigForComparison,
  onQuickAddToCollection,
  onBulkAddToCollection
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [scannerMode, setScannerMode] = useState<ScannerMode>('single');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Estado Modo Individual
  const [selectedPresetId, setSelectedPresetId] = useState<string>('sw0002');
  const [scanResult, setScanResult] = useState<RecognitionResult | null>(null);
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number>(0);
  const [showAllCandidates, setShowAllCandidates] = useState<boolean>(false);
  const [selectedCondition, setSelectedCondition] = useState<MinifigCondition>('used_complete');

  // Estado Modo Lote (Bulk)
  const [bulkSession, setBulkSession] = useState<BulkScanSession | null>(null);
  const [focusedBulkSlot, setFocusedBulkSlot] = useState<number>(1);
  const [expandedAltSlot, setExpandedAltSlot] = useState<number | null>(null);

  // Estado Modo Cajas CMF
  const [cmfInput, setCmfInput] = useState<string>(SAMPLE_CMF_PRESETS[0].code);
  const [cmfResult, setCmfResult] = useState<CmfLookupResult>(() =>
    lookupCmfCode(SAMPLE_CMF_PRESETS[0].code)
  );
  const [cmfCondition, setCmfCondition] = useState<MinifigCondition>('new');

  const [addedFeedback, setAddedFeedback] = useState<string | null>(null);

  const activePreset =
    MINIFIG_CATALOG.find((m) => m.figId === selectedPresetId) ?? MINIFIG_CATALOG[0];

  useEffect(() => {
    void handleScanPreset('sw0002');
    return () => {
      stopCameraStream();
    };
  }, []);

  // Lectura continua Data Matrix si el usuario activa cámara en modo CMF y el navegador soporta BarcodeDetector
  useEffect(() => {
    if (scannerMode !== 'cmf' || !cameraActive || !videoRef.current) return;
    const win = window as unknown as {
      BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
    };
    if (!win.BarcodeDetector) return;

    let cancelled = false;
    const detector = new win.BarcodeDetector({ formats: ['data_matrix', 'qr_code'] });
    const intervalId = window.setInterval(async () => {
      if (cancelled || !videoRef.current) return;
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
    window.setTimeout(() => setAddedFeedback(null), 2600);
  };

  const stopCameraStream = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const switchMode = (nextMode: ScannerMode) => {
    setScannerMode(nextMode);
    setCameraError(null);
    if (nextMode === 'bulk' && !bulkSession) {
      void handleScanDemoBulkLot();
    }
  };

  const toggleCamera = async () => {
    if (cameraActive) {
      stopCameraStream();
      return;
    }
    setCameraError(null);
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch {
      setCameraError(
        scannerMode === 'cmf'
          ? 'Cámara no disponible. Introduce los 7 dígitos o prueba un código de ejemplo inferior.'
          : 'Cámara no accesible en este navegador. Sube/arrastra una foto real al visor o usa las muestras.'
      );
      setCameraActive(false);
    }
  };

  const handleScanPreset = async (figId: string) => {
    stopCameraStream();
    setSelectedPresetId(figId);
    setIsScanning(true);
    setShowAllCandidates(false);
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

  const handleScanDemoBulkLot = async () => {
    stopCameraStream();
    setIsScanning(true);
    setExpandedAltSlot(null);
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
    } finally {
      setIsScanning(false);
    }
  };

  const handleShutterAction = async () => {
    if (scannerMode === 'bulk') {
      if (cameraActive && videoRef.current) {
        setIsScanning(true);
        try {
          const { dataUrl } = await encodeFullFrameToWebP(videoRef.current, 960);
          const session = await identifyBulkLotFromImage({
            sourceElement: videoRef.current,
            previewDataUrl: dataUrl,
            isDemoLot: false
          });
          setBulkSession(session);
          setFocusedBulkSlot(1);
          stopCameraStream();
        } catch {
          await handleScanDemoBulkLot();
        } finally {
          setIsScanning(false);
        }
        return;
      }
      await handleScanDemoBulkLot();
      return;
    }

    if (cameraActive && videoRef.current) {
      setIsScanning(true);
      try {
        const { blob, dataUrl } = await preprocessImageSourceToBlob(videoRef.current, 720);
        const result = await identifyMinifigureFromImage({
          blob,
          previewDataUrl: dataUrl
        });
        setScanResult(result);
        setSelectedCandidateIdx(0);
      } catch {
        await handleScanPreset(selectedPresetId);
      } finally {
        setIsScanning(false);
      }
      return;
    }
    await handleScanPreset(selectedPresetId);
  };

  const processImageFile = async (file: File) => {
    setIsScanning(true);
    setCameraError(null);
    stopCameraStream();
    try {
      const imgUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = imgUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      if (scannerMode === 'bulk') {
        const { dataUrl } = await encodeFullFrameToWebP(img, 960);
        const isDemoName = file.name.toLowerCase().includes('bulk_lot');
        const session = await identifyBulkLotFromImage({
          sourceElement: img,
          previewDataUrl: dataUrl,
          isDemoLot: isDemoName
        });
        URL.revokeObjectURL(imgUrl);
        setBulkSession(session);
        setFocusedBulkSlot(1);
        setExpandedAltSlot(null);
      } else {
        const { blob, dataUrl } = await preprocessImageSourceToBlob(img, 720);
        URL.revokeObjectURL(imgUrl);

        const matchedPreset = ALL_MINIFIG_CATALOG.find((m) =>
          file.name.toLowerCase().includes(m.figId.toLowerCase())
        );

        const result = await identifyMinifigureFromImage({
          blob,
          previewDataUrl: dataUrl,
          presetFigId: matchedPreset?.figId
        });
        setScanResult(result);
        setSelectedCandidateIdx(0);
        setShowAllCandidates(false);
      }
    } finally {
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

  const activeCandidate: RecognitionCandidate | undefined =
    scanResult?.candidates[selectedCandidateIdx] ?? scanResult?.candidates[0];

  const singleDualPrices = useMemo(() => {
    if (!activeCandidate) return null;
    return getQuickDualPricesEur(activeCandidate.minifig, preferredPriceSource);
  }, [activeCandidate, preferredPriceSource]);

  const handleQuickAdd = (minifig: MinifigureMetadata, condition: MinifigCondition, qty = 1) => {
    const dual = getQuickDualPricesEur(minifig, preferredPriceSource);
    const unitVal =
      condition === 'new'
        ? dual.newEur
        : condition === 'used_incomplete'
        ? dual.incompleteEur
        : dual.usedEur;
    const defaultPaid = Math.round(unitVal * 0.78 * 100) / 100;
    onQuickAddToCollection(minifig, condition, qty, defaultPaid);
    showToast(`${qty}× ${minifig.figId.toUpperCase()} añadida a tu colección`);
  };

  // Manipuladores de filas del Modo Lote (Bulk)
  const updateBulkItem = (
    slotIndex: number,
    updater: (item: BulkScanSession['items'][number]) => BulkScanSession['items'][number]
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
      if (!item.included) continue;
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
    const lines: BulkImportParsedLine[] = bulkSession.items
      .filter((it) => it.included && it.quantity > 0)
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

    if (lines.length === 0) return;
    onBulkAddToCollection(lines);
    showToast(`${bulkSummary.totalUnits} minifiguras añadidas al inventario`);
  };

  const handleCmfSearch = (raw?: string) => {
    const query = raw ?? cmfInput;
    setCmfInput(query);
    setCmfResult(lookupCmfCode(query));
  };

  const visibleCandidates = useMemo(() => {
    if (!scanResult) return [];
    return showAllCandidates
      ? scanResult.candidates.slice(0, 12)
      : scanResult.candidates.slice(0, 3);
  }, [scanResult, showAllCandidates]);

  return (
    <section className="screen-stack" aria-label="Escáner óptico de minifiguras LEGO">
      {/* Conmutador Sutil de 3 Modos + Visor */}
      <div className="surface-card viewfinder-shell">
        <div className="mode-pill-bar" role="tablist" aria-label="Modo de escáner">
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
            id="mode-tab-bulk"
            role="tab"
            aria-selected={scannerMode === 'bulk'}
            className={`mode-pill-btn ${scannerMode === 'bulk' ? 'active' : ''}`}
            onClick={() => switchMode('bulk')}
          >
            <Grid size={13} />
            <span>Lote (Bulk)</span>
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
            <span>Cajas CMF</span>
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
                Introduce el código completo o los primeros 7 dígitos impresos en la base de la caja (series 25–27, Space, D&D, Spider-Verse).
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

            {cameraError && <p className="camera-notice" style={{ borderRadius: 8 }}>{cameraError}</p>}

            <div className="catalog-pills-scroll" style={{ marginTop: 2 }}>
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

            {cmfResult.matched && cmfResult.entry && cmfResult.minifig ? (
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

                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span className="cmf-factory-tag">{cmfResult.factoryLabel}</span>
                  <div className="brickem-dual-prices">
                    <span className="used">
                      Nueva {cmfResult.entry.estNewEur.toFixed(2)} €
                    </span>
                    <span className="new">
                      Usada {cmfResult.entry.estUsedEur.toFixed(2)} €
                    </span>
                  </div>
                </div>

                {cmfResult.entry.rarityNote && (
                  <p className="section-hint">{cmfResult.entry.rarityNote}</p>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
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
                      5 Portales
                    </button>
                    <button
                      type="button"
                      id="btn-cmf-quick-add"
                      className="btn-chip active"
                      onClick={() => handleQuickAdd(cmfResult.minifig!, cmfCondition, 1)}
                    >
                      +1 Inventario
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
            ) : (
              <div className="cmf-result-banner" id="cmf-result-empty">
                <strong style={{ fontSize: '0.82rem' }}>Código no encontrado en series locales</strong>
                <span className="section-hint">
                  Código detectado: <span className="mono">{cmfResult.scannedElementId || '—'}</span> ·{' '}
                  {cmfResult.factoryLabel}. Prueba con las series 71045–71050 o selecciona un ejemplo arriba.
                </span>
              </div>
            )}
          </div>
        ) : (
          /* MODOS INDIVIDUAL Y LOTE (VISOR ÓPTICO + BARRA DE CÁMARA) */
          <>
            <div
              className={`viewfinder-stage ${scannerMode === 'bulk' ? 'bulk-mode' : ''} ${
                isDragging ? 'drag-over' : ''
              }`}
              style={
                scannerMode === 'bulk' && !cameraActive && bulkSession?.aspectRatio
                  ? { aspectRatio: String(bulkSession.aspectRatio), maxHeight: 380 }
                  : undefined
              }
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDropOnViewfinder}
            >
              {cameraActive ? (
                <video ref={videoRef} className="viewfinder-media" playsInline muted autoPlay />
              ) : scannerMode === 'bulk' ? (
                <img
                  src={bulkSession?.sourceImageDataUrl || DEMO_BULK_LOT_IMAGE}
                  alt="Lote múltiple de minifiguras LEGO"
                  className={`viewfinder-media ${isScanning ? 'scanning' : ''}`}
                  style={{ objectFit: 'fill' }}
                />
              ) : (
                <img
                  src={scanResult?.processedImageDataUrl || activePreset.imageUrl}
                  alt={activeCandidate?.minifig.name || activePreset.name}
                  className={`viewfinder-media ${isScanning ? 'scanning' : ''}`}
                />
              )}

              {/* HUD Minimalista */}
              <div className="hud-top">
                <span className="hud-pill">
                  {scannerMode === 'bulk'
                    ? bulkSession?.apiSource === 'brickognize_live'
                      ? 'Bulk · Brickognize API'
                      : `Lote ${bulkSession?.items.length ?? 0} figs · Listo`
                    : scanResult?.apiSource === 'brickognize_live'
                    ? 'Brickognize API (En Vivo)'
                    : 'Catálogo Estudio · Listo'}
                </span>
                {(scannerMode === 'bulk' ? bulkSession?.latencyMs : scanResult?.latencyMs) && (
                  <span className="hud-pill latency" id="scanner-latency-badge">
                    <Zap size={11} />{' '}
                    {scannerMode === 'bulk' ? bulkSession?.latencyMs : scanResult?.latencyMs} ms
                  </span>
                )}
              </div>

              {/* Recuadros numerados en Modo Bulk */}
              {scannerMode === 'bulk' && !cameraActive && bulkSession && !isScanning && (
                <div className="bulk-overlay-layer" aria-label="Figuras detectadas en la imagen">
                  {bulkSession.items.map((item) => {
                    const isFocused = focusedBulkSlot === item.slotIndex;
                    return (
                      <button
                        key={item.slotIndex}
                        type="button"
                        id={`bulk-bbox-${item.slotIndex}`}
                        className={`bulk-bbox-overlay ${isFocused ? 'active' : ''}`}
                        style={{
                          left: `${item.boundingBox.x * 100}%`,
                          top: `${item.boundingBox.y * 100}%`,
                          width: `${item.boundingBox.width * 100}%`,
                          height: `${item.boundingBox.height * 100}%`
                        }}
                        onClick={() => setFocusedBulkSlot(item.slotIndex)}
                        title={`#${item.slotIndex} ${item.selectedMinifig.figId}`}
                      >
                        <span className="bulk-bbox-tag">{item.slotIndex}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {scannerMode === 'single' && (
                <div className={`reticle-frame ${isScanning ? 'scanning' : ''}`} aria-hidden="true">
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
            </div>

            {cameraError && <p className="camera-notice">{cameraError}</p>}

            {/* Barra Táctil de Cámara */}
            <div className="camera-control-deck">
              <button
                type="button"
                id="btn-upload-photo"
                className="deck-side-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus size={16} />
                <span>{scannerMode === 'bulk' ? 'Subir Lote' : 'Subir Foto'}</span>
              </button>

              <button
                type="button"
                id="btn-shutter-scan"
                className="shutter-trigger"
                onClick={() => void handleShutterAction()}
                disabled={isScanning}
                aria-label={scannerMode === 'bulk' ? 'Escanear lote múltiple' : 'Escanear minifigura'}
                title={scannerMode === 'bulk' ? 'Detectar todas las figuras' : 'Escanear / Capturar'}
              >
                <span className="shutter-core">
                  <Sparkles size={20} />
                </span>
              </button>

              <button
                type="button"
                id="btn-toggle-camera"
                className={`deck-side-btn ${cameraActive ? 'active' : ''}`}
                onClick={() => void toggleCamera()}
              >
                <Camera size={16} />
                <span>{cameraActive ? 'Cerrar Cam' : 'Cámara'}</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={handleFileUpload}
              />
            </div>

            {/* Tira de Muestras (Individual) o Acceso Rápido Lote (Bulk) */}
            {scannerMode === 'single' ? (
              <div className="filmstrip-bar">
                <div className="filmstrip-label">
                  <span>Muestras rápidas de prueba (o arrastra tu foto al visor)</span>
                  <span className="mono">{MINIFIG_CATALOG.length} refs</span>
                </div>
                <div className="filmstrip-scroll" role="list">
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
              </div>
            ) : (
              <div className="filmstrip-bar">
                <div className="filmstrip-label" style={{ marginBottom: 0 }}>
                  <span>Sube 1 foto de mesa/lote con varias minifiguras</span>
                  <button
                    type="button"
                    id="btn-demo-bulk-lot"
                    className="link-btn-mini"
                    onClick={() => void handleScanDemoBulkLot()}
                  >
                    Recargar lote demo (6 figs)
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* PANEL DE RESULTADO: MODO LOTE (Estilo brick'em) */}
      {scannerMode === 'bulk' && bulkSession && (
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
              const dual = getQuickDualPricesEur(item.selectedMinifig, preferredPriceSource);
              const isFocused = focusedBulkSlot === item.slotIndex;
              const isAltOpen = expandedAltSlot === item.slotIndex;

              return (
                <div
                  key={item.slotIndex}
                  id={`bulk-row-${item.slotIndex}`}
                  className={`brickem-row ${isFocused ? 'focused' : ''}`}
                  style={{ opacity: item.included ? 1 : 0.45 }}
                >
                  <div
                    className="brickem-row-main"
                    onClick={() => setFocusedBulkSlot(item.slotIndex)}
                  >
                    <span className="brickem-slot-num">{item.slotIndex}</span>
                    <img
                      src={item.cropDataUrl || item.selectedMinifig.imageUrl}
                      alt={item.selectedMinifig.name}
                      className="brickem-thumb"
                    />
                    <div className="brickem-info">
                      <div className="brickem-title">{item.selectedMinifig.name}</div>
                      <div className="brickem-subline">
                        <span className="code-chip" style={{ fontSize: '0.64rem', padding: '1px 5px' }}>
                          {item.selectedMinifig.figId.toUpperCase()}
                        </span>
                        <div className="brickem-dual-prices">
                          <span className="used">Usada {dual.usedEur.toFixed(2)} €</span>
                          <span className="new">Nueva {dual.newEur.toFixed(2)} €</span>
                        </div>
                      </div>
                    </div>
                  </div>

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
                        id={`btn-bulk-alt-${item.slotIndex}`}
                        className={`btn-chip ${isAltOpen ? 'active' : ''}`}
                        style={{ padding: '4px 7px', fontSize: '0.7rem' }}
                        onClick={() =>
                          setExpandedAltSlot(isAltOpen ? null : item.slotIndex)
                        }
                        title="Cambiar entre 12 alternativas"
                      >
                        <MoreVertical size={12} />
                        <span>{item.candidates.length} alt.</span>
                      </button>

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

                  {isAltOpen && (
                    <div className="brickem-alt-drawer" id={`bulk-alt-drawer-${item.slotIndex}`}>
                      <span className="eyebrow">
                        Alternativas detectadas (Top-{item.candidates.length})
                      </span>
                      <div className="brickem-alt-grid">
                        {item.candidates.map((cand) => {
                          const selected =
                            cand.minifig.figId === item.selectedMinifig.figId;
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
              Añadir todas ({bulkSummary.totalUnits} uds. · {bulkSummary.totalValueEur.toFixed(2)} €) al inventario
            </span>
          </button>
        </div>
      )}

      {/* PANEL DE RESULTADO: MODO INDIVIDUAL */}
      {scannerMode === 'single' && activeCandidate && singleDualPrices && (
        <div className="surface-card" id="recognition-result-panel">
          <div className="sheet-header">
            <div>
              <span className="eyebrow">Minifigura Identificada</span>
              <h2 className="fig-title-lg">{activeCandidate.minifig.name}</h2>
              <div className="fig-meta-line">
                <span className="code-chip">{activeCandidate.minifig.figId.toUpperCase()}</span>
                <span>{activeCandidate.minifig.theme}</span>
                <span>· {activeCandidate.minifig.yearReleased}</span>
                <span>· Set {activeCandidate.minifig.sampleSetCode}</span>
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
                <span>Rasgos ópticos verificados ({activeCandidate.minifig.distinguishingFeatures.length})</span>
                <ChevronDown size={15} />
              </summary>
              <ul>
                {activeCandidate.minifig.distinguishingFeatures.map((feat, i) => (
                  <li key={i}>{feat}</li>
                ))}
              </ul>
            </details>
          </div>

          {addedFeedback && (
            <div className="feedback-banner" role="status">
              <CheckCircle2 size={16} />
              <span>{addedFeedback}</span>
            </div>
          )}

          <div className="action-pair">
            <button
              type="button"
              id="btn-compare-prices-from-scan"
              className="btn-primary"
              onClick={() =>
                onSelectMinifigForComparison(activeCandidate.minifig, selectedCondition)
              }
            >
              <Search size={16} />
              <span>Comparar 5 Portales</span>
              <ChevronRight size={15} />
            </button>

            <button
              type="button"
              id="btn-quick-add-collection"
              className="btn-tonal"
              onClick={() => handleQuickAdd(activeCandidate.minifig, selectedCondition, 1)}
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
