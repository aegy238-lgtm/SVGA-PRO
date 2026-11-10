import { getFirebaseDb, stripUndefinedForFirestore } from './firebase';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

export const PLATFORM_BRAND_NAME_AR = 'المصمم أحمد للهدايا';
export const PLATFORM_BRAND_NAME_EN = 'Designer Ahmed for Gifts';
export const CERTIFICATE_TITLE_PHRASE_AR = 'شهادة توثيق واعتماد تصميم';
export const CERTIFICATE_IP_STATEMENT_AR =
  'جميع حقوق التصميم والملكية الفكرية محفوظة للمصمم ومنصة المصمم أحمد للهدايا، ويُحظرنسخ أو إعادة توزيع التصميم دون إذن.';
export const CERTIFICATE_FIXED_FOOTER_AR =
  'تم توثيق هذا التصميم من خلال منصة المصمم أحمد للهدايا، ويُستخدم رقم التوثيق للتعرف على مصدر التصميم والتحقق من بيانات الشهادة.';

export interface GiftCertificateRecord {
  certificateId: string;
  platformName: string;
  titlePhrase: string;
  giftName: string;
  designerName: string;
  issueDateIso: string;
  issueDateFormatted: string;
  fileFormat: string;
  fileSizeLabel?: string;
  dimensionsLabel?: string;
  ipStatement: string;
  footerLegalStatement: string;
  checksumCode: string;
  sourceStudio?: string;
}

export interface GiftCertificateAutoSettings {
  enabled: boolean;
  autoDownloadWithSingleFile: boolean;
  preferredSingleFormat: 'png' | 'pdf' | 'both';
  embedInZipArchives: boolean;
  customDesignerName: string;
}

export interface CertificateVerificationResult {
  valid: boolean;
  statusType: 'verified_registry' | 'verified_signature' | 'invalid';
  record?: GiftCertificateRecord;
  messageAr: string;
}

const STORAGE_KEY_CERTIFICATES = 'ahmed_gifts_issued_certificates_v1';
const STORAGE_KEY_CERT_SETTINGS = 'ahmed_gifts_certificate_settings_v1';
const STORAGE_KEY_ADMIN_MASTER = 'ahmed_gifts_admin_master_enabled_v1';

let globalAdminCertificateEnabled = false;

/**
 * Sets the global Admin Dashboard master switch for the Gift Authentication Certificate system.
 * When false (closed), NO certificate is generated, attached to ZIPs, or downloaded for any user (even Super Admin).
 */
export function setGlobalAdminCertificateEnabled(enabled: boolean): void {
  globalAdminCertificateEnabled = Boolean(enabled);
  if (typeof window !== 'undefined') {
    try {
      (window as any).__adminGiftCertificateEnabled = globalAdminCertificateEnabled;
      if (window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY_ADMIN_MASTER, globalAdminCertificateEnabled ? 'true' : 'false');
      }
    } catch {}
  }
}

/**
 * Checks whether the Gift Authentication Certificate system is currently opened (enabled) in the Admin Dashboard.
 * Defaults to false (closed) unless explicitly opened by the Admin.
 */
export function isGlobalAdminCertificateEnabled(): boolean {
  if (typeof window !== 'undefined') {
    try {
      if (typeof (window as any).__adminGiftCertificateEnabled === 'boolean') {
        return (window as any).__adminGiftCertificateEnabled;
      }
      if (window.localStorage) {
        const stored = window.localStorage.getItem(STORAGE_KEY_ADMIN_MASTER);
        if (stored === 'true') return true;
        if (stored === 'false') return false;
      }
    } catch {}
  }
  return globalAdminCertificateEnabled;
}

export const DEFAULT_CERT_AUTO_SETTINGS: GiftCertificateAutoSettings = {
  enabled: true,
  autoDownloadWithSingleFile: true,
  preferredSingleFormat: 'png',
  embedInZipArchives: true,
  customDesignerName: '',
};

/**
 * Computes a deterministic 4-character alphanumeric checksum for a certificate seed.
 * Allows any Certificate ID issued by the platform (`AHM-YYYYMMDD-XXXXXX-CCCC`)
 * to be cryptographically validated for format & checksum integrity even offline.
 */
export function computeCertificateChecksum(coreBody: string): string {
  const normalized = coreBody.trim().toUpperCase();
  let h1 = 0x811c9dc5;
  const secretSalt = 'AHMED_GIFTS_ROYAL_CERT_2026';
  const combined = `${normalized}::${secretSalt}`;
  for (let i = 0; i < combined.length; i++) {
    h1 ^= combined.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  const unsigned = h1 >>> 0;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  let val = unsigned;
  for (let i = 0; i < 4; i++) {
    out += alphabet[val % alphabet.length];
    val = Math.floor(val / alphabet.length) ^ (unsigned >>> ((i + 1) * 5));
  }
  return out;
}

/**
 * Encodes format code (2 chars) + date + random serial + deterministic 4-char checksum
 * Example: `AHM-20261109-SV7K9Q-8X4M`
 */
export function generateUniqueCertificateId(fileFormat: string = 'SVGA', now: Date = new Date()): {
  certificateId: string;
  checksumCode: string;
} {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yyyy}${mm}${dd}`;

  const cleanFmt = (fileFormat || 'GF')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 2)
    .padEnd(2, 'X');

  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let randPart = cleanFmt;
  for (let i = 0; i < 4; i++) {
    const idx = Math.floor(Math.random() * alphabet.length);
    randPart += alphabet[idx];
  }

  const coreBody = `AHM-${datePart}-${randPart}`;
  const checksumCode = computeCertificateChecksum(coreBody);
  return {
    certificateId: `${coreBody}-${checksumCode}`,
    checksumCode,
  };
}

/**
 * Validates whether a Certificate ID matches the platform's structural & checksum rules.
 */
export function validateCertificateIdSignature(rawId: string): {
  isValidSignature: boolean;
  normalizedId: string;
  inferredDate?: string;
  inferredFormatPrefix?: string;
  checksumCode?: string;
} {
  const normalizedId = (rawId || '').trim().toUpperCase().replace(/\s+/g, '');
  const match = /^AHM-(\d{4})(\d{2})(\d{2})-([A-Z0-9]{6})-([A-Z0-9]{4})$/.exec(normalizedId);
  if (!match) {
    return { isValidSignature: false, normalizedId };
  }
  const [, yyyy, mm, dd, serialPart, providedChecksum] = match;
  const coreBody = `AHM-${yyyy}${mm}${dd}-${serialPart}`;
  const expectedChecksum = computeCertificateChecksum(coreBody);
  if (providedChecksum !== expectedChecksum) {
    return { isValidSignature: false, normalizedId };
  }
  return {
    isValidSignature: true,
    normalizedId,
    inferredDate: `${yyyy}/${mm}/${dd}`,
    inferredFormatPrefix: serialPart.slice(0, 2),
    checksumCode: providedChecksum,
  };
}

export function formatCertificateDateAr(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} — ${hh}:${min}`;
}

