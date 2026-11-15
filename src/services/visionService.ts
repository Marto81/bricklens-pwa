import type {
  BulkScanDetectedItem,
  BulkScanSession,
  MinifigureMetadata,
  RecognitionCandidate,
  RecognitionResult
} from '../types/minifig';
import {
  ALL_MINIFIG_CATALOG,
  createCustomMinifigMetadata,
  DEMO_BULK_LOT_IMAGE,
  DEMO_BULK_LOT_SLOTS,
  findMinifigById,
  guessThemeFromFigId,
  MINIFIG_CATALOG
} from '../data/catalogPresets';

interface BrickognizePredictionItem {
  id: string;
  name: string;
  img_url?: string;
  score: number;
  category?: string;
}

interface BrickognizeResponse {
  listing_id?: string;
  bounding_box?: {
    left: number;
    upper: number;
    right: number;
    lower: number;
    score?: number;
  };
  items?: BrickognizePredictionItem[];
}

export interface NormalizedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function resolveRawDimensions(source: HTMLVideoElement | HTMLImageElement): {
  rawWidth: number;
  rawHeight: number;
} {
  if (source instanceof HTMLVideoElement) {
    if (source.readyState < 2 || source.videoWidth <= 0 || source.videoHeight <= 0) {
      throw new Error(
        'La cámara aún se está enfocando. Espera un instante e inténtalo de nuevo.'
      );
    }
    return { rawWidth: source.videoWidth, rawHeight: source.videoHeight };
  }

  const rawWidth = source.naturalWidth || source.width || 0;
  const rawHeight = source.naturalHeight || source.height || 0;
  if (rawWidth <= 0 || rawHeight <= 0) {
    throw new Error('No se pudo leer el tamaño de la imagen seleccionada.');
  }
  return { rawWidth, rawHeight };
}

async function encodeCanvasToJpeg(
  canvas: HTMLCanvasElement,
  quality = 0.88
): Promise<{ blob: Blob; dataUrl: string }> {
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Fallo al codificar la imagen en JPEG'))),
      'image/jpeg',
      quality
    );
  });
  return { blob, dataUrl };
}

/**
 * Redimensiona manteniendo la relación de aspecto completa (sin recortar cabeza ni piernas)
 * y codifica en JPEG (máxima compatibilidad iOS Safari + Android Chrome + Brickognize).
 */
export async function preprocessImageSourceToBlob(
  source: HTMLVideoElement | HTMLImageElement,
  maxDimension = 840
): Promise<{ blob: Blob; dataUrl: string }> {
  const { rawWidth, rawHeight } = resolveRawDimensions(source);
  const longest = Math.max(rawWidth, rawHeight);
  const scale = Math.min(1, maxDimension / Math.max(1, longest));
  const targetWidth = Math.max(120, Math.round(rawWidth * scale));
  const targetHeight = Math.max(120, Math.round(rawHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No se pudo inicializar el contexto 2D del canvas');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(source, 0, 0, rawWidth, rawHeight, 0, 0, targetWidth, targetHeight);

  return encodeCanvasToJpeg(canvas, 0.88);
}

/**
 * Convierte un <video> o <img> completo (sin recorte cuadrado) a JPEG para vista y escaneo de lote.
 */
export async function encodeFullFrameToJpeg(
  source: HTMLVideoElement | HTMLImageElement,
  maxWidth = 1080
): Promise<{ blob: Blob; dataUrl: string; aspectRatio: number }> {
  const { rawWidth, rawHeight } = resolveRawDimensions(source);

  const scale = Math.min(1, maxWidth / Math.max(1, rawWidth));
  const width = Math.max(160, Math.round(rawWidth * scale));
  const height = Math.max(160, Math.round(rawHeight * scale));
  const aspectRatio = Math.round((rawWidth / Math.max(1, rawHeight)) * 1000) / 1000;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el contexto 2D del canvas');
  }
  ctx.drawImage(source, 0, 0, width, height);

  const { blob, dataUrl } = await encodeCanvasToJpeg(canvas, 0.86);
  return { blob, dataUrl, aspectRatio };
}

// Alias mantenido por compatibilidad de importaciones
export const encodeFullFrameToWebP = encodeFullFrameToJpeg;

/**
 * Recorta una región normalizada (x, y, width, height en [0..1]) y la codifica en JPEG.
 */
export async function cropNormalizedRegion(
  source: HTMLVideoElement | HTMLImageElement,
  box: NormalizedBox,
  outputSize = 420
): Promise<{ blob: Blob; dataUrl: string }> {
  const { rawWidth, rawHeight } = resolveRawDimensions(source);

  const sx = Math.max(0, Math.round(box.x * rawWidth));
  const sy = Math.max(0, Math.round(box.y * rawHeight));
  const sw = Math.max(24, Math.min(rawWidth - sx, Math.round(box.width * rawWidth)));
  const sh = Math.max(24, Math.min(rawHeight - sy, Math.round(box.height * rawHeight)));

  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo crear recorte en canvas');
  }

  ctx.fillStyle = '#12151c';
  ctx.fillRect(0, 0, outputSize, outputSize);

  const fitScale = Math.min(outputSize / sw, outputSize / sh);
  const dw = Math.round(sw * fitScale);
  const dh = Math.round(sh * fitScale);
  const dx = Math.round((outputSize - dw) / 2);
  const dy = Math.round((outputSize - dh) / 2);

  ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);

  return encodeCanvasToJpeg(canvas, 0.86);
}

