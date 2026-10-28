import React, { useState } from 'react';
import {
  ALL_ADMIN_PERMISSIONS,
  ALL_SUPPORTED_FORMATS,
  PlatformState,
  UserAccount,
  buildWhatsAppUrl,
  canAccessAdminDashboard,
  checkLoginRateLimit,
  getEffectiveAdminPermissions,
  isPurgedLegacyAdmin,
  isSuperAdminUser,
  recordFailedLoginAttempt,
  resetLoginAttempts,
  verifyUserPassword,
} from '../utils/platformStore';
import { getTranslation } from '../utils/i18n';
import { fetchFirestoreUsers } from '../utils/firebase';

interface ProSubscriptionModalProps {
  open: boolean;
  blockedFormatKey: string;
  onClose: () => void;
  onOpenAuth: () => void;
  state: PlatformState;
}

export function ProSubscriptionModal({
  open,
  blockedFormatKey,
  onClose,
  onOpenAuth,
  state,
}: ProSubscriptionModalProps) {
  if (!open) return null;
  const isAr = state.language === 'ar';
  const t = getTranslation(state.language);
  const { settings, users, currentUserId } = state;
  const currentUser = users.find((u) => u.id === currentUserId) || null;

  const fmtDef = ALL_SUPPORTED_FORMATS.find((f) => f.key === blockedFormatKey);
  const fmtDisplay = fmtDef
    ? isAr
      ? fmtDef.labelAr
      : fmtDef.labelEn
    : blockedFormatKey.toUpperCase();

  const packageTitle = isAr ? settings.proPackageNameAr : settings.proPackageNameEn;
  const packageDesc = isAr ? settings.proDescriptionAr : settings.proDescriptionEn;
  const periodLabel = isAr ? settings.proPeriodAr : settings.proPeriodEn;

  const waMessage = isAr
    ? `${settings.whatsappDefaultMsgAr}\nالباقة: ${packageTitle} (${settings.proPrice} ${settings.proCurrency})\nالصيغة المطلوبة: ${fmtDisplay}${currentUser ? `\nحسابي: ${currentUser.email}` : ''}`
    : `${settings.whatsappDefaultMsgEn}\nPackage: ${packageTitle} (${settings.proPrice} ${settings.proCurrency})\nFormat: ${fmtDisplay}${currentUser ? `\nMy Account: ${currentUser.email}` : ''}`;

  const waLink = buildWhatsAppUrl(settings.whatsappNumber, waMessage);

  return (
    <div
      role="dialog"
      aria-label={t.proModalTitle}
      dir={isAr ? 'rtl' : 'ltr'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(5, 5, 10, 0.85)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(520px, 96vw)',
          background: 'linear-gradient(180deg, #161326 0%, #0e0e16 100%)',
          border: '1px solid rgba(245, 158, 11, 0.45)',
          borderRadius: '18px',
          padding: '24px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
          color: '#fff',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '14px',
            insetInlineEnd: '14px',
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            border: '1px solid #2e2e42',
            background: '#181824',
            color: '#a0a0b8',
            cursor: 'pointer',
          }}
        >
          ×
        </button>

        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(245, 158, 11, 0.18)',
              border: '1px solid #f59e0b',
              color: '#fde047',
              padding: '4px 14px',
              borderRadius: '99px',
              fontWeight: 800,
              fontSize: '12px',
            }}
          >
            👑 {packageTitle}
          </span>
          <h2 style={{ margin: '12px 0 6px', fontSize: '20px', fontWeight: 800, color: '#fff' }}>
            {t.proModalTitle}
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#b4b4c8', lineHeight: 1.5 }}>
            {t.proModalSubtitle}
          </p>
        </div>

        {/* Price & Format Highlight Box */}
        <div
          style={{
            background: 'rgba(124, 92, 255, 0.12)',
            border: '1px solid rgba(124, 92, 255, 0.35)',
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '16px',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: '#a5b4fc' }}>{t.proRequiredFormatLabel}</div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#fde047', marginTop: '2px' }}>
              🔒 {fmtDisplay}
            </div>
          </div>

          <div style={{ textAlign: isAr ? 'left' : 'right' }}>
            <div style={{ fontSize: '11px', color: '#a5b4fc' }}>{t.proPriceLabel}</div>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#fff' }}>
              {settings.proPrice} <span style={{ fontSize: '15px', color: '#fde047' }}>{settings.proCurrency}</span>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500, marginInlineStart: '6px' }}>
                ({periodLabel})
              </span>
            </div>
          </div>
        </div>

        {/* Description & Features */}
        <div
          style={{
            background: '#11111a',
            border: '1px solid #232336',
            borderRadius: '12px',
            padding: '14px',
            marginBottom: '18px',
          }}
        >
          <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#d1d5db' }}>{packageDesc}</p>
          <div style={{ fontWeight: 700, fontSize: '12px', color: '#c4b5fd', marginBottom: '8px' }}>
            {t.proFeaturesTitle}
          </div>
          <ul
            style={{
              margin: 0,
              paddingInlineStart: '18px',
              fontSize: '12px',
              color: '#cbd5e1',
              display: 'flex',
              flexDirection: 'column',
              gap: '5px',
            }}
          >
            <li>{t.proFeat1}</li>
            <li>{t.proFeat2}</li>
            <li>{t.proFeat3}</li>
            <li>{t.proFeat4}</li>
          </ul>
        </div>

        {/* CTA Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #25D366, #16a34a)',
                color: '#042f16',
                fontWeight: 800,
                fontSize: '14px',
                textAlign: 'center',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 6px 20px rgba(37, 211, 102, 0.35)',
              }}
            >
              <span>💬</span>
              <span>{t.proSubscribeWhatsappBtn}</span>
            </a>
          ) : null}

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAuth();
            }}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid #7c5cff',
              background: 'rgba(124, 92, 255, 0.16)',
              color: '#ddd6fe',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            🔑 {t.proLoginIfSubscribedBtn}
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: '#8e8ea6',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {t.proCloseBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

interface UserAuthModalProps {
  open: boolean;
  onClose: () => void;
  state: PlatformState;
  onLoginSuccess: (userId: string) => void;
  onRegisterUser: (user: UserAccount) => void;
  onLogout: () => void;
  onOpenAdminDashboard: () => void;
}

export function UserAuthModal({
  open,
  onClose,
  state,
  onLoginSuccess,
  onRegisterUser,
  onLogout,
  onOpenAdminDashboard,
}: UserAuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!open) return null;
  const isAr = state.language === 'ar';
  const t = getTranslation(state.language);
  const currentUser = state.users.find((u) => u.id === state.currentUserId) || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const emailClean = email.trim().toLowerCase();
    const pwdClean = password.trim();

    if (!emailClean) {
      setErrorMsg(isAr ? 'يرجى إدخال البريد الإلكتروني' : 'Please enter your email address');
      return;
    }
    if (!pwdClean) {
      setErrorMsg(isAr ? 'يرجى إدخال كلمة السر' : 'Please enter your password');
      return;
    }

    if (isPurgedLegacyAdmin({ email: emailClean })) {
      setErrorMsg(
        isAr
          ? '⛔ هذا الحساب قديم وتم حذفه وإلغاء صلاحيته نهائياً من النظام.'
          : '⛔ This legacy account has been permanently removed and revoked.'
      );
      return;
    }

    if (mode === 'login') {
      const rateLimit = checkLoginRateLimit(emailClean);
      if (!rateLimit.allowed) {
        setErrorMsg(
          isAr
            ? `🔒 تم قفل محاولات الدخول مؤقتاً لحماية الحساب. يرجى الانتظار ${rateLimit.retryAfterSeconds} ثانية ثم المحاولة.`
            : `🔒 Too many failed login attempts. Please wait ${rateLimit.retryAfterSeconds} seconds.`
        );
        return;
      }

      let found = state.users.find(
        (u) => u.email.toLowerCase() === emailClean && !isPurgedLegacyAdmin(u)
      );

      // If not in local state, query Firestore directly for cross-device / fresh sessions
      if (!found) {
        try {
          const remoteUsers = await fetchFirestoreUsers();
          const remoteFound = remoteUsers.find(
            (u) => u.email.toLowerCase() === emailClean && !isPurgedLegacyAdmin(u)
          );
          if (remoteFound) {
            onRegisterUser(remoteFound);
            found = remoteFound;
          }
        } catch {}
      }

      if (!found) {
        recordFailedLoginAttempt(emailClean);
        setErrorMsg(
          isAr
            ? 'لم يتم العثور على حساب بهذا البريد الإلكتروني. يرجى التأكد أو إنشاء حساب جديد.'
            : 'No account found with this email. Please check or sign up.'
        );
        return;
      }

      if (!verifyUserPassword(found, pwdClean)) {
        const failRes = recordFailedLoginAttempt(emailClean);
        setErrorMsg(
          failRes.locked
            ? isAr
              ? `🔒 تم حظر المحاولات مؤقتاً لمدة ${failRes.retryAfterSeconds} ثانية بسبب تكرار كلمة المرور الخاطئة.`
              : `🔒 Account temporarily locked for ${failRes.retryAfterSeconds}s due to failed attempts.`
            : isAr
              ? `كلمة المرور غير صحيحة (متبقي ${failRes.remainingAttempts} محاولات).`
              : `Incorrect password (${failRes.remainingAttempts} attempts remaining).`
        );
        return;
      }

      resetLoginAttempts(emailClean);
      onLoginSuccess(found.id);
      onClose();
      if (canAccessAdminDashboard(found)) {
        onOpenAdminDashboard();
      }
    } else {
      if (pwdClean.length < 6) {
        setErrorMsg(
          isAr
            ? 'كلمة السر يجب ألا تقل عن 6 أحرف أو أرقام لتأمين الحساب'
            : 'Password must be at least 6 characters for security'
        );
        return;
      }

      let existing = state.users.find(
        (u) => u.email.toLowerCase() === emailClean
      );
      if (!existing) {
        try {
          const remoteUsers = await fetchFirestoreUsers();
          existing = remoteUsers.find((u) => u.email.toLowerCase() === emailClean);
        } catch {}
      }
      if (existing) {
        setErrorMsg(
          isAr
            ? 'هذا البريد الإلكتروني مسجل بالفعل، يرجى تسجيل الدخول.'
            : 'This email is already registered, please sign in.'
        );
        return;
      }

      const newUser: UserAccount = {
        id: 'usr_' + Date.now(),
        name: emailClean.split('@')[0],
        email: emailClean,
        password: pwdClean,
        role: 'user',
        isPro: false,
        createdAt: new Date().toISOString(),
      };
      onRegisterUser(newUser);
      onLoginSuccess(newUser.id);
      onClose();
    }
  };

  const hasCurrentAdminAccess = canAccessAdminDashboard(currentUser);
  const isCurrentSuperAdmin = isSuperAdminUser(currentUser);
  const currentEffectivePerms = getEffectiveAdminPermissions(currentUser);

  return (
    <div
      role="dialog"
      aria-label={mode === 'login' ? t.authModalTitleLogin : t.authModalTitleRegister}
      dir={isAr ? 'rtl' : 'ltr'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(5, 5, 10, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(450px, 95vw)',
          background: '#11111a',
          border: '1px solid #28283e',
          borderRadius: '16px',
          padding: '24px',
          color: '#fff',
          boxShadow: '0 20px 60px rgba(0,0,0,0.75)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
            {mode === 'login'
              ? isAr
                ? 'تسجيل الدخول'
                : 'Sign In'
              : isAr
                ? 'إنشاء حساب جديد'
                : 'Create Account'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#1b1b28',
              border: '1px solid #2e2e42',
              color: '#fff',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Current User Card if logged in */}
        {currentUser && (
          <div
            style={{
              background: hasCurrentAdminAccess
                ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.16), rgba(16, 185, 129, 0.12))'
                : '#181826',
              border: hasCurrentAdminAccess ? '1px solid rgba(124, 92, 255, 0.55)' : '1px solid #2c2c44',
              borderRadius: '12px',
              padding: '14px',
              marginBottom: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: '#9494aa' }}>{t.authCurrentAccount}</div>
                <div style={{ fontWeight: 800, fontSize: '14px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span>{currentUser.email}</span>
                  {hasCurrentAdminAccess && (
                    <span
                      id="userModalAdminBadge"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: '99px',
                        background: isCurrentSuperAdmin
                          ? 'linear-gradient(135deg, #7c5cff, #4f46e5)'
                          : 'linear-gradient(135deg, #10b981, #059669)',
                        color: '#fff',
                        fontSize: '10px',
                        fontWeight: 800,
                        boxShadow: '0 2px 10px rgba(16, 185, 129, 0.35)',
                      }}
                    >
                      <span>{isCurrentSuperAdmin ? '👑' : '🛡️'}</span>
                      <span>
                        {currentUser.adminBadgeTitle ||
                          (isCurrentSuperAdmin
                            ? isAr
                              ? 'المدير العام (Super Admin)'
                              : 'Super Admin'
                            : isAr
                              ? 'مشرف معتمد (Admin)'
                              : 'Verified Admin')}
                      </span>
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: hasCurrentAdminAccess ? '#6ee7b7' : currentUser.isPro ? '#fde047' : '#94a3b8',
                    marginTop: '3px',
                    fontWeight: 600,
                  }}
                >
                  {hasCurrentAdminAccess
                    ? isCurrentSuperAdmin
                      ? isAr
                        ? '👑 صلاحية كاملة على جميع أقسام الداشبورد والحماية'
                        : '👑 Full Super Administrator Access'
                      : isAr
                        ? `🛡️ تم منحك صلاحية مشرف في الداشبورد (${currentEffectivePerms.length} صلاحيات مفعلة)`
                        : `🛡️ Granted Dashboard Moderator Access (${currentEffectivePerms.length} active permissions)`
                    : currentUser.isPro
                      ? t.authStatusPro
                      : t.authStatusFree}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {hasCurrentAdminAccess && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAdminDashboard();
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #7c5cff, #5a2fd0)',
                      border: 0,
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    ⚙️ {t.navAdminDashboard}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onLogout}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    background: '#261822',
                    border: '1px solid #ef4444',
                    color: '#fca5a5',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  {t.authLogout}
                </button>
              </div>
            </div>

            {/* Granted Admin Permissions Badges inside the user's account modal */}
            {hasCurrentAdminAccess && currentEffectivePerms.length > 0 && (
              <div
                style={{
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  paddingTop: '8px',
                }}
              >
                <div style={{ fontSize: '10.5px', color: '#cbd5e1', marginBottom: '6px', fontWeight: 700 }}>
                  {isAr ? '✨ الصلاحيات الممنوحة لحسابك في لوحة التحكم:' : '✨ Your Granted Dashboard Permissions:'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {ALL_ADMIN_PERMISSIONS.filter((p) => currentEffectivePerms.includes(p.key)).map((perm) => (
                    <span
                      key={perm.key}
                      style={{
                        fontSize: '10px',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: 'rgba(15, 23, 42, 0.75)',
                        border: '1px solid rgba(16, 185, 129, 0.45)',
                        color: '#a7f3d0',
                        fontWeight: 700,
                      }}
                    >
                      {perm.icon} {isAr ? perm.labelAr : perm.labelEn}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode Switcher: Login or Register only */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            marginBottom: '16px',
            background: '#0c0c12',
            padding: '4px',
            borderRadius: '10px',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg('');
            }}
            style={{
              padding: '8px',
              borderRadius: '8px',
              border: 0,
              background: mode === 'login' ? '#7c5cff' : 'transparent',
              color: mode === 'login' ? '#fff' : '#9494aa',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            {isAr ? 'تسجيل الدخول' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg('');
            }}
            style={{
              padding: '8px',
              borderRadius: '8px',
              border: 0,
              background: mode === 'register' ? '#7c5cff' : 'transparent',
              color: mode === 'register' ? '#fff' : '#9494aa',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            {isAr ? 'إنشاء حساب' : 'Create Account'}
          </button>
        </div>

        {/* Form strictly containing Email & Password */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '6px', fontWeight: 600 }}>
              {isAr ? 'البريد الإلكتروني' : 'Email Address'}
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              style={{
                width: '100%',
                background: '#14141c',
                border: '1px solid #2e2e42',
                borderRadius: '8px',
                padding: '9px 12px',
                color: '#fff',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '6px', fontWeight: 600 }}>
              {isAr ? 'كلمة السر' : 'Password'}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                background: '#14141c',
                border: '1px solid #2e2e42',
                borderRadius: '8px',
                padding: '9px 12px',
                color: '#fff',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {errorMsg && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.14)',
                border: '1px solid #ef4444',
                borderRadius: '8px',
                padding: '8px 12px',
                color: '#fca5a5',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              ⚠️ {errorMsg}
            </div>
          )}

          <button
            type="submit"
            style={{
              marginTop: '4px',
              padding: '11px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #7c5cff, #5a2fd0)',
              border: 0,
              color: '#fff',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(124, 92, 255, 0.35)',
            }}
          >
            {mode === 'login'
              ? isAr
                ? 'دخول إلى الحساب'
                : 'Sign In'
              : isAr
                ? 'إنشاء الحساب الآن'
                : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

interface NotificationsPopoverProps {
  open: boolean;
  onClose: () => void;
  state: PlatformState;
  onMarkAllRead: () => void;
}

export function NotificationsPopover({
  open,
  onClose,
  state,
  onMarkAllRead,
}: NotificationsPopoverProps) {
  if (!open) return null;
  const isAr = state.language === 'ar';
  const t = getTranslation(state.language);

  return (
    <div
      role="dialog"
      aria-label={t.notifTitle}
      dir={isAr ? 'rtl' : 'ltr'}
      style={{
        position: 'fixed',
        top: '46px',
        insetInlineEnd: '16px',
        width: 'min(370px, 92vw)',
        maxHeight: '440px',
        background: '#12121c',
        border: '1px solid #2e2e46',
        borderRadius: '14px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.75)',
        zIndex: 9995,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid #222234',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#171724',
        }}
      >
        <b style={{ fontSize: '13px', color: '#fff' }}>🔔 {t.notifTitle}</b>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={onMarkAllRead}
            style={{
              background: 'transparent',
              border: 0,
              color: '#a78bfa',
              fontSize: '11px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {t.notifMarkAllRead}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 0,
              color: '#9494aa',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {state.notifications.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#8e8ea6', fontSize: '12px' }}>
            {t.notifEmpty}
          </div>
        ) : (
          state.notifications.map((n) => {
            const isUnread = !state.readNotificationIds.includes(n.id);
            return (
              <div
                key={n.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: isUnread ? 'rgba(124, 92, 255, 0.12)' : '#161622',
                  border: isUnread ? '1px solid rgba(124, 92, 255, 0.45)' : '1px solid #222234',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '12px', color: '#fff' }}>{n.title}</span>
                  {isUnread && (
                    <span
                      style={{
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '99px',
                      }}
                    >
                      {isAr ? 'جديد' : 'NEW'}
                    </span>
                  )}
                </div>
                <p style={{ margin: '5px 0', fontSize: '12px', color: '#cbd5e1', lineHeight: 1.45 }}>
                  {n.message}
                </p>
                <div style={{ fontSize: '10px', color: '#7c7c92' }}>
                  {new Date(n.createdAt).toLocaleString(isAr ? 'ar-EG' : 'en-US')}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