export function cleanGiftDisplayName(rawFileName: string): string {
  if (!rawFileName) return 'تصميم هدية ملكية';
  const withoutExt = rawFileName.replace(/\.[^/.]+$/, '');
  const cleaned = withoutExt.replace(/[_-]+/g, ' ').trim();
  return cleaned || rawFileName;
}

export function inferFormatFromFileName(fileName: string, explicitFormat?: string): string {
  if (explicitFormat && explicitFormat.trim()) {
    return explicitFormat.trim().toUpperCase();
  }
  const ext = (fileName || '').split('.').pop()?.trim().toUpperCase();
  if (!ext || ext === fileName.toUpperCase()) return 'SVGA';
  if (ext === 'JSX') return 'AE JSX SCRIPT';
  if (ext === 'LOTTIE') return 'DOTLOTTIE';
  if (ext === 'JSON') return 'LOTTIE JSON';
  return ext;
}

export function loadCertificateAutoSettings(): GiftCertificateAutoSettings {
  if (!isGlobalAdminCertificateEnabled()) {
    return {
      ...DEFAULT_CERT_AUTO_SETTINGS,
      enabled: false,
      autoDownloadWithSingleFile: false,
      embedInZipArchives: false,
    };
  }
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_CERT_AUTO_SETTINGS };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_CERT_SETTINGS);
    if (!raw) return { ...DEFAULT_CERT_AUTO_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== false,
      autoDownloadWithSingleFile: parsed.autoDownloadWithSingleFile !== false,
      preferredSingleFormat:
        parsed.preferredSingleFormat === 'pdf' || parsed.preferredSingleFormat === 'both'
          ? parsed.preferredSingleFormat
          : 'png',
      embedInZipArchives: parsed.embedInZipArchives !== false,
      customDesignerName:
        typeof parsed.customDesignerName === 'string' ? parsed.customDesignerName : '',
    };
  } catch {
    return { ...DEFAULT_CERT_AUTO_SETTINGS };
  }
}

export function saveCertificateAutoSettings(settings: GiftCertificateAutoSettings): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY_CERT_SETTINGS, JSON.stringify(settings));
  } catch {}
}

export function loadIssuedCertificatesRegistry(): GiftCertificateRecord[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_CERTIFICATES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveIssuedCertificatesRegistry(records: GiftCertificateRecord[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY_CERTIFICATES, JSON.stringify(records.slice(0, 500)));
  } catch {}
}

async function syncCertificateToFirestore(record: GiftCertificateRecord): Promise<void> {
  try {
    const db = getFirebaseDb();
    const ref = doc(db, 'gift_certificates', record.certificateId);
    await setDoc(ref, stripUndefinedForFirestore(record));
  } catch {
    // Non-blocking fallback when offline
  }
}

export async function fetchCertificateFromFirestore(
  certificateId: string
): Promise<GiftCertificateRecord | null> {
  try {
    const db = getFirebaseDb();
    const ref = doc(db, 'gift_certificates', certificateId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as GiftCertificateRecord;
      if (data && data.certificateId) {
        const local = loadIssuedCertificatesRegistry();
        if (!local.some((c) => c.certificateId === data.certificateId)) {
          saveIssuedCertificatesRegistry([data, ...local]);
        }
        return data;
      }
    }
  } catch {}
  return null;
}

export async function fetchRecentCertificatesFromFirestore(): Promise<GiftCertificateRecord[]> {
  try {
    const db = getFirebaseDb();
    const snap = await getDocs(collection(db, 'gift_certificates'));
    const remote: GiftCertificateRecord[] = [];
    snap.forEach((d) => {
      const data = d.data() as GiftCertificateRecord;
      if (data && data.certificateId) remote.push(data);
    });
    if (remote.length > 0) {
      const local = loadIssuedCertificatesRegistry();
      const map = new Map<string, GiftCertificateRecord>();
      [...remote, ...local].forEach((item) => map.set(item.certificateId, item));
      const merged = Array.from(map.values()).sort((a, b) =>
        (b.issueDateIso || '').localeCompare(a.issueDateIso || '')
      );
      saveIssuedCertificatesRegistry(merged);
      return merged;
    }
  } catch {}
  return loadIssuedCertificatesRegistry();
}

export interface IssueCertificateParams {
  giftName: string;
  fileFormat: string;
  designerName?: string;
  fileSizeLabel?: string;
  dimensionsLabel?: string;
  sourceStudio?: string;
  now?: Date;
}

/**
 * Creates a new GiftCertificateRecord with all required platform & legal fields,
 * saves it in the local registry and syncs to Firestore.
 */