/**
 * Detecta zonas activas con minifiguras sobre un fondo relativamente uniforme mediante
 * energía de borde y contraste local en una rejilla ligera.
 */
export function detectBulkRegionsFromSource(
  source: HTMLVideoElement | HTMLImageElement,
  maxRegions = 8
): NormalizedBox[] {
  const defaultGrid3x2: NormalizedBox[] = [
    { x: 0.04, y: 0.05, width: 0.28, height: 0.43 },
    { x: 0.36, y: 0.05, width: 0.28, height: 0.43 },
    { x: 0.68, y: 0.05, width: 0.28, height: 0.43 },
    { x: 0.04, y: 0.52, width: 0.28, height: 0.43 },
    { x: 0.36, y: 0.52, width: 0.28, height: 0.43 },
    { x: 0.68, y: 0.52, width: 0.28, height: 0.43 }
  ];

  try {
    const gridCols = 12;
    const gridRows = 8;
    const sampleW = 120;
    const sampleH = 80;
    const canvas = document.createElement('canvas');
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return defaultGrid3x2;

    ctx.drawImage(source, 0, 0, sampleW, sampleH);
    const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

    let bgLumSum = 0;
    let bgCount = 0;
    for (let x = 0; x < sampleW; x++) {
      for (const y of [0, 1, sampleH - 2, sampleH - 1]) {
        const idx = (y * sampleW + x) * 4;
        bgLumSum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        bgCount++;
      }
    }
    const bgLum = bgLumSum / Math.max(1, bgCount);

    const cellW = Math.floor(sampleW / gridCols);
    const cellH = Math.floor(sampleH / gridRows);
    const activeCells: boolean[][] = Array.from({ length: gridRows }, () =>
      Array(gridCols).fill(false)
    );

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        let edgeEnergy = 0;
        let lumDiffSum = 0;
        let pixels = 0;

        for (let py = r * cellH; py < (r + 1) * cellH - 1; py++) {
          for (let px = c * cellW; px < (c + 1) * cellW - 1; px++) {
            const idx = (py * sampleW + px) * 4;
            const rightIdx = (py * sampleW + px + 1) * 4;
            const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            const rLum =
              0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];
            edgeEnergy += Math.abs(lum - rLum);
            lumDiffSum += Math.abs(lum - bgLum);
            pixels++;
          }
        }

        const avgEdge = edgeEnergy / Math.max(1, pixels);
        const avgDiff = lumDiffSum / Math.max(1, pixels);
        activeCells[r][c] = avgEdge > 5.5 || avgDiff > 18;
      }
    }

    const visited: boolean[][] = Array.from({ length: gridRows }, () =>
      Array(gridCols).fill(false)
    );
    const components: Array<{
      minR: number;
      maxR: number;
      minC: number;
      maxC: number;
      area: number;
    }> = [];

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        if (!activeCells[r][c] || visited[r][c]) continue;
        const queue: Array<[number, number]> = [[r, c]];
        visited[r][c] = true;
        let minR = r;
        let maxR = r;
        let minC = c;
        let maxC = c;
        let area = 0;

        while (queue.length > 0) {
          const [cr, cc] = queue.shift()!;
          area++;
          if (cr < minR) minR = cr;
          if (cr > maxR) maxR = cr;
          if (cc < minC) minC = cc;
          if (cc > maxC) maxC = cc;

          for (const [dr, dc] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
          ]) {
            const nr = cr + dr;
            const nc = cc + dc;
            if (
              nr >= 0 &&
              nr < gridRows &&
              nc >= 0 &&
              nc < gridCols &&
              activeCells[nr][nc] &&
              !visited[nr][nc]
            ) {
              visited[nr][nc] = true;
              queue.push([nr, nc]);
            }
          }
        }

        if (area >= 2) {
          components.push({ minR, maxR, minC, maxC, area });
        }
      }
    }

    if (components.length >= 2 && components.length <= maxRegions) {
      return components
        .sort((a, b) => a.minR - b.minR || a.minC - b.minC)
        .slice(0, maxRegions)
        .map((comp) => ({
          x: Math.max(0.01, comp.minC / gridCols - 0.015),
          y: Math.max(0.01, comp.minR / gridRows - 0.015),
          width: Math.min(0.95, (comp.maxC - comp.minC + 1) / gridCols + 0.03),
          height: Math.min(0.95, (comp.maxR - comp.minR + 1) / gridRows + 0.03)
        }));
    }

    return defaultGrid3x2.slice(0, maxRegions);
  } catch {
    return defaultGrid3x2.slice(0, maxRegions);
  }
}

