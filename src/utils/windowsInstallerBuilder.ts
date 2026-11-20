import JSZip from 'jszip';

export const WINDOWS_APP_VERSION = '1.0.24';
export const WINDOWS_INSTALLER_ZIP_NAME = 'MotionTools-Windows-x64-Setup.zip';
export const WINDOWS_SETUP_BAT_NAME = 'Setup-MotionTools.bat';
export const DEFAULT_WINDOWS_INSTALL_PATH =
  'C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\MotionTools-v1.0.24';

export const WINDOWS_PRIMARY_OWNED_EXTENSIONS = ['.svga', '.motiontools'] as const;
export const WINDOWS_OPEN_WITH_EXTENSIONS = [
  '.svga',
  '.vap',
  '.yyeva',
  '.pag',
  '.lottie',
  '.dotlottie',
  '.mp4',
  '.mov',
  '.webm',
  '.gif',
  '.webp',
  '.apng',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.json',
  '.zip',
  '.motiontools',
] as const;

export interface WindowsInstallerBuildOptions {
  brandTitle: string;
  appName: string;
  logoUrl?: string;
  /** Custom logo embedded inside the offline web app itself (navbar, favicon, PWA icons) */
  appLogoUrl?: string;
  /** Custom logo converted to app-icon.ico for Windows Desktop/StartMenu shortcuts & tray */
  windowsIconLogoUrl?: string;
  /** Custom logo displayed inside the dark Windows Installer GUI header */
  installerUiLogoUrl?: string;
  /** Dedicated File Icon Logo (svga-file-icon.ico) displayed on .svga files in Windows Explorer (separate from site/app logo) */
  svgaFileIconLogoUrl?: string;
  subtitle?: string;
  /** Optional unique suffix so even two builds with the exact same name & version stay isolated */
  instanceTag?: string;
  installDir?: string;
  createDesktopShortcut?: boolean;
  launchAfterInstall?: boolean;
  /** Associate .svga & supported formats with the app icon and instant double-click open */
  associateFiles?: boolean;
  version?: string;
  onProgress?: (percent: number, messageAr: string, messageEn: string) => void;
}

export interface OfflineManifest {
  appName: string;
  version: string;
  generatedAt: string;
  files: string[];
}

function escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fnv1aHex(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function sanitizeWindowsAppName(name: string, fallback = 'MotionTools'): string {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
  return cleaned || fallback;
}

export function sanitizeWindowsVersion(version: string, fallback = WINDOWS_APP_VERSION): string {
  const cleaned = String(version || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 32);
  return cleaned || fallback;
}

export function sanitizeWindowsAsciiSlug(input: string, fallback = 'MotionTools'): string {
  const raw = String(input || '').trim();
  const ascii = raw
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
  if (ascii.length >= 2) return ascii.slice(0, 40);
  if (!raw) return fallback;
  return `App-${fnv1aHex(raw).slice(0, 6)}`;
}

export function computeWindowsAppInstanceId(
  appName: string,
  version: string,
  instanceTag?: string
): string {
  const safeName = sanitizeWindowsAppName(appName);
  const safeVer = sanitizeWindowsVersion(version);
  const appSlug = sanitizeWindowsAsciiSlug(safeName, 'MotionTools');
  const verSlug = safeVer.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || '1-0-24';
  const hasNonAscii = /[^\x20-\x7e]/.test(safeName);
  const suffix = hasNonAscii ? `-${fnv1aHex(safeName).slice(0, 4)}` : '';
  const tagSlug = instanceTag ? sanitizeWindowsAsciiSlug(instanceTag, '') : '';
  return tagSlug ? `${appSlug}${suffix}-v${verSlug}-${tagSlug}` : `${appSlug}${suffix}-v${verSlug}`;
}

export function computePreferredLoopbackPort(instanceId: string): number {
  const hex = fnv1aHex(instanceId || 'MotionTools-v1-0-24');
  const num = parseInt(hex, 16);
  // Spread across 47821..48999 so different apps/versions never share localStorage or servers
  return 47821 + (num % 1178);
}

export function getDefaultWindowsInstallPath(
  appName: string,
  version: string,
  instanceTag?: string
): string {
  const safeFolder = sanitizeWindowsAppName(appName, 'MotionTools');
  const safeVer = sanitizeWindowsVersion(version, WINDOWS_APP_VERSION);
  const tagSlug = instanceTag ? sanitizeWindowsAsciiSlug(instanceTag, '') : '';
  const dirName = tagSlug ? `${safeFolder}-v${safeVer}-${tagSlug}` : `${safeFolder}-v${safeVer}`;
  return `C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\${dirName}`;
}

export function formatWindowsInstallerZipName(
  appName: string,
  version: string,
  instanceTag?: string
): string {
  const safeName = sanitizeWindowsAppName(appName, 'MotionTools');
  const safeVer = sanitizeWindowsVersion(version, WINDOWS_APP_VERSION);
  const appSlug = sanitizeWindowsAsciiSlug(safeName, 'MotionTools');
  const tagSlug = instanceTag ? sanitizeWindowsAsciiSlug(instanceTag, '') : '';
  if (appSlug === 'MotionTools' && safeVer === WINDOWS_APP_VERSION && !tagSlug) {
    return WINDOWS_INSTALLER_ZIP_NAME;
  }
  const verSlug = safeVer.replace(/[^A-Za-z0-9._-]+/g, '-');
  return tagSlug
    ? `${appSlug}-v${verSlug}-${tagSlug}-Windows-x64-Setup.zip`
    : `${appSlug}-v${verSlug}-Windows-x64-Setup.zip`;
}

export function formatWindowsSetupBatName(appName: string): string {
  const safeName = sanitizeWindowsAppName(appName, 'MotionTools');
  const appSlug = sanitizeWindowsAsciiSlug(safeName, 'MotionTools');
  if (appSlug === 'MotionTools') {
    return WINDOWS_SETUP_BAT_NAME;
  }
  return `Setup-${appSlug}.bat`;
}

/**
 * Encodes text as UTF-8 with BOM (0xEF 0xBB 0xBF) so Windows PowerShell 5.1
 * always parses Arabic & Unicode strings reliably regardless of system codepage.
 */
export function encodeUtf8WithBom(content: string): Uint8Array {
  const clean = content.startsWith('\uFEFF') ? content : `\uFEFF${content}`;
  const body = new TextEncoder().encode(clean);
  return body;
}

/**
 * Converts a PNG byte buffer (256x256 recommended) into a valid Windows .ico file
 * using the PNG-in-ICO specification supported natively on Windows 7 / 10 / 11.
 */
export function createIcoFromPngBytes(pngBytes: Uint8Array): Uint8Array {
  const header = new Uint8Array(22 + pngBytes.length);
  const view = new DataView(header.buffer);
  // ICONDIR (6 bytes)
  view.setUint16(0, 0, true); // Reserved
  view.setUint16(2, 1, true); // Type: 1 = ICO
  view.setUint16(4, 1, true); // Image count: 1
  // ICONDIRENTRY (16 bytes)
  header[6] = 0; // Width: 0 => 256px
  header[7] = 0; // Height: 0 => 256px
  header[8] = 0; // Color palette
  header[9] = 0; // Reserved
  view.setUint16(10, 1, true); // Color planes
  view.setUint16(12, 32, true); // Bits per pixel
  view.setUint32(14, pngBytes.length, true); // Size of PNG payload
  view.setUint32(18, 22, true); // Offset to PNG payload
  header.set(pngBytes, 22);
  return header;
}

async function resolveLogoPngAndIco(
  primaryUrl?: string,
  fallbackUrl?: string
): Promise<{
  pngBytes: Uint8Array | null;
  icoBytes: Uint8Array | null;
}> {
  const candidates = [
    primaryUrl && primaryUrl.trim() ? primaryUrl.trim() : '',
    fallbackUrl && fallbackUrl.trim() ? fallbackUrl.trim() : '',
    './logo.png',
    './pwa-512x512.png',
    './pwa-192x192.png',
  ].filter(Boolean);

  for (const src of candidates) {
    try {
      const pngBytes = await renderImageSourceTo256Png(src);
      if (pngBytes && pngBytes.length > 0) {
        return {
          pngBytes,
          icoBytes: createIcoFromPngBytes(pngBytes),
        };
      }
    } catch {
      // Try next candidate
    }
  }
  return { pngBytes: null, icoBytes: null };
}

function renderImageSourceTo256Png(src: string): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.clearRect(0, 0, size, size);
        const w = img.naturalWidth || img.width || size;
        const h = img.naturalHeight || img.height || size;
        const scale = Math.min(size / w, size / h);
        const dw = Math.round(w * scale);
        const dh = Math.round(h * scale);
        const dx = Math.round((size - dw) / 2);
        const dy = Math.round((size - dh) / 2);
        ctx.drawImage(img, dx, dy, dw, dh);
        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          blob
            .arrayBuffer()
            .then((buf) => resolve(new Uint8Array(buf)))
            .catch(() => resolve(null));
        }, 'image/png');
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Generates the standalone native Windows Setup GUI (installer.html) matching
 * the exact dark Arabic/RTL visual layout from the reference installer window.
 */