export function issueGiftCertificate(params: IssueCertificateParams): GiftCertificateRecord {
  const now = params.now || new Date();
  const cleanFormat = inferFormatFromFileName(params.giftName, params.fileFormat);
  const cleanName = cleanGiftDisplayName(params.giftName);
  const autoSettings = loadCertificateAutoSettings();

  const resolvedDesigner =
    (params.designerName && params.designerName.trim()) ||
    (autoSettings.customDesignerName && autoSettings.customDesignerName.trim()) ||
    getActiveDesignerNameFromWindow() ||
    PLATFORM_BRAND_NAME_AR;

  const { certificateId, checksumCode } = generateUniqueCertificateId(cleanFormat, now);

  const record: GiftCertificateRecord = {
    certificateId,
    platformName: PLATFORM_BRAND_NAME_AR,
    titlePhrase: CERTIFICATE_TITLE_PHRASE_AR,
    giftName: cleanName,
    designerName: resolvedDesigner,
    issueDateIso: now.toISOString(),
    issueDateFormatted: formatCertificateDateAr(now),
    fileFormat: cleanFormat,
    fileSizeLabel: params.fileSizeLabel,
    dimensionsLabel: params.dimensionsLabel,
    ipStatement: CERTIFICATE_IP_STATEMENT_AR,
    footerLegalStatement: CERTIFICATE_FIXED_FOOTER_AR,
    checksumCode,
    sourceStudio: params.sourceStudio || 'منصة المصمم أحمد للهدايا',
  };

  const existing = loadIssuedCertificatesRegistry();
  saveIssuedCertificatesRegistry([record, ...existing]);
  void syncCertificateToFirestore(record);

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('giftcertificateissued', { detail: record }));
    } catch {}
  }

  return record;
}

function getActiveDesignerNameFromWindow(): string {
  if (typeof window === 'undefined') return PLATFORM_BRAND_NAME_AR;
  try {
    const winName = (window as any).__activeDesignerName;
    if (typeof winName === 'string' && winName.trim()) return winName.trim();
  } catch {}
  return PLATFORM_BRAND_NAME_AR;
}

/**
 * Synchronous + Asynchronous verification of any Certificate ID.
 * Checks local registry first, then validates cryptographic checksum signature.
 */
export function verifyGiftCertificateByIdSync(rawQueryId: string): CertificateVerificationResult {
  const normalized = (rawQueryId || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!normalized) {
    return {
      valid: false,
      statusType: 'invalid',
      messageAr: 'يرجى إدخال رقم التوثيق (Certificate ID) للتحقق من الشهادة.',
    };
  }

  const registry = loadIssuedCertificatesRegistry();
  const found = registry.find((r) => r.certificateId.toUpperCase() === normalized);
  if (found) {
    return {
      valid: true,
      statusType: 'verified_registry',
      record: found,
      messageAr:
        'شهادة توثيق صحيحة ومعتمدة رسمياً في سجل منصة المصمم أحمد للهدايا.',
    };
  }

  const sigCheck = validateCertificateIdSignature(normalized);
  if (sigCheck.isValidSignature) {
    const formatMap: Record<string, string> = {
      SV: 'SVGA',
      MP: 'MP4',
      GI: 'GIF',
      WE: 'WEBP',
      AP: 'APNG',
      PN: 'PNG',
      JP: 'JPEG',
      ZI: 'ZIP',
      LO: 'LOTTIE',
      DO: 'DOTLOTTIE',
      VA: 'VAP',
      YY: 'YYEVA',
      PA: 'PAG',
      MO: 'MOV',
      AE: 'AE JSX SCRIPT',
    };
    const inferredFormat =
      (sigCheck.inferredFormatPrefix && formatMap[sigCheck.inferredFormatPrefix]) ||
      sigCheck.inferredFormatPrefix ||
      'SVGA';
    const reconstructed: GiftCertificateRecord = {
      certificateId: sigCheck.normalizedId,
      platformName: PLATFORM_BRAND_NAME_AR,
      titlePhrase: CERTIFICATE_TITLE_PHRASE_AR,
      giftName: 'تصميم هدية معتمد – منصة المصمم أحمد للهدايا',
      designerName: PLATFORM_BRAND_NAME_AR,
      issueDateIso: new Date().toISOString(),
      issueDateFormatted: sigCheck.inferredDate || formatCertificateDateAr(),
      fileFormat: inferredFormat,
      ipStatement: CERTIFICATE_IP_STATEMENT_AR,
      footerLegalStatement: CERTIFICATE_FIXED_FOOTER_AR,
      checksumCode: sigCheck.checksumCode || '',
      sourceStudio: 'توقيع رقمي موثق (منصة المصمم أحمد للهدايا)',
    };
    return {
      valid: true,
      statusType: 'verified_signature',
      record: reconstructed,
      messageAr:
        'رقم التوثيق صحيح ومطابق للتوقيع الرقمي المعتمد لمنصة المصمم أحمد للهدايا.',
    };
  }

  return {
    valid: false,
    statusType: 'invalid',
    messageAr:
      'رقم التوثيق غير صحيح أو غير مسجل في منصة المصمم أحمد للهدايا. يرجى التأكد من كتابة الرقم بالكامل (مثال: AHM-20261109-XXXXXX-XXXX).',
  };
}

export async function verifyGiftCertificateByIdAsync(
  rawQueryId: string
): Promise<CertificateVerificationResult> {
  const normalized = (rawQueryId || '').trim().toUpperCase().replace(/\s+/g, '');
  const syncRes = verifyGiftCertificateByIdSync(normalized);
  if (syncRes.statusType === 'verified_registry') {
    return syncRes;
  }
  if (normalized.startsWith('AHM-')) {
    const remoteRecord = await fetchCertificateFromFirestore(normalized);
    if (remoteRecord) {
      return {
        valid: true,
        statusType: 'verified_registry',
        record: remoteRecord,
        messageAr:
          'شهادة توثيق صحيحة ومعتمدة رسمياً في قاعدة بيانات منصة المصمم أحمد للهدايا.',
      };
    }
  }
  return syncRes;
}

