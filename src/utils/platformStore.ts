export type AppLanguage = 'ar' | 'en';

export type AdminPermissionKey =
  | 'manage_users'
  | 'view_logs'
  | 'manage_pro'
  | 'manage_branding'
  | 'manage_notifications'
  | 'manage_admins'
  | 'manage_firebase';

export interface AdminPermissionDef {
  key: AdminPermissionKey;
  icon: string;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
}

export const ALL_ADMIN_PERMISSIONS: AdminPermissionDef[] = [
  {
    key: 'manage_users',
    icon: '👥',
    labelAr: 'إدارة المستخدمين وتفعيل برو',
    labelEn: 'Manage Users & Pro Activation',
    descAr: 'إضافة حسابات، تفعيل أو إلغاء باقة برو للمستخدمين، وحذف الحسابات العادية.',
    descEn: 'Add accounts, activate/revoke Pro subscriptions, and delete regular users.',
  },
  {
    key: 'view_logs',
    icon: '📋',
    labelAr: 'سجل النشاط والملفات المرفوعة',
    labelEn: 'Activity & Upload Logs',
    descAr: 'مشاهدة وإدارة سجل الملفات التي تم رفعها وتحويلها في المنصة.',
    descEn: 'View and manage the history of uploaded and converted files.',
  },
  {
    key: 'manage_pro',
    icon: '👑',
    labelAr: 'إعدادات باقة برو والصيغ',
    labelEn: 'Pro Package & Formats',
    descAr: 'تعديل سعر باقة برو، العملة، وتحديد الصيغ المجانية أو المدفوعة.',
    descEn: 'Configure Pro pricing, currency, and toggle which formats require Pro.',
  },
  {
    key: 'manage_branding',
    icon: '🎨',
    labelAr: 'هوية الموقع واللوجو والواتساب',
    labelEn: 'Site Branding & WhatsApp',
    descAr: 'تغيير اسم الموقع، شعار المنصة، ورقم ورسالة التواصل عبر واتساب.',
    descEn: 'Change website name, logo image, and WhatsApp contact settings.',
  },
  {
    key: 'manage_notifications',
    icon: '🔔',
    labelAr: 'إرسال الإشعارات العامة',
    labelEn: 'Broadcast Notifications',
    descAr: 'إرسال تنبيهات ورسائل عامة تظهر لجميع زوار ومستخدمي الموقع.',
    descEn: 'Send global broadcast notifications and banners to all users.',
  },
  {
    key: 'manage_admins',
    icon: '🛡️',
    labelAr: 'إدارة المشرفين والحماية',
    labelEn: 'Manage Admins & Security',
    descAr: 'تعيين المشرفين وتحديد صلاحياتهم وإدارة أمان حساب المدير العام.',
    descEn: 'Assign moderators, customize permissions, and manage platform security.',
  },
  {
    key: 'manage_firebase',
    icon: '🔥',
    labelAr: 'قاعدة بيانات Firebase والمزامنة',
    labelEn: 'Firebase Database & Sync',
    descAr: 'فحص الاتصال السحابي ومزامنة البيانات مع قاعدة بيانات Firestore.',
    descEn: 'Test live connection and synchronize data with Cloud Firestore.',
  },
];

export const ALL_ADMIN_PERMISSION_KEYS: AdminPermissionKey[] = ALL_ADMIN_PERMISSIONS.map((p) => p.key);

/**
 * Permanently purged legacy admin accounts — automatically stripped from local storage & Firestore.
 */
export const PURGED_LEGACY_ADMIN_EMAILS = [
  'aegy238@gmail.com',
  'admin@motiontools.com',
  'admin@example.com',
];

export const PURGED_LEGACY_ADMIN_IDS = [
  'usr_admin_1',
  'usr_admin_old',
];

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  role: 'admin' | 'user';
  isSuperAdmin?: boolean;
  adminPermissions?: AdminPermissionKey[];
  adminBadgeTitle?: string;
  adminGrantedAt?: string;
  isPro: boolean;
  createdAt: string;
  proActivatedAt?: string;
}

export interface BroadcastNotification {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  important?: boolean;
}

export interface FormatDefinition {
  key: string;
  labelEn: string;
  labelAr: string;
  ext: string[];
}

