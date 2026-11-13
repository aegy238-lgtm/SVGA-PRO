// Local AI Gift Finder Engine & Windows 10/11 Local Desktop Agent Protocol
// All visual analysis, indexing, and similarity matching run strictly locally on the user's device.

export const LOCAL_AGENT_PORT = 45200;
export const LOCAL_AGENT_BASE_URL = `http://127.0.0.1:${LOCAL_AGENT_PORT}`;
export const LOCAL_AGENT_VERSION = '1.0.0';
export const LOCAL_AGENT_STORAGE_TOKEN_KEY = 'svga520_local_agent_token_v1';

export type AgentConnectionState =
  | 'checking'
  | 'disconnected'
  | 'needs_pairing'
  | 'connected';

export interface VisualFeatureFrame {
  /** 16-char hex string representing 64-bit difference hash (dHash) */
  dHash: string;
  /** 16-char hex string representing 64-bit average hash (aHash) */
  aHash: string;
  /** 8x8 RGB spatial color vector (length 192, values 0..255) */
  colorGrid: number[];
  /** 24-bin normalized color histogram (8R + 8G + 8B, values 0..1000) */
  colorHist: number[];
  /** Aspect ratio width / height */
  aspectRatio: number;
  /** Non-transparent / foreground pixel ratio 0..1 */
  foregroundRatio: number;
  /** Source frame timestamp (seconds) if sampled from video */
  timestampSec?: number;
}

export interface ReferenceQueryPayload {
  fileName: string;
  fileType: 'image' | 'video' | 'svga' | 'unknown';
  width: number;
  height: number;
  durationSec?: number;
  frames: VisualFeatureFrame[];
  previewDataUrl: string;
  textQuery?: string;
}

export interface AgentStatusResponse {
  online: boolean;
  version: string;
  os: string;
  requiresPairing: boolean;
  paired: boolean;
  folderCount: number;
  indexedCount: number;
  isIndexing: boolean;
  lastIndexedAt?: string | null;
  lastScanDurationMs?: number;
}

export interface AuthorizedFolderEntry {
  path: string;
  fileCount: number;
  addedAt: string;
}

export interface IndexedGiftRecord {
  id: string;
  name: string;
  path: string;
  folder: string;
  format: string;
  sizeBytes: number;
  modifiedAt: string;
  width: number;
  height: number;
  frames: VisualFeatureFrame[];
  thumbnailDataUrl: string;
  tokens: string[];
}

export interface LocalGiftSearchMatchBreakdown {
  visualHashScore: number;
  spatialColorScore: number;
  histogramScore: number;
  aspectScore: number;
  textScore: number;
}

export interface LocalGiftSearchResult {
  id: string;
  name: string;
  path: string;
  folder: string;
  format: string;
  sizeBytes: number;
  modifiedAt: string;
  width: number;
  height: number;
  thumbnailDataUrl: string;
  score: number;
  matchBreakdown: LocalGiftSearchMatchBreakdown;
}

export interface LocalSearchResponse {
  results: LocalGiftSearchResult[];
  searchedCount: number;
  durationMs: number;
}

export const SUPPORTED_GIFT_INDEX_EXTENSIONS = [
  '.svga',
  '.pag',
  '.vap',
  '.yyeva',
  '.mp4',
  '.mov',
  '.webm',
  '.gif',
  '.webp',
  '.apng',
  '.png',
  '.jpg',
  '.jpeg',
  '.lottie',
  '.json',
] as const;

// ---------------------------------------------------------------------------
// Security Helpers (Folder Scope Validation)
// ---------------------------------------------------------------------------

export function normalizePlatformPath(inputPath: string): string {
  if (!inputPath) return '';
  let p = String(inputPath).trim().replace(/\//g, '\\');
  // Strip trailing slashes except root drive like "C:\"
  while (p.length > 3 && p.endsWith('\\')) {
    p = p.slice(0, -1);
  }
  // Handle POSIX paths when running on Linux/macOS too
  if (inputPath.startsWith('/')) {
    p = inputPath.trim().replace(/\/+$/, '') || '/';
  }
  return p;
}

/**
 * Strictly checks that `targetPath` resolves inside one of the user-authorized folders.
 * Prevents path traversal (`..`), prefix spoofing (`C:\GiftsExtra` vs `C:\Gifts`), etc.
 */
export function isPathInsideAuthorizedFolders(
  targetPath: string,
  allowedFolders: string[]
): boolean {
  if (!targetPath || !Array.isArray(allowedFolders) || allowedFolders.length === 0) {
    return false;
  }

  const hasTraversal = /(^|[\\/])\.\.([\\/]|$)/.test(targetPath);
  if (hasTraversal) return false;

  const isWindowsStyle = /^[a-zA-Z]:/.test(targetPath) || targetPath.includes('\\');
  const normTarget = isWindowsStyle
    ? normalizePlatformPath(targetPath).toLowerCase()
    : targetPath.trim().replace(/\/+$/, '');

  return allowedFolders.some((rawFolder) => {
    if (!rawFolder) return false;
    const normFolder = isWindowsStyle
      ? normalizePlatformPath(rawFolder).toLowerCase()
      : rawFolder.trim().replace(/\/+$/, '');

    if (!normFolder) return false;
    if (normTarget === normFolder) return true;

    const sep = isWindowsStyle ? '\\' : '/';
    const folderPrefix = normFolder.endsWith(sep) ? normFolder : normFolder + sep;
    return normTarget.startsWith(folderPrefix);
  });
}

// ---------------------------------------------------------------------------
// Pure Visual Fingerprinting & Perceptual Hashing
// ---------------------------------------------------------------------------

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/**
 * Resamples RGBA image data cleanly using box-averaging onto a WxH grid
 * with transparent pixels blended onto a neutral dark slate (#0f172a) so
 * transparent gift edges have consistent luminance and color representation.
 */
export function downsampleRgbaGrid(
  rgba: Uint8ClampedArray | number[],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): { r: number[]; g: number[]; b: number[]; luma: number[]; foregroundRatio: number } {
  const total = dstW * dstH;
  const rOut = new Array<number>(total).fill(0);
  const gOut = new Array<number>(total).fill(0);
  const bOut = new Array<number>(total).fill(0);
  const lumaOut = new Array<number>(total).fill(0);

  if (srcW <= 0 || srcH <= 0 || rgba.length < srcW * srcH * 4) {
    return { r: rOut, g: gOut, b: bOut, luma: lumaOut, foregroundRatio: 0 };
  }

  let fgPixels = 0;
  let totalSampled = 0;

  for (let dy = 0; dy < dstH; dy++) {
    const y0 = Math.floor((dy * srcH) / dstH);
    const y1 = Math.max(y0 + 1, Math.floor(((dy + 1) * srcH) / dstH));
    for (let dx = 0; dx < dstW; dx++) {
      const x0 = Math.floor((dx * srcW) / dstW);
      const x1 = Math.max(x0 + 1, Math.floor(((dx + 1) * srcW) / dstW));

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;

      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const idx = (sy * srcW + sx) * 4;
          const a = (rgba[idx + 3] ?? 255) / 255;
          if (a > 0.1) fgPixels++;
          totalSampled++;
          // Composite over dark background (#0b0e1a -> 11, 14, 26)
          sumR += (rgba[idx] ?? 0) * a + 11 * (1 - a);
          sumG += (rgba[idx + 1] ?? 0) * a + 14 * (1 - a);
          sumB += (rgba[idx + 2] ?? 0) * a + 26 * (1 - a);
          count++;
        }
      }

      const outIdx = dy * dstW + dx;
      const avgR = sumR / Math.max(1, count);
      const avgG = sumG / Math.max(1, count);
      const avgB = sumB / Math.max(1, count);
      rOut[outIdx] = clampByte(avgR);
      gOut[outIdx] = clampByte(avgG);
      bOut[outIdx] = clampByte(avgB);
      lumaOut[outIdx] = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
    }
  }

  return {
    r: rOut,
    g: gOut,
    b: bOut,
    luma: lumaOut,
    foregroundRatio: totalSampled > 0 ? Math.min(1, fgPixels / totalSampled) : 0,
  };
}

function bitsToHex64(bits: number[]): string {
  let hex = '';
  for (let nibble = 0; nibble < 16; nibble++) {
    let val = 0;
    for (let b = 0; b < 4; b++) {
      if (bits[nibble * 4 + b]) {
        val |= 1 << (3 - b);
      }
    }
    hex += val.toString(16);
  }
  return hex;
}