export function generateWindowsInstallerHtml(opts: {
  brandTitle: string;
  appName: string;
  subtitle?: string;
  installDir: string;
  createDesktopShortcut: boolean;
  launchAfterInstall: boolean;
  associateFiles?: boolean;
  version: string;
  hasLogo: boolean;
  hasFileLogo?: boolean;
  hasIcon?: boolean;
}): string {
  const safeBrand = escapeHtml(opts.brandTitle || 'Ahmed Pro SVGA');
  const safeApp = escapeHtml(opts.appName || 'MotionTools');
  const safeSubtitle = escapeHtml(opts.subtitle || 'تطبيق ويندوز لمعالجة وتحويل ملفات الحركة');
  const safeVersion = escapeHtml(opts.version || WINDOWS_APP_VERSION);
  const safeDir = escapeHtml(opts.installDir || DEFAULT_WINDOWS_INSTALL_PATH);
  const associateChecked = opts.associateFiles !== false;
  const initialFileLogoSrc = opts.hasFileLogo ? './file-logo.png' : opts.hasLogo ? './logo.png' : '';

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>تثبيت التطبيق — ${safeBrand} · ${safeApp} (v${safeVersion})</title>
  ${opts.hasIcon ? '<link rel="icon" href="./app-icon.ico" />' : ''}
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #0c0b14;
      color: #f8fafc;
      font-family: "Segoe UI", "Cairo", Tahoma, sans-serif;
      user-select: none;
      overflow: hidden;
    }
    .shell {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100%;
      padding: 22px 26px 20px;
      background: radial-gradient(circle at 85% 15%, rgba(124, 92, 255, 0.14), transparent 45%), #0c0b14;
    }
    .hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      direction: ltr;
    }
    .hero-text {
      flex: 1;
      text-align: left;
    }
    .brand-gold {
      color: #fbbf24;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.2px;
      margin-bottom: 4px;
    }
    .app-title {
      color: #ffffff;
      font-size: 32px;
      font-weight: 900;
      line-height: 1.1;
      margin: 0 0 10px;
    }
    .app-sub {
      color: #cbd5e1;
      font-size: 16px;
      font-weight: 500;
      direction: rtl;
      text-align: left;
      margin: 0;
    }
    .logo-wrap {
      width: 152px;
      height: 152px;
      border-radius: 14px;
      background: #050509;
      border: 1px solid rgba(251, 191, 36, 0.28);
      display: grid;
      place-items: center;
      overflow: hidden;
      flex-shrink: 0;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
    }
    .logo-wrap img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .logo-fallback {
      font-size: 56px;
      font-weight: 900;
      color: #fbbf24;
    }
    .form-section {
      margin-top: 16px;
    }
    .field-label {
      display: block;
      font-size: 14px;
      font-weight: 700;
      color: #e2e8f0;
      margin-bottom: 8px;
      text-align: right;
    }
    .path-row {
      display: flex;
      align-items: center;
      gap: 10px;
      direction: ltr;
    }
    .path-input {
      flex: 1;
      height: 36px;
      padding: 0 10px;
      background: #ffffff;
      color: #0f172a;
      border: 1px solid #cbd5e1;
      border-radius: 3px;
      font-family: Consolas, "Segoe UI", monospace;
      font-size: 13.5px;
      font-weight: 600;
      outline: none;
    }
    .path-input:focus {
      border-color: #7c5cff;
      box-shadow: 0 0 0 2px rgba(124, 92, 255, 0.35);
    }
    .btn-outline {
      min-width: 96px;
      height: 36px;
      background: #0c0b14;
      color: #f8fafc;
      border: 1.5px solid #cbd5e1;
      border-radius: 3px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .btn-outline:hover:not(:disabled) {
      background: #171525;
      border-color: #ffffff;
    }
    .btn-outline:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .file-logo-card {
      margin-top: 12px;
      padding: 8px 10px;
      border-radius: 6px;
      background: rgba(251, 191, 36, 0.08);
      border: 1px solid rgba(251, 191, 36, 0.35);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      direction: rtl;
    }
    .file-logo-info {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .file-logo-thumb {
      width: 42px;
      height: 42px;
      border-radius: 8px;
      background: #050509;
      border: 1px solid rgba(251, 191, 36, 0.45);
      display: grid;
      place-items: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .file-logo-thumb img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .file-logo-title {
      font-size: 13px;
      font-weight: 800;
      color: #fde68a;
      line-height: 1.3;
    }
    .file-logo-hint {
      font-size: 11px;
      color: #cbd5e1;
      margin-top: 2px;
    }
    .btn-file-logo {
      padding: 6px 12px;
      height: 32px;
      background: rgba(251, 191, 36, 0.16);
      color: #fde68a;
      border: 1px solid rgba(251, 191, 36, 0.55);
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .btn-file-logo:hover:not(:disabled) {
      background: rgba(251, 191, 36, 0.28);
    }
    .checks {
      margin: 12px 0 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .check-item {
      display: grid;
      grid-template-columns: 1fr 22px 1fr;
      align-items: center;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      color: #f1f5f9;
    }
    .check-label {
      text-align: right;
      grid-column: 1;
    }
    .check-box {
      grid-column: 2;
      justify-self: center;
      width: 15px;
      height: 15px;
      accent-color: #2563eb;
      cursor: pointer;
      margin: 0;
    }
    .progress-wrap {
      margin-top: 8px;
    }
    .progress-bar-bg {
      width: 100%;
      height: 18px;
      background: #e5e7eb;
      border: 1px solid #9ca3af;
      border-radius: 2px;
      overflow: hidden;
      position: relative;
    }
    .progress-bar-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #7c5cff, #a855f7);
      transition: width 0.25s ease;
    }
    .meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 8px;
      font-size: 12.5px;
      color: #94a3b8;
      direction: ltr;
    }
    .status-text {
      color: #c4b5fd;
      font-weight: 600;
      direction: rtl;
    }
    .footer-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 16px;
      direction: ltr;
    }
    .btn-install {
      min-width: 196px;
      height: 40px;
      background: #7c5cff;
      color: #ffffff;
      border: none;
      border-radius: 3px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 6px 20px rgba(124, 92, 255, 0.35);
      transition: background 0.15s ease, transform 0.1s ease;
    }
    .btn-install:hover:not(:disabled) {
      background: #6d4aff;
    }
    .btn-install:active:not(:disabled) {
      transform: scale(0.99);
    }
    .btn-install:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    .btn-close {
      min-width: 112px;
      height: 40px;
    }
  </style>
</head>
<body>
  <div class="shell">
    <div>
      <div class="hero">
        <div class="hero-text">
          <div class="brand-gold">${safeBrand}</div>
          <h1 class="app-title">${safeApp}</h1>
          <p class="app-sub">${safeSubtitle}</p>
        </div>
        <div class="logo-wrap">
          ${opts.hasLogo ? '<img src="./logo.png" alt="Logo" />' : '<div class="logo-fallback">A</div>'}
        </div>
      </div>

      <div class="form-section">
        <label class="field-label" for="installPath">مجلد التثبيت</label>
        <div class="path-row">
          <input id="installPath" class="path-input" type="text" value="${safeDir}" />
          <button id="browseBtn" class="btn-outline" type="button">تغيير</button>
        </div>

        <div class="file-logo-card">
          <div class="file-logo-info">
            <div class="file-logo-thumb">
              ${initialFileLogoSrc ? `<img id="fileLogoPreview" src="${initialFileLogoSrc}" alt="SVGA File Logo" />` : '<img id="fileLogoPreview" alt="SVGA File Logo" style="display:none" />'}
            </div>
            <div>
              <div class="file-logo-title">لوجو ملفات SVGA (أيقونة الملفات)</div>
              <div id="fileLogoHint" class="file-logo-hint">${opts.hasFileLogo ? 'تم تجهيز لوجو مخصص لملفات SVGA (يمكنك تغييره الآن)' : 'مستقل عن لوجو الموقع — يظهر على ملفات .svga في الويندوز'}</div>
            </div>
          </div>
          <input id="fileLogoInput" type="file" accept="image/*" hidden />
          <button id="fileLogoBtn" class="btn-file-logo" type="button">رفع لوجو للملف</button>
        </div>

        <div class="checks">
          <label class="check-item">
            <span class="check-label">إضافة اختصار على سطح المكتب</span>
            <input id="desktopShortcut" class="check-box" type="checkbox" ${opts.createDesktopShortcut ? 'checked' : ''} />
          </label>
          <label class="check-item">
            <span class="check-label">تشغيل التطبيق بعد التثبيت</span>
            <input id="launchAfter" class="check-box" type="checkbox" ${opts.launchAfterInstall ? 'checked' : ''} />
          </label>
          <label class="check-item">
            <span class="check-label">ربط ملفات SVGA والصيغ المدعومة وتغيير أيقونتها بلوجو الملف</span>
            <input id="associateFiles" class="check-box" type="checkbox" ${associateChecked ? 'checked' : ''} />
          </label>
        </div>

        <div class="progress-wrap">
          <div class="progress-bar-bg">
            <div id="progressFill" class="progress-bar-fill"></div>
          </div>
          <div class="meta-row">
            <span>Windows x64 &bull; الإصدار ${safeVersion}</span>
            <span id="statusText" class="status-text">جاهز للتثبيت أوفلاين (بدون إنترنت)</span>
          </div>
        </div>
      </div>
    </div>

    <div class="footer-actions">
      <button id="installBtn" class="btn-install" type="button">تثبيت التطبيق</button>
      <button id="closeBtn" class="btn-outline btn-close" type="button">إغلاق</button>
    </div>
  </div>

  <script>
    (function () {
      const pathInput = document.getElementById('installPath');
      const browseBtn = document.getElementById('browseBtn');
      const desktopChk = document.getElementById('desktopShortcut');
      const launchChk = document.getElementById('launchAfter');
      const associateChk = document.getElementById('associateFiles');
      const fileLogoInput = document.getElementById('fileLogoInput');
      const fileLogoBtn = document.getElementById('fileLogoBtn');
      const fileLogoPreview = document.getElementById('fileLogoPreview');
      const fileLogoHint = document.getElementById('fileLogoHint');
      const progressFill = document.getElementById('progressFill');
      const statusText = document.getElementById('statusText');
      const installBtn = document.getElementById('installBtn');
      const closeBtn = document.getElementById('closeBtn');
      let customFileIconPngBase64 = '';

      if (fileLogoBtn && fileLogoInput) {
        fileLogoBtn.addEventListener('click', function () {
          fileLogoInput.click();
        });
        fileLogoInput.addEventListener('change', function () {
          const picked = fileLogoInput.files && fileLogoInput.files[0];
          if (!picked) return;
          const reader = new FileReader();
          reader.onload = function () {
            const img = new Image();
            img.onload = function () {
              try {
                const size = 256;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, size, size);
                const w = img.naturalWidth || img.width || size;
                const h = img.naturalHeight || img.height || size;
                const scale = Math.min(size / w, size / h);
                const dw = Math.round(w * scale);
                const dh = Math.round(h * scale);
                ctx.drawImage(img, Math.round((size - dw) / 2), Math.round((size - dh) / 2), dw, dh);
                const dataUrl = canvas.toDataURL('image/png');
                customFileIconPngBase64 = dataUrl.split(',')[1] || '';
                if (fileLogoPreview) {
                  fileLogoPreview.src = dataUrl;
                  fileLogoPreview.style.display = 'block';
                }
                if (fileLogoHint) {
                  fileLogoHint.textContent = '✅ تم اختيار لوجو الملف: ' + picked.name;
                }
              } catch (e) {
                statusText.textContent = 'تعذر تجهيز صورة لوجو الملف';
              }
            };
            img.src = String(reader.result || '');
          };
          reader.readAsDataURL(picked);
        });
      }

      function sendPing() {
        fetch('/api/ping', { method: 'POST' }).catch(function () {});
      }
      sendPing();
      setInterval(sendPing, 1500);

      window.addEventListener('beforeunload', function () {
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/close');
        }
      });

      // Resolve actual Windows user path from local installer server
      fetch('/api/default-info')
        .then(function (r) { return r.json(); })
        .then(function (info) {
          if (info && info.defaultInstallDir && pathInput.value.indexOf('%USERNAME%') !== -1) {
            pathInput.value = info.defaultInstallDir;
          }
        })
        .catch(function () {});

      browseBtn.addEventListener('click', async function () {
        browseBtn.disabled = true;
        try {
          const res = await fetch('/api/browse-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPath: pathInput.value })
          });
          const data = await res.json();
          if (data && data.path) {
            pathInput.value = data.path;
          }
        } catch (err) {
          statusText.textContent = 'تعذر فتح نافذة اختيار المجلد، يمكنك كتابة المسار يدوياً';
        } finally {
          browseBtn.disabled = false;
        }
      });

      installBtn.addEventListener('click', async function () {
        installBtn.disabled = true;
        browseBtn.disabled = true;
        progressFill.style.width = '18%';
        statusText.textContent = 'جاري تجهيز ملفات التطبيق وفك الحزمة الأوفلاين...';

        let simPct = 18;
        const timer = setInterval(function () {
          if (simPct < 88) {
            simPct += 7;
            progressFill.style.width = simPct + '%';
          }
        }, 220);

        try {
          const res = await fetch('/api/install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              installDir: pathInput.value,
              desktopShortcut: desktopChk.checked,
              launchAfterInstall: launchChk.checked,
              associateFiles: associateChk ? associateChk.checked : true,
              customFileIconPngBase64: customFileIconPngBase64 || ''
            })
          });
          const result = await res.json();
          clearInterval(timer);

          if (!res.ok || !result.ok) {
            throw new Error((result && result.error) || 'فشل التثبيت');
          }

          progressFill.style.width = '100%';
          statusText.textContent = '✅ تم التثبيت بنجاح! التطبيق جاهز للعمل بدون إنترنت';
          installBtn.textContent = 'تم التثبيت ✓';

          if (launchChk.checked) {
            setTimeout(function () {
              fetch('/api/close', { method: 'POST' }).catch(function () {});
              window.close();
            }, 1200);
          }
        } catch (err) {
          clearInterval(timer);
          progressFill.style.width = '0%';
          statusText.textContent = '❌ خطأ: ' + (err && err.message ? err.message : 'فشل التثبيت');
          installBtn.disabled = false;
          browseBtn.disabled = false;
        }
      });

      closeBtn.addEventListener('click', function () {
        fetch('/api/close', { method: 'POST' }).catch(function () {});
        window.close();
      });
    })();
  </script>
