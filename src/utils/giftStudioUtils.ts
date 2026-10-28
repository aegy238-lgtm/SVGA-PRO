export interface TiledWatermarkConfig {
  enabled: boolean;
  text: string;
  opacity: number; // 0.05 to 1.0
  color: string; // hex e.g. '#ffffff'
  accentColor: string; // hex e.g. '#a855f7'
  columns: number; // number of grid squares across width (e.g. 3 or 4)
  angleDeg: number; // text angle inside each square (e.g. -24)
  showGridLines: boolean;
  showDiagonalLine: boolean;
}

export interface GridCellLayout {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  fontSize: number;
}

export const DEFAULT_TILED_WATERMARK_CONFIG: TiledWatermarkConfig = {
  enabled: false,
  text: 'SVGA PRO Ahmed',
  opacity: 0.38,
  color: '#ffffff',
  accentColor: '#a855f7',
  columns: 3,
  angleDeg: -22,
  showGridLines: true,
  showDiagonalLine: true,
};

/**
 * Computes a full-coverage grid of squares across the entire gift dimensions (W x H).
 */
export function computeTiledWatermarkGrid(
  width: number,
  height: number,
  config: Partial<TiledWatermarkConfig> = {}
): GridCellLayout[] {
  const safeW = Math.max(1, Math.round(width));
  const safeH = Math.max(1, Math.round(height));
  const cols = Math.max(2, Math.min(8, Math.round(config.columns || DEFAULT_TILED_WATERMARK_CONFIG.columns)));
  const cellW = safeW / cols;
  const rows = Math.max(2, Math.round(safeH / cellW));
  const cellH = safeH / rows;
  const textLen = Math.max(4, (config.text || DEFAULT_TILED_WATERMARK_CONFIG.text).trim().length);

  // Calculate a crisp font size that fits comfortably inside each square cell
  const diag = Math.hypot(cellW, cellH);
  const rawFont = Math.min(cellW * 0.22, (diag * 0.72) / Math.max(6, textLen * 0.58));
  const fontSize = Math.max(10, Math.min(64, Math.round(rawFont)));

  const cells: GridCellLayout[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cellW;
      const y = r * cellH;
      cells.push({
        row: r,
        col: c,
        x,
        y,
        width: cellW,
        height: cellH,
        centerX: x + cellW / 2,
        centerY: y + cellH / 2,
        fontSize,
      });
    }
  }
  return cells;
}

/**
 * Renders the full-coverage tiled square grid watermark with lines and brand name onto a 2D canvas.
 */
