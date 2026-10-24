import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLATFORM_SETTINGS,
  INITIAL_USERS,
  resolveEffectiveFormatKey,
  checkConversionPermission,
  buildWhatsAppUrl,
} from './platformStore.ts';

test('resolveEffectiveFormatKey resolves orig to source file extension', () => {
  assert.equal(resolveEffectiveFormatKey('orig', 'gift_lion.svga'), 'svga');
  assert.equal(resolveEffectiveFormatKey('orig', 'dragon_effect.vap'), 'vap');
  assert.equal(resolveEffectiveFormatKey('orig', 'castle.yyeva'), 'yyeva');
  assert.equal(resolveEffectiveFormatKey('orig', 'anim.json'), 'lottie');
  assert.equal(resolveEffectiveFormatKey('mp4', 'gift_lion.svga'), 'mp4');
  assert.equal(resolveEffectiveFormatKey('vap', 'video.mp4'), 'vap');
});

test('checkConversionPermission allows free formats for free users and blocks Pro formats', () => {
  const freeUser = INITIAL_USERS.find((u) => !u.isPro && u.role === 'user')!;
  const proUser = INITIAL_USERS.find((u) => u.isPro && u.role === 'user')!;
  const adminUser = INITIAL_USERS.find((u) => u.role === 'admin')!;

  const settings = {
    ...DEFAULT_PLATFORM_SETTINGS,
    proFormats: ['svga', 'vap', 'yyeva'],
    requireProForAllConversions: false,
  };

  // Free user converting to GIF (which is free) -> allowed
  const freeGif = checkConversionPermission(freeUser, settings, 'gif', 'test.svga');
  assert.equal(freeGif.allowed, true);
  assert.equal(freeGif.isFormatPro, false);

  // Free user converting to VAP (which is Pro) -> blocked with pro_required
  const freeVap = checkConversionPermission(freeUser, settings, 'vap', 'test.mp4');
  assert.equal(freeVap.allowed, false);
  assert.equal(freeVap.isFormatPro, true);
  assert.equal(freeVap.reason, 'pro_required');

  // Free user keeping original on an SVGA file (where svga is Pro) -> blocked
  const freeOrigSvga = checkConversionPermission(freeUser, settings, 'orig', 'royal_car.svga');
  assert.equal(freeOrigSvga.allowed, false);
  assert.equal(freeOrigSvga.effectiveFormatKey, 'svga');

  // Pro user converting to VAP -> allowed
  const proVap = checkConversionPermission(proUser, settings, 'vap', 'test.mp4');
  assert.equal(proVap.allowed, true);

  // Admin user converting to VAP -> allowed, unless previewing as free_user
  const adminVap = checkConversionPermission(adminUser, settings, 'vap', 'test.mp4', 'actual');
  assert.equal(adminVap.allowed, true);

  const adminPreviewFree = checkConversionPermission(
    adminUser,
    settings,
    'vap',
    'test.mp4',
    'free_user'
  );
  assert.equal(adminPreviewFree.allowed, false);
  assert.equal(adminPreviewFree.reason, 'pro_required');
});

test('buildWhatsAppUrl formats international numbers and encodes text', () => {
  const url = buildWhatsAppUrl('+20 100-123-4567', 'مرحباً أريد الاشتراك في برو');
  assert.ok(url.startsWith('https://wa.me/201001234567?text='));
  assert.equal(buildWhatsAppUrl('', 'hello'), '');
});