/** Computes 64-bit difference hash (dHash) from 9x8 downsampled luminance. */
export function computeRgbaDHash(
  rgba: Uint8ClampedArray | number[],
  width: number,
  height: number
): string {
  const { luma } = downsampleRgbaGrid(rgba, width, height, 9, 8);
  const bits: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = luma[y * 9 + x] ?? 0;
      const right = luma[y * 9 + x + 1] ?? 0;
      bits.push(left > right ? 1 : 0);
    }
  }
  return bitsToHex64(bits);
}

/** Computes 64-bit average hash (aHash) from 8x8 downsampled luminance. */
export function computeRgbaAHash(
  rgba: Uint8ClampedArray | number[],
  width: number,
  height: number
): string {
  const { luma } = downsampleRgbaGrid(rgba, width, height, 8, 8);
  const mean = luma.reduce((acc, v) => acc + v, 0) / 64;
  const bits = luma.map((v) => (v >= mean ? 1 : 0));
  return bitsToHex64(bits);
}

/** Computes 8x8 spatial RGB grid (192 ints) and 24-bin color histogram (values 0..1000). */
export function computeVisualFeaturesFromRgba(
  rgba: Uint8ClampedArray | number[],
  width: number,
  height: number,
  timestampSec?: number
): VisualFeatureFrame {
  const dHash = computeRgbaDHash(rgba, width, height);
  const aHash = computeRgbaAHash(rgba, width, height);
  const grid = downsampleRgbaGrid(rgba, width, height, 8, 8);

  const colorGrid: number[] = [];
  const hist = new Array<number>(24).fill(0);
  let activeHistCount = 0;

  for (let i = 0; i < 64; i++) {
    const r = grid.r[i] ?? 0;
    const g = grid.g[i] ?? 0;
    const b = grid.b[i] ?? 0;
    colorGrid.push(r, g, b);

    // Ignore near-background dark pixels when building color distribution so shape/subject dominates
    if (r + g + b > 48) {
      hist[Math.min(7, r >> 5)] += 1;
      hist[8 + Math.min(7, g >> 5)] += 1;
      hist[16 + Math.min(7, b >> 5)] += 1;
      activeHistCount++;
    }
  }

  const denom = Math.max(1, activeHistCount);
  const colorHist = hist.map((v) => Math.round((v / denom) * 1000));

  return {
    dHash,
    aHash,
    colorGrid,
    colorHist,
    aspectRatio: height > 0 ? Number((width / height).toFixed(3)) : 1,
    foregroundRatio: Number(grid.foregroundRatio.toFixed(3)),
    ...(typeof timestampSec === 'number' ? { timestampSec } : {}),
  };
}