export const ALL_SUPPORTED_FORMATS: FormatDefinition[] = [
  { key: 'svga', labelEn: 'SVGA Animation', labelAr: 'صيغة SVGA', ext: ['svga'] },
  { key: 'vap', labelEn: 'VAP (Alpha Video)', labelAr: 'صيغة VAP (شفاف)', ext: ['vap'] },
  { key: 'yyeva', labelEn: 'YYEVA (Alpha MP4)', labelAr: 'صيغة YYEVA', ext: ['yyeva'] },
  { key: 'dual', labelEn: 'Dual Channel Video', labelAr: 'فيديو ثنائي القناة Dual Channel', ext: ['dual'] },
  { key: 'pag', labelEn: 'PAG Animation', labelAr: 'صيغة PAG', ext: ['pag'] },
  { key: 'lottie', labelEn: 'Lottie JSON', labelAr: 'صيغة Lottie JSON', ext: ['json', 'lottie'] },
  { key: 'dotlottie', labelEn: 'DotLottie (.lottie)', labelAr: 'صيغة DotLottie', ext: ['dotlottie'] },
  { key: 'svga_editor', labelEn: 'SVGA Editor & AE Export', labelAr: 'محرر SVGA وتصدير After Effects', ext: ['svga_editor'] },
  { key: 'mp4', labelEn: 'MP4 Video', labelAr: 'فيديو MP4', ext: ['mp4'] },
  { key: 'webm', labelEn: 'WebM Video', labelAr: 'فيديو WebM', ext: ['webm'] },
  { key: 'mov', labelEn: 'MOV QuickTime', labelAr: 'فيديو MOV', ext: ['mov'] },
  { key: 'gif', labelEn: 'Animated GIF', labelAr: 'صورة متحركة GIF', ext: ['gif'] },
  { key: 'webp', labelEn: 'Animated WebP', labelAr: 'صورة متحركة WebP', ext: ['webp'] },
  { key: 'zip', labelEn: 'PNG Sequence ZIP', labelAr: 'تسلسل صور PNG ZIP', ext: ['zip', 'png', 'apng'] },
];

export interface PlatformSettings {
  siteName: string;
  siteLogoUrl: string; // empty string = default gradient dot logo, or DataURL / https URL
  proPackageNameAr: string;
  proPackageNameEn: string;
  proPrice: string;
  proCurrency: string;
  proPeriodAr: string;
  proPeriodEn: string;
  proDescriptionAr: string;
  proDescriptionEn: string;
  proFormats: string[]; // array of format keys that require Pro subscription
  requireProForAllConversions: boolean; // if true, any conversion requires Pro regardless of format
  whatsappNumber: string;
  whatsappDefaultMsgAr: string;
  whatsappDefaultMsgEn: string;
  defaultLanguage: AppLanguage;
}

export interface ActivityLogEntry {
  id: string;
  userName: string;
  userEmail: string;
  fileName: string;
  fileSize?: string;
  format: string;
  createdAt: string;
}

export interface PlatformState {
  settings: PlatformSettings;
  users: UserAccount[];
  currentUserId: string | null;
  sessionToken?: string | null;
  notifications: BroadcastNotification[];
  readNotificationIds: string[];
  activityLogs: ActivityLogEntry[];
  language: AppLanguage;
  adminPreviewRole: 'actual' | 'free_user' | 'pro_user';
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  siteName: 'MotionTools',
  siteLogoUrl: '',
  proPackageNameAr: 'أدوات برو (Pro Tools)',
  proPackageNameEn: 'Pro Tools Package',
  proPrice: '15',
  proCurrency: '$',
  proPeriodAr: 'شهرياً / اشتراك كامل',
  proPeriodEn: 'Monthly / Full Access',
  proDescriptionAr:
    'احصل على وصول كامل لتحويل وتصدير جميع الصيغ الاحترافية (SVGA, VAP, YYEVA, PAG, Lottie, MP4) مع ضغط الملفات وتعديل الصوت والصور بدون قيود.',
  proDescriptionEn:
    'Get full access to convert and export all professional formats (SVGA, VAP, YYEVA, PAG, Lottie, MP4) with lossless compression, audio editing, and full layer control.',
  proFormats: ['svga', 'vap', 'yyeva', 'dual', 'pag', 'lottie', 'dotlottie', 'svga_editor'],
  requireProForAllConversions: false,
  whatsappNumber: '201000000000',
  whatsappDefaultMsgAr: 'مرحباً، أريد الاشتراك في باقة أدوات برو (Pro Tools) وتفعيل حسابي.',
  whatsappDefaultMsgEn: 'Hello, I would like to subscribe to the Pro Tools package and activate my account.',
  defaultLanguage: 'ar',
};

