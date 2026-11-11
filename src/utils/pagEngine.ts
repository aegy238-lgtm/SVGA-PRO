import {
  encodeLosslessWebPFrame,
  pako,
  parseMovie,
  SvgaFrame,
  SvgaMovie,
  SvgaSprite,
  UPNG,
} from './codecs';

export interface PagLayerInput {
  id: string;
  name: string;
  assetKey: string;
  imageBytes: Uint8Array;
  width: number;
  height: number;
  frames: SvgaFrame[];
}

export interface PagEncodeInput {
  width: number;
  height: number;
  fps: number;
  totalFrames?: number;
  svgaMovie?: SvgaMovie;
  layers?: PagLayerInput[];
  images?: Record<string, Uint8Array>;
  sprites?: SvgaSprite[];
  framesPng?: Uint8Array[];
  framePngs?: Uint8Array[];
  webpFrames?: Uint8Array[];
  audioBytes?: Uint8Array | null;
}

export interface PagDecodedMovie {
  isValidPag: boolean;
  isDecomposedPag: boolean;
  isCustomDecomposedManifest?: boolean;
  version: number;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  durationSec: number;
  images: Record<string, Uint8Array>;
  sprites: SvgaSprite[];
  audioBytes?: Uint8Array | null;
  svgaMovie: SvgaMovie;
}

const PAG_MAGIC = new Uint8Array([0x50, 0x41, 0x47]); // 'PAG'
const PAG_CUSTOM_CHUNK_MAGIC = new Uint8Array([0x50, 0x41, 0x47, 0x4c, 0x59, 0x52, 0x32]); // 'PAGLYR2'

function writeUint32LE(val: number): Uint8Array {
  const b = new Uint8Array(4);
  const v = val >>> 0;
  b[0] = v & 0xff;
  b[1] = (v >>> 8) & 0xff;
  b[2] = (v >>> 16) & 0xff;
  b[3] = (v >>> 24) & 0xff;
  return b;
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) return 0;
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function writeFloat32LE(val: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, val, true);
  return new Uint8Array(buf);
}

function readFloat32LE(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) return 30;
  const dv = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
  return dv.getFloat32(0, true);
}

/**
 * Encodes an unsigned integer using Tencent libpag's base-128 varint (`writeEncodedUint32` / `writeEncodedUint64`).
 */
function writePagEncodedUint(val: number): Uint8Array {
  let v = Math.max(0, Math.floor(val));
  const out: number[] = [];
  while (v >= 128) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v & 0x7f);
  return new Uint8Array(out);
}

/**
 * Encodes a signed 32-bit integer using Tencent libpag's `writeEncodedInt32`
 * (`data = (abs(v) << 1) | (v < 0 ? 1 : 0)`).
 */
function writePagEncodedInt32(val: number): Uint8Array {
  const intVal = Math.round(val) | 0;
  const absVal = intVal < 0 ? -intVal : intVal;
  const encoded = ((absVal << 1) | (intVal < 0 ? 1 : 0)) >>> 0;
  return writePagEncodedUint(encoded);
}

function readPagEncodedUint(bytes: Uint8Array, cursor: { p: number }): number {
  let value = 0;
  let shift = 0;
  while (cursor.p < bytes.length && shift < 56) {
    const b = bytes[cursor.p++];
    value += (b & 0x7f) * Math.pow(2, shift);
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return value;
}

function readPagEncodedInt32(bytes: Uint8Array, cursor: { p: number }): number {
  const data = readPagEncodedUint(bytes, cursor) >>> 0;
  const val = data >>> 1;
  return (data & 1) !== 0 ? -val : val;
}

function writePagByteData(data: Uint8Array): Uint8Array {
  return concatUint8Arrays([writePagEncodedUint(data.byteLength), data]);
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.byteLength;
  }
  return out;
}

/**
 * Checks whether a binary buffer starts with the official 'PAG' header.
 */
export function isPagBinary(bytes: Uint8Array): boolean {
  if (!bytes || bytes.length < 4) return false;
  return (
    bytes[0] === PAG_MAGIC[0] &&
    bytes[1] === PAG_MAGIC[1] &&
    bytes[2] === PAG_MAGIC[2]
  );
}

/**
 * Encodes a PAG tag block following Tencent PAG's `WriteTagHeader` (`(tagCode << 6) | lengthType`) convention.
 */
function encodePagTagBlock(tagCode: number, payload: Uint8Array): Uint8Array {
  const len = payload.byteLength;
  if (len < 63) {
    const tagHeader = (tagCode << 6) | len;
    const hdr = new Uint8Array(2);
    hdr[0] = tagHeader & 0xff;
    hdr[1] = (tagHeader >>> 8) & 0xff;
    return concatUint8Arrays([hdr, payload]);
  }
  const tagHeader = (tagCode << 6) | 63; // 63 indicates 32-bit length follows
  const hdr = new Uint8Array(6);
  hdr[0] = tagHeader & 0xff;
  hdr[1] = (tagHeader >>> 8) & 0xff;
  const lenBytes = writeUint32LE(len);
  hdr.set(lenBytes, 2);
  return concatUint8Arrays([hdr, payload]);
}

function areBuffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function isWebpBytes(b: Uint8Array | undefined): boolean {
  if (!b || b.byteLength < 16) return false;
  return (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  );
}

function isPngBytes(b: Uint8Array | undefined): boolean {
  if (!b || b.byteLength < 24) return false;
  return (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  );
}

let cachedFallbackWebp: Uint8Array | null = null;
function getFallbackWebpFrame(): Uint8Array {
  if (!cachedFallbackWebp) {
    // 2x2 non-empty WebP (> 1x1 so libpag's isEmptyBitmapFrame treats it as a valid content frame)
    const rgba = new Uint8Array([
      255, 215, 0, 255,
      255, 215, 0, 255,
      255, 215, 0, 255,
      255, 215, 0, 255,
    ]);
    cachedFallbackWebp = encodeLosslessWebPFrame(rgba, 2, 2);
  }
  return cachedFallbackWebp;
}

function convertImageBytesToWebpFrame(imgBytes: Uint8Array | undefined): Uint8Array {
  if (!imgBytes || imgBytes.byteLength === 0) {
    return getFallbackWebpFrame();
  }
  if (isWebpBytes(imgBytes)) {
    return imgBytes;
  }
  if (isPngBytes(imgBytes) && imgBytes.byteLength > 32) {
    try {
      const dec = UPNG.decode(imgBytes);
      if (
        dec &&
        dec.width > 0 &&
        dec.height > 0 &&
        dec.width * dec.height <= 512 * 512
      ) {
        const frames = UPNG.toRGBA8(dec);
        if (frames && frames[0]) {
          const rgba = new Uint8Array(frames[0]);
          if (rgba.byteLength === dec.width * dec.height * 4) {
            return encodeLosslessWebPFrame(rgba, dec.width, dec.height);
          }
        }
      }
    } catch {}
  }
  return getFallbackWebpFrame();
}

/**
 * Builds a spec-compliant Tencent libpag `BitmapCompositionBlock` (TagCode = 45)
 * containing `CompositionAttributes` (TagCode = 3), optional `AudioBytes` (TagCode = 55),
 * and `BitmapSequence` (TagCode = 46) with WebP frames, terminated by `TagCode::End` (0).
 */
