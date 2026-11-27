import type {
  BulkScanDetectedItem,
  BulkScanSession,
  MinifigureMetadata,
  NormalizedBoundingBox,
  PartRecognitionCandidate,
  PartRecognitionResult,
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
import { buildProxyEndpoints } from './apiConfig';

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
    image_width?: number;
    image_height?: number;
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
 * Recorta una región normalizada (x, y, width, height en [0..1]) manteniendo su relación de aspecto
 * natural (sin marcos artificiales grises que confundan al detector en fondos oscuros o de madera).
 */
export async function cropNormalizedRegion(
  source: HTMLVideoElement | HTMLImageElement,
  box: NormalizedBox,
  outputSize = 480
): Promise<{ blob: Blob; dataUrl: string }> {
  const { rawWidth, rawHeight } = resolveRawDimensions(source);

  const sx = Math.max(0, Math.round(box.x * rawWidth));
  const sy = Math.max(0, Math.round(box.y * rawHeight));
  const sw = Math.max(24, Math.min(rawWidth - sx, Math.round(box.width * rawWidth)));
  const sh = Math.max(24, Math.min(rawHeight - sy, Math.round(box.height * rawHeight)));

  const longest = Math.max(sw, sh);
  const scale = Math.min(1, outputSize / Math.max(1, longest));
  const targetW = Math.max(120, Math.round(sw * scale));
  const targetH = Math.max(120, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo crear recorte en canvas');
  }

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, targetW, targetH);

  return encodeCanvasToJpeg(canvas, 0.9);
}

interface GridComponent {
  minR: number;
  maxR: number;
  minC: number;
  maxC: number;
  area: number;
}

/**
 * Divide un bloque demasiado ancho (2 o más minifiguras de pie muy juntas) o demasiado alto
 * (2 filas tocándose) buscando el valle de mínima energía entre picos.
 */
function splitMergedComponent(
  comp: GridComponent,
  cellScores: number[][],
  rawWidth: number,
  rawHeight: number,
  gridCols: number,
  gridRows: number,
  depth = 0
): GridComponent[] {
  if (depth >= 3) return [comp];

  const boxW = comp.maxC - comp.minC + 1;
  const boxH = comp.maxR - comp.minR + 1;
  const pxW = (boxW / gridCols) * rawWidth;
  const pxH = (boxH / gridRows) * rawHeight;
  const aspect = pxW / Math.max(1, pxH);

  // Caso 1: Varias minifiguras de pie lado a lado (ancho >> alto)
  if (aspect > 1.32 && boxW >= 6) {
    const colProfile: number[] = [];
    for (let c = comp.minC; c <= comp.maxC; c++) {
      let sum = 0;
      for (let r = comp.minR; r <= comp.maxR; r++) {
        sum += cellScores[r][c];
      }
      colProfile.push(sum);
    }

    let bestSplitIdx = -1;
    let bestValleyRatio = 0.72;
    for (let i = 2; i <= colProfile.length - 3; i++) {
      const leftMax = Math.max(...colProfile.slice(0, i));
      const rightMax = Math.max(...colProfile.slice(i + 1));
      const minPeak = Math.min(leftMax, rightMax);
      if (minPeak <= 0) continue;
      const ratio = colProfile[i] / minPeak;
      if (ratio < bestValleyRatio) {
        bestValleyRatio = ratio;
        bestSplitIdx = i;
      }
    }

    if (bestSplitIdx > 0) {
      const splitCol = comp.minC + bestSplitIdx;
      const left: GridComponent = {
        minR: comp.minR,
        maxR: comp.maxR,
        minC: comp.minC,
        maxC: splitCol,
        area: Math.max(4, Math.round(comp.area * (bestSplitIdx / colProfile.length)))
      };
      const right: GridComponent = {
        minR: comp.minR,
        maxR: comp.maxR,
        minC: splitCol,
        maxC: comp.maxC,
        area: Math.max(4, comp.area - left.area)
      };
      return [
        ...splitMergedComponent(left, cellScores, rawWidth, rawHeight, gridCols, gridRows, depth + 1),
        ...splitMergedComponent(right, cellScores, rawWidth, rawHeight, gridCols, gridRows, depth + 1)
      ];
    }
  }

  // Caso 2: Dos filas de minifiguras tocándose verticalmente
  if (aspect < 0.44 && boxH >= 10) {
    const rowProfile: number[] = [];
    for (let r = comp.minR; r <= comp.maxR; r++) {
      let sum = 0;
      for (let c = comp.minC; c <= comp.maxC; c++) {
        sum += cellScores[r][c];
      }
      rowProfile.push(sum);
    }

    let bestSplitIdx = -1;
    let bestValleyRatio = 0.72;
    for (let i = 3; i <= rowProfile.length - 4; i++) {
      const topMax = Math.max(...rowProfile.slice(0, i));
      const botMax = Math.max(...rowProfile.slice(i + 1));
      const minPeak = Math.min(topMax, botMax);
      if (minPeak <= 0) continue;
      const ratio = rowProfile[i] / minPeak;
      if (ratio < bestValleyRatio) {
        bestValleyRatio = ratio;
        bestSplitIdx = i;
      }
    }

    if (bestSplitIdx > 0) {
      const splitRow = comp.minR + bestSplitIdx;
      const top: GridComponent = {
        minR: comp.minR,
        maxR: splitRow,
        minC: comp.minC,
        maxC: comp.maxC,
        area: Math.max(4, Math.round(comp.area * (bestSplitIdx / rowProfile.length)))
      };
      const bot: GridComponent = {
        minR: splitRow,
        maxR: comp.maxR,
        minC: comp.minC,
        maxC: comp.maxC,
        area: Math.max(4, comp.area - top.area)
      };
      return [
        ...splitMergedComponent(top, cellScores, rawWidth, rawHeight, gridCols, gridRows, depth + 1),
        ...splitMergedComponent(bot, cellScores, rawWidth, rawHeight, gridCols, gridRows, depth + 1)
      ];
    }
  }

  return [comp];
}