export const INITIAL_SUPER_ADMIN_ACCOUNT: UserAccount = {
  id: 'usr_super_admin_2026',
  name: 'المدير العام (Super Admin)',
  email: 'owner@svga-pro.com',
  password: 'SvgaAdmin#2026!Pro',
  phone: '',
  role: 'admin',
  isSuperAdmin: true,
  adminPermissions: [...ALL_ADMIN_PERMISSION_KEYS],
  adminBadgeTitle: 'المدير العام (Super Admin)',
  adminGrantedAt: '2026-10-25T00:00:00.000Z',
  isPro: true,
  createdAt: '2026-10-25T00:00:00.000Z',
  proActivatedAt: '2026-10-25T00:00:00.000Z',
};

export const INITIAL_USERS: UserAccount[] = [
  INITIAL_SUPER_ADMIN_ACCOUNT,
  {
    id: 'usr_demo_free',
    name: 'مستخدم تجريبي (Free User)',
    email: 'user@example.com',
    password: '123456',
    phone: '',
    role: 'user',
    isPro: false,
    createdAt: '2026-10-23T14:30:00.000Z',
  },
  {
    id: 'usr_demo_pro',
    name: 'مشترك برو تجريبي (Pro User)',
    email: 'sara@example.com',
    password: '123456',
    phone: '',
    role: 'user',
    isPro: true,
    createdAt: '2026-10-24T09:15:00.000Z',
    proActivatedAt: '2026-10-24T09:20:00.000Z',
  },
];

export const INITIAL_NOTIFICATIONS: BroadcastNotification[] = [
  {
    id: 'notif_welcome_1',
    title: 'تحديث جديد: إطلاق باقة أدوات برو ولوحة التحكم المتكاملة 🚀',
    message:
      'مرحباً بكم في التحديث الجديد! يمكنكم الآن رفع ومعاينة جميع ملفات الهدايا (SVGA, VAP, YYEVA) مجاناً، والاشتراك في باقة أدوات برو لتصدير وتحويل كافة الصيغ الاحترافية.',
    createdAt: '2026-10-24T11:00:00.000Z',
    important: true,
  },
];

export const INITIAL_ACTIVITY_LOGS: ActivityLogEntry[] = [
  {
    id: 'log_2',
    userName: 'مستخدم تجريبي (Free User)',
    userEmail: 'user@example.com',
    fileName: 'badge_effect.vap',
    fileSize: '3.8 MB',
    format: 'VAP',
    createdAt: '2026-10-24T13:15:00.000Z',
  },
];

/**
 * Pure function: Checks whether a user record belongs to a purged legacy admin account.
 */
export function isPurgedLegacyAdmin(user: Partial<UserAccount> | null | undefined): boolean {
  if (!user) return false;
  if (user.id && PURGED_LEGACY_ADMIN_IDS.includes(user.id)) return true;
  if (user.email && PURGED_LEGACY_ADMIN_EMAILS.includes(user.email.trim().toLowerCase())) return true;
  return false;
}

/**
 * Pure function: Constant-time string comparison to prevent timing side-channel attacks.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const lenA = a.length;
  const lenB = b.length;
  const maxLen = Math.max(lenA, lenB, 1);
  let diff = lenA ^ lenB;
  for (let i = 0; i < maxLen; i++) {
    const codeA = i < lenA ? a.charCodeAt(i) : 0;
    const codeB = i < lenB ? b.charCodeAt(i) : 0;
    diff |= codeA ^ codeB;
  }
  return diff === 0;
}

/**
 * Pure function: Strictly verifies a user's password with zero backdoors and no empty password bypass.
 */
export function verifyUserPassword(user: UserAccount | null | undefined, inputPassword: string): boolean {
  if (!user || isPurgedLegacyAdmin(user)) return false;
  const stored = (user.password || '').trim();
  const provided = (inputPassword || '').trim();
  if (!stored || !provided) return false;
  return constantTimeEqual(stored, provided);
}

/**
 * Pure function: Checks if a user is the primary Super Admin.
 */
export function isSuperAdminUser(user: UserAccount | null | undefined): boolean {
  if (!user || isPurgedLegacyAdmin(user)) return false;
  return user.role === 'admin' && (user.isSuperAdmin === true || user.id === INITIAL_SUPER_ADMIN_ACCOUNT.id);
}