export function hammingDistanceHex(hexA: string, hexB: string): number {
  if (!hexA || !hexB || hexA.length !== hexB.length) return 64;
  let dist = 0;
  for (let i = 0; i < hexA.length; i++) {
    const a = parseInt(hexA[i], 16);
    const b = parseInt(hexB[i], 16);
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    let xor = a ^ b;
    while (xor > 0) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

export function cosineSimilarityVectors(vecA: number[], vecB: number[]): number {
  if (!vecA.length || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i] || 0;
    const b = vecB[i] || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) return 0;
  return Math.max(0, Math.min(1, dot / (Math.sqrt(normA) * Math.sqrt(normB))));
}

export function histogramIntersectionScore(histA: number[], histB: number[]): number {
  if (histA.length !== 24 || histB.length !== 24) return 0;
  let minSum = 0;
  let maxSum = 0;
  for (let i = 0; i < 24; i++) {
    const a = histA[i] || 0;
    const b = histB[i] || 0;
    minSum += Math.min(a, b);
    maxSum += Math.max(a, b);
  }
  if (maxSum <= 0) return 0;
  return Math.max(0, Math.min(1, minSum / maxSum));
}

export function tokenizeSearchText(input: string): string[] {
  return String(input || '')
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .split(/[^a-z0-9\u0600-\u06ff]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export function scoreFramePair(
  q: VisualFeatureFrame,
  c: VisualFeatureFrame
): { combined: number; breakdown: Omit<LocalGiftSearchMatchBreakdown, 'textScore'> } {
  const dDist = hammingDistanceHex(q.dHash, c.dHash);
  const aDist = hammingDistanceHex(q.aHash, c.aHash);
  const dSim = Math.max(0, 1 - dDist / 64);
  const aSim = Math.max(0, 1 - aDist / 64);
  const visualHashScore = dSim * 0.62 + aSim * 0.38;

  const spatialColorScore = cosineSimilarityVectors(q.colorGrid, c.colorGrid);
  const histogramScore = histogramIntersectionScore(q.colorHist, c.colorHist);

  const ratioMax = Math.max(q.aspectRatio || 1, c.aspectRatio || 1);
  const ratioMin = Math.min(q.aspectRatio || 1, c.aspectRatio || 1);
  const aspectScore = ratioMax > 0 ? ratioMin / ratioMax : 1;

  const combined =
    visualHashScore * 0.44 +
    spatialColorScore * 0.31 +
    histogramScore * 0.17 +
    aspectScore * 0.08;

  return {
    combined,
    breakdown: {
      visualHashScore,
      spatialColorScore,
      histogramScore,
      aspectScore,
    },
  };
}

export function scoreLocalGiftCandidate(
  queryFrames: VisualFeatureFrame[],
  candidate: IndexedGiftRecord,
  textQuery?: string
): LocalGiftSearchResult {
  let bestVisualCombined = 0;
  let bestBreakdown: Omit<LocalGiftSearchMatchBreakdown, 'textScore'> = {
    visualHashScore: 0,
    spatialColorScore: 0,
    histogramScore: 0,
    aspectScore: 0,
  };

  const candidateFrames = candidate.frames || [];
  if (queryFrames.length > 0 && candidateFrames.length > 0) {
    for (const qf of queryFrames) {
      for (const cf of candidateFrames) {
        const res = scoreFramePair(qf, cf);
        if (res.combined > bestVisualCombined) {
          bestVisualCombined = res.combined;
          bestBreakdown = res.breakdown;
        }
      }
    }
  }

  let textScore = 0;
  const queryTokens = tokenizeSearchText(textQuery || '');
  if (queryTokens.length > 0) {
    const targetText = `${candidate.name} ${candidate.folder} ${candidate.format}`.toLowerCase();
    const candidateTokens = new Set([
      ...(candidate.tokens || []),
      ...tokenizeSearchText(candidate.name),
    ]);
    let hits = 0;
    for (const qt of queryTokens) {
      if (candidateTokens.has(qt) || targetText.includes(qt)) {
        hits += 1;
      }
    }
    textScore = hits / queryTokens.length;
  }

  let finalScoreRatio = bestVisualCombined;
  if (queryFrames.length === 0 && queryTokens.length > 0) {
    finalScoreRatio = textScore;
  } else if (queryTokens.length > 0) {
    finalScoreRatio = bestVisualCombined * 0.8 + textScore * 0.2;
  }

  const scorePct = Math.max(0, Math.min(100, Math.round(finalScoreRatio * 100)));

  return {
    id: candidate.id,
    name: candidate.name,
    path: candidate.path,
    folder: candidate.folder,
    format: candidate.format,
    sizeBytes: candidate.sizeBytes,
    modifiedAt: candidate.modifiedAt,
    width: candidate.width,
    height: candidate.height,
    thumbnailDataUrl: candidate.thumbnailDataUrl,
    score: scorePct,
    matchBreakdown: {
      visualHashScore: Math.round(bestBreakdown.visualHashScore * 100),
      spatialColorScore: Math.round(bestBreakdown.spatialColorScore * 100),
      histogramScore: Math.round(bestBreakdown.histogramScore * 100),
      aspectScore: Math.round(bestBreakdown.aspectScore * 100),
      textScore: Math.round(textScore * 100),
    },
  };
}

export function rankLocalGiftSearchResults(
  queryFrames: VisualFeatureFrame[],
  candidates: IndexedGiftRecord[],
  options?: { textQuery?: string; formatFilter?: string; limit?: number; minScore?: number }
): LocalGiftSearchResult[] {
  const fmtFilter = (options?.formatFilter || 'ALL').toUpperCase();
  const limit = options?.limit ?? 40;
  const minScore = options?.minScore ?? 0;

  return candidates
    .filter((c) => {
      if (fmtFilter !== 'ALL' && c.format.toUpperCase() !== fmtFilter) {
        return false;
      }
      return true;
    })
    .map((c) => scoreLocalGiftCandidate(queryFrames, c, options?.textQuery))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Browser-Side Reference File Feature Extractor (Image / Video / SVGA)
// Never uploads the original file — only produces compact visual descriptors.
// ---------------------------------------------------------------------------

function extractRgbaFromCanvas(
  drawFn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  srcW: number,
  srcH: number
): { frame: VisualFeatureFrame; previewDataUrl: string } {
  const thumbSize = 96;
  const canvas = document.createElement('canvas');
  canvas.width = thumbSize;
  canvas.height = thumbSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  ctx.fillStyle = '#0b0e1a';
  ctx.fillRect(0, 0, thumbSize, thumbSize);

  const scale = Math.min(thumbSize / Math.max(1, srcW), thumbSize / Math.max(1, srcH));
  const dw = Math.max(1, Math.round(srcW * scale));
  const dh = Math.max(1, Math.round(srcH * scale));
  const dx = Math.round((thumbSize - dw) / 2);
  const dy = Math.round((thumbSize - dh) / 2);

  drawFn(ctx, dx, dy);
  const imgData = ctx.getImageData(0, 0, thumbSize, thumbSize);
  const frame = computeVisualFeaturesFromRgba(imgData.data, thumbSize, thumbSize);
  // Preserve true source aspect ratio for matching
  frame.aspectRatio = srcH > 0 ? Number((srcW / srcH).toFixed(3)) : 1;

  return {
    frame,
    previewDataUrl: canvas.toDataURL('image/jpeg', 0.84),
  };
}

function drawFittedImageOnCanvas(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  targetSize = 96
): VisualFeatureFrame {
  ctx.clearRect(0, 0, targetSize, targetSize);
  ctx.fillStyle = '#0b0e1a';
  ctx.fillRect(0, 0, targetSize, targetSize);
  const scale = Math.min(targetSize / Math.max(1, srcW), targetSize / Math.max(1, srcH));
  const dw = Math.max(1, Math.round(srcW * scale));
  const dh = Math.max(1, Math.round(srcH * scale));
  const dx = Math.round((targetSize - dw) / 2);
  const dy = Math.round((targetSize - dh) / 2);
  ctx.drawImage(source, dx, dy, dw, dh);
  const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
  const feat = computeVisualFeaturesFromRgba(imgData.data, targetSize, targetSize);
  feat.aspectRatio = srcH > 0 ? Number((srcW / srcH).toFixed(3)) : 1;
  return feat;
}

/** Extracts largest embedded PNG/JPG sprites inside a raw SVGA binary without remote calls. */
async function extractEmbeddedImagesFromSvgaBuffer(buf: ArrayBuffer): Promise<Blob[]> {
  let bytes = new Uint8Array(buf);
  // Attempt zlib inflate using DecompressionStream if SVGA 2.0 compressed
  if (bytes.length > 2 && bytes[0] === 0x78 && typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const outBuf = await new Response(ds.readable).arrayBuffer();
      bytes = new Uint8Array(outBuf);
    } catch {
      // keep raw bytes if inflate fails
    }
  }

  const blobs: Blob[] = [];
  // Scan for PNG signatures (89 50 4E 47 0D 0A 1A 0A ... 49 45 4E 44 AE 42 60 82)
  for (let i = 0; i < bytes.length - 16; i++) {
    if (
      bytes[i] === 0x89 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x4e &&
      bytes[i + 3] === 0x47 &&
      bytes[i + 4] === 0x0d &&
      bytes[i + 5] === 0x0a &&
      bytes[i + 6] === 0x1a &&
      bytes[i + 7] === 0x0a
    ) {
      let end = -1;
      for (let j = i + 8; j < bytes.length - 7; j++) {
        if (
          bytes[j] === 0x49 &&
          bytes[j + 1] === 0x45 &&
          bytes[j + 2] === 0x4e &&
          bytes[j + 3] === 0x44 &&
          bytes[j + 4] === 0xae &&
          bytes[j + 5] === 0x42 &&
          bytes[j + 6] === 0x60 &&
          bytes[j + 7] === 0x82
        ) {
          end = j + 8;
          break;
        }
      }
      if (end > i + 24) {
        blobs.push(new Blob([bytes.slice(i, end)], { type: 'image/png' }));
        i = end - 1;
        if (blobs.length >= 6) break;
      }
    }
  }
  return blobs;
}

export async function extractReferenceVisualFeatures(
  file: File
): Promise<ReferenceQueryPayload> {
  const lower = file.name.toLowerCase();
  const isVideo =
    file.type.startsWith('video/') ||
    /\.(mp4|webm|mov|m4v|mkv)$/i.test(lower);
  const isSvga = lower.endsWith('.svga');

  if (isVideo) {
    const url = URL.createObjectURL(file);
    try {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = url;

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Video load timeout')), 8000);
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error('Cannot decode reference video'));
        };
      });

      const vw = video.videoWidth || 300;
      const vh = video.videoHeight || 300;
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      const sampleRatios = [0.15, 0.45, 0.72, 0.9];
      const frames: VisualFeatureFrame[] = [];
      let previewDataUrl = '';

      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 96;
      const ctx = canvas.getContext('2d')!;

      for (let i = 0; i < sampleRatios.length; i++) {
        const targetSec = Math.min(duration - 0.05, Math.max(0, duration * sampleRatios[i]));
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
          video.currentTime = targetSec;
          setTimeout(resolve, 600);
        });
        const feat = drawFittedImageOnCanvas(ctx, video, vw, vh, 96);
        feat.timestampSec = Number(targetSec.toFixed(2));
        frames.push(feat);
        if (i === 1 || !previewDataUrl) {
          previewDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        }
      }

      return {
        fileName: file.name,
        fileType: 'video',
        width: vw,
        height: vh,
        durationSec: Number(duration.toFixed(2)),
        frames,
        previewDataUrl,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  if (isSvga) {
    const buf = await file.arrayBuffer();
    const spriteBlobs = await extractEmbeddedImagesFromSvgaBuffer(buf);
    if (spriteBlobs.length > 0) {
      spriteBlobs.sort((a, b) => b.size - a.size);
      const topBlob = spriteBlobs[0];
      const url = URL.createObjectURL(topBlob);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('Failed to decode SVGA sprite'));
          el.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 96;
        const ctx = canvas.getContext('2d')!;
        const frame = drawFittedImageOnCanvas(
          ctx,
          img,
          img.naturalWidth || 96,
          img.naturalHeight || 96,
          96
        );
        return {
          fileName: file.name,
          fileType: 'svga',
          width: img.naturalWidth || 96,
          height: img.naturalHeight || 96,
          frames: [frame],
          previewDataUrl: canvas.toDataURL('image/jpeg', 0.85),
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return {
      fileName: file.name,
      fileType: 'svga',
      width: 0,
      height: 0,
      frames: [],
      previewDataUrl: '',
      textQuery: file.name.replace(/\.[^.]+$/, ''),
    };
  }

  // Standard image reference (PNG, JPG, WebP, GIF, BMP, SVG)
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Unsupported or corrupted reference image'));
      el.src = url;
    });
    const w = img.naturalWidth || 96;
    const h = img.naturalHeight || 96;
    const { frame, previewDataUrl } = extractRgbaFromCanvas(
      (ctx, dx, dy) => {
        const scale = Math.min(96 / Math.max(1, w), 96 / Math.max(1, h));
        ctx.drawImage(img, dx, dy, Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
      },
      w,
      h
    );
    return {
      fileName: file.name,
      fileType: 'image',
      width: w,
      height: h,
      frames: [frame],
      previewDataUrl,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------
// Local Desktop Agent HTTP Client (127.0.0.1:45200)
// ---------------------------------------------------------------------------

export function getSavedAgentToken(): string {
  try {
    return localStorage.getItem(LOCAL_AGENT_STORAGE_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function saveAgentToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem(LOCAL_AGENT_STORAGE_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(LOCAL_AGENT_STORAGE_TOKEN_KEY);
    }
  } catch {}
}

async function agentFetch<T>(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 6000);
  try {
    const headers: Record<string, string> = {};
    if (options.token) {
      headers['X-SVGA520-Token'] = options.token;
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${LOCAL_AGENT_BASE_URL}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { error: text || 'Invalid agent response' };
    }
    if (!res.ok) {
      throw new Error(json?.error || `Agent HTTP ${res.status}`);
    }
    return json as T;
  } finally {
    clearTimeout(timeout);
  }
}

export const LocalDesktopAgentClient = {
  async checkStatus(token?: string): Promise<AgentStatusResponse | null> {
    try {
      const status = await agentFetch<AgentStatusResponse>('/status', {
        method: 'GET',
        token: token ?? getSavedAgentToken(),
        timeoutMs: 2500,
      });
      if (!status || status.online !== true) return null;
      return status;
    } catch {
      return null;
    }
  },

  async pair(pairingCode: string): Promise<{ token: string }> {
    const res = await agentFetch<{ success: boolean; token: string }>('/pair', {
      method: 'POST',
      body: { pairingCode: pairingCode.trim() },
      timeoutMs: 5000,
    });
    if (!res.token) throw new Error('Agent did not return a pairing token');
    saveAgentToken(res.token);
    return { token: res.token };
  },

  async getFolders(token: string): Promise<AuthorizedFolderEntry[]> {
    const res = await agentFetch<{ folders: AuthorizedFolderEntry[] }>('/folders', {
      method: 'GET',
      token,
      timeoutMs: 5000,
    });
    return res.folders || [];
  },

  async pickFolderNative(token: string): Promise<{ added?: string; canceled?: boolean; folders: AuthorizedFolderEntry[] }> {
    return agentFetch('/folders/pick', {
      method: 'POST',
      token,
      body: {},
      timeoutMs: 120000, // User is choosing a folder in Windows Explorer dialog
    });
  },

  async addFolderPath(token: string, folderPath: string): Promise<{ added: string; folders: AuthorizedFolderEntry[] }> {
    return agentFetch('/folders/add', {
      method: 'POST',
      token,
      body: { path: folderPath },
      timeoutMs: 30000,
    });
  },

  async removeFolder(token: string, folderPath: string): Promise<{ folders: AuthorizedFolderEntry[] }> {
    return agentFetch('/folders/remove', {
      method: 'POST',
      token,
      body: { path: folderPath },
      timeoutMs: 10000,
    });
  },

  async rebuildIndex(token: string): Promise<{ indexedCount: number; durationMs: number }> {
    return agentFetch('/index/rebuild', {
      method: 'POST',
      token,
      body: {},
      timeoutMs: 120000,
    });
  },

  async search(
    token: string,
    payload: {
      queryFrames: VisualFeatureFrame[];
      textQuery?: string;
      formatFilter?: string;
      limit?: number;
    }
  ): Promise<LocalSearchResponse> {
    return agentFetch('/search', {
      method: 'POST',
      token,
      body: payload,
      timeoutMs: 30000,
    });
  },

  async openLocationInExplorer(token: string, filePath: string): Promise<{ success: boolean }> {
    return agentFetch('/open-location', {
      method: 'POST',
      token,
      body: { path: filePath },
      timeoutMs: 5000,
    });
  },

  async openFileInDefaultApp(token: string, filePath: string): Promise<{ success: boolean }> {
    return agentFetch('/open-file', {
      method: 'POST',
      token,
      body: { path: filePath },
      timeoutMs: 5000,
    });
  },

  async fetchLocalFile(token: string, filePath: string, fileName: string): Promise<File> {
    const res = await fetch(
      `${LOCAL_AGENT_BASE_URL}/file-stream?path=${encodeURIComponent(filePath)}`,
      {
        method: 'GET',
        headers: {
          'X-SVGA520-Token': token,
        },
      }
    );
    if (!res.ok) {
      throw new Error(`Failed to read local file (HTTP ${res.status})`);
    }
    const blob = await res.blob();
    return new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
  },
};

// ---------------------------------------------------------------------------
// Windows 10 & Windows 11 Native Local Desktop Agent Script Generators
// Runs strictly on 127.0.0.1:45200 with zero external dependencies (PowerShell + C# .NET)
// ---------------------------------------------------------------------------

/**
 * Generates the Windows 10/11 PowerShell + C# script (`SVGA520Agent.ps1`)
 * that implements the full local HTTP server, cryptographic pairing token,
 * Windows native FolderBrowserDialog, explorer.exe /select, zlib SVGA sprite
 * extraction, Windows Shell video thumbnail extraction, and local JSON index.
 */
export function generateWindowsPowerShellAgentScript(): string {
  return String.raw`# SVGA520 Local Desktop Agent for Windows 10 & Windows 11
# Runs strictly on http://127.0.0.1:45200 — No cloud uploads, zero external dependencies.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Web.Extensions
Add-Type -AssemblyName System.IO.Compression

$AgentDir = Join-Path $env:LOCALAPPDATA 'SVGA520LocalAgent'
if (-not (Test-Path $AgentDir)) {
  New-Item -ItemType Directory -Path $AgentDir -Force | Out-Null
}
$ConfigPath = Join-Path $AgentDir 'config.json'
$IndexPath  = Join-Path $AgentDir 'index.json'

$csharpSource = @'
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace Svga520LocalAgent
{
    public static class NativeThumbnails
    {
        [Flags]
        public enum SIIGBF : uint
        {
            SIIGBF_RESIZETOFIT = 0x00000000,
            SIIGBF_BIGGERSIZEOK = 0x00000001,
            SIIGBF_THUMBNAILONLY = 0x00000008
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct SIZE
        {
            public int cx;
            public int cy;
        }

        [ComImport]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        [Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
        public interface IShellItemImageFactory
        {
            [PreserveSig]
            int GetImage(SIZE size, SIIGBF flags, out IntPtr phbm);
        }

        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
        private static extern void SHCreateItemFromParsingName(
            [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
            IntPtr pbc,
            [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
            out IShellItemImageFactory ppv);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr hObject);

        public static Bitmap TryGetWindowsShellThumbnail(string filePath, int size)
        {
            IntPtr hBitmap = IntPtr.Zero;
            try
            {
                Guid factoryGuid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
                IShellItemImageFactory factory;
                SHCreateItemFromParsingName(filePath, IntPtr.Zero, factoryGuid, out factory);
                if (factory == null) return null;
                SIZE sz = new SIZE { cx = size, cy = size };
                int hr = factory.GetImage(sz, SIIGBF.SIIGBF_RESIZETOFIT | SIIGBF.SIIGBF_THUMBNAILONLY, out hBitmap);
                if (hr != 0 || hBitmap == IntPtr.Zero) return null;
                return Image.FromHbitmap(hBitmap);
            }
            catch
            {
                return null;
            }
            finally
            {
                if (hBitmap != IntPtr.Zero) DeleteObject(hBitmap);
            }
        }
    }

    public class VisualFeatureFrame
    {
        public string dHash { get; set; }
        public string aHash { get; set; }
        public List<int> colorGrid { get; set; }
        public List<int> colorHist { get; set; }
        public double aspectRatio { get; set; }
        public double foregroundRatio { get; set; }
    }

    public class IndexedGiftRecord
    {
        public string id { get; set; }
        public string name { get; set; }
        public string path { get; set; }
        public string folder { get; set; }
        public string format { get; set; }
        public long sizeBytes { get; set; }
        public string modifiedAt { get; set; }
        public int width { get; set; }
        public int height { get; set; }
        public List<VisualFeatureFrame> frames { get; set; }
        public string thumbnailDataUrl { get; set; }
        public List<string> tokens { get; set; }
    }

    public class FolderEntry
    {
        public string path { get; set; }
        public int fileCount { get; set; }
        public string addedAt { get; set; }
    }

    public class AgentConfig
    {
        public string token { get; set; }
        public string pairingCode { get; set; }
        public List<string> allowedFolders { get; set; }
    }

    public class AgentIndexStore
    {
        public string lastIndexedAt { get; set; }
        public long lastScanDurationMs { get; set; }
        public List<IndexedGiftRecord> items { get; set; }
    }

    public class ServerEngine
    {
        private readonly string _configPath;
        private readonly string _indexPath;
        private readonly JavaScriptSerializer _json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        private readonly object _sync = new object();
        private AgentConfig _config;
        private AgentIndexStore _index;
        private bool _isIndexing = false;

        private static readonly HashSet<string> SupportedExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".svga", ".pag", ".vap", ".yyeva", ".mp4", ".mov", ".webm",
            ".gif", ".webp", ".apng", ".png", ".jpg", ".jpeg", ".lottie", ".json"
        };

        public ServerEngine(string configPath, string indexPath)
        {
            _configPath = configPath;
            _indexPath = indexPath;
            LoadOrInitState();
        }

        private static string GenerateHexToken(int byteLen)
        {
            byte[] buf = new byte[byteLen];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(buf);
            var sb = new StringBuilder(byteLen * 2);
            foreach (byte b in buf) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        private static string GeneratePairingPin()
        {
            byte[] buf = new byte[4];
            using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(buf);
            uint val = BitConverter.ToUInt32(buf, 0) % 900000 + 100000;
            return val.ToString();
        }

        private void LoadOrInitState()
        {
            if (File.Exists(_configPath))
            {
                try
                {
                    _config = _json.Deserialize<AgentConfig>(File.ReadAllText(_configPath, Encoding.UTF8));
                }
                catch { _config = null; }
            }
            if (_config == null) _config = new AgentConfig();
            if (string.IsNullOrEmpty(_config.token)) _config.token = GenerateHexToken(24);
            if (string.IsNullOrEmpty(_config.pairingCode)) _config.pairingCode = GeneratePairingPin();
            if (_config.allowedFolders == null) _config.allowedFolders = new List<string>();
            SaveConfig();

            if (File.Exists(_indexPath))
            {
                try
                {
                    _index = _json.Deserialize<AgentIndexStore>(File.ReadAllText(_indexPath, Encoding.UTF8));
                }
                catch { _index = null; }
            }
            if (_index == null) _index = new AgentIndexStore { items = new List<IndexedGiftRecord>() };
            if (_index.items == null) _index.items = new List<IndexedGiftRecord>();
        }

        private void SaveConfig()
        {
            File.WriteAllText(_configPath, _json.Serialize(_config), Encoding.UTF8);
        }

        private void SaveIndex()
        {
            File.WriteAllText(_indexPath, _json.Serialize(_index), Encoding.UTF8);
        }

        public string GetPairingPin() { return _config.pairingCode; }
        public string GetToken() { return _config.token; }

        private bool IsPathAuthorized(string targetPath)
        {
            if (string.IsNullOrWhiteSpace(targetPath)) return false;
            try
            {
                string fullTarget = Path.GetFullPath(targetPath).TrimEnd('\\');
                lock (_sync)
                {
                    foreach (string rawFolder in _config.allowedFolders)
                    {
                        if (string.IsNullOrWhiteSpace(rawFolder)) continue;
                        string fullFolder = Path.GetFullPath(rawFolder).TrimEnd('\\');
                        if (string.Equals(fullTarget, fullFolder, StringComparison.OrdinalIgnoreCase)) return true;
                        if (fullTarget.StartsWith(fullFolder + "\\", StringComparison.OrdinalIgnoreCase)) return true;
                    }
                }
            }
            catch { return false; }
            return false;
        }

        private static string PickFolderWithWindowsDialog()
        {
            string selected = null;
            var t = new Thread(() =>
            {
                using (var dlg = new FolderBrowserDialog())
                {
                    dlg.Description = "Choose a local Gifts folder to authorize SVGA520 AI Gift Finder";
                    dlg.ShowNewFolderButton = false;
                    using (var form = new Form { TopMost = true, Width = 1, Height = 1, StartPosition = FormStartPosition.Manual, Location = new Point(-2000, -2000) })
                    {
                        form.Show();
                        form.Activate();
                        if (dlg.ShowDialog(form) == DialogResult.OK)
                        {
                            selected = dlg.SelectedPath;
                        }
                    }
                }
            });
            t.SetApartmentState(ApartmentState.STA);
            t.Start();
            t.Join();
            return selected;
        }

        private static Bitmap TryExtractSvgaEmbeddedBitmap(string svgaPath)
        {
            try
            {
                byte[] raw = File.ReadAllBytes(svgaPath);
                byte[] data = raw;
                if (raw.Length > 2 && raw[0] == 0x78)
                {
                    using (var msIn = new MemoryStream(raw, 2, raw.Length - 2))
                    using (var df = new DeflateStream(msIn, CompressionMode.Decompress))
                    using (var msOut = new MemoryStream())
                    {
                        df.CopyTo(msOut);
                        data = msOut.ToArray();
                    }
                }
                Bitmap best = null;
                int bestArea = 0;
                int found = 0;
                for (int i = 0; i < data.Length - 24; i++)
                {
                    if (data[i] == 0x89 && data[i + 1] == 0x50 && data[i + 2] == 0x4E && data[i + 3] == 0x47 &&
                        data[i + 4] == 0x0D && data[i + 5] == 0x0A && data[i + 6] == 0x1A && data[i + 7] == 0x0A)
                    {
                        int end = -1;
                        for (int j = i + 8; j < data.Length - 7; j++)
                        {
                            if (data[j] == 0x49 && data[j + 1] == 0x45 && data[j + 2] == 0x4E && data[j + 3] == 0x44 &&
                                data[j + 4] == 0xAE && data[j + 5] == 0x42 && data[j + 6] == 0x60 && data[j + 7] == 0x82)
                            {
                                end = j + 8;
                                break;
                            }
                        }
                        if (end > i + 24)
                        {
                            try
                            {
                                using (var pngMs = new MemoryStream(data, i, end - i))
                                using (var bmp = new Bitmap(pngMs))
                                {
                                    int area = bmp.Width * bmp.Height;
                                    if (area > bestArea)
                                    {
                                        if (best != null) best.Dispose();
                                        best = new Bitmap(bmp);
                                        bestArea = area;
                                    }
                                }
                            }
                            catch { }
                            found++;
                            i = end - 1;
                            if (found >= 6) break;
                        }
                    }
                }
                return best;
            }
            catch { return null; }
        }

        private static string BitsToHex64(int[] bits)
        {
            var sb = new StringBuilder(16);
            for (int n = 0; n < 16; n++)
            {
                int val = 0;
                for (int b = 0; b < 4; b++)
                {
                    if (bits[n * 4 + b] != 0) val |= (1 << (3 - b));
                }
                sb.Append(val.ToString("x"));
            }
            return sb.ToString();
        }

        private static VisualFeatureFrame ComputeFeaturesFromBitmap(Bitmap src, int origW, int origH, out string thumbDataUrl)
        {
            const int thumbSize = 96;
            using (var thumb = new Bitmap(thumbSize, thumbSize, PixelFormat.Format32bppArgb))
            using (var g = Graphics.FromImage(thumb))
            {
                g.Clear(Color.FromArgb(255, 11, 14, 26));
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                double scale = Math.Min((double)thumbSize / Math.Max(1, src.Width), (double)thumbSize / Math.Max(1, src.Height));
                int dw = Math.Max(1, (int)Math.Round(src.Width * scale));
                int dh = Math.Max(1, (int)Math.Round(src.Height * scale));
                int dx = (thumbSize - dw) / 2;
                int dy = (thumbSize - dh) / 2;
                g.DrawImage(src, dx, dy, dw, dh);

                using (var ms = new MemoryStream())
                {
                    thumb.Save(ms, ImageFormat.Jpeg);
                    thumbDataUrl = "data:image/jpeg;base64," + Convert.ToBase64String(ms.ToArray());
                }

                // 9x8 dHash
                double[] luma9x8 = new double[72];
                for (int y = 0; y < 8; y++)
                {
                    for (int x = 0; x < 9; x++)
                    {
                        Color c = thumb.GetPixel(Math.Min(thumbSize - 1, x * 11 + 4), Math.Min(thumbSize - 1, y * 12 + 5));
                        luma9x8[y * 9 + x] = 0.299 * c.R + 0.587 * c.G + 0.114 * c.B;
                    }
                }
                int[] dBits = new int[64];
                for (int y = 0; y < 8; y++)
                {
                    for (int x = 0; x < 8; x++)
                    {
                        dBits[y * 8 + x] = luma9x8[y * 9 + x] > luma9x8[y * 9 + x + 1] ? 1 : 0;
                    }
                }

                // 8x8 color grid + aHash + 24-bin hist
                var colorGrid = new List<int>(192);
                int[] hist = new int[24];
                double[] luma8x8 = new double[64];
                double lumaSum = 0;
                int activeCount = 0;
                for (int y = 0; y < 8; y++)
                {
                    for (int x = 0; x < 8; x++)
                    {
                        Color c = thumb.GetPixel(x * 12 + 5, y * 12 + 5);
                        colorGrid.Add(c.R);
                        colorGrid.Add(c.G);
                        colorGrid.Add(c.B);
                        double lm = 0.299 * c.R + 0.587 * c.G + 0.114 * c.B;
                        luma8x8[y * 8 + x] = lm;
                        lumaSum += lm;
                        if (c.R + c.G + c.B > 48)
                        {
                            hist[Math.Min(7, c.R >> 5)]++;
                            hist[8 + Math.Min(7, c.G >> 5)]++;
                            hist[16 + Math.Min(7, c.B >> 5)]++;
                            activeCount++;
                        }
                    }
                }
                double mean = lumaSum / 64.0;
                int[] aBits = new int[64];
                for (int i = 0; i < 64; i++) aBits[i] = luma8x8[i] >= mean ? 1 : 0;
                int denom = Math.Max(1, activeCount);
                var histList = new List<int>(24);
                for (int i = 0; i < 24; i++) histList.Add((int)Math.Round((hist[i] * 1000.0) / denom));

                return new VisualFeatureFrame
                {
                    dHash = BitsToHex64(dBits),
                    aHash = BitsToHex64(aBits),
                    colorGrid = colorGrid,
                    colorHist = histList,
                    aspectRatio = origH > 0 ? Math.Round((double)origW / origH, 3) : 1.0,
                    foregroundRatio = Math.Round((double)activeCount / 64.0, 3)
                };
            }
        }

        private static List<string> TokenizeName(string name)
        {
            var list = new List<string>();
            string baseName = Path.GetFileNameWithoutExtension(name ?? "");
            var sb = new StringBuilder();
            foreach (char ch in baseName.ToLowerInvariant())
            {
                if (char.IsLetterOrDigit(ch)) sb.Append(ch);
                else
                {
                    if (sb.Length >= 2) list.Add(sb.ToString());
                    sb.Clear();
                }
            }
            if (sb.Length >= 2) list.Add(sb.ToString());
            return list;
        }

        private int RebuildIndexInternal()
        {
            lock (_sync)
            {
                if (_isIndexing) return _index.items.Count;
                _isIndexing = true;
            }
            var sw = Stopwatch.StartNew();
            var nextItems = new List<IndexedGiftRecord>();
            List<string> foldersCopy;
            lock (_sync) { foldersCopy = new List<string>(_config.allowedFolders); }

            try
            {
                foreach (string folder in foldersCopy)
                {
                    if (!Directory.Exists(folder)) continue;
                    IEnumerable<string> files;
                    try
                    {
                        files = Directory.EnumerateFiles(folder, "*.*", SearchOption.AllDirectories);
                    }
                    catch { continue; }

                    foreach (string filePath in files)
                    {
                        string ext = Path.GetExtension(filePath);
                        if (!SupportedExts.Contains(ext)) continue;

                        try
                        {
                            var fi = new FileInfo(filePath);
                            Bitmap bmp = null;
                            if (ext.Equals(".png", StringComparison.OrdinalIgnoreCase) ||
                                ext.Equals(".jpg", StringComparison.OrdinalIgnoreCase) ||
                                ext.Equals(".jpeg", StringComparison.OrdinalIgnoreCase) ||
                                ext.Equals(".gif", StringComparison.OrdinalIgnoreCase) ||
                                ext.Equals(".bmp", StringComparison.OrdinalIgnoreCase))
                            {
                                try { bmp = new Bitmap(filePath); } catch { bmp = null; }
                            }
                            else if (ext.Equals(".svga", StringComparison.OrdinalIgnoreCase))
                            {
                                bmp = TryExtractSvgaEmbeddedBitmap(filePath);
                            }

                            if (bmp == null)
                            {
                                bmp = NativeThumbnails.TryGetWindowsShellThumbnail(filePath, 160);
                            }

                            int w = 0, h = 0;
                            string thumbUrl = "";
                            var frames = new List<VisualFeatureFrame>();
                            if (bmp != null)
                            {
                                w = bmp.Width;
                                h = bmp.Height;
                                frames.Add(ComputeFeaturesFromBitmap(bmp, w, h, out thumbUrl));
                                bmp.Dispose();
                            }

                            nextItems.Add(new IndexedGiftRecord
                            {
                                id = Convert.ToBase64String(Encoding.UTF8.GetBytes(filePath)),
                                name = fi.Name,
                                path = fi.FullName,
                                folder = folder,
                                format = ext.TrimStart('.').ToUpperInvariant(),
                                sizeBytes = fi.Length,
                                modifiedAt = fi.LastWriteTimeUtc.ToString("o"),
                                width = w,
                                height = h,
                                frames = frames,
                                thumbnailDataUrl = thumbUrl,
                                tokens = TokenizeName(fi.Name)
                            });
                        }
                        catch { }
                    }
                }

                sw.Stop();
                lock (_sync)
                {
                    _index.items = nextItems;
                    _index.lastIndexedAt = DateTime.UtcNow.ToString("o");
                    _index.lastScanDurationMs = sw.ElapsedMilliseconds;
                    SaveIndex();
                }
                return nextItems.Count;
            }
            finally
            {
                lock (_sync) { _isIndexing = false; }
            }
        }

        private static int HammingHex(string a, string b)
        {
            if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b) || a.Length != b.Length) return 64;
            int dist = 0;
            for (int i = 0; i < a.Length; i++)
            {
                int va = Convert.ToInt32(a.Substring(i, 1), 16);
                int vb = Convert.ToInt32(b.Substring(i, 1), 16);
                int x = va ^ vb;
                while (x > 0) { dist += x & 1; x >>= 1; }
            }
            return dist;
        }

        private static double CosineSim(List<int> a, List<int> b)
        {
            if (a == null || b == null || a.Count == 0 || a.Count != b.Count) return 0;
            double dot = 0, na = 0, nb = 0;
            for (int i = 0; i < a.Count; i++)
            {
                dot += a[i] * (double)b[i];
                na += a[i] * (double)a[i];
                nb += b[i] * (double)b[i];
            }
            if (na == 0 || nb == 0) return 0;
            return Math.Max(0, Math.Min(1, dot / (Math.Sqrt(na) * Math.Sqrt(nb))));
        }

        private static double HistIntersection(List<int> a, List<int> b)
        {
            if (a == null || b == null || a.Count != 24 || b.Count != 24) return 0;
            double mn = 0, mx = 0;
            for (int i = 0; i < 24; i++)
            {
                mn += Math.Min(a[i], b[i]);
                mx += Math.Max(a[i], b[i]);
            }
            return mx > 0 ? Math.Max(0, Math.Min(1, mn / mx)) : 0;
        }

        private List<FolderEntry> BuildFolderList()
        {
            var result = new List<FolderEntry>();
            lock (_sync)
            {
                foreach (string f in _config.allowedFolders)
                {
                    int cnt = 0;
                    foreach (var it in _index.items)
                    {
                        if (string.Equals(it.folder, f, StringComparison.OrdinalIgnoreCase)) cnt++;
                    }
                    result.Add(new FolderEntry { path = f, fileCount = cnt, addedAt = DateTime.UtcNow.ToString("o") });
                }
            }
            return result;
        }

        private void WriteJson(HttpListenerResponse res, int status, object data)
        {
            res.StatusCode = status;
            res.ContentType = "application/json; charset=utf-8";
            byte[] bytes = Encoding.UTF8.GetBytes(_json.Serialize(data));
            res.ContentLength64 = bytes.Length;
            res.OutputStream.Write(bytes, 0, bytes.Length);
        }

        public void Run(int port)
        {
            var listener = new HttpListener();
            string p1 = "http://127.0.0.1:" + port + "/";
            string p2 = "http://localhost:" + port + "/";
            try
            {
                listener.Prefixes.Add(p1);
                listener.Prefixes.Add(p2);
                listener.Start();
            }
            catch
            {
                listener = new HttpListener();
                try
                {
                    listener.Prefixes.Add(p1);
                    listener.Start();
                }
                catch
                {
                    listener = new HttpListener();
                    listener.Prefixes.Add(p2);
                    listener.Start();
                }
            }

            while (true)
            {
                HttpListenerContext ctx = listener.GetContext();
                ThreadPool.QueueUserWorkItem(_ => HandleContext(ctx));
            }
        }

        private void HandleContext(HttpListenerContext ctx)
        {
            var req = ctx.Request;
            var res = ctx.Response;
            try
            {
                string origin = req.Headers["Origin"];
                if (!string.IsNullOrEmpty(origin))
                {
                    res.Headers["Access-Control-Allow-Origin"] = origin;
                    res.Headers["Vary"] = "Origin";
                }
                else
                {
                    res.Headers["Access-Control-Allow-Origin"] = "*";
                }
                res.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
                res.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-SVGA520-Token";
                res.Headers["Access-Control-Allow-Private-Network"] = "true";

                if (req.HttpMethod == "OPTIONS")
                {
                    res.StatusCode = 204;
                    res.Close();
                    return;
                }

                string path = req.Url.AbsolutePath.TrimEnd('/');
                if (string.IsNullOrEmpty(path)) path = "/";

                string clientToken = req.Headers["X-SVGA520-Token"] ?? "";
                bool isAuth = string.Equals(clientToken, _config.token, StringComparison.Ordinal);

                if (path == "/status" && req.HttpMethod == "GET")
                {
                    lock (_sync)
                    {
                        WriteJson(res, 200, new
                        {
                            online = true,
                            version = "1.0.0",
                            os = "Windows 10/11",
                            requiresPairing = true,
                            paired = isAuth,
                            folderCount = _config.allowedFolders.Count,
                            indexedCount = _index.items.Count,
                            isIndexing = _isIndexing,
                            lastIndexedAt = _index.lastIndexedAt,
                            lastScanDurationMs = _index.lastScanDurationMs
                        });
                    }
                    res.Close();
                    return;
                }

                string bodyStr = "";
                if (req.HttpMethod == "POST")
                {
                    using (var sr = new StreamReader(req.InputStream, Encoding.UTF8)) bodyStr = sr.ReadToEnd();
                }

                if (path == "/pair" && req.HttpMethod == "POST")
                {
                    var payload = _json.Deserialize<Dictionary<string, object>>(bodyStr) ?? new Dictionary<string, object>();
                    string pin = payload.ContainsKey("pairingCode") ? Convert.ToString(payload["pairingCode"]).Trim() : "";
                    if (string.Equals(pin, _config.pairingCode, StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(pin, _config.token, StringComparison.Ordinal))
                    {
                        WriteJson(res, 200, new { success = true, token = _config.token });
                    }
                    else
                    {
                        WriteJson(res, 403, new { error = "Invalid Pairing Code. Check the PIN displayed in the Windows Local Agent window." });
                    }
                    res.Close();
                    return;
                }

                if (!isAuth)
                {
                    WriteJson(res, 401, new { error = "Unauthorized: valid pairing token required." });
                    res.Close();
                    return;
                }

                if (path == "/folders" && req.HttpMethod == "GET")
                {
                    WriteJson(res, 200, new { folders = BuildFolderList() });
                }
                else if (path == "/folders/pick" && req.HttpMethod == "POST")
                {
                    string picked = PickFolderWithWindowsDialog();
                    if (string.IsNullOrEmpty(picked))
                    {
                        WriteJson(res, 200, new { canceled = true, folders = BuildFolderList() });
                    }
                    else
                    {
                        string full = Path.GetFullPath(picked).TrimEnd('\\');
                        lock (_sync)
                        {
                            if (!_config.allowedFolders.Exists(f => string.Equals(f, full, StringComparison.OrdinalIgnoreCase)))
                            {
                                _config.allowedFolders.Add(full);
                                SaveConfig();
                            }
                        }
                        RebuildIndexInternal();
                        WriteJson(res, 200, new { added = full, folders = BuildFolderList() });
                    }
                }
                else if (path == "/folders/add" && req.HttpMethod == "POST")
                {
                    var payload = _json.Deserialize<Dictionary<string, object>>(bodyStr) ?? new Dictionary<string, object>();
                    string rawPath = payload.ContainsKey("path") ? Convert.ToString(payload["path"]).Trim() : "";
                    if (string.IsNullOrEmpty(rawPath) || !Directory.Exists(rawPath))
                    {
                        WriteJson(res, 400, new { error = "Folder path does not exist on this PC." });
                    }
                    else
                    {
                        string full = Path.GetFullPath(rawPath).TrimEnd('\\');
                        lock (_sync)
                        {
                            if (!_config.allowedFolders.Exists(f => string.Equals(f, full, StringComparison.OrdinalIgnoreCase)))
                            {
                                _config.allowedFolders.Add(full);
                                SaveConfig();
                            }
                        }
                        RebuildIndexInternal();
                        WriteJson(res, 200, new { added = full, folders = BuildFolderList() });
                    }
                }
                else if (path == "/folders/remove" && req.HttpMethod == "POST")
                {
                    var payload = _json.Deserialize<Dictionary<string, object>>(bodyStr) ?? new Dictionary<string, object>();
                    string rawPath = payload.ContainsKey("path") ? Convert.ToString(payload["path"]).Trim() : "";
                    string full = string.IsNullOrEmpty(rawPath) ? "" : Path.GetFullPath(rawPath).TrimEnd('\\');
                    lock (_sync)
                    {
                        _config.allowedFolders.RemoveAll(f => string.Equals(f, full, StringComparison.OrdinalIgnoreCase));
                        _index.items.RemoveAll(it => string.Equals(it.folder, full, StringComparison.OrdinalIgnoreCase));
                        SaveConfig();
                        SaveIndex();
                    }
                    WriteJson(res, 200, new { folders = BuildFolderList() });
                }
                else if (path == "/index/rebuild" && req.HttpMethod == "POST")
                {
                    int cnt = RebuildIndexInternal();
                    WriteJson(res, 200, new { indexedCount = cnt, durationMs = _index.lastScanDurationMs });
                }
                else if (path == "/search" && req.HttpMethod == "POST")
                {
                    var sw = Stopwatch.StartNew();
                    var qPayload = _json.Deserialize<Dictionary<string, object>>(bodyStr) ?? new Dictionary<string, object>();
                    var qFrames = new List<VisualFeatureFrame>();
                    if (qPayload.ContainsKey("queryFrames") && qPayload["queryFrames"] is ArrayList arr)
                    {
                        foreach (var obj in arr)
                        {
                            var map = obj as Dictionary<string, object>;
                            if (map == null) continue;
                            var vf = new VisualFeatureFrame
                            {
                                dHash = map.ContainsKey("dHash") ? Convert.ToString(map["dHash"]) : "",
                                aHash = map.ContainsKey("aHash") ? Convert.ToString(map["aHash"]) : "",
                                aspectRatio = map.ContainsKey("aspectRatio") ? Convert.ToDouble(map["aspectRatio"]) : 1.0,
                                colorGrid = new List<int>(),
                                colorHist = new List<int>()
                            };
                            if (map.ContainsKey("colorGrid") && map["colorGrid"] is ArrayList cg)
                                foreach (var x in cg) vf.colorGrid.Add(Convert.ToInt32(x));
                            if (map.ContainsKey("colorHist") && map["colorHist"] is ArrayList ch)
                                foreach (var x in ch) vf.colorHist.Add(Convert.ToInt32(x));
                            qFrames.Add(vf);
                        }
                    }
                    string textQuery = qPayload.ContainsKey("textQuery") ? Convert.ToString(qPayload["textQuery"]) : "";
                    string fmtFilter = qPayload.ContainsKey("formatFilter") ? Convert.ToString(qPayload["formatFilter"]).ToUpperInvariant() : "ALL";
                    int limit = qPayload.ContainsKey("limit") ? Math.Max(1, Math.Min(100, Convert.ToInt32(qPayload["limit"]))) : 36;
                    List<string> qTokens = TokenizeName(textQuery);

                    List<IndexedGiftRecord> snapshot;
                    lock (_sync) { snapshot = new List<IndexedGiftRecord>(_index.items); }

                    var scored = new List<Dictionary<string, object>>();
                    foreach (var cand in snapshot)
                    {
                        if (fmtFilter != "ALL" && !string.Equals(cand.format, fmtFilter, StringComparison.OrdinalIgnoreCase)) continue;
                        double bestVis = 0, bestVh = 0, bestSc = 0, bestHi = 0, bestAs = 0;
                        if (qFrames.Count > 0 && cand.frames != null)
                        {
                            foreach (var qf in qFrames)
                            {
                                foreach (var cf in cand.frames)
                                {
                                    double vh = (1.0 - HammingHex(qf.dHash, cf.dHash) / 64.0) * 0.62 + (1.0 - HammingHex(qf.aHash, cf.aHash) / 64.0) * 0.38;
                                    double sc = CosineSim(qf.colorGrid, cf.colorGrid);
                                    double hi = HistIntersection(qf.colorHist, cf.colorHist);
                                    double mx = Math.Max(qf.aspectRatio > 0 ? qf.aspectRatio : 1, cf.aspectRatio > 0 ? cf.aspectRatio : 1);
                                    double mn = Math.Min(qf.aspectRatio > 0 ? qf.aspectRatio : 1, cf.aspectRatio > 0 ? cf.aspectRatio : 1);
                                    double ar = mx > 0 ? mn / mx : 1;
                                    double comb = vh * 0.44 + sc * 0.31 + hi * 0.17 + ar * 0.08;
                                    if (comb > bestVis) { bestVis = comb; bestVh = vh; bestSc = sc; bestHi = hi; bestAs = ar; }
                                }
                            }
                        }

                        double txtScore = 0;
                        if (qTokens.Count > 0)
                        {
                            string hay = (cand.name + " " + cand.folder + " " + cand.format).ToLowerInvariant();
                            int hits = 0;
                            foreach (var tk in qTokens) if (hay.Contains(tk)) hits++;
                            txtScore = (double)hits / qTokens.Count;
                        }
                        double finalRatio = qFrames.Count == 0 && qTokens.Count > 0 ? txtScore : (qTokens.Count > 0 ? bestVis * 0.8 + txtScore * 0.2 : bestVis);
                        int pct = Math.Max(0, Math.Min(100, (int)Math.Round(finalRatio * 100)));
                        scored.Add(new Dictionary<string, object>
                        {
                            { "id", cand.id },
                            { "name", cand.name },
                            { "path", cand.path },
                            { "folder", cand.folder },
                            { "format", cand.format },
                            { "sizeBytes", cand.sizeBytes },
                            { "modifiedAt", cand.modifiedAt },
                            { "width", cand.width },
                            { "height", cand.height },
                            { "thumbnailDataUrl", cand.thumbnailDataUrl },
                            { "score", pct },
                            { "matchBreakdown", new Dictionary<string, int> {
                                { "visualHashScore", (int)Math.Round(bestVh * 100) },
                                { "spatialColorScore", (int)Math.Round(bestSc * 100) },
                                { "histogramScore", (int)Math.Round(bestHi * 100) },
                                { "aspectScore", (int)Math.Round(bestAs * 100) },
                                { "textScore", (int)Math.Round(txtScore * 100) }
                            }}
                        });
                    }
                    scored.Sort((a, b) => Convert.ToInt32(b["score"]).CompareTo(Convert.ToInt32(a["score"])));
                    if (scored.Count > limit) scored.RemoveRange(limit, scored.Count - limit);
                    sw.Stop();
                    WriteJson(res, 200, new { results = scored, searchedCount = snapshot.Count, durationMs = sw.ElapsedMilliseconds });
                }
                else if (path == "/open-location" && req.HttpMethod == "POST")
                {
                    var payload = _json.Deserialize<Dictionary<string, object>>(bodyStr) ?? new Dictionary<string, object>();
                    string target = payload.ContainsKey("path") ? Convert.ToString(payload["path"]) : "";
                    if (!IsPathAuthorized(target) || !File.Exists(target))
                    {
                        WriteJson(res, 403, new { error = "Access denied: path outside authorized folders." });
                    }
                    else
                    {
                        Process.Start("explorer.exe", "/select,\"" + target + "\"");
                        WriteJson(res, 200, new { success = true });
                    }
                }
                else if (path == "/open-file" && req.HttpMethod == "POST")
                {
                    var payload = _json.Deserialize<Dictionary<string, object>>(bodyStr) ?? new Dictionary<string, object>();
                    string target = payload.ContainsKey("path") ? Convert.ToString(payload["path"]) : "";
                    if (!IsPathAuthorized(target) || !File.Exists(target))
                    {
                        WriteJson(res, 403, new { error = "Access denied: path outside authorized folders." });
                    }
                    else
                    {
                        Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
                        WriteJson(res, 200, new { success = true });
                    }
                }
                else if (path == "/file-stream" && req.HttpMethod == "GET")
                {
                    string target = req.QueryString["path"] ?? "";
                    if (!IsPathAuthorized(target) || !File.Exists(target))
                    {
                        WriteJson(res, 403, new { error = "Access denied: path outside authorized folders." });
                    }
                    else
                    {
                        byte[] bytes = File.ReadAllBytes(target);
                        res.StatusCode = 200;
                        res.ContentType = "application/octet-stream";
                        res.ContentLength64 = bytes.Length;
                        res.OutputStream.Write(bytes, 0, bytes.Length);
                    }
                }
                else
                {
                    WriteJson(res, 404, new { error = "Unknown endpoint" });
                }
            }
            catch (Exception ex)
            {
                try { WriteJson(res, 500, new { error = ex.Message }); } catch { }
            }
            finally
            {
                try { res.Close(); } catch { }
            }
        }
    }
}
'@

Add-Type -TypeDefinition $csharpSource -ReferencedAssemblies @(
    'System.Drawing.dll',
    'System.Windows.Forms.dll',
    'System.Web.Extensions.dll',
    'System.IO.Compression.dll'
)

$engine = New-Object Svga520LocalAgent.ServerEngine($ConfigPath, $IndexPath)
$pin = $engine.GetPairingPin()

Clear-Host
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  SVGA520 Local Desktop Agent (Windows 10 / Windows 11)" -ForegroundColor White
Write-Host "  Running strictly on http://127.0.0.1:${LOCAL_AGENT_PORT}" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  PAIRING CODE (PIN):  $pin" -ForegroundColor Yellow
Write-Host ""
Write-Host "  - All file indexing & visual AI comparisons stay on this PC." -ForegroundColor Gray
Write-Host "  - Keep this window open while using AI Gift Finder on SVGA520." -ForegroundColor Gray
Write-Host "=================================================================" -ForegroundColor Cyan

$engine.Run(${LOCAL_AGENT_PORT})
`;
}

/**
 * Generates a one-click Windows 10/11 `.bat` installer & launcher script.
 * Embeds the UTF-8 PowerShell agent script as clean Base64 so there are zero
 * batch escaping issues and creates a Desktop shortcut on first run.
 */
export function generateWindowsBatchInstaller(): string {
  const ps1Content = generateWindowsPowerShellAgentScript();
  const utf8Bytes = new TextEncoder().encode(ps1Content);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  const b64 = btoa(binary);
  const b64Lines = b64.match(/.{1,120}/g) || [b64];

  return [
    '@echo off',
    'title SVGA520 Local Desktop Agent Installer & Launcher',
    'color 0B',
    'echo ============================================================',
    'echo   SVGA520 AI Gift Finder - Windows 10 / 11 Local Agent',
    'echo ============================================================',
    'echo.',
    'set "AGENT_DIR=%LOCALAPPDATA%\\SVGA520LocalAgent"',
    'if not exist "%AGENT_DIR%" mkdir "%AGENT_DIR%"',
    'set "PS1_FILE=%AGENT_DIR%\\SVGA520Agent.ps1"',
    'echo Installing local agent to %AGENT_DIR% ...',
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "$raw = Get-Content -LiteralPath '%~f0' -Raw; $parts = $raw -split '::___PAYLOAD_BEGIN___', 2; $b = ($parts[1] -replace '\\s',''); [System.IO.File]::WriteAllBytes('%PS1_FILE%', [System.Convert]::FromBase64String($b))"`,
    'if errorlevel 1 (',
    '  echo Failed to extract local agent script.',
    '  pause',
    '  exit /b 1',
    ')',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut([Environment]::GetFolderPath(\'Desktop\') + \'\\SVGA520 Local Agent.lnk\'); $sc.TargetPath = \'powershell.exe\'; $sc.Arguments = \'-NoProfile -ExecutionPolicy Bypass -File \"\' + $env:LOCALAPPDATA + \'\\SVGA520LocalAgent\\SVGA520Agent.ps1\"\'; $sc.WorkingDirectory = $env:LOCALAPPDATA + \'\\SVGA520LocalAgent\'; $sc.Save()"',
    'echo Starting SVGA520 Local Agent on http://127.0.0.1:45200 ...',
    'powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1_FILE%"',
    'pause',
    'exit /b 0',
    '::___PAYLOAD_BEGIN___',
    ...b64Lines,
  ].join('\r\n');
}
