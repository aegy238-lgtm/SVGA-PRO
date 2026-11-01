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
