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

/**
 * Samples the feather alpha multiplier (0..1) at canvas coordinate (cx, cy).
 */
export function getFeatherAlphaAtCoord(
  cx: number,
  cy: number,
  canvasW: number,
  canvasH: number,
  profileX: Float32Array,
  profileY: Float32Array,
  cfg: EdgeFeatherConfig
): number {
  const w = Math.max(1, canvasW);
  const h = Math.max(1, canvasH);

  let ax = 1;
  if (cx < 0) {
    ax = cfg.leftMargin > 0 ? 0 : profileX[0];
  } else if (cx >= w) {
    ax = cfg.rightMargin > 0 ? 0 : profileX[w - 1];
  } else {
    const idxX = Math.max(0, Math.min(w - 1, Math.floor(cx)));
    ax = profileX[idxX];
  }

  let ay = 1;
  if (cy < 0) {
    ay = cfg.topMargin > 0 ? 0 : profileY[0];
  } else if (cy >= h) {
    ay = cfg.bottomMargin > 0 ? 0 : profileY[h - 1];
  } else {
    const idxY = Math.max(0, Math.min(h - 1, Math.floor(cy)));
    ay = profileY[idxY];
  }

  return Math.max(0, Math.min(1, ax * ay));
}

/**
 * Applies the Edge Feather transparency mask in-place onto the raw RGBA pixels of an image layer.
 * Coordinates are mapped to canvas space using the sprite's transform matrix and bounds.
 */
export function applyFeatherToRgbaPixels(
  rgba: Uint8ClampedArray | Uint8Array,
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number,
  transform: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0],
  bounds: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: imgW, h: imgH },
  cfg: EdgeFeatherConfig
): boolean {
  if (
    !cfg ||
    (cfg.topMargin <= 0 &&
      cfg.bottomMargin <= 0 &&
      cfg.leftMargin <= 0 &&
      cfg.rightMargin <= 0 &&
      cfg.featherRadius <= 0)
  ) {
    return false;
  }
  const allZero =
    cfg.topMargin <= 0 &&
    cfg.bottomMargin <= 0 &&
    cfg.leftMargin <= 0 &&
    cfg.rightMargin <= 0;

  const profileX = compute1DFeatherProfile(
    canvasW,
    cfg.leftMargin,
    cfg.rightMargin,
    cfg.featherRadius,
    allZero
  );
  const profileY = compute1DFeatherProfile(
    canvasH,
    cfg.topMargin,
    cfg.bottomMargin,
    cfg.featherRadius,
    allZero
  );

  const [a, b, c, d, tx, ty] = transform;
  const fw = bounds.w > 0 ? bounds.w : imgW;
  const fh = bounds.h > 0 ? bounds.h : imgH;
  const fx = bounds.x || 0;
  const fy = bounds.y || 0;

  const scaleX = fw / Math.max(1, imgW);
  const scaleY = fh / Math.max(1, imgH);

  let modified = false;

  for (let y = 0; y < imgH; y++) {
    const py = fy + y * scaleY;
    const rowOffset = y * imgW * 4;
    for (let x = 0; x < imgW; x++) {
      const p = rowOffset + x * 4;
      const origAlpha = rgba[p + 3];
      if (origAlpha === 0) continue;

      const px = fx + x * scaleX;
      const cx = a * px + c * py + tx;
      const cy = b * px + d * py + ty;

      const alphaMult = getFeatherAlphaAtCoord(cx, cy, canvasW, canvasH, profileX, profileY, cfg);
      if (alphaMult < 0.999) {
        rgba[p + 3] = Math.round(origAlpha * alphaMult);
        modified = true;
      }
    }
  }

  return modified;
}

export interface BakeSvgaFeatherResult {
  updatedImages: Record<string, Uint8Array>;
  updatedBitmaps?: Record<string, any>;
  bakedCount: number;
}

