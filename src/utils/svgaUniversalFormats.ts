import * as jszipNs from 'jszip';
import {
  base64,
  boxes,
  decodeApngFramesRgba,
  demuxAnimatedWebPToSingleFrames,
  encodeAnimatedApng,
  encodeLosslessWebPFrame,
  lotJson,
  lzw,
  muxAnimatedWebPFrames,
  pako,
  parseApngInfo,
  parseAnimatedWebPInfo,
  parseMovie,
  readMeta,
  SvgaMovie,
  SvgaSprite,
  UPNG,
} from './codecs';
import {
  buildVapDynamicMetadataJson,
  evenCeil,
  planVapMaskAtlasLayout,
} from './vapDynamicMaskPacking';
import { serializeDecomposedSvga } from './svgaEditorLogic';

const JSZip: any = (jszipNs as any).default || jszipNs;
const TD = new TextDecoder();
const TE = new TextEncoder();

export const EDITOR_IMPORT_ACCEPT =
  '.svga,.pag,.vap,.yyeva,.mp4,.mov,.webm,.json,.lottie,.gif,.webp,.apng,.png,.jpg,.jpeg,.svg,.zip';

export type EditorExportFormatKey =
  | 'svga'
  | 'pag'
  | 'vap'
  | 'yyeva'
  | 'dual'
  | 'mp4'
  | 'mov'
  | 'webm'
  | 'gif'
  | 'webp'
  | 'apng'
  | 'lottie'
  | 'dotlottie'
  | 'zip'
  | 'ae_script';

export interface EditorExportFormatOption {
  key: EditorExportFormatKey;
  ext: string;
  labelAr: string;
  labelEn: string;
  badge: string;
}

export const EDITOR_EXPORT_FORMATS: EditorExportFormatOption[] = [
  { key: 'svga', ext: 'svga', labelAr: 'SVGA 2.0 مفكك (الطبقات الأصلية)', labelEn: 'SVGA 2.0', badge: 'SVGA' },
  { key: 'pag', ext: 'pag', labelAr: 'PAG (طبقات أصلية)', labelEn: 'PAG', badge: 'PAG' },
  { key: 'vap', ext: 'mp4', labelAr: 'VAP (Tencent Alpha)', labelEn: 'VAP MP4', badge: 'VAP' },
  { key: 'yyeva', ext: 'mp4', labelAr: 'YYEVA (YY Alpha)', labelEn: 'YYEVA MP4', badge: 'YYEVA' },
  { key: 'dual', ext: 'mp4', labelAr: 'Dual Alpha MP4 (RGB+Alpha)', labelEn: 'Dual Alpha', badge: 'DUAL' },
  { key: 'mp4', ext: 'mp4', labelAr: 'فيديو MP4 (H.264)', labelEn: 'MP4 Video', badge: 'MP4' },
  { key: 'mov', ext: 'mov', labelAr: 'فيديو MOV (QuickTime)', labelEn: 'MOV Video', badge: 'MOV' },
  { key: 'webm', ext: 'webm', labelAr: 'فيديو WebM شفاف', labelEn: 'WebM Alpha', badge: 'WEBM' },
  { key: 'gif', ext: 'gif', labelAr: 'صورة متحركة GIF شفاف', labelEn: 'Animated GIF', badge: 'GIF' },
  { key: 'webp', ext: 'webp', labelAr: 'WebP متحرك شفاف', labelEn: 'Animated WebP', badge: 'WEBP' },
  { key: 'apng', ext: 'apng', labelAr: 'APNG متحرك شفاف', labelEn: 'Animated PNG', badge: 'APNG' },
  { key: 'lottie', ext: 'json', labelAr: 'Lottie JSON', labelEn: 'Lottie JSON', badge: 'JSON' },
  { key: 'dotlottie', ext: 'lottie', labelAr: 'DotLottie (.lottie)', labelEn: 'DotLottie', badge: 'LOTTIE' },
  { key: 'zip', ext: 'zip', labelAr: 'حزمة صور متسلسلة PNG ZIP', labelEn: 'PNG Sequence ZIP', badge: 'ZIP' },
  { key: 'ae_script', ext: 'zip', labelAr: 'حزمة After Effects (.jsx + assets)', labelEn: 'After Effects ZIP', badge: 'AE' },
];

export type DetectedInputFormat =
  | 'svga2'
  | 'svga1'
  | 'pag'
  | 'vap'
  | 'yyeva'
  | 'mp4'
  | 'mov'
  | 'webm'
  | 'gif'
  | 'webp'
  | 'apng'
  | 'png'
  | 'jpeg'
  | 'svg'
  | 'lottie'
  | 'dotlottie'
  | 'zip'
  | 'unknown';

export function detectFileFormatFromNameAndBytes(
  fileName: string,
  bytes: Uint8Array
): DetectedInputFormat {
  const lower = (fileName || '').toLowerCase().trim();

  // PAG magic: 'PAG'
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x41 && bytes[2] === 0x47) {
    return 'pag';
  }

  // GIF87a / GIF89a
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return 'gif';
  }

  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'webp';
  }

  // PNG / APNG
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const info = parseApngInfo(bytes);
    if (info?.isApng || lower.endsWith('.apng')) return 'apng';
    return 'png';
  }

  // JPEG
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }

  // WebM / EBML
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return 'webm';
  }

  // ISO BMFF / MP4 / MOV / VAP / YYEVA ('ftyp')
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const meta = readMeta(bytes);
    if (meta?.kind === 'VAP') return 'vap';
    if (meta?.kind === 'YYEVA') return 'yyeva';
    const majorBrand = TD.decode(bytes.subarray(8, 12));
    if (majorBrand === 'qt  ' || lower.endsWith('.mov')) return 'mov';
    if (lower.endsWith('.vap')) return 'vap';
    if (lower.endsWith('.yyeva')) return 'yyeva';
    return 'mp4';
  }

  // ZIP-based: SVGA 1.x, DotLottie (.lottie), generic ZIP
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    if (lower.endsWith('.lottie')) return 'dotlottie';
    if (lower.endsWith('.svga')) return 'svga1';
    return 'zip';
  }

  // Text formats: JSON (Lottie) or SVG
  const sample = TD.decode(bytes.subarray(0, Math.min(2048, bytes.length))).trimStart();
  if (sample.startsWith('{') || lower.endsWith('.json')) {
    return 'lottie';
  }
  if (sample.startsWith('<svg') || sample.startsWith('<?xml') || lower.endsWith('.svg')) {
    return 'svg';
  }

  // Extension fallbacks
  if (lower.endsWith('.svga')) return 'svga2';
  if (lower.endsWith('.pag')) return 'pag';
  if (lower.endsWith('.mov')) return 'mov';
  if (lower.endsWith('.webm')) return 'webm';
  if (lower.endsWith('.mp4')) return 'mp4';

  // Zlib stream header (SVGA 2.0 typically starts with 0x78)
  if (bytes.length >= 2 && bytes[0] === 0x78) {
    return 'svga2';
  }

  return 'unknown';
}

