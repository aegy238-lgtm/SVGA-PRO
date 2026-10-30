export interface EdgeFeatherConfig {
  enabled: boolean;
  topMargin: number;     // 0 - 50 (%)
  bottomMargin: number;  // 0 - 50 (%)
  leftMargin: number;    // 0 - 50 (%)
  rightMargin: number;   // 0 - 50 (%)
  featherRadius: number; // 0 - 200 (px)
  // Animation duration & time trimming
  trimEnabled?: boolean;
  trimStartTime?: number;  // Start time in seconds (e.g. 0.00)
  trimEndTime?: number;    // End time in seconds (e.g. 4.00)
  trimStartFrame?: number; // Start frame index
  trimEndFrame?: number;   // End frame index
  totalDuration?: number;  // Total file duration in seconds
  totalFrames?: number;    // Total file frames
  fps?: number;            // Frames per second
}

export const INITIAL_EDGE_FEATHER: EdgeFeatherConfig = {
  enabled: false,
  topMargin: 0,
  bottomMargin: 0,
  leftMargin: 0,
  rightMargin: 0,
  featherRadius: 50,
  trimEnabled: false,
  trimStartTime: 0,
  trimEndTime: 0,
  trimStartFrame: 0,
  trimEndFrame: 0,
  totalDuration: 0,
  totalFrames: 0,
  fps: 15,
};

let cachedKey = '';
let cachedCanvas: HTMLCanvasElement | null = null;

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Computes the 1D alpha profile (0..1) along a dimension of length `len`
 * given `startMarginPct` (0..50), `endMarginPct` (0..50), and `featherRadius` (0..200).
 */
export function compute1DFeatherProfile(
  len: number,
  startMarginPct: number,
  endMarginPct: number,
  featherRadius: number,
  allMarginsZero: boolean
): Float32Array {
  const out = new Float32Array(len);
  out.fill(1);
  if (len <= 0) return out;

  const scale = len / 300;
  const radiusPx = Math.max(0, featherRadius * scale);

  // If all 4 margins are 0% and radius > 0, apply symmetric feathering on all edges
  if (allMarginsZero) {
    if (radiusPx <= 0.5) return out;
    const band = Math.min(len * 0.45, radiusPx);
    for (let i = 0; i < len; i++) {
      const aStart = i < band ? smoothstep(0, band, i) : 1;
      const distEnd = len - 1 - i;
      const aEnd = distEnd < band ? smoothstep(0, band, distEnd) : 1;
      out[i] = aStart * aEnd;
    }
    return out;
  }

  // Start edge (Top or Left)
  if (startMarginPct > 0) {
    const marginPx = (startMarginPct / 100) * len;
    if (featherRadius <= 0) {
      for (let i = 0; i < len; i++) {
        if (i < marginPx) out[i] = 0;
      }
    } else {
      const rRatio = featherRadius / 200;
      const fadeSpan = Math.max(2, marginPx * (0.35 + 0.95 * rRatio) + radiusPx * 0.25);
      const fadeEnd = Math.min(len, marginPx + fadeSpan * 0.18 * rRatio);
      const fadeStart = Math.max(0, fadeEnd - fadeSpan);
      for (let i = 0; i < len; i++) {
        if (i <= fadeStart) {
          out[i] = 0;
        } else if (i < fadeEnd) {
          out[i] *= smoothstep(fadeStart, fadeEnd, i);
        }
      }
    }
  }

  // End edge (Bottom or Right)
  if (endMarginPct > 0) {
    const marginPx = (endMarginPct / 100) * len;
    if (featherRadius <= 0) {
      for (let i = 0; i < len; i++) {
        const dist = len - 1 - i;
        if (dist < marginPx) out[i] = 0;
      }
    } else {
      const rRatio = featherRadius / 200;
      const fadeSpan = Math.max(2, marginPx * (0.35 + 0.95 * rRatio) + radiusPx * 0.25);
      const fadeEnd = Math.min(len, marginPx + fadeSpan * 0.18 * rRatio);
      const fadeStart = Math.max(0, fadeEnd - fadeSpan);
      for (let i = 0; i < len; i++) {
        const dist = len - 1 - i;
        if (dist <= fadeStart) {
          out[i] = 0;
        } else if (dist < fadeEnd) {
          out[i] *= smoothstep(fadeStart, fadeEnd, dist);
        }
      }
    }
  }

  return out;
}

/**
 * Returns a cached HTMLCanvasElement containing the alpha mask for `(W, H)` and `cfg`.
 */
