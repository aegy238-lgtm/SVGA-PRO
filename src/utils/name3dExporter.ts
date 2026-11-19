import { lzw } from './codecs';
import { Name3DConfig } from './name3dGeometry';

/**
 * Draws the configured solid/gradient background + radial glow onto a 2D canvas context.
 */
export function drawName3DBackgroundTo2D(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: Name3DConfig,
  forceTransparent = false
): void {
  ctx.clearRect(0, 0, width, height);
  if (forceTransparent || config.bgMode === 'transparent') {
    return;
  }

  if (config.bgMode === 'solid') {
    ctx.fillStyle = config.bgColor || '#07070c';
    ctx.fillRect(0, 0, width, height);
  } else {
    const rad = ((config.bgGradientAngle ?? 180) * Math.PI) / 180;
    const cx = width * 0.5;
    const cy = height * 0.5;
    const r = Math.hypot(width, height) * 0.5;
    const x0 = cx - Math.cos(rad) * r;
    const y0 = cy - Math.sin(rad) * r;
    const x1 = cx + Math.cos(rad) * r;
    const y1 = cy + Math.sin(rad) * r;
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    const stops = config.bgGradientColors || ['#131320', '#090910', '#040407'];
    grad.addColorStop(0, stops[0] || '#131320');
    grad.addColorStop(0.5, stops[1] || '#090910');
    grad.addColorStop(1, stops[2] || '#040407');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // Ambient center spotlight glow
  if (config.bgGlowIntensity > 0) {
    const alpha = Math.min(0.65, (config.bgGlowIntensity / 100) * 0.55);
    const radial = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      width * 0.04,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.52
    );
    radial.addColorStop(0, hexToRgba(config.bgGlowColor || '#f59e0b', alpha));
    radial.addColorStop(0.55, hexToRgba(config.bgGlowColor || '#f59e0b', alpha * 0.25));
    radial.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);
  }
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = (hex || '#ffffff').replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

/**
 * Encodes an array of RGBA ImageData frames into a looping GIF89a Blob using median-cut quantization + LZW.
 */