/**
 * Pure TypeScript Animated GIF encoder from RGBA frames using 255-color median/3-3-2 palette + transparency index 0 + LZW.
 */
export function encodeAnimatedGifRgba(
  framesRgba: (Uint8Array | Uint8ClampedArray)[],
  width: number,
  height: number,
  fps: number,
  loopCount = 0
): Uint8Array {
  if (!framesRgba || framesRgba.length === 0) {
    throw new Error('Cannot encode GIF: no frames provided');
  }
  const W = Math.max(1, Math.min(65535, Math.round(width)));
  const H = Math.max(1, Math.min(65535, Math.round(height)));
  const delayCs = Math.max(2, Math.round(100 / Math.max(1, fps || 15)));

  const out: number[] = [];
  const pushAscii = (s: string) => {
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  };
  const pushU16 = (v: number) => {
    out.push(v & 0xff, (v >>> 8) & 0xff);
  };

  // Global Color Table: 256 entries. Index 0 = transparent placeholder; 1..255 = uniform RGB cube / gray ramp
  const pal = new Uint8Array(256 * 3);
  const cubeR = [0, 36, 73, 109, 146, 182, 219, 255];
  const cubeG = [0, 36, 73, 109, 146, 182, 219, 255];
  const cubeB = [0, 85, 170, 255];
  for (let i = 1; i < 256; i++) {
    const r = cubeR[(i >>> 5) & 7];
    const g = cubeG[(i >>> 2) & 7];
    const b = cubeB[i & 3];
    pal[i * 3] = r;
    pal[i * 3 + 1] = g;
    pal[i * 3 + 2] = b;
  }

  // Header & Logical Screen Descriptor
  pushAscii('GIF89a');
  pushU16(W);
  pushU16(H);
  out.push(0xf7, 0, 0); // GCT present, 8-bit resolution, 256 colors (2^(7+1))
  for (let i = 0; i < pal.length; i++) out.push(pal[i]);

  // Netscape 2.0 looping application extension
  out.push(0x21, 0xff, 11);
  pushAscii('NETSCAPE2.0');
  out.push(3, 1);
  pushU16(loopCount & 0xffff);
  out.push(0);

  const pxCount = W * H;
  const idxBuf = new Uint8Array(pxCount);

  for (let fIdx = 0; fIdx < framesRgba.length; fIdx++) {
    const rgba = framesRgba[fIdx];
    for (let p = 0; p < pxCount; p++) {
      const off = p * 4;
      const a = rgba[off + 3] ?? 255;
      if (a < 128) {
        idxBuf[p] = 0;
      } else {
        const q =
          ((rgba[off] >>> 5) << 5) |
          ((rgba[off + 1] >>> 5) << 2) |
          (rgba[off + 2] >>> 6);
        idxBuf[p] = q === 0 ? 1 : q;
      }
    }

    // Graphic Control Extension (Dispose to background = 2, Transparent index = 0)
    out.push(0x21, 0xf9, 4, 0x09);
    pushU16(delayCs);
    out.push(0, 0);

    // Image Descriptor
    out.push(0x2c);
    pushU16(0);
    pushU16(0);
    pushU16(W);
    pushU16(H);
    out.push(0); // no local color table

    // Image Data (LZW minimum code size = 8)
    out.push(8);
    const compressed = lzw(idxBuf);
    for (let i = 0; i < compressed.length; i += 255) {
      const end = Math.min(compressed.length, i + 255);
      out.push(end - i);
      for (let j = i; j < end; j++) out.push(compressed[j]);
    }
    out.push(0);
  }

  out.push(0x3b); // Trailer
  return new Uint8Array(out);
}

/**
 * Builds an ISO BMFF atom/box with 4-byte BE size + 4-byte ASCII type + payload.
 */
export function buildMp4AtomBox(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length, false);
  for (let i = 0; i < 4; i++) {
    out[4 + i] = type.charCodeAt(i) & 0xff;
  }
  out.set(payload, 8);
  return out;
}

function adjustMoovChunkOffsetsInPlace(u: Uint8Array, start: number, end: number, delta: number) {
  let innerBoxes: ReturnType<typeof boxes> = [];
  try {
    innerBoxes = boxes(u, start, end);
  } catch {
    return;
  }
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  for (const bx of innerBoxes) {
    if (bx.type === 'stco') {
      const dataStart = bx.start + bx.header;
      if (dataStart + 8 <= bx.end) {
        const count = dv.getUint32(dataStart + 4, false);
        for (let i = 0; i < count; i++) {
          const entryOff = dataStart + 8 + i * 4;
          if (entryOff + 4 <= bx.end) {
            dv.setUint32(entryOff, dv.getUint32(entryOff, false) + delta, false);
          }
        }
      }
    } else if (bx.type === 'co64') {
      const dataStart = bx.start + bx.header;
      if (dataStart + 8 <= bx.end) {
        const count = dv.getUint32(dataStart + 4, false);
        for (let i = 0; i < count; i++) {
          const entryOff = dataStart + 8 + i * 8;
          if (entryOff + 8 <= bx.end) {
            const cur = dv.getBigUint64(entryOff, false);
            dv.setBigUint64(entryOff, cur + BigInt(delta), false);
          }
        }
      }
    } else if (
      bx.type === 'moov' ||
      bx.type === 'trak' ||
      bx.type === 'mdia' ||
      bx.type === 'minf' ||
      bx.type === 'stbl' ||
      bx.type === 'edts'
    ) {
      adjustMoovChunkOffsetsInPlace(u, bx.start + bx.header, bx.end, delta);
    }
  }
}

/**
 * Packages an MP4 buffer with VAP (`vapc` after `ftyp`, updating `stco`/`co64`) or YYEVA (`yyev` + `yyeffectmp4json` trailer).
 */