/**
 * Draws the 3D Royal Certificate onto an HTMLCanvasElement (2000 x 1414 px — A4 Landscape High-DPI).
 * Uses Luxury Obsidian Black (#06080e), Deep Royal Navy Blue (#0b1736), and 3D 24K Metallic Gold (#f59e0b / #fde047).
 */
export function renderGiftCertificateToCanvas(
  record: GiftCertificateRecord,
  targetCanvas?: HTMLCanvasElement
): HTMLCanvasElement {
  const W = 2000;
  const H = 1414;
  const canvas = targetCanvas || document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.save();

  // 1. Deep Obsidian Black & Royal Midnight Navy 3D Background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#04060b');
  bgGrad.addColorStop(0.28, '#09132c');
  bgGrad.addColorStop(0.5, '#0d1b3e');
  bgGrad.addColorStop(0.72, '#081024');
  bgGrad.addColorStop(1, '#04060b');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Ambient Royal Gold & Sapphire Spotlight Glows
  const centerGlow = ctx.createRadialGradient(W * 0.5, H * 0.42, 40, W * 0.5, H * 0.42, 820);
  centerGlow.addColorStop(0, 'rgba(245, 158, 11, 0.13)');
  centerGlow.addColorStop(0.45, 'rgba(30, 64, 175, 0.12)');
  centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, W, H);

  // 2. Subtle Royal Guilloché Geometric Watermark Pattern
  ctx.save();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.035)';
  ctx.lineWidth = 1.2;
  const gridStep = 80;
  for (let x = 80; x < W - 80; x += gridStep) {
    for (let y = 80; y < H - 80; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, y - 24);
      ctx.lineTo(x + 24, y);
      ctx.lineTo(x, y + 24);
      ctx.lineTo(x - 24, y);
      ctx.closePath();
      ctx.stroke();
    }
  }
  // Large subtle central rosette behind content
  ctx.translate(W / 2, H / 2);
  for (let i = 0; i < 24; i++) {
    ctx.rotate((Math.PI * 2) / 24);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.028)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 380, 140, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Helper for 24K 3D Metallic Gold Linear Gradient
  const makeGoldGrad = (x0: number, y0: number, x1: number, y1: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#92400e');
    g.addColorStop(0.18, '#f59e0b');
    g.addColorStop(0.35, '#fef08a');
    g.addColorStop(0.5, '#d97706');
    g.addColorStop(0.68, '#fde047');
    g.addColorStop(0.85, '#b45309');
    g.addColorStop(1, '#78350f');
    return g;
  };

  // 3. Outer 3D Royal Frame & Beveled Borders
  const padOuter = 44;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 12;
  ctx.strokeStyle = makeGoldGrad(0, 0, W, H);
  ctx.lineWidth = 14;
  ctx.strokeRect(padOuter, padOuter, W - padOuter * 2, H - padOuter * 2);
  ctx.restore();

  // Second Inner Navy-Gold Trench
  const padMid = 66;
  ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(padMid, padMid, W - padMid * 2, H - padMid * 2);

  // Third Main Sculpted Gold Frame
  const padInner = 82;
  ctx.save();
  ctx.strokeStyle = makeGoldGrad(W, 0, 0, H);
  ctx.lineWidth = 6;
  ctx.strokeRect(padInner, padInner, W - padInner * 2, H - padInner * 2);
  ctx.restore();

  // Inner Fine Filigree Hairline
  const padHair = 96;
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.32)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(padHair, padHair, W - padHair * 2, H - padHair * 2);
  ctx.setLineDash([]);

  // 4. Ornate 3D Corner Medallions (All 4 Corners)
  const drawCornerOrnament = (cx: number, cy: number, sx: number, sy: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sx, sy);

    ctx.fillStyle = makeGoldGrad(0, 0, 140, 140);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 12;

    // L-shaped royal bracket
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(135, 0);
    ctx.lineTo(118, 22);
    ctx.lineTo(22, 22);
    ctx.lineTo(22, 118);
    ctx.lineTo(0, 135);
    ctx.closePath();
    ctx.fill();

    // Inner corner diamond jewel
    ctx.beginPath();
    ctx.moveTo(42, 42);
    ctx.lineTo(74, 42);
    ctx.lineTo(74, 54);
    ctx.lineTo(54, 54);
    ctx.lineTo(54, 74);
    ctx.lineTo(42, 74);
    ctx.closePath();
    ctx.fill();

    // Corner pearl stud
    ctx.beginPath();
    ctx.arc(30, 30, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#fef9c3';
    ctx.fill();

    ctx.restore();
  };

  drawCornerOrnament(padOuter - 4, padOuter - 4, 1, 1);
  drawCornerOrnament(W - padOuter + 4, padOuter - 4, -1, 1);
  drawCornerOrnament(padOuter - 4, H - padOuter + 4, 1, -1);
  drawCornerOrnament(W - padOuter + 4, H - padOuter + 4, -1, -1);

  // 5. Top Royal Platform Identity Header & 3D Crown Emblem
  const centerX = W / 2;

  // Top Royal Shield & Crown Badge
  ctx.save();
  ctx.translate(centerX, 178);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;

  // Outer Gold Halo Ring
  ctx.beginPath();
  ctx.arc(0, 0, 62, 0, Math.PI * 2);
  ctx.fillStyle = '#070d1f';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = makeGoldGrad(-65, -65, 65, 65);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 53, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(254, 240, 138, 0.6)';
  ctx.stroke();

  // 3D Royal Crown Vector inside Emblem
  ctx.fillStyle = makeGoldGrad(-40, -30, 40, 30);
  ctx.beginPath();
  ctx.moveTo(-32, 18);
  ctx.lineTo(-38, -14);
  ctx.lineTo(-18, 2);
  ctx.lineTo(0, -26);
  ctx.lineTo(18, 2);
  ctx.lineTo(38, -14);
  ctx.lineTo(32, 18);
  ctx.closePath();
  ctx.fill();

  // Crown base bar
  ctx.fillRect(-32, 22, 64, 8);

  // Crown jewels
  ctx.fillStyle = '#fef9c3';
  [-38, -18, 0, 18, 38].forEach((jx, idx) => {
    const jy = idx === 2 ? -29 : idx % 2 === 0 ? -17 : -1;
    ctx.beginPath();
    ctx.arc(jx, jy, idx === 2 ? 4.5 : 3.2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // Decorative side wings flanking the emblem
  ctx.save();
  ctx.strokeStyle = makeGoldGrad(centerX - 480, 178, centerX + 480, 178);
  ctx.lineWidth = 2.5;
  // Left wing
  ctx.beginPath();
  ctx.moveTo(centerX - 460, 178);
  ctx.lineTo(centerX - 85, 178);
  ctx.stroke();
  // Right wing
  ctx.beginPath();
  ctx.moveTo(centerX + 85, 178);
  ctx.lineTo(centerX + 460, 178);
  ctx.stroke();
  ctx.restore();

  // Platform Name (اسم المنصة: المصمم أحمد للهدايا)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.font = '900 40px "Cairo", "Tajawal", "Plus Jakarta Sans", sans-serif';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = makeGoldGrad(centerX - 300, 255, centerX + 300, 295);
  ctx.fillText(record.platformName || PLATFORM_BRAND_NAME_AR, centerX, 276);

  ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#93c5fd';
  ctx.letterSpacing = '4px';
  ctx.fillText('DESIGNER AHMED FOR GIFTS • OFFICIAL CERTIFICATION AUTHORITY', centerX, 316);
  ctx.restore();

  // 6. Main 3D Metallic Gold Title: شهادة توثيق واعتماد تصميم
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.font = '900 66px "Cairo", "Tajawal", sans-serif';

  // 3D Extrusion Depth Layers
  for (let d = 5; d >= 1; d--) {
    ctx.fillStyle = d > 2 ? '#451a03' : '#78350f';
    ctx.fillText(record.titlePhrase || CERTIFICATE_TITLE_PHRASE_AR, centerX, 396 + d * 1.6);
  }
  ctx.shadowColor = 'rgba(245, 158, 11, 0.35)';
  ctx.shadowBlur = 28;
  ctx.fillStyle = makeGoldGrad(centerX - 450, 360, centerX + 450, 430);
  ctx.fillText(record.titlePhrase || CERTIFICATE_TITLE_PHRASE_AR, centerX, 396);
  ctx.restore();

  // Subtitle intro line
  ctx.save();
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.font = '600 22px "Cairo", "Tajawal", sans-serif';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(
    'تشهد منصة المصمم أحمد للهدايا بأن تصميم الهدية الموضح بياناتها أدناه قد تم اعتماده وتوثيقه رقمياً:',
    centerX,
    468
  );
  ctx.restore();

  // 7. Featured Gift Name Royal Banner (اسم الهدية)
  const giftBoxW = 1320;
  const giftBoxH = 112;
  const giftBoxX = centerX - giftBoxW / 2;
  const giftBoxY = 504;

  ctx.save();
  const bannerGrad = ctx.createLinearGradient(giftBoxX, giftBoxY, giftBoxX + giftBoxW, giftBoxY + giftBoxH);
  bannerGrad.addColorStop(0, 'rgba(15, 23, 42, 0.92)');
  bannerGrad.addColorStop(0.5, 'rgba(30, 41, 59, 0.96)');
  bannerGrad.addColorStop(1, 'rgba(15, 23, 42, 0.92)');
  ctx.fillStyle = bannerGrad;
  ctx.strokeStyle = makeGoldGrad(giftBoxX, giftBoxY, giftBoxX + giftBoxW, giftBoxY + giftBoxH);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(giftBoxX, giftBoxY, giftBoxW, giftBoxH, 20);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.font = '700 18px "Cairo", "Tajawal", sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('اسم الهدية المعتمدة (GIFT DESIGN NAME)', centerX, giftBoxY + 34);

  ctx.font = '900 36px "Cairo", "Tajawal", "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 10;
  const displayGiftTitle =
    record.giftName.length > 52 ? record.giftName.slice(0, 50) + '…' : record.giftName;
  ctx.fillText(displayGiftTitle, centerX, giftBoxY + 78);
  ctx.restore();

  // 8. Structured 2x3 Royal Data Grid (All Required Metadata Fields)
  const gridStartX = 160;
  const gridWidth = W - 320;
  const colGap = 28;
  const rowGap = 22;
  const colW = (gridWidth - colGap * 2) / 3;
  const cardH = 118;
  const gridTopY = 646;

  const dataCells: Array<{
    labelAr: string;
    labelEn: string;
    value: string;
    isMono?: boolean;
    highlightGold?: boolean;
  }> = [
    {
      labelAr: 'رقم التوثيق الفريد',
      labelEn: 'CERTIFICATE ID',
      value: record.certificateId,
      isMono: true,
      highlightGold: true,
    },
    {
      labelAr: 'اسم المصمم / صاحب التصميم',
      labelEn: 'DESIGNER / OWNER',
      value: record.designerName || PLATFORM_BRAND_NAME_AR,
      highlightGold: false,
    },
    {
      labelAr: 'اسم المنصة المصدرة',
      labelEn: 'ISSUING PLATFORM',
      value: record.platformName || PLATFORM_BRAND_NAME_AR,
      highlightGold: true,
    },
    {
      labelAr: 'تاريخ إصدار الشهادة',
      labelEn: 'ISSUE DATE & TIME',
      value: record.issueDateFormatted,
      isMono: true,
    },
    {
      labelAr: 'صيغة ملف الهدية',
      labelEn: 'GIFT FILE FORMAT',
      value: `${record.fileFormat}${record.fileSizeLabel ? ` (${record.fileSizeLabel})` : ''}`,
      isMono: true,
      highlightGold: true,
    },
    {
      labelAr: 'حالة الاعتماد والتوثيق',
      labelEn: 'AUTHENTICATION STATUS',
      value: 'موثق ومعتمد رسمياً ✓',
      highlightGold: false,
    },
  ];

  dataCells.forEach((cell, idx) => {
    // RTL column order (Right to Left: col 2, 1, 0)
    const r = Math.floor(idx / 3);
    const c = 2 - (idx % 3);
    const x = gridStartX + c * (colW + colGap);
    const y = gridTopY + r * (cardH + rowGap);

    ctx.save();
    ctx.fillStyle = 'rgba(10, 18, 38, 0.88)';
    ctx.strokeStyle = cell.highlightGold
      ? 'rgba(245, 158, 11, 0.65)'
      : 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = cell.highlightGold ? 2.2 : 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, colW, cardH, 16);
    ctx.fill();
    ctx.stroke();

    // Top accent bar inside cell
    ctx.fillStyle = cell.highlightGold ? '#f59e0b' : '#3b82f6';
    ctx.beginPath();
    ctx.roundRect(x + 24, y, colW - 48, 4, 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    ctx.font = '700 17px "Cairo", "Tajawal", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`${cell.labelAr} • ${cell.labelEn}`, x + colW / 2, y + 36);

    ctx.font = cell.isMono
      ? '800 24px "JetBrains Mono", "Courier New", monospace'
      : '800 25px "Cairo", "Tajawal", sans-serif';
    ctx.fillStyle = cell.highlightGold ? '#fde047' : '#f8fafc';
    const maxValChars = cell.isMono ? 28 : 30;
    const valStr =
      cell.value.length > maxValChars ? cell.value.slice(0, maxValChars - 1) + '…' : cell.value;
    ctx.fillText(valStr, x + colW / 2, y + 80);
    ctx.restore();
  });

  // 9. Bottom Section: Intellectual Property Box + 3D Golden Seal + Official Signature Block
  const bottomAreaY = 935;

  // Left Block: Digital Verification Matrix Badge (QR-style visual code + Checksum)
  ctx.save();
  const qrBoxX = 165;
  const qrBoxY = bottomAreaY + 10;
  const qrSize = 165;
  ctx.fillStyle = '#070c1a';
  ctx.strokeStyle = makeGoldGrad(qrBoxX, qrBoxY, qrBoxX + qrSize, qrBoxY + qrSize);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(qrBoxX, qrBoxY, qrSize, qrSize, 16);
  ctx.fill();
  ctx.stroke();

  // Deterministic Matrix Pattern based on Certificate ID
  const seedStr = record.certificateId;
  const matrixN = 9;
  const cellS = (qrSize - 36) / matrixN;
  const startMx = qrBoxX + 18;
  const startMy = qrBoxY + 18;
  for (let row = 0; row < matrixN; row++) {
    for (let col = 0; col < matrixN; col++) {
      const isFinder =
        (row < 3 && col < 3) ||
        (row < 3 && col >= matrixN - 3) ||
        (row >= matrixN - 3 && col < 3);
      const charCode = seedStr.charCodeAt((row * matrixN + col) % seedStr.length) || 65;
      const bit = isFinder || (charCode + row * 7 + col * 13) % 2 === 0;
      if (bit) {
        ctx.fillStyle = isFinder ? '#f59e0b' : '#fde047';
        ctx.fillRect(startMx + col * cellS + 1.5, startMy + row * cellS + 1.5, cellS - 3, cellS - 3);
      }
    }
  }
  ctx.textAlign = 'center';
  ctx.font = '700 14px "JetBrains Mono", monospace';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(`VERIFIED: ${record.checksumCode}`, qrBoxX + qrSize / 2, qrBoxY + qrSize + 24);
  ctx.restore();

  // Center Block: Intellectual Property Rights Statement + Official Platform Accreditation
  const ipBoxX = 375;
  const ipBoxW = 1170;
  const ipBoxY = bottomAreaY + 12;
  const ipBoxH = 165;

  ctx.save();
  ctx.fillStyle = 'rgba(9, 16, 34, 0.9)';
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.42)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(ipBoxX, ipBoxY, ipBoxW, ipBoxH, 18);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.font = '800 21px "Cairo", "Tajawal", sans-serif';
  ctx.fillStyle = '#fbbf24';
  ctx.fillText('⚖️ بيان حقوق الملكية الفكرية والاعتماد الرقمي', ipBoxX + ipBoxW / 2, ipBoxY + 40);

  ctx.font = '600 19px "Cairo", "Tajawal", sans-serif';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(
    record.ipStatement || CERTIFICATE_IP_STATEMENT_AR,
    ipBoxX + ipBoxW / 2,
    ipBoxY + 86
  );

  ctx.font = '700 18px "Cairo", "Tajawal", sans-serif';
  ctx.fillStyle = '#93c5fd';
  ctx.fillText(
    `الجهة المصدرة: ${PLATFORM_BRAND_NAME_AR}  •  كود التحقق الرقمي: ${record.certificateId}`,
    ipBoxX + ipBoxW / 2,
    ipBoxY + 132
  );
  ctx.restore();

  // Right Block: Realistic 3D Golden Authentication Seal (ختم توثيق ذهبي ثلاثي الأبعاد)
  const sealCx = W - 255;
  const sealCy = bottomAreaY + 95;
  const sealOuterR = 104;

  ctx.save();
  ctx.translate(sealCx, sealCy);

  // Flowing Gold Ribbons underneath the 3D Seal
  ctx.save();
  ctx.fillStyle = makeGoldGrad(-60, 60, 60, 145);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 14;
  // Left ribbon tail
  ctx.beginPath();
  ctx.moveTo(-42, 65);
  ctx.lineTo(-72, 138);
  ctx.lineTo(-44, 124);
  ctx.lineTo(-24, 144);
  ctx.lineTo(-10, 75);
  ctx.closePath();
  ctx.fill();
  // Right ribbon tail
  ctx.beginPath();
  ctx.moveTo(42, 65);
  ctx.lineTo(72, 138);
  ctx.lineTo(44, 124);
  ctx.lineTo(24, 144);
  ctx.lineTo(10, 75);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 3D Serrated Starburst Metallic Gold Seal Body
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  const teeth = 36;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? sealOuterR : sealOuterR - 11;
    const angle = (i * Math.PI) / teeth;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = makeGoldGrad(-sealOuterR, -sealOuterR, sealOuterR, sealOuterR);
  ctx.fill();

  // Inner 3D Recessed Gold Ring
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.beginPath();
  ctx.arc(0, 0, sealOuterR - 20, 0, Math.PI * 2);
  const innerSealGrad = ctx.createRadialGradient(-20, -20, 8, 0, 0, sealOuterR - 18);
  innerSealGrad.addColorStop(0, '#fef08a');
  innerSealGrad.addColorStop(0.55, '#d97706');
  innerSealGrad.addColorStop(0.88, '#92400e');
  innerSealGrad.addColorStop(1, '#451a03');
  ctx.fillStyle = innerSealGrad;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fef9c3';
  ctx.stroke();

  // Dashed Embossed Inner Ring
  ctx.beginPath();
  ctx.arc(0, 0, sealOuterR - 32, 0, Math.PI * 2);
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#451a03';
  ctx.stroke();
  ctx.setLineDash([]);

  // Seal Text & Stars
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.fillStyle = '#270e02';
  ctx.font = '900 15px "Cairo", "Tajawal", sans-serif';
  ctx.fillText('★ ختم توثيق معتمد ★', 0, -34);

  ctx.font = '900 20px "Cairo", "Tajawal", sans-serif';
  ctx.fillText('المصمم أحمد', 0, -4);
  ctx.font = '900 18px "Cairo", "Tajawal", sans-serif';
  ctx.fillText('للهدايا', 0, 20);

  ctx.font = '800 12px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('AUTHENTICATED 3D SEAL', 0, 44);
  ctx.restore();

  // 10. Fixed Mandatory Footer Statement at Bottom of Certificate (الهوية والحقوق)
  const footerBannerY = H - 172;
  const footerBannerH = 62;
  ctx.save();
  ctx.fillStyle = 'rgba(5, 9, 20, 0.95)';
  ctx.strokeStyle = makeGoldGrad(160, footerBannerY, W - 160, footerBannerY);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(160, footerBannerY, W - 320, footerBannerH, 31);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.font = '800 20px "Cairo", "Tajawal", sans-serif';
  ctx.fillStyle = '#fde047';
  ctx.fillText(
    CERTIFICATE_FIXED_FOOTER_AR,
    centerX,
    footerBannerY + footerBannerH / 2
  );
  ctx.restore();

  ctx.restore();
  return canvas;
}

/**
 * Generates a high-resolution PNG Blob of the 3D Royal Certificate.
 */
export async function generateCertificatePngBlob(
  record: GiftCertificateRecord
): Promise<Blob> {
  const canvas = renderGiftCertificateToCanvas(record);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode certificate PNG'));
    }, 'image/png');
  });
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64Idx = dataUrl.indexOf(';base64,');
  const base64 = base64Idx >= 0 ? dataUrl.slice(base64Idx + 8) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Builds a valid, standards-compliant single-page A4 Landscape PDF (`%PDF-1.4`)
 * embedding a JPEG image stream (`/DCTDecode`) with exact xref byte offsets.
 * Can also be tested directly in Node.js without DOM canvas.
 */