function buildBitmapCompositionBlock(
  width: number,
  height: number,
  fps: number,
  totalFrames: number,
  webpFrames: Uint8Array[],
  audioBytes?: Uint8Array | null
): Uint8Array {
  // 1. Composition ID = 1
  const compIdBytes = writePagEncodedUint(1);

  // 2. TagCode::CompositionAttributes (TagCode = 3)
  // Order from CompositionAttributes.cpp: width, height, duration, frameRate, backgroundColor
  const compAttrPayload = concatUint8Arrays([
    writePagEncodedInt32(width),
    writePagEncodedInt32(height),
    writePagEncodedUint(Math.max(1, totalFrames)),
    writeFloat32LE(fps),
    new Uint8Array([0x00, 0x00, 0x00]), // backgroundColor RGB
  ]);
  const compAttrTag = encodePagTagBlock(3, compAttrPayload);

  // 3. Optional TagCode::AudioBytes (TagCode = 55)
  const audioTags: Uint8Array[] = [];
  if (audioBytes && audioBytes.byteLength > 0) {
    audioTags.push(encodePagTagBlock(55, writePagByteData(audioBytes)));
  }

  // 4. TagCode::BitmapSequence (TagCode = 46)
  // Order from BitmapSequence.cpp:
  // width (EncodedInt32), height (EncodedInt32), frameRate (Float32), count (EncodedUint32),
  // count bits of isKeyframe (1 bit each), then for each frame:
  // bitmapCount (EncodedUint32), and for each bitmap: x (EncodedInt32), y (EncodedInt32), fileBytes (ByteData)
  const frameCount = Math.max(1, webpFrames.length);
  const keyframeBitBytes = new Uint8Array(Math.ceil(frameCount / 8));
  for (let i = 0; i < frameCount; i++) {
    keyframeBitBytes[i >>> 3] |= 1 << (i & 7); // Mark every frame as a full keyframe (bit = 1)
  }

  const frameRectChunks: Uint8Array[] = [];
  for (let i = 0; i < frameCount; i++) {
    const wf = webpFrames[i] || getFallbackWebpFrame();
    frameRectChunks.push(
      writePagEncodedUint(1), // 1 bitmap rect in this frame
      writePagEncodedInt32(0), // x = 0
      writePagEncodedInt32(0), // y = 0
      writePagByteData(wf) // WebP fileBytes
    );
  }

  const bitmapSeqPayload = concatUint8Arrays([
    writePagEncodedInt32(width),
    writePagEncodedInt32(height),
    writeFloat32LE(fps),
    writePagEncodedUint(frameCount),
    keyframeBitBytes,
    ...frameRectChunks,
  ]);
  const bitmapSeqTag = encodePagTagBlock(46, bitmapSeqPayload);

  // 5. End Tag (TagCode = 0)
  const endTag = new Uint8Array([0x00, 0x00]);

  const blockPayload = concatUint8Arrays([
    compIdBytes,
    compAttrTag,
    ...audioTags,
    bitmapSeqTag,
    endTag,
  ]);
  return encodePagTagBlock(45, blockPayload);
}

/**
 * Encodes any animation or decomposed layer composition into a 100% spec-compliant Tencent `.pag` binary file.
 * - Writes the official 9-byte Tencent PAG header (`'P','A','G', version=1, bodyLength, 'U'`).
 * - Writes official `ImageBytes` tags (`TagCode = 15`) and a valid `BitmapCompositionBlock` (`TagCode = 45`)
 *   so official Tencent `libpag` (`PAGFile.load` / `PAGView.init`) loads and plays the file natively.
 * - Writes our `PAG_DECOMPOSED_V2` layer manifest (`TagCode = 42`, safely skipped by `libpag`'s `ReadTagsOfFile`)
 *   so re-opening the `.pag` file in our platform restores all individual decomposed layers, masks, and keyframes.
 */
export function encodePagFileBinary(input: PagEncodeInput): Uint8Array {
  const width = Math.max(1, Math.round(input.width || input.svgaMovie?.w || 500));
  const height = Math.max(1, Math.round(input.height || input.svgaMovie?.h || 500));
  const fps = Math.max(1, Math.round(input.fps || input.svgaMovie?.fps || 30));
  const images: Record<string, Uint8Array> = {
    ...(input.svgaMovie?.im || {}),
    ...(input.images || {}),
  };
  const sprites: SvgaSprite[] = [
    ...(input.svgaMovie?.sp || []),
    ...(input.sprites || []),
  ];
  const rawFrameList = input.framesPng || input.framePngs || input.webpFrames;

  if (input.layers && input.layers.length > 0) {
    for (const layer of input.layers) {
      if (layer.assetKey && layer.imageBytes) {
        images[layer.assetKey] = layer.imageBytes;
      }
      sprites.push({
        key: layer.assetKey,
        fr: layer.frames,
      });
    }
  } else if (sprites.length === 0 && rawFrameList && rawFrameList.length > 0) {
    const nFrames = rawFrameList.length;
    const uniqueFrames: { key: string; bytes: Uint8Array; activeIndices: number[] }[] = [];
    for (let i = 0; i < nFrames; i++) {
      const fBytes = rawFrameList[i];
      const existing = uniqueFrames.find((uf) => areBuffersEqual(uf.bytes, fBytes));
      if (existing) {
        existing.activeIndices.push(i);
      } else {
        const key = `pag_layer_${String(uniqueFrames.length + 1).padStart(3, '0')}`;
        images[key] = fBytes;
        uniqueFrames.push({ key, bytes: fBytes, activeIndices: [i] });
      }
    }

    const totalF = Math.max(1, input.totalFrames || nFrames);
    for (const uf of uniqueFrames) {
      const activeSet = new Set(uf.activeIndices);
      const fr: SvgaFrame[] = [];
      for (let fIdx = 0; fIdx < totalF; fIdx++) {
        fr.push({
          a: activeSet.has(fIdx) ? 1 : 0,
          x: 0,
          y: 0,
          w: width,
          h: height,
          t: [1, 0, 0, 1, 0, 0],
        });
      }
      sprites.push({ key: uf.key, fr });
    }
  }

  const totalFrames = Math.max(
    1,
    Math.round(
      input.totalFrames ||
        input.svgaMovie?.n ||
        (sprites[0]?.fr?.length ?? 0) ||
        (rawFrameList?.length ?? 0) ||
        (input.webpFrames?.length ?? 0) ||
        1
    )
  );

  // 1. Official PAG ImageBytes Tags (TagCode = 15: id=EncodedUint32, fileBytes=ByteData)
  const imageTagBlocks: Uint8Array[] = [];
  const imageKeys = Object.keys(images);
  for (let idx = 0; idx < imageKeys.length; idx++) {
    const key = imageKeys[idx];
    const imgData = images[key];
    if (!imgData || imgData.byteLength === 0) continue;
    const imgPayload = concatUint8Arrays([
      writePagEncodedUint(idx + 1),
      writePagByteData(imgData),
    ]);
    imageTagBlocks.push(encodePagTagBlock(15, imgPayload));
  }

  // 2. Prepare WebP sequence frames for BitmapCompositionBlock (TagCode = 45)
  const webpFrames: Uint8Array[] = [];
  if (input.webpFrames && input.webpFrames.length > 0) {
    for (const wf of input.webpFrames) {
      webpFrames.push(isWebpBytes(wf) ? wf : convertImageBytesToWebpFrame(wf));
    }
  } else if (rawFrameList && rawFrameList.length > 0) {
    // Convert unique frames once and reuse by reference
    const convertedCache = new Map<Uint8Array, Uint8Array>();
    for (const rf of rawFrameList) {
      let wf = convertedCache.get(rf);
      if (!wf) {
        wf = convertImageBytesToWebpFrame(rf);
        convertedCache.set(rf, wf);
      }
      webpFrames.push(wf);
    }
  } else {
    // Use first available image asset converted to WebP (or fallback WebP) across totalFrames
    const firstKey = imageKeys[0];
    const primaryWebp = firstKey
      ? convertImageBytesToWebpFrame(images[firstKey])
      : getFallbackWebpFrame();
    const seqLen = Math.min(totalFrames, 120);
    for (let i = 0; i < seqLen; i++) {
      webpFrames.push(primaryWebp);
    }
  }

  const bitmapCompBlock = buildBitmapCompositionBlock(
    width,
    height,
    fps,
    totalFrames,
    webpFrames,
    input.audioBytes
  );

  // 3. Decomposed Layers & Keyframe Timeline Manifest (TagCode = 42, ignored by libpag's ReadTagsOfFile)
  const manifestObj = {
    format: 'PAG_DECOMPOSED_V2',
    width,
    height,
    fps,
    totalFrames,
    imageKeys,
    hasAudio: Boolean(input.audioBytes && input.audioBytes.byteLength > 0),
    sprites: sprites.map((sp) => ({
      key: sp.key,
      mk: sp.mk,
      fr: sp.fr.map((f) => ({
        a: Number((f.a ?? 0).toFixed(4)),
        x: Number((f.x ?? 0).toFixed(2)),
        y: Number((f.y ?? 0).toFixed(2)),
        w: Number((f.w ?? width).toFixed(2)),
        h: Number((f.h ?? height).toFixed(2)),
        t: (f.t || [1, 0, 0, 1, 0, 0]).map((v) => Number(Number(v || 0).toFixed(5))),
        ...(f.clipPath ? { clipPath: f.clipPath } : {}),
      })),
    })),
  };

  const manifestJsonBytes = new TextEncoder().encode(JSON.stringify(manifestObj));
  const compressedManifest = pako.deflate(manifestJsonBytes, { level: 6 });

  const audioData =
    input.audioBytes && input.audioBytes.byteLength > 0
      ? input.audioBytes
      : new Uint8Array(0);

  // Also serialize named image table inside TagCode 42 so exact layer keys and original PNGs are 100% preserved
  const namedImgChunks: Uint8Array[] = [writeUint32LE(imageKeys.length)];
  for (const key of imageKeys) {
    const kBytes = new TextEncoder().encode(key);
    const vBytes = images[key] || new Uint8Array(0);
    namedImgChunks.push(
      writeUint32LE(kBytes.byteLength),
      kBytes,
      writeUint32LE(vBytes.byteLength),
      vBytes
    );
  }

  const lyrChunkPayload = concatUint8Arrays([
    PAG_CUSTOM_CHUNK_MAGIC,
    writeUint32LE(compressedManifest.byteLength),
    compressedManifest,
    writeUint32LE(audioData.byteLength),
    audioData,
    ...namedImgChunks,
  ]);
  const lyrTagBlock = encodePagTagBlock(42, lyrChunkPayload);

  // 4. End Tag (TagCode = 0)
  const endTag = new Uint8Array([0x00, 0x00]);

  const bodyBytes = concatUint8Arrays([
    ...imageTagBlocks,
    bitmapCompBlock,
    lyrTagBlock,
    endTag,
  ]);

  // Official 9-byte Tencent PAG Header: 'P', 'A', 'G', version(1), bodyLength(uint32LE), compression('U'=0x55)
  const headerBytes = new Uint8Array(9);
  headerBytes.set(PAG_MAGIC, 0);
  headerBytes[3] = 0x01; // Official Codec Version = 1
  headerBytes.set(writeUint32LE(bodyBytes.byteLength), 4);
  headerBytes[8] = 0x55; // 'U' = CompressionAlgorithm::UNCOMPRESSED

  return concatUint8Arrays([headerBytes, bodyBytes]);
}

