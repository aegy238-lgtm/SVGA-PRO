import { PlatformSettings, buildWhatsAppUrl, sanitizeSiteLogoUrl, sanitizeSiteName } from '../utils/platformStore';

interface SiteClosedScreenProps {
  settings: PlatformSettings;
  isAr: boolean;
  onOpenAdminAuth: () => void;
  onRecheckStatus?: () => void;
}

export default function SiteClosedScreen({
  settings,
  isAr,
  onOpenAdminAuth,
  onRecheckStatus,
}: SiteClosedScreenProps) {
  const siteName = sanitizeSiteName(settings.siteName, 'MotionTools');
  const siteLogo = sanitizeSiteLogoUrl(settings.siteLogoUrl);
  const waUrl = buildWhatsAppUrl(
    settings.whatsappNumber,
    isAr
      ? 'مرحباً، أستفسر عن موعد إعادة فتح الموقع.'
      : 'Hello, I am inquiring about when the site will be re-opened.'
  );

  const mainMessage = isAr
    ? settings.siteClosedMessageAr || 'الموقع مغلق الآن'
    : settings.siteClosedMessageEn || 'The site is currently closed';

  return (
    <div
      id="siteClosedOverlay"
      role="alertdialog"
      aria-modal="true"
      dir={isAr ? 'rtl' : 'ltr'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9990,
        background: 'linear-gradient(135deg, #07080e 0%, #0c0e18 50%, #05060b 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center',
        color: '#fff',
        overflowY: 'auto',
      }}
    >
      {/* Glow Effect Background */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(239, 68, 68, 0.14) 0%, rgba(0, 0, 0, 0) 70%)',
          pointerEvents: 'none',
          borderRadius: '50%',
        }}
      />

      <div
        style={{
          maxWidth: '580px',
          width: '100%',
          background: 'rgba(15, 17, 28, 0.92)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: '24px',
          padding: '40px 32px',
          boxShadow: '0 25px 70px rgba(0, 0, 0, 0.8), 0 0 50px rgba(239, 68, 68, 0.12)',
          position: 'relative',
          backdropFilter: 'blur(16px)',
        }}
      >
        {/* Site Branding / Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '24px' }}>
          {siteLogo ? (
            <img
              src={siteLogo}
              alt={siteName}
              style={{ width: '48px', height: '48px', objectFit: 'contain', borderRadius: '10px' }}
            />
          ) : (
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                display: 'grid',
                placeItems: 'center',
                fontSize: '24px',
                fontWeight: 900,
                color: '#fff',
                boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4)',
              }}
            >
              🔒
            </div>
          )}
          <span style={{ fontSize: '22px', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
            {siteName}
          </span>
        </div>

        {/* Status Badge */}
        <div style={{ marginBottom: '20px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 16px',
              borderRadius: '99px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              color: '#fca5a5',
              fontSize: '13px',
              fontWeight: 800,
              boxShadow: '0 2px 12px rgba(239, 68, 68, 0.25)',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#ef4444',
                boxShadow: '0 0 10px #ef4444',
                display: 'inline-block',
              }}
            />
            {isAr ? 'الموقع مغلق مؤقتاً للصيانة والإدارة 🔴' : 'Site Temporarily Closed for Maintenance 🔴'}
          </span>
        </div>

        {/* Main Header Message */}
        <h1
          id="siteClosedTitle"
          style={{
            fontSize: '28px',
            fontWeight: 900,
            color: '#ffffff',
            margin: '0 0 16px',
            lineHeight: 1.3,
          }}
        >
          {mainMessage}
        </h1>

        {/* Secondary Detailed Explanation */}
        <p
          style={{
            fontSize: '15px',
            color: '#94a3b8',
            lineHeight: 1.7,
            margin: '0 0 32px',
            fontWeight: 500,
          }}
        >
          {isAr
            ? 'نعتذر عن عدم إمكانية استخدام خدمات الموقع في الوقت الحالي. جارٍ التحديث والصيانة وسنعاود الخدمة والعمل قريباً جداً.'
            : 'We apologize for the inconvenience. The site is currently under scheduled maintenance and updates. All services will be restored shortly.'}
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
          {onRecheckStatus && (
            <button
              type="button"
              id="recheckClosedStatusBtn"
              onClick={onRecheckStatus}
              style={{
                padding: '13px 20px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                border: 'none',
                color: '#fff',
                fontWeight: 800,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 6px 20px rgba(59, 130, 246, 0.35)',
                transition: 'all 0.2s ease',
              }}
            >
              🔄 {isAr ? 'التحقق من حالة الموقع وتحديث الصفحة' : 'Check Site Status & Refresh'}
            </button>
          )}

          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '12px 20px',
                borderRadius: '12px',
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid rgba(34, 197, 94, 0.45)',
                color: '#4ade80',
                fontWeight: 700,
                fontSize: '13.5px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              💬 {isAr ? 'التواصل مع الإدارة عبر واتساب' : 'Contact Support via WhatsApp'}
            </a>
          )}

          {/* Discreet Admin Login Access */}
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <button
              type="button"
              id="adminAccessFromClosedSiteBtn"
              onClick={onOpenAdminAuth}
              style={{
                background: 'transparent',
                border: '1px dashed rgba(124, 92, 255, 0.4)',
                color: '#a78bfa',
                padding: '9px 18px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
              }}
            >
              🔐 {isAr ? 'تسجيل دخول الإدارة (Admin Login)' : 'Admin Login'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