export function encodeRgbaFramesToGifBlob(
  frames: Uint8ClampedArray[],
  width: number,
  height: number,
  fps: number,
  transparent = false
): Blob {
  // Sample pixels across frames for a rich 255-color median-cut palette (index 255 reserved for transparency)
  const sample: number[] = [];
  const step = Math.max(1, Math.floor((width * height * frames.length) / 28000));
  for (const data of frames) {
    for (let i = 0; i < data.length; i += 4 * step) {
      if (data[i + 3] >= 128) {
        sample.push((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      }
    }
  }
  if (sample.length === 0) sample.push(0x000000);

  let buckets: number[][] = [sample];
  while (buckets.length < 255) {
    let bestIdx = -1;
    let bestRange = 0;
    let bestShift = 16;
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (b.length < 2) continue;
      let rMin = 255,
        rMax = 0,
        gMin = 255,
        gMax = 0,
        bMin = 255,
        bMax = 0;
      for (let j = 0; j < b.length; j++) {
        const p = b[j];
        const r = (p >> 16) & 255;
        const g = (p >> 8) & 255;
        const bl = p & 255;
        if (r < rMin) rMin = r;
        if (r > rMax) rMax = r;
        if (g < gMin) gMin = g;
        if (g > gMax) gMax = g;
        if (bl < bMin) bMin = bl;
        if (bl > bMax) bMax = bl;
      }
      const rr = rMax - rMin;
      const gg = gMax - gMin;
      const bb = bMax - bMin;
      const rng = Math.max(rr, gg, bb);
      if (rng > bestRange) {
        bestRange = rng;
        bestIdx = i;
        bestShift = rr >= gg && rr >= bb ? 16 : gg >= bb ? 8 : 0;
      }
    }
    if (bestIdx < 0) break;
    const b = buckets[bestIdx];
    b.sort((a, c) => ((a >> bestShift) & 255) - ((c >> bestShift) & 255));
    const mid = b.length >> 1;
    buckets.splice(bestIdx, 1, b.slice(0, mid), b.slice(mid));
  }

  const pal: [number, number, number][] = buckets.map((b) => {
    let r = 0,
      g = 0,
      bl = 0;
    for (const p of b) {
      r += (p >> 16) & 255;
      g += (p >> 8) & 255;
      bl += p & 255;
    }
    return [Math.round(r / b.length), Math.round(g / b.length), Math.round(bl / b.length)];
  });

  const cache = new Int16Array(32768).fill(-1);
  const findIdx = (r: number, g: number, b: number): number => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const cached = cache[key];
    if (cached >= 0) return cached;
    let best = 0;
    let bestDist = 1e9;
    const rr = (r & 248) | 4;
    const gg = (g & 248) | 4;
    const bb = (b & 248) | 4;
    for (let i = 0; i < pal.length; i++) {
      const p = pal[i];
      const d = (p[0] - rr) ** 2 + (p[1] - gg) ** 2 + (p[2] - bb) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    cache[key] = best;
    return best;
  };

  const out: number[] = [];
  const w2 = (v: number) => out.push(v & 255, (v >> 8) & 255);
  // Header GIF89a
  out.push(71, 73, 70, 56, 57, 97);
  w2(width);
  w2(height);
  out.push(247, 0, 0);
  for (let i = 0; i < 256; i++) {
    const c = pal[i] || [0, 0, 0];
    out.push(c[0], c[1], c[2]);
  }
  // Netscape 2.0 infinite loop extension
  out.push(33, 255, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0);

  const delayCs = Math.max(2, Math.round(100 / Math.max(1, fps)));
  const gceFlags = transparent ? 9 : 4; // disposal 2 (restore bg) + transparent flag if transparent

  for (const data of frames) {
    const px = new Uint8Array(width * height);
    for (let i = 0, j = 0; j < px.length; i += 4, j++) {
      px[j] = transparent && data[i + 3] < 96 ? 255 : findIdx(data[i], data[i + 1], data[i + 2]);
    }
    out.push(33, 249, 4, gceFlags);
    w2(delayCs);
    out.push(255, 0, 44);
    w2(0);
    w2(0);
    w2(width);
    w2(height);
    out.push(0, 8);
    const compressed = lzw(px);
    for (let i = 0; i < compressed.length; i += 255) {
      const slice = compressed.slice(i, i + 255);
      out.push(slice.length, ...slice);
    }
    out.push(0);
  }
  out.push(59);
  return new Blob([new Uint8Array(out)], { type: 'image/gif' });
}

/**
 * Encodes an animation rendered via `renderFrame(ctx, frameIndex, totalFrames)` into an MP4 video Blob
 * using WebCodecs + Mp4Muxer (with automatic MediaRecorder fallback).
 */
export async function encodeName3DVideoMp4(params: {
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  renderFrame: (ctx: CanvasRenderingContext2D, frameIndex: number, totalFrames: number) => void;
  onProgress?: (pct: number) => void;
}): Promise<{ blob: Blob; ext: 'mp4' | 'webm' }> {
  const width = Math.ceil(params.width / 2) * 2;
  const height = Math.ceil(params.height / 2) * 2;
  const fps = Math.max(15, Math.min(60, Math.round(params.fps)));
  const totalFrames = Math.max(10, params.totalFrames);

  const w = window as any;
  const Mp4Muxer = w.Mp4Muxer;

  // Path 1: WebCodecs VideoEncoder + Mp4Muxer -> genuine H.264 MP4
  if (typeof w.VideoEncoder === 'function' && typeof w.VideoFrame === 'function' && Mp4Muxer) {
    const codecCandidates = ['avc1.640028', 'avc1.4d0028', 'avc1.420028', 'avc1.42E01E'];
    let chosenConfig: any = null;
    for (const codec of codecCandidates) {
      const candidate = {
        codec,
        width,
        height,
        bitrate: Math.round(Math.min(18_000_000, Math.max(3_500_000, width * height * fps * 0.22))),
        framerate: fps,
        avc: { format: 'avc' },
      };
      try {
        const res = await w.VideoEncoder.isConfigSupported(candidate);
        if (res?.supported) {
          chosenConfig = candidate;
          break;
        }
      } catch {
        // try next codec
      }
    }

    if (chosenConfig) {
      const target = new Mp4Muxer.ArrayBufferTarget();
      const muxer = new Mp4Muxer.Muxer({
        target,
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
        video: { codec: 'avc', width, height, frameRate: fps },
      });

      let encodeError: any = null;
      const encoder = new w.VideoEncoder({
        output: (chunk: any, meta: any) => {
          muxer.addVideoChunk(chunk, meta);
        },
        error: (err: any) => {
          encodeError = err;
        },
      });
      encoder.configure(chosenConfig);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Canvas 2D context unavailable');

      for (let k = 0; k < totalFrames; k++) {
        if (encodeError) throw encodeError;
        params.renderFrame(ctx, k, totalFrames);
        const tsUs = Math.round((k * 1_000_000) / fps);
        const durUs = Math.round(1_000_000 / fps);
        const vf = new w.VideoFrame(canvas, { timestamp: tsUs, duration: durUs });
        try {
          encoder.encode(vf, { keyFrame: k % fps === 0 });
        } finally {
          vf.close();
        }
        if (k % 3 === 0) {
          params.onProgress?.(Math.round(((k + 1) / totalFrames) * 92));
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      await encoder.flush();
      encoder.close();
      if (encodeError) throw encodeError;
      muxer.finalize();
      params.onProgress?.(100);
      return {
        blob: new Blob([target.buffer], { type: 'video/mp4' }),
        ext: 'mp4',
      };
    }
  }

  // Path 2: MediaRecorder fallback (MP4 if supported, otherwise WebM)
  const mimeCandidates = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  const mime =
    typeof MediaRecorder !== 'undefined'
      ? mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m))
      : undefined;
  if (!mime) {
    throw new Error('Video export is not supported in this browser.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const stream = canvas.captureStream(fps);
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 6_000_000,
  });
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const stoppedPromise = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start();
  const frameIntervalMs = 1000 / fps;
  for (let k = 0; k < totalFrames; k++) {
    params.renderFrame(ctx, k, totalFrames);
    params.onProgress?.(Math.round(((k + 1) / totalFrames) * 95));
    await new Promise((r) => setTimeout(r, frameIntervalMs));
  }
  recorder.stop();
  await stoppedPromise;
  params.onProgress?.(100);

  const isMp4 = mime.startsWith('video/mp4');
  return {
    blob: new Blob(chunks, { type: mime }),
    ext: isMp4 ? 'mp4' : 'webm',
  };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}