export function buildPdfBinaryFromJpegBytes(
  jpegBytes: Uint8Array,
  imgWidthPx: number,
  imgHeightPx: number,
  record: GiftCertificateRecord
): Uint8Array {
  const pageW = 841.89; // A4 Landscape width in pt
  const pageH = 595.28; // A4 Landscape height in pt

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0]; // index 0 is free object
  let currentOffset = 0;

  const pushString = (str: string) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    currentOffset += bytes.byteLength;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    currentOffset += bytes.byteLength;
  };

  const startObj = (id: number) => {
    offsets[id] = currentOffset;
    pushString(`${id} 0 obj\n`);
  };

  const endObj = () => {
    pushString('\nendobj\n');
  };

  // PDF Header with binary marker comment
  pushString('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // Object 1: Catalog
  startObj(1);
  pushString('<< /Type /Catalog /Pages 2 0 R >>');
  endObj();

  // Object 2: Pages
  startObj(2);
  pushString('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  endObj();

  // Object 3: Page (A4 Landscape)
  startObj(3);
  pushString(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
  );
  endObj();

  // Object 4: Image XObject (/DCTDecode JPEG)
  startObj(4);
  pushString(
    `<< /Type /XObject /Subtype /Image /Width ${imgWidthPx} /Height ${imgHeightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.byteLength} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushString('\nendstream');
  endObj();

  // Object 5: Page Content Stream (Draws Image filling the A4 Landscape page)
  const contentStreamStr = `q\n${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentStreamBytes = encoder.encode(contentStreamStr);
  startObj(5);
  pushString(`<< /Length ${contentStreamBytes.byteLength} >>\nstream\n`);
  pushBytes(contentStreamBytes);
  pushString('endstream');
  endObj();

  // Object 6: Document Info Metadata
  const safeId = record.certificateId.replace(/[()\\]/g, '');
  startObj(6);
  pushString(
    `<< /Title (Gift Authentication Certificate - ${safeId}) /Author (Designer Ahmed for Gifts) /Creator (Designer Ahmed for Gifts Platform) /Subject (Certificate ID: ${safeId}) >>`
  );
  endObj();

  // Cross-Reference Table (xref)
  const xrefOffset = currentOffset;
  const totalObjects = 7; // 0..6
  pushString(`xref\n0 ${totalObjects}\n`);
  pushString('0000000000 65535 f \n');
  for (let i = 1; i < totalObjects; i++) {
    const offStr = String(offsets[i] || 0).padStart(10, '0');
    pushString(`${offStr} 00000 n \n`);
  }

  // Trailer
  pushString(
    `trailer\n<< /Size ${totalObjects} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  const output = new Uint8Array(currentOffset);
  let pos = 0;
  for (const chunk of chunks) {
    output.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return output;
}

/**
 * Generates an official, high-resolution A4 Landscape PDF Blob of the 3D Royal Certificate.
 */
export async function generateCertificatePdfBlob(
  record: GiftCertificateRecord
): Promise<Blob> {
  const canvas = renderGiftCertificateToCanvas(record);
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.96);
  const jpegBytes = dataUrlToUint8Array(jpegDataUrl);
  const pdfBytes = buildPdfBinaryFromJpegBytes(jpegBytes, canvas.width, canvas.height, record);
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}

/**
 * Triggers a direct browser file download for a Blob.
 */
export function triggerCertificateBlobDownload(blob: Blob, fileName: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 45000);
}

/**
 * Injects both the PNG and PDF certificates + an Arabic/English verification info file
 * directly inside a JSZip instance without modifying any existing gift files in the archive.
 */
export async function injectCertificateIntoJsZipInstance(
  zipInstance: any,
  record: GiftCertificateRecord,
  subfolderName: string = ''
): Promise<void> {
  if (!isGlobalAdminCertificateEnabled()) return;
  if (!zipInstance || typeof zipInstance.file !== 'function') return;
  try {
    const [pngBlob, pdfBlob] = await Promise.all([
      generateCertificatePngBlob(record),
      generateCertificatePdfBlob(record),
    ]);
    const prefix = subfolderName ? `${subfolderName.replace(/\/+$/, '')}/` : '';
    const safeId = record.certificateId;
    zipInstance.file(`${prefix}Certificate_${safeId}.png`, pngBlob);
    zipInstance.file(`${prefix}Certificate_${safeId}.pdf`, pdfBlob);
    const infoTxt = [
      '====================================================================',
      `   ${PLATFORM_BRAND_NAME_AR} — ${CERTIFICATE_TITLE_PHRASE_AR}`,
      '====================================================================',
      `اسم الهدية (Gift Name)         : ${record.giftName}`,
      `رقم التوثيق الفريد (Cert ID)   : ${record.certificateId}`,
      `اسم المصمم (Designer / Owner)  : ${record.designerName}`,
      `تاريخ الإصدار (Issue Date)     : ${record.issueDateFormatted}`,
      `صيغة ملف الهدية (File Format)  : ${record.fileFormat}`,
      `اسم المنصة (Platform)          : ${record.platformName}`,
      '--------------------------------------------------------------------',
      `حقوق الملكية الفكرية: ${record.ipStatement}`,
      '--------------------------------------------------------------------',
      record.footerLegalStatement,
      '====================================================================',
    ].join('\n');
    zipInstance.file(`${prefix}شهادة_توثيق_الهدية_${safeId}.txt`, infoTxt);
  } catch (e) {
    console.warn('Could not inject certificate into ZIP:', e);
  }
}

/**
 * High-level automatic export hook:
 * - Issues a unique certificate for the exported gift ONLY if enabled in Admin Dashboard.
 * - If closed in Admin Dashboard, returns null immediately without generating or downloading anything.
 */
export async function issueAndAutoAttachGiftCertificate(params: {
  giftFileName: string;
  fileFormat?: string;
  fileSizeBytes?: number;
  dimensionsLabel?: string;
  sourceStudio?: string;
  skipAutoDownload?: boolean;
}): Promise<GiftCertificateRecord | null> {
  if (!isGlobalAdminCertificateEnabled()) return null;
  const autoSettings = loadCertificateAutoSettings();
  if (!autoSettings.enabled) return null;

  const sizeLabel =
    typeof params.fileSizeBytes === 'number' && params.fileSizeBytes > 0
      ? params.fileSizeBytes >= 1024 * 1024
        ? `${(params.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`
        : `${(params.fileSizeBytes / 1024).toFixed(1)} KB`
      : undefined;

  const record = issueGiftCertificate({
    giftName: params.giftFileName,
    fileFormat: inferFormatFromFileName(params.giftFileName, params.fileFormat),
    fileSizeLabel: sizeLabel,
    dimensionsLabel: params.dimensionsLabel,
    sourceStudio: params.sourceStudio,
  });

  if (!params.skipAutoDownload && autoSettings.autoDownloadWithSingleFile) {
    try {
      const safeGiftSlug =
        cleanGiftDisplayName(params.giftFileName)
          .replace(/[^\u0600-\u06FFa-zA-Z0-9_-]+/g, '_')
          .slice(0, 32) || 'Gift';

      if (
        autoSettings.preferredSingleFormat === 'png' ||
        autoSettings.preferredSingleFormat === 'both'
      ) {
        const pngBlob = await generateCertificatePngBlob(record);
        setTimeout(() => {
          triggerCertificateBlobDownload(
            pngBlob,
            `شهادة_توثيق_${safeGiftSlug}_${record.certificateId}.png`
          );
        }, 260);
      }

      if (
        autoSettings.preferredSingleFormat === 'pdf' ||
        autoSettings.preferredSingleFormat === 'both'
      ) {
        const pdfBlob = await generateCertificatePdfBlob(record);
        setTimeout(() => {
          triggerCertificateBlobDownload(
            pdfBlob,
            `شهادة_توثيق_${safeGiftSlug}_${record.certificateId}.pdf`
          );
        }, 520);
      }
    } catch (e) {
      console.warn('Auto certificate download warning:', e);
    }
  }

  return record;
}
