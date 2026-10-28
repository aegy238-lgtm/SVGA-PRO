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
  canUserCaptureScreen,
  hasAdminPermission,
  computeSessionToken,
  verifySessionToken,
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  resetLoginAttempts,
  sanitizeUsersList,
  revokeAdminFromUserAccount,
  setUserScreenCapturePermission,
  getUserProSubscriptionInfo,
  checkAndExpireUsersPro,
  sanitizeSiteLogoUrl,
  sanitizeSiteName,
  mergeBrandingSettingsSafely,
  resolveAuthenticatedUserOnLogin,
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

test('granular RBAC permissions, admin revocation, and session token verification work accurately', () => {
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

  // Revoking Admin completely clears role, permissions, and badge
  const revoked = revokeAdminFromUserAccount(subAdmin);
  assert.equal(revoked.role, 'user');
  assert.deepEqual(revoked.adminPermissions, []);
  assert.equal(revoked.adminBadgeTitle, '');
  assert.equal(canAccessAdminDashboard(revoked), false);
  assert.equal(hasAdminPermission(revoked, 'manage_users'), false);

  const token = computeSessionToken(subAdmin);
  assert.equal(verifySessionToken(subAdmin, token), true);

  // Tampering with permissions invalidates session token
  const tampered: UserAccount = {
    ...subAdmin,
    adminPermissions: ['manage_users', 'manage_notifications', 'manage_admins'],
  };
  assert.equal(verifySessionToken(tampered, token), false);

  // Privilege escalation attempt: fake user claiming isSuperAdmin: true or role: 'admin' with no permissions
  const fakeSuperAdmin: UserAccount = {
    id: 'usr_hacker_99',
    name: 'Hacker',
    email: 'hacker@example.com',
    role: 'admin',
    isSuperAdmin: true,
    isPro: true,
    createdAt: '2026-10-25T00:00:00.000Z',
  };
  assert.equal(isSuperAdminUser(fakeSuperAdmin), false);
  assert.equal(canAccessAdminDashboard(fakeSuperAdmin), false);
  const cleanedUsers = sanitizeUsersList([fakeSuperAdmin]);
  const cleanedHacker = cleanedUsers.find((u) => u.id === 'usr_hacker_99')!;
  assert.equal(cleanedHacker.role, 'user');
  assert.equal(cleanedHacker.isSuperAdmin, false);
});