</body>
</html>`;
}

export interface OfflineRuntimeOptions {
  appName: string;
  version?: string;
  appId?: string;
  preferredPort?: number;
}

/**
 * Generates the PowerShell Offline HTTP Runtime Server (MotionTools-Offline.ps1)
 * that serves the installed app/ directory completely offline over 127.0.0.1
 * without requiring Node.js or an internet connection.
 * Each app name + version uses its own isolated appId and loopback port so side-by-side
 * versions or differently branded builds never collide.
 */
export function generateOfflineRuntimePs1(input: string | OfflineRuntimeOptions): string {
  const opts = typeof input === 'string' ? { appName: input } : input;
  const cleanName = sanitizeWindowsAppName(opts.appName, 'MotionTools');
  const cleanVer = sanitizeWindowsVersion(opts.version || WINDOWS_APP_VERSION, WINDOWS_APP_VERSION);
  const appId = (opts.appId || computeWindowsAppInstanceId(cleanName, cleanVer)).replace(/'/g, "''");
  const basePort = opts.preferredPort || computePreferredLoopbackPort(appId);
  const maxReusePort = basePort + 4;
  const maxBindPort = basePort + 19;
  const safeName = cleanName.replace(/'/g, "''");
  const safeVer = cleanVer.replace(/'/g, "''");

  return `# ${safeName} v${safeVer} — 100% Offline Windows Desktop Runtime Server