/**
 * Scans a binary buffer for embedded PNG, JPEG, and WebP images.
 * Used when decomposing third-party Tencent `.pag` files into editable image layers.
 */
export function extractEmbeddedImagesFromPagBytes(
  rawBytes: Uint8Array
): { key: string; bytes: Uint8Array; mime: string }[] {
  const results: { key: string; bytes: Uint8Array; mime: string }[] = [];
  const seenLengthsAndHashes = new Set<string>();

  const addUniqueImage = (imgBytes: Uint8Array, ext: string) => {
    if (imgBytes.byteLength < 24) return;
    let hash = imgBytes.byteLength;
    for (let i = 0; i < imgBytes.byteLength; i++) {
      hash = (Math.imul(hash, 31) + imgBytes[i]) | 0;
    }
    const sig = `${imgBytes.byteLength}_${hash}`;
    if (seenLengthsAndHashes.has(sig)) return;
    seenLengthsAndHashes.add(sig);
    const key = `pag_layer_${String(results.length + 1).padStart(2, '0')}`;
    const mime =
      ext === 'jpg'
        ? 'image/jpeg'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/png';
    results.push({ key, bytes: new Uint8Array(imgBytes), mime });
  };

  const scanBufferForImages = (buf: Uint8Array) => {
    const len = buf.byteLength;
    let i = 0;
    while (i < len - 12) {
      // 1. Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
      if (
        buf[i] === 0x89 &&
        buf[i + 1] === 0x50 &&
        buf[i + 2] === 0x4e &&
        buf[i + 3] === 0x47 &&
        buf[i + 4] === 0x0d &&
        buf[i + 5] === 0x0a &&
        buf[i + 6] === 0x1a &&
        buf[i + 7] === 0x0a
      ) {
        let pos = i + 8;
        let validEnd = -1;
        while (pos + 12 <= len) {
          const chunkLen =
            ((buf[pos] << 24) |
              (buf[pos + 1] << 16) |
              (buf[pos + 2] << 8) |
              buf[pos + 3]) >>>
            0;
          if (chunkLen > 50_000_000 || pos + 12 + chunkLen > len) break;
          const isIend =
            buf[pos + 4] === 0x49 &&
            buf[pos + 5] === 0x45 &&
            buf[pos + 6] === 0x4e &&
            buf[pos + 7] === 0x44;
          pos += 12 + chunkLen;
          if (isIend) {
            validEnd = pos;
            break;
          }
        }
        if (validEnd > i) {
          addUniqueImage(buf.subarray(i, validEnd), 'png');
          i = validEnd;
          continue;
        }
      }

      // 2. Check WebP signature: 'RIFF' .... 'WEBP'
      if (
        buf[i] === 0x52 &&
        buf[i + 1] === 0x49 &&
        buf[i + 2] === 0x46 &&
        buf[i + 3] === 0x46 &&
        buf[i + 8] === 0x57 &&
        buf[i + 9] === 0x45 &&
        buf[i + 10] === 0x42 &&
        buf[i + 11] === 0x50
      ) {
        const riffSize = readUint32LE(buf, i + 4);
        const totalWebpLen = riffSize + 8;
        if (riffSize > 12 && i + totalWebpLen <= len && totalWebpLen < 50_000_000) {
          addUniqueImage(buf.subarray(i, i + totalWebpLen), 'webp');
          i += totalWebpLen;
          continue;
        }
      }

      // 3. Check JPEG signature: FF D8 FF (E0 | E1 | DB | C0)
      if (
        buf[i] === 0xff &&
        buf[i + 1] === 0xd8 &&
        buf[i + 2] === 0xff &&
        (buf[i + 3] === 0xe0 ||
          buf[i + 3] === 0xe1 ||
          buf[i + 3] === 0xdb ||
          buf[i + 3] === 0xc0)
      ) {
        let endJpg = -1;
        for (let j = i + 4; j < Math.min(len - 1, i + 15_000_000); j++) {
          if (buf[j] === 0xff && buf[j + 1] === 0xd9) {
            endJpg = j + 2;
            break;
          }
        }
        if (endJpg > i + 64) {
          addUniqueImage(buf.subarray(i, endJpg), 'jpg');
          i = endJpg;
          continue;
        }
      }

      i++;
    }
  };

  scanBufferForImages(rawBytes);
  return results;
}

async function toUint8ArrayCrossRealm(
  rawInput: Uint8Array | ArrayBuffer | Blob | any
): Promise<Uint8Array> {
  if (!rawInput) return new Uint8Array(0);
  if (rawInput instanceof Uint8Array) return rawInput;
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(rawInput)) {
    return new Uint8Array(
      rawInput.buffer,
      rawInput.byteOffset,
      rawInput.byteLength
    );
  }
  if (
    rawInput instanceof ArrayBuffer ||
    Object.prototype.toString.call(rawInput) === '[object ArrayBuffer]'
  ) {
    return new Uint8Array(rawInput);
  }
  if (typeof rawInput.arrayBuffer === 'function') {
    return new Uint8Array(await rawInput.arrayBuffer());
  }
  if (rawInput.buffer && typeof rawInput.byteLength === 'number') {
    return new Uint8Array(
      rawInput.buffer,
      rawInput.byteOffset || 0,
      rawInput.byteLength
    );
  }
  return new Uint8Array(0);
}

/**
 * Decodes a `.pag` binary file and decomposes its layers into a full `PagDecodedMovie`
 * (including an `SvgaMovie` object ready for the SVGA / Layer Editor and Motion Processing stage).
 */