test('Pro subscription duration calculation and automatic expiration revert user to regular free user', () => {
  const startMs = new Date('2026-10-01T00:00:00.000Z').getTime();
  const expiresMs = new Date('2026-10-08T00:00:00.000Z').getTime(); // 7-day week plan
  const midMs = new Date('2026-10-04T00:00:00.000Z').getTime(); // 4 days left
  const afterMs = new Date('2026-10-09T00:00:00.000Z').getTime(); // expired!

  const proSubscriber: UserAccount = {
    id: 'usr_week_sub',
    name: 'Ahmed Weekly',
    email: 'ahmed@example.com',
    password: '123456',
    role: 'user',
    isPro: true,
    proPlanId: 'week',
    proPlanName: 'باقة أسبوع',
    createdAt: '2026-10-01T00:00:00.000Z',
    proActivatedAt: new Date(startMs).toISOString(),
    proExpiresAt: new Date(expiresMs).toISOString(),
  };

  // While active (4 days remaining)
  const activeInfo = getUserProSubscriptionInfo(proSubscriber, DEFAULT_PLATFORM_SETTINGS, midMs);
  assert.equal(activeInfo.isActive, true);
  assert.equal(activeInfo.isExpired, false);
  assert.equal(activeInfo.remainingDays, 4);
  assert.equal(activeInfo.durationDays, 7);

  // After expiration (8 days later)
  const expiredInfo = getUserProSubscriptionInfo(proSubscriber, DEFAULT_PLATFORM_SETTINGS, afterMs);
  assert.equal(expiredInfo.isActive, false);
  assert.equal(expiredInfo.isExpired, true);
  assert.equal(expiredInfo.remainingDays, 0);

  const { updatedUsers, expiredUsers } = checkAndExpireUsersPro(
    [proSubscriber],
    DEFAULT_PLATFORM_SETTINGS,
    afterMs
  );
  assert.equal(expiredUsers.length, 1);
  assert.equal(updatedUsers[0].isPro, false);
  assert.equal(updatedUsers[0].proPlanId, undefined);
  assert.equal(updatedUsers[0].proExpiresAt, '');
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

test('site logo and site name sanitization & mergeBrandingSettingsSafely prevent logo deletion', () => {
  const validPngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  assert.equal(sanitizeSiteLogoUrl(validPngDataUrl), validPngDataUrl);
  assert.equal(sanitizeSiteLogoUrl('https://cdn.example.com/logo.png'), 'https://cdn.example.com/logo.png');
  assert.equal(sanitizeSiteLogoUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeSiteLogoUrl('data:text/html;base64,PHNjcmlwdD4='), '');

  assert.equal(sanitizeSiteName('  استوديو الموشن <script>  '), 'استوديو الموشن script');

  const localWithLogo = {
    ...DEFAULT_PLATFORM_SETTINGS,
    siteName: 'SVGA Studio Pro',
    siteLogoUrl: validPngDataUrl,
    brandingUpdatedAt: '2026-10-28T10:00:00.000Z',
    logoExplicitlyRemoved: false,
  };

  // 1. Incoming snapshot has updated siteName but empty siteLogoUrl (not explicitly removed) -> MUST preserve uploaded logo!
  const afterNameChange = mergeBrandingSettingsSafely(localWithLogo, {
    siteName: 'New Site Name 2026',
    siteLogoUrl: '',
    brandingUpdatedAt: '2026-10-28T10:05:00.000Z',
    logoExplicitlyRemoved: false,
  });
  assert.equal(afterNameChange.siteName, 'New Site Name 2026');
  assert.equal(afterNameChange.siteLogoUrl, validPngDataUrl);

  // 2. Incoming stale snapshot has older timestamp -> MUST keep newer local branding
  const afterStaleSnapshot = mergeBrandingSettingsSafely(afterNameChange, {
    siteName: 'Old Name',
    siteLogoUrl: '',
    brandingUpdatedAt: '2026-10-28T09:00:00.000Z',
  });
  assert.equal(afterStaleSnapshot.siteName, 'New Site Name 2026');
  assert.equal(afterStaleSnapshot.siteLogoUrl, validPngDataUrl);

  // 3. Admin explicitly removes logo with newer timestamp -> clears logo
  const afterExplicitRemove = mergeBrandingSettingsSafely(afterNameChange, {
    siteName: 'New Site Name 2026',
    siteLogoUrl: '',
    brandingUpdatedAt: '2026-10-28T10:10:00.000Z',
    logoExplicitlyRemoved: true,
  });
  assert.equal(afterExplicitRemove.siteLogoUrl, '');
  assert.equal(afterExplicitRemove.logoExplicitlyRemoved, true);
});

test('resolveAuthenticatedUserOnLogin locks user name permanently after first-time registration and never overwrites on login', () => {
  const registeredUser: UserAccount = {
    id: 'usr_reg_1',
    name: 'محمد أحمد',
    nameLocked: true,
    email: 'mohamed@example.com',
    password: 'password123',
    role: 'user',
    isPro: false,
    createdAt: '2026-10-28T00:00:00.000Z',
  };

  // Even if someone passes a different name during login, the user's registered name stays locked
  const afterLogin = resolveAuthenticatedUserOnLogin(registeredUser, 'اسم مختلف');
  assert.equal(afterLogin.name, 'محمد أحمد');
  assert.equal(afterLogin.nameLocked, true);

  // If an account was created without a name (nameLocked: false), it sets the name once and locks it forever
  const unnamedAccount: UserAccount = {
    id: 'usr_unnamed_1',
    name: '',
    nameLocked: false,
    email: 'newuser@example.com',
    password: 'password123',
    role: 'user',
    isPro: false,
    createdAt: '2026-10-28T00:00:00.000Z',
  };
  const firstSetup = resolveAuthenticatedUserOnLogin(unnamedAccount, 'كريم محمود');
  assert.equal(firstSetup.name, 'كريم محمود');
  assert.equal(firstSetup.nameLocked, true);

  // Subsequent login after first setup keeps 'كريم محمود' locked
  const secondLogin = resolveAuthenticatedUserOnLogin(firstSetup, 'اسم آخر');
  assert.equal(secondLogin.name, 'كريم محمود');
  assert.equal(secondLogin.nameLocked, true);
});

test('canUserCaptureScreen and setUserScreenCapturePermission manage account screen capture and video recording privileges accurately', () => {
  const regularUser: UserAccount = {
    id: 'usr_capture_test',
    name: 'أحمد مصمم',
    email: 'designer@example.com',
    password: '123456',
    role: 'user',
    isPro: true,
    createdAt: '2026-10-28T00:00:00.000Z',
  };

  // By default, regular users and guests cannot capture/record screen
  assert.equal(canUserCaptureScreen(null), false);
  assert.equal(canUserCaptureScreen(regularUser), false);

  // Super Admin is always allowed to capture/record screen unless previewing as free_user
  assert.equal(canUserCaptureScreen(INITIAL_SUPER_ADMIN_ACCOUNT, 'actual'), true);
  assert.equal(canUserCaptureScreen(INITIAL_SUPER_ADMIN_ACCOUNT, 'free_user'), false);

  // Grant screen capture & video recording permission to regularUser
  const grantedUser = setUserScreenCapturePermission(regularUser, true, '2026-10-28T12:00:00.000Z');
  assert.equal(grantedUser.allowScreenCapture, true);
  assert.equal(grantedUser.screenCaptureGrantedAt, '2026-10-28T12:00:00.000Z');
  assert.equal(canUserCaptureScreen(grantedUser), true);

  // Sanitization preserves allowScreenCapture on user accounts
  const sanitized = sanitizeUsersList([grantedUser]);
  const sanitizedTarget = sanitized.find((u) => u.id === 'usr_capture_test')!;
  assert.equal(sanitizedTarget.allowScreenCapture, true);

  // Session token protects allowScreenCapture from localStorage tampering
  const tokenBefore = computeSessionToken(regularUser);
  assert.equal(verifySessionToken(regularUser, tokenBefore), true);
  assert.equal(verifySessionToken(grantedUser, tokenBefore), false);

  // Revoke screen capture permission
  const revokedUser = setUserScreenCapturePermission(grantedUser, false);
  assert.equal(revokedUser.allowScreenCapture, false);
  assert.equal(revokedUser.screenCaptureGrantedAt, '');
  assert.equal(canUserCaptureScreen(revokedUser), false);
});
