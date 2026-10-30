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
    descAr: 'إضافة حسابات وتفعيل أو إلغاء باقة برو للمستخدمين (حذف الحسابات متاح للمدير العام فقط).',
    descEn: 'Add accounts and activate/revoke Pro subscriptions (deleting accounts is restricted to Super Admin only).',
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

export type ProPlanDurationKey = 'week' | 'month' | 'three_months' | 'year';

export interface ProSubscriptionPlan {
  id: ProPlanDurationKey;
  nameAr: string;
  nameEn: string;
  periodAr: string;
  periodEn: string;
  durationDays: number;
  price: string;
  badgeAr?: string;
  badgeEn?: string;
  enabled: boolean;
}

export const DEFAULT_PRO_PLANS: ProSubscriptionPlan[] = [
  {
    id: 'week',
    nameAr: 'باقة أسبوع',
    nameEn: '1 Week Plan',
    periodAr: 'لمدة أسبوع (7 أيام)',
    periodEn: '1 Week (7 Days)',
    durationDays: 7,
    price: '5',
    badgeAr: 'سريعة ⚡',
    badgeEn: 'Starter ⚡',
    enabled: true,
  },
  {
    id: 'month',
    nameAr: 'باقة شهر',
    nameEn: '1 Month Plan',
    periodAr: 'لمدة شهر (30 يوم)',
    periodEn: '1 Month (30 Days)',
    durationDays: 30,
    price: '15',
    badgeAr: 'الأكثر طلباً 🔥',
    badgeEn: 'Most Popular 🔥',
    enabled: true,
  },
  {
    id: 'three_months',
    nameAr: 'باقة 3 شهور',
    nameEn: '3 Months Plan',
    periodAr: 'لمدة 3 شهور (90 يوم)',
    periodEn: '3 Months (90 Days)',
    durationDays: 90,
    price: '35',
    badgeAr: 'توفير مميز ⭐',
    badgeEn: 'Great Value ⭐',
    enabled: true,
  },
  {
    id: 'year',
    nameAr: 'باقة سنة',
    nameEn: '1 Year Plan',
    periodAr: 'لمدة سنة كاملة (365 يوم)',
    periodEn: '1 Full Year (365 Days)',
    durationDays: 365,
    price: '100',
    badgeAr: 'أفضل قيمة 👑',
    badgeEn: 'Best Value 👑',
    enabled: true,
  },
];

export function normalizeProPlans(
  plans?: ProSubscriptionPlan[] | null,
  fallbackMonthPrice?: string
): ProSubscriptionPlan[] {
  if (!Array.isArray(plans) || plans.length === 0) {
    return DEFAULT_PRO_PLANS.map((p) =>
      p.id === 'month' && fallbackMonthPrice ? { ...p, price: fallbackMonthPrice } : { ...p }
    );
  }
  return DEFAULT_PRO_PLANS.map((def) => {
    const found = plans.find((p) => p && p.id === def.id);
    if (!found) {
      return def.id === 'month' && fallbackMonthPrice ? { ...def, price: fallbackMonthPrice } : { ...def };
    }
    return {
      ...def,
      ...found,
      price: String(found.price ?? def.price),
      enabled: typeof found.enabled === 'boolean' ? found.enabled : true,
    };
  });
}

export interface UserAccount {
  id: string;
  name: string;
  nameLocked?: boolean;
  email: string;
  password?: string;
  phone?: string;
  role: 'admin' | 'user';
  isSuperAdmin?: boolean;
  adminPermissions?: AdminPermissionKey[];
  adminBadgeTitle?: string;
  adminGrantedAt?: string;
  allowScreenCapture?: boolean;
  screenCaptureGrantedAt?: string;
  isPro: boolean;
  proPlanId?: ProPlanDurationKey;
  proPlanName?: string;
  proExpiresAt?: string;
  createdAt: string;
  proActivatedAt?: string;
  freeAttemptsUsed?: Record<string, number>;
  isBanned?: boolean; // حظر الحساب (Account Ban)
  networkBanned?: boolean; // حظر الشبكة والجهاز نهائياً (Network / Device Ban)
  banReason?: string; // سبب الحظر
  bannedAt?: string; // تاريخ ووقت الحظر
  networkId?: string; // معرف الشبكة / البصمة الرقمية للمستخدم (Network / IP Fingerprint)
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
  { key: 'apng', labelEn: 'Animated PNG (APNG)', labelAr: 'صورة متحركة APNG', ext: ['apng'] },
  { key: 'zip', labelEn: 'PNG Sequence ZIP', labelAr: 'تسلسل صور PNG ZIP', ext: ['zip', 'png'] },
];

export type ProFeatureScope = 'access' | 'export';

export interface ProFeatureRule {
  isPro: boolean;                 // Whether this tool/feature is locked behind Pro
  scope: ProFeatureScope;         // 'access' = lock navigating into feature; 'export' = lock export/download button only
  allowFreeAttempts: boolean;     // Whether free/unsubscribed users get trial attempts
  freeAttemptsCount: number;      // Number of free trial attempts granted (e.g. 1, 2, 3, 5, 10)
}

export interface ProToolDefinition {
  key: string;
  labelAr: string;
  labelEn: string;
  icon: string;
  descAr: string;
  descEn: string;
  defaultScope: ProFeatureScope;
  defaultIsPro: boolean;
  defaultFreeAttempts: number;
}

export const PRO_TOOLS_DEFINITIONS: ProToolDefinition[] = [
  {
    key: 'gifts_studio',
    labelAr: 'استوديو وعرض ملفات الهدايا',
    labelEn: 'Gift Files Studio & Preview',
    icon: '🎁',
    descAr: 'عرض ومعاينة ملفات الهدايا والرسوم المتحركة (SVGA, VAP, YYEVA, PAG) وتصديرها.',
    descEn: 'Preview, play, inspect, and export multi-format gift animations.',
    defaultScope: 'export',
    defaultIsPro: true,
    defaultFreeAttempts: 3,
  },
  {
    key: 'gift_image',
    labelAr: 'أداة إنشاء صور الهدايا',
    labelEn: 'Gift Image Creator',
    icon: '🖼️',
    descAr: 'توليد وقص وتصدير صور الهدايا والبنرات الدائرية والشعارات المفرغة فائقة الدقة.',
    descEn: 'Generate, crop, fit, and export high-clarity framed gift images.',
    defaultScope: 'access',
    defaultIsPro: true,
    defaultFreeAttempts: 3,
  },
  {
    key: 'gold_designer',
    labelAr: 'مصمم الأسماء ثلاثية الأبعاد 3D',
    labelEn: '3D Gold Name Designer',
    icon: '👑',
    descAr: 'توليد وتصميم الأسماء ثلاثية الأبعاد ببروز معدني وانعكاسات احترافية واستخلاص الألوان والأنماط.',
    descEn: 'Generate luxurious 3D metallic typography with custom colors and image style extraction.',
    defaultScope: 'export',
    defaultIsPro: true,
    defaultFreeAttempts: 2,
  },
];