function buildMetadataFromBrickognize(item: BrickognizePredictionItem): MinifigureMetadata {
  const existing = findMinifigById(item.id);
  if (existing) return existing;

  return createCustomMinifigMetadata({
    figId: item.id,
    name: item.name,
    theme: item.category || guessThemeFromFigId(item.id),
    imageUrl: item.img_url,
    notes: `Identificada por Brickognize (${item.id.toUpperCase()})`
  });
}

/**
 * Construye candidatos cuando se ejecuta explícitamente una muestra de demostración.
 */
export function buildCandidatesForPreset(
  primaryFigId: string,
  limit = 12
): RecognitionCandidate[] {
  const safeLimit = Math.max(1, Math.min(12, limit));
  const primary = findMinifigById(primaryFigId) ?? ALL_MINIFIG_CATALOG[0];
  const others = ALL_MINIFIG_CATALOG.filter((m) => m.figId !== primary.figId);

  const sortedAlternates = [...others].sort((a, b) => {
    const aSameTheme = a.theme === primary.theme ? 1 : 0;
    const bSameTheme = b.theme === primary.theme ? 1 : 0;
    if (bSameTheme !== aSameTheme) return bSameTheme - aSameTheme;
    return Math.abs(a.yearReleased - primary.yearReleased) - Math.abs(b.yearReleased - primary.yearReleased);
  });

  const results: RecognitionCandidate[] = [
    {
      minifig: primary,
      confidence: 0.94,
      matchedFeatures: primary.distinguishingFeatures.slice(0, 2),
      source: 'local_vision_hybrid',
      boundingBox: { x: 0.14, y: 0.1, width: 0.72, height: 0.8 }
    }
  ];

  const alternatesCount = Math.min(safeLimit - 1, sortedAlternates.length);
  for (let i = 0; i < alternatesCount; i++) {
    const alt = sortedAlternates[i];
    const conf = Math.max(0.18, Math.round((0.82 - i * 0.055) * 100) / 100);
    results.push({
      minifig: alt,
      confidence: conf,
      matchedFeatures: [alt.distinguishingFeatures[0] || alt.theme],
      source: 'local_vision_hybrid'
    });
  }

  return results;
}

/**
 * Ejecuta el pipeline real de identificación visual contra Brickognize API (/predict/figs/).
 * Nunca oculta fallos reales devolviendo datos de prueba falsos (como sw0002).
 */