export function drawTiledGiftWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rawConfig: Partial<TiledWatermarkConfig> = {}
): void {
  const cfg: TiledWatermarkConfig = {
    ...DEFAULT_TILED_WATERMARK_CONFIG,
    ...rawConfig,
  };
  if (!cfg.enabled) return;
  const label = (cfg.text || '').trim() || DEFAULT_TILED_WATERMARK_CONFIG.text;
  if (!label || width <= 4 || height <= 4) return;

  const cells = computeTiledWatermarkGrid(width, height, cfg);
  const alpha = Math.max(0.05, Math.min(1, Number(cfg.opacity) || 0.38));
  const angleRad = ((Number(cfg.angleDeg) || -22) * Math.PI) / 180;
  const lineScale = Math.max(1, Math.min(width, height) / 360);

  ctx.save();
  ctx.globalAlpha = alpha;

  // 1. Draw interlocking square grid borders across the entire gift canvas
  if (cfg.showGridLines !== false) {
    ctx.strokeStyle = cfg.color || '#ffffff';
    ctx.lineWidth = Math.max(1, 1.15 * lineScale);
    for (const cell of cells) {
      ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.width - 1, cell.height - 1);

      // Subtle inner corner brackets for a refined security-grid aesthetic
      const corner = Math.min(cell.width, cell.height) * 0.12;
      ctx.beginPath();
      // Top-left
      ctx.moveTo(cell.x + 3, cell.y + 3 + corner);
      ctx.lineTo(cell.x + 3, cell.y + 3);
      ctx.lineTo(cell.x + 3 + corner, cell.y + 3);
      // Bottom-right
      ctx.moveTo(cell.x + cell.width - 3 - corner, cell.y + cell.height - 3);
      ctx.lineTo(cell.x + cell.width - 3, cell.y + cell.height - 3);
      ctx.lineTo(cell.x + cell.width - 3, cell.y + cell.height - 3 - corner);
      ctx.stroke();
    }
  }

  // 2. Inside each square cell, draw the professional line + brand name badge
  for (const cell of cells) {
    ctx.save();
    ctx.translate(cell.centerX, cell.centerY);

    // Optional subtle diagonal structural line across the square
    if (cfg.showDiagonalLine !== false) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.45;
      ctx.strokeStyle = cfg.accentColor || '#a855f7';
      ctx.lineWidth = Math.max(1, 1 * lineScale);
      ctx.setLineDash([Math.max(4, 5 * lineScale), Math.max(3, 4 * lineScale)]);
      ctx.beginPath();
      ctx.moveTo(-cell.width * 0.44, cell.height * 0.44);
      ctx.lineTo(cell.width * 0.44, -cell.height * 0.44);
      ctx.stroke();
      ctx.restore();
    }

    ctx.rotate(angleRad);

    const fontPx = cell.fontSize;
    ctx.font = `800 ${fontPx}px "Tajawal", "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lineHalfW = Math.min(cell.width * 0.42, Math.max(fontPx * 2.2, cell.width * 0.36));
    const underlineY = fontPx * 0.66;

    // Draw sleek upper and lower parallel accent lines framing the name
    ctx.beginPath();
    ctx.strokeStyle = cfg.accentColor || '#a855f7';
    ctx.lineWidth = Math.max(1.2, 1.5 * lineScale);
    ctx.moveTo(-lineHalfW, underlineY);
    ctx.lineTo(lineHalfW, underlineY);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = cfg.color || '#ffffff';
    ctx.lineWidth = Math.max(0.9, 1.1 * lineScale);
    ctx.moveTo(-lineHalfW * 0.75, -underlineY);
    ctx.lineTo(lineHalfW * 0.75, -underlineY);
    ctx.stroke();

    // High-contrast dark halo stroke so the watermark name is readable over bright & dark gifts alike
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2.2, fontPx * 0.16);
    ctx.strokeStyle = 'rgba(8, 10, 22, 0.78)';
    ctx.strokeText(label, 0, 0);

    // Crisp main text fill
    ctx.fillStyle = cfg.color || '#ffffff';
    ctx.fillText(label, 0, 0);

    ctx.restore();
  }

  ctx.restore();
}

export interface ExportFramePlan {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  totalFrames: number;
  frameDurationSec: number;
  frameDurationMicros: number;
  targetBitrate: number;
}

/**
 * Computes optimal bitrate for smooth high-resolution gift video export without encoder choking.
 */
export function computeOptimalVideoBitrate(width: number, height: number, fps: number): number {
  const pixelsPerSec = Math.max(1, width * height * fps);
  // 0.18 bits per pixel gives clean gradients & alpha edges without overwhelming MediaRecorder / VideoEncoder buffers
  const raw = Math.round(pixelsPerSec * 0.18);
  return Math.max(2_500_000, Math.min(32_000_000, raw));
}

/**
 * Computes a deterministic frame-by-frame export plan so multi-video batch exports never drop frames.
 */
export function computeExportFramePlan(
  width: number,
  height: number,
  fps: number,
  durationSec: number
): ExportFramePlan {
  const evenW = Math.max(2, Math.min(4096, Math.round(width / 2) * 2));
  const evenH = Math.max(2, Math.min(4096, Math.round(height / 2) * 2));
  const safeFps = Math.max(12, Math.min(60, Math.round(fps || 30)));
  const safeDur = Math.max(0.2, Math.min(120, Number(durationSec) || 3));
  const totalFrames = Math.max(1, Math.round(safeDur * safeFps));
  const frameDurationSec = 1 / safeFps;
  const frameDurationMicros = Math.round(1_000_000 / safeFps);
  const targetBitrate = computeOptimalVideoBitrate(evenW, evenH, safeFps);

  return {
    width: evenW,
    height: evenH,
    fps: safeFps,
    durationSec: safeDur,
    totalFrames,
    frameDurationSec,
    frameDurationMicros,
    targetBitrate,
  };
}

/**
 * Determines whether a keyboard event matches a screenshot or screen-recording shortcut.
 */
export function isScreenCaptureShortcut(e: {
  key?: string;
  code?: string;
  keyCode?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): boolean {
  const key = (e.key || '').toLowerCase();
  const code = e.code || '';
  if (
    key === 'printscreen' ||
    code === 'PrintScreen' ||
    e.keyCode === 44 ||
    key === 'snapshot'
  ) {
    return true;
  }
  // Windows Snipping Tool / Game Bar Recorder / macOS Screenshot & Screen Recorder
  // Win+Shift+S, Win+Shift+R, Ctrl+Shift+S, Cmd+Shift+3, Cmd+Shift+4, Cmd+Shift+5
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && ['3', '4', '5', 's', 'r'].includes(key)) {
    return true;
  }
  // Windows Game Bar record (Win+Alt+R, Win+G)
  if (e.metaKey && e.altKey && key === 'r') {
    return true;
  }
  if (e.metaKey && !e.ctrlKey && !e.shiftKey && key === 'g') {
    return true;
  }
  return false;
}

/**
 * Returns H.264 (AVC) codec strings ordered from best profile/level for the target resolution
 * so exported MP4s play smoothly on all hardware decoders without Level 5.2 incompatibilites on 720p/1080p.
 */
export function selectOptimalH264CodecCandidates(width: number, height: number): string[] {
  const pixels = Math.max(1, width * height);
  if (pixels <= 921_600) {
    // Up to 720p (e.g. 1280x720 or 720x720): Level 4.0 / 3.1 first
    return [
      'avc1.640028',
      'avc1.4D4028',
      'avc1.42E028',
      'avc1.64001F',
      'avc1.4D401F',
      'avc1.42E01F',
      'avc1.64002A',
      'avc1.42E01E',
    ];
  }
  if (pixels <= 2_097_152) {
    // Up to 1080p (e.g. 1920x1080): Level 4.2 / 4.0 first
    return [
      'avc1.64002A',
      'avc1.4D402A',
      'avc1.42E02A',
      'avc1.640028',
      'avc1.4D4028',
      'avc1.42E028',
      'avc1.640033',
    ];
  }
  // 2K / 4K: Level 5.1 / 5.2
  return [
    'avc1.640033',
    'avc1.640034',
    'avc1.4D4033',
    'avc1.64002A',
    'avc1.4D402A',
    'avc1.42E02A',
  ];
}

/**
 * Computes the optimal export FPS to eliminate 20fps-in-30fps telecine judder on single-gift exports.
 * If requestedFps is 0 (auto), uses nativeFps. If nativeFps is e.g. 20 and requestedFps is 30 on a single discrete-frame gift,
 * preserves nativeFps or an exact integer multiple.
 */
export function computeEffectiveExportFps(
  requestedFps: number,
  nativeFps?: number,
  isDiscreteFrameFormat = false
): number {
  const validNative =
    typeof nativeFps === 'number' && Number.isFinite(nativeFps) && nativeFps >= 10 && nativeFps <= 60
      ? Math.round(nativeFps)
      : 0;

  if (!requestedFps || requestedFps <= 0) {
    return validNative || 30;
  }
  const safeReq = Math.max(12, Math.min(60, Math.round(requestedFps)));
  if (isDiscreteFrameFormat && validNative > 0) {
    // If requested FPS is not an integer multiple of native FPS (e.g. 30 requested for a 20fps SVGA),
    // use native FPS if requested <= 30, or 2x/3x multiple if requested is 60
    if (safeReq % validNative !== 0) {
      if (safeReq >= 50 && validNative * 2 <= 60) {
        return validNative * (validNative * 3 <= 60 ? 3 : 2);
      }
      return validNative;
    }
  }
  return safeReq;
}

/**
 * Computes a safe target timestamp inside the middle of frame `frameIndex`'s presentation interval
 * so HTMLVideoElement seeking never lands on a floating-point boundary edge between frames.
 */
export function computeFrameSeekTime(
  frameIndex: number,
  fps: number,
  durationSec: number
): number {
  const safeFps = Math.max(1, fps || 30);
  const safeDur = Math.max(0.05, durationSec || 3);
  const raw = (Math.max(0, frameIndex) + 0.35) / safeFps;
  return Math.max(0, Math.min(safeDur - 0.002, raw));
}

export interface CustomDurationConfig {
  enabled: boolean;
  seconds: number;
}

export const DEFAULT_CUSTOM_DURATION_CONFIG: CustomDurationConfig = {
  enabled: false,
  seconds: 5,
};

/**
 * Resolves the effective playback & export duration for a gift item.
 * - When `customConfig.enabled` is true: returns the user-selected custom duration in seconds for ANY gift format.
 * - When `customConfig.enabled` is false: returns the gift's original native duration (or fallbackStaticSec for static items).
 */
export function resolveEffectiveGiftDuration(
  nativeDurationSec: number | undefined,
  customConfig: Partial<CustomDurationConfig> = {},
  fallbackStaticSec = 3
): number {
  if (customConfig && customConfig.enabled) {
    const customSec = Number(customConfig.seconds);
    const validCustom = Number.isFinite(customSec) && customSec > 0 ? customSec : fallbackStaticSec || 5;
    return Math.max(0.5, Math.min(120, Math.round(validCustom * 100) / 100));
  }
  const nativeSec = Number(nativeDurationSec);
  if (Number.isFinite(nativeSec) && nativeSec > 0) {
    return Math.max(0.2, Math.min(120, nativeSec));
  }
  const fallback = Number(fallbackStaticSec);
  return Math.max(0.5, Math.min(120, Number.isFinite(fallback) && fallback > 0 ? fallback : 3));
}

/**
 * Computes the live preview playback speed multiplier (`playbackRate`) so the gift effect
 * is displayed across the chosen custom duration when enabled, or at 1.0x native speed when disabled.
 */
export function computeCustomPlaybackRate(
  nativeDurationSec: number | undefined,
  customConfig: Partial<CustomDurationConfig> = {}
): number {
  if (!customConfig || !customConfig.enabled) return 1;
  const nativeSec = Number(nativeDurationSec);
  if (!Number.isFinite(nativeSec) || nativeSec <= 0.05) return 1;
  const targetSec = resolveEffectiveGiftDuration(nativeSec, customConfig);
  const ratio = nativeSec / Math.max(0.1, targetSec);
  return Math.max(0.1, Math.min(8.0, Math.round(ratio * 1000) / 1000));
}

/**
 * Maps an export frame index (`0 .. totalFrames - 1`) to the gift's native animation timestamp (`0 .. nativeDurationSec`)
 * so that when custom duration mode is enabled, the full gift effect stretches/compresses smoothly across the chosen duration.
 */
export function mapExportFrameToNativeTime(
  frameIndex: number,
  fps: number,
  exportDurationSec: number,
  nativeDurationSec: number | undefined,
  isVideoSeek = false,
  customDurationEnabled = false
): number {
  const safeFps = Math.max(1, fps || 30);
  const safeExportDur = Math.max(0.05, Number(exportDurationSec) || 3);
  const rawNative = Number(nativeDurationSec);
  const safeNativeDur = Number.isFinite(rawNative) && rawNative > 0.05 ? rawNative : safeExportDur;

  if (!customDurationEnabled || Math.abs(safeExportDur - safeNativeDur) < 1e-4) {
    if (isVideoSeek) {
      return computeFrameSeekTime(frameIndex, safeFps, safeNativeDur);
    }
    const t = Math.max(0, frameIndex) / safeFps;
    return Math.max(0, Math.min(safeNativeDur - 0.0005, t));
  }

  const totalFrames = Math.max(1, Math.round(safeExportDur * safeFps));
  const sampleOffset = isVideoSeek ? 0.35 : 0;
  const progress = Math.max(0, Math.min(0.9995, (Math.max(0, frameIndex) + sampleOffset) / totalFrames));
  const mappedSec = progress * safeNativeDur;
  return isVideoSeek
    ? Math.max(0, Math.min(safeNativeDur - 0.002, mappedSec))
    : Math.max(0, Math.min(safeNativeDur - 0.0005, mappedSec));
}

export interface AudioEncoderCandidate {
  codec: string;
  muxCodec: 'aac' | 'opus';
  sampleRate: number;
  numberOfChannels: number;
  bitrate: number;
}

/**
 * Builds ordered WebCodecs AudioEncoder + Mp4Muxer configurations.
 * Tries AAC (mp4a.40.2) first, then falls back to Opus @ 48kHz (which Mp4Muxer natively muxes via dOps box
 * and Chromium/Edge/Firefox support out-of-the-box even when proprietary AAC encoding is unavailable).
 */
export function buildAudioEncoderCandidates(
  sourceSampleRate = 48000,
  sourceChannels = 2
): AudioEncoderCandidate[] {
  const ch = Math.min(2, Math.max(1, Math.round(sourceChannels || 2)));
  const sr = Math.round(sourceSampleRate || 48000);
  const candidates: AudioEncoderCandidate[] = [
    { codec: 'mp4a.40.2', muxCodec: 'aac', sampleRate: sr, numberOfChannels: ch, bitrate: 160_000 },
  ];
  if (sr !== 48000) {
    candidates.push({
      codec: 'mp4a.40.2',
      muxCodec: 'aac',
      sampleRate: 48000,
      numberOfChannels: ch,
      bitrate: 160_000,
    });
  }
  if (sr !== 44100) {
    candidates.push({
      codec: 'mp4a.40.2',
      muxCodec: 'aac',
      sampleRate: 44100,
      numberOfChannels: ch,
      bitrate: 160_000,
    });
  }
  // Opus in MP4 requires 48000 Hz sample rate in WebCodecs AudioEncoder
  candidates.push({
    codec: 'opus',
    muxCodec: 'opus',
    sampleRate: 48000,
    numberOfChannels: ch,
    bitrate: 128_000,
  });
  if (ch !== 2) {
    candidates.push({
      codec: 'opus',
      muxCodec: 'opus',
      sampleRate: 48000,
      numberOfChannels: 2,
      bitrate: 128_000,
    });
  }
  return candidates;
}

/**
 * Resamples a single audio channel Float32Array from srcRate to dstRate using linear interpolation.
 */
export function resampleChannelFloat32(
  input: Float32Array,
  srcRate: number,
  dstRate: number,
  dstLength: number,
  gain = 1,
  srcOffsetSamples = 0
): Float32Array {
  const out = new Float32Array(Math.max(0, dstLength));
  if (!input || input.length === 0 || dstLength <= 0) return out;
  const safeSrcRate = Math.max(1, srcRate || 48000);
  const safeDstRate = Math.max(1, dstRate || 48000);
  const ratio = safeSrcRate / safeDstRate;
  const maxIdx = input.length - 1;

  if (Math.abs(ratio - 1) < 1e-6) {
    for (let i = 0; i < dstLength; i++) {
      const idx = srcOffsetSamples + i;
      out[i] = idx >= 0 && idx <= maxIdx ? input[idx] * gain : 0;
    }
    return out;
  }

  for (let i = 0; i < dstLength; i++) {
    const srcPos = srcOffsetSamples + i * ratio;
    if (srcPos < 0 || srcPos > maxIdx) {
      out[i] = 0;
      continue;
    }
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(maxIdx, i0 + 1);
    const frac = srcPos - i0;
    out[i] = (input[i0] * (1 - frac) + input[i1] * frac) * gain;
  }
  return out;
}

export type GiftStudioExportMode = 'gi' | 'pack' | 'sep' | 'one' | 'extract';

export interface GiftStudioExportItemLike {
  id?: number;
  name: string;
  fmt: string;
  kind?: string;
  sel?: boolean;
  err?: string;
  w?: number;
  h?: number;
  dur?: number;
  alpha?: string;
  vapi?: unknown;
  yyi?: unknown;
  yy?: boolean;
  isVap?: boolean;
}

export interface ExportModeMeta {
  value: GiftStudioExportMode;
  optionLabel: string;
  buttonLabel: string;
  requiresVideoEncoder: boolean;
  usesResolutionSelect: boolean;
}

export const GIFT_STUDIO_EXPORT_MODES: ExportModeMeta[] = [
  {
    value: 'gi',
    optionLabel: '🎁 هدية + 🖼 صورة (مجلد)',
    buttonLabel: '⬇ تصدير هدية + صورة',
    requiresVideoEncoder: false,
    usesResolutionSelect: true,
  },
  {
    value: 'pack',
    optionLabel: '🎁 هدية + 🎬 فيديو + 🖼 صورة',
    buttonLabel: '⬇ تصدير الحزمة الشاملة',
    requiresVideoEncoder: true,
    usesResolutionSelect: true,
  },
  {
    value: 'sep',
    optionLabel: '🎬 فيديو لكل هدية (منفصل)',
    buttonLabel: '⬇ تصدير الفيديوهات',
    requiresVideoEncoder: true,
    usesResolutionSelect: true,
  },
  {
    value: 'one',
    optionLabel: '🎞️ جميع الهدايا في فيديو واحد (جنب بعض)',
    buttonLabel: '🎞️ تصدير في فيديو واحد',
    requiresVideoEncoder: true,
    usesResolutionSelect: true,
  },
  {
    value: 'extract',
    optionLabel: '📦 استخراج الهدايا في فولدرات + الصور (SVGA / VAP)',
    buttonLabel: '📦 استخراج الفولدرات + الصور',
    requiresVideoEncoder: false,
    usesResolutionSelect: true,
  },
];

export function getExportModeMeta(mode: string): ExportModeMeta {
  return (
    GIFT_STUDIO_EXPORT_MODES.find((m) => m.value === mode) ||
    GIFT_STUDIO_EXPORT_MODES[0]
  );
}

export function isSvgaGiftItem(item: GiftStudioExportItemLike): boolean {
  if (!item || item.err) return false;
  return item.fmt === 'svga' || /\.svga$/i.test(item.name || '');
}

export function isVapOrYyevaGiftItem(item: GiftStudioExportItemLike): boolean {
  if (!item || item.err) return false;
  if (item.kind === 'VAP' || item.kind === 'YYEVA') return true;
  if (item.vapi || item.yyi || item.yy || item.isVap) return true;
  if (/\.(vap|yyeva)$/i.test(item.name || '')) return true;
  if (item.fmt === 'mp4' && item.alpha && item.alpha !== 'N') return true;
  return false;
}

/**
 * Classifies which folder inside the unified extraction ZIP a gift belongs to.
 * SVGA files go into 'SVGA_Files', while VAP/YYEVA/MP4 and other formats go into 'VAP_YYEVA_Files'.
 */
export function classifyExtractedGiftFolder(item: GiftStudioExportItemLike): 'SVGA_Files' | 'VAP_YYEVA_Files' {
  return isSvgaGiftItem(item) ? 'SVGA_Files' : 'VAP_YYEVA_Files';
}

export interface ExtractedGiftEntryPaths {
  folder: 'SVGA_Files' | 'VAP_YYEVA_Files';
  filePath: string;
  imagePath: string;
}

/**
 * Computes the ZIP paths for each gift and its high-clarity PNG snapshot so that
 * SVGA files and their PNG images live together in `SVGA_Files/`, and VAP/YYEVA/other files
 * and their PNG images live together in `VAP_YYEVA_Files/`.
 */
export function buildExtractedGiftAndImagePaths(
  items: GiftStudioExportItemLike[]
): ExtractedGiftEntryPaths[] {
  const used = new Set<string>();
  return (items || []).map((item, idx) => {
    const isSvga = isSvgaGiftItem(item);
    const folder = classifyExtractedGiftFolder(item);
    const extMatch = (item.name || '').match(/(\.[^.]+)$/);
    const ext = isSvga ? '.svga' : extMatch ? extMatch[1] : '.mp4';
    const rawBase = (item.name || '').replace(/\.[^.]+$/, '').trim() || `gift_${idx + 1}`;
    let k = rawBase;
    let n = 1;
    while (used.has(k.toLowerCase())) {
      n++;
      k = `${rawBase}_${n}`;
    }
    used.add(k.toLowerCase());
    return {
      folder,
      filePath: `${folder}/${k}${ext}`,
      imagePath: `${folder}/${k}.png`,
    };
  });
}

/**
 * Resolves the target items list for a given export mode.
 */
export function resolveItemsForExportMode<T extends GiftStudioExportItemLike>(
  items: T[],
  mode: GiftStudioExportMode
): T[] {
  const valid = (items || []).filter((i) => i && !i.err && i.fmt);
  const selected = valid.filter((i) => i.sel);

  if (mode === 'one') {
    // For "All displayed files in one video", merge all valid items unless 2+ specific items are checked
    return selected.length > 1 ? selected : valid;
  }

  return selected.length > 0 ? selected : valid;
}

/**
 * Generates unique, collision-free file names inside a single extracted folder.
 */
export function buildUniqueExtractedFileNames(
  names: string[],
  defaultExt: string
): string[] {
  const used = new Set<string>();
  const cleanDefaultExt = defaultExt.startsWith('.') ? defaultExt : `.${defaultExt}`;
  return names.map((rawName, idx) => {
    const match = (rawName || '').match(/(\.[^.]+)$/);
    const ext = match ? match[1] : cleanDefaultExt;
    const finalExt = defaultExt === '.svga' ? '.svga' : ext;
    const rawBase = (rawName || '').replace(/\.[^.]+$/, '').trim() || `file_${idx + 1}`;
    let candidate = rawBase;
    let counter = 1;
    while (used.has(`${candidate.toLowerCase()}${finalExt.toLowerCase()}`)) {
      counter++;
      candidate = `${rawBase}_${counter}`;
    }
    const fullName = `${candidate}${finalExt}`;
    used.add(fullName.toLowerCase());
    return fullName;
  });
}

export interface SideBySideCellRect {
  index: number;
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SideBySideVideoLayout {
  canvasWidth: number;
  canvasHeight: number;
  cols: number;
  rows: number;
  cells: SideBySideCellRect[];
}

/**
 * Computes a side-by-side layout for displaying multiple gifts simultaneously in one video frame.
 * - For 1..4 items: arranges them in a single horizontal side-by-side row (cols = N, rows = 1).
 * - For 5+ items: arranges them in a balanced wide multi-column grid so all gifts are clearly visible side-by-side.
 * Always produces even canvasWidth and canvasHeight within hardware H.264 limits.
 */
export function computeSideBySideVideoLayout(
  itemCount: number,
  baseHeight = 720,
  firstItemWidth = 720,
  firstItemHeight = 720
): SideBySideVideoLayout {
  const count = Math.max(1, Math.round(itemCount || 1));
  const safeBaseH = Math.max(240, Math.min(2160, Math.round((baseHeight || 720) / 2) * 2));

  if (count === 1) {
    const aspect = (firstItemWidth > 0 && firstItemHeight > 0) ? firstItemWidth / firstItemHeight : 1;
    const w = Math.max(64, Math.min(3840, Math.round((safeBaseH * aspect) / 2) * 2));
    return {
      canvasWidth: w,
      canvasHeight: safeBaseH,
      cols: 1,
      rows: 1,
      cells: [{ index: 0, row: 0, col: 0, x: 0, y: 0, width: w, height: safeBaseH }],
    };
  }

  const cols = count <= 4 ? count : Math.min(5, Math.ceil(Math.sqrt(count * 1.6)));
  const rows = Math.ceil(count / cols);

  // Give each side-by-side cell a generous square-ish / portrait-friendly slot while keeping total canvas within 1920x1080 (or 2560x1440 for high res)
  const maxCanvasW = safeBaseH > 1080 ? 2560 : 1920;
  const maxCanvasH = safeBaseH > 1080 ? 1440 : 1080;

  const idealCellH = rows === 1 ? safeBaseH : Math.max(240, Math.floor(maxCanvasH / rows));
  const idealCellW = Math.max(240, Math.min(idealCellH, Math.floor(maxCanvasW / cols)));

  const canvasWidth = Math.max(64, Math.min(maxCanvasW, Math.round((idealCellW * cols) / 2) * 2));
  const canvasHeight = Math.max(64, Math.min(maxCanvasH, Math.round((idealCellH * rows) / 2) * 2));

  const cellW = canvasWidth / cols;
  const cellH = canvasHeight / rows;

  const cells: SideBySideCellRect[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    // Center items on the last row if it is partially filled
    const itemsInRow = row === rows - 1 ? count - row * cols : cols;
    const rowOffsetX = ((cols - itemsInRow) * cellW) / 2;
    cells.push({
      index: i,
      row,
      col,
      x: Math.round(rowOffsetX + col * cellW),
      y: Math.round(row * cellH),
      width: Math.round(cellW),
      height: Math.round(cellH),
    });
  }

  return {
    canvasWidth,
    canvasHeight,
    cols,
    rows,
    cells,
  };
}

export interface AlphaBoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  visiblePixels: number;
  clarityScore: number;
}

/**
 * Scans an RGBA pixel buffer (Uint8Array or Uint8ClampedArray) of size (width x height)
 * to find the exact tight bounding box of non-transparent gift pixels and a visual clarity score.
 */
export function computeTightAlphaBounds(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  alphaThreshold = 16
): AlphaBoundingBox | null {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  if (!rgba || w <= 0 || h <= 0 || rgba.length < w * h * 4) return null;

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let visiblePixels = 0;
  let clarityScore = 0;

  for (let y = 0; y < h; y++) {
    const rowOff = y * w * 4;
    for (let x = 0; x < w; x++) {
      const idx = rowOff + x * 4;
      const a = rgba[idx + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        visiblePixels++;
        const r = rgba[idx];
        const g = rgba[idx + 1];
        const b = rgba[idx + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        clarityScore += (a / 255) * (0.4 + 0.6 * (luma / 255));
      }
    }
  }

  if (maxX < minX || maxY < minY || visiblePixels === 0) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    visiblePixels,
    clarityScore,
  };
}

export interface AutoCropDrawRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/**
 * Computes source crop rectangle and destination draw rectangle so that the gift's visible bounding box
 * is scaled up cleanly to fit the target snapshot canvas tightly ("على قد الصورة بشكل دقيق") with a small margin.
 */
export function computeAutoCropDrawRect(
  bounds: AlphaBoundingBox,
  targetWidth: number,
  targetHeight: number,
  paddingRatio = 0.03
): AutoCropDrawRect {
  const tw = Math.max(2, Math.round(targetWidth));
  const th = Math.max(2, Math.round(targetHeight));
  const safePad = Math.max(0, Math.min(0.2, Number(paddingRatio) || 0));

  const availW = Math.max(1, tw * (1 - safePad * 2));
  const availH = Math.max(1, th * (1 - safePad * 2));

  const sw = Math.max(1, bounds.width);
  const sh = Math.max(1, bounds.height);
  const scale = Math.min(availW / sw, availH / sh);

  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const dx = Math.round((tw - dw) / 2);
  const dy = Math.round((th - dh) / 2);

  return {
    sx: bounds.minX,
    sy: bounds.minY,
    sw,
    sh,
    dx,
    dy,
    dw,
    dh,
  };
}

/**
 * Distinguishes whether a PK-header (ZIP) container is an SVGA 1.x animation file
 * (which contains movie.binary or movie.spec at root) or a closed/zipped archive
 * containing gift files and folders (e.g. Gifts_Folders_And_Images.zip).
 */
export function classifyZipContainer(entryPaths: string[], fileName = ''): 'svga1' | 'archive' {
  const normalized = (entryPaths || []).map((p) => String(p || '').replace(/^\/+/, '').trim());
  const hasSvgaRootSpec = normalized.some(
    (p) => p === 'movie.binary' || p === 'movie.spec'
  );
  if (hasSvgaRootSpec) {
    return 'svga1';
  }
  return 'archive';
}

export interface FilteredArchiveEntries {
  giftPaths: string[];
  nestedZipPaths: string[];
  candidateImagePaths: string[];
  ignoredPaths: string[];
}

/**
 * Filters internal file paths from a closed ZIP archive or folder so all project gift files
 * (SVGA, PAG, VAP, YYEVA, MP4, Lottie JSON, GIF, APNG, SVG, nested ZIPs) are extracted for display
 * while OS metadata and static companion thumbnails (.jpg/.jpeg) are skipped.
 */
export function filterExtractableArchiveEntries(entryPaths: string[]): FilteredArchiveEntries {
  const giftPaths: string[] = [];
  const nestedZipPaths: string[] = [];
  const candidateImagePaths: string[] = [];
  const ignoredPaths: string[] = [];

  for (const rawPath of entryPaths || []) {
    const p = String(rawPath || '').trim();
    if (!p || p.endsWith('/')) {
      ignoredPaths.push(rawPath);
      continue;
    }
    const clean = p.replace(/\\/g, '/');
    const parts = clean.split('/').filter(Boolean);
    const base = parts[parts.length - 1] || '';

    // Ignore macOS / Windows hidden system files
    if (
      clean.includes('__MACOSX/') ||
      base.startsWith('._') ||
      base === '.DS_Store' ||
      base.toLowerCase() === 'thumbs.db' ||
      base.toLowerCase() === 'desktop.ini'
    ) {
      ignoredPaths.push(rawPath);
      continue;
    }

    const extMatch = base.match(/\.([^.]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : '';

    if (ext === 'zip') {
      nestedZipPaths.push(rawPath);
    } else if (
      ['svga', 'pag', 'vap', 'yyeva', 'mp4', 'webm', 'mov', 'm4v', 'json', 'gif', 'apng', 'svg', 'webpa', 'bin', 'dat'].includes(
        ext
      )
    ) {
      giftPaths.push(rawPath);
    } else if (ext === 'png' || ext === 'webp') {
      // May be animated APNG / animated WebP or a static preview image exported alongside a gift
      candidateImagePaths.push(rawPath);
    } else {
      ignoredPaths.push(rawPath);
    }
  }

  return { giftPaths, nestedZipPaths, candidateImagePaths, ignoredPaths };
}

/**
 * Extracts a clean display filename from an internal archive or folder path.
 */
export function deriveCleanGiftNameFromArchivePath(entryPath: string): string {
  const clean = String(entryPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = clean.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'gift';
}

/**
 * Unwraps a locked or header-padded gift binary payload if a recognizable gift magic signature
 * (zlib SVGA, MP4/VAP ftyp, PAG, or PK zip) is embedded within the first 512 bytes.
 */
export function unwrapLockedGiftPayload(bytes: Uint8Array): {
  bytes: Uint8Array;
  unwrapped: boolean;
  detectedSignature: 'svga_zlib' | 'pk' | 'mp4_ftyp' | 'pag' | null;
} {
  if (!bytes || bytes.length < 8) {
    return { bytes, unwrapped: false, detectedSignature: null };
  }

  const isZlibHeader = (b0: number, b1: number) =>
    b0 === 0x78 &&
    (b1 === 0x01 || b1 === 0x5e || b1 === 0x9c || b1 === 0xda) &&
    (b0 * 256 + b1) % 31 === 0;

  const isPkHeader = (i: number) =>
    i + 4 <= bytes.length &&
    bytes[i] === 0x50 &&
    bytes[i + 1] === 0x4b &&
    bytes[i + 2] === 0x03 &&
    bytes[i + 3] === 0x04;

  const isFtypAt = (i: number) =>
    i >= 4 &&
    i + 4 <= bytes.length &&
    bytes[i] === 0x66 && // 'f'
    bytes[i + 1] === 0x74 && // 't'
    bytes[i + 2] === 0x79 && // 'y'
    bytes[i + 3] === 0x70; // 'p'

  const isPagHeader = (i: number) =>
    i + 4 <= bytes.length &&
    bytes[i] === 0x50 && // 'P'
    bytes[i + 1] === 0x41 && // 'A'
    bytes[i + 2] === 0x47 && // 'G'
    bytes[i + 3] >= 1 &&
    bytes[i + 3] <= 10;

  // Check offset 0 first
  if (isZlibHeader(bytes[0], bytes[1])) {
    return { bytes, unwrapped: false, detectedSignature: 'svga_zlib' };
  }
  if (isPkHeader(0)) {
    return { bytes, unwrapped: false, detectedSignature: 'pk' };
  }
  if (isFtypAt(4)) {
    return { bytes, unwrapped: false, detectedSignature: 'mp4_ftyp' };
  }
  if (isPagHeader(0)) {
    return { bytes, unwrapped: false, detectedSignature: 'pag' };
  }

  // Scan up to 512 bytes for an embedded header
  const maxScan = Math.min(bytes.length - 8, 512);
  for (let i = 1; i <= maxScan; i++) {
    if (isFtypAt(i + 4)) {
      return { bytes: bytes.subarray(i), unwrapped: true, detectedSignature: 'mp4_ftyp' };
    }
    if (isPkHeader(i)) {
      return { bytes: bytes.subarray(i), unwrapped: true, detectedSignature: 'pk' };
    }
    if (isPagHeader(i)) {
      return { bytes: bytes.subarray(i), unwrapped: true, detectedSignature: 'pag' };
    }
    if (isZlibHeader(bytes[i], bytes[i + 1])) {
      return { bytes: bytes.subarray(i), unwrapped: true, detectedSignature: 'svga_zlib' };
    }
  }

  return { bytes, unwrapped: false, detectedSignature: null };
}