export function getEdgeFeatherMaskCanvas(
  W: number,
  H: number,
  cfg: EdgeFeatherConfig
): HTMLCanvasElement {
  const w = Math.max(1, Math.round(W));
  const h = Math.max(1, Math.round(H));
  const key = `${w}x${h}_${cfg.topMargin}_${cfg.bottomMargin}_${cfg.leftMargin}_${cfg.rightMargin}_${cfg.featherRadius}`;
  if (cachedCanvas && cachedKey === key) {
    return cachedCanvas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;

  const allZero =
    cfg.topMargin <= 0 &&
    cfg.bottomMargin <= 0 &&
    cfg.leftMargin <= 0 &&
    cfg.rightMargin <= 0;

  const profileX = compute1DFeatherProfile(
    w,
    cfg.leftMargin,
    cfg.rightMargin,
    cfg.featherRadius,
    allZero
  );
  const profileY = compute1DFeatherProfile(
    h,
    cfg.topMargin,
    cfg.bottomMargin,
    cfg.featherRadius,
    allZero
  );

  let p = 0;
  for (let y = 0; y < h; y++) {
    const ay = profileY[y];
    for (let x = 0; x < w; x++) {
      data[p] = 255;
      data[p + 1] = 255;
      data[p + 2] = 255;
      data[p + 3] = Math.round(255 * ay * profileX[x]);
      p += 4;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  cachedKey = key;
  cachedCanvas = canvas;
  return canvas;
}

/**
 * Applies the Edge Feather mask in-place to a 2D canvas context `ctx` of dimensions `(W, H)`.
 */
export function applyEdgeFeatherToContext(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  cfg: EdgeFeatherConfig
): void {
  if (!cfg || !cfg.enabled) return;
  const hasAny =
    cfg.topMargin > 0 ||
    cfg.bottomMargin > 0 ||
    cfg.leftMargin > 0 ||
    cfg.rightMargin > 0 ||
    cfg.featherRadius > 0;
  if (!hasAny) return;

  const mask = getEdgeFeatherMaskCanvas(W, H, cfg);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0, W, H);
  ctx.restore();
}

/**
 * Applies or clears the live CSS mask-image on the animation children inside `#view`
 * (NEVER on `#view` itself, so `#view`'s background color / checkerboard / uploaded background image
 * and border remain 100% unclipped behind the feathered animation).
 */
export function applyEdgeFeatherToStageView(cfg: EdgeFeatherConfig): void {
  const viewEl = document.getElementById('view');
  if (!viewEl) return;

  // Ensure #view itself never has mask-image applied so its background & border are never cropped
  viewEl.style.maskImage = '';
  viewEl.style.webkitMaskImage = '';
  viewEl.style.maskSize = '';
  viewEl.style.webkitMaskSize = '';
  viewEl.style.maskRepeat = '';
  viewEl.style.webkitMaskRepeat = '';

  const hasEffect =
    cfg &&
    cfg.enabled &&
    (cfg.topMargin > 0 ||
      cfg.bottomMargin > 0 ||
      cfg.leftMargin > 0 ||
      cfg.rightMargin > 0 ||
      cfg.featherRadius > 0);

  if (!hasEffect) {
    viewEl.classList.remove('ef-active');
    viewEl.style.removeProperty('--ef-mask-image');
    Array.from(viewEl.children).forEach((child) => {
      const el = child as HTMLElement;
      el.style.maskImage = '';
      el.style.webkitMaskImage = '';
      el.style.maskSize = '';
      el.style.webkitMaskSize = '';
      el.style.maskRepeat = '';
      el.style.webkitMaskRepeat = '';
    });
    return;
  }

  const maskCanvas = getEdgeFeatherMaskCanvas(360, 360, cfg);
  const dataUrl = maskCanvas.toDataURL('image/png');
  const maskUrl = `url("${dataUrl}")`;

  viewEl.classList.add('ef-active');
  viewEl.style.setProperty('--ef-mask-image', maskUrl);

  Array.from(viewEl.children).forEach((child) => {
    const el = child as HTMLElement;
    el.style.maskImage = maskUrl;
    el.style.webkitMaskImage = maskUrl;
    el.style.maskSize = '100% 100%';
    el.style.webkitMaskSize = '100% 100%';
    el.style.maskRepeat = 'no-repeat';
    el.style.webkitMaskRepeat = 'no-repeat';
  });
}

/**
 * Formats duration in seconds to M:SS.ss or S.ss string format.
 */
export function formatDurationSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0.00s';
  if (sec >= 60) {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins}m ${remainder.toFixed(2)}s`;
  }
  return `${sec.toFixed(2)}s`;
}

/**
 * Calculates sanitized frame and second ranges based on inputs.
 */
export function calculateTrimRange(params: {
  totalDuration: number;
  totalFrames: number;
  fps: number;
  startTime?: number;
  endTime?: number;
  startFrame?: number;
  endFrame?: number;
}): {
  startTime: number;
  endTime: number;
  startFrame: number;
  endFrame: number;
  duration: number;
  frameCount: number;
} {
  const safeFps = Math.max(1, Math.round(params.fps || 15));
  const safeDuration = Math.max(0.01, params.totalDuration || (params.totalFrames ? params.totalFrames / safeFps : 4.0));
  const safeFrames = Math.max(1, params.totalFrames || Math.round(safeDuration * safeFps));

  let start = params.startTime !== undefined ? params.startTime : (params.startFrame !== undefined ? params.startFrame / safeFps : 0);
  let end = params.endTime !== undefined ? params.endTime : (params.endFrame !== undefined ? params.endFrame / safeFps : safeDuration);

  start = Math.max(0, Math.min(safeDuration - 0.01, start));
  end = Math.max(start + 0.01, Math.min(safeDuration, end));

  const startFrame = Math.max(0, Math.min(safeFrames - 1, Math.round(start * safeFps)));
  const endFrame = Math.max(startFrame + 1, Math.min(safeFrames, Math.round(end * safeFps)));
  const duration = Math.max(0.01, end - start);
  const frameCount = Math.max(1, endFrame - startFrame);

  return {
    startTime: Number(start.toFixed(2)),
    endTime: Number(end.toFixed(2)),
    startFrame,
    endFrame,
    duration: Number(duration.toFixed(2)),
    frameCount,
  };
}