param(
  [string]$OpenFile = ''
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$logFile = Join-Path $env:TEMP '${appId}-Offline.log'
$expectedAppId = '${appId}'

function Find-AppBrowser {
  $candidates = @(
    "\${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe",
    "\${env:ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe",
    "\${env:LocalAppData}\\Microsoft\\Edge\\Application\\msedge.exe",
    "\${env:ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe",
    "\${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe",
    "\${env:LocalAppData}\\Google\\Chrome\\Application\\chrome.exe"
  )
  foreach ($regKey in @(
    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe'
  )) {
    try {
      $p = (Get-ItemProperty -Path $regKey -ErrorAction SilentlyContinue).'(default)'
      if ($p) { $candidates += $p }
    } catch {}
  }
  return ($candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1)
}

$win32FocusType = @'
using System;
using System.Runtime.InteropServices;
public static class MtWin32Focus {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
'@
try {
  if (-not ([System.Management.Automation.PSTypeName]'MtWin32Focus').Type) {
    Add-Type -TypeDefinition $win32FocusType -ErrorAction SilentlyContinue
  }
} catch {}

function Focus-AppWindow([int]$preferredPid = 0) {
  try {
    $hwnd = [IntPtr]::Zero
    if ($preferredPid -gt 0) {
      try {
        $p = Get-Process -Id $preferredPid -ErrorAction SilentlyContinue
        if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
          $hwnd = $p.MainWindowHandle
        }
      } catch {}
    }
    if ($hwnd -eq [IntPtr]::Zero) {
      $procs = Get-Process -Name 'msedge','chrome' -ErrorAction SilentlyContinue | Where-Object {
        $_.MainWindowHandle -ne [IntPtr]::Zero -and (
          $_.MainWindowTitle -like '*${safeName}*' -or
          $_.MainWindowTitle -like '*SVGA*' -or
          $_.MainWindowTitle -like '*MotionTools*'
        )
      }
      $match = $procs | Select-Object -First 1
      if ($match) { $hwnd = $match.MainWindowHandle }
    }
    if ($hwnd -ne [IntPtr]::Zero) {
      if ([MtWin32Focus]::IsIconic($hwnd)) {
        [MtWin32Focus]::ShowWindow($hwnd, 9) | Out-Null
      } else {
        [MtWin32Focus]::ShowWindow($hwnd, 5) | Out-Null
      }
      # Pulse HWND_TOPMOST -> HWND_NOTOPMOST + SwitchToThisWindow to pop reliably above File Explorer
      [MtWin32Focus]::SetWindowPos($hwnd, [IntPtr](-1), 0, 0, 0, 0, 0x0043) | Out-Null
      [MtWin32Focus]::SetWindowPos($hwnd, [IntPtr](-2), 0, 0, 0, 0, 0x0043) | Out-Null
      [MtWin32Focus]::SwitchToThisWindow($hwnd, $true)
      [MtWin32Focus]::SetForegroundWindow($hwnd) | Out-Null
      return $true
    }
  } catch {}
  return $false
}

function Open-AppWindow([string]$browserExe, [string]$url, [string]$profileDir) {
  if ($browserExe) {
    if (-not (Test-Path $profileDir)) { New-Item -ItemType Directory -Path $profileDir -Force | Out-Null }
    $launchArgs = "--app=$url --user-data-dir=""$profileDir"" --start-maximized --no-first-run --disable-features=msEdgeSidebarV2"
    return (Start-Process -FilePath $browserExe -ArgumentList $launchArgs -PassThru)
  } else {
    Start-Process $url | Out-Null
    return $null
  }
}

try {
  $installRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
  $appDir = Join-Path $installRoot 'app'
  $script:profileDir = Join-Path $installRoot 'profile'

  if (-not (Test-Path $appDir)) {
    [System.Windows.Forms.MessageBox]::Show("App files missing in: $appDir", "${safeName} v${safeVer}", 0, 16) | Out-Null
    exit 1
  }

  $resolvedOpenFile = ''
  if (-not [string]::IsNullOrWhiteSpace($OpenFile)) {
    $trimmedOpen = $OpenFile.Trim().Trim('"')
    if (Test-Path -LiteralPath $trimmedOpen -PathType Leaf) {
      $resolvedOpenFile = [System.IO.Path]::GetFullPath($trimmedOpen)
    }
  }

  $script:browserExe = Find-AppBrowser

  # Reuse ONLY an existing offline server belonging to the exact same appId + version
  foreach ($checkPort in ${basePort}..${maxReusePort}) {
    try {
      $probe = Invoke-RestMethod -Uri "http://127.0.0.1:$checkPort/api/health" -TimeoutSec 1 -ErrorAction Stop
      if ($probe -and $probe.runtime -eq 'windows-offline' -and $probe.appId -eq $expectedAppId) {
        if ($resolvedOpenFile) {
          $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes((@{ filePath = $resolvedOpenFile } | ConvertTo-Json -Compress))
          $enq = Invoke-RestMethod -Uri "http://127.0.0.1:$checkPort/api/enqueue-file" -Method Post -Body $bodyBytes -ContentType 'application/json; charset=utf-8' -TimeoutSec 2 -ErrorAction Stop
          if ($enq -and $enq.ok -and $enq.hasActiveClient -eq $true) {
            # Newly launched Explorer child process holds Windows foreground rights: pop existing window to front NOW!
            $focused = Focus-AppWindow
            if ($focused -or $enq.windowFocused -eq $true) {
              exit 0
            }
          }
          if ($enq -and $enq.token) {
            Open-AppWindow $script:browserExe ("http://127.0.0.1:$checkPort/?openFileToken=" + $enq.token) $script:profileDir | Out-Null
            exit 0
          }
        }
        if (Focus-AppWindow) {
          exit 0
        }
        Open-AppWindow $script:browserExe "http://127.0.0.1:$checkPort/" $script:profileDir | Out-Null
        exit 0
      }
    } catch {}
  }

  function Get-MimeType([string]$ext) {
    switch ($ext.ToLowerInvariant()) {
      '.html' { return 'text/html; charset=utf-8' }
      '.js'   { return 'application/javascript; charset=utf-8' }
      '.mjs'  { return 'application/javascript; charset=utf-8' }
      '.cjs'  { return 'application/javascript; charset=utf-8' }
      '.css'  { return 'text/css; charset=utf-8' }
      '.json' { return 'application/json; charset=utf-8' }
      '.wasm' { return 'application/wasm' }
      '.svg'  { return 'image/svg+xml' }
      '.png'  { return 'image/png' }
      '.jpg'  { return 'image/jpeg' }
      '.jpeg' { return 'image/jpeg' }
      '.webp' { return 'image/webp' }
      '.gif'  { return 'image/gif' }
      '.ico'  { return 'image/x-icon' }
      '.mp4'  { return 'video/mp4' }
      '.webm' { return 'video/webm' }
      '.mov'  { return 'video/quicktime' }
      '.woff' { return 'font/woff' }
      '.woff2'{ return 'font/woff2' }
      '.ttf'  { return 'font/ttf' }
      '.txt'  { return 'text/plain; charset=utf-8' }
      '.svga' { return 'application/octet-stream' }
      '.pag'  { return 'application/octet-stream' }
      '.lottie'{ return 'application/zip' }
      default { return 'application/octet-stream' }
    }
  }

  # Bind isolated loopback port for this app/version so localStorage & sessions stay isolated
  $port = ${basePort}
  $listener = $null
  for ($tryPort = ${basePort}; $tryPort -le ${maxBindPort}; $tryPort++) {
    $l = $null
    try {
      $l = New-Object System.Net.HttpListener
      $l.Prefixes.Add("http://127.0.0.1:$tryPort/")
      $l.Start()
      $listener = $l
      $port = $tryPort
      break
    } catch {
      if ($l) { try { $l.Close() } catch {} }
    }
  }

  if (-not $listener) {
    $tcp = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
    $tcp.Start()
    $port = $tcp.LocalEndpoint.Port
    $tcp.Stop()
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://127.0.0.1:$port/")
    $listener.Start()
  }

  $script:fileTokens = @{}
  $script:pendingQueue = New-Object System.Collections.Queue
  $script:lastClientPollAt = [DateTime]::MinValue

  $script:appUrl = "http://127.0.0.1:$port/"
  $initialLaunchUrl = $script:appUrl
  if ($resolvedOpenFile) {
    $initTok = [Guid]::NewGuid().ToString('N')
    $script:fileTokens[$initTok] = $resolvedOpenFile
    $initialLaunchUrl = "http://127.0.0.1:$port/?openFileToken=$initTok"
  }
  $launchAt = Get-Date
  $browserProc = Open-AppWindow $script:browserExe $initialLaunchUrl $script:profileDir
  $serverExitRequested = $false

  # Optional system tray icon if browser handed off to an existing Edge process
  $tray = New-Object System.Windows.Forms.NotifyIcon
  $iconFile = Join-Path $installRoot 'app-icon.ico'
  if (Test-Path $iconFile) {
    try { $tray.Icon = New-Object System.Drawing.Icon($iconFile) } catch { $tray.Icon = [System.Drawing.SystemIcons]::Application }
  } else {
    $tray.Icon = [System.Drawing.SystemIcons]::Application
  }
  $trayLabel = "${safeName} v${safeVer}"
  if ($trayLabel.Length -gt 60) { $trayLabel = $trayLabel.Substring(0, 60) }
  $tray.Text = $trayLabel
  $menu = New-Object System.Windows.Forms.ContextMenuStrip
  $openItem = $menu.Items.Add('Open ${safeName}')
  $openItem.Add_Click({ Open-AppWindow $script:browserExe $script:appUrl $script:profileDir | Out-Null })
  $exitItem = $menu.Items.Add('Exit ${safeName}')
  $exitItem.Add_Click({ $script:serverExitRequested = $true })
  $tray.ContextMenuStrip = $menu
  $tray.Visible = $true

  $healthPayload = '{"status":"ok","runtime":"windows-offline","appId":"${appId}","version":"${safeVer}"}'

  try {
    while ($listener.IsListening -and -not $serverExitRequested) {
      [System.Windows.Forms.Application]::DoEvents()
      if ($browserProc -and $browserProc.HasExited) {
        if (((Get-Date) - $launchAt).TotalSeconds -ge 4) {
          break
        }
      }
      $async = $listener.BeginGetContext($null, $null)
      while (-not $async.AsyncWaitHandle.WaitOne(50)) {
        [System.Windows.Forms.Application]::DoEvents()
        if ($serverExitRequested) { break }
        if ($browserProc -and $browserProc.HasExited -and (((Get-Date) - $launchAt).TotalSeconds -ge 4)) {
          break
        }
      }
      if ($serverExitRequested) { break }
      if (-not $async.IsCompleted) { break }

      $ctx = $listener.EndGetContext($async)
      $req = $ctx.Request
      $res = $ctx.Response

      try {
        $rawPath = $req.Url.AbsolutePath
        if ($rawPath -eq '/api/health') {
          $json = [System.Text.Encoding]::UTF8.GetBytes($healthPayload)
          $res.ContentType = 'application/json; charset=utf-8'
          $res.ContentLength64 = $json.Length
          $res.OutputStream.Write($json, 0, $json.Length)
          $res.Close()
          continue
        }
        if ($rawPath -eq '/api/ip') {
          $json = [System.Text.Encoding]::UTF8.GetBytes('{"ip":"127.0.0.1"}')
          $res.ContentType = 'application/json; charset=utf-8'
          $res.ContentLength64 = $json.Length
          $res.OutputStream.Write($json, 0, $json.Length)
          $res.Close()
          continue
        }
        if ($rawPath -eq '/api/enqueue-file' -and $req.HttpMethod -eq 'POST') {
          $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
          $body = $reader.ReadToEnd() | ConvertFrom-Json
          $fp = ''
          if ($body -and $body.filePath) { $fp = [string]$body.filePath }
          if ($fp -and (Test-Path -LiteralPath $fp -PathType Leaf)) {
            $tok = [Guid]::NewGuid().ToString('N')
            $script:fileTokens[$tok] = $fp
            $script:pendingQueue.Enqueue($tok)
            $activeClient = (((Get-Date) - $script:lastClientPollAt).TotalSeconds -lt 2.5)
            $winPid = if ($browserProc -and -not $browserProc.HasExited) { $browserProc.Id } else { 0 }
            $winFocused = if ($activeClient) { Focus-AppWindow $winPid } else { $false }
            $respJson = (@{ ok = $true; token = $tok; hasActiveClient = $activeClient; windowFocused = $winFocused } | ConvertTo-Json -Compress)
            $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($respJson)
            $res.ContentType = 'application/json; charset=utf-8'
            $res.ContentLength64 = $jsonBytes.Length
            $res.OutputStream.Write($jsonBytes, 0, $jsonBytes.Length)
          } else {
            $res.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false,"error":"File not found"}')
            $res.ContentType = 'application/json; charset=utf-8'
            $res.ContentLength64 = $errBytes.Length
            $res.OutputStream.Write($errBytes, 0, $errBytes.Length)
          }
          $res.Close()
          continue
        }
        if ($rawPath -eq '/api/pending-file') {
          $script:lastClientPollAt = Get-Date
          if ($script:pendingQueue.Count -gt 0) {
            $nextTok = [string]$script:pendingQueue.Dequeue()
            $nextFp = [string]$script:fileTokens[$nextTok]
            $fname = if ($nextFp) { [System.IO.Path]::GetFileName($nextFp) } else { 'file.svga' }
            $respJson = (@{ hasFile = $true; token = $nextTok; fileName = $fname } | ConvertTo-Json -Compress)
          } else {
            $respJson = '{"hasFile":false}'
          }
          $jsonBytes = [System.Text.Encoding]::UTF8.GetBytes($respJson)
          $res.ContentType = 'application/json; charset=utf-8'
          $res.Headers.Add('Cache-Control', 'no-store')
          $res.ContentLength64 = $jsonBytes.Length
          $res.OutputStream.Write($jsonBytes, 0, $jsonBytes.Length)
          $res.Close()
          continue
        }
        if ($rawPath -eq '/api/open-file') {
          $tok = $req.QueryString['token']
          $targetFp = if ($tok -and $script:fileTokens.ContainsKey($tok)) { [string]$script:fileTokens[$tok] } else { '' }
          if (-not $targetFp -or -not (Test-Path -LiteralPath $targetFp -PathType Leaf)) {
            $res.StatusCode = 404
            $res.Close()
            continue
          }
          $fname = [System.IO.Path]::GetFileName($targetFp)
          $ext = [System.IO.Path]::GetExtension($targetFp)
          $res.ContentType = Get-MimeType $ext
          $res.Headers.Add('X-File-Name', [System.Uri]::EscapeDataString($fname))
          $res.Headers.Add('Access-Control-Expose-Headers', 'X-File-Name')
          $res.Headers.Add('Cache-Control', 'no-store')
          $fileBytes = [System.IO.File]::ReadAllBytes($targetFp)
          $res.ContentLength64 = $fileBytes.Length
          $res.OutputStream.Write($fileBytes, 0, $fileBytes.Length)
          $res.Close()
          continue
        }

        if ([string]::IsNullOrEmpty($rawPath) -or $rawPath -eq '/') {
          $rawPath = '/index.html'
        }
        $rel = [System.Uri]::UnescapeDataString($rawPath).TrimStart('/').Replace('/', '\\')
        $fullPath = [System.IO.Path]::GetFullPath((Join-Path $appDir $rel))
        $rootFull = [System.IO.Path]::GetFullPath($appDir)

        if (-not $fullPath.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
          $res.StatusCode = 403
          $res.Close()
          continue
        }
        if (-not (Test-Path $fullPath -PathType Leaf)) {
          $fullPath = Join-Path $appDir 'index.html'
        }

        $ext = [System.IO.Path]::GetExtension($fullPath)
        $res.ContentType = Get-MimeType $ext
        $bytes = [System.IO.File]::ReadAllBytes($fullPath)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        $res.Close()
      } catch {
        try { $res.StatusCode = 500; $res.Close() } catch {}
      }
    }
  } finally {
    $tray.Visible = $false
    $tray.Dispose()
    try { $listener.Stop() } catch {}
    try { $listener.Close() } catch {}
  }
} catch {
  $errText = $_.Exception.ToString()
  try { $errText | Out-File -FilePath $logFile -Encoding UTF8 } catch {}
  [System.Windows.Forms.MessageBox]::Show("Failed to start ${safeName} offline:\`r\`n$($_.Exception.Message)\`r\`nLog: $logFile", "${safeName} v${safeVer}", 0, 16) | Out-Null
}
`;
}

/**
 * Generates the native Windows GUI Setup Server (installer-server.ps1) that opens
 * installer.html in a frameless Edge/Chrome app window, supports native Windows
 * FolderBrowserDialog, copies the offline app bundle, creates isolated versioned
 * Desktop/StartMenu shortcuts, registers isolated Add/Remove Programs entries,
 * and optionally launches the installed app.
 */
export function generateWindowsInstallerServerPs1(opts: {
  brandTitle: string;
  appName: string;
  version: string;
  appId?: string;
  instanceTag?: string;
}): string {
  const cleanApp = sanitizeWindowsAppName(opts.appName, 'MotionTools');
  const cleanVer = sanitizeWindowsVersion(opts.version || WINDOWS_APP_VERSION, WINDOWS_APP_VERSION);
  const tagSlug = opts.instanceTag ? sanitizeWindowsAsciiSlug(opts.instanceTag, '') : '';
  const appId = (
    opts.appId || computeWindowsAppInstanceId(cleanApp, cleanVer, opts.instanceTag)
  ).replace(/'/g, "''");
  const defaultFolderName = (
    tagSlug ? `${cleanApp}-v${cleanVer}-${tagSlug}` : `${cleanApp}-v${cleanVer}`
  ).replace(/'/g, "''");
  const shortcutFileName = (
    tagSlug ? `${cleanApp} v${cleanVer} (${tagSlug}).lnk` : `${cleanApp} v${cleanVer}.lnk`
  ).replace(/'/g, "''");
  const safeBrand = opts.brandTitle.replace(/'/g, "''");
  const safeApp = cleanApp.replace(/'/g, "''");
  const safeVer = cleanVer.replace(/'/g, "''");

  return `# ${safeApp} v${safeVer} Windows Offline Setup Server
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$logFile = Join-Path $env:TEMP '${appId}-Setup.log'