export const DEFAULT_PRO_FEATURE_RULES: Record<string, ProFeatureRule> = {
  gifts_studio: {
    isPro: true,
    scope: 'export',
    allowFreeAttempts: true,
    freeAttemptsCount: 3,
  },
  gift_image: {
    isPro: true,
    scope: 'access',
    allowFreeAttempts: true,
    freeAttemptsCount: 3,
  },
  gold_designer: {
    isPro: true,
    scope: 'export',
    allowFreeAttempts: true,
    freeAttemptsCount: 2,
  },
};

export function normalizeProFeatureRules(
  rules?: Record<string, Partial<ProFeatureRule>> | null
): Record<string, ProFeatureRule> {
  const result: Record<string, ProFeatureRule> = { ...DEFAULT_PRO_FEATURE_RULES };
  if (rules && typeof rules === 'object') {
    Object.keys(rules).forEach((key) => {
      const candidate = rules[key];
      if (candidate && typeof candidate === 'object') {
        const def = DEFAULT_PRO_FEATURE_RULES[key] || {
          isPro: true,
          scope: 'export' as ProFeatureScope,
          allowFreeAttempts: true,
          freeAttemptsCount: 3,
        };
        result[key] = {
          isPro: typeof candidate.isPro === 'boolean' ? candidate.isPro : def.isPro,
          scope: candidate.scope === 'access' || candidate.scope === 'export' ? candidate.scope : def.scope,
          allowFreeAttempts:
            typeof candidate.allowFreeAttempts === 'boolean'
              ? candidate.allowFreeAttempts
              : def.allowFreeAttempts,
          freeAttemptsCount:
            typeof candidate.freeAttemptsCount === 'number' && candidate.freeAttemptsCount >= 0
              ? Math.max(0, Math.min(100, Math.round(candidate.freeAttemptsCount)))
              : def.freeAttemptsCount,
        };
      }
    });
  }
  return result;
}