export function packageMp4WithVapYyevaMeta(
  mp4Bytes: Uint8Array,
  format: 'vap' | 'yyeva',
  metaJson: Record<string, any>
): Uint8Array {
  const jsonBytes = TE.encode(JSON.stringify(metaJson));
  if (format === 'vap') {
    const topBoxes = boxes(mp4Bytes);
    const ftyp = topBoxes.find((b) => b.type === 'ftyp');
    if (!ftyp) {
      throw new Error('MP4 missing ftyp box for VAP packaging');
    }
    const vapcBox = buildMp4AtomBox('vapc', jsonBytes);
    const copy = new Uint8Array(mp4Bytes);
    // Adjust mdat chunk offsets for moov boxes that follow ftyp
    adjustMoovChunkOffsetsInPlace(copy, ftyp.end, copy.length, vapcBox.length);
    const out = new Uint8Array(copy.length + vapcBox.length);
    out.set(copy.subarray(0, ftyp.end), 0);
    out.set(vapcBox, ftyp.end);
    out.set(copy.subarray(ftyp.end), ftyp.end + vapcBox.length);
    return out;
  }

  // YYEVA: append yyev box AND standard free/yyeffectmp4json marker after mdat so chunk offsets stay intact
  const yyevBox = buildMp4AtomBox('yyev', jsonBytes);
  const markerPayload = TE.encode(
    `yyeffectmp4json[[${JSON.stringify(metaJson)}]]yyeffectmp4json`
  );
  const freeBox = buildMp4AtomBox('free', markerPayload);
  const out = new Uint8Array(mp4Bytes.length + yyevBox.length + freeBox.length);
  out.set(mp4Bytes, 0);
  out.set(yyevBox, mp4Bytes.length);
  out.set(freeBox, mp4Bytes.length + yyevBox.length);
  return out;
}

/**
 * Builds an editable `SvgaMovie` directly from an array of PNG image buffers.
 * Each frame becomes a sprite or shared static image if only 1 frame exists.
 */
export function buildFramesSvgaMovie(
  framesPngBytes: Uint8Array[],
  W: number,
  H: number,
  fps = 20
): SvgaMovie {
  const safeW = Math.max(1, Math.round(W || 300));
  const safeH = Math.max(1, Math.round(H || 300));
  const safeFps = Math.max(1, Math.round(fps || 20));
  const count = Math.max(1, framesPngBytes.length);
  const im: Record<string, Uint8Array> = {};
  const sp: SvgaSprite[] = [];

  if (count === 1 && framesPngBytes[0]) {
    const key = 'frame_0000';
    im[key] = framesPngBytes[0];
    sp.push({
      key,
      fr: [{ a: 1, x: 0, y: 0, w: safeW, h: safeH, t: [1, 0, 0, 1, 0, 0] }],
    });
  } else {
    for (let i = 0; i < framesPngBytes.length; i++) {
      const bytes = framesPngBytes[i];
      if (!bytes) continue;
      const key = `frame_${String(i).padStart(4, '0')}`;
      im[key] = bytes;
      const fr = new Array(count);
      for (let f = 0; f < count; f++) {
        fr[f] = {
          a: f === i ? 1 : 0,
          x: 0,
          y: 0,
          w: safeW,
          h: safeH,
          t: [1, 0, 0, 1, 0, 0],
        };
      }
      sp.push({ key, fr });
    }
  }

  return {
    w: safeW,
    h: safeH,
    fps: safeFps,
    n: count,
    im,
    sp,
  };
}

/**
 * Parses legacy SVGA 1.x ZIP archive (`movie.spec` JSON + PNG images) into an editable `SvgaMovie`.
 */
export async function parseSvga1ZipToMovie(zipBytes: Uint8Array): Promise<SvgaMovie> {
  const zip = await JSZip.loadAsync(zipBytes);
  const specEntry = zip.file('movie.spec') || zip.file(/movie\.spec$/i)[0];
  if (!specEntry) {
    throw new Error('Archive is not SVGA 1.x (missing movie.spec)');
  }
  const spec = JSON.parse(await specEntry.async('string'));
  const W = Number(spec?.movie?.viewBox?.width || spec?.movie?.width || 300);
  const H = Number(spec?.movie?.viewBox?.height || spec?.movie?.height || 300);
  const fps = Math.max(1, Number(spec?.movie?.fps || 20));
  const n = Math.max(1, Number(spec?.movie?.frames || 1));

  const im: Record<string, Uint8Array> = {};
  const entries = Object.keys(zip.files);
  for (const name of entries) {
    const f = zip.files[name];
    if (f.dir) continue;
    const clean = name.replace(/\.png$/i, '');
    if (/\.(png|jpg|jpeg|webp)$/i.test(name)) {
      const data = await f.async('uint8array');
      im[clean] = data;
      im[name] = data;
    }
  }

  const sp: SvgaSprite[] = (spec?.sprites || []).map((srcSp: any) => ({
    key: String(srcSp?.imageKey || ''),
    mk: srcSp?.matteKey ? String(srcSp.matteKey) : undefined,
    fr: (srcSp?.frames || []).map((fr: any) => {
      const l = fr?.layout || {};
      const tr = fr?.transform || {};
      return {
        a: fr?.alpha ?? 0,
        x: l.x ?? 0,
        y: l.y ?? 0,
        w: l.width ?? 0,
        h: l.height ?? 0,
        t: [
          tr.a ?? 1,
          tr.b ?? 0,
          tr.c ?? 0,
          tr.d ?? 1,
          tr.tx ?? 0,
          tr.ty ?? 0,
        ],
        clipPath: fr?.clipPath || undefined,
      };
    }),
  }));

  return { w: W, h: H, fps, n, im, sp };
}

function rgbaToPngBytes(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number): Uint8Array {
  const buf = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength).slice().buffer;
  return new Uint8Array(UPNG.encode([buf], w, h, 0));
}

async function decodeImageBlobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bm = await createImageBitmap(blob);
      const c = document.createElement('canvas');
      c.width = bm.width;
      c.height = bm.height;
      c.getContext('2d')?.drawImage(bm, 0, 0);
      bm.close();
      return c;
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = url;
    });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width || 300;
    c.height = img.naturalHeight || img.height || 300;
    c.getContext('2d')?.drawImage(img, 0, 0);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function canvasToPngBytes(c: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((r) => c.toBlob((b) => r(b), 'image/png'));
  if (blob) return new Uint8Array(await blob.arrayBuffer());
  const ctx = c.getContext('2d')!;
  const id = ctx.getImageData(0, 0, c.width, c.height);
  return rgbaToPngBytes(id.data, c.width, c.height);
}

async function decodeAnimatedImageViaImageDecoder(
  bytes: Uint8Array,
  mime: string,
  maxFrames = 180
): Promise<{ frames: Uint8Array[]; W: number; H: number; fps: number } | null> {
  const ImageDecoderCtor = (window as any).ImageDecoder;
  if (!ImageDecoderCtor) return null;
  try {
    if (typeof ImageDecoderCtor.isTypeSupported === 'function') {
      const sup = await ImageDecoderCtor.isTypeSupported(mime);
      if (!sup) return null;
    }
    const dec = new ImageDecoderCtor({ data: bytes.slice(), type: mime });
    await dec.tracks.ready;
    const track = dec.tracks.selectedTrack;
    const rawCount = Math.max(1, track?.frameCount || 1);
    const step = Math.max(1, Math.ceil(rawCount / maxFrames));
    const pngFrames: Uint8Array[] = [];
    let W = 0;
    let H = 0;
    let totalDurUs = 0;

    for (let i = 0; i < rawCount; i += step) {
      const res = await dec.decode({ frameIndex: i });
      const vf = res.image;
      if (!W || !H) {
        W = vf.displayWidth || vf.codedWidth || 300;
        H = vf.displayHeight || vf.codedHeight || 300;
      }
      if (vf.duration) totalDurUs += vf.duration;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(vf, 0, 0, W, H);
      vf.close();
      pngFrames.push(await canvasToPngBytes(c));
    }
    try {
      dec.close();
    } catch {}
    if (!pngFrames.length || !W || !H) return null;
    const avgSec = totalDurUs > 0 ? totalDurUs / pngFrames.length / 1e6 : 1 / 20;
    const fps = Math.max(1, Math.min(60, Math.round(1 / Math.max(0.016, avgSec))));
    return { frames: pngFrames, W, H, fps };
  } catch {
    return null;
  }
}

