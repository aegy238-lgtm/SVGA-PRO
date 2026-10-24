export type AppLanguage = 'ar' | 'en';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  role: 'admin' | 'user';
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

export interface PlatformState {
  settings: PlatformSettings;
  users: UserAccount[];
  currentUserId: string | null;
  notifications: BroadcastNotification[];
  readNotificationIds: string[];
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

export const INITIAL_USERS: UserAccount[] = [
  {
    id: 'usr_admin_1',
    name: 'مدير الموقع (Admin)',
    email: 'aegy238@gmail.com',
    password: 'admin123456',
    phone: '',
    role: 'admin',
    isPro: true,
    createdAt: '2026-10-20T10:00:00.000Z',
    proActivatedAt: '2026-10-20T10:00:00.000Z',
  },
  {
    id: 'usr_admin_2',
    name: 'المدير العام (Super Admin)',
    email: 'admin@motiontools.com',
    password: 'admin123456',
    phone: '',
    role: 'admin',
    isPro: true,
    createdAt: '2026-10-20T10:00:00.000Z',
    proActivatedAt: '2026-10-20T10:00:00.000Z',
  },
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
  } else if (user) {
    hasProAccess = user.role === 'admin' || user.isPro === true;
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

const STORAGE_KEY = 'motiontools_platform_state_v1';

export function loadPlatformState(): PlatformState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      settings: { ...DEFAULT_PLATFORM_SETTINGS },
      users: [...INITIAL_USERS],
      currentUserId: null,
      notifications: [...INITIAL_NOTIFICATIONS],
      readNotificationIds: [],
      language: 'ar',
      adminPreviewRole: 'actual',
    };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        settings: { ...DEFAULT_PLATFORM_SETTINGS },
        users: [...INITIAL_USERS],
        currentUserId: null,
        notifications: [...INITIAL_NOTIFICATIONS],
        readNotificationIds: [],
        language: 'ar',
        adminPreviewRole: 'actual',
      };
    }
    const parsed = JSON.parse(raw);
    return {
      settings: { ...DEFAULT_PLATFORM_SETTINGS, ...(parsed.settings || {}) },
      users: Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : [...INITIAL_USERS],
      currentUserId: parsed.currentUserId !== undefined ? parsed.currentUserId : null,
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [...INITIAL_NOTIFICATIONS],
      readNotificationIds: Array.isArray(parsed.readNotificationIds) ? parsed.readNotificationIds : [],
      language: parsed.language === 'en' ? 'en' : 'ar',
      adminPreviewRole: parsed.adminPreviewRole || 'actual',
    };
  } catch {
    return {
      settings: { ...DEFAULT_PLATFORM_SETTINGS },
      users: [...INITIAL_USERS],
      currentUserId: null,
      notifications: [...INITIAL_NOTIFICATIONS],
      readNotificationIds: [],
      language: 'ar',
      adminPreviewRole: 'actual',
    };
  }
}

export function savePlatformState(state: PlatformState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('platform-state-updated', { detail: state }));
  } catch (e) {
    console.warn('Could not persist platform state to localStorage:', e);
  }
}