export async function decodePagBinaryToMovie(
  rawInput: Uint8Array | ArrayBuffer | Blob
): Promise<PagDecodedMovie> {
  const bytes = await toUint8ArrayCrossRealm(rawInput);

  // Also check if the user renamed an SVGA/zlib file to .pag
  if (!isPagBinary(bytes) && bytes.length > 8 && bytes[0] === 0x78) {
    try {
      const inflated = pako.inflate(bytes);
      const svgaMov = parseMovie(inflated);
      if (svgaMov && svgaMov.w > 0 && svgaMov.h > 0) {
        return {
          isValidPag: true,
          isDecomposedPag: true,
          version: 1,
          width: svgaMov.w,
          height: svgaMov.h,
          fps: svgaMov.fps || 30,
          totalFrames: svgaMov.n || 30,
          durationSec: (svgaMov.n || 30) / Math.max(1, svgaMov.fps || 30),
          images: svgaMov.im || {},
          sprites: svgaMov.sp || [],
          svgaMovie: svgaMov,
        };
      }
    } catch {}
  }

  const validHeader = isPagBinary(bytes);
  const version = validHeader ? bytes[3] || 1 : 1;

  let width = 500;
  let height = 500;
  let fps = 30;
  let totalFrames = 60;

  // Check if standard 9-byte Tencent PAG header ('P','A','G', ver, bodyLen[4], 'U'=0x55)
  const isStandard9ByteHeader =
    validHeader && bytes.length >= 11 && bytes[8] === 0x55;

  if (validHeader && !isStandard9ByteHeader && bytes.length >= 16) {
    const candW = readUint32LE(bytes, 4);
    const candH = readUint32LE(bytes, 8);
    const packedFpsFrames = readUint32LE(bytes, 12);
    const candFps = packedFpsFrames >>> 16;
    const candFrames = packedFpsFrames & 0xffff;
    if (candW >= 8 && candW <= 8192 && candH >= 8 && candH <= 8192) {
      width = candW;
      height = candH;
    }
    if (candFps >= 1 && candFps <= 240) {
      fps = candFps;
    }
    if (candFrames >= 1 && candFrames <= 60000) {
      totalFrames = candFrames;
    }
  }

  const images: Record<string, Uint8Array> = {};
  const officialImagesList: Uint8Array[] = [];
  let sprites: SvgaSprite[] = [];
  let audioBytes: Uint8Array | null = null;
  let foundCompAttributes = false;
  let lastCompositionTagCode = 0;
  let hasCustomManifest = false;
  const bitmapSeqFrames: { isKeyframe: boolean; rects: { x: number; y: number; bytes: Uint8Array }[] }[] = [];

  const parseInnerCompositionTags = (compBuf: Uint8Array, outerTagCode = 2) => {
    lastCompositionTagCode = outerTagCode;
    const cur = { p: 0 };
    // Read composition->id (EncodedUint32)
    readPagEncodedUint(compBuf, cur);
    // VideoCompositionBlock (TagCode = 50) has a 1-byte boolean `hasAlpha` immediately after composition->id
    if (outerTagCode === 50 && cur.p < compBuf.length) {
      cur.p += 1;
    }
    let pos = cur.p;
    while (pos + 2 <= compBuf.length) {
      const tagAndLen = compBuf[pos] | (compBuf[pos + 1] << 8);
      const tagCode = tagAndLen >>> 6;
      const lenField = tagAndLen & 0x3f;
      pos += 2;
      if (tagCode === 0) break;
      let blockLen = lenField;
      if (lenField === 63) {
        if (pos + 4 > compBuf.length) break;
        blockLen = readUint32LE(compBuf, pos);
        pos += 4;
      }
      if (blockLen < 0 || pos + blockLen > compBuf.length) break;
      const payload = compBuf.subarray(pos, pos + blockLen);
      pos += blockLen;

      if (tagCode === 3 && payload.byteLength >= 7) {
        // TagCode::CompositionAttributes (width, height, duration, frameRate, backgroundColor)
        const c = { p: 0 };
        const w = readPagEncodedInt32(payload, c);
        const h = readPagEncodedInt32(payload, c);
        const dur = readPagEncodedUint(payload, c);
        const fr = c.p + 4 <= payload.byteLength ? readFloat32LE(payload, c.p) : 30;
        if (w >= 2 && w <= 8192 && h >= 2 && h <= 8192) {
          width = w;
          height = h;
          foundCompAttributes = true;
        }
        if (dur >= 1 && dur <= 100000) {
          totalFrames = dur;
        }
        if (fr >= 1 && fr <= 240) {
          fps = Math.round(fr);
        }
      } else if (tagCode === 47 && payload.byteLength > 8) {
        // TagCode::VideoSequence (width, height, frameRate, alphaStartX, alphaStartY, ...)
        try {
          const c = { p: 0 };
          const seqW = readPagEncodedInt32(payload, c);
          const seqH = readPagEncodedInt32(payload, c);
          const seqFr = c.p + 4 <= payload.byteLength ? readFloat32LE(payload, c.p) : fps;
          if (seqW >= 2 && seqW <= 8192 && seqH >= 2 && seqH <= 8192 && !foundCompAttributes) {
            width = seqW;
            height = seqH;
            foundCompAttributes = true;
          }
          if (seqFr >= 1 && seqFr <= 240) {
            fps = Math.round(seqFr);
          }
        } catch {}
      } else if (tagCode === 46 && payload.byteLength > 8) {
        // TagCode::BitmapSequence
        try {
          const c = { p: 0 };
          const seqW = readPagEncodedInt32(payload, c);
          const seqH = readPagEncodedInt32(payload, c);
          const seqFr = c.p + 4 <= payload.byteLength ? readFloat32LE(payload, c.p) : fps;
          c.p += 4;
          const fCount = readPagEncodedUint(payload, c);
          if (seqW >= 2 && seqW <= 8192 && seqH >= 2 && seqH <= 8192 && !foundCompAttributes) {
            width = seqW;
            height = seqH;
            foundCompAttributes = true;
          }
          if (seqFr >= 1 && seqFr <= 240) {
            fps = Math.round(seqFr);
          }
          const bitByteLen = Math.ceil(fCount / 8);
          if (fCount >= 1 && fCount <= 10000 && c.p + bitByteLen <= payload.byteLength) {
            bitmapSeqFrames.length = 0;
            const keyframeBits = payload.subarray(c.p, c.p + bitByteLen);
            c.p += bitByteLen;
            for (let fIdx = 0; fIdx < fCount; fIdx++) {
              if (c.p >= payload.byteLength) break;
              const isKf = Boolean(keyframeBits[fIdx >>> 3] & (1 << (fIdx & 7)));
              const bmpCount = readPagEncodedUint(payload, c);
              const rects: { x: number; y: number; bytes: Uint8Array }[] = [];
              for (let bIdx = 0; bIdx < bmpCount; bIdx++) {
                if (c.p >= payload.byteLength) break;
                const bx = readPagEncodedInt32(payload, c);
                const by = readPagEncodedInt32(payload, c);
                const bLen = readPagEncodedUint(payload, c);
                if (bLen > 0 && c.p + bLen <= payload.byteLength) {
                  rects.push({
                    x: bx,
                    y: by,
                    bytes: new Uint8Array(payload.subarray(c.p, c.p + bLen)),
                  });
                  c.p += bLen;
                } else {
                  break;
                }
              }
              bitmapSeqFrames.push({ isKeyframe: isKf, rects });
            }
          }
        } catch {}
      } else if (tagCode === 55 && payload.byteLength > 2 && !audioBytes) {
        // TagCode::AudioBytes
        const c = { p: 0 };
        const audLen = readPagEncodedUint(payload, c);
        if (audLen > 0 && c.p + audLen <= payload.byteLength) {
          audioBytes = new Uint8Array(payload.subarray(c.p, c.p + audLen));
        }
      }
    }
  };

  const tryParsePagTags = (startPos: number): boolean => {
    let pos = startPos;
    let foundStructuredChunk = false;
    while (pos + 2 <= bytes.length) {
      const tagAndLen = bytes[pos] | (bytes[pos + 1] << 8);
      const tagCode = tagAndLen >>> 6;
      const lenField = tagAndLen & 0x3f;
      pos += 2;
      if (tagCode === 0) break;

      let blockLen = lenField;
      if (lenField === 63) {
        if (pos + 4 > bytes.length) break;
        blockLen = readUint32LE(bytes, pos);
        pos += 4;
      }
      if (blockLen < 0 || pos + blockLen > bytes.length) break;
      const payload = bytes.subarray(pos, pos + blockLen);
      pos += blockLen;

      if (tagCode === 2 || tagCode === 45 || tagCode === 50) {
        // VectorCompositionBlock (2), BitmapCompositionBlock (45), VideoCompositionBlock (50)
        parseInnerCompositionTags(payload, tagCode);
      } else if ((tagCode === 15 || tagCode === 48 || tagCode === 49) && payload.byteLength > 8) {
        // Official ImageBytes (id: EncodedUint32, fileBytes: ByteData) OR legacy ImageBytes
        const c = { p: 0 };
        const id = readPagEncodedUint(payload, c);
        const bLen = readPagEncodedUint(payload, c);
        if (id >= 0 && bLen > 16 && c.p + bLen <= payload.byteLength) {
          officialImagesList.push(new Uint8Array(payload.subarray(c.p, c.p + bLen)));
        } else if (payload.byteLength > 12) {
          // Legacy 32-bit length format fallback
          const keyLen = readUint32LE(payload, 4);
          if (keyLen > 0 && keyLen < 256 && 8 + keyLen + 4 <= payload.byteLength) {
            const key = new TextDecoder().decode(payload.subarray(8, 8 + keyLen));
            const imgLen = readUint32LE(payload, 8 + keyLen);
            const imgStart = 12 + keyLen;
            if (imgLen > 0 && imgStart + imgLen <= payload.byteLength) {
              images[key] = new Uint8Array(payload.subarray(imgStart, imgStart + imgLen));
            }
          }
        }
      } else if (tagCode === 42 && payload.byteLength > PAG_CUSTOM_CHUNK_MAGIC.length + 8) {
        // Decomposed Layer Manifest block
        let matchesMagic = true;
        for (let m = 0; m < PAG_CUSTOM_CHUNK_MAGIC.length; m++) {
          if (payload[m] !== PAG_CUSTOM_CHUNK_MAGIC[m]) {
            matchesMagic = false;
            break;
          }
        }
        if (matchesMagic) {
          const mOff = PAG_CUSTOM_CHUNK_MAGIC.length;
          const compLen = readUint32LE(payload, mOff);
          if (compLen > 0 && mOff + 4 + compLen <= payload.byteLength) {
            let parsedManifestKeys: string[] = [];
            try {
              const compSlice = payload.subarray(mOff + 4, mOff + 4 + compLen);
              const jsonBytes = pako.inflate(compSlice);
              const parsed = JSON.parse(new TextDecoder().decode(jsonBytes));
              if (parsed && parsed.format === 'PAG_DECOMPOSED_V2') {
                width = parsed.width || width;
                height = parsed.height || height;
                fps = parsed.fps || fps;
                totalFrames = parsed.totalFrames || totalFrames;
                if (Array.isArray(parsed.imageKeys)) {
                  parsedManifestKeys = parsed.imageKeys;
                }
                if (Array.isArray(parsed.sprites) && parsed.sprites.length > 0) {
                  sprites = parsed.sprites;
                  foundStructuredChunk = true;
                  hasCustomManifest = true;
                }
              }
            } catch {}
            const audOff = mOff + 4 + compLen;
            if (audOff + 4 <= payload.byteLength) {
              const audLen = readUint32LE(payload, audOff);
              let nextOff = audOff + 4;
              if (audLen > 0 && nextOff + audLen <= payload.byteLength) {
                audioBytes = new Uint8Array(payload.subarray(nextOff, nextOff + audLen));
                nextOff += audLen;
              }
              // Read named image table if present
              if (nextOff + 4 <= payload.byteLength) {
                const numImgs = readUint32LE(payload, nextOff);
                nextOff += 4;
                if (numImgs > 0 && numImgs <= 5000) {
                  for (let kIdx = 0; kIdx < numImgs; kIdx++) {
                    if (nextOff + 4 > payload.byteLength) break;
                    const kLen = readUint32LE(payload, nextOff);
                    nextOff += 4;
                    if (kLen <= 0 || kLen > 512 || nextOff + kLen + 4 > payload.byteLength) break;
                    const keyStr = new TextDecoder().decode(payload.subarray(nextOff, nextOff + kLen));
                    nextOff += kLen;
                    const vLen = readUint32LE(payload, nextOff);
                    nextOff += 4;
                    if (vLen < 0 || nextOff + vLen > payload.byteLength) break;
                    if (vLen > 0) {
                      images[keyStr] = new Uint8Array(payload.subarray(nextOff, nextOff + vLen));
                    }
                    nextOff += vLen;
                  }
                }
              }
              // Map officialImagesList by parsedManifestKeys if needed
              if (
                Object.keys(images).length === 0 &&
                officialImagesList.length > 0 &&
                parsedManifestKeys.length === officialImagesList.length
              ) {
                for (let i = 0; i < parsedManifestKeys.length; i++) {
                  images[parsedManifestKeys[i]] = officialImagesList[i];
                }
              }
            }
          }
        }
      }
    }
    return foundStructuredChunk;
  };

  let decodedStructured = false;
  if (isStandard9ByteHeader) {
    decodedStructured = tryParsePagTags(9);
  }
  if (!decodedStructured && validHeader && bytes.length >= 16) {
    decodedStructured = tryParsePagTags(16);
  }
  if (!decodedStructured && validHeader && bytes.length >= 4) {
    decodedStructured = tryParsePagTags(4);
  }

  // If no custom decomposed sprites were present, and the main composition is a native BitmapCompositionBlock (TagCode 45)
  // with a BitmapSequence (TagCode 46), build frame-accurate sprites directly from the BitmapSequence.
  if (sprites.length === 0 && bitmapSeqFrames.length > 0 && lastCompositionTagCode === 45) {
    const seqLen = bitmapSeqFrames.length;
    totalFrames = Math.max(totalFrames, seqLen);
    const uniqueBmps: {
      key: string;
      bytes: Uint8Array;
      xByFrame: Map<number, number>;
      yByFrame: Map<number, number>;
    }[] = [];
    for (let fIdx = 0; fIdx < seqLen; fIdx++) {
      const fItem = bitmapSeqFrames[fIdx];
      for (const r of fItem.rects) {
        let uBmp = uniqueBmps.find((u) => areBuffersEqual(u.bytes, r.bytes));
        if (!uBmp) {
          const key = `pag_seq_${String(uniqueBmps.length + 1).padStart(3, '0')}`;
          images[key] = r.bytes;
          uBmp = {
            key,
            bytes: r.bytes,
            xByFrame: new Map(),
            yByFrame: new Map(),
          };
          uniqueBmps.push(uBmp);
        }
        uBmp.xByFrame.set(fIdx, r.x);
        uBmp.yByFrame.set(fIdx, r.y);
      }
    }
    if (uniqueBmps.length > 0) {
      for (const uBmp of uniqueBmps) {
        const fr: SvgaFrame[] = [];
        for (let f = 0; f < totalFrames; f++) {
          const mappedF = Math.min(seqLen - 1, Math.floor((f / Math.max(1, totalFrames)) * seqLen));
          const isActive = uBmp.xByFrame.has(mappedF);
          fr.push({
            a: isActive ? 1 : 0,
            x: uBmp.xByFrame.get(mappedF) || 0,
            y: uBmp.yByFrame.get(mappedF) || 0,
            w: width,
            h: height,
            t: [1, 0, 0, 1, 0, 0],
          });
        }
        sprites.push({ key: uBmp.key, fr });
      }
      decodedStructured = true;
    }
  }

  if (Object.keys(images).length === 0 && officialImagesList.length > 0) {
    for (let i = 0; i < officialImagesList.length; i++) {
      images[`pag_layer_${String(i + 1).padStart(2, '0')}`] = officialImagesList[i];
    }
  }

  // Fallback for third-party / raw Tencent PAG files: scan for embedded PNG/JPEG/WebP images
  if (Object.keys(images).length === 0) {
    const extracted = extractEmbeddedImagesFromPagBytes(bytes);
    for (const item of extracted) {
      images[item.key] = item.bytes;
    }
  }

  // If sprites were not in a custom chunk, build decomposed sprites from extracted images
  if (sprites.length === 0 && Object.keys(images).length > 0) {
    const keys = Object.keys(images);
    for (const key of keys) {
      const fr: SvgaFrame[] = [];
      for (let i = 0; i < totalFrames; i++) {
        fr.push({
          a: 1,
          x: 0,
          y: 0,
          w: width,
          h: height,
          t: [1, 0, 0, 1, 0, 0],
        });
      }
      sprites.push({ key, fr });
    }
  }

  const svgaMovie: SvgaMovie = {
    w: width,
    h: height,
    fps,
    n: totalFrames,
    im: images,
    sp: sprites,
  };

  return {
    isValidPag: validHeader || foundCompAttributes || Object.keys(images).length > 0,
    isDecomposedPag: decodedStructured,
    isCustomDecomposedManifest: hasCustomManifest,
    version,
    width,
    height,
    fps,
    totalFrames,
    durationSec: totalFrames / Math.max(1, fps),
    images,
    sprites,
    audioBytes,
    svgaMovie,
  };
}