export interface PlatformSettings {
  siteName: string;
  siteLogoUrl: string; // empty string = default gradient dot logo, or DataURL / https URL
  brandingUpdatedAt?: string;
  logoExplicitlyRemoved?: boolean;
  proPackageNameAr: string;
  proPackageNameEn: string;
  proPrice: string;
  proCurrency: string;
  proPeriodAr: string;
  proPeriodEn: string;
  proPlans: ProSubscriptionPlan[];
  proDescriptionAr: string;
  proDescriptionEn: string;
  proFormats: string[]; // array of format keys that require Pro subscription
  requireProForAllConversions: boolean; // if true, any conversion requires Pro regardless of format
  proFeatureRules?: Record<string, ProFeatureRule>; // custom rules and free trial attempts per feature/tool
  whatsappNumber: string;
  whatsappDefaultMsgAr: string;
  whatsappDefaultMsgEn: string;
  defaultLanguage: AppLanguage;
  bannedNetworkIds?: string[]; // قائمة الشبكات المحظورة نهائياً من دخول المنصة
  bannedUserIds?: string[]; // قائمة معرفات الحسابات المحظورة
  bannedEmails?: string[]; // قائمة البريد الإلكتروني للحسابات المحظورة
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
  proPlans: DEFAULT_PRO_PLANS.map((p) => ({ ...p })),
  proDescriptionAr:
    'احصل على وصول كامل لتحويل وتصدير جميع الصيغ الاحترافية (SVGA, VAP, YYEVA, PAG, Lottie, MP4) مع ضغط الملفات وتعديل الصوت والصور بدون قيود.',
  proDescriptionEn:
    'Get full access to convert and export all professional formats (SVGA, VAP, YYEVA, PAG, Lottie, MP4) with lossless compression, audio editing, and full layer control.',
  proFormats: ['svga', 'vap', 'yyeva', 'dual', 'pag', 'lottie', 'dotlottie', 'svga_editor'],
  requireProForAllConversions: false,
  proFeatureRules: { ...DEFAULT_PRO_FEATURE_RULES },
  whatsappNumber: '201000000000',
  whatsappDefaultMsgAr: 'مرحباً، أريد الاشتراك في باقة أدوات برو (Pro Tools) وتفعيل حسابي.',
  whatsappDefaultMsgEn: 'Hello, I would like to subscribe to the Pro Tools package and activate my account.',
  defaultLanguage: 'ar',
  bannedNetworkIds: [],
  bannedUserIds: [],
  bannedEmails: [],
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
  allowScreenCapture: true,
  screenCaptureGrantedAt: '2026-10-25T00:00:00.000Z',
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
    proPlanId: 'month',
    proPlanName: 'باقة شهر',
    createdAt: '2026-10-24T09:15:00.000Z',
    proActivatedAt: '2026-10-24T09:20:00.000Z',
    proExpiresAt: '2026-11-23T09:20:00.000Z',
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
 * Strictly requires matching the canonical Super Admin ID or email so regular accounts cannot self-promote.
 */
export function isSuperAdminUser(user: UserAccount | null | undefined): boolean {
  if (!user || isPurgedLegacyAdmin(user)) return false;
  return (
    user.role === 'admin' &&
    (user.id === INITIAL_SUPER_ADMIN_ACCOUNT.id ||
      (user.isSuperAdmin === true &&
        user.email?.trim().toLowerCase() === INITIAL_SUPER_ADMIN_ACCOUNT.email.toLowerCase()))
  );
}

/**
 * Pure function: Checks if a user has access to the Admin Dashboard (either Super Admin or a delegated Admin with >=1 valid permission).
 * Strictly requires role === 'admin' and a non-empty valid adminPermissions array for non-Super-Admins so revoked or malformed users never retain access.
 */
export function canAccessAdminDashboard(user: UserAccount | null | undefined): boolean {
  if (!user || isPurgedLegacyAdmin(user)) return false;
  if (isSuperAdminUser(user)) return true;
  if (user.isBanned || user.networkBanned) return false;
  if (user.role !== 'admin') return false;
  if (!Array.isArray(user.adminPermissions)) return false;
  const validPerms = user.adminPermissions.filter((k): k is AdminPermissionKey =>
    ALL_ADMIN_PERMISSION_KEYS.includes(k)
  );
  return validPerms.length > 0;
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
  if (user.role !== 'admin' || !canAccessAdminDashboard(user)) return [];
  return Array.isArray(user.adminPermissions)
    ? user.adminPermissions.filter((k): k is AdminPermissionKey => ALL_ADMIN_PERMISSION_KEYS.includes(k))
    : [];
}

/**
 * Pure function: Completely strips all Admin / Moderator roles, permissions, and badges from a user account
 * so that when Admin is removed in the dashboard, the account cleanly reverts to a normal user in both local state and Firestore.
 */
export function revokeAdminFromUserAccount(user: UserAccount, nowMs: number = Date.now()): UserAccount {
  if (isSuperAdminUser(user)) return user;
  // Keep Pro status ONLY if the user has an active paid subscription with a future expiration date
  const hasValidPaidSubscription =
    Boolean(user.proExpiresAt) && new Date(user.proExpiresAt!).getTime() > nowMs;
  return {
    ...user,
    role: 'user',
    isSuperAdmin: false,
    adminPermissions: [],
    adminBadgeTitle: '',
    adminGrantedAt: '',
    isPro: hasValidPaidSubscription ? user.isPro : false,
  };
}

/**
 * Pure function: Checks whether the logged-in actor is allowed to delete a user account.
 * Strictly restricted to the primary Super Admin ONLY — any delegated Admin/Moderator granted admin
 * in the dashboard is NEVER allowed to delete any user account, and the delete button is hidden from them.
 */
export function canDeleteUserAccount(
  actor: UserAccount | null | undefined,
  target?: UserAccount | null
): boolean {
  if (!actor || isPurgedLegacyAdmin(actor)) return false;
  if (!isSuperAdminUser(actor)) return false;
  if (target) {
    if (isSuperAdminUser(target) || target.id === actor.id) return false;
  }
  return true;
}

export const CLIENT_NETWORK_ID_STORAGE_KEY = 'motiontools_client_network_id_v1';

/**
 * Pure function: Generates a clean, deterministic Network / Device Fingerprint ID (`NET-XXXX-XXXX`)
 * from any seed string (user ID, email, or browser fingerprint).
 */
export function generateDeterministicNetworkId(seedStr: string): string {
  const clean = (seedStr || 'guest_net').trim().toLowerCase();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i * 17;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const part1 = ((h1 >>> 0) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  const part2 = ((h2 >>> 0) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `NET-${part1}-${part2}`;
}

/**
 * Returns the persistent Network / Device ID for the current client browser.
 */
export function getClientNetworkId(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'NET-0000-LOCAL';
  }
  try {
    const existing = window.localStorage.getItem(CLIENT_NETWORK_ID_STORAGE_KEY);
    if (existing && /^NET-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(existing.trim())) {
      return existing.trim().toUpperCase();
    }
    const navInfo =
      typeof navigator !== 'undefined'
        ? `${navigator.userAgent || ''}|${navigator.language || ''}|${screen?.width || 0}x${screen?.height || 0}`
        : 'browser';
    const randomSalt = Math.random().toString(36).substring(2, 10) + '_' + Date.now();
    const generated = generateDeterministicNetworkId(`${navInfo}|${randomSalt}`);
    window.localStorage.setItem(CLIENT_NETWORK_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return 'NET-0000-LOCAL';
  }
}

/**
 * Pure function: Resolves a guaranteed non-empty Network ID (`NET-XXXX-XXXX`) for any user record.
 */
export function getEffectiveUserNetworkId(user: Partial<UserAccount> | null | undefined): string {
  if (!user) return 'NET-0000-GUEST';
  const raw = typeof user.networkId === 'string' ? user.networkId.trim().toUpperCase() : '';
  if (raw && raw.length >= 6) return raw;
  return generateDeterministicNetworkId(user.id || user.email || 'user');
}

/**
 * Pure function: Checks whether an admin actor is permitted to ban/unban a target user account or network.
 * Super Admin can ban any non-Super-Admin account.
 * Delegated Admins with `manage_users` or `manage_admins` can ban non-Super-Admin accounts (cannot ban other admins without `manage_admins`).
 */
export function canBanUserAccount(
  actor: UserAccount | null | undefined,
  target: Partial<UserAccount> | null | undefined
): boolean {
  if (!actor || !target) return false;
  if (isSuperAdminUser(target as UserAccount)) return false;
  if (actor.id && target.id && actor.id === target.id) return false;
  if (isSuperAdminUser(actor)) return true;
  if (!canAccessAdminDashboard(actor)) return false;
  if (target.role === 'admin') {
    return hasAdminPermission(actor, 'manage_admins');
  }
  return hasAdminPermission(actor, 'manage_users') || hasAdminPermission(actor, 'manage_admins');
}

/**
 * Pure function: Checks if a user account is banned (either via account flag, network ban flag, or global settings lists).
 * The primary Super Admin account can NEVER be banned.
 */
export function isUserAccountBanned(
  user: Partial<UserAccount> | null | undefined,
  settings?: Partial<PlatformSettings> | null
): boolean {
  if (!user) return false;
  if (isSuperAdminUser(user as UserAccount)) return false;
  if (user.isBanned === true || user.networkBanned === true) return true;
  if (user.id && Array.isArray(settings?.bannedUserIds) && settings!.bannedUserIds!.includes(user.id)) {
    return true;
  }
  const emailLower = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (
    emailLower &&
    Array.isArray(settings?.bannedEmails) &&
    settings!.bannedEmails!.some((e) => e.trim().toLowerCase() === emailLower)
  ) {
    return true;
  }
  return false;
}

/**
 * Pure function: Checks if a specific network ID (`NET-XXXX-XXXX`) is banned from accessing the platform.
 */
export function isNetworkIdBanned(
  networkId: string | null | undefined,
  settings?: Partial<PlatformSettings> | null,
  users?: UserAccount[]
): boolean {
  const cleanNet = typeof networkId === 'string' ? networkId.trim().toUpperCase() : '';
  if (!cleanNet) return false;
  if (
    Array.isArray(settings?.bannedNetworkIds) &&
    settings!.bannedNetworkIds!.some((n) => n.trim().toUpperCase() === cleanNet)
  ) {
    return true;
  }
  if (Array.isArray(users)) {
    const matchedBannedUser = users.some(
      (u) =>
        !isSuperAdminUser(u) &&
        u.networkBanned === true &&
        getEffectiveUserNetworkId(u) === cleanNet
    );
    if (matchedBannedUser) return true;
  }
  return false;
}

/**
 * Pure function: Applies an Account Ban (`حظر حساب`), Network Ban (`حظر شبكة`), or Unban (`فك الحظر`)
 * to a target user and synchronizes the global ban lists in `PlatformSettings`.
 */
export function applyUserBanAction(params: {
  users: UserAccount[];
  settings: PlatformSettings;
  targetUserId: string;
  banAccount: boolean;
  banNetwork: boolean;
  reason?: string;
  nowIso?: string;
}): {
  users: UserAccount[];
  settings: PlatformSettings;
  updatedUser: UserAccount | null;
} {
  const { users, settings, targetUserId, banAccount, banNetwork } = params;
  const nowIso = params.nowIso || new Date().toISOString();
  const target = users.find((u) => u.id === targetUserId) || null;

  if (!target || isSuperAdminUser(target)) {
    return { users, settings, updatedUser: null };
  }

  const effectiveBanAccount = Boolean(banAccount || banNetwork);
  const effectiveBanNetwork = Boolean(banNetwork);
  const netId = getEffectiveUserNetworkId(target);
  const emailLower = target.email.trim().toLowerCase();
  const cleanReason =
    typeof params.reason === 'string' && params.reason.trim()
      ? params.reason.trim()
      : effectiveBanNetwork
        ? 'حظر شبكة وحساب نهائي من الإدارة (Network & Account Ban)'
        : effectiveBanAccount
          ? 'حظر حساب من الإدارة (Account Ban)'
          : '';

  const updatedUser: UserAccount = effectiveBanAccount
    ? {
        ...target,
        role: 'user',
        isSuperAdmin: false,
        adminPermissions: [],
        adminBadgeTitle: '',
        adminGrantedAt: '',
        isPro: false,
        allowScreenCapture: false,
        isBanned: true,
        networkBanned: effectiveBanNetwork,
        banReason: cleanReason,
        bannedAt: target.bannedAt || nowIso,
        networkId: netId,
      }
    : {
        ...target,
        isBanned: false,
        networkBanned: false,
        banReason: undefined,
        bannedAt: undefined,
        networkId: netId,
      };

  const nextUsers = users.map((u) => (u.id === targetUserId ? updatedUser : u));

  const prevNetIds = new Set(
    (settings.bannedNetworkIds || []).map((n) => n.trim().toUpperCase()).filter(Boolean)
  );
  const prevUserIds = new Set((settings.bannedUserIds || []).filter(Boolean));
  const prevEmails = new Set(
    (settings.bannedEmails || []).map((e) => e.trim().toLowerCase()).filter(Boolean)
  );

  if (effectiveBanAccount) {
    prevUserIds.add(target.id);
    if (emailLower) prevEmails.add(emailLower);
  } else {
    prevUserIds.delete(target.id);
    if (emailLower) prevEmails.delete(emailLower);
  }

  if (effectiveBanNetwork) {
    prevNetIds.add(netId);
  } else {
    const otherStillNetBanned = nextUsers.some(
      (u) =>
        u.id !== target.id &&
        !isSuperAdminUser(u) &&
        u.networkBanned === true &&
        getEffectiveUserNetworkId(u) === netId
    );
    if (!otherStillNetBanned) {
      prevNetIds.delete(netId);
    }
  }

  const nextSettings: PlatformSettings = {
    ...settings,
    bannedNetworkIds: Array.from(prevNetIds),
    bannedUserIds: Array.from(prevUserIds),
    bannedEmails: Array.from(prevEmails),
  };

  return {
    users: nextUsers,
    settings: nextSettings,
    updatedUser,
  };
}

/**
 * Pure function: Evaluates whether the current visitor / user is blocked from accessing the entire platform.
 * Note: An authenticated Super Admin (`isSuperAdminUser(currentUser)`) is never locked out of their active session
 * unless they explicitly activate `previewBlockMode` to test the lockdown screen.
 */
export function evaluatePlatformAccessBlock(params: {
  currentUser: UserAccount | null | undefined;
  settings: PlatformSettings;
  users: UserAccount[];
  clientNetworkId: string;
  previewBlockMode?: 'account' | 'network' | null;
}): {
  blocked: boolean;
  blockType: 'network' | 'account' | null;
  reason: string;
  networkId: string;
  bannedEmail?: string;
  isPreview: boolean;
} {
  const { currentUser, settings, users, clientNetworkId, previewBlockMode } = params;
  const effectiveNetId =
    (currentUser && getEffectiveUserNetworkId(currentUser)) ||
    clientNetworkId ||
    'NET-0000-GUEST';

  if (previewBlockMode === 'network' || previewBlockMode === 'account') {
    return {
      blocked: true,
      blockType: previewBlockMode,
      reason:
        previewBlockMode === 'network'
          ? 'معاينة حظر الشبكة النهائي — يمنع دخول المنصة بالكامل من هذه الشبكة أو الجهاز'
          : 'معاينة حظر الحساب النهائي — يمنع الحساب من الدخول أو استخدام أي أداة بالمنصة',
      networkId: effectiveNetId,
      bannedEmail: currentUser?.email || 'user@example.com',
      isPreview: true,
    };
  }

  if (currentUser && isSuperAdminUser(currentUser)) {
    return {
      blocked: false,
      blockType: null,
      reason: '',
      networkId: effectiveNetId,
      isPreview: false,
    };
  }

  const isClientNetBanned = isNetworkIdBanned(clientNetworkId, settings, users);
  const isUserNetBanned = Boolean(
    currentUser &&
      (currentUser.networkBanned === true ||
        isNetworkIdBanned(getEffectiveUserNetworkId(currentUser), settings, users))
  );

  if (isClientNetBanned || isUserNetBanned) {
    const matchedUser =
      currentUser ||
      users.find(
        (u) =>
          !isSuperAdminUser(u) &&
          u.networkBanned &&
          getEffectiveUserNetworkId(u) === clientNetworkId.trim().toUpperCase()
      ) ||
      null;
    return {
      blocked: true,
      blockType: 'network',
      reason:
        matchedUser?.banReason ||
        'تم حظر هذه الشبكة والجهاز نهائياً من دخول المنصة بقرار من الإدارة.',
      networkId: matchedUser ? getEffectiveUserNetworkId(matchedUser) : effectiveNetId,
      bannedEmail: matchedUser?.email,
      isPreview: false,
    };
  }

  if (currentUser && isUserAccountBanned(currentUser, settings)) {
    return {
      blocked: true,
      blockType: 'account',
      reason:
        currentUser.banReason ||
        'تم حظر هذا الحساب نهائياً من دخول المنصة واستخدام أدواتها بقرار من الإدارة.',
      networkId: effectiveNetId,
      bannedEmail: currentUser.email,
      isPreview: false,
    };
  }

  return {
    blocked: false,
    blockType: null,
    reason: '',
    networkId: effectiveNetId,
    isPreview: false,
  };
}

/**
 * Pure function: Checks whether a user account has permission to take screenshots and record screen video
 * anywhere on the platform (or via external screen recording tools/websites) without triggering the anti-capture shield.
 */
export function canUserCaptureScreen(
  user: UserAccount | null | undefined,
  adminPreviewRole: 'actual' | 'free_user' | 'pro_user' = 'actual'
): boolean {
  if (adminPreviewRole === 'free_user') return false;
  if (!user || isPurgedLegacyAdmin(user)) return false;
  if (isSuperAdminUser(user)) return true;
  return user.allowScreenCapture === true;
}

/**
 * Pure function: Grants or revokes the account-level permission to take screenshots and record screen video.
 */
export function setUserScreenCapturePermission(
  user: UserAccount,
  allowed: boolean,
  nowIso: string = new Date().toISOString()
): UserAccount {
  if (isSuperAdminUser(user)) {
    return {
      ...user,
      allowScreenCapture: true,
      screenCaptureGrantedAt: user.screenCaptureGrantedAt || nowIso,
    };
  }
  const nextAllowed = Boolean(allowed);
  return {
    ...user,
    allowScreenCapture: nextAllowed,
    screenCaptureGrantedAt: nextAllowed ? user.screenCaptureGrantedAt || nowIso : '',
  };
}

export interface ProSubscriptionInfo {
  isActive: boolean;
  isExpired: boolean;
  isPermanentAdmin: boolean;
  planId?: ProPlanDurationKey;
  planNameAr: string;
  planNameEn: string;
  durationDays: number;
  durationLabelAr: string;
  durationLabelEn: string;
  activatedAtIso: string | null;
  expiresAtIso: string | null;
  remainingDays: number;
  remainingHours: number;
  remainingMinutes: number;
  totalRemainingMs: number;
  progressPercent: number;
}

/**
 * Pure function: Computes full subscription timing, duration, start date, expiration date, and remaining time for a user.
 */
export function getUserProSubscriptionInfo(
  user: UserAccount | null | undefined,
  settings?: PlatformSettings,
  nowMs: number = Date.now()
): ProSubscriptionInfo {
  const emptyInfo: ProSubscriptionInfo = {
    isActive: false,
    isExpired: false,
    isPermanentAdmin: false,
    planId: undefined,
    planNameAr: 'مستخدم عادي (مجاني)',
    planNameEn: 'Free User',
    durationDays: 0,
    durationLabelAr: 'غير مشترك',
    durationLabelEn: 'Not Subscribed',
    activatedAtIso: null,
    expiresAtIso: null,
    remainingDays: 0,
    remainingHours: 0,
    remainingMinutes: 0,
    totalRemainingMs: 0,
    progressPercent: 0,
  };

  if (!user || isPurgedLegacyAdmin(user)) return emptyInfo;

  if (canAccessAdminDashboard(user)) {
    return {
      ...emptyInfo,
      isActive: true,
      isPermanentAdmin: true,
      planNameAr: isSuperAdminUser(user) ? 'صلاحية المدير العام (مفتوحة دائماً)' : 'صلاحية مشرف الداشبورد (مفعلة)',
      planNameEn: isSuperAdminUser(user) ? 'Super Admin (Unlimited)' : 'Moderator Access (Active)',
      durationLabelAr: 'دائم طوال فترة الإشراف',
      durationLabelEn: 'Unlimited while Admin',
      activatedAtIso: user.adminGrantedAt || user.proActivatedAt || user.createdAt || null,
      progressPercent: 100,
    };
  }

  if (!user.isPro) {
    return emptyInfo;
  }

  const plans = normalizeProPlans(settings?.proPlans, settings?.proPrice);
  const matchedPlan =
    plans.find((p) => p.id === user.proPlanId) ||
    plans.find((p) => p.nameAr === user.proPlanName || p.nameEn === user.proPlanName) ||
    plans.find((p) => p.id === 'month') ||
    DEFAULT_PRO_PLANS[1];

  const durationDays = matchedPlan?.durationDays || 30;
  const startIso = user.proActivatedAt || user.createdAt || new Date(nowMs).toISOString();
  const startMs = new Date(startIso).getTime();
  const validStartMs = Number.isFinite(startMs) ? startMs : nowMs;

  let expiresMs: number;
  let expiresIso: string;
  if (user.proExpiresAt && Number.isFinite(new Date(user.proExpiresAt).getTime())) {
    expiresMs = new Date(user.proExpiresAt).getTime();
    expiresIso = user.proExpiresAt;
  } else {
    expiresMs = validStartMs + durationDays * 24 * 60 * 60 * 1000;
    expiresIso = new Date(expiresMs).toISOString();
  }

  const totalDurationMs = Math.max(1, expiresMs - validStartMs);
  const remainingMs = expiresMs - nowMs;

  if (remainingMs <= 0) {
    return {
      isActive: false,
      isExpired: true,
      isPermanentAdmin: false,
      planId: matchedPlan.id,
      planNameAr: user.proPlanName || matchedPlan.nameAr,
      planNameEn: matchedPlan.nameEn,
      durationDays,
      durationLabelAr: matchedPlan.periodAr,
      durationLabelEn: matchedPlan.periodEn,
      activatedAtIso: new Date(validStartMs).toISOString(),
      expiresAtIso: expiresIso,
      remainingDays: 0,
      remainingHours: 0,
      remainingMinutes: 0,
      totalRemainingMs: 0,
      progressPercent: 0,
    };
  }

  const remainingDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
  const remainingHours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const progressPercent = Math.min(100, Math.max(2, Math.round((remainingMs / totalDurationMs) * 100)));

  return {
    isActive: true,
    isExpired: false,
    isPermanentAdmin: false,
    planId: matchedPlan.id,
    planNameAr: user.proPlanName || matchedPlan.nameAr,
    planNameEn: matchedPlan.nameEn,
    durationDays,
    durationLabelAr: matchedPlan.periodAr,
    durationLabelEn: matchedPlan.periodEn,
    activatedAtIso: new Date(validStartMs).toISOString(),
    expiresAtIso: expiresIso,
    remainingDays,
    remainingHours,
    remainingMinutes,
    totalRemainingMs: remainingMs,
    progressPercent,
  };
}

/**
 * Pure function: Checks all users and automatically disconnects Pro (`isPro: false`) for any user
 * whose subscription duration (`proExpiresAt`) has ended, returning them to a regular free user.
 */
export function checkAndExpireUsersPro(
  users: UserAccount[],
  settings?: PlatformSettings,
  nowMs: number = Date.now()
): { updatedUsers: UserAccount[]; expiredUsers: UserAccount[] } {
  const expiredUsers: UserAccount[] = [];
  const updatedUsers = (Array.isArray(users) ? users : []).map((u) => {
    if (!u || isSuperAdminUser(u) || canAccessAdminDashboard(u) || !u.isPro) {
      return u;
    }
    // Only auto-expire if the user has an explicit proExpiresAt or proActivatedAt timestamp that has passed
    if (!u.proExpiresAt && !u.proActivatedAt) {
      return u;
    }
    const subInfo = getUserProSubscriptionInfo(u, settings, nowMs);
    if (subInfo.isExpired) {
      const reverted: UserAccount = {
        ...u,
        isPro: false,
        proPlanId: undefined,
        proPlanName: '',
        proActivatedAt: '',
        proExpiresAt: '',
      };
      expiredUsers.push(reverted);
      return reverted;
    }
    return u;
  });

  return { updatedUsers, expiredUsers };
}

/**
 * Pure function: Computes a deterministic cryptographic-style session integrity signature
 * so localStorage tampering with role/permissions is automatically rejected.
 */
export function computeSessionToken(user: UserAccount | null | undefined): string {
  if (!user || isPurgedLegacyAdmin(user)) return '';
  const perms = getEffectiveAdminPermissions(user).sort().join(',');
  const scFlag = isSuperAdminUser(user) || user.allowScreenCapture === true ? 'SC1' : 'SC0';
  const payload = `mt_sec_v2|${user.id}|${user.email.toLowerCase()}|${user.role}|${user.isSuperAdmin ? 'SA' : 'U'}|${perms}|${scFlag}|${user.password || ''}`;
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
 * Pure function: Ensures a user's display name is chosen only once (upon registration or first-time setup)
 * and is permanently locked on subsequent logins so signing in with email + password never overwrites the user's name.
 */
export function resolveAuthenticatedUserOnLogin(
  existingUser: UserAccount,
  firstTimeFallbackName?: string
): UserAccount {
  const currentCleanName = typeof existingUser.name === 'string'
    ? existingUser.name.replace(/[<>]/g, '').trim()
    : '';
  const candidateCleanName = typeof firstTimeFallbackName === 'string'
    ? firstTimeFallbackName.replace(/[<>]/g, '').trim()
    : '';

  // If the account already has a valid name and is not explicitly unlocked, keep the existing name permanently
  if (currentCleanName && existingUser.nameLocked !== false) {
    return {
      ...existingUser,
      name: currentCleanName,
      nameLocked: true,
    };
  }

  // First-time name assignment (only if account had no name or was explicitly unlocked for first-time setup)
  const finalName =
    candidateCleanName ||
    currentCleanName ||
    (existingUser.email ? existingUser.email.split('@')[0] : 'User');

  return {
    ...existingUser,
    name: finalName,
    nameLocked: true,
  };
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
  adminPreviewRole: 'actual' | 'free_user' | 'pro_user' = 'actual',
  nowMs: number = Date.now()
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

  // Determine effective user privileges taking adminPreviewRole and subscription expiration into account
  let hasProAccess = false;
  if (adminPreviewRole === 'free_user') {
    hasProAccess = false;
  } else if (adminPreviewRole === 'pro_user') {
    hasProAccess = true;
  } else if (user && !isPurgedLegacyAdmin(user)) {
    if (canAccessAdminDashboard(user)) {
      hasProAccess = true;
    } else if (user.isPro === true) {
      if (user.proExpiresAt) {
        hasProAccess = new Date(user.proExpiresAt).getTime() > nowMs;
      } else {
        hasProAccess = true;
      }
    }
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
const PERMANENT_BRANDING_KEY = 'motiontools_permanent_branding_v1';

/**
 * Pure function: Sanitizes siteName by removing dangerous HTML/script characters while preserving Arabic/English text.
 */
export function sanitizeSiteName(name: string | null | undefined, fallback = 'MotionTools'): string {
  if (typeof name !== 'string') return fallback;
  const cleaned = name.replace(/[<>]/g, '').replace(/javascript:/gi, '').trim();
  return cleaned || fallback;
}

/**
 * Pure function: Validates and sanitizes siteLogoUrl against XSS vectors (javascript:, vbscript:, data:text/html, etc.).
 * Allows safe https://, http://, relative / paths, and valid data:image/*;base64,... URLs.
 */
export function sanitizeSiteLogoUrl(url: string | null | undefined): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text/') ||
    lower.startsWith('data:application/') ||
    lower.includes('<script') ||
    lower.includes('onerror=') ||
    lower.includes('onload=')
  ) {
    return '';
  }
  if (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('/') ||
    /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml|bmp|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/=\s]+$/i.test(
      trimmed
    )
  ) {
    return trimmed;
  }
  return '';
}

export interface PermanentBrandingRecord {
  siteName: string;
  siteLogoUrl: string;
  brandingUpdatedAt: string;
  logoExplicitlyRemoved: boolean;
}

/**
 * Saves branding (siteName + siteLogoUrl) in a dedicated permanent localStorage key so it is never lost
 * even if main state storage is overwritten or hits quota limits.
 */
export function savePermanentBranding(branding: {
  siteName?: string;
  siteLogoUrl?: string;
  brandingUpdatedAt?: string;
  logoExplicitlyRemoved?: boolean;
}): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const existing = loadPermanentBranding();
    const safeLogo = sanitizeSiteLogoUrl(branding.siteLogoUrl);
    const explicitlyRemoved = Boolean(branding.logoExplicitlyRemoved);
    const finalLogo = safeLogo
      ? safeLogo
      : explicitlyRemoved
        ? ''
        : existing?.siteLogoUrl || '';
    const record: PermanentBrandingRecord = {
      siteName: sanitizeSiteName(branding.siteName, existing?.siteName || DEFAULT_PLATFORM_SETTINGS.siteName),
      siteLogoUrl: finalLogo,
      brandingUpdatedAt: branding.brandingUpdatedAt || new Date().toISOString(),
      logoExplicitlyRemoved: finalLogo ? false : explicitlyRemoved,
    };
    window.localStorage.setItem(PERMANENT_BRANDING_KEY, JSON.stringify(record));
  } catch (e) {
    console.warn('Could not persist permanent branding vault:', e);
  }
}

export function loadPermanentBranding(): PermanentBrandingRecord | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(PERMANENT_BRANDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      siteName: sanitizeSiteName(parsed.siteName, DEFAULT_PLATFORM_SETTINGS.siteName),
      siteLogoUrl: sanitizeSiteLogoUrl(parsed.siteLogoUrl),
      brandingUpdatedAt: typeof parsed.brandingUpdatedAt === 'string' ? parsed.brandingUpdatedAt : '',
      logoExplicitlyRemoved: Boolean(parsed.logoExplicitlyRemoved),
    };
  } catch {
    return null;
  }
}

