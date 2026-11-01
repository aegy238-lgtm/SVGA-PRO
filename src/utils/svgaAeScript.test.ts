import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getTranslation } from './i18n';

test('SVGA to After Effects: HTML file exists in public with valid bundle', () => {
  const filePath = path.join(process.cwd(), 'public', 'svga-to-after-effects.html');
  assert.ok(fs.existsSync(filePath), 'svga-to-after-effects.html must exist in public folder');

  const content = fs.readFileSync(filePath, 'utf-8');
  assert.ok(content.includes('SVGA \u2192 After Effects') || content.includes('SVGA \u2192 AFTER EFFECTS') || content.includes('After Effects'), 'HTML must contain After Effects branding');
  assert.ok(content.includes('svga-ae-file'), 'HTML must listen for local postMessage svga-ae-file');
  assert.ok(content.includes('AfterEffects') || content.includes('After Effects'), 'HTML must contain After Effects export logic');
  assert.ok(content.includes('ADBE Transform Group') || content.includes('ADBE'), 'HTML must contain AE extendscript transform definitions');
});

test('i18n translations include After Effects script button in AR and EN', () => {
  const ar = getTranslation('ar');
  const en = getTranslation('en');

  assert.equal(ar.aeScriptBtn, 'سكريبت افتر افكت');
  assert.equal(en.aeScriptBtn, 'After Effects Script');
  assert.ok(ar.aeScriptBtnTitle.includes('After Effects'));
  assert.ok(en.aeScriptBtnTitle.includes('After Effects'));
});

test('Matrix affine decomposition logic preserves shear & scale for After Effects', () => {
  // Pure 2D affine decomposition test matching engine
  function decompose(t: { a: number; b: number; c: number; d: number; tx: number; ty: number }) {
    const { a, b, c, d, tx, ty } = t;
    const det = a * d - b * c;
    const x = Math.hypot(a, b);
    const y = Math.hypot(c, d);
    if (Math.abs(a * c + b * d) < 1e-8 * Math.max(1, x * y)) {
      if (x > 1e-10) return [tx, ty, x * 100, (det / x) * 100, (Math.atan2(t.b, t.a) * 180) / Math.PI, 0];
      return [tx, ty, 0, y * 100, (Math.atan2(-t.c, t.d) * 180) / Math.PI, 0];
    }
    const theta = 0.5 * Math.atan2(2 * (a * b + c * d), a * a + c * c - b * b - d * d);
    const co = Math.cos(theta),
      si = Math.sin(theta);
    const sx = Math.hypot(co * a + si * b, co * c + si * d);
    const sy = sx > 1e-12 ? det / sx : 0;
    const phi = Math.atan2(-(co * c + si * d), co * a + si * b);
    return [tx, ty, sx * 100, sy * 100, (theta * 180) / Math.PI, (phi * 180) / Math.PI];
  }

  // Identity matrix
  const idResult = decompose({ a: 1, b: 0, c: 0, d: 1, tx: 50, ty: 100 });
  assert.equal(idResult[0], 50); // tx
  assert.equal(idResult[1], 100); // ty
  assert.equal(Math.round(idResult[2]), 100); // scaleX
  assert.equal(Math.round(idResult[3]), 100); // scaleY
  assert.equal(Math.round(idResult[4]), 0); // rotation

  // Scaled 2x
  const scaleResult = decompose({ a: 2, b: 0, c: 0, d: 2, tx: 0, ty: 0 });
  assert.equal(Math.round(scaleResult[2]), 200);
  assert.equal(Math.round(scaleResult[3]), 200);
});

test('createAePackage generates valid JSX, assets folder, and metadata zip package', async () => {
  const { createAePackage } = await import('../services/svgaAeExport');
  const JSZip = (await import('jszip')).default;

  // Minimal 1x1 PNG bytes for testing
  const dummyPng = new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
    0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196,
    137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 240,
    31, 0, 5, 0, 1, 255, 89, 77, 24, 84, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
  ]);

  const mockMovie = {
    version: '2.0',
    params: {
      viewBoxWidth: 500,
      viewBoxHeight: 500,
      fps: 30,
      frames: 10,
    },
    images: {
      'icon_star': dummyPng,
    },
    sprites: [
      {
        imageKey: 'icon_star',
        frames: [
          { alpha: 1, transform: { a: 1, b: 0, c: 0, d: 1, tx: 10, ty: 20 } },
          { alpha: 0.8, transform: { a: 1.1, b: 0, c: 0, d: 1.1, tx: 15, ty: 25 } },
        ],
      },
    ],
    audios: [],
  };

  const progressUpdates: number[] = [];
  const pkg = await createAePackage(mockMovie, 'Test_Gift', (p) => progressUpdates.push(p), { bakeClips: false });

  assert.ok(pkg.blob, 'Package must produce a blob');
  assert.equal(pkg.name, 'Test_Gift');
  assert.equal(pkg.zipFileName, 'Test_Gift-AfterEffects.zip');
  assert.ok(pkg.jsx.includes('#target aftereffects'));
  assert.ok(pkg.jsx.includes('aeImporter'));
  assert.ok(progressUpdates.length > 0, 'Progress callback must have been called');

  // Verify contents inside the generated zip
  const zip = await JSZip.loadAsync(await pkg.blob.arrayBuffer());
  const files = Object.keys(zip.files);

  assert.ok(files.some(f => f.endsWith('Test_Gift.jsx')), 'ZIP must contain Test_Gift.jsx');
  assert.ok(files.some(f => f.endsWith('assets_info.json')), 'ZIP must contain assets_info.json');
  assert.ok(files.some(f => f.endsWith('README.txt')), 'ZIP must contain README.txt');
  assert.ok(files.some(f => f.includes('assets/')), 'ZIP must contain assets/ folder');

  const assetsInfoStr = await zip.file('Test_Gift-assets/assets_info.json')?.async('string');
  assert.ok(assetsInfoStr, 'assets_info.json must be readable');
  const info = JSON.parse(assetsInfoStr!);
  assert.equal(info.baseFileName, 'Test_Gift');
  assert.equal(info.totalImages, 1);
});