async function decodeVideoOrVapYyevaToSvgaMovie(
  bytes: Uint8Array,
  kind: 'mp4' | 'mov' | 'webm' | 'vap' | 'yyeva',
  overrideMeta?: ReturnType<typeof readMeta>
): Promise<SvgaMovie> {
  const meta = overrideMeta ?? (kind === 'vap' || kind === 'yyeva' ? readMeta(bytes) : null);
  const mime =
    kind === 'webm'
      ? 'video/webm'
      : kind === 'mov'
        ? 'video/quicktime'
        : 'video/mp4';
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: mime }));
  const vid = document.createElement('video');
  vid.muted = true;
  vid.playsInline = true;
  vid.preload = 'auto';
  vid.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Video load timed out')), 12000);
      vid.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      vid.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Browser could not decode this video'));
      };
    });

    const vw = vid.videoWidth || meta?.videoW || meta?.c?.[2] || 500;
    const vh = vid.videoHeight || meta?.videoH || meta?.c?.[3] || 500;
    const dur = Math.max(0.1, Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 2);
    const srcFps = Math.max(10, Math.min(30, meta?.fps || 20));
    const maxFrames = 180;
    const targetCount = Math.max(1, Math.min(maxFrames, Math.round(dur * srcFps)));
    const outFps = Math.max(1, Math.min(30, Math.round(targetCount / dur)));

    const outW = meta?.c?.[2] || vw;
    const outH = meta?.c?.[3] || vh;

    const srcCvs = document.createElement('canvas');
    srcCvs.width = vw;
    srcCvs.height = vh;
    const srcCtx = srcCvs.getContext('2d', { willReadFrequently: true })!;

    const outCvs = document.createElement('canvas');
    outCvs.width = outW;
    outCvs.height = outH;
    const outCtx = outCvs.getContext('2d', { willReadFrequently: true })!;

    const rgbCvs = document.createElement('canvas');
    rgbCvs.width = outW;
    rgbCvs.height = outH;
    const rgbCtx = rgbCvs.getContext('2d', { willReadFrequently: true })!;

    const alpCvs = document.createElement('canvas');
    alpCvs.width = outW;
    alpCvs.height = outH;
    const alpCtx = alpCvs.getContext('2d', { willReadFrequently: true })!;

    const pngFrames: Uint8Array[] = [];
    for (let i = 0; i < targetCount; i++) {
      const progress = targetCount > 1 ? i / (targetCount - 1) : 0;
      const targetTime = Math.min(Math.max(0, dur - 0.02), progress * Math.max(0, dur - 0.02));
      await new Promise<void>((resolve) => {
        const done = () => {
          vid.onseeked = null;
          resolve();
        };
        vid.onseeked = done;
        setTimeout(done, 450);
        try {
          vid.currentTime = Math.max(0, targetTime);
        } catch {
          done();
        }
      });

      if (meta && meta.c && meta.c.length >= 4 && meta.a && meta.a.length >= 4) {
        srcCtx.clearRect(0, 0, vw, vh);
        srcCtx.drawImage(vid, 0, 0, vw, vh);
        const [rx, ry, rw, rh] = meta.c;
        const [ax, ay, aw, ah] = meta.a;
        rgbCtx.clearRect(0, 0, outW, outH);
        rgbCtx.drawImage(srcCvs, rx, ry, rw, rh, 0, 0, outW, outH);
        alpCtx.clearRect(0, 0, outW, outH);
        alpCtx.drawImage(srcCvs, ax, ay, aw, ah, 0, 0, outW, outH);

        const rgbImg = rgbCtx.getImageData(0, 0, outW, outH);
        const alpImg = alpCtx.getImageData(0, 0, outW, outH);
        const rd = rgbImg.data;
        const ad = alpImg.data;
        for (let p = 0; p < rd.length; p += 4) {
          const lum = Math.round(ad[p] * 0.299 + ad[p + 1] * 0.587 + ad[p + 2] * 0.114);
          rd[p + 3] = lum;
        }
        outCtx.putImageData(rgbImg, 0, 0);
      } else {
        outCtx.clearRect(0, 0, outW, outH);
        outCtx.drawImage(vid, 0, 0, outW, outH);
      }
      pngFrames.push(await canvasToPngBytes(outCvs));
    }

    return buildFramesSvgaMovie(pngFrames, outW, outH, outFps);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function ensureLottiePlayerLoaded(): Promise<any> {
  if ((window as any).lottie?.loadAnimation) return (window as any).lottie;
  const cdns = [
    'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js',
    'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js',
  ];
  for (const src of cdns) {
    try {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Lottie CDN load failed'));
        document.head.appendChild(s);
      });
      if ((window as any).lottie?.loadAnimation) return (window as any).lottie;
    } catch {}
  }
  throw new Error('Could not load lottie player');
}