/**
 * Segmentador adaptativo de lotes (Bulk Scanner):
 * - Usa una malla fina de 24x24 celdas para separar figuras cercanas sobre una mesa (2, 3, 4 o hasta 10 figuras)
 *   incluso cuando hay sombras suaves del móvil.
 * - Combina diferencia cromática RGB respecto al fondo perimetral + energía de gradiente 2D (horizontal y vertical).
 * - Divide automáticamente bloques unidos por valle de mínima energía cuando dos figuras están casi tocándose.
 * - Añade un margen de contexto del 4% alrededor de cada figura para no cortar cascos, accesorios ni pies.
 */
export function detectBulkRegionsFromSource(
  source: HTMLVideoElement | HTMLImageElement,
  maxRegions = 10
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
    const { rawWidth, rawHeight } = resolveRawDimensions(source);
    const gridCols = 24;
    const gridRows = 24;
    const sampleW = 192;
    const sampleH = 192;
    const canvas = document.createElement('canvas');
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return defaultGrid3x2.slice(0, maxRegions);

    ctx.drawImage(source, 0, 0, sampleW, sampleH);
    const { data } = ctx.getImageData(0, 0, sampleW, sampleH);

    // Muestrear el color medio del borde perimetral (fondo de la mesa)
    let bgR = 0;
    let bgG = 0;
    let bgB = 0;
    let bgCount = 0;
    for (let x = 0; x < sampleW; x += 2) {
      for (const y of [2, 5, sampleH - 6, sampleH - 3]) {
        const idx = (y * sampleW + x) * 4;
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
        bgCount++;
      }
    }
    for (let y = 8; y < sampleH - 8; y += 3) {
      for (const x of [2, 5, sampleW - 6, sampleW - 3]) {
        const idx = (y * sampleW + x) * 4;
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
        bgCount++;
      }
    }
    bgR /= Math.max(1, bgCount);
    bgG /= Math.max(1, bgCount);
    bgB /= Math.max(1, bgCount);
    const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

    const cellW = Math.floor(sampleW / gridCols);
    const cellH = Math.floor(sampleH / gridRows);
    const cellScores: number[][] = Array.from({ length: gridRows }, () =>
      Array(gridCols).fill(0)
    );

    const allScores: number[] = [];

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        let edgeEnergy = 0;
        let chromaDiff = 0;
        let lumDiff = 0;
        let pixels = 0;

        for (let py = r * cellH; py < (r + 1) * cellH - 1; py++) {
          for (let px = c * cellW; px < (c + 1) * cellW - 1; px++) {
            const idx = (py * sampleW + px) * 4;
            const rightIdx = (py * sampleW + px + 1) * 4;
            const downIdx = ((py + 1) * sampleW + px) * 4;

            const pr = data[idx];
            const pg = data[idx + 1];
            const pb = data[idx + 2];
            const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
            const rLum =
              0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];
            const dLum =
              0.299 * data[downIdx] + 0.587 * data[downIdx + 1] + 0.114 * data[downIdx + 2];

            edgeEnergy += Math.abs(lum - rLum) + Math.abs(lum - dLum);

            // Diferencia cromática normalizada (inmune a sombras uniformes sobre mesa blanca)
            const dr = pr - bgR;
            const dg = pg - bgG;
            const db = pb - bgB;
            const dLumBg = lum - bgLum;
            const chromaOnly = Math.sqrt(
              Math.max(0, dr * dr + dg * dg + db * db - dLumBg * dLumBg * 2.4)
            );
            chromaDiff += chromaOnly;
            lumDiff += Math.abs(dLumBg);
            pixels++;
          }
        }

        const avgEdge = edgeEnergy / Math.max(1, pixels);
        const avgChroma = chromaDiff / Math.max(1, pixels);
        const avgLumDiff = lumDiff / Math.max(1, pixels);

        // El borde local y la saturación pesan más que la simple sombra
        const score = avgEdge * 1.65 + avgChroma * 0.85 + Math.max(0, avgLumDiff - 22) * 0.45;
        cellScores[r][c] = score;
        allScores.push(score);
      }
    }

    const sortedScores = [...allScores].sort((a, b) => a - b);
    const medianScore = sortedScores[Math.floor(sortedScores.length * 0.5)] || 0;
    const threshold = Math.max(15.5, medianScore * 1.85);

    const activeCells: boolean[][] = Array.from({ length: gridRows }, (_, r) =>
      Array.from({ length: gridCols }, (__, c) => cellScores[r][c] >= threshold)
    );

    const visited: boolean[][] = Array.from({ length: gridRows }, () =>
      Array(gridCols).fill(false)
    );
    const components: GridComponent[] = [];

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

          // Conectividad de 8 vecinos para mantener unida cabeza, torso, piernas y arma
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue;
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
        }

        const boxW = maxC - minC + 1;
        const boxH = maxR - minR + 1;
        // Ignorar motas diminutas (pelos/polvo) o un único bloque que ocupa casi toda la foto
        if (area >= 4 && boxW >= 2 && boxH >= 2 && !(boxW >= gridCols - 1 && boxH >= gridRows - 1)) {
          components.push({ minR, maxR, minC, maxC, area });
        }
      }
    }

    // Fusionar componentes muy próximos o solapados verticalmente (ej. casco separado por cuello claro)
    const merged: GridComponent[] = [];
    for (const comp of components.sort((a, b) => b.area - a.area)) {
      const existing = merged.find(
        (m) =>
          comp.minC <= m.maxC + 1 &&
          comp.maxC >= m.minC - 1 &&
          comp.minR <= m.maxR + 1 &&
          comp.maxR >= m.minR - 1 &&
          (Math.min(m.maxC, comp.maxC) - Math.max(m.minC, comp.minC) >= 0 ||
            Math.min(m.maxR, comp.maxR) - Math.max(m.minR, comp.minR) >= 0)
      );
      if (
        existing &&
        Math.max(existing.maxC, comp.maxC) - Math.min(existing.minC, comp.minC) <= 9 &&
        Math.max(existing.maxR, comp.maxR) - Math.min(existing.minR, comp.minR) <= 11
      ) {
        existing.minR = Math.min(existing.minR, comp.minR);
        existing.maxR = Math.max(existing.maxR, comp.maxR);
        existing.minC = Math.min(existing.minC, comp.minC);
        existing.maxC = Math.max(existing.maxC, comp.maxC);
        existing.area += comp.area;
      } else {
        merged.push({ ...comp });
      }
    }

    // Dividir bloques anchos/altos que contengan 2+ figuras casi pegadas en una mesa real
    const separated: GridComponent[] = [];
    for (const comp of merged) {
      separated.push(
        ...splitMergedComponent(comp, cellScores, rawWidth, rawHeight, gridCols, gridRows)
      );
    }

    if (separated.length >= 1 && separated.length <= maxRegions + 2) {
      const padX = 0.038;
      const padY = 0.042;
      return separated
        .sort((a, b) => (Math.abs(a.minR - b.minR) <= 3 ? a.minC - b.minC : a.minR - b.minR))
        .slice(0, maxRegions)
        .map((comp) => {
          const x = Math.max(0.01, comp.minC / gridCols - padX);
          const y = Math.max(0.01, comp.minR / gridRows - padY);
          const right = Math.min(0.99, (comp.maxC + 1) / gridCols + padX);
          const bottom = Math.min(0.99, (comp.maxR + 1) / gridRows + padY);
          return {
            x,
            y,
            width: Math.max(0.12, right - x),
            height: Math.max(0.15, bottom - y)
          };
        });
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
    ...buildProxyEndpoints('brickognize', 'mode=figs&top_k_items=12&min_similarity_items=0.2')
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

  const rawBox = parsedData.bounding_box;
  let normalizedDetectedBox: NormalizedBoundingBox | undefined;
  if (
    rawBox &&
    typeof rawBox.left === 'number' &&
    typeof rawBox.upper === 'number' &&
    typeof rawBox.right === 'number' &&
    typeof rawBox.lower === 'number'
  ) {
    const imgW = Math.max(1, rawBox.image_width || 1024);
    const imgH = Math.max(1, rawBox.image_height || 1024);
    const nx = Math.max(0, Math.min(0.95, rawBox.left / imgW));
    const ny = Math.max(0, Math.min(0.95, rawBox.upper / imgH));
    const nw = Math.max(0.1, Math.min(1 - nx, (rawBox.right - rawBox.left) / imgW));
    const nh = Math.max(0.1, Math.min(1 - ny, (rawBox.lower - rawBox.upper) / imgH));
    normalizedDetectedBox = { x: nx, y: ny, width: nw, height: nh };
  }

  const candidates: RecognitionCandidate[] = rawItems.slice(0, 12).map((item) => {
    const minifig = buildMetadataFromBrickognize(item);
    return {
      minifig,
      confidence: Math.min(0.99, Math.max(0.1, Number(item.score) || 0.5)),
      matchedFeatures: minifig.distinguishingFeatures.slice(0, 2),
      source: 'brickognize_api',
      boundingBox: normalizedDetectedBox
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

function computeBoxIoU(a: NormalizedBoundingBox, b: NormalizedBoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;
  if (interArea <= 0) return 0;
  const unionArea = a.width * a.height + b.width * b.height - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
}

function refineBoxWithInnerDetection(
  outerBox: NormalizedBoundingBox,
  innerBox?: NormalizedBoundingBox,
  boxScore = 0
): NormalizedBoundingBox {
  if (!innerBox || boxScore < 0.35 || innerBox.width < 0.12 || innerBox.height < 0.12) {
    return outerBox;
  }
  const padX = outerBox.width * 0.04;
  const padY = outerBox.height * 0.04;
  const x = Math.max(0.005, outerBox.x + innerBox.x * outerBox.width - padX);
  const y = Math.max(0.005, outerBox.y + innerBox.y * outerBox.height - padY);
  const right = Math.min(0.995, outerBox.x + (innerBox.x + innerBox.width) * outerBox.width + padX);
  const bottom = Math.min(0.995, outerBox.y + (innerBox.y + innerBox.height) * outerBox.height + padY);
  return {
    x: Math.round(x * 1000) / 1000,
    y: Math.round(y * 1000) / 1000,
    width: Math.max(0.08, Math.round((right - x) * 1000) / 1000),
    height: Math.max(0.1, Math.round((bottom - y) * 1000) / 1000)
  };
}

/**
 * Escáner de Lote (Bulk Scanner):
 * Recorta regiones de la foto y consulta Brickognize en paralelo.
 * Si el usuario dispara en modo Lote sobre 1 sola figura (o un lote difícil), hace fallback
 * automático al fotograma completo usando el bounding_box real devuelto por Brickognize.
 */
export async function identifyBulkLotFromImage(options: {
  sourceElement?: HTMLVideoElement | HTMLImageElement;
  previewDataUrl?: string;
  isDemoLot?: boolean;
  onProgress?: (completed: number, total: number) => void;
}): Promise<BulkScanSession> {
  const startTime = performance.now();
  const sessionId = `bulk-${Date.now()}`;
  const isDemo = Boolean(options.isDemoLot);

  if (isDemo) {
    const demoItems: BulkScanDetectedItem[] = DEMO_BULK_LOT_SLOTS.map((slot) => {
      const candidates = buildCandidatesForPreset(slot.figId, 12);
      const primary = candidates[0].minifig;
      return {
        boxId: `box-demo-${slot.slotIndex}`,
        slotIndex: slot.slotIndex,
        boundingBox: slot.boundingBox,
        cropDataUrl: primary.imageUrl,
        selectedMinifig: primary,
        candidates,
        condition: 'used_complete',
        quantity: 1,
        included: true,
        status: 'matched'
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

  const boxes = detectBulkRegionsFromSource(options.sourceElement, 10);
  const rawMatched: BulkScanDetectedItem[] = [];
  let errorCount = 0;
  let lastErrorMessage = '';
  let completed = 0;

  options.onProgress?.(0, boxes.length);

  const batchSize = 3;
  for (let i = 0; i < boxes.length; i += batchSize) {
    const slice = boxes.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      slice.map(async (boundingBox, innerIdx) => {
        const slotNumber = i + innerIdx + 1;
        let cropBlob: Blob | undefined;
        let cropUrl: string | undefined;

        try {
          const cropped = await cropNormalizedRegion(options.sourceElement!, boundingBox, 480);
          cropBlob = cropped.blob;
          cropUrl = cropped.dataUrl;
        } catch {
          cropUrl = undefined;
        }

        const recognition = await identifyMinifigureFromImage({
          blob: cropBlob,
          previewDataUrl: cropUrl || ''
        });

        completed += 1;
        options.onProgress?.(completed, boxes.length);

        if (recognition.apiSource === 'brickognize_live' && recognition.candidates.length > 0) {
          const primary = recognition.candidates[0].minifig;
          const snappedBox = refineBoxWithInnerDetection(
            boundingBox,
            recognition.candidates[0].boundingBox,
            recognition.detectedBoxScore
          );
          return {
            boxId: `box-${Date.now()}-${slotNumber}`,
            slotIndex: slotNumber,
            boundingBox: snappedBox,
            cropDataUrl: cropUrl || primary.imageUrl,
            selectedMinifig: primary,
            candidates: recognition.candidates,
            condition: 'used_complete' as const,
            quantity: 1,
            included: true,
            status: 'matched' as const
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
      if (valid) rawMatched.push(valid);
    }
  }

  // Deduplicar cajas que apunten a exactamente la misma minifigura física (IoU > 0.50)
  const items: BulkScanDetectedItem[] = [];
  for (const cand of rawMatched) {
    const dupIdx = items.findIndex(
      (existing) =>
        existing.selectedMinifig.figId.toLowerCase() === cand.selectedMinifig.figId.toLowerCase() &&
        computeBoxIoU(existing.boundingBox, cand.boundingBox) > 0.48
    );
    if (dupIdx >= 0) {
      const existingConf = items[dupIdx].candidates[0]?.confidence ?? 0;
      const candConf = cand.candidates[0]?.confidence ?? 0;
      if (candConf > existingConf) {
        items[dupIdx] = cand;
      }
    } else {
      items.push(cand);
    }
  }

  // Fallback inteligente al fotograma completo si los recortes parciales no dieron match
  if (items.length === 0) {
    try {
      const fullFrame = await preprocessImageSourceToBlob(options.sourceElement, 920);
      const fullRec = await identifyMinifigureFromImage({
        blob: fullFrame.blob,
        previewDataUrl: fullFrame.dataUrl
      });
      if (fullRec.apiSource === 'brickognize_live' && fullRec.candidates.length > 0) {
        const primary = fullRec.candidates[0].minifig;
        const detectedBox = fullRec.candidates[0].boundingBox || {
          x: 0.16,
          y: 0.12,
          width: 0.68,
          height: 0.76
        };
        items.push({
          boxId: `box-${Date.now()}-1`,
          slotIndex: 1,
          boundingBox: detectedBox,
          cropDataUrl: primary.imageUrl,
          selectedMinifig: primary,
          candidates: fullRec.candidates,
          condition: 'used_complete',
          quantity: 1,
          included: true,
          status: 'matched'
        });
      }
    } catch {
      // ignore fallback error
    }
  }

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
        : 'No se reconocieron minifiguras automáticamente. Puedes añadir recuadros manualmente sobre la foto con «+ Añadir recuadro».';
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

function inferPartCategoryFromBrickognize(
  name: string,
  category?: string
): 'headgear' | 'head' | 'torso' | 'legs' | 'accessory' {
  const hay = `${name} ${category || ''}`.toLowerCase();
  if (/(helmet|hair|hat|hood|cap|crown|mask|headgear|visor|beanie)/.test(hay)) {
    return 'headgear';
  }
  if (/(minifig head|\bhead\b|cabeza)/.test(hay) && !/(headdress|headgear)/.test(hay)) {
    return 'head';
  }
  if (/(torso|body|upper)/.test(hay)) return 'torso';
  if (/(hips|legs|skirt|dress|lower|tail)/.test(hay)) return 'legs';
  return 'accessory';
}

/**
 * Escáner de piezas sueltas (torso, cabeza, casco, piernas) contra Brickognize /predict/parts/.
 * Nunca devuelve datos falsos ante fallos reales.
 */
export async function identifyPartFromImage(options: {
  blob?: Blob;
  previewDataUrl: string;
  presetPart?: {
    partNum: string;
    name: string;
    category: 'headgear' | 'head' | 'torso' | 'legs' | 'accessory';
    imageUrl?: string;
  };
}): Promise<PartRecognitionResult> {
  const startTime = performance.now();
  const scanId = `part-scan-${Date.now()}`;

  if (options.presetPart) {
    const p = options.presetPart;
    return {
      scanId,
      capturedAtIso: new Date().toISOString(),
      processedImageDataUrl: options.previewDataUrl || p.imageUrl || '',
      latencyMs: Math.max(50, Math.round(performance.now() - startTime)),
      apiSource: 'demo_preset',
      candidates: [
        {
          partNum: p.partNum,
          name: p.name,
          category: p.category,
          confidence: 0.96,
          imageUrl: p.imageUrl || '',
          bricklinkUrl: `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(p.partNum)}#T=S`
        }
      ]
    };
  }

  if (!options.blob) {
    return {
      scanId,
      capturedAtIso: new Date().toISOString(),
      processedImageDataUrl: options.previewDataUrl,
      latencyMs: Math.round(performance.now() - startTime),
      apiSource: 'error',
      errorMessage: 'No se recibió ninguna imagen válida de la pieza.',
      candidates: []
    };
  }

  const endpoints = [
    'https://api.brickognize.com/predict/parts/?top_k_items=10&min_similarity_items=0.18',
    ...buildProxyEndpoints('brickognize', 'mode=parts&top_k_items=10&min_similarity_items=0.18')
  ];

  let parsedData: BrickognizeResponse | null = null;
  let lastErrorDetail = '';

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeoutMs = endpoint.startsWith('https://') ? 12000 : 8000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const formData = new FormData();
      formData.append('query_image', options.blob, 'part_scan.jpg');

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
        lastErrorDetail = 'Endpoint no devuelve JSON';
        continue;
      }

      parsedData = (await res.json()) as BrickognizeResponse;
      break;
    } catch (err) {
      clearTimeout(timeoutId);
      lastErrorDetail =
        err instanceof Error && err.name === 'AbortError'
          ? 'Tiempo de espera agotado'
          : err instanceof Error
          ? err.message
          : 'Error de red';
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
        ? 'Sin conexión a Internet. Conéctate para identificar piezas o escribe el código manualmente.'
        : `No se pudo contactar con Brickognize Piezas (${lastErrorDetail || 'red'}).`,
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
        'No se reconoció una pieza LEGO clara. Acerca la cámara sobre fondo liso con buena luz frontal.',
      candidates: []
    };
  }

  const candidates: PartRecognitionCandidate[] = rawItems.slice(0, 10).map((item) => {
    const partNum = item.id.trim();
    return {
      partNum,
      name: item.name,
      category: inferPartCategoryFromBrickognize(item.name, item.category),
      confidence: Math.min(0.99, Math.max(0.1, Number(item.score) || 0.5)),
      imageUrl: item.img_url || '',
      bricklinkUrl: `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(partNum)}#T=S`
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
 * Carga una imagen desde dataUrl o URL en un HTMLImageElement para recortes interactivos.
 */
export function loadImageElementFromUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen del lote.'));
    img.src = src;
  });
}

/**
 * Escanea un único recuadro normalizado de un lote Bulk (usado al añadir, mover o
 * redimensionar una caja interactivamente sobre la foto sin re-escanear el lote entero).
 */
export async function identifySingleBulkBox(options: {
  sourceImageUrl: string;
  boundingBox: NormalizedBoundingBox;
  slotIndex: number;
  boxId?: string;
}): Promise<BulkScanDetectedItem> {
  const img = await loadImageElementFromUrl(options.sourceImageUrl);
  const cropped = await cropNormalizedRegion(img, options.boundingBox, 440);
  const recognition = await identifyMinifigureFromImage({
    blob: cropped.blob,
    previewDataUrl: cropped.dataUrl
  });

  const boxId = options.boxId || `box-${Date.now()}-${options.slotIndex}`;

  if (recognition.apiSource === 'brickognize_live' && recognition.candidates.length > 0) {
    const primary = recognition.candidates[0].minifig;
    return {
      boxId,
      slotIndex: options.slotIndex,
      boundingBox: options.boundingBox,
      cropDataUrl: cropped.dataUrl || primary.imageUrl,
      selectedMinifig: primary,
      candidates: recognition.candidates,
      condition: 'used_complete',
      quantity: 1,
      included: true,
      status: 'matched'
    };
  }

  const placeholderMeta = createCustomMinifigMetadata({
    figId: `lote-${options.slotIndex}`,
    name: `Figura #${options.slotIndex} (sin coincidencia)`,
    imageUrl: cropped.dataUrl
  });

  return {
    boxId,
    slotIndex: options.slotIndex,
    boundingBox: options.boundingBox,
    cropDataUrl: cropped.dataUrl,
    selectedMinifig: placeholderMeta,
    candidates: [],
    condition: 'used_complete',
    quantity: 1,
    included: false,
    status: recognition.apiSource === 'error' ? 'error' : 'no_match',
    errorMessage:
      recognition.errorMessage ||
      'No se identificó figura en este recuadro. Ajústalo o cámbiala por código.'
  };
}

export { MINIFIG_CATALOG };