/**
 * Pure function: Checks if a user has access to the Admin Dashboard (either Super Admin or a delegated Admin with >=1 permission).
 */
export function canAccessAdminDashboard(user: UserAccount | null | undefined): boolean {
  if (!user || isPurgedLegacyAdmin(user)) return false;
  if (isSuperAdminUser(user)) return true;
  if (user.role === 'admin') {
    if (Array.isArray(user.adminPermissions)) {
      return user.adminPermissions.length > 0;
    }
    return true;
  }
  return Array.isArray(user.adminPermissions) && user.adminPermissions.length > 0;
}

/**
 * Pure function: Checks if a user has a specific granular Admin Dashboard permission.
 */
export function hasAdminPermission(
  user: UserAccount | null | undefined,
  permission: AdminPermissionKey
): boolean {
  if (!user || isPurgedLegacyAdmin(user)) return false;
  if (isSuperAdminUser(user)) return true;
  if (!canAccessAdminDashboard(user)) return false;
  if (Array.isArray(user.adminPermissions)) {
    return user.adminPermissions.includes(permission);
  }
  return false;
}

/**
 * Pure function: Returns the list of effective permissions for a user.
 */
export function getEffectiveAdminPermissions(user: UserAccount | null | undefined): AdminPermissionKey[] {
  if (!user || isPurgedLegacyAdmin(user)) return [];
  if (isSuperAdminUser(user)) return [...ALL_ADMIN_PERMISSION_KEYS];
  if (!canAccessAdminDashboard(user)) return [];
  return Array.isArray(user.adminPermissions)
    ? user.adminPermissions.filter((k): k is AdminPermissionKey => ALL_ADMIN_PERMISSION_KEYS.includes(k))
    : [];
}

/**
 * Pure function: Computes a deterministic cryptographic-style session integrity signature
 * so localStorage tampering with role/permissions is automatically rejected.
 */
export function computeSessionToken(user: UserAccount | null | undefined): string {
  if (!user || isPurgedLegacyAdmin(user)) return '';
  const perms = getEffectiveAdminPermissions(user).sort().join(',');
  const payload = `mt_sec_v2|${user.id}|${user.email.toLowerCase()}|${user.role}|${user.isSuperAdmin ? 'SA' : 'U'}|${perms}|${user.password || ''}`;
  let h1 = 0xdeadbeef ^ payload.length;
  let h2 = 0x41c6ce57 ^ payload.length;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'sig_' + (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export function verifySessionToken(user: UserAccount | null | undefined, token?: string | null): boolean {
  if (!user || !token) return false;
  const expected = computeSessionToken(user);
  return !!expected && constantTimeEqual(expected, token);
}

/**
 * Brute-Force Login Rate Limiter (locks out after 5 failed attempts for 60 seconds).
 */
interface LoginAttemptRecord {
  count: number;
  lockedUntil: number;
}
const loginAttemptsMap = new Map<string, LoginAttemptRecord>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60_000;

export function checkLoginRateLimit(
  email: string,
  nowMs: number = Date.now()
): { allowed: boolean; remainingAttempts: number; retryAfterSeconds: number } {
  const key = (email || '').trim().toLowerCase() || '_global';
  const rec = loginAttemptsMap.get(key);
  if (!rec) {
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS, retryAfterSeconds: 0 };
  }
  if (rec.lockedUntil > nowMs) {
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((rec.lockedUntil - nowMs) / 1000)),
    };
  }
  if (rec.lockedUntil > 0 && rec.lockedUntil <= nowMs) {
    loginAttemptsMap.delete(key);
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS, retryAfterSeconds: 0 };
  }
  return {
    allowed: true,
    remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - rec.count),
    retryAfterSeconds: 0,
  };
}

export function recordFailedLoginAttempt(
  email: string,
  nowMs: number = Date.now()
): { locked: boolean; remainingAttempts: number; retryAfterSeconds: number } {
  const key = (email || '').trim().toLowerCase() || '_global';
  const prev = loginAttemptsMap.get(key) || { count: 0, lockedUntil: 0 };
  const nextCount = prev.count + 1;
  if (nextCount >= MAX_LOGIN_ATTEMPTS) {
    const lockedUntil = nowMs + LOCKOUT_DURATION_MS;
    loginAttemptsMap.set(key, { count: nextCount, lockedUntil });
    return {
      locked: true,
      remainingAttempts: 0,
      retryAfterSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000),
    };
  }
  loginAttemptsMap.set(key, { count: nextCount, lockedUntil: 0 });
  return {
    locked: false,
    remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - nextCount),
    retryAfterSeconds: 0,
  };
}