/**
 * Pure function: Safely merges incoming (e.g., Firestore snapshot) settings with local settings
 * so that changing the site name NEVER deletes the uploaded site logo, and stale Firestore snapshots
 * with an empty siteLogoUrl NEVER wipe out a saved logo unless logoExplicitlyRemoved is true with a newer timestamp.
 */
export function mergeBrandingSettingsSafely(
  localSettings: PlatformSettings,
  incomingSettings: Partial<PlatformSettings> | null | undefined
): PlatformSettings {
  if (!incomingSettings || typeof incomingSettings !== 'object') {
    return { ...localSettings };
  }

  const localTime = localSettings.brandingUpdatedAt
    ? new Date(localSettings.brandingUpdatedAt).getTime()
    : 0;
  const incomingTime = incomingSettings.brandingUpdatedAt
    ? new Date(incomingSettings.brandingUpdatedAt).getTime()
    : 0;

  const isLocalBrandingNewer =
    Number.isFinite(localTime) &&
    localTime > 0 &&
    (!Number.isFinite(incomingTime) || localTime > incomingTime);

  const localSafeLogo = sanitizeSiteLogoUrl(localSettings.siteLogoUrl);
  const incomingSafeLogo = sanitizeSiteLogoUrl(incomingSettings.siteLogoUrl);

  let resolvedLogoUrl: string;
  let resolvedLogoRemoved: boolean;

  if (isLocalBrandingNewer) {
    // Local branding was updated more recently than the incoming snapshot: keep local logo & name
    resolvedLogoUrl = localSafeLogo;
    resolvedLogoRemoved = Boolean(localSettings.logoExplicitlyRemoved);
  } else if (incomingSafeLogo) {
    // Incoming has a valid non-empty logo
    resolvedLogoUrl = incomingSafeLogo;
    resolvedLogoRemoved = false;
  } else if (
    incomingSettings.logoExplicitlyRemoved === true &&
    incomingTime > 0 &&
    incomingTime >= localTime
  ) {
    // Admin explicitly clicked "Reset/Delete Logo" with a newer timestamp
    resolvedLogoUrl = '';
    resolvedLogoRemoved = true;
  } else {
    // Incoming logo is empty, but was NOT explicitly removed -> preserve local logo!
    resolvedLogoUrl = localSafeLogo;
    resolvedLogoRemoved = false;
  }

  const resolvedSiteName = isLocalBrandingNewer
    ? sanitizeSiteName(localSettings.siteName, sanitizeSiteName(incomingSettings.siteName))
    : sanitizeSiteName(incomingSettings.siteName, sanitizeSiteName(localSettings.siteName));

  const resolvedTimestamp =
    Math.max(Number.isFinite(localTime) ? localTime : 0, Number.isFinite(incomingTime) ? incomingTime : 0) > 0
      ? new Date(
          Math.max(
            Number.isFinite(localTime) ? localTime : 0,
            Number.isFinite(incomingTime) ? incomingTime : 0
          )
        ).toISOString()
      : localSettings.brandingUpdatedAt || incomingSettings.brandingUpdatedAt || '';

  const merged: PlatformSettings = {
    ...localSettings,
    ...incomingSettings,
    siteName: resolvedSiteName,
    siteLogoUrl: resolvedLogoUrl,
    brandingUpdatedAt: resolvedTimestamp,
    logoExplicitlyRemoved: resolvedLogoRemoved,
  };
  merged.proPlans = normalizeProPlans(merged.proPlans, merged.proPrice);
  merged.proFeatureRules = normalizeProFeatureRules(merged.proFeatureRules);
  return merged;
}

