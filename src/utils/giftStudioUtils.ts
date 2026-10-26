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