export function resetLoginAttempts(email: string): void {
  const key = (email || '').trim().toLowerCase() || '_global';
  loginAttemptsMap.delete(key);
}

/**
 * Pure function: Resolves the effective format key when converting a file.
 * If targetFormat is 'orig' ("Keep Original"), resolves based on the uploaded file's extension.
 */
export function resolveEffectiveFormatKey(targetFormat: string, sourceFileName?: string): string {
  const fmt = (targetFormat || 'orig').toLowerCase().trim();
  if (fmt !== 'orig') {
    return fmt;
  }
  if (!sourceFileName) return 'orig';
  const ext = sourceFileName.split('.').pop()?.toLowerCase() || '';
  for (const def of ALL_SUPPORTED_FORMATS) {
    if (def.key === ext || def.ext.includes(ext)) {
      return def.key;
    }
  }
  return ext || 'orig';
}

/**
 * Pure function: Checks whether a given user (with optional preview override) is allowed to export/convert
 * the specified format under the current platform settings.
 * Note: Uploading and previewing files is ALWAYS allowed for everyone. This gate only applies on conversion/export.
 */
export function checkConversionPermission(
  user: UserAccount | null,
  settings: PlatformSettings,
  targetFormat: string,
  sourceFileName?: string,
  adminPreviewRole: 'actual' | 'free_user' | 'pro_user' = 'actual'
): {
  allowed: boolean;
  effectiveFormatKey: string;
  isFormatPro: boolean;
  reason?: 'pro_required';
} {
  const effectiveFormatKey = resolveEffectiveFormatKey(targetFormat, sourceFileName);
  const isFormatPro =
    settings.requireProForAllConversions ||
    settings.proFormats.includes(effectiveFormatKey) ||
    (targetFormat === 'orig' && settings.proFormats.includes('orig'));

  // Determine effective user privileges taking adminPreviewRole into account
  let hasProAccess = false;
  if (adminPreviewRole === 'free_user') {
    hasProAccess = false;
  } else if (adminPreviewRole === 'pro_user') {
    hasProAccess = true;
  } else if (user && !isPurgedLegacyAdmin(user)) {
    hasProAccess = canAccessAdminDashboard(user) || user.isPro === true;
  }

  if (!isFormatPro || hasProAccess) {
    return {
      allowed: true,
      effectiveFormatKey,
      isFormatPro,
    };
  }

  return {
    allowed: false,
    effectiveFormatKey,
    isFormatPro: true,
    reason: 'pro_required',
  };
}

/**
 * Pure function: Builds a clean WhatsApp wa.me link from a phone number and message.
 */
export function buildWhatsAppUrl(phone: string, message?: string): string {
  const digits = (phone || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  const base = `https://wa.me/${digits}`;
  if (!message || !message.trim()) return base;
  return `${base}?text=${encodeURIComponent(message.trim())}`;
}

const STORAGE_KEY = 'motiontools_platform_state_v2';
const LEGACY_STORAGE_KEY = 'motiontools_platform_state_v1';
const DELETED_USERS_KEY = 'motiontools_deleted_user_ids_v1';

export function getDeletedUserIds(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [...PURGED_LEGACY_ADMIN_IDS];
  try {
    const raw = window.localStorage.getItem(DELETED_USERS_KEY);
    const parsed: string[] = raw ? JSON.parse(raw) : [];
    return Array.from(new Set([...parsed, ...PURGED_LEGACY_ADMIN_IDS]));
  } catch {
    return [...PURGED_LEGACY_ADMIN_IDS];
  }
}

export function addDeletedUserId(userId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const ids = getDeletedUserIds();
    if (!ids.includes(userId)) {
      ids.push(userId);
    }
    window.localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(ids));
  } catch {}
}

/**
 * Sanitizes and ensures the Super Admin account is always present while all legacy admin accounts are purged.
 */