/**
 * Compresses and optimizes an uploaded logo image file on the client side using HTML5 Canvas
 * so that even high-resolution PNG/JPG/WebP uploads (e.g. 2MB-10MB) are cleanly resized (max 256x256)
 * while preserving full alpha transparency and staying well under Firestore's 1MB limit (<80KB).
 */
export async function optimizeLogoImageFile(file: File, maxDim = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Invalid image file'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawDataUrl) {
        reject(new Error('Empty image data'));
        return;
      }
      // If it's a small SVG or already small (<65KB), keep it directly after sanitization
      if (rawDataUrl.length <= 65_000 && sanitizeSiteLogoUrl(rawDataUrl)) {
        resolve(rawDataUrl);
        return;
      }
      if (typeof document === 'undefined' || typeof Image === 'undefined') {
        resolve(sanitizeSiteLogoUrl(rawDataUrl));
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          let w = img.naturalWidth || img.width || maxDim;
          let h = img.naturalHeight || img.height || maxDim;
          if (w > maxDim || h > maxDim) {
            const ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.max(1, Math.round(w * ratio));
            h = Math.max(1, Math.round(h * ratio));
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(sanitizeSiteLogoUrl(rawDataUrl));
            return;
          }
          ctx.clearRect(0, 0, w, h);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);

          // Try PNG first to preserve lossless edges and transparency
          let output = canvas.toDataURL('image/png');
          // If PNG is still > 140KB, use WebP at 0.90 quality (which also supports full alpha transparency!)
          if (output.length > 140_000) {
            const webp = canvas.toDataURL('image/webp', 0.9);
            if (webp.startsWith('data:image/webp') && webp.length < output.length) {
              output = webp;
            }
          }
          resolve(sanitizeSiteLogoUrl(output) || sanitizeSiteLogoUrl(rawDataUrl));
        } catch {
          resolve(sanitizeSiteLogoUrl(rawDataUrl));
        }
      };
      img.onerror = () => resolve(sanitizeSiteLogoUrl(rawDataUrl));
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

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
 * Sanitizes and ensures the Super Admin account is always present while all legacy admin accounts are purged
 * and revoked admin accounts do not retain stale admin permissions or badges.
 */