let browserLibpagPromise: Promise<any> | null = null;

function patchLibpagRuntime(PAG: any): any {
  if (!PAG || PAG.__patchedByAhmedStudio) return PAG;
  PAG.__patchedByAhmedStudio = true;
  try {
    // 1. Ensure GlobalCanvas uses HTMLCanvasElement with preserveDrawingBuffer: true
    // while preserving libpag's internal BackendContext.from(gl) initialization.
    const patchGlobalCanvasRetain = (protoOrInst: any) => {
      if (!protoOrInst || typeof protoOrInst.retain !== 'function' || protoOrInst.__retainPatched) return;
      const origRetain = protoOrInst.retain;
      protoOrInst.__retainPatched = true;
      protoOrInst.retain = function (this: any) {
        const w = typeof window !== 'undefined' ? (window as any) : null;
        const origOffscreen = w ? w.OffscreenCanvas : undefined;
        const origGetCtx =
          typeof HTMLCanvasElement !== 'undefined'
            ? HTMLCanvasElement.prototype.getContext
            : null;
        try {
          if (w) w.OffscreenCanvas = undefined;
          if (origGetCtx) {
            HTMLCanvasElement.prototype.getContext = function (
              this: any,
              type: any,
              attrs?: any
            ) {
              if (type === 'webgl' || type === 'webgl2') {
                attrs = Object.assign({}, attrs || {}, {
                  preserveDrawingBuffer: true,
                });
              }
              return origGetCtx.call(this, type, attrs);
            } as any;
          }
          return origRetain.call(this);
        } finally {
          if (origGetCtx) {
            HTMLCanvasElement.prototype.getContext = origGetCtx;
          }
          if (w && origOffscreen !== undefined) {
            w.OffscreenCanvas = origOffscreen;
          }
        }
      };
    };
    if (PAG.GlobalCanvas && PAG.GlobalCanvas.prototype) {
      patchGlobalCanvasRetain(PAG.GlobalCanvas.prototype);
    }
    if (PAG.globalCanvas) {
      patchGlobalCanvasRetain(PAG.globalCanvas);
    }

    // 2. Ensure PAG.tgfx.getSourceSize never returns 0x0 for unprimed video elements
    // (C++ tgfx::VideoElement::MakeFrom discards the entire VideoSequence decoder if getSourceSize returns 0x0!)
    if (PAG.tgfx && typeof PAG.tgfx.getSourceSize === 'function') {
      PAG.tgfx.getSourceSize = (el: any) => ({
        width: Number(el?.videoWidth || el?.width || 500) || 500,
        height: Number(el?.videoHeight || el?.height || 500) || 500,
      });
    }

    if (PAG.PAGFile && typeof PAG.PAGFile.loadFromBuffer === 'function') {
      const origLoad = PAG.PAGFile.load?.bind(PAG.PAGFile);
      PAG.PAGFile.load = async function (data: any) {
        const u8 = await toUint8ArrayCrossRealm(data);
        if (u8 && u8.byteLength > 0) {
          const localAb = new ArrayBuffer(u8.byteLength);
          new Uint8Array(localAb).set(u8);
          return PAG.PAGFile.loadFromBuffer(localAb);
        }
        return origLoad ? origLoad(data) : null;
      };
    }
    if (PAG.PAGPlayer && PAG.PAGPlayer.prototype) {
      const origLink = PAG.PAGPlayer.prototype.linkVideoReader;
      if (typeof origLink === 'function') {
        PAG.PAGPlayer.prototype.linkVideoReader = function (vr: any) {
          if (this._pagView && this._pagView.isPlaying && vr) {
            vr.isPlaying = true;
          }
          return origLink.call(this, vr);
        };
      }
    }
    // Enable cross-realm canvas recognition for libpag's internal `x(t, HTMLCanvasElement)` check
    if (typeof HTMLCanvasElement !== 'undefined') {
      try {
        Object.defineProperty(HTMLCanvasElement, Symbol.hasInstance, {
          value: function (inst: any) {
            return !!(
              inst &&
              (inst.tagName === 'CANVAS' ||
                typeof inst.getContext === 'function' ||
                Object.prototype.toString.call(inst) === '[object HTMLCanvasElement]')
            );
          },
          configurable: true,
        });
      } catch {}
    }

    if (PAG.PAGView && typeof PAG.PAGView.init === 'function') {
      const origInit = PAG.PAGView.init.bind(PAG.PAGView);
      PAG.PAGView.init = async function (file: any, canvas: any, options: any) {
        // In iframe environments, ensure cross-realm canvas elements pass libpag's internal check
        if (
          canvas &&
          typeof canvas !== 'string' &&
          !(canvas instanceof HTMLCanvasElement) &&
          (canvas.tagName === 'CANVAS' || typeof canvas.getContext === 'function')
        ) {
          try {
            Object.setPrototypeOf(canvas, HTMLCanvasElement.prototype);
          } catch {}
        }
        const pv = await origInit(file, canvas, options);
        if (pv && pv.player) {
          pv.player._pagView = pv;
        }
        return pv;
      };
    }
    if (PAG.PAGView && PAG.PAGView.prototype) {
      const origFlush = PAG.PAGView.prototype.flush;
      if (typeof origFlush === 'function') {
        PAG.PAGView.prototype.flush = async function () {
          const res = await origFlush.call(this);
          // Even if wasmIns._flush() returned false (same frame index as init), ensure 2D canvas receives the image
          if (
            !res &&
            this.pagViewOptions &&
            this.pagViewOptions.useCanvas2D &&
            PAG.globalCanvas &&
            PAG.globalCanvas.canvas &&
            this.canvasElement &&
            this.canvasContext
          ) {
            try {
              const gcv = PAG.globalCanvas.canvas;
              this.canvasContext.clearRect(
                0,
                0,
                this.canvasElement.width,
                this.canvasElement.height
              );
              this.canvasContext.drawImage(
                gcv,
                0,
                gcv.height - this.rawHeight,
                this.rawWidth,
                this.rawHeight,
                0,
                0,
                this.canvasElement.width,
                this.canvasElement.height
              );
            } catch {}
          }
          return res;
        };
      }
      PAG.PAGView.prototype.flushLoop = async function (force = false) {
        if (!this.isPlaying) return;
        this.setTimer();
        if (this.flushingNextFrame) return;
        this.flushingNextFrame = true;
        try {
          await this.flushNextFrame(force);
        } catch {
          // Keep animation loop alive on transient video/context errors
        } finally {
          this.flushingNextFrame = false;
        }
      };
    }
    const VR = PAG.VideoReader;
    if (VR && VR.prototype) {
      // Patch VideoReader.create so:
      // 1) `new VR(...)` runs synchronously before any `await` (preserving `this.linkPlayer(r.currentPlayer)`).
      // 2) `vr._frameCanvas` is initialized immediately with `width x height` so `vr.getVideo()` and `tgfx.getSourceSize` never fail.
      // 3) `vr.videoEl` is attached to the DOM, loaded, and primed to frame 0 before `VideoReader.create` resolves.
      VR.create = async function (
        mp4Bytes: any,
        width: number,
        height: number,
        frameRate: number,
        staticTimeRanges: any
      ) {
        const safeBytes =
          mp4Bytes instanceof Uint8Array
            ? new Uint8Array(mp4Bytes)
            : new Uint8Array(mp4Bytes || 0);
        const vr = new VR(safeBytes, width, height, frameRate, staticTimeRanges);
        const fw = Math.max(2, width || 500);
        const fh = Math.max(2, height || 500);
        const cv = document.createElement('canvas');
        cv.width = fw;
        cv.height = fh;
        vr._frameCanvas = cv;
        const v: HTMLVideoElement | null = vr.videoEl;
        if (v) {
          if (typeof document !== 'undefined' && document.body && !v.isConnected) {
            v.style.cssText =
              'position:fixed;width:2px;height:2px;opacity:0.001;pointer-events:none;left:-9999px;top:-9999px;z-index:-1';
            document.body.appendChild(v);
          }
          await new Promise<void>((res) => {
            let done = false;
            const fin = () => {
              if (done) return;
              done = true;
              clearTimeout(tm);
              v.removeEventListener('loadeddata', fin);
              v.removeEventListener('canplay', fin);
              v.removeEventListener('error', fin);
              res();
            };
            const tm = setTimeout(fin, 1500);
            if (v.readyState >= 2) {
              fin();
              return;
            }
            v.addEventListener('loadeddata', fin, { once: true });
            v.addEventListener('canplay', fin, { once: true });
            v.addEventListener('error', fin, { once: true });
            try {
              v.load();
            } catch {
              fin();
            }
          });
          if (v.videoWidth > 0 && v.videoHeight > 0) {
            cv.width = v.videoWidth;
            cv.height = v.videoHeight;
            vr.width = v.videoWidth;
            vr.height = v.videoHeight;
          }
          try {
            v.muted = true;
            await v.play();
            await new Promise<void>((r) => {
              let d = false;
              const f = () => {
                if (!d) {
                  d = true;
                  r();
                }
              };
              if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(f);
              }
              setTimeout(f, 24);
            });
            if (!vr.isPlaying) {
              try {
                v.pause();
                v.currentTime = 0;
              } catch {}
            }
          } catch {}
          vr._syncFrameCanvas();
        }
        return vr;
      };

      VR.prototype.getError = function () {
        return null;
      };
      VR.prototype.play = async function () {
        const v: HTMLVideoElement | null = this.videoEl;
        if (v && v.paused) {
          try {
            v.muted = true;
            await v.play();
          } catch {}
        }
      };
      VR.prototype._syncFrameCanvas = function () {
        const v: HTMLVideoElement | null = this.videoEl;
        if (!v || v.readyState < 2 || !(v.videoWidth > 0 && v.videoHeight > 0)) {
          return;
        }
        const fw = Math.max(2, this.width || v.videoWidth);
        const fh = Math.max(2, this.height || v.videoHeight);
        if (!this._frameCanvas) {
          this._frameCanvas = document.createElement('canvas');
        }
        if (this._frameCanvas.width !== fw || this._frameCanvas.height !== fh) {
          this._frameCanvas.width = fw;
          this._frameCanvas.height = fh;
        }
        const ctx = this._frameCanvas.getContext('2d');
        if (ctx) {
          try {
            ctx.clearRect(0, 0, fw, fh);
            ctx.drawImage(v, 0, 0, fw, fh);
            this._hasFrameCanvas = true;
          } catch {}
        }
      };
      VR.prototype.getVideo = function () {
        if (!this._frameCanvas) {
          this._frameCanvas = document.createElement('canvas');
          this._frameCanvas.width = Math.max(
            2,
            this.width || this.videoEl?.videoWidth || 500
          );
          this._frameCanvas.height = Math.max(
            2,
            this.height || this.videoEl?.videoHeight || 500
          );
        }
        return this._frameCanvas;
      };
      VR.prototype.seek = function (targetTime: number, playAfter = true) {
        return new Promise<void>((resolve) => {
          const v: HTMLVideoElement | null = this.videoEl;
          if (!v) {
            resolve();
            return;
          }
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(tm);
            v.removeEventListener('seeked', onSeeked);
            v.removeEventListener('loadeddata', onLoaded);
            this._hasSoughtOnce = true;
            this._syncFrameCanvas();
            if (playAfter && this.isPlaying) {
              v.muted = true;
              v.play().catch(() => {});
            } else if (!playAfter && !v.paused) {
              try {
                v.pause();
              } catch {}
            }
            resolve();
          };
          const onSeeked = () => finish();
          const onLoaded = () => {
            v.removeEventListener('loadeddata', onLoaded);
            try {
              v.currentTime = targetTime;
            } catch {
              finish();
            }
          };
          const tm = setTimeout(finish, 1200);
          v.addEventListener('seeked', onSeeked, { once: true });
          if (v.readyState >= 1) {
            try {
              if (
                this._hasSoughtOnce &&
                Math.abs((v.currentTime || 0) - targetTime) < 0.0005 &&
                !v.seeking &&
                v.readyState >= 2
              ) {
                finish();
                return;
              }
              v.currentTime = targetTime;
            } catch {
              finish();
            }
          } else {
            v.addEventListener('loadeddata', onLoaded, { once: true });
            try {
              v.load();
            } catch {}
          }
        });
      };
      VR.prototype.prepare = async function (
        targetFrame: number,
        playbackRate: number
      ) {
        this.setError(null);
        this.isSought = false;
        const v: HTMLVideoElement | null = this.videoEl;
        if (!v) return;
        if (!v.isConnected && typeof document !== 'undefined' && document.body) {
          v.style.cssText =
            'position:fixed;width:2px;height:2px;opacity:0.001;pointer-events:none;left:-9999px;top:-9999px;z-index:-1';
          document.body.appendChild(v);
        }
        if (v.readyState < 2) {
          await new Promise<void>((res) => {
            let d = false;
            const fin = () => {
              if (d) return;
              d = true;
              clearTimeout(t);
              v.removeEventListener('loadeddata', fin);
              v.removeEventListener('canplay', fin);
              res();
            };
            const t = setTimeout(fin, 1200);
            v.addEventListener('loadeddata', fin, { once: true });
            v.addEventListener('canplay', fin, { once: true });
          });
        }
        const curTime = v.currentTime || 0;
        const fps = Math.max(1, this.frameRate || 30);
        const targetSec = targetFrame / fps;
        if (!this._primedFirstFrame) {
          this._primedFirstFrame = true;
          try {
            v.muted = true;
            await v.play();
            await new Promise<void>((r) => {
              let done = false;
              const fin = () => {
                if (done) return;
                done = true;
                r();
              };
              if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(fin);
              }
              setTimeout(fin, 24);
            });
            if (!this.isPlaying) {
              try {
                v.pause();
              } catch {}
            }
          } catch {}
          if (Math.abs((v.currentTime || 0) - targetSec) > 0.001 || v.readyState < 2) {
            await this.seek(targetSec === 0 ? 0.001 : targetSec, !!this.isPlaying);
          }
          this._syncFrameCanvas();
        } else if (Math.round(targetSec * fps) !== Math.round(curTime * fps)) {
          const isStatic =
            this.staticTimeRanges &&
            typeof this.staticTimeRanges.contains === 'function' &&
            this.staticTimeRanges.contains(targetFrame);
          if (isStatic) {
            await this.seek(targetSec, false);
            return;
          }
          const driftThreshold = this.isPlaying
            ? Math.max(0.35, (1 / fps) * 8)
            : (0.4 / fps);
          if (Math.abs(curTime - targetSec) >= driftThreshold) {
            this.isSought = true;
            await this.seek(targetSec, !!this.isPlaying);
            return;
          }
        }
        const rate = Math.min(Math.max(playbackRate || 1, 0.125), 4);
        if (!this.disablePlaybackRate && v.playbackRate !== rate) {
          try {
            v.playbackRate = rate;
          } catch {}
        }
        if (this.isPlaying && v.paused) {
          await this.play();
        }
        this._syncFrameCanvas();
      };
      const origDestroy = VR.prototype.onDestroy;
      if (typeof origDestroy === 'function') {
        VR.prototype.onDestroy = function () {
          try {
            if (this.videoEl && this.videoEl.parentNode) {
              this.videoEl.remove();
            }
          } catch {}
          return origDestroy.call(this);
        };
      }
    }
  } catch {}
  return PAG;
}