async function decodeLottieJsonObjectToSvgaMovie(lottieObj: any): Promise<SvgaMovie> {
  const W = Math.max(1, Math.round(Number(lottieObj?.w || 500)));
  const H = Math.max(1, Math.round(Number(lottieObj?.h || 500)));
  const fps = Math.max(1, Math.min(60, Math.round(Number(lottieObj?.fr || 24))));
  const ip = Number(lottieObj?.ip || 0);
  const op = Math.max(ip + 1, Number(lottieObj?.op || ip + 30));
  const totalRaw = Math.max(1, Math.round(op - ip));

  // Fast path: if Lottie contains embedded image assets or vector-only layers, use lottie-web canvas renderer
  try {
    const lottie = await ensureLottiePlayerLoaded();
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${W}px;height:${H}px;opacity:0;pointer-events:none;`;
    document.body.appendChild(host);
    try {
      const anim = lottie.loadAnimation({
        container: host,
        renderer: 'canvas',
        loop: false,
        autoplay: false,
        animationData: JSON.parse(JSON.stringify(lottieObj)),
        rendererSettings: { clearCanvas: true, preserveAspectRatio: 'xMidYMid meet' },
      });
      await new Promise<void>((resolve) => {
        if (anim.isLoaded) return resolve();
        anim.addEventListener('DOMLoaded', () => resolve());
        setTimeout(resolve, 1000);
      });
      const step = Math.max(1, Math.ceil(totalRaw / 180));
      const pngFrames: Uint8Array[] = [];
      for (let f = 0; f < totalRaw; f += step) {
        anim.goToAndStop(ip + f, true);
        const cvs = host.querySelector('canvas');
        if (cvs) {
          pngFrames.push(await canvasToPngBytes(cvs));
        }
      }
      anim.destroy();
      if (pngFrames.length > 0) {
        return buildFramesSvgaMovie(pngFrames, W, H, Math.max(1, Math.round(fps / step)));
      }
    } finally {
      host.remove();
    }
  } catch {
    // Fallback below if offline / lottie CDN blocked: extract embedded image assets or render clean placeholder layer
  }

  const assets = Array.isArray(lottieObj?.assets) ? lottieObj.assets : [];
  const embeddedFrames: Uint8Array[] = [];
  for (const a of assets) {
    if (typeof a?.p === 'string' && a.p.startsWith('data:image/')) {
      const b64 = a.p.split(',')[1];
      if (b64) {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        embeddedFrames.push(arr);
      }
    }
  }
  if (embeddedFrames.length > 0) {
    return buildFramesSvgaMovie(embeddedFrames, W, H, fps);
  }

  // Vector fallback badge canvas so offline mode still opens & edits Lottie cleanly
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(124, 92, 255, 0.16)';
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth = 4;
  ctx.fillRect(16, 16, W - 32, H - 32);
  ctx.strokeRect(16, 16, W - 32, H - 32);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(lottieObj?.nm || 'Lottie'), W / 2, H / 2);
  return buildFramesSvgaMovie([await canvasToPngBytes(c)], W, H, fps);
}

/**
 * Decodes ANY supported platform format (.svga, .pag, .vap, .yyeva, .mp4, .mov, .webm, .json Lottie,
 * .lottie DotLottie, .gif, .webp, .apng, .svg, .zip, .png, .jpg) into an editable `SvgaMovie`.
 */
export async function decodeUniversalFileToSvgaMovie(
  buf: ArrayBuffer,
  fileName: string
): Promise<{ movie: SvgaMovie; detectedFormat: DetectedInputFormat }> {
  const bytes = new Uint8Array(buf);
  const detectedFormat = detectFileFormatFromNameAndBytes(fileName, bytes);

  if (detectedFormat === 'svga2') {
    let inflated: Uint8Array;
    try {
      inflated = pako.inflate(bytes);
    } catch {
      inflated = bytes;
    }
    return { movie: parseMovie(inflated), detectedFormat };
  }

  if (detectedFormat === 'svga1') {
    return { movie: await parseSvga1ZipToMovie(bytes), detectedFormat };
  }

  if (detectedFormat === 'pag') {
    const { decodePagWithLibpagFallback } = await import('./pagEngine');
    const dec = await decodePagWithLibpagFallback(bytes);
    return { movie: dec.svgaMovie, detectedFormat };
  }

  if (detectedFormat === 'apng') {
    const dec = decodeApngFramesRgba(bytes);
    const pngs = dec.frames.map((rgba) => rgbaToPngBytes(rgba, dec.width, dec.height));
    const avgMs = dec.delaysMs.reduce((a, b) => a + b, 0) / Math.max(1, dec.delaysMs.length);
    const fps = Math.max(1, Math.min(60, Math.round(1000 / Math.max(16, avgMs))));
    return { movie: buildFramesSvgaMovie(pngs, dec.width, dec.height, fps), detectedFormat };
  }

  if (detectedFormat === 'webp') {
    const info = parseAnimatedWebPInfo(bytes);
    if (info?.isAnimated) {
      const decViaApi = await decodeAnimatedImageViaImageDecoder(bytes, 'image/webp');
      if (decViaApi) {
        return {
          movie: buildFramesSvgaMovie(decViaApi.frames, decViaApi.W, decViaApi.H, decViaApi.fps),
          detectedFormat,
        };
      }
      const demuxed = demuxAnimatedWebPToSingleFrames(bytes);
      const pngs: Uint8Array[] = [];
      for (const fr of demuxed.frames) {
        const c = await decodeImageBlobToCanvas(new Blob([fr.slice()], { type: 'image/webp' }));
        pngs.push(await canvasToPngBytes(c));
      }
      const avgMs =
        demuxed.durationsMs.reduce((a, b) => a + b, 0) / Math.max(1, demuxed.durationsMs.length);
      const fps = Math.max(1, Math.min(60, Math.round(1000 / Math.max(16, avgMs))));
      return {
        movie: buildFramesSvgaMovie(pngs, demuxed.width, demuxed.height, fps),
        detectedFormat,
      };
    }
    const c = await decodeImageBlobToCanvas(new Blob([bytes.slice()], { type: 'image/webp' }));
    return {
      movie: buildFramesSvgaMovie([await canvasToPngBytes(c)], c.width, c.height, 20),
      detectedFormat,
    };
  }

  if (detectedFormat === 'gif') {
    const decViaApi = await decodeAnimatedImageViaImageDecoder(bytes, 'image/gif');
    if (decViaApi) {
      return {
        movie: buildFramesSvgaMovie(decViaApi.frames, decViaApi.W, decViaApi.H, decViaApi.fps),
        detectedFormat,
      };
    }
    const c = await decodeImageBlobToCanvas(new Blob([bytes.slice()], { type: 'image/gif' }));
    return {
      movie: buildFramesSvgaMovie([await canvasToPngBytes(c)], c.width, c.height, 20),
      detectedFormat,
    };
  }

  if (
    detectedFormat === 'mp4' ||
    detectedFormat === 'mov' ||
    detectedFormat === 'webm' ||
    detectedFormat === 'vap' ||
    detectedFormat === 'yyeva'
  ) {
    return {
      movie: await decodeVideoOrVapYyevaToSvgaMovie(bytes, detectedFormat),
      detectedFormat,
    };
  }

  if (detectedFormat === 'lottie') {
    const jsonObj = JSON.parse(TD.decode(bytes));
    return {
      movie: await decodeLottieJsonObjectToSvgaMovie(jsonObj),
      detectedFormat,
    };
  }

  if (detectedFormat === 'dotlottie') {
    const zip = await JSZip.loadAsync(bytes);
    const animFile =
      zip.file(/^animations\/.*\.json$/i)[0] ||
      zip.file(/\.json$/i).find((f: any) => !/manifest\.json$/i.test(f.name));
    if (!animFile) throw new Error('DotLottie archive missing animation JSON');
    const jsonObj = JSON.parse(await animFile.async('string'));
    // Resolve external image assets inside DotLottie if present
    if (Array.isArray(jsonObj.assets)) {
      for (const a of jsonObj.assets) {
        if (a?.p && !String(a.p).startsWith('data:')) {
          const candidate =
            zip.file(`images/${a.p}`) || zip.file(new RegExp(`${String(a.p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'))[0];
          if (candidate) {
            const b64 = await candidate.async('base64');
            const ext = /\.jpe?g$/i.test(a.p) ? 'jpeg' : /\.webp$/i.test(a.p) ? 'webp' : 'png';
            a.u = '';
            a.p = `data:image/${ext};base64,${b64}`;
            a.e = 1;
          }
        }
      }
    }
    return {
      movie: await decodeLottieJsonObjectToSvgaMovie(jsonObj),
      detectedFormat,
    };
  }

  if (detectedFormat === 'zip') {
    const zip = await JSZip.loadAsync(bytes);
    // Check if ZIP is actually SVGA 1.x
    if (zip.file('movie.spec')) {
      return { movie: await parseSvga1ZipToMovie(bytes), detectedFormat: 'svga1' };
    }
    // Check if ZIP contains VAP/YYEVA MP4 + JSON pair
    const mp4Entry = zip.file(/\.(mp4|mov|webm)$/i)[0];
    const jsonEntry = zip.file(/\.json$/i)[0];
    if (mp4Entry) {
      const mp4Bytes = await mp4Entry.async('uint8array');
      let pairedMeta = null;
      if (jsonEntry) {
        try {
          const obj = JSON.parse(await jsonEntry.async('string'));
          const { metaFromAnyObject } = await import('./vapYyevaDetection');
          pairedMeta = metaFromAnyObject(obj, obj?.info ? 'VAP' : 'YYEVA');
        } catch {}
      }
      return {
        movie: await decodeVideoOrVapYyevaToSvgaMovie(
          mp4Bytes,
          pairedMeta?.kind === 'VAP' ? 'vap' : pairedMeta?.kind === 'YYEVA' ? 'yyeva' : 'mp4',
          pairedMeta
        ),
        detectedFormat: pairedMeta?.kind === 'VAP' ? 'vap' : pairedMeta?.kind === 'YYEVA' ? 'yyeva' : 'zip',
      };
    }
    // Otherwise collect sorted image sequence inside ZIP
    const imgEntries = zip
      .file(/\.(png|jpe?g|webp|svg)$/i)
      .sort((a: any, b: any) =>
        String(a.name).localeCompare(String(b.name), undefined, { numeric: true })
      )
      .slice(0, 90);
    if (!imgEntries.length) {
      throw new Error('ZIP archive contains no supported animation or image frames');
    }
    const pngs: Uint8Array[] = [];
    let W = 0;
    let H = 0;
    for (const entry of imgEntries) {
      const u = await entry.async('uint8array');
      const mime = /\.jpe?g$/i.test(entry.name)
        ? 'image/jpeg'
        : /\.webp$/i.test(entry.name)
          ? 'image/webp'
          : /\.svg$/i.test(entry.name)
            ? 'image/svg+xml'
            : 'image/png';
      const c = await decodeImageBlobToCanvas(new Blob([u.slice()], { type: mime }));
      if (!W || !H) {
        W = c.width;
        H = c.height;
      }
      if (c.width !== W || c.height !== H) {
        const norm = document.createElement('canvas');
        norm.width = W;
        norm.height = H;
        norm.getContext('2d')?.drawImage(c, 0, 0, W, H);
        pngs.push(await canvasToPngBytes(norm));
      } else {
        pngs.push(await canvasToPngBytes(c));
      }
    }
    return { movie: buildFramesSvgaMovie(pngs, W, H, 20), detectedFormat };
  }

  if (detectedFormat === 'svg') {
    const c = await decodeImageBlobToCanvas(new Blob([bytes.slice()], { type: 'image/svg+xml' }));
    return {
      movie: buildFramesSvgaMovie([await canvasToPngBytes(c)], c.width, c.height, 20),
      detectedFormat,
    };
  }

  // Fallback for PNG/JPEG or any image
  const imgMime =
    detectedFormat === 'jpeg'
      ? 'image/jpeg'
      : detectedFormat === 'png'
        ? 'image/png'
        : 'image/png';
  const c = await decodeImageBlobToCanvas(new Blob([bytes.slice()], { type: imgMime }));
  return {
    movie: buildFramesSvgaMovie([await canvasToPngBytes(c)], c.width, c.height, 20),
    detectedFormat: detectedFormat === 'unknown' ? 'png' : detectedFormat,
  };
}