export function sanitizeUsersList(rawUsers: UserAccount[], deletedIds: string[] = []): UserAccount[] {
  const filtered = (Array.isArray(rawUsers) ? rawUsers : []).filter(
    (u) => u && u.id && u.email && !isPurgedLegacyAdmin(u) && !deletedIds.includes(u.id)
  );
  const hasSuperAdmin = filtered.some((u) => isSuperAdminUser(u));
  const baseList = hasSuperAdmin ? filtered : [{ ...INITIAL_SUPER_ADMIN_ACCOUNT }, ...filtered];
  return baseList.map((u) => {
    const cleanName = typeof u.name === 'string' ? u.name.replace(/[<>]/g, '').trim() : u.email;
    const isNameLocked = u.nameLocked !== false && Boolean(cleanName);
    if (isSuperAdminUser(u)) {
      return {
        ...u,
        name: cleanName || INITIAL_SUPER_ADMIN_ACCOUNT.name,
        nameLocked: true,
        role: 'admin',
        isSuperAdmin: true,
        adminPermissions: [...ALL_ADMIN_PERMISSION_KEYS],
        allowScreenCapture: true,
        isPro: true,
        isBanned: false,
        networkBanned: false,
        banReason: undefined,
        bannedAt: undefined,
        networkId: getEffectiveUserNetworkId(u),
      };
    }
    const isBannedAcc = Boolean(u.isBanned || u.networkBanned);
    const isNetBannedAcc = Boolean(u.networkBanned);
    const resolvedNetId = getEffectiveUserNetworkId(u);
    if (isBannedAcc) {
      return {
        ...u,
        name: cleanName,
        nameLocked: isNameLocked,
        role: 'user',
        isSuperAdmin: false,
        adminPermissions: [],
        adminBadgeTitle: '',
        adminGrantedAt: '',
        isPro: false,
        allowScreenCapture: false,
        isBanned: true,
        networkBanned: isNetBannedAcc,
        banReason: u.banReason || (isNetBannedAcc ? 'حظر شبكة وحساب نهائي' : 'حظر حساب'),
        bannedAt: u.bannedAt || u.createdAt,
        networkId: resolvedNetId,
      };
    }
    const validPerms = Array.isArray(u.adminPermissions)
      ? u.adminPermissions.filter((k): k is AdminPermissionKey => ALL_ADMIN_PERMISSION_KEYS.includes(k))
      : [];
    if (u.role !== 'admin' || validPerms.length === 0) {
      return {
        ...u,
        name: cleanName,
        nameLocked: isNameLocked,
        role: 'user',
        isSuperAdmin: false,
        adminPermissions: [],
        adminBadgeTitle: '',
        adminGrantedAt: '',
        allowScreenCapture: Boolean(u.allowScreenCapture),
        isBanned: false,
        networkBanned: false,
        networkId: resolvedNetId,
      };
    }
    return {
      ...u,
      name: cleanName,
      nameLocked: isNameLocked,
      role: 'admin',
      isSuperAdmin: false,
      adminPermissions: validPerms,
      allowScreenCapture: Boolean(u.allowScreenCapture),
      isBanned: false,
      networkBanned: false,
      networkId: resolvedNetId,
    };
  });
}