/**
 * Loads the local `/lib/libpag.min.js` + `/lib/libpag.wasm` runtime in browser environments,
 * with a fallback to jsDelivr `libpag@4.3.45`.
 */
export function getBrowserLibpag(): Promise<any> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('libpag requires browser environment'));
  }
  if (browserLibpagPromise) return browserLibpagPromise;

  browserLibpagPromise = (async () => {
    const w = window as any;
    if (!w.libpag) {
      const urls = [
        '/lib/libpag.min.js',
        'https://cdn.jsdelivr.net/npm/libpag@4.3.45/lib/libpag.min.js',
      ];
      let loaded = false;
      for (const src of urls) {
        try {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(s);
          });
          if (w.libpag) {
            loaded = true;
            break;
          }
        } catch {}
      }
      if (!loaded || !w.libpag) {
        throw new Error('تعذر تحميل محرك PAG (libpag)');
      }
    }

    if (!w.__pagWasm) {
      const wasmUrls = [
        '/lib/libpag.wasm',
        'https://cdn.jsdelivr.net/npm/libpag@4.3.45/lib/libpag.wasm',
      ];
      for (const wu of wasmUrls) {
        try {
          const res = await fetch(wu);
          if (res.ok) {
            w.__pagWasm = await res.arrayBuffer();
            break;
          }
        } catch {}
      }
    }

    const PAGInit = w.libpag.PAGInit || w.libpag.default || w.libpag;
    const config = w.__pagWasm
      ? { wasmBinary: w.__pagWasm }
      : { locateFile: (file: string) => `/lib/${file}` };
    const PAG = await PAGInit(config);
    return patchLibpagRuntime(PAG);
  })().catch((err) => {
    browserLibpagPromise = null;
    throw err;
  });

  return browserLibpagPromise;
}