export async function identifyMinifigureFromImage(options: {
  blob?: Blob;
  previewDataUrl: string;
  presetFigId?: string;
}): Promise<RecognitionResult> {
  const startTime = performance.now();
  const scanId = `scan-${Date.now()}`;

  // Caso explícito: el usuario pulsó "Probar ejemplo"
  if (options.presetFigId) {
    const candidates = buildCandidatesForPreset(options.presetFigId, 12);
    return {
      scanId,
      capturedAtIso: new Date().toISOString(),
      processedImageDataUrl: options.previewDataUrl || candidates[0].minifig.imageUrl,
      latencyMs: Math.max(60, Math.round(performance.now() - startTime)),
      apiSource: 'demo_preset',
      candidates
    };
  }

  if (!options.blob) {
    return {
      scanId,
      capturedAtIso: new Date().toISOString(),
      processedImageDataUrl: options.previewDataUrl,
      latencyMs: Math.round(performance.now() - startTime),
      apiSource: 'error',
      errorMessage: 'No se recibió ninguna imagen válida para analizar.',
      candidates: []
    };
  }

  const endpoints = [
    'https://api.brickognize.com/predict/figs/?top_k_items=12&min_similarity_items=0.2',
    '/api/brickognize.php?mode=figs&top_k_items=12&min_similarity_items=0.2',
    '/api/brickognize?mode=figs&top_k_items=12&min_similarity_items=0.2'
  ];

  const fileExtension = options.blob.type.includes('png')
    ? 'minifig_scan.png'
    : options.blob.type.includes('webp')
    ? 'minifig_scan.webp'
    : 'minifig_scan.jpg';

  let parsedData: BrickognizeResponse | null = null;
  let lastErrorDetail = '';

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeoutMs = endpoint.startsWith('https://') ? 12000 : 8000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const formData = new FormData();
      formData.append('query_image', options.blob, fileExtension);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok) {
        lastErrorDetail = `HTTP ${res.status}`;
        continue;
      }
      if (!contentType.includes('application/json')) {
        // Evitar confundir el fallback HTML de una SPA estática con respuesta válida de proxy
        lastErrorDetail = 'Endpoint no devuelve JSON';
        continue;
      }

      parsedData = (await res.json()) as BrickognizeResponse;
      break;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        lastErrorDetail = 'Tiempo de espera agotado';
      } else {
        lastErrorDetail = err instanceof Error ? err.message : 'Error de red';
      }
    }
  }

  if (!parsedData) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return {
      scanId,
      capturedAtIso: new Date().toISOString(),
      processedImageDataUrl: options.previewDataUrl,
      latencyMs: Math.round(performance.now() - startTime),
      apiSource: 'error',
      errorMessage: offline
        ? 'Sin conexión a Internet. Conéctate para identificar figuras con Brickognize o añade tu código manualmente.'
        : `No se pudo contactar con el servicio de reconocimiento (${lastErrorDetail || 'red'}). Inténtalo de nuevo o introduce el código manualmente.`,
      candidates: []
    };
  }

  const boxScore = parsedData.bounding_box?.score ?? 0;
  const rawItems = parsedData.items ?? [];

  if (rawItems.length === 0) {
    return {
      scanId,
      capturedAtIso: new Date().toISOString(),
      processedImageDataUrl: options.previewDataUrl,
      latencyMs: Math.round(performance.now() - startTime),
      apiSource: 'no_match',
      detectedBoxScore: boxScore,
      errorMessage:
        boxScore >= 0.25
          ? 'Se detectó una figura en la foto, pero no hubo coincidencia fiable. Prueba acercando más la cámara, con buena luz frontal y fondo liso.'
          : 'No se detectó una minifigura LEGO clara en esta imagen. Colócala centrada de cuerpo entero sobre fondo liso.',
      candidates: []
    };
  }

  const candidates: RecognitionCandidate[] = rawItems.slice(0, 12).map((item) => {
    const minifig = buildMetadataFromBrickognize(item);
    return {
      minifig,
      confidence: Math.min(0.99, Math.max(0.1, Number(item.score) || 0.5)),
      matchedFeatures: minifig.distinguishingFeatures.slice(0, 2),
      source: 'brickognize_api'
    };
  });

  return {
    scanId,
    capturedAtIso: new Date().toISOString(),
    processedImageDataUrl: options.previewDataUrl,
    latencyMs: Math.round(performance.now() - startTime),
    apiSource: 'brickognize_live',
    detectedBoxScore: boxScore,
    candidates
  };
}

/**
 * Escáner de Lote (Bulk Scanner):
 * Recorta regiones de la foto y consulta Brickognize en paralelo.
 * En fotos reales nunca rellena huecos fallidos con figuras inventadas.
 */
