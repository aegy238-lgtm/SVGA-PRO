import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  analyzePngBinary,
  computeSvgaSpriteCompressionTarget,
  quantizeAndEncodePng8Dithered,
  compressPngBufferLikeReference,
  compressSvga2Binary,
} from './svgaImageCompressor';
import { parseMovie, pako, UPNG } from './codecs';

test('analyzePngBinary and compressPngBufferLikeReference on uploaded img_1646.png', () => {
  const imgPath = path.resolve(process.cwd(), 'public/assets/aistudio/img_1646_53c64ddd.png');
  const rawBuf = new Uint8Array(fs.readFileSync(imgPath));

  const initialAnalysis = analyzePngBinary(rawBuf);
  assert.equal(initialAnalysis.width, 300);
  assert.equal(initialAnalysis.height, 300);
  assert.equal(initialAnalysis.uniqueRgbaColors, 256);
  assert.equal(initialAnalysis.semiTransparentColors, 98);
  assert.equal(initialAnalysis.isDithered, true);

  // Re-compressing with the discovered system converts it to Indexed PNG-8 (colorType = 3, PLTE + tRNS) at ~51.6 KB
  const compressed = compressPngBufferLikeReference(rawBuf, 100, 'smart_300');
  assert.equal(compressed.targetW, 300);
  assert.equal(compressed.targetH, 300);
  assert.ok(
    compressed.bytes.byteLength < rawBuf.byteLength * 0.4,
    `Expected PNG-8 size (${compressed.bytes.byteLength}) to be < 40% of PNG-32 (${rawBuf.byteLength})`
  );

  const afterAnalysis = analyzePngBinary(compressed.bytes);
  assert.equal(afterAnalysis.colorType, 3);
  assert.equal(afterAnalysis.hasPlte, true);
  assert.equal(afterAnalysis.plteCount, 256);
  assert.equal(afterAnalysis.hasTrns, true);
  assert.equal(afterAnalysis.uniqueRgbaColors, 256);
});

test('computeSvgaSpriteCompressionTarget maps 750x750 sprite to 300x300 (sx=2.5, sy=2.5, 256 colors)', () => {
  const target = computeSvgaSpriteCompressionTarget(750, 750, 100, 'smart_300');
  assert.equal(target.origW, 750);
  assert.equal(target.origH, 750);
  assert.equal(target.targetW, 300);
  assert.equal(target.targetH, 300);
  assert.equal(target.sx, 2.5);
  assert.equal(target.sy, 2.5);
  assert.equal(target.maxColors, 256);

  // Lowering quality Percent on an already 300x300 sprite reduces dimensions and palette smoothly
  const target60 = computeSvgaSpriteCompressionTarget(300, 300, 60, 'smart_300');
  assert.ok(target60.targetW < 300 && target60.targetW > 150);
  assert.equal(target60.targetW, target60.targetH);

  // Unified auto_quality mode (driven solely by #qual):
  // - At 100%: preserves 100% original dimensions (750x750, sx=1, sy=1)
  const auto100 = computeSvgaSpriteCompressionTarget(750, 750, 100, 'auto_quality');
  assert.equal(auto100.targetW, 750);
  assert.equal(auto100.targetH, 750);
  assert.equal(auto100.sx, 1);
  assert.equal(auto100.sy, 1);
  assert.equal(auto100.maxColors, 256);

  // - At 85%: locks onto the 300x300 reference gift size (sx=2.5, sy=2.5, 256 colors)
  const auto85 = computeSvgaSpriteCompressionTarget(750, 750, 85, 'auto_quality');
  assert.equal(auto85.targetW, 300);
  assert.equal(auto85.targetH, 300);
  assert.equal(auto85.sx, 2.5);
  assert.equal(auto85.sy, 2.5);
  assert.equal(auto85.maxColors, 256);

  // - At 50%: scales below 300x300 and reduces palette colors progressively
  const auto50 = computeSvgaSpriteCompressionTarget(750, 750, 50, 'auto_quality');
  assert.ok(auto50.targetW < 300 && auto50.targetW > 100);
  assert.ok(auto50.maxColors < 256 && auto50.maxColors >= 32);
});

test('quantizeAndEncodePng8Dithered quantizes >10,000 TrueColor RGBA gradient + vignette into PNG-8 with PLTE+tRNS', () => {
  const W = 160;
  const H = 160;
  const rgba = new Uint8Array(W * H * 4);
  const cx = W / 2;
  const cy = H / 2;
  const maxR = W / 2;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist >= maxR) {
        // Fully transparent corner
        rgba[i] = 200;
        rgba[i + 1] = 100;
        rgba[i + 2] = 50;
        rgba[i + 3] = 0;
      } else {
        const edgeRatio = dist / maxR;
        const alpha = edgeRatio > 0.75 ? Math.round(255 * (1 - (edgeRatio - 0.75) / 0.25)) : 255;
        rgba[i] = (x * 3 + y) & 255;
        rgba[i + 1] = (y * 5 + x * 2) & 255;
        rgba[i + 2] = (128 + x - y) & 255;
        rgba[i + 3] = Math.max(0, Math.min(255, alpha));
      }
    }
  }

  const png8 = quantizeAndEncodePng8Dithered(rgba, W, H, { maxColors: 256, ditherStrength: 0.7 });
  const analysis = analyzePngBinary(png8);
  assert.equal(analysis.colorType, 3);
  assert.equal(analysis.hasPlte, true);
  assert.equal(analysis.hasTrns, true);
  assert.ok(analysis.uniqueRgbaColors <= 256 && analysis.uniqueRgbaColors > 64);
  assert.ok(analysis.semiTransparentColors > 5);

  // Verify corner pixel (0,0) remained 100% transparent (0,0,0,0) with zero dither noise
  const dec = UPNG.decode(png8.buffer.slice(png8.byteOffset, png8.byteOffset + png8.byteLength));
  const outRgba = new Uint8Array(UPNG.toRGBA8(dec)[0]);
  assert.equal(outRgba[3], 0);
});