/**
 * Decodes a `.pag` file and, if it is a third-party Tencent `.pag` file (Vector, VideoSequence, or Bitmap)
 * without our custom `PAG_DECOMPOSED_V2` manifest, uses `libpag` (`PAGFile` + offscreen `PAGView`) in the browser
 * to extract exact dimensions/FPS and render decomposed frame layers so it displays and edits
 * cleanly everywhere in the platform.
 */
export async function decodePagWithLibpagFallback(
  rawInput: Uint8Array | ArrayBuffer | Blob
): Promise<PagDecodedMovie> {
  const bytes = await toUint8ArrayCrossRealm(rawInput);

  const baseDecoded = await decodePagBinaryToMovie(bytes);
  if (
    baseDecoded.isCustomDecomposedManifest &&
    baseDecoded.sprites.length > 0 &&
    Object.keys(baseDecoded.images).length > 0
  ) {
    return baseDecoded;
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return baseDecoded;
  }

  try {
    const PAG = await getBrowserLibpag();
    const ab = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    );
    const pagFile = await PAG.PAGFile.load(ab);
    if (!pagFile) return baseDecoded;

    const width = Math.max(1, Math.round(pagFile.width() || baseDecoded.width || 500));
    const height = Math.max(1, Math.round(pagFile.height() || baseDecoded.height || 500));
    const fps = Math.max(1, Math.round(pagFile.frameRate() || baseDecoded.fps || 30));
    const durationUs = Number(pagFile.duration() || 0);
    const totalFrames = Math.max(
      1,
      durationUs > 0
        ? Math.round((durationUs / 1_000_000) * fps)
        : baseDecoded.totalFrames || 30
    );

    const images: Record<string, Uint8Array> = {};
    const sprites: SvgaSprite[] = [];

    // Render frames via offscreen PAGView so VectorComposition and VideoSequence PAG files decompose into playable/editable layers
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const pagView = await PAG.PAGView.init(pagFile, canvas, {
      useScale: false,
      useCanvas2D: true,
      firstFrame: false,
    });

    if (pagView) {
      // Sample up to 60 frames so loading is fast while keeping smooth motion
      const maxSampledFrames = Math.min(totalFrames, 60);
      const renderedKeysByFrame: string[] = [];
      const uniqueFrames: { key: string; bytes: Uint8Array }[] = [];
      const ctx2d = canvas.getContext('2d');
      let anyVisibleFrame = false;

      for (let sIdx = 0; sIdx < maxSampledFrames; sIdx++) {
        const progress =
          maxSampledFrames <= 1 ? 0 : sIdx / maxSampledFrames;
        pagView.setProgress(progress);
        await pagView.flush();

        if (!anyVisibleFrame && ctx2d) {
          try {
            const imgData = ctx2d.getImageData(0, 0, width, height).data;
            for (let p = 3; p < imgData.length; p += 16) {
              if (imgData[p] > 2) {
                anyVisibleFrame = true;
                break;
              }
            }
          } catch {
            anyVisibleFrame = true;
          }
        }

        const blob: Blob | null = await new Promise((res) =>
          canvas.toBlob((b) => res(b), 'image/png')
        );
        if (blob) {
          const fBytes = new Uint8Array(await blob.arrayBuffer());
          const existing = uniqueFrames.find((uf) =>
            areBuffersEqual(uf.bytes, fBytes)
          );
          if (existing) {
            renderedKeysByFrame.push(existing.key);
          } else {
            const key = `pag_frame_${String(uniqueFrames.length + 1).padStart(3, '0')}`;
            uniqueFrames.push({ key, bytes: fBytes });
            renderedKeysByFrame.push(key);
          }
        }
      }

      try {
        pagView.destroy();
      } catch {}

      if (anyVisibleFrame && uniqueFrames.length > 0) {
        for (const uf of uniqueFrames) {
          images[uf.key] = uf.bytes;
          const fr: SvgaFrame[] = [];
          for (let f = 0; f < totalFrames; f++) {
            const mappedIdx = Math.min(
              renderedKeysByFrame.length - 1,
              Math.floor((f / Math.max(1, totalFrames)) * renderedKeysByFrame.length)
            );
            const isActive = renderedKeysByFrame[mappedIdx] === uf.key;
            fr.push({
              a: isActive ? 1 : 0,
              x: 0,
              y: 0,
              w: width,
              h: height,
              t: [1, 0, 0, 1, 0, 0],
            });
          }
          sprites.push({ key: uf.key, fr });
        }
      }
    }

    try {
      pagFile.destroy();
    } catch {}

    const finalImages =
      Object.keys(images).length > 0 ? images : baseDecoded.images;
    const finalSprites = sprites.length > 0 ? sprites : baseDecoded.sprites;
    const svgaMovie: SvgaMovie = {
      w: width,
      h: height,
      fps,
      n: totalFrames,
      im: finalImages,
      sp: finalSprites,
    };

    return {
      isValidPag: true,
      isDecomposedPag: finalSprites.length > 0,
      isCustomDecomposedManifest: false,
      version: baseDecoded.version,
      width,
      height,
      fps,
      totalFrames,
      durationSec: totalFrames / Math.max(1, fps),
      images: finalImages,
      sprites: finalSprites,
      audioBytes: baseDecoded.audioBytes,
      svgaMovie,
    };
  } catch {
    return baseDecoded;
  }
}

