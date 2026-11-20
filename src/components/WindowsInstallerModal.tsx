import React, { useState, useEffect, useRef } from 'react';
import {
  PlatformSettings,
  UserAccount,
  canDownloadWindowsInstaller,
  sanitizeSiteLogoUrl,
  sanitizeSiteName,
  verifyWindowsDownloadPassword,
} from '../utils/platformStore';
import {
  WINDOWS_APP_VERSION,
  buildAndDownloadWindowsInstallerPackage,
  formatWindowsInstallerZipName,
  formatWindowsSetupBatName,
  getDefaultWindowsInstallPath,
  sanitizeWindowsAppName,
  sanitizeWindowsVersion,
} from '../utils/windowsInstallerBuilder';

const WINDOWS_BUILD_DRAFT_KEY = 'motiontools_windows_build_draft_v1';

interface WindowsBuildDraft {
  brandTitle: string;
  appName: string;
  version: string;
  subtitle: string;
  instanceTag: string;
  unifiedLogo: string;
  appLogo: string;
  windowsIconLogo: string;
  installerUiLogo: string;
  svgaFileIconLogo: string;
}

interface WindowsInstallerModalProps {
  open: boolean;
  onClose: () => void;
  currentUser: UserAccount | null;
  adminPreviewRole: 'actual' | 'free_user' | 'pro_user';
  settings: PlatformSettings;
  isAr: boolean;
}

function readImageFileAsPngDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const size = 256;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(String(reader.result || ''));
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
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(String(reader.result || ''));
        }
      };
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function bumpPatchVersion(ver: string): string {
  const clean = (ver || WINDOWS_APP_VERSION).trim();
  const match = clean.match(/^(.*?)(\d+)([^\d]*)$/);
  if (!match) return `${clean}.1`;
  const nextNum = parseInt(match[2], 10) + 1;
  return `${match[1]}${nextNum}${match[3]}`;
}