async function ensureMp4MuxerLoaded(): Promise<any> {
  if ((window as any).Mp4Muxer) return (window as any).Mp4Muxer;
  const cdns = [
    'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/build/mp4-muxer.js',
    'https://cdn.jsdelivr.net/npm/mp4-muxer@4.3.0/build/mp4-muxer.js',
  ];
  for (const src of cdns) {
    try {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Mp4Muxer CDN failed'));
        document.head.appendChild(s);
      });
      if ((window as any).Mp4Muxer) return (window as any).Mp4Muxer;
    } catch {}
  }
  return null;
}

async function encodeCanvasFramesToMp4Bytes(
  VW: number,
  VH: number,
  fps: number,
  totalFrames: number,
  paintVideoFrame: (ctx: CanvasRenderingContext2D, frameIdx: number) => void
): Promise<{ bytes: Uint8Array; actualExt: 'mp4' | 'webm' }> {
  const Mp4Muxer = await ensureMp4MuxerLoaded();
  if (
    Mp4Muxer &&
    typeof (window as any).VideoEncoder !== 'undefined' &&
    typeof (window as any).VideoFrame !== 'undefined'
  ) {
    const codecCandidates = ['avc1.640028', 'avc1.4D4028', 'avc1.42E01F', 'avc1.42001E'];
    let supportedConfig: any = null;
    for (const codec of codecCandidates) {
      const cfg = {
        codec,
        width: VW,
        height: VH,
        bitrate: Math.round(Math.min(40e6, Math.max(2.5e6, VW * VH * fps * 0.25))),
        framerate: fps,
        avc: { format: 'avc' },
      };
      try {
        if ((await (window as any).VideoEncoder.isConfigSupported(cfg)).supported) {
          supportedConfig = cfg;
          break;
        }
      } catch {}
    }

    if (supportedConfig) {
      const target = new Mp4Muxer.ArrayBufferTarget();
      const mux = new Mp4Muxer.Muxer({
        target,
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
        video: { codec: 'avc', width: VW, height: VH, frameRate: fps },
      });
      const chunks: any[] = [];
      let encErr: any = null;
      const ve = new (window as any).VideoEncoder({
        output: (chunk: any, meta: any) => chunks.push({ chunk, meta }),
        error: (e: any) => {
          encErr = e;
        },
      });
      ve.configure(supportedConfig);

      const cvs = document.createElement('canvas');
      cvs.width = VW;
      cvs.height = VH;
      const ctx = cvs.getContext('2d', { alpha: false })!;
      const keyInterval = Math.max(1, Math.round(fps));

      for (let k = 0; k < totalFrames; k++) {
        if (encErr) throw encErr;
        paintVideoFrame(ctx, k);
        const tsUs = Math.round((k * 1e6) / fps);
        const nextTsUs = Math.round(((k + 1) * 1e6) / fps);
        const vf = new (window as any).VideoFrame(cvs, {
          timestamp: tsUs,
          duration: Math.max(1, nextTsUs - tsUs),
        });
        ve.encode(vf, { keyFrame: k % keyInterval === 0 });
        vf.close();
        while (ve.encodeQueueSize > 3) {
          await new Promise((r) => setTimeout(r, 4));
        }
      }
      await ve.flush();
      ve.close();
      if (encErr) throw encErr;
      for (const c of chunks) {
        mux.addVideoChunk(c.chunk, c.meta);
      }
      mux.finalize();
      return { bytes: new Uint8Array(target.buffer), actualExt: 'mp4' };
    }
  }

  // Fallback via MediaRecorder if WebCodecs H.264 is unavailable
  const cvs = document.createElement('canvas');
  cvs.width = VW;
  cvs.height = VH;
  const ctx = cvs.getContext('2d')!;
  const stream = cvs.captureStream(fps);
  const mimes = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mimeType = mimes.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';
  const isMp4 = mimeType.includes('mp4');
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6000000 });
  const recorded: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) recorded.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
  });
  rec.start();
  const frameMs = Math.max(16, Math.round(1000 / Math.max(1, fps)));
  for (let k = 0; k < totalFrames; k++) {
    paintVideoFrame(ctx, k);
    await new Promise((r) => setTimeout(r, frameMs));
  }
  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(recorded, { type: mimeType });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), actualExt: isMp4 ? 'mp4' : 'webm' };
}

