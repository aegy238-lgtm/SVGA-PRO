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

test('analyzePngBinary and compressPngBufferLikeReference on uploaded img_1646.png', (t) => {
  const imgPath = path.resolve(process.cwd(), 'public/assets/aistudio/img_1646_53c64ddd.png');
  if (!fs.existsSync(imgPath)) {
    t.skip('Sample img_1646_53c64ddd.png file not present in public/assets/aistudio');
    return;
  }
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

test('compressSvga2Binary scales 750x750 sprite to 300x300 PNG-8 and compensates FrameEntity transform to 2.5x', (t) => {
  const imgPath = path.resolve(process.cwd(), 'public/assets/aistudio/img_1646_53c64ddd.png');
  if (!fs.existsSync(imgPath)) {
    t.skip('Sample img_1646_53c64ddd.png file not present in public/assets/aistudio');
    return;
  }
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

test('repairs 100.69.svga-style distorted SVGA 2.0 files (69% PNGs with 100% layout, mirrored wings, and clipPath ribbons) on parse and export', async () => {
  const { serializeDecomposedSvga } = await import('./svgaEditorLogic');
  const { readImageDimensionsFromBytes, getSvgPathBounds } = await import('./codecs');

  // Create a 69x83 PNG (69% of 100x120 wing layout) and a 138x69 PNG (69% of 200x100 ribbon layout)
  const wingRgba = new Uint8Array(69 * 83 * 4).fill(200);
  const wingPng = new Uint8Array((UPNG as any).encode([wingRgba.buffer], 69, 83, 0));
  const ribbonRgba = new Uint8Array(138 * 69 * 4).fill(220);
  const ribbonPng = new Uint8Array((UPNG as any).encode([ribbonRgba.buffer], 138, 69, 0));

  assert.deepEqual(readImageDimensionsFromBytes(wingPng), { w: 69, h: 83 });
  assert.deepEqual(readImageDimensionsFromBytes(ribbonPng), { w: 138, h: 69 });

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

  // Sprite 0: Left wing (layout 100x120, transform a=1, d=1, tx=50, ty=60 -> spans X=[50..150])
  const leftWingFrame = pb(
    2,
    cat([
      pf(1, 1),
      pb(2, cat([pf(1, 0), pf(2, 0), pf(3, 100), pf(4, 120)])),
      pb(3, cat([pf(1, 1), pf(2, 0), pf(3, 0), pf(4, 1), pf(5, 50), pf(6, 60)])),
      ps(4, 'M 0 0 L 100 0 L 100 120 L 0 120 Z'),
    ])
  );
  // Sprite 1: Mirrored Right wing (layout 100x120, transform a=-1, d=1, tx=250, ty=60 -> spans X=[250..150], meeting left wing at X=150!)
  const rightWingFrame = pb(
    2,
    cat([
      pf(1, 1),
      pb(2, cat([pf(1, 0), pf(2, 0), pf(3, 100), pf(4, 120)])),
      pb(3, cat([pf(1, -1), pf(2, 0), pf(3, 0), pf(4, 1), pf(5, 250), pf(6, 60)])),
      ps(4, 'M 0 0 L 100 0 L 100 120 L 0 120 Z'),
    ])
  );
  // Sprite 2: Clipped Ribbon (layout 200x100, transform a=1, d=1, tx=50, ty=190, clipPath in 200x100 space)
  const ribbonFrame = pb(
    2,
    cat([
      pf(1, 1),
      pb(2, cat([pf(1, 0), pf(2, 0), pf(3, 200), pf(4, 100)])),
      pb(3, cat([pf(1, 1), pf(2, 0), pf(3, 0), pf(4, 1), pf(5, 50), pf(6, 190)])),
      ps(4, 'M 0 0 L 200 0 L 200 100 L 0 100 Z'),
    ])
  );

  const movieProto = cat([
    ps(1, '2.0.0'),
    pb(2, cat([pf(1, 300), pf(2, 300), pi(3, 30), pi(4, 1)])),
    pb(3, cat([ps(1, 'wing'), pb(2, wingPng)])),
    pb(3, cat([ps(1, 'hawa_img_F1'), pb(2, ribbonPng)])),
    pb(4, cat([ps(1, 'wing'), leftWingFrame])),
    pb(4, cat([ps(1, 'wing'), rightWingFrame])),
    pb(4, cat([ps(1, 'hawa_img_F1'), ribbonFrame])),
  ]);

  const parsed = parseMovie(movieProto);
  assert.equal(parsed.layoutNormalized, true);

  // Left wing is normalized to 69x83 with a = 100/69 so right edge is 50 + 69 * (100/69) = 150
  const lwFr = parsed.sp[0].fr[0];
  assert.equal(lwFr.w, 69);
  assert.equal(lwFr.h, 83);
  const leftWingInnerEdgeX = lwFr.t[0] * lwFr.w + lwFr.t[4];
  assert.ok(Math.abs(leftWingInnerEdgeX - 150) < 1e-2, `Expected left wing inner edge at 150, got ${leftWingInnerEdgeX}`);

  // Right wing is normalized to 69x83 with a = -100/69 so inner edge is 250 + (-100/69) * 69 = 150 (zero gap!)
  const rwFr = parsed.sp[1].fr[0];
  assert.equal(rwFr.w, 69);
  assert.equal(rwFr.h, 83);
  const rightWingInnerEdgeX = rwFr.t[0] * rwFr.w + rwFr.t[4];
  assert.ok(Math.abs(rightWingInnerEdgeX - 150) < 1e-2, `Expected right wing inner edge at 150, got ${rightWingInnerEdgeX}`);

  // Ribbon clipPath is scaled from 200x100 down to 138x69 to match bitmap dimensions in external svgaplayerweb players
  const ribFr = parsed.sp[2].fr[0];
  assert.equal(ribFr.w, 138);
  assert.equal(ribFr.h, 69);
  const ribClipBounds = getSvgPathBounds(ribFr.clipPath);
  assert.ok(ribClipBounds);
  assert.ok(Math.abs(ribClipBounds.maxX - 138) < 1e-2);
  assert.ok(Math.abs(ribClipBounds.maxY - 69) < 1e-2);

  // Re-serializing without passing assetDimensions still preserves 69x83 and 138x69 layouts
  const reserialized = serializeDecomposedSvga(parsed);
  const reparsed = parseMovie(reserialized);
  assert.equal(reparsed.sp[0].fr[0].w, 69);
  assert.equal(reparsed.sp[1].fr[0].w, 69);
  assert.equal(reparsed.sp[2].fr[0].w, 138);
});