try {
  $installerDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $packageRoot = Split-Path -Parent $installerDir
  $sourceAppDir = Join-Path $packageRoot 'app'
  $defaultInstallDir = Join-Path $env:LOCALAPPDATA ('Programs\\' + '${defaultFolderName}')

  if (-not (Test-Path $sourceAppDir)) {
    [System.Windows.Forms.MessageBox]::Show("لم يتم العثور على مجلد التطبيق (app) داخل الحزمة. يرجى التأكد من فك ضغط الملف بالكامل.\`r\`n$sourceAppDir", "${safeBrand} · ${safeApp}", 0, 16) | Out-Null
    exit 1
  }

  $tcp = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
  $tcp.Start()
  $port = $tcp.LocalEndpoint.Port
  $tcp.Stop()

  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Add("http://127.0.0.1:$port/")
  $listener.Start()

  $setupUrl = "http://127.0.0.1:$port/installer.html"

  $edgeCandidates = @(
    "\${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe",
    "\${env:ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe",
    "\${env:LocalAppData}\\Microsoft\\Edge\\Application\\msedge.exe",
    "\${env:ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe",
    "\${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe",
    "\${env:LocalAppData}\\Google\\Chrome\\Application\\chrome.exe"
  )
  foreach ($regKey in @(
    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe'
  )) {
    try {
      $p = (Get-ItemProperty -Path $regKey -ErrorAction SilentlyContinue).'(default)'
      if ($p) { $edgeCandidates += $p }
    } catch {}
  }
  $browserExe = $edgeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

  $uiProc = $null
  $setupProfile = Join-Path $env:TEMP "${appId}_SetupUI_$port"
  if ($browserExe) {
    $launchArgs = "--app=$setupUrl --window-size=680,655 --user-data-dir=""$setupProfile"" --no-first-run --no-default-browser-check"
    $uiProc = Start-Process -FilePath $browserExe -ArgumentList $launchArgs -PassThru
  } else {
    Start-Process $setupUrl | Out-Null
  }

  function Write-IcoFromPngBytes([byte[]]$pngBytes, [string]$outPath) {
    if (-not $pngBytes -or $pngBytes.Length -eq 0) { return }
    $header = New-Object byte[] (22 + $pngBytes.Length)
    $header[2] = 1
    $header[4] = 1
    $header[10] = 1
    $header[12] = 32
    $lenBytes = [System.BitConverter]::GetBytes([uint32]$pngBytes.Length)
    [Array]::Copy($lenBytes, 0, $header, 14, 4)
    $header[18] = 22
    [Array]::Copy($pngBytes, 0, $header, 22, $pngBytes.Length)
    [System.IO.File]::WriteAllBytes($outPath, $header)
  }

  function Send-Json($res, $obj, [int]$status = 200) {
    $json = ($obj | ConvertTo-Json -Compress -Depth 4)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $res.StatusCode = $status
    $res.ContentType = 'application/json; charset=utf-8'
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.Close()
  }

  function Expand-InstallPath([string]$raw) {
    if ([string]::IsNullOrWhiteSpace($raw)) { return $defaultInstallDir }
    $expanded = [System.Environment]::ExpandEnvironmentVariables($raw.Trim())
    $expanded = $expanded -replace '^C:\\\\Users\\\\%USERNAME%', $env:USERPROFILE
    return $expanded
  }

  function Pick-WindowsFolder([string]$initialPath) {
    $owner = New-Object System.Windows.Forms.Form
    $owner.TopMost = $true
    $owner.StartPosition = 'Manual'
    $owner.Location = New-Object System.Drawing.Point(-32000, -32000)
    $owner.Size = New-Object System.Drawing.Size(1, 1)
    $owner.ShowInTaskbar = $false
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = 'اختر مجلد التثبيت'
    $dlg.ShowNewFolderButton = $true
    if ($initialPath -and (Test-Path $initialPath)) {
      $dlg.SelectedPath = $initialPath
    }
    try {
      if ($dlg.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
        return $dlg.SelectedPath
      }
      return $null
    } finally {
      $dlg.Dispose()
      $owner.Dispose()
    }
  }

  $startupAt = Get-Date
  $lastPingAt = $null
  $uiExitedAt = $null
  $shouldClose = $false

  try {
    while ($listener.IsListening -and -not $shouldClose) {
      $now = Get-Date
      if ($uiProc -and $uiProc.HasExited) {
        if (-not $uiExitedAt) { $uiExitedAt = $now }
        if (($uiExitedAt - $startupAt).TotalSeconds -ge 4) { break }
      }
      if ($lastPingAt -and ($now - $lastPingAt).TotalSeconds -gt 20) {
        break
      }
      if (-not $lastPingAt -and ($now - $startupAt).TotalSeconds -gt 120) {
        break
      }

      $async = $listener.BeginGetContext($null, $null)
      while (-not $async.AsyncWaitHandle.WaitOne(350)) {
        $nowWait = Get-Date
        if ($uiProc -and $uiProc.HasExited) {
          if (-not $uiExitedAt) { $uiExitedAt = $nowWait }
          if (($uiExitedAt - $startupAt).TotalSeconds -ge 4) { break }
        }
        if ($lastPingAt -and ($nowWait - $lastPingAt).TotalSeconds -gt 20) {
          break
        }
        if (-not $lastPingAt -and ($nowWait - $startupAt).TotalSeconds -gt 120) {
          break
        }
      }
      if (-not $async.IsCompleted) { break }

      $ctx = $listener.EndGetContext($async)
      $req = $ctx.Request
      $res = $ctx.Response

      try {
        $path = $req.Url.AbsolutePath

        if ($path -eq '/api/ping') {
          $lastPingAt = Get-Date
          Send-Json $res @{ ok = $true }
          continue
        }

        if ($path -eq '/api/default-info') {
          $lastPingAt = Get-Date
          Send-Json $res @{ defaultInstallDir = $defaultInstallDir; version = '${safeVer}' }
          continue
        }

        if ($path -eq '/api/browse-folder' -and $req.HttpMethod -eq 'POST') {
          $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
          $body = $reader.ReadToEnd() | ConvertFrom-Json
          $cur = Expand-InstallPath $body.currentPath
          $chosen = Pick-WindowsFolder $cur
          $lastPingAt = Get-Date
          if ($chosen) {
            if (-not $chosen.EndsWith('${defaultFolderName}', [System.StringComparison]::OrdinalIgnoreCase)) {
              $chosen = Join-Path $chosen '${defaultFolderName}'
            }
            Send-Json $res @{ path = $chosen }
          } else {
            Send-Json $res @{ path = $null }
          }
          continue
        }

        if ($path -eq '/api/install' -and $req.HttpMethod -eq 'POST') {
          $lastPingAt = Get-Date
          $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
          $payload = $reader.ReadToEnd() | ConvertFrom-Json
          $targetDir = Expand-InstallPath $payload.installDir
          $targetAppDir = Join-Path $targetDir 'app'

          if (-not (Test-Path $sourceAppDir)) {
            Send-Json $res @{ ok = $false; error = 'مجلد ملفات التطبيق غير موجود داخل الحزمة' } 500
            continue
          }

          if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
          if (Test-Path $targetAppDir) { Remove-Item -Path $targetAppDir -Recurse -Force }
          Copy-Item -Path $sourceAppDir -Destination $targetAppDir -Recurse -Force

          # Copy offline runtime server, silent VBS launcher, icon, and uninstaller
          Copy-Item -Path (Join-Path $installerDir 'MotionTools-Offline.ps1') -Destination (Join-Path $targetDir 'MotionTools-Offline.ps1') -Force
          Copy-Item -Path (Join-Path $installerDir 'MotionTools.vbs') -Destination (Join-Path $targetDir 'MotionTools.vbs') -Force
          Copy-Item -Path (Join-Path $installerDir 'Uninstall-MotionTools.bat') -Destination (Join-Path $targetDir 'Uninstall-MotionTools.bat') -Force

          $iconSrc = Join-Path $installerDir 'app-icon.ico'
          $iconDst = Join-Path $targetDir 'app-icon.ico'
          if (Test-Path $iconSrc) { Copy-Item -Path $iconSrc -Destination $iconDst -Force }

          # Dedicated SVGA File Icon (separate from app/site logo!)
          $fileIconSrc = Join-Path $installerDir 'svga-file-icon.ico'
          $fileIconDst = Join-Path $targetDir 'svga-file-icon.ico'
          if ($payload.customFileIconPngBase64 -and -not [string]::IsNullOrWhiteSpace([string]$payload.customFileIconPngBase64)) {
            try {
              $customPng = [Convert]::FromBase64String([string]$payload.customFileIconPngBase64)
              Write-IcoFromPngBytes $customPng $fileIconDst
            } catch {}
          }
          if (-not (Test-Path $fileIconDst)) {
            if (Test-Path $fileIconSrc) {
              Copy-Item -Path $fileIconSrc -Destination $fileIconDst -Force
            } elseif (Test-Path $iconDst) {
              Copy-Item -Path $iconDst -Destination $fileIconDst -Force
            }
          }

          $wscriptExe = Join-Path $env:WINDIR 'System32\\wscript.exe'
          $vbsTarget = Join-Path $targetDir 'MotionTools.vbs'
          $wsShell = New-Object -ComObject WScript.Shell

          # Versioned Start Menu Shortcut
          $startMenuDir = Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'
          if (-not (Test-Path $startMenuDir)) { New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null }
          $smShortcut = $wsShell.CreateShortcut((Join-Path $startMenuDir '${shortcutFileName}'))
          $smShortcut.TargetPath = $wscriptExe
          $smShortcut.Arguments = """$vbsTarget"""
          $smShortcut.WorkingDirectory = $targetDir
          $smShortcut.Description = '${safeBrand} - ${safeApp} (v${safeVer})'
          if (Test-Path $iconDst) { $smShortcut.IconLocation = "$iconDst,0" }
          $smShortcut.Save()

          # Versioned Desktop Shortcut
          if ($payload.desktopShortcut -eq $true) {
            $desktopDir = [Environment]::GetFolderPath('Desktop')
            $deskShortcut = $wsShell.CreateShortcut((Join-Path $desktopDir '${shortcutFileName}'))
            $deskShortcut.TargetPath = $wscriptExe
            $deskShortcut.Arguments = """$vbsTarget"""
            $deskShortcut.WorkingDirectory = $targetDir
            $deskShortcut.Description = '${safeBrand} - ${safeApp} (v${safeVer})'
            if (Test-Path $iconDst) { $deskShortcut.IconLocation = "$iconDst,0" }
            $deskShortcut.Save()
          }

          # Register isolated entry per appId in Windows Installed Apps (HKCU)
          $regPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appId}'
          if (-not (Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }
          Set-ItemProperty -Path $regPath -Name 'DisplayName' -Value '${safeBrand} · ${safeApp} (v${safeVer})'
          Set-ItemProperty -Path $regPath -Name 'DisplayVersion' -Value '${safeVer}'
          Set-ItemProperty -Path $regPath -Name 'Publisher' -Value '${safeBrand}'
          Set-ItemProperty -Path $regPath -Name 'InstallLocation' -Value $targetDir
          Set-ItemProperty -Path $regPath -Name 'UninstallString' -Value ("""$(Join-Path $targetDir 'Uninstall-MotionTools.bat')""")
          if (Test-Path $iconDst) { Set-ItemProperty -Path $regPath -Name 'DisplayIcon' -Value $iconDst }

          # Register Windows File Associations so .svga files display the dedicated File Logo icon
          # (svga-file-icon.ico, independent from app-icon.ico) and double-clicking opens directly in #convert.
          if ($payload.associateFiles -ne $false) {
            try {
              $progId = '${appId}.File'
              $classesRoot = 'HKCU:\\Software\\Classes'
              $progKey = Join-Path $classesRoot $progId
              $openCmd = ('"' + $wscriptExe + '" "' + $vbsTarget + '" "%1"')
              $activeFileIcon = if (Test-Path $fileIconDst) { $fileIconDst } else { $iconDst }

              New-Item -Path $progKey -Force | Out-Null
              Set-ItemProperty -Path $progKey -Name '(default)' -Value '${safeBrand} · ${safeApp} Animation'
              Set-ItemProperty -Path $progKey -Name 'FriendlyTypeName' -Value '${safeBrand} · ${safeApp}'

              $appMetaKey = Join-Path $progKey 'Application'
              New-Item -Path $appMetaKey -Force | Out-Null
              Set-ItemProperty -Path $appMetaKey -Name 'ApplicationName' -Value '${safeBrand} · ${safeApp}'
              Set-ItemProperty -Path $appMetaKey -Name 'ApplicationDescription' -Value 'تشغيل ومعالجة ملفات SVGA والرسوم المتحركة'
              if (Test-Path $activeFileIcon) {
                Set-ItemProperty -Path $appMetaKey -Name 'ApplicationIcon' -Value "$activeFileIcon,0"
                $defIconKey = Join-Path $progKey 'DefaultIcon'
                New-Item -Path $defIconKey -Force | Out-Null
                Set-ItemProperty -Path $defIconKey -Name '(default)' -Value "$activeFileIcon,0"
              }

              $shellOpenKey = Join-Path $progKey 'shell\\open'
              New-Item -Path $shellOpenKey -Force | Out-Null
              Set-ItemProperty -Path $shellOpenKey -Name '(default)' -Value 'فتح في ${safeApp}'
              if (Test-Path $activeFileIcon) {
                Set-ItemProperty -Path $shellOpenKey -Name 'Icon' -Value "$activeFileIcon,0"
              }
              $cmdKey = Join-Path $shellOpenKey 'command'
              New-Item -Path $cmdKey -Force | Out-Null
              Set-ItemProperty -Path $cmdKey -Name '(default)' -Value $openCmd

              # Primary ownership: change .svga & .motiontools icons directly to the dedicated File Logo
              foreach ($primaryExt in @(${WINDOWS_PRIMARY_OWNED_EXTENSIONS.map((e) => `'${e}'`).join(', ')})) {
                $extKey = Join-Path $classesRoot $primaryExt
                New-Item -Path $extKey -Force | Out-Null
                Set-ItemProperty -Path $extKey -Name '(default)' -Value $progId
                if (Test-Path $activeFileIcon) {
                  $extIconKey = Join-Path $extKey 'DefaultIcon'
                  New-Item -Path $extIconKey -Force | Out-Null
                  Set-ItemProperty -Path $extIconKey -Name '(default)' -Value "$activeFileIcon,0"
                }
                $owpKey = Join-Path $extKey 'OpenWithProgids'
                New-Item -Path $owpKey -Force | Out-Null
                New-ItemProperty -Path $owpKey -Name $progId -Value '' -PropertyType String -Force | Out-Null
              }

              # Register OpenWithProgids for all supported motion & media formats
              foreach ($anyExt in @(${WINDOWS_OPEN_WITH_EXTENSIONS.map((e) => `'${e}'`).join(', ')})) {
                $extKey = Join-Path $classesRoot $anyExt
                $owpKey = Join-Path $extKey 'OpenWithProgids'
                New-Item -Path $owpKey -Force | Out-Null
                New-ItemProperty -Path $owpKey -Name $progId -Value '' -PropertyType String -Force | Out-Null
              }

              # Notify Windows Explorer immediately to refresh .svga file icons
              Add-Type -Namespace Win32ShellNotify -Name Native -MemberDefinition '[System.Runtime.InteropServices.DllImport("shell32.dll")] public static extern void SHChangeNotify(uint wEventId, uint uFlags, System.IntPtr dwItem1, System.IntPtr dwItem2);' -ErrorAction SilentlyContinue
              [Win32ShellNotify.Native]::SHChangeNotify(0x08000000, 0x0000, [IntPtr]::Zero, [IntPtr]::Zero)
            } catch {}
          }

          if ($payload.launchAfterInstall -eq $true) {
            Start-Process -FilePath $wscriptExe -ArgumentList """$vbsTarget"""
          }

          $lastPingAt = Get-Date
          Send-Json $res @{ ok = $true; installDir = $targetDir; shortcut = '${shortcutFileName}' }
          continue
        }

        if ($path -eq '/api/close') {
          $shouldClose = $true
          Send-Json $res @{ ok = $true }
          continue
        }

        if ($path -eq '/logo.png') {
          $logoFile = Join-Path $installerDir 'logo.png'
          if (Test-Path $logoFile) {
            $bytes = [System.IO.File]::ReadAllBytes($logoFile)
            $res.ContentType = 'image/png'
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
          }
        }

        if ($path -eq '/file-logo.png') {
          $fileLogo = Join-Path $installerDir 'file-logo.png'
          if (-not (Test-Path $fileLogo)) { $fileLogo = Join-Path $installerDir 'logo.png' }
          if (Test-Path $fileLogo) {
            $bytes = [System.IO.File]::ReadAllBytes($fileLogo)
            $res.ContentType = 'image/png'
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
          }
        }

        if ($path -eq '/app-icon.ico') {
          $icoFile = Join-Path $installerDir 'app-icon.ico'
          if (Test-Path $icoFile) {
            $bytes = [System.IO.File]::ReadAllBytes($icoFile)
            $res.ContentType = 'image/x-icon'
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            $res.Close()
            continue
          }
        }

        $htmlFile = Join-Path $installerDir 'installer.html'
        $htmlBytes = [System.IO.File]::ReadAllBytes($htmlFile)
        $res.ContentType = 'text/html; charset=utf-8'
        $res.ContentLength64 = $htmlBytes.Length
        $res.OutputStream.Write($htmlBytes, 0, $htmlBytes.Length)
        $res.Close()
      } catch {
        try { Send-Json $res @{ ok = $false; error = $_.Exception.Message } 500 } catch {}
      }
    }
  } finally {
    try { $listener.Stop() } catch {}
    try { $listener.Close() } catch {}
    if (Test-Path $setupProfile) {
      try { Remove-Item -Path $setupProfile -Recurse -Force -ErrorAction SilentlyContinue } catch {}
    }
  }
} catch {
  $errText = $_.Exception.ToString()
  try { $errText | Out-File -FilePath $logFile -Encoding UTF8 } catch {}
  [System.Windows.Forms.MessageBox]::Show("تعذر فتح مثبّت التطبيق:\`r\`n$($_.Exception.Message)\`r\`nLog: $logFile", "${safeBrand} · ${safeApp}", 0, 16) | Out-Null
}
`;
}

export function generateSetupBatchScript(opts?: {
  zipFileName?: string;
  batFileName?: string;
  appName?: string;
}): string {
  const zipName = opts?.zipFileName || WINDOWS_INSTALLER_ZIP_NAME;
  const batName = opts?.batFileName || WINDOWS_SETUP_BAT_NAME;
  const appLabel = sanitizeWindowsAsciiSlug(opts?.appName || 'MotionTools', 'MotionTools');
  return (
    '@echo off\r\n' +
    'setlocal\r\n' +
    'chcp 65001 >nul\r\n' +
    'set "ROOT_DIR=%~dp0"\r\n' +
    'set "PS_SCRIPT=%ROOT_DIR%installer\\installer-server.ps1"\r\n' +
    'set "PS_EXE=%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"\r\n' +
    'if not exist "%PS_EXE%" set "PS_EXE=powershell.exe"\r\n' +
    'if not exist "%PS_SCRIPT%" (\r\n' +
    `  echo [${appLabel}] Error: Please extract ${zipName} completely before running ${batName}.\r\n` +
    '  pause\r\n' +
    '  exit /b 1\r\n' +
    ')\r\n' +
    'start "" /min "%PS_EXE%" -STA -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%PS_SCRIPT%"\r\n'
  );
}

async function fetchOfflineBundleManifest(): Promise<{
  manifest: OfflineManifest;
  basePrefix: string;
}> {
  // 1. In Vite dev mode, /api/windows-offline-manifest builds/serves dist/
  try {
    const devRes = await fetch('/api/windows-offline-manifest');
    if (devRes.ok) {
      const contentType = devRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = (await devRes.json()) as OfflineManifest;
        if (data && Array.isArray(data.files) && data.files.length > 0) {
          return { manifest: data, basePrefix: '/__offline_dist__/' };
        }
      }
    }
  } catch {
    // Fall through to production manifest
  }

  // 2. In production (dist/), offline-manifest.json is served directly at ./offline-manifest.json
  const prodRes = await fetch('./offline-manifest.json');
  if (prodRes.ok) {
    const data = (await prodRes.json()) as OfflineManifest;
    if (data && Array.isArray(data.files) && data.files.length > 0) {
      return { manifest: data, basePrefix: './' };
    }
  }

  throw new Error('Could not load offline application manifest.');
}

function injectOfflineBrandingIntoIndexHtml(
  rawHtml: string,
  branding: {
    appName: string;
    brandTitle: string;
    version: string;
    hasCustomAppLogo: boolean;
    appLogoPath: string;
  }
): string {
  const safeTitle = `${escapeHtml(branding.appName)} v${escapeHtml(branding.version)} — ${escapeHtml(branding.brandTitle)}`;
  let html = rawHtml.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  const payloadJson = JSON.stringify(branding).replace(/</g, '\\u003c');
  const scriptTag = `<script>window.__MOTIONTOOLS_DESKTOP_BRANDING__=${payloadJson};</script>`;
  if (html.includes('</head>')) {
    html = html.replace('</head>', `  ${scriptTag}\n</head>`);
  } else {
    html = `${scriptTag}\n${html}`;
  }
  return html;
}

/**
 * Packages the complete MotionTools application + Windows GUI Installer + Offline Server
 * into a downloadable self-contained ZIP tailored with custom app logo, Windows icon,
 * installer UI logo, app name, and isolated version identifier.
 */
export async function buildAndDownloadWindowsInstallerPackage(
  options: WindowsInstallerBuildOptions
): Promise<{ fileName: string; setupBatName: string; fileCount: number }> {
  const {
    brandTitle = 'Ahmed Pro SVGA',
    appName = 'MotionTools',
    logoUrl,
    appLogoUrl,
    windowsIconLogoUrl,
    installerUiLogoUrl,
    svgaFileIconLogoUrl,
    subtitle,
    instanceTag,
    installDir,
    createDesktopShortcut = true,
    launchAfterInstall = true,
    associateFiles = true,
    version = WINDOWS_APP_VERSION,
    onProgress,
  } = options;

  const cleanAppName = sanitizeWindowsAppName(appName, 'MotionTools');
  const cleanBrandTitle = sanitizeWindowsAppName(brandTitle, 'Ahmed Pro SVGA');
  const cleanVersion = sanitizeWindowsVersion(version, WINDOWS_APP_VERSION);
  const cleanTag = instanceTag ? sanitizeWindowsAsciiSlug(instanceTag, '') : '';
  const appId = computeWindowsAppInstanceId(cleanAppName, cleanVersion, cleanTag);
  const preferredPort = computePreferredLoopbackPort(appId);
  const resolvedInstallDir =
    installDir && installDir.trim()
      ? installDir.trim()
      : getDefaultWindowsInstallPath(cleanAppName, cleanVersion, cleanTag);
  const zipFileName = formatWindowsInstallerZipName(cleanAppName, cleanVersion, cleanTag);
  const setupBatName = formatWindowsSetupBatName(cleanAppName);
  const shortcutFileName = cleanTag
    ? `${cleanAppName} v${cleanVersion} (${cleanTag}).lnk`
    : `${cleanAppName} v${cleanVersion}.lnk`;

  onProgress?.(6, 'جاري تحضير حزمة ملفات التطبيق الأوفلاين...', 'Preparing offline application bundle...');

  const { manifest, basePrefix } = await fetchOfflineBundleManifest();
  const zip = new JSZip();

  onProgress?.(14, 'جاري تجهيز أيقونة الويندوز وشعار التطبيق ولوجو ملفات SVGA...', 'Generating app, Windows & SVGA file icons...');
  const [uiLogoResolved, winIconResolved, appLogoResolved, fileIconResolved] = await Promise.all([
    resolveLogoPngAndIco(installerUiLogoUrl, logoUrl),
    resolveLogoPngAndIco(windowsIconLogoUrl, installerUiLogoUrl || logoUrl),
    resolveLogoPngAndIco(appLogoUrl, installerUiLogoUrl || logoUrl),
    resolveLogoPngAndIco(svgaFileIconLogoUrl, windowsIconLogoUrl || installerUiLogoUrl || logoUrl),
  ]);

  const hasCustomAppLogo = Boolean(
    (appLogoUrl && appLogoUrl.trim()) ||
      (logoUrl && logoUrl.trim() && logoUrl.trim() !== './logo.png')
  );
  const hasCustomFileLogo = Boolean(svgaFileIconLogoUrl && svgaFileIconLogoUrl.trim());

  // 1. Installer UI + PowerShell Setup Server + Runtime files (UTF-8 BOM on .ps1)
  const installerFolder = zip.folder('installer')!;
  installerFolder.file(
    'installer.html',
    generateWindowsInstallerHtml({
      brandTitle: cleanBrandTitle,
      appName: cleanAppName,
      subtitle,
      installDir: resolvedInstallDir,
      createDesktopShortcut,
      launchAfterInstall,
      associateFiles,
      version: cleanVersion,
      hasLogo: Boolean(uiLogoResolved.pngBytes),
      hasFileLogo: Boolean(hasCustomFileLogo && fileIconResolved.pngBytes),
      hasIcon: Boolean(winIconResolved.icoBytes),
    })
  );
  installerFolder.file(
    'installer-server.ps1',
    encodeUtf8WithBom(
      generateWindowsInstallerServerPs1({
        brandTitle: cleanBrandTitle,
        appName: cleanAppName,
        version: cleanVersion,
        appId,
        instanceTag: cleanTag,
      })
    )
  );
  installerFolder.file(
    'MotionTools-Offline.ps1',
    encodeUtf8WithBom(
      generateOfflineRuntimePs1({
        appName: cleanAppName,
        version: cleanVersion,
        appId,
        preferredPort,
      })
    )
  );
  installerFolder.file(
    'MotionTools.vbs',
    'Set objShell = CreateObject("WScript.Shell")\r\n' +
      'strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)\r\n' +
      'strArgs = ""\r\n' +
      'If WScript.Arguments.Count > 0 Then\r\n' +
      '  strFile = Replace(WScript.Arguments(0), """", """""")\r\n' +
      '  strArgs = " -OpenFile """ & strFile & """"\r\n' +
      'End If\r\n' +
      'objShell.Run "powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & strPath & "\\MotionTools-Offline.ps1""" & strArgs, 0, False\r\n'
  );
  installerFolder.file(
    'Uninstall-MotionTools.bat',
    '@echo off\r\n' +
      'chcp 65001 >nul\r\n' +
      `echo Uninstalling ${cleanAppName} v${cleanVersion}...\r\n` +
      `del /f /q "%USERPROFILE%\\Desktop\\${shortcutFileName}" 2>nul\r\n` +
      `del /f /q "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\${shortcutFileName}" 2>nul\r\n` +
      `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appId}" /f 2>nul\r\n` +
      `reg delete "HKCU\\Software\\Classes\\${appId}.File" /f 2>nul\r\n` +
      WINDOWS_OPEN_WITH_EXTENSIONS.map(
        (ext) => `reg delete "HKCU\\Software\\Classes\\${ext}\\OpenWithProgids" /v "${appId}.File" /f 2>nul\r\n`
      ).join('') +
      'set "APP_DIR=%~dp0"\r\n' +
      `echo ${cleanAppName} v${cleanVersion} uninstalled successfully.\r\n` +
      'timeout /t 2 >nul\r\n' +
      'start /b "" cmd /c "timeout /t 1 >nul & rmdir /s /q ""%APP_DIR%"""\r\n'
  );

  if (uiLogoResolved.pngBytes) installerFolder.file('logo.png', uiLogoResolved.pngBytes);
  if (winIconResolved.icoBytes) installerFolder.file('app-icon.ico', winIconResolved.icoBytes);
  if (fileIconResolved.pngBytes) installerFolder.file('file-logo.png', fileIconResolved.pngBytes);
  if (fileIconResolved.icoBytes) installerFolder.file('svga-file-icon.ico', fileIconResolved.icoBytes);

  // 2. Root one-click Windows Setup Launcher (`Setup-<App>.bat`)
  const setupBatContent = generateSetupBatchScript({
    zipFileName,
    batFileName: setupBatName,
    appName: cleanAppName,
  });
  zip.file(setupBatName, setupBatContent);
  zip.file(
    'README-WINDOWS.txt',
    `========================================================\r\n` +
      `  ${cleanBrandTitle} · ${cleanAppName} (Windows x64 Offline v${cleanVersion})\r\n` +
      `  Instance ID: ${appId} | Port: ${preferredPort}\r\n` +
      `========================================================\r\n\r\n` +
      `1. Extract this entire ZIP folder (${zipFileName}) anywhere on your PC.\r\n` +
      `2. Double-click "${setupBatName}".\r\n` +
      `3. The graphical setup window will open — choose the install folder and click "تثبيت التطبيق".\r\n` +
      `4. Once installed, the app runs 100% OFFLINE from Desktop (${shortcutFileName}) or Start Menu!\r\n`
  );

  // 3. Bundle all built web app files inside app/
  const appFolder = zip.folder('app')!;
  const files = manifest.files;
  let completed = 0;

  const customLogoTargetFiles = new Set([
    'logo.png',
    'pwa-192x192.png',
    'pwa-512x512.png',
    'pwa-maskable-512x512.png',
    'favicon-32x32.png',
    'apple-touch-icon.png',
  ]);

  if (appLogoResolved.pngBytes) {
    appFolder.file('desktop-app-logo.png', appLogoResolved.pngBytes);
  }
  if (winIconResolved.icoBytes) {
    appFolder.file('favicon.ico', winIconResolved.icoBytes);
  }

  // Fetch in small parallel batches for fast packaging without saturating browser connections
  const batchSize = 8;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (relPath) => {
        const cleanRel = relPath.replace(/^\/+/, '');
        if (cleanRel === 'index.html') {
          const res = await fetch(`${basePrefix}${cleanRel}`);
          if (!res.ok) throw new Error(`Failed to bundle asset: ${cleanRel}`);
          const rawHtml = await res.text();
          const brandedHtml = injectOfflineBrandingIntoIndexHtml(rawHtml, {
            appName: cleanAppName,
            brandTitle: cleanBrandTitle,
            version: cleanVersion,
            hasCustomAppLogo: Boolean(appLogoResolved.pngBytes && hasCustomAppLogo),
            appLogoPath: './desktop-app-logo.png',
          });
          appFolder.file(cleanRel, brandedHtml);
        } else if (hasCustomAppLogo && appLogoResolved.pngBytes && customLogoTargetFiles.has(cleanRel)) {
          appFolder.file(cleanRel, appLogoResolved.pngBytes);
        } else {
          const res = await fetch(`${basePrefix}${cleanRel}`);
          if (!res.ok) {
            throw new Error(`Failed to bundle asset: ${cleanRel}`);
          }
          const buf = await res.arrayBuffer();
          appFolder.file(cleanRel, buf);
        }

        completed++;
        const pct = 18 + Math.round((completed / files.length) * 62);
        onProgress?.(
          pct,
          `جاري تجميع ملفات النسخة الأوفلاين (${completed}/${files.length})...`,
          `Bundling offline files (${completed}/${files.length})...`
        );
      })
    );
  }

  onProgress?.(85, 'جاري ضغط حزمة التثبيت للويندوز (.zip)...', 'Compressing Windows setup package...');
  const blob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (meta) => {
      const pct = 85 + Math.round((meta.percent / 100) * 14);
      onProgress?.(
        Math.min(99, pct),
        `جاري إنشاء ملف التثبيت (${Math.round(meta.percent)}%)...`,
        `Creating installer archive (${Math.round(meta.percent)}%)...`
      );
    }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  onProgress?.(
    100,
    '✅ تم تنزيل حزمة المثبت الأوفلاين بنجاح!',
    '✅ Offline Windows installer package downloaded!'
  );

  return { fileName: zipFileName, setupBatName, fileCount: files.length };
}