export function sanitizeUsersList(rawUsers: UserAccount[], deletedIds: string[] = []): UserAccount[] {
  const filtered = (Array.isArray(rawUsers) ? rawUsers : []).filter(
    (u) => u && u.id && u.email && !isPurgedLegacyAdmin(u) && !deletedIds.includes(u.id)
  );
  const hasSuperAdmin = filtered.some((u) => isSuperAdminUser(u));
  if (!hasSuperAdmin) {
    return [{ ...INITIAL_SUPER_ADMIN_ACCOUNT }, ...filtered];
  }
  return filtered.map((u) => {
    if (isSuperAdminUser(u)) {
      return {
        ...u,
        role: 'admin',
        isSuperAdmin: true,
        adminPermissions: [...ALL_ADMIN_PERMISSION_KEYS],
        isPro: true,
      };
    }
    return u;
  });
}

export function loadPlatformState(): PlatformState {
  const deletedIds = getDeletedUserIds();
  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      settings: { ...DEFAULT_PLATFORM_SETTINGS },
      users: sanitizeUsersList(INITIAL_USERS, deletedIds),
      currentUserId: null,
      sessionToken: null,
      notifications: [...INITIAL_NOTIFICATIONS],
      readNotificationIds: [],
      activityLogs: [...INITIAL_ACTIVITY_LOGS],
      language: 'ar',
      adminPreviewRole: 'actual',
    };
  }
  try {
    // Purge legacy v1 storage key if present
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    let raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw && legacyRaw) {
      raw = legacyRaw;
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
    if (!raw) {
      return {
        settings: { ...DEFAULT_PLATFORM_SETTINGS },
        users: sanitizeUsersList(INITIAL_USERS, deletedIds),
        currentUserId: null,
        sessionToken: null,
        notifications: [...INITIAL_NOTIFICATIONS],
        readNotificationIds: [],
        activityLogs: [...INITIAL_ACTIVITY_LOGS],
        language: 'ar',
        adminPreviewRole: 'actual',
      };
    }
    const parsed = JSON.parse(raw);
    const loadedUsers = Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : [...INITIAL_USERS];
    const cleanedUsers = sanitizeUsersList(loadedUsers, deletedIds);

    const candidateUser =
      parsed.currentUserId ? cleanedUsers.find((u: UserAccount) => u.id === parsed.currentUserId) || null : null;
    const isSessionValid = candidateUser
      ? parsed.sessionToken
        ? verifySessionToken(candidateUser, parsed.sessionToken)
        : !canAccessAdminDashboard(candidateUser)
      : false;

    const validCurrentUserId = candidateUser && isSessionValid ? candidateUser.id : null;
    const validSessionToken = candidateUser && isSessionValid ? computeSessionToken(candidateUser) : null;

    const cleanedLogs = (Array.isArray(parsed.activityLogs) ? parsed.activityLogs : [...INITIAL_ACTIVITY_LOGS]).filter(
      (log: ActivityLogEntry) =>
        log && !PURGED_LEGACY_ADMIN_EMAILS.includes((log.userEmail || '').trim().toLowerCase())
    );

    return {
      settings: { ...DEFAULT_PLATFORM_SETTINGS, ...(parsed.settings || {}) },
      users: cleanedUsers,
      currentUserId: validCurrentUserId,
      sessionToken: validSessionToken,
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [...INITIAL_NOTIFICATIONS],
      readNotificationIds: Array.isArray(parsed.readNotificationIds) ? parsed.readNotificationIds : [],
      activityLogs: cleanedLogs,
      language: parsed.language === 'en' ? 'en' : 'ar',
      adminPreviewRole: parsed.adminPreviewRole || 'actual',
    };
  } catch {
    return {
      settings: { ...DEFAULT_PLATFORM_SETTINGS },
      users: sanitizeUsersList(INITIAL_USERS, deletedIds),
      currentUserId: null,
      sessionToken: null,
      notifications: [...INITIAL_NOTIFICATIONS],
      readNotificationIds: [],
      activityLogs: [...INITIAL_ACTIVITY_LOGS],
      language: 'ar',
      adminPreviewRole: 'actual',
    };
  }
}

export function savePlatformState(state: PlatformState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const activeUser = state.currentUserId
      ? state.users.find((u) => u.id === state.currentUserId) || null
      : null;
    const nextState: PlatformState = {
      ...state,
      sessionToken: activeUser ? computeSessionToken(activeUser) : null,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    window.dispatchEvent(new CustomEvent('platform-state-updated', { detail: nextState }));
  } catch (e) {
    console.warn('Could not persist platform state to localStorage:', e);
  }
}