export async function identifyBulkLotFromImage(options: {
  sourceElement?: HTMLVideoElement | HTMLImageElement;
  previewDataUrl?: string;
  isDemoLot?: boolean;
}): Promise<BulkScanSession> {
  const startTime = performance.now();
  const sessionId = `bulk-${Date.now()}`;
  const isDemo = Boolean(options.isDemoLot);

  if (isDemo) {
    const demoItems: BulkScanDetectedItem[] = DEMO_BULK_LOT_SLOTS.map((slot) => {
      const candidates = buildCandidatesForPreset(slot.figId, 12);
      const primary = candidates[0].minifig;
      return {
        slotIndex: slot.slotIndex,
        boundingBox: slot.boundingBox,
        cropDataUrl: primary.imageUrl,
        selectedMinifig: primary,
        candidates,
        condition: 'used_complete',
        quantity: 1,
        included: true
      };
    });

    return {
      sessionId,
      capturedAtIso: new Date().toISOString(),
      sourceImageDataUrl: options.previewDataUrl || DEMO_BULK_LOT_IMAGE,
      aspectRatio: 1.5,
      latencyMs: Math.max(120, Math.round(performance.now() - startTime)),
      apiSource: 'demo_preset',
      items: demoItems
    };
  }

  if (!options.sourceElement) {
    return {
      sessionId,
      capturedAtIso: new Date().toISOString(),
      sourceImageDataUrl: options.previewDataUrl || '',
      aspectRatio: 1.5,
      latencyMs: Math.round(performance.now() - startTime),
      apiSource: 'error',
      errorMessage: 'No se encontró la imagen del lote para analizar.',
      items: []
    };
  }

  const boxes = detectBulkRegionsFromSource(options.sourceElement, 8);
  const items: BulkScanDetectedItem[] = [];
  let errorCount = 0;
  let lastErrorMessage = '';

  const batchSize = 3;
  for (let i = 0; i < boxes.length; i += batchSize) {
    const slice = boxes.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      slice.map(async (boundingBox, innerIdx) => {
        const slotNumber = i + innerIdx + 1;
        let cropBlob: Blob | undefined;
        let cropUrl: string | undefined;

        try {
          const cropped = await cropNormalizedRegion(options.sourceElement!, boundingBox, 400);
          cropBlob = cropped.blob;
          cropUrl = cropped.dataUrl;
        } catch {
          cropUrl = undefined;
        }

        const recognition = await identifyMinifigureFromImage({
          blob: cropBlob,
          previewDataUrl: cropUrl || ''
        });

        if (recognition.apiSource === 'brickognize_live' && recognition.candidates.length > 0) {
          const primary = recognition.candidates[0].minifig;
          return {
            slotIndex: slotNumber,
            boundingBox,
            cropDataUrl: cropUrl || primary.imageUrl,
            selectedMinifig: primary,
            candidates: recognition.candidates,
            condition: 'used_complete' as const,
            quantity: 1,
            included: true
          };
        }

        if (recognition.apiSource === 'error') {
          errorCount++;
          if (recognition.errorMessage) lastErrorMessage = recognition.errorMessage;
        }
        return null;
      })
    );

    for (const valid of batchResults) {
      if (valid) items.push(valid);
    }
  }

  // Re-numerar consecutivamente los ítems realmente detectados
  const renumbered = items.map((item, idx) => ({
    ...item,
    slotIndex: idx + 1
  }));

  const { rawWidth, rawHeight } = resolveRawDimensions(options.sourceElement);
  const aspectRatio = Math.round((rawWidth / Math.max(1, rawHeight)) * 1000) / 1000;

  let apiSource: BulkScanSession['apiSource'] = 'brickognize_live';
  let errorMessage: string | undefined;

  if (renumbered.length === 0) {
    apiSource = errorCount > 0 ? 'error' : 'no_match';
    errorMessage =
      errorCount > 0
        ? lastErrorMessage || 'Error de conexión al analizar las figuras del lote.'
        : 'No se reconocieron minifiguras individuales en el lote. Separa ligeramente las figuras sobre fondo liso con buena iluminación.';
  }

  return {
    sessionId,
    capturedAtIso: new Date().toISOString(),
    sourceImageDataUrl: options.previewDataUrl || '',
    aspectRatio,
    latencyMs: Math.max(150, Math.round(performance.now() - startTime)),
    apiSource,
    errorMessage,
    items: renumbered
  };
}

export { MINIFIG_CATALOG };