/**
 * Bakes the Edge Feather transparency directly into all decomposed image layers of an SVGA movie.
 * This ensures transparency is permanently fixed to the design pixels so that moving the design
 * (e.g. upwards in Project Composer) preserves the exact transparency without distortion.
 */
export async function bakeEdgeFeatherIntoSvgaMovie(
  movie: any,
  cfg: EdgeFeatherConfig,
  existingBitmaps?: Record<string, any>
): Promise<BakeSvgaFeatherResult> {
  const canvasW = Math.max(1, Math.round(movie?.w || 300));
  const canvasH = Math.max(1, Math.round(movie?.h || 300));
  const images = movie?.im || {};
  const sprites = movie?.sp || [];

  const updatedImages: Record<string, Uint8Array> = {};
  const updatedBitmaps: Record<string, any> = {};
  let bakedCount = 0;

  for (const [key, rawBytes] of Object.entries(images as Record<string, Uint8Array>)) {
    if (!rawBytes || rawBytes.length < 8) continue;

    // Skip audio files
    const isId3 =
      rawBytes.length >= 3 && rawBytes[0] === 0x49 && rawBytes[1] === 0x44 && rawBytes[2] === 0x33;
    const isMp3Sync =
      rawBytes.length >= 4 &&
      rawBytes[0] === 0xff &&
      rawBytes[1] !== 0xd8 &&
      (rawBytes[1] & 0xe0) === 0xe0;
    if (isId3 || isMp3Sync || /^audio[_-]/i.test(key)) continue;

    // Locate sprite reference frame
    let refFrame: any = null;
    for (const sp of sprites) {
      if (sp.key === key) {
        for (const fr of sp.fr || []) {
          if ((fr.a ?? 1) > 0.01) {
            refFrame = fr;
            break;
          }
        }
        if (refFrame) break;
      }
    }

    // Decode image to ImageData
    let bmp: any = existingBitmaps?.[key] || null;
    if (!bmp && typeof createImageBitmap === 'function') {
      try {
        const mime = rawBytes[0] === 0xff && rawBytes[1] === 0xd8 ? 'image/jpeg' : 'image/png';
        bmp = await createImageBitmap(new Blob([rawBytes as unknown as BlobPart], { type: mime }));
      } catch (_) {}
    }

    if (!bmp || !bmp.width || !bmp.height) continue;

    const imgW = bmp.width;
    const imgH = bmp.height;
    if (typeof document === 'undefined') continue;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = imgW;
    offCanvas.height = imgH;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    if (!offCtx) continue;

    offCtx.drawImage(bmp, 0, 0);
    const imgData = offCtx.getImageData(0, 0, imgW, imgH);

    const transform: [number, number, number, number, number, number] =
      refFrame?.t && refFrame.t.length === 6 ? refFrame.t : [1, 0, 0, 1, 0, 0];
    const bounds = {
      x: refFrame?.x || 0,
      y: refFrame?.y || 0,
      w: refFrame?.w > 0 ? refFrame.w : imgW,
      h: refFrame?.h > 0 ? refFrame.h : imgH,
    };

    const modified = applyFeatherToRgbaPixels(
      imgData.data,
      imgW,
      imgH,
      canvasW,
      canvasH,
      transform,
      bounds,
      cfg
    );

    if (modified) {
      offCtx.putImageData(imgData, 0, 0);
      const newPngBytes = await new Promise<Uint8Array>((resolve) => {
        offCanvas.toBlob((blob) => {
          if (!blob) {
            resolve(rawBytes);
            return;
          }
          blob.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)));
        }, 'image/png');
      });

      updatedImages[key] = newPngBytes;
      if (typeof createImageBitmap === 'function') {
        try {
          const newBmp = await createImageBitmap(new Blob([newPngBytes as unknown as BlobPart], { type: 'image/png' }));
          updatedBitmaps[key] = newBmp;
        } catch (_) {}
      }
      bakedCount++;
    }
  }

  return { updatedImages, updatedBitmaps, bakedCount };
}