/**
 * Renders an `SvgaMovie` composition into an array of WebP frame buffers in the browser
 * so that `encodePagFileBinary` embeds full composite frames inside `BitmapCompositionBlock` (`TagCode = 45`).
 */
export async function renderSvgaMovieToWebpFrames(
  movie: SvgaMovie,
  maxFrames = 120
): Promise<Uint8Array[]> {
  if (typeof document === 'undefined' || !movie) return [];
  const W = Math.max(1, Math.round(movie.w || 500));
  const H = Math.max(1, Math.round(movie.h || 500));
  const totalF = Math.max(1, Math.min(Math.round(movie.n || 30), maxFrames));

  const imgElements: Record<string, HTMLImageElement> = {};
  const entries = Object.entries(movie.im || {});
  await Promise.all(
    entries.map(
      ([k, raw]) =>
        new Promise<void>((resolve) => {
          if (!raw || raw.byteLength === 0) {
            resolve();
            return;
          }
          const mime = isWebpBytes(raw)
            ? 'image/webp'
            : raw[0] === 0xff && raw[1] === 0xd8
              ? 'image/jpeg'
              : 'image/png';
          const url = URL.createObjectURL(
            new Blob([raw as unknown as BlobPart], { type: mime })
          );
          const img = new Image();
          img.onload = () => {
            imgElements[k] = img;
            URL.revokeObjectURL(url);
            resolve();
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          img.src = url;
        })
    )
  );

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const outFrames: Uint8Array[] = [];
  for (let f = 0; f < totalF; f++) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const s of movie.sp || []) {
      const fe = s.fr?.[f];
      const img = imgElements[s.key];
      if (!fe || !(fe.a > 0.001) || !img) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, fe.a));
      const t = fe.t || [1, 0, 0, 1, 0, 0];
      ctx.transform(t[0] ?? 1, t[1] ?? 0, t[2] ?? 0, t[3] ?? 1, t[4] ?? 0, t[5] ?? 0);
      if (fe.clipPath && typeof Path2D !== 'undefined') {
        try {
          ctx.clip(new Path2D(fe.clipPath));
        } catch {}
      }
      ctx.drawImage(
        img,
        fe.x || 0,
        fe.y || 0,
        fe.w || img.naturalWidth || W,
        fe.h || img.naturalHeight || H
      );
      ctx.restore();
    }

    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob((b) => res(b), 'image/webp', 0.92)
    );
    if (blob) {
      const u = new Uint8Array(await blob.arrayBuffer());
      if (isWebpBytes(u)) {
        outFrames.push(u);
        continue;
      }
    }
    const id = ctx.getImageData(0, 0, W, H);
    outFrames.push(encodeLosslessWebPFrame(id.data, W, H));
  }

  return outFrames;
}

if (typeof window !== 'undefined') {
  (window as any).__pagEngine = {
    isPagBinary,
    encodePagFileBinary,
    decodePagBinaryToMovie,
    decodePagWithLibpagFallback,
    renderSvgaMovieToWebpFrames,
    getBrowserLibpag,
  };
}