export function loadPlatformState(): PlatformState {
  const deletedIds = getDeletedUserIds();
  const permanentBranding = loadPermanentBranding();
  const defaultWithPermanent: PlatformSettings = {
    ...DEFAULT_PLATFORM_SETTINGS,
    siteName: permanentBranding?.siteName || DEFAULT_PLATFORM_SETTINGS.siteName,
    siteLogoUrl: permanentBranding?.siteLogoUrl || DEFAULT_PLATFORM_SETTINGS.siteLogoUrl,
    brandingUpdatedAt: permanentBranding?.brandingUpdatedAt || '',
    logoExplicitlyRemoved: permanentBranding?.logoExplicitlyRemoved || false,
  };

  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      settings: defaultWithPermanent,
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
        settings: defaultWithPermanent,
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

    const parsedSettings = parsed.settings || {};
    const mergedSettings = mergeBrandingSettingsSafely(defaultWithPermanent, parsedSettings);
    mergedSettings.proPlans = normalizeProPlans(mergedSettings.proPlans, mergedSettings.proPrice);

    return {
      settings: mergedSettings,
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
      settings: defaultWithPermanent,
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
    // Always pin the latest branding in the dedicated permanent branding vault first!
    savePermanentBranding({
      siteName: state.settings.siteName,
      siteLogoUrl: state.settings.siteLogoUrl,
      brandingUpdatedAt: state.settings.brandingUpdatedAt,
      logoExplicitlyRemoved: state.settings.logoExplicitlyRemoved,
    });

    const activeUser = state.currentUserId
      ? state.users.find((u) => u.id === state.currentUserId) || null
      : null;
    const nextState: PlatformState = {
      ...state,
      settings: {
        ...state.settings,
        siteName: sanitizeSiteName(state.settings.siteName),
        siteLogoUrl: sanitizeSiteLogoUrl(state.settings.siteLogoUrl),
      },
      // Cap activityLogs in localStorage to latest 100 entries so localStorage never overflows
      activityLogs: Array.isArray(state.activityLogs) ? state.activityLogs.slice(0, 100) : [],
      sessionToken: activeUser ? computeSessionToken(activeUser) : null,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    window.dispatchEvent(new CustomEvent('platform-state-updated', { detail: nextState }));
  } catch (e) {
    console.warn('Could not persist platform state to localStorage:', e);
  }
}

export const GUEST_FREE_ATTEMPTS_STORAGE_KEY = 'motiontools_free_attempts_v1';

export function getGuestFreeAttemptsMap(): Record<string, number> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(GUEST_FREE_ATTEMPTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveGuestFreeAttemptsMap(map: Record<string, number>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(GUEST_FREE_ATTEMPTS_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export interface FeatureFreeAttemptsStatus {
  isPro: boolean;
  isUnlimited: boolean;
  allowFreeAttempts: boolean;
  totalAllowed: number;
  used: number;
  remaining: number;
  hasAccess: boolean;
  scope: ProFeatureScope;
  effectiveIsPro: boolean;
  remainingAttempts: number;
  rule: ProFeatureRule;
}

export interface FeatureAttemptConsumeResult {
  remaining: number;
  consumed: boolean;
  allowed: boolean;
  success: boolean;
  remainingAttempts: number;
  updatedUser?: UserAccount;
}

export function getFeatureFreeAttemptsStatus(
  featureKey: string,
  user: UserAccount | null | undefined,
  settings: PlatformSettings,
  adminPreviewRole: 'actual' | 'free_user' | 'pro_user' = 'actual',
  nowMs: number = Date.now()
): FeatureFreeAttemptsStatus {
  const rules = normalizeProFeatureRules(settings?.proFeatureRules);
  const rule = rules[featureKey] || {
    isPro: false,
    scope: 'export' as ProFeatureScope,
    allowFreeAttempts: true,
    freeAttemptsCount: 3,
  };

  // Determine if user has unlimited Pro access
  let isProUser = false;
  if (adminPreviewRole === 'free_user') {
    isProUser = false;
  } else if (adminPreviewRole === 'pro_user') {
    isProUser = true;
  } else if (user && !isPurgedLegacyAdmin(user)) {
    if (canAccessAdminDashboard(user)) {
      isProUser = true;
    } else if (user.isPro === true) {
      if (user.proExpiresAt) {
        isProUser = new Date(user.proExpiresAt).getTime() > nowMs;
      } else {
        isProUser = true;
      }
    }
  }

  if (!rule.isPro || isProUser) {
    return {
      isPro: rule.isPro,
      isUnlimited: true,
      allowFreeAttempts: rule.allowFreeAttempts,
      totalAllowed: rule.freeAttemptsCount,
      used: 0,
      remaining: Infinity,
      hasAccess: true,
      scope: rule.scope,
      effectiveIsPro: isProUser,
      remainingAttempts: Infinity,
      rule,
    };
  }

  // User is free/unsubscribed
  if (!rule.allowFreeAttempts || rule.freeAttemptsCount <= 0) {
    return {
      isPro: true,
      isUnlimited: false,
      allowFreeAttempts: false,
      totalAllowed: 0,
      used: 0,
      remaining: 0,
      hasAccess: false,
      scope: rule.scope,
      effectiveIsPro: false,
      remainingAttempts: 0,
      rule,
    };
  }

  const guestMap = getGuestFreeAttemptsMap();
  const used = Math.max(
    0,
    Number(user?.freeAttemptsUsed?.[featureKey] ?? guestMap[featureKey] ?? 0)
  );
  const remaining = Math.max(0, rule.freeAttemptsCount - used);

  return {
    isPro: true,
    isUnlimited: false,
    allowFreeAttempts: true,
    totalAllowed: rule.freeAttemptsCount,
    used,
    remaining,
    hasAccess: remaining > 0,
    scope: rule.scope,
    effectiveIsPro: false,
    remainingAttempts: remaining,
    rule,
  };
}

export function consumeFeatureFreeAttempt(
  featureKey: string,
  user: UserAccount | null | undefined,
  settings: PlatformSettings,
  adminPreviewRole: 'actual' | 'free_user' | 'pro_user' = 'actual',
  nowMs: number = Date.now()
): FeatureAttemptConsumeResult {
  const status = getFeatureFreeAttemptsStatus(featureKey, user, settings, adminPreviewRole, nowMs);
  if (status.isUnlimited) {
    return {
      remaining: Infinity,
      consumed: false,
      allowed: true,
      success: true,
      remainingAttempts: Infinity,
    };
  }
  if (!status.hasAccess || status.remaining <= 0) {
    return {
      remaining: 0,
      consumed: false,
      allowed: false,
      success: false,
      remainingAttempts: 0,
    };
  }

  const nextUsed = status.used + 1;
  const nextRemaining = Math.max(0, status.totalAllowed - nextUsed);

  // Update guest localStorage map
  const guestMap = getGuestFreeAttemptsMap();
  guestMap[featureKey] = nextUsed;
  saveGuestFreeAttemptsMap(guestMap);

  let updatedUser: UserAccount | undefined;
  if (user && !isPurgedLegacyAdmin(user)) {
    updatedUser = {
      ...user,
      freeAttemptsUsed: {
        ...(user.freeAttemptsUsed || {}),
        [featureKey]: nextUsed,
      },
    };
  }

  return {
    remaining: nextRemaining,
    consumed: true,
    allowed: true,
    success: true,
    remainingAttempts: nextRemaining,
    updatedUser,
  };
}

export function resetFeatureFreeAttempts(
  featureKey?: string,
  user?: UserAccount | null
): UserAccount | undefined {
  if (typeof window !== 'undefined' && window.localStorage) {
    if (featureKey) {
      const guestMap = getGuestFreeAttemptsMap();
      delete guestMap[featureKey];
      saveGuestFreeAttemptsMap(guestMap);
    } else {
      try {
        window.localStorage.removeItem(GUEST_FREE_ATTEMPTS_STORAGE_KEY);
      } catch {}
    }
  }
  if (user) {
    if (featureKey) {
      const nextUsed = { ...(user.freeAttemptsUsed || {}) };
      delete nextUsed[featureKey];
      return { ...user, freeAttemptsUsed: nextUsed };
    }
    return { ...user, freeAttemptsUsed: {} };
  }
  return undefined;
}