export default function WindowsInstallerModal({
  open,
  onClose,
  currentUser,
  adminPreviewRole,
  settings,
  isAr,
}: WindowsInstallerModalProps) {
  const cleanSiteName = sanitizeSiteName(settings.siteName, 'Ahmed Pro SVGA');
  const defaultBrand = cleanSiteName === 'MotionTools' ? 'Ahmed Pro SVGA' : cleanSiteName;
  const siteLogoFallback = sanitizeSiteLogoUrl(settings.siteLogoUrl) || './logo.png';

  const loadInitialDraft = (): WindowsBuildDraft => {
    try {
      const raw = localStorage.getItem(WINDOWS_BUILD_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WindowsBuildDraft>;
        return {
          brandTitle: parsed.brandTitle || defaultBrand,
          appName: parsed.appName || 'MotionTools',
          version: parsed.version || WINDOWS_APP_VERSION,
          subtitle: parsed.subtitle || 'تطبيق ويندوز لمعالجة وتحويل ملفات الحركة',
          instanceTag: parsed.instanceTag || '',
          unifiedLogo: parsed.unifiedLogo || '',
          appLogo: parsed.appLogo || '',
          windowsIconLogo: parsed.windowsIconLogo || '',
          installerUiLogo: parsed.installerUiLogo || '',
          svgaFileIconLogo: parsed.svgaFileIconLogo || '',
        };
      }
    } catch {
      // Ignore storage errors
    }
    return {
      brandTitle: defaultBrand,
      appName: 'MotionTools',
      version: WINDOWS_APP_VERSION,
      subtitle: 'تطبيق ويندوز لمعالجة وتحويل ملفات الحركة',
      instanceTag: '',
      unifiedLogo: '',
      appLogo: '',
      windowsIconLogo: '',
      installerUiLogo: '',
      svgaFileIconLogo: '',
    };
  };

  const [draft, setDraft] = useState<WindowsBuildDraft>(loadInitialDraft);
  const [installDir, setInstallDir] = useState<string>(() =>
    getDefaultWindowsInstallPath(draft.appName, draft.version, draft.instanceTag)
  );
  const [hasCustomInstallDir, setHasCustomInstallDir] = useState<boolean>(false);
  const [showSeparateLogos, setShowSeparateLogos] = useState<boolean>(false);
  const [createDesktopShortcut, setCreateDesktopShortcut] = useState<boolean>(true);
  const [launchAfterInstall, setLaunchAfterInstall] = useState<boolean>(true);
  const [associateFiles, setAssociateFiles] = useState<boolean>(true);
  const [isBuilding, setIsBuilding] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [downloadedInfo, setDownloadedInfo] = useState<{
    fileName: string;
    setupBatName: string;
    fileCount: number;
  } | null>(null);
  const [isPasswordUnlocked, setIsPasswordUnlocked] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [passwordError, setPasswordError] = useState<string>('');

  const passwordFieldRef = useRef<HTMLInputElement>(null);
  const unifiedLogoInputRef = useRef<HTMLInputElement>(null);
  const appLogoInputRef = useRef<HTMLInputElement>(null);
  const winIconInputRef = useRef<HTMLInputElement>(null);
  const uiLogoInputRef = useRef<HTMLInputElement>(null);
  const fileIconInputRef = useRef<HTMLInputElement>(null);

  // Persist draft edits
  useEffect(() => {
    try {
      localStorage.setItem(WINDOWS_BUILD_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Ignore quota errors
    }
  }, [draft]);

  // Keep installDir synced automatically with App Name + Version + InstanceTag unless manually overridden
  useEffect(() => {
    if (!hasCustomInstallDir) {
      setInstallDir(getDefaultWindowsInstallPath(draft.appName, draft.version, draft.instanceTag));
    }
  }, [draft.appName, draft.version, draft.instanceTag, hasCustomInstallDir]);

  useEffect(() => {
    if (open) {
      setErrorMsg('');
      if (!isBuilding) {
        setProgress(0);
        setStatusMessage('');
        setDownloadedInfo(null);
        setIsPasswordUnlocked(false);
        setPasswordInput('');
        setShowPassword(false);
        setPasswordError('');
        setTimeout(() => {
          passwordFieldRef.current?.focus();
        }, 50);
      }
    } else if (!isBuilding) {
      setIsPasswordUnlocked(false);
      setPasswordInput('');
      setPasswordError('');
    }
  }, [open, isBuilding]);

  // Strict security gate: never render for non-admins or preview roles
  if (!open || !canDownloadWindowsInstaller(currentUser, adminPreviewRole)) {
    return null;
  }

  const effectiveBrandTitle = sanitizeWindowsAppName(draft.brandTitle, defaultBrand);
  const effectiveAppName = sanitizeWindowsAppName(draft.appName, 'MotionTools');
  const effectiveVersion = sanitizeWindowsVersion(draft.version, WINDOWS_APP_VERSION);
  const effectiveBaseLogo = draft.unifiedLogo || siteLogoFallback;
  const effectiveAppLogo = draft.appLogo || effectiveBaseLogo;
  const effectiveWindowsIconLogo = draft.windowsIconLogo || effectiveBaseLogo;
  const effectiveInstallerUiLogo = draft.installerUiLogo || effectiveBaseLogo;
  const effectiveSvgaFileIconLogo = draft.svgaFileIconLogo || effectiveWindowsIconLogo;
  const previewZipName = formatWindowsInstallerZipName(
    effectiveAppName,
    effectiveVersion,
    draft.instanceTag
  );
  const previewBatName = formatWindowsSetupBatName(effectiveAppName);

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyWindowsDownloadPassword(passwordInput)) {
      setPasswordError('');
      setIsPasswordUnlocked(true);
    } else {
      setPasswordError(
        isAr
          ? 'كلمة السر غير صحيحة! يرجى إدخال كلمة سر التنزيل الصحيحة.'
          : 'Incorrect password! Please enter the valid download password.'
      );
    }
  };

  const handleLogoUpload = async (
    target: 'unified' | 'app' | 'windows' | 'ui' | 'file',
    file?: File | null
  ) => {
    if (!file) return;
    try {
      const pngDataUrl = await readImageFileAsPngDataUrl(file);
      setDraft((prev) => {
        if (target === 'unified') {
          return {
            ...prev,
            unifiedLogo: pngDataUrl,
            appLogo: '',
            windowsIconLogo: '',
            installerUiLogo: '',
          };
        }
        if (target === 'app') return { ...prev, appLogo: pngDataUrl };
        if (target === 'windows') return { ...prev, windowsIconLogo: pngDataUrl };
        if (target === 'file') return { ...prev, svgaFileIconLogo: pngDataUrl };
        return { ...prev, installerUiLogo: pngDataUrl };
      });
    } catch (err: any) {
      setErrorMsg(
        err?.message || (isAr ? 'تعذر قراءة ملف الصورة' : 'Could not read selected image')
      );
    }
  };

  const handleBrowseFolder = async () => {
    try {
      const picker = (window as any).showDirectoryPicker;
      if (typeof picker === 'function') {
        const dirHandle = await picker({ mode: 'read' });
        if (dirHandle?.name) {
          const suffix = draft.instanceTag
            ? `${effectiveAppName}-v${effectiveVersion}-${draft.instanceTag}`
            : `${effectiveAppName}-v${effectiveVersion}`;
          setHasCustomInstallDir(true);
          setInstallDir(`C:\\Users\\%USERNAME%\\${dirHandle.name}\\${suffix}`);
          return;
        }
      }
    } catch {
      // User cancelled picker or unsupported
    }
    const autoDefault = getDefaultWindowsInstallPath(
      effectiveAppName,
      effectiveVersion,
      draft.instanceTag
    );
    const folderLeaf = autoDefault.split('\\').pop() || 'MotionTools';
    const nextPath =
      installDir === autoDefault
        ? `C:\\Program Files\\${folderLeaf}`
        : installDir === `C:\\Program Files\\${folderLeaf}`
          ? `D:\\${folderLeaf}`
          : autoDefault;
    setHasCustomInstallDir(nextPath !== autoDefault);
    setInstallDir(nextPath);
  };

  const handleGenerateUniqueTag = () => {
    const tag = `b${Date.now().toString(36).slice(-4)}`;
    setHasCustomInstallDir(false);
    setDraft((prev) => ({ ...prev, instanceTag: tag }));
  };

  const handleInstallClick = async () => {
    if (isBuilding || !isPasswordUnlocked) return;
    setIsBuilding(true);
    setErrorMsg('');
    setDownloadedInfo(null);
    setProgress(4);

    try {
      const res = await buildAndDownloadWindowsInstallerPackage({
        brandTitle: effectiveBrandTitle,
        appName: effectiveAppName,
        logoUrl: effectiveBaseLogo,
        appLogoUrl: draft.appLogo || draft.unifiedLogo || sanitizeSiteLogoUrl(settings.siteLogoUrl),
        windowsIconLogoUrl: effectiveWindowsIconLogo,
        installerUiLogoUrl: effectiveInstallerUiLogo,
        svgaFileIconLogoUrl: draft.svgaFileIconLogo || undefined,
        subtitle: draft.subtitle.trim() || 'تطبيق ويندوز لمعالجة وتحويل ملفات الحركة',
        instanceTag: draft.instanceTag.trim() || undefined,
        installDir:
          installDir.trim() ||
          getDefaultWindowsInstallPath(effectiveAppName, effectiveVersion, draft.instanceTag),
        createDesktopShortcut,
        launchAfterInstall,
        associateFiles,
        version: effectiveVersion,
        onProgress: (pct, msgAr, msgEn) => {
          setProgress(pct);
          setStatusMessage(isAr ? msgAr : msgEn);
        },
      });
      setDownloadedInfo(res);
    } catch (err: any) {
      setProgress(0);
      setErrorMsg(
        err?.message ||
          (isAr ? 'تعذر تجهيز حزمة التثبيت الأوفلاين.' : 'Failed to build offline installer package.')
      );
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <div
      id="windowsInstallerModalOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={isAr ? 'مثبت تطبيق ويندوز الأوفلاين' : 'Windows Offline Installer'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(4, 4, 10, 0.84)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBuilding) onClose();
      }}
    >
      <div
        id="windowsInstallerWindow"
        style={{
          width: 'min(700px, 96vw)',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#0c0b14',
          border: '1px solid rgba(124, 92, 255, 0.45)',
          borderRadius: '10px',
          overflow: 'hidden',
          boxShadow: '0 28px 90px rgba(0, 0, 0, 0.9), 0 0 40px rgba(124, 92, 255, 0.16)',
          color: '#f8fafc',
          fontFamily: '"Segoe UI", "Cairo", Tahoma, sans-serif',
        }}
      >
        {/* Native-Style Windows Title Bar */}
        <div
          style={{
            height: '34px',
            flexShrink: 0,
            background: '#ffffff',
            color: '#1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 10px',
            borderBottom: '1px solid #e2e8f0',
            direction: 'ltr',
          }}
        >
          <button
            type="button"
            id="windowsInstallerTitleCloseBtn"
            disabled={isBuilding}
            onClick={onClose}
            aria-label={isAr ? 'إغلاق' : 'Close'}
            style={{
              width: '28px',
              height: '24px',
              border: 'none',
              background: 'transparent',
              color: '#64748b',
              fontSize: '18px',
              lineHeight: 1,
              cursor: isBuilding ? 'not-allowed' : 'pointer',
              display: 'grid',
              placeItems: 'center',
              borderRadius: '4px',
            }}
          >
            ×
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12.5px',
              fontWeight: 600,
              color: '#1e293b',
              overflow: 'hidden',
            }}
          >
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isAr
                ? `تثبيت التطبيق — ${effectiveBrandTitle} · ${effectiveAppName} (v${effectiveVersion})`
                : `Install App — ${effectiveBrandTitle} · ${effectiveAppName} (v${effectiveVersion})`}
            </span>
            <img
              src={effectiveWindowsIconLogo}
              alt="Windows Icon"
              style={{ width: '18px', height: '18px', objectFit: 'contain', borderRadius: '4px' }}
            />
          </div>
        </div>

        {/* Main Dark Installer Body */}
        <div
          style={{
            padding: '20px 24px 20px',
            overflowY: 'auto',
            background:
              'radial-gradient(circle at 85% 15%, rgba(124, 92, 255, 0.14), transparent 45%), #0c0b14',
          }}
        >
          {/* Top Hero Row: Brand Title on Left + Logo on Right */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              direction: 'ltr',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: '220px', textAlign: 'left' }}>
              <div
                style={{
                  color: '#fbbf24',
                  fontSize: '19px',
                  fontWeight: 800,
                  marginBottom: '4px',
                  letterSpacing: '0.2px',
                }}
              >
                {effectiveBrandTitle}
              </div>
              <h2
                style={{
                  margin: '0 0 8px',
                  color: '#ffffff',
                  fontSize: '30px',
                  fontWeight: 900,
                  lineHeight: 1.1,
                }}
              >
                {effectiveAppName}
              </h2>
              <p
                style={{
                  margin: 0,
                  color: '#cbd5e1',
                  fontSize: '14.5px',
                  fontWeight: 500,
                  direction: isAr ? 'rtl' : 'ltr',
                  textAlign: 'left',
                }}
              >
                {draft.subtitle ||
                  (isAr
                    ? 'تطبيق ويندوز لمعالجة وتحويل ملفات الحركة'
                    : 'Windows desktop studio for motion animation processing')}
              </p>
            </div>

            <div
              style={{
                width: '132px',
                height: '132px',
                borderRadius: '14px',
                background: '#050509',
                border: '1px solid rgba(251, 191, 36, 0.3)',
                display: 'grid',
                placeItems: 'center',
                overflow: 'hidden',
                flexShrink: 0,
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.65)',
              }}
            >
              <img
                src={effectiveInstallerUiLogo}
                alt={effectiveBrandTitle}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          </div>

          {!isPasswordUnlocked ? (
            <form
              id="windowsDownloadPasswordForm"
              onSubmit={handleUnlockSubmit}
              dir={isAr ? 'rtl' : 'ltr'}
              style={{
                marginTop: '20px',
                padding: '18px',
                borderRadius: '8px',
                background: 'rgba(124, 92, 255, 0.08)',
                border: '1px solid rgba(124, 92, 255, 0.38)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '10px',
                }}
              >
                <span
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: 'rgba(124, 92, 255, 0.2)',
                    border: '1px solid rgba(124, 92, 255, 0.5)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '16px',
                    flexShrink: 0,
                  }}
                >
                  🔒
                </span>
                <div>
                  <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#f8fafc' }}>
                    {isAr
                      ? 'حماية تنزيل نسخة الويندوز بكلمة سر'
                      : 'Password-Protected Windows Download'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                    {isAr
                      ? 'أدخل كلمة سر علامة التنزيل لفتح مثبّت الويندوز الأوفلاين'
                      : 'Enter the download password to unlock the offline Windows installer'}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '12px',
                  direction: 'ltr',
                }}
              >
                <input
                  ref={passwordFieldRef}
                  id="windowsDownloadPasswordInput"
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    if (passwordError) setPasswordError('');
                  }}
                  placeholder={isAr ? 'أدخل كلمة السر...' : 'Enter password...'}
                  autoComplete="off"
                  style={{
                    flex: 1,
                    height: '38px',
                    padding: '0 12px',
                    background: '#ffffff',
                    color: '#0f172a',
                    border: passwordError ? '2px solid #ef4444' : '1px solid #cbd5e1',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: 700,
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  id="toggleWindowsPwdVisibilityBtn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  title={isAr ? 'إظهار / إخفاء كلمة السر' : 'Show / Hide password'}
                  style={{
                    height: '38px',
                    minWidth: '44px',
                    background: '#161426',
                    color: '#e2e8f0',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>

              {passwordError && (
                <div
                  id="windowsDownloadPasswordError"
                  style={{
                    marginTop: '10px',
                    padding: '8px 10px',
                    borderRadius: '4px',
                    background: 'rgba(239, 68, 68, 0.16)',
                    border: '1px solid rgba(239, 68, 68, 0.45)',
                    color: '#fca5a5',
                    fontSize: '12.5px',
                    fontWeight: 700,
                  }}
                >
                  ⛔ {passwordError}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: '16px',
                  direction: 'ltr',
                  gap: '12px',
                }}
              >
                <button
                  type="submit"
                  id="windowsDownloadUnlockBtn"
                  style={{
                    minWidth: '196px',
                    height: '40px',
                    background: '#7c5cff',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '3px',
                    fontSize: '14.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 6px 20px rgba(124, 92, 255, 0.35)',
                  }}
                >
                  {isAr ? '🔓 فتح مثبّت الويندوز' : '🔓 Unlock Installer'}
                </button>

                <button
                  type="button"
                  id="windowsInstallerLockCloseBtn"
                  onClick={onClose}
                  style={{
                    minWidth: '112px',
                    height: '40px',
                    background: '#0c0b14',
                    color: '#f8fafc',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Customization Panel: Logo (App / Windows / GUI), Name, Version, & Anti-Collision Tag */}
              <div
                dir={isAr ? 'rtl' : 'ltr'}
                style={{
                  marginTop: '14px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'rgba(124, 92, 255, 0.08)',
                  border: '1px solid rgba(124, 92, 255, 0.32)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '10px',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#fde047' }}>
                    {isAr
                      ? '🎨 تخصيص الشعار والاسم ورقم الإصدار (بدون تداخل نسخ)'
                      : '🎨 Customize Logo, App Name, Version & Isolation'}
                  </span>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <input
                      ref={unifiedLogoInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        handleLogoUpload('unified', e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      id="winChangeAllLogosBtn"
                      disabled={isBuilding}
                      onClick={() => unifiedLogoInputRef.current?.click()}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '5px',
                        border: '1px solid rgba(167, 139, 250, 0.65)',
                        background: 'rgba(124, 92, 255, 0.25)',
                        color: '#f5f3ff',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: isBuilding ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isAr ? '🖼️ تغيير اللوجو للكل' : '🖼️ Change All Logos'}
                    </button>
                    <button
                      type="button"
                      id="winToggleSeparateLogosBtn"
                      disabled={isBuilding}
                      onClick={() => setShowSeparateLogos((v) => !v)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '5px',
                        border: '1px solid rgba(148, 163, 184, 0.4)',
                        background: 'rgba(15, 23, 42, 0.7)',
                        color: '#cbd5e1',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: isBuilding ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {showSeparateLogos
                        ? isAr
                          ? 'إخفاء تخصيص كل شعار'
                          : 'Hide Individual'
                        : isAr
                          ? 'تخصيص كل شعار منفصل'
                          : 'Separate Logos'}
                    </button>
                    {(draft.unifiedLogo ||
                      draft.appLogo ||
                      draft.windowsIconLogo ||
                      draft.installerUiLogo ||
                      draft.svgaFileIconLogo) && (
                      <button
                        type="button"
                        disabled={isBuilding}
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            unifiedLogo: '',
                            appLogo: '',
                            windowsIconLogo: '',
                            installerUiLogo: '',
                            svgaFileIconLogo: '',
                          }))
                        }
                        style={{
                          padding: '4px 9px',
                          borderRadius: '5px',
                          border: '1px solid rgba(248, 113, 113, 0.45)',
                          background: 'rgba(239, 68, 68, 0.14)',
                          color: '#fecaca',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: isBuilding ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isAr ? 'استعادة الافتراضي' : 'Reset Logos'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Always-Visible Dedicated SVGA File Icon Logo Bar (Separate from Site/App Logo) */}
                <input
                  ref={fileIconInputRef}
                  id="windowsSvgaFileLogoInput"
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    handleLogoUpload('file', e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <div
                  id="windowsSvgaFileLogoCard"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    flexWrap: 'wrap',
                    padding: '8px 10px',
                    borderRadius: '7px',
                    marginBottom: '10px',
                    background: 'rgba(251, 191, 36, 0.08)',
                    border: '1px solid rgba(251, 191, 36, 0.35)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <img
                      src={effectiveSvgaFileIconLogo}
                      alt={isAr ? 'لوجو ملفات SVGA' : 'SVGA File Icon'}
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '7px',
                        objectFit: 'contain',
                        background: '#050509',
                        border: '1px solid rgba(251, 191, 36, 0.5)',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#fde68a' }}>
                        {isAr
                          ? 'لوجو ملفات SVGA (أيقونة الملفات على الويندوز)'
                          : 'SVGA File Logo (Windows File Icon)'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>
                        {draft.svgaFileIconLogo
                          ? isAr
                            ? '✅ تم تعيين لوجو خاص للملفات (مستقل عن لوجو الموقع)'
                            : '✅ Custom file logo set (independent of site logo)'
                          : isAr
                            ? 'لوجو مستقل عن لوجو الموقع — يظهر مباشرةً على ملفات .svga في الويندوز'
                            : 'Separate from site logo — appears directly on .svga files in Windows'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <button
                      id="windowsSvgaFileLogoUploadBtn"
                      type="button"
                      disabled={isBuilding}
                      onClick={() => fileIconInputRef.current?.click()}
                      style={{
                        padding: '5px 11px',
                        borderRadius: '5px',
                        border: '1px solid rgba(251, 191, 36, 0.6)',
                        background: 'rgba(251, 191, 36, 0.16)',
                        color: '#fde68a',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: isBuilding ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isAr ? '🖼️ رفع لوجو للملف' : '🖼️ Upload File Logo'}
                    </button>
                    {draft.svgaFileIconLogo && (
                      <button
                        type="button"
                        disabled={isBuilding}
                        onClick={() => setDraft((prev) => ({ ...prev, svgaFileIconLogo: '' }))}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '5px',
                          border: '1px solid rgba(248, 113, 113, 0.45)',
                          background: 'rgba(239, 68, 68, 0.14)',
                          color: '#fecaca',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: isBuilding ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isAr ? 'حذف' : 'Clear'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Optional Per-Target Logo Cards: App / Windows .ico / Installer UI / SVGA File */}
                {showSeparateLogos && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: '8px',
                      marginBottom: '10px',
                    }}
                  >
                    <input
                      ref={appLogoInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        handleLogoUpload('app', e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    <input
                      ref={winIconInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        handleLogoUpload('windows', e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    <input
                      ref={uiLogoInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        handleLogoUpload('ui', e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />

                    {[
                      {
                        label: isAr ? 'لوجو التطبيق' : 'App Logo',
                        img: effectiveAppLogo,
                        onClick: () => appLogoInputRef.current?.click(),
                      },
                      {
                        label: isAr ? 'أيقونة الويندوز (.ico)' : 'Windows Icon',
                        img: effectiveWindowsIconLogo,
                        onClick: () => winIconInputRef.current?.click(),
                      },
                      {
                        label: isAr ? 'شعار واجهة المثبّت' : 'Installer UI Logo',
                        img: effectiveInstallerUiLogo,
                        onClick: () => uiLogoInputRef.current?.click(),
                      },
                      {
                        label: isAr ? 'لوجو ملفات SVGA' : 'SVGA File Logo',
                        img: effectiveSvgaFileIconLogo,
                        onClick: () => fileIconInputRef.current?.click(),
                      },
                    ].map((card, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={isBuilding}
                        onClick={card.onClick}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          background: 'rgba(15, 23, 42, 0.85)',
                          border: '1px solid rgba(148, 163, 184, 0.35)',
                          color: '#e2e8f0',
                          cursor: isBuilding ? 'not-allowed' : 'pointer',
                          textAlign: 'start',
                        }}
                      >
                        <img
                          src={card.img}
                          alt={card.label}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '5px',
                            objectFit: 'contain',
                            background: '#050509',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: '11px', fontWeight: 700, lineHeight: 1.25 }}>
                          {card.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* App Name + Brand Title + Version + Isolation Tag */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '8px',
                  }}
                >
                  <div>
                    <label
                      htmlFor="winCustomAppNameInput"
                      style={{
                        display: 'block',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: '#cbd5e1',
                        marginBottom: '4px',
                      }}
                    >
                      {isAr ? 'اسم التطبيق' : 'App Name'}
                    </label>
                    <input
                      id="winCustomAppNameInput"
                      type="text"
                      disabled={isBuilding}
                      value={draft.appName}
                      onChange={(e) => setDraft((prev) => ({ ...prev, appName: e.target.value }))}
                      placeholder="MotionTools"
                      style={{
                        width: '100%',
                        height: '32px',
                        padding: '0 8px',
                        background: '#ffffff',
                        color: '#0f172a',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                      }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="winCustomBrandInput"
                      style={{
                        display: 'block',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: '#cbd5e1',
                        marginBottom: '4px',
                      }}
                    >
                      {isAr ? 'اسم البراند الذهبي' : 'Brand Title'}
                    </label>
                    <input
                      id="winCustomBrandInput"
                      type="text"
                      disabled={isBuilding}
                      value={draft.brandTitle}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, brandTitle: e.target.value }))
                      }
                      placeholder="Ahmed Pro SVGA"
                      style={{
                        width: '100%',
                        height: '32px',
                        padding: '0 8px',
                        background: '#ffffff',
                        color: '#0f172a',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                      }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="winCustomVersionInput"
                      style={{
                        display: 'block',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: '#cbd5e1',
                        marginBottom: '4px',
                      }}
                    >
                      {isAr ? 'رقم الإصدار' : 'Version'}
                    </label>
                    <div style={{ display: 'flex', gap: '4px', direction: 'ltr' }}>
                      <input
                        id="winCustomVersionInput"
                        type="text"
                        disabled={isBuilding}
                        value={draft.version}
                        onChange={(e) => setDraft((prev) => ({ ...prev, version: e.target.value }))}
                        placeholder="1.0.24"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: '32px',
                          padding: '0 8px',
                          background: '#ffffff',
                          color: '#0f172a',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          fontSize: '12.5px',
                          fontWeight: 700,
                          fontFamily: 'Consolas, monospace',
                        }}
                      />
                      <button
                        type="button"
                        id="winBumpVersionBtn"
                        disabled={isBuilding}
                        onClick={() => {
                          setHasCustomInstallDir(false);
                          setDraft((prev) => ({
                            ...prev,
                            version: bumpPatchVersion(prev.version),
                          }));
                        }}
                        title={isAr ? 'زيادة رقم الإصدار تلقائياً (+1)' : 'Bump version (+1)'}
                        style={{
                          height: '32px',
                          padding: '0 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(167, 139, 250, 0.65)',
                          background: '#1e1b4b',
                          color: '#e0e7ff',
                          fontSize: '11.5px',
                          fontWeight: 800,
                          cursor: isBuilding ? 'not-allowed' : 'pointer',
                        }}
                      >
                        +1
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="winCustomInstanceTagInput"
                      style={{
                        display: 'block',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: '#cbd5e1',
                        marginBottom: '4px',
                      }}
                    >
                      {isAr ? 'وسم فصل إضافي (لو نفس الإصدار)' : 'Build Isolation Tag (Optional)'}
                    </label>
                    <div style={{ display: 'flex', gap: '4px', direction: 'ltr' }}>
                      <input
                        id="winCustomInstanceTagInput"
                        type="text"
                        disabled={isBuilding}
                        value={draft.instanceTag}
                        onChange={(e) => {
                          setHasCustomInstallDir(false);
                          setDraft((prev) => ({ ...prev, instanceTag: e.target.value }));
                        }}
                        placeholder={isAr ? 'مثلاً r2 أو اتركه فارغاً' : 'e.g. r2 (optional)'}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: '32px',
                          padding: '0 8px',
                          background: '#ffffff',
                          color: '#0f172a',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      />
                      <button
                        type="button"
                        id="winGenerateUniqueTagBtn"
                        disabled={isBuilding}
                        onClick={handleGenerateUniqueTag}
                        title={
                          isAr
                            ? 'توليد معرّف فريد لمنع تداخل نسختين بنفس رقم الإصدار'
                            : 'Generate unique build tag to prevent collisions'
                        }
                        style={{
                          height: '32px',
                          padding: '0 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(52, 211, 153, 0.55)',
                          background: 'rgba(16, 185, 129, 0.18)',
                          color: '#a7f3d0',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: isBuilding ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isAr ? '🎲 فصل' : '🎲 Unique'}
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '11px',
                    color: '#a5b4fc',
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '6px',
                  }}
                >
                  <span>
                    {isAr ? 'اسم الحزمة:' : 'ZIP:'}{' '}
                    <code style={{ color: '#fde047' }} dir="ltr">
                      {previewZipName}
                    </code>
                  </span>
                  <span>
                    {isAr ? 'ملف التشغيل:' : 'Launcher:'}{' '}
                    <code style={{ color: '#6ee7b7' }} dir="ltr">
                      {previewBatName}
                    </code>
                  </span>
                </div>
              </div>

              {/* Installation Directory Field */}
              <div style={{ marginTop: '14px' }} dir={isAr ? 'rtl' : 'ltr'}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '6px',
                  }}
                >
                  <label
                    htmlFor="windowsInstallDirInput"
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 700,
                      color: '#e2e8f0',
                    }}
                  >
                    {isAr ? 'مجلد التثبيت' : 'Installation Folder'}
                  </label>
                  {hasCustomInstallDir && (
                    <button
                      type="button"
                      disabled={isBuilding}
                      onClick={() => setHasCustomInstallDir(false)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#a5b4fc',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      {isAr ? 'ربط تلقائي بالاسم والإصدار' : 'Sync with Name & Version'}
                    </button>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    direction: 'ltr',
                  }}
                >
                  <input
                    id="windowsInstallDirInput"
                    type="text"
                    value={installDir}
                    disabled={isBuilding}
                    onChange={(e) => {
                      setHasCustomInstallDir(true);
                      setInstallDir(e.target.value);
                    }}
                    style={{
                      flex: 1,
                      height: '36px',
                      padding: '0 10px',
                      background: '#ffffff',
                      color: '#0f172a',
                      border: '1px solid #cbd5e1',
                      borderRadius: '3px',
                      fontFamily: 'Consolas, "Segoe UI", monospace',
                      fontSize: '13px',
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    id="windowsBrowseFolderBtn"
                    disabled={isBuilding}
                    onClick={handleBrowseFolder}
                    style={{
                      minWidth: '96px',
                      height: '36px',
                      background: '#0c0b14',
                      color: '#f8fafc',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '3px',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: isBuilding ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isAr ? 'تغيير' : 'Browse'}
                  </button>
                </div>

                {/* Checkboxes */}
                <div
                  style={{
                    margin: '14px 0 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <label
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 22px 1fr',
                      alignItems: 'center',
                      cursor: isBuilding ? 'not-allowed' : 'pointer',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      color: '#f1f5f9',
                    }}
                  >
                    <span style={{ textAlign: isAr ? 'right' : 'left' }}>
                      {isAr ? 'إضافة اختصار على سطح المكتب' : 'Add Desktop Shortcut'}
                    </span>
                    <input
                      id="windowsDesktopShortcutChk"
                      type="checkbox"
                      checked={createDesktopShortcut}
                      disabled={isBuilding}
                      onChange={(e) => setCreateDesktopShortcut(e.target.checked)}
                      style={{
                        justifySelf: 'center',
                        width: '15px',
                        height: '15px',
                        accentColor: '#2563eb',
                        cursor: 'pointer',
                        margin: 0,
                      }}
                    />
                  </label>

                  <label
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 22px 1fr',
                      alignItems: 'center',
                      cursor: isBuilding ? 'not-allowed' : 'pointer',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      color: '#f1f5f9',
                    }}
                  >
                    <span style={{ textAlign: isAr ? 'right' : 'left' }}>
                      {isAr ? 'تشغيل التطبيق بعد التثبيت' : 'Launch App After Install'}
                    </span>
                    <input
                      id="windowsLaunchAfterChk"
                      type="checkbox"
                      checked={launchAfterInstall}
                      disabled={isBuilding}
                      onChange={(e) => setLaunchAfterInstall(e.target.checked)}
                      style={{
                        justifySelf: 'center',
                        width: '15px',
                        height: '15px',
                        accentColor: '#2563eb',
                        cursor: 'pointer',
                        margin: 0,
                      }}
                    />
                  </label>

                  <label
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 22px 1fr',
                      alignItems: 'center',
                      cursor: isBuilding ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#fde68a',
                    }}
                  >
                    <span style={{ textAlign: isAr ? 'right' : 'left' }}>
                      {isAr
                        ? 'ربط ملفات SVGA والصيغ المدعومة وتغيير أيقونتها بشعار الموقع'
                        : 'Associate .SVGA & supported files with app logo icon'}
                    </span>
                    <input
                      id="windowsAssociateFilesChk"
                      type="checkbox"
                      checked={associateFiles}
                      disabled={isBuilding}
                      onChange={(e) => setAssociateFiles(e.target.checked)}
                      style={{
                        justifySelf: 'center',
                        width: '15px',
                        height: '15px',
                        accentColor: '#2563eb',
                        cursor: 'pointer',
                        margin: 0,
                      }}
                    />
                  </label>
                </div>

                {/* Progress Bar */}
                <div style={{ marginTop: '6px' }}>
                  <div
                    style={{
                      width: '100%',
                      height: '18px',
                      background: '#e5e7eb',
                      border: '1px solid #9ca3af',
                      borderRadius: '2px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      id="windowsInstallerProgressFill"
                      style={{
                        height: '100%',
                        width: `${progress}%`,
                        background: 'linear-gradient(90deg, #7c5cff, #a855f7)',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: '8px',
                      fontSize: '12.5px',
                      color: '#94a3b8',
                      direction: 'ltr',
                      gap: '10px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      Windows x64 &bull;{' '}
                      {isAr ? `الإصدار ${effectiveVersion}` : `v${effectiveVersion}`}
                    </span>
                    <span
                      style={{
                        color: errorMsg ? '#fca5a5' : downloadedInfo ? '#6ee7b7' : '#c4b5fd',
                        fontWeight: 600,
                        direction: isAr ? 'rtl' : 'ltr',
                      }}
                    >
                      {errorMsg ||
                        statusMessage ||
                        (isAr
                          ? 'جاهز لتحميل مثبّت الويندوز الأوفلاين (حساب المدير فقط)'
                          : 'Ready to download offline Windows installer (Admin only)')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Post-download offline instructions */}
              {downloadedInfo && (
                <div
                  id="windowsInstallerSuccessBox"
                  dir={isAr ? 'rtl' : 'ltr'}
                  style={{
                    marginTop: '10px',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.45)',
                    color: '#a7f3d0',
                    fontSize: '12px',
                    lineHeight: 1.6,
                  }}
                >
                  {isAr ? (
                    <>
                      ✅ تم تنزيل <b dir="ltr">{downloadedInfo.fileName}</b> (
                      {downloadedInfo.fileCount} ملف أوفلاين) — بعد فك الضغط، اضغط مرتين على{' '}
                      <code style={{ color: '#fde047' }} dir="ltr">
                        {downloadedInfo.setupBatName}
                      </code>{' '}
                      لفتح نافذة التثبيت والعمل 100% أوفلاين بدون إنترنت.
                    </>
                  ) : (
                    <>
                      ✅ Downloaded <b>{downloadedInfo.fileName}</b> ({downloadedInfo.fileCount}{' '}
                      offline files) — Extract the archive and double-click{' '}
                      <code style={{ color: '#fde047' }}>{downloadedInfo.setupBatName}</code> to
                      install and run the app 100% offline.
                    </>
                  )}
                </div>
              )}

              {/* Footer Buttons */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: '14px',
                  direction: 'ltr',
                  gap: '12px',
                }}
              >
                <button
                  type="button"
                  id="windowsInstallStartBtn"
                  disabled={isBuilding}
                  onClick={handleInstallClick}
                  style={{
                    minWidth: '196px',
                    height: '40px',
                    background: '#7c5cff',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '3px',
                    fontSize: '15px',
                    fontWeight: 700,
                    cursor: isBuilding ? 'wait' : 'pointer',
                    opacity: isBuilding ? 0.78 : 1,
                    boxShadow: '0 6px 20px rgba(124, 92, 255, 0.35)',
                  }}
                >
                  {isBuilding
                    ? isAr
                      ? `جاري التجهيز (${progress}%)...`
                      : `Packaging (${progress}%)...`
                    : isAr
                      ? 'تثبيت التطبيق'
                      : 'Install App'}
                </button>

                <button
                  type="button"
                  id="windowsInstallerCloseBtn"
                  disabled={isBuilding}
                  onClick={onClose}
                  style={{
                    minWidth: '112px',
                    height: '40px',
                    background: '#0c0b14',
                    color: '#f8fafc',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: isBuilding ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

