import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLATFORM_SETTINGS,
  INITIAL_USERS,
  INITIAL_SUPER_ADMIN_ACCOUNT,
  PURGED_LEGACY_ADMIN_EMAILS,
  resolveEffectiveFormatKey,
  checkConversionPermission,
  buildWhatsAppUrl,
  isPurgedLegacyAdmin,
  verifyUserPassword,
  isSuperAdminUser,
  canAccessAdminDashboard,
  hasAdminPermission,
  computeSessionToken,
  verifySessionToken,
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  resetLoginAttempts,
  sanitizeUsersList,
  type UserAccount,
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

test('legacy admin accounts are purged and cannot authenticate', () => {
  for (const legacyEmail of PURGED_LEGACY_ADMIN_EMAILS) {
    assert.equal(
      INITIAL_USERS.some((u) => u.email.toLowerCase() === legacyEmail),
      false,
      `Legacy admin ${legacyEmail} must not exist in INITIAL_USERS`
    );
  }
  const fakeOldAdmin: UserAccount = {
    id: 'usr_admin_1',
    name: 'Old Admin',
    email: 'aegy238@gmail.com',
    password: 'admin123456',
    role: 'admin',
    isPro: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  assert.equal(isPurgedLegacyAdmin(fakeOldAdmin), true);
  assert.equal(verifyUserPassword(fakeOldAdmin, 'admin123456'), false);
  assert.equal(canAccessAdminDashboard(fakeOldAdmin), false);

  const sanitized = sanitizeUsersList([fakeOldAdmin]);
  assert.equal(sanitized.some((u) => u.email === 'aegy238@gmail.com'), false);
  assert.equal(sanitized.some((u) => u.email === INITIAL_SUPER_ADMIN_ACCOUNT.email), true);
});

test('verifyUserPassword enforces exact match and rejects backdoor or empty passwords', () => {
  assert.equal(verifyUserPassword(INITIAL_SUPER_ADMIN_ACCOUNT, INITIAL_SUPER_ADMIN_ACCOUNT.password!), true);
  assert.equal(verifyUserPassword(INITIAL_SUPER_ADMIN_ACCOUNT, 'admin'), false);
  assert.equal(verifyUserPassword(INITIAL_SUPER_ADMIN_ACCOUNT, 'admin123456'), false);
  assert.equal(verifyUserPassword(INITIAL_SUPER_ADMIN_ACCOUNT, ''), false);

  const userWithoutPassword: UserAccount = {
    id: 'usr_no_pwd',
    name: 'No Pwd',
    email: 'nopwd@example.com',
    role: 'user',
    isPro: false,
    createdAt: '2026-10-25T00:00:00.000Z',
  };
  assert.equal(verifyUserPassword(userWithoutPassword, 'anything'), false);
});

test('granular RBAC permissions and session token verification work accurately', () => {
  assert.equal(isSuperAdminUser(INITIAL_SUPER_ADMIN_ACCOUNT), true);
  assert.equal(hasAdminPermission(INITIAL_SUPER_ADMIN_ACCOUNT, 'manage_admins'), true);
  assert.equal(hasAdminPermission(INITIAL_SUPER_ADMIN_ACCOUNT, 'manage_users'), true);

  const subAdmin: UserAccount = {
    id: 'usr_sub_1',
    name: 'Moderator Sara',
    email: 'sara@example.com',
    password: '123456',
    role: 'admin',
    isSuperAdmin: false,
    adminPermissions: ['manage_users', 'manage_notifications'],
    adminBadgeTitle: 'مشرف تفعيل الحسابات',
    isPro: true,
    createdAt: '2026-10-25T00:00:00.000Z',
  };

  assert.equal(isSuperAdminUser(subAdmin), false);
  assert.equal(canAccessAdminDashboard(subAdmin), true);
  assert.equal(hasAdminPermission(subAdmin, 'manage_users'), true);
  assert.equal(hasAdminPermission(subAdmin, 'manage_notifications'), true);
  assert.equal(hasAdminPermission(subAdmin, 'manage_firebase'), false);
  assert.equal(hasAdminPermission(subAdmin, 'manage_admins'), false);

  const token = computeSessionToken(subAdmin);
  assert.equal(verifySessionToken(subAdmin, token), true);

  // Tampering with permissions invalidates session token
  const tampered: UserAccount = {
    ...subAdmin,
    adminPermissions: ['manage_users', 'manage_notifications', 'manage_admins'],
  };
  assert.equal(verifySessionToken(tampered, token), false);
});

test('brute-force login rate limiter locks after 5 failed attempts and resets on success', () => {
  const testEmail = 'attacker@example.com';
  resetLoginAttempts(testEmail);
  const t0 = 1_000_000;

  assert.equal(checkLoginRateLimit(testEmail, t0).allowed, true);
  for (let i = 1; i <= 4; i++) {
    const res = recordFailedLoginAttempt(testEmail, t0 + i * 100);
    assert.equal(res.locked, false);
  }
  const fifth = recordFailedLoginAttempt(testEmail, t0 + 500);
  assert.equal(fifth.locked, true);
  assert.equal(checkLoginRateLimit(testEmail, t0 + 1000).allowed, false);

  // After lockout duration expires (60s), login is allowed again
  assert.equal(checkLoginRateLimit(testEmail, t0 + 65_000).allowed, true);
  resetLoginAttempts(testEmail);
});