async function encodeTransparentWebmBlob(
  W: number,
  H: number,
  fps: number,
  totalFrames: number,
  renderFrame: (ctx: CanvasRenderingContext2D, frameIdx: number) => void
): Promise<Blob> {
  const cvs = document.createElement('canvas');
  cvs.width = W;
  cvs.height = H;
  const ctx = cvs.getContext('2d')!;
  const stream = cvs.captureStream(fps);
  const mimes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType = mimes.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6000000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
  });
  rec.start();
  const frameMs = Math.max(16, Math.round(1000 / Math.max(1, fps)));
  for (let k = 0; k < totalFrames; k++) {
    ctx.clearRect(0, 0, W, H);
    renderFrame(ctx, k);
    await new Promise((r) => setTimeout(r, frameMs));
  }
  rec.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  return new Blob(chunks, { type: 'video/webm' });
}

export interface UniversalExportParams {
  format: EditorExportFormatKey;
  baseName: string;
  W: number;
  H: number;
  fps: number;
  totalFrames: number;
  renderFrameToCanvas: (ctx: CanvasRenderingContext2D, W: number, H: number, frameIdx: number) => void;
  buildSvgaBlob: () => Promise<Blob>;
  exportPagFile: () => Promise<void>;
  exportAeZipFile: () => Promise<void>;
  onProgress?: (msg: string) => void;
}