test('compressSvga2Binary scales 750x750 sprite to 300x300 PNG-8 and compensates FrameEntity transform to 2.5x', () => {
  const imgPath = path.resolve(process.cwd(), 'public/assets/aistudio/img_1646_53c64ddd.png');
  const rawImgBuf = new Uint8Array(fs.readFileSync(imgPath));
  const decRef = UPNG.decode(rawImgBuf.buffer.slice(rawImgBuf.byteOffset, rawImgBuf.byteOffset + rawImgBuf.byteLength));
  const refRgba = new Uint8Array(UPNG.toRGBA8(decRef)[0]);

  const W = 750;
  const H = 750;
  const rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(299, Math.floor((y * 300) / H));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(299, Math.floor((x * 300) / W));
      const si = (sy * 300 + sx) * 4;
      const di = (y * W + x) * 4;
      rgba[di] = Math.min(255, refRgba[si] + ((x + y) & 3));
      rgba[di + 1] = refRgba[si + 1];
      rgba[di + 2] = refRgba[si + 2];
      rgba[di + 3] = refRgba[si + 3];
    }
  }
  // Uncompressed/TrueColor PNG-32 (forbidPlte = true)
  const png32 = new Uint8Array((UPNG as any).encode([rgba.buffer], W, H, 0, [], true));

  const TE = new TextEncoder();
  const cat = (arr: Uint8Array[]) => {
    const o = new Uint8Array(arr.reduce((s, x) => s + x.length, 0));
    let p = 0;
    for (const x of arr) {
      o.set(x, p);
      p += x.length;
    }
    return o;
  };
  const pv = (n: number) => {
    const o: number[] = [];
    while (n > 127) {
      o.push((n & 127) | 128);
      n = Math.floor(n / 128);
    }
    o.push(n);
    return Uint8Array.from(o);
  };
  const pf = (f: number, v: number) => cat([pv((f << 3) | 5), new Uint8Array(new Float32Array([v]).buffer)]);
  const pi = (f: number, v: number) => cat([pv(f << 3), pv(v)]);
  const pb = (f: number, d: Uint8Array) => cat([pv((f << 3) | 2), pv(d.length), d]);
  const ps = (f: number, s: string) => pb(f, TE.encode(s));

  const lay = pb(2, cat([pf(1, 0), pf(2, 0), pf(3, W), pf(4, H)]));
  const tr = pb(3, cat([pf(1, 1), pf(2, 0), pf(3, 0), pf(4, 1), pf(5, 0), pf(6, 0)]));
  const frameMsg = pb(2, cat([pf(1, 1), lay, tr]));
  const spriteMsg = pb(4, cat([ps(1, 'img_1646'), frameMsg]));
  const movieProto = cat([
    ps(1, '2.0.0'),
    pb(2, cat([pf(1, W), pf(2, H), pi(3, 15), pi(4, 1)])),
    pb(3, cat([ps(1, 'img_1646'), pb(2, png32)])),
    spriteMsg,
  ]);
  const rawSvga = pako.deflate(movieProto);

  const res = compressSvga2Binary(rawSvga, 100, 'smart_300');
  assert.equal(res.compressedImageCount, 1);
  assert.ok(res.bytes.byteLength < rawSvga.byteLength * 0.25);

  const parsed = parseMovie(pako.inflate(res.bytes));
  // Stage resolution stays 750x750
  assert.equal(parsed.w, 750);
  assert.equal(parsed.h, 750);

  // Embedded image is now 300x300 Indexed PNG-8
  const imgAnalysis = analyzePngBinary(parsed.im['img_1646']);
  assert.equal(imgAnalysis.width, 300);
  assert.equal(imgAnalysis.height, 300);
  assert.equal(imgAnalysis.colorType, 3);
  assert.equal(imgAnalysis.hasPlte, true);

  // FrameEntity layout is 300x300 and transform scales by 2.5x so 300 * 2.5 = 750
  const fr0 = parsed.sp[0].fr[0];
  assert.equal(Math.round(fr0.w), 300);
  assert.equal(Math.round(fr0.h), 300);
  assert.ok(Math.abs(fr0.t[0] - 2.5) < 1e-4);
  assert.ok(Math.abs(fr0.t[3] - 2.5) < 1e-4);
});