export async function exportCompositeFramesToFormat(
  params: UniversalExportParams
): Promise<{ blob: Blob; fileName: string } | null> {
  const {
    format,
    baseName,
    W,
    H,
    fps,
    totalFrames,
    renderFrameToCanvas,
    buildSvgaBlob,
    exportPagFile,
    exportAeZipFile,
    onProgress,
  } = params;

  const cleanBase = (baseName || 'animation').replace(/\.[^.]+$/, '') || 'animation';
  const safeW = Math.max(2, Math.round(W || 300));
  const safeH = Math.max(2, Math.round(H || 300));
  const safeFps = Math.max(1, Math.round(fps || 20));
  const count = Math.max(1, Math.round(totalFrames || 1));

  if (format === 'svga') {
    onProgress?.('جاري تصدير SVGA 2.0 المفكك...');
    const blob = await buildSvgaBlob();
    return { blob, fileName: `${cleanBase}_edited.svga` };
  }

  if (format === 'pag') {
    onProgress?.('جاري تصدير PAG المفكك...');
    await exportPagFile();
    return null;
  }

  if (format === 'ae_script') {
    onProgress?.('جاري بناء حزمة After Effects (.jsx + assets)...');
    await exportAeZipFile();
    return null;
  }

  const workCvs = document.createElement('canvas');
  workCvs.width = safeW;
  workCvs.height = safeH;
  const workCtx = workCvs.getContext('2d', { willReadFrequently: true })!;

  if (format === 'gif') {
    const rgbaFrames: Uint8Array[] = [];
    for (let k = 0; k < count; k++) {
      onProgress?.(`تجهيز إطارات GIF (${k + 1}/${count})...`);
      workCtx.clearRect(0, 0, safeW, safeH);
      renderFrameToCanvas(workCtx, safeW, safeH, k);
      rgbaFrames.push(new Uint8Array(workCtx.getImageData(0, 0, safeW, safeH).data.buffer.slice(0)));
    }
    const gifBytes = encodeAnimatedGifRgba(rgbaFrames, safeW, safeH, safeFps, 0);
    return { blob: new Blob([gifBytes.slice()], { type: 'image/gif' }), fileName: `${cleanBase}.gif` };
  }

  if (format === 'apng') {
    const rgbaFrames: Uint8Array[] = [];
    for (let k = 0; k < count; k++) {
      onProgress?.(`تجهيز إطارات APNG (${k + 1}/${count})...`);
      workCtx.clearRect(0, 0, safeW, safeH);
      renderFrameToCanvas(workCtx, safeW, safeH, k);
      rgbaFrames.push(new Uint8Array(workCtx.getImageData(0, 0, safeW, safeH).data.buffer.slice(0)));
    }
    const apngBytes = encodeAnimatedApng(rgbaFrames, safeW, safeH, safeFps, 1, 0);
    return { blob: new Blob([apngBytes.slice()], { type: 'image/apng' }), fileName: `${cleanBase}.apng` };
  }

  if (format === 'webp') {
    const webpFrames: Uint8Array[] = [];
    for (let k = 0; k < count; k++) {
      onProgress?.(`تجهيز إطارات WebP (${k + 1}/${count})...`);
      workCtx.clearRect(0, 0, safeW, safeH);
      renderFrameToCanvas(workCtx, safeW, safeH, k);
      const b = await new Promise<Blob | null>((r) => workCvs.toBlob((v) => r(v), 'image/webp', 0.95));
      if (b && b.type === 'image/webp') {
        const u = new Uint8Array(await b.arrayBuffer());
        if (u.length >= 20 && TD.decode(u.subarray(0, 4)) === 'RIFF' && TD.decode(u.subarray(8, 12)) === 'WEBP') {
          webpFrames.push(u);
          continue;
        }
      }
      webpFrames.push(encodeLosslessWebPFrame(workCtx.getImageData(0, 0, safeW, safeH).data, safeW, safeH));
    }
    const muxed = muxAnimatedWebPFrames(webpFrames, safeW, safeH, safeFps, 0);
    return { blob: new Blob([muxed.slice()], { type: 'image/webp' }), fileName: `${cleanBase}.webp` };
  }

  if (format === 'lottie' || format === 'dotlottie' || format === 'zip') {
    const pngFrames: Uint8Array[] = [];
    for (let k = 0; k < count; k++) {
      onProgress?.(`رندر الإطارات (${k + 1}/${count})...`);
      workCtx.clearRect(0, 0, safeW, safeH);
      renderFrameToCanvas(workCtx, safeW, safeH, k);
      pngFrames.push(await canvasToPngBytes(workCvs));
    }
    if (format === 'lottie') {
      const b64Names = pngFrames.map((u) => 'data:image/png;base64,' + base64(u));
      const lottie = lotJson(b64Names, safeW, safeH, safeFps, 0);
      return {
        blob: new Blob([JSON.stringify(lottie)], { type: 'application/json' }),
        fileName: `${cleanBase}_lottie.json`,
      };
    }
    if (format === 'dotlottie') {
      const zip = new JSZip();
      const names = pngFrames.map((_, i) => `f${String(i).padStart(4, '0')}.png`);
      zip.file(
        'manifest.json',
        JSON.stringify({
          version: '1.0',
          generator: 'MotionTools',
          author: 'MotionTools',
          animations: [{ id: 'animation', speed: 1, loop: true }],
        })
      );
      zip.file('animations/animation.json', JSON.stringify(lotJson(names, safeW, safeH, safeFps, 1)));
      pngFrames.forEach((b, i) => zip.file(`images/${names[i]}`, b));
      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });
      return { blob, fileName: `${cleanBase}.lottie` };
    }
    const zip = new JSZip();
    pngFrames.forEach((b, i) => zip.file(`frame_${String(i + 1).padStart(4, '0')}.png`, b));
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });
    return { blob, fileName: `${cleanBase}_frames.zip` };
  }

  if (format === 'webm') {
    onProgress?.('جاري تسجيل WebM شفاف...');
    const blob = await encodeTransparentWebmBlob(safeW, safeH, safeFps, count, (ctx, k) => {
      renderFrameToCanvas(ctx, safeW, safeH, k);
    });
    return { blob, fileName: `${cleanBase}.webm` };
  }

  if (format === 'mp4' || format === 'mov') {
    const VW = evenCeil(safeW);
    const VH = evenCeil(safeH);
    onProgress?.(`جاري ترميز ${format.toUpperCase()}...`);
    const { bytes, actualExt } = await encodeCanvasFramesToMp4Bytes(VW, VH, safeFps, count, (ctx, k) => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, VW, VH);
      workCtx.clearRect(0, 0, safeW, safeH);
      renderFrameToCanvas(workCtx, safeW, safeH, k);
      ctx.drawImage(workCvs, 0, 0, VW, VH);
    });
    if (format === 'mov' && actualExt === 'mp4' && bytes.length >= 12) {
      const movBytes = new Uint8Array(bytes);
      movBytes.set([113, 116, 32, 32], 8); // 'qt  '
      return { blob: new Blob([movBytes.slice()], { type: 'video/quicktime' }), fileName: `${cleanBase}.mov` };
    }
    return {
      blob: new Blob([bytes.slice()], { type: actualExt === 'mp4' ? 'video/mp4' : 'video/webm' }),
      fileName: `${cleanBase}.${actualExt === 'mp4' ? (format === 'mov' ? 'mov' : 'mp4') : 'webm'}`,
    };
  }

  // VAP / YYEVA / Dual Alpha
  const planFormat: 'vap' | 'yyeva' = format === 'vap' ? 'vap' : 'yyeva';
  const plan = planVapMaskAtlasLayout({
    format: planFormat,
    W: safeW,
    H: safeH,
    srcW: safeW,
    srcH: safeH,
    slots: [],
  });
  const grayCvs = document.createElement('canvas');
  grayCvs.width = plan.W;
  grayCvs.height = plan.H;
  const grayCtx = grayCvs.getContext('2d', { willReadFrequently: true })!;

  onProgress?.(`جاري تصدير ${format.toUpperCase()} (${plan.VW}×${plan.VH})...`);
  const { bytes, actualExt } = await encodeCanvasFramesToMp4Bytes(
    plan.VW,
    plan.VH,
    safeFps,
    count,
    (ctx, k) => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, plan.VW, plan.VH);
      workCtx.clearRect(0, 0, safeW, safeH);
      renderFrameToCanvas(workCtx, safeW, safeH, k);

      // RGB channel
      ctx.drawImage(workCvs, plan.rgbFrame[0], plan.rgbFrame[1], plan.rgbFrame[2], plan.rgbFrame[3]);

      // Grayscale Alpha mask channel
      grayCtx.clearRect(0, 0, plan.W, plan.H);
      grayCtx.drawImage(workCvs, 0, 0, plan.W, plan.H);
      const imgData = grayCtx.getImageData(0, 0, plan.W, plan.H);
      const px = imgData.data;
      for (let i = 0; i < px.length; i += 4) {
        px[i] = px[i + 1] = px[i + 2] = px[i + 3];
        px[i + 3] = 255;
      }
      grayCtx.putImageData(imgData, 0, 0);
      ctx.drawImage(grayCvs, plan.aFrame[0], plan.aFrame[1], plan.aFrame[2], plan.aFrame[3]);
    }
  );

  if (actualExt === 'mp4' && (format === 'vap' || format === 'yyeva')) {
    const { metaJson } = buildVapDynamicMetadataJson({
      plan,
      nk: count,
      fps: safeFps,
      start: 0,
      end: count / safeFps,
      srcFps: safeFps,
      srcTotalFrames: count,
      srcW: safeW,
      srcH: safeH,
      sourceMeta: null,
    });
    const finalBytes = packageMp4WithVapYyevaMeta(bytes, format, metaJson);
    return {
      blob: new Blob([finalBytes.slice()], { type: 'video/mp4' }),
      fileName: `${cleanBase}_${format}.mp4`,
    };
  }

  return {
    blob: new Blob([bytes.slice()], { type: actualExt === 'mp4' ? 'video/mp4' : 'video/webm' }),
    fileName: `${cleanBase}_${format}.${actualExt}`,
  };
}

export { serializeDecomposedSvga };
