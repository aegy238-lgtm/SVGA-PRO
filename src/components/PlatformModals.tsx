import React, { useState, useEffect } from 'react';
import {
  ALL_ADMIN_PERMISSIONS,
  ALL_SUPPORTED_FORMATS,
  PlatformState,
  ProPlanDurationKey,
  UserAccount,
  buildWhatsAppUrl,
  canAccessAdminDashboard,
  canUserCaptureScreen,
  checkLoginRateLimit,
  getEffectiveAdminPermissions,
  isPurgedLegacyAdmin,
  isSuperAdminUser,
  normalizeProPlans,
  recordFailedLoginAttempt,
  resetLoginAttempts,
  verifyUserPassword,
  getUserProSubscriptionInfo,
  resolveAuthenticatedUserOnLogin,
  PRO_TOOLS_DEFINITIONS,
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
  const [selectedPlanId, setSelectedPlanId] = useState<ProPlanDurationKey>('month');

  const isAr = state.language === 'ar';
  const t = getTranslation(state.language);
  const { settings, users, currentUserId } = state;
  const currentUser = users.find((u) => u.id === currentUserId) || null;

  const allPlans = normalizeProPlans(settings.proPlans, settings.proPrice);
  const enabledPlans = allPlans.filter((p) => p.enabled !== false);
  const displayPlans = enabledPlans.length > 0 ? enabledPlans : allPlans;

  useEffect(() => {
    if (!displayPlans.some((p) => p.id === selectedPlanId)) {
      const monthPlan = displayPlans.find((p) => p.id === 'month') || displayPlans[0];
      if (monthPlan) setSelectedPlanId(monthPlan.id);
    }
  }, [open, settings.proPlans, selectedPlanId]);

  if (!open) return null;

  const activePlan =
    displayPlans.find((p) => p.id === selectedPlanId) ||
    displayPlans.find((p) => p.id === 'month') ||
    displayPlans[0];

  const toolDef = PRO_TOOLS_DEFINITIONS.find((t) => t.key === blockedFormatKey);
  const fmtDef = ALL_SUPPORTED_FORMATS.find((f) => f.key === blockedFormatKey);
  const fmtDisplay = toolDef
    ? isAr
      ? toolDef.labelAr
      : toolDef.labelEn
    : fmtDef
      ? isAr
        ? fmtDef.labelAr
        : fmtDef.labelEn
      : blockedFormatKey.toUpperCase();

  const packageTitle = isAr ? settings.proPackageNameAr : settings.proPackageNameEn;
  const packageDesc = isAr ? settings.proDescriptionAr : settings.proDescriptionEn;
  const activePlanName = activePlan ? (isAr ? activePlan.nameAr : activePlan.nameEn) : packageTitle;
  const activePlanPeriod = activePlan
    ? isAr
      ? activePlan.periodAr
      : activePlan.periodEn
    : isAr
      ? settings.proPeriodAr
      : settings.proPeriodEn;
  const activePlanPrice = activePlan ? activePlan.price : settings.proPrice;

  const waMessage = isAr
    ? `${settings.whatsappDefaultMsgAr}\n📦 الباقة المختارة: ${packageTitle} — ${activePlanName} (${activePlanPeriod})\n💰 المبلغ: ${activePlanPrice} ${settings.proCurrency}\n🎬 الصيغة المطلوبة: ${fmtDisplay}${currentUser ? `\n👤 الاسم: ${currentUser.name}\n📧 البريد الإلكتروني: ${currentUser.email}` : ''}`
    : `${settings.whatsappDefaultMsgEn}\n📦 Selected Plan: ${packageTitle} — ${activePlanName} (${activePlanPeriod})\n💰 Price: ${activePlanPrice} ${settings.proCurrency}\n🎬 Format: ${fmtDisplay}${currentUser ? `\n👤 Name: ${currentUser.name}\n📧 Email: ${currentUser.email}` : ''}`;

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
          width: 'min(580px, 96vw)',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: 'linear-gradient(180deg, #161326 0%, #0e0e16 100%)',
          border: '1px solid rgba(245, 158, 11, 0.45)',
          borderRadius: '18px',
          padding: '22px',
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

        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
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
          <h2 style={{ margin: '10px 0 4px', fontSize: '20px', fontWeight: 800, color: '#fff' }}>
            {t.proModalTitle}
          </h2>
          <p style={{ margin: 0, fontSize: '12.5px', color: '#b4b4c8', lineHeight: 1.5 }}>
            {isAr
              ? 'اختر مدة الاشتراك المناسبة لك (أسبوع / شهر / 3 شهور / سنة) لتفعيل جميع أدوات وصيغ برو فوراً'
              : 'Choose your preferred subscription duration (1 Week / 1 Month / 3 Months / 1 Year) to unlock all Pro tools'}
          </p>
        </div>

        {toolDef && (
          <div
            id="proModalToolExhaustedAlert"
            style={{
              background: 'rgba(239, 68, 68, 0.16)',
              border: '1px solid rgba(239, 68, 68, 0.45)',
              borderRadius: '11px',
              padding: '10px 14px',
              marginBottom: '14px',
              fontSize: '12px',
              color: '#fca5a5',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '16px' }}>🔒</span>
            <span>
              {isAr
                ? `ميزة "${toolDef.labelAr}" تتطلب اشتراكاً في باقة برو (أو استنفدت محاولات التجربة المجانية المتاحة لها). اشترك الآن للوصول غير المحدود!`
                : `The feature "${toolDef.labelEn}" requires a Pro subscription (or free trial attempts have been exhausted). Subscribe now for unlimited access!`}
            </span>
          </div>
        )}

        {/* If user is logged in and has an active Pro subscription, show their current duration & expiration */}
        {currentUser && (() => {
          const subInfo = getUserProSubscriptionInfo(currentUser, settings);
          if (!subInfo.isActive || subInfo.isPermanentAdmin) return null;
          return (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.14), rgba(245, 158, 11, 0.14))',
                border: '1px solid rgba(16, 185, 129, 0.45)',
                borderRadius: '12px',
                padding: '10px 14px',
                marginBottom: '14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                fontSize: '11.5px',
              }}
            >
              <div>
                <div style={{ fontWeight: 800, color: '#6ee7b7' }}>
                  ✅ {isAr ? `اشتراكك الحالي مفعل: ${subInfo.planNameAr} (${subInfo.durationDays} يوم)` : `Active Plan: ${subInfo.planNameEn} (${subInfo.durationDays} days)`}
                </div>
                {subInfo.expiresAtIso && (
                  <div style={{ color: '#fde047', fontWeight: 700, marginTop: '2px' }}>
                    ⏳ {isAr ? `المدة المتبقية: ${subInfo.remainingDays} يوم و ${subInfo.remainingHours} ساعة` : `Remaining: ${subInfo.remainingDays}d ${subInfo.remainingHours}h`} •{' '}
                    <span style={{ color: '#cbd5e1' }}>
                      {isAr ? 'ينتهي في:' : 'Expires:'}{' '}
                      {new Date(subInfo.expiresAtIso).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Multi-Plan Duration Selector Grid (أسبوع / شهر / 3 شهور / سنة) */}
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 800,
              color: '#fde047',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>
              {isAr ? '✨ اختر باقة الاشتراك المناسبة لك:' : '✨ Select Your Subscription Plan:'}
            </span>
            <span style={{ fontSize: '11px', color: '#a5b4fc', fontWeight: 600 }}>
              🔒 {fmtDisplay}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(122px, 1fr))',
              gap: '10px',
            }}
          >
            {displayPlans.map((plan) => {
              const isSelected = activePlan?.id === plan.id;
              const badgeText = isAr ? plan.badgeAr : plan.badgeEn;
              return (
                <button
                  key={plan.id}
                  type="button"
                  id={`proPlanCard_${plan.id}`}
                  onClick={() => setSelectedPlanId(plan.id)}
                  style={{
                    position: 'relative',
                    textAlign: 'center',
                    padding: '14px 10px 12px',
                    borderRadius: '12px',
                    border: isSelected
                      ? '2px solid #f59e0b'
                      : '1px solid rgba(124, 92, 255, 0.3)',
                    background: isSelected
                      ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.22) 0%, rgba(124, 92, 255, 0.18) 100%)'
                      : '#12121e',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    boxShadow: isSelected
                      ? '0 8px 24px rgba(245, 158, 11, 0.25)'
                      : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {badgeText && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '-9px',
                        background: isSelected ? '#f59e0b' : '#312e81',
                        color: isSelected ? '#000' : '#e0e7ff',
                        fontSize: '9.5px',
                        fontWeight: 900,
                        padding: '2px 8px',
                        borderRadius: '99px',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                      }}
                    >
                      {badgeText}
                    </span>
                  )}

                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: '13.5px',
                      color: isSelected ? '#fde047' : '#e2e8f0',
                      marginTop: '4px',
                    }}
                  >
                    {isAr ? plan.nameAr : plan.nameEn}
                  </div>

                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>
                    {plan.price}{' '}
                    <span style={{ fontSize: '13px', color: '#fde047', fontWeight: 800 }}>
                      {settings.proCurrency}
                    </span>
                  </div>

                  <div style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 600 }}>
                    {isAr ? plan.periodAr : plan.periodEn}
                  </div>

                  <div
                    style={{
                      marginTop: '2px',
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '2px 10px',
                      borderRadius: '99px',
                      background: isSelected ? '#f59e0b' : 'rgba(255,255,255,0.06)',
                      color: isSelected ? '#000' : '#94a3b8',
                    }}
                  >
                    {isSelected
                      ? isAr
                        ? '✓ الباقة المختارة'
                        : '✓ Selected'
                      : isAr
                        ? 'اختيار الباقة'
                        : 'Select'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Plan & Format Highlight Summary Box */}
        <div
          style={{
            background: 'rgba(124, 92, 255, 0.12)',
            border: '1px solid rgba(124, 92, 255, 0.35)',
            borderRadius: '12px',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '14px',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: '#a5b4fc' }}>
              {isAr ? 'الباقة والمدة المختارة:' : 'Selected Plan & Duration:'}
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#fde047', marginTop: '2px' }}>
              👑 {activePlanName} — <span style={{ color: '#fff', fontSize: '12px' }}>{activePlanPeriod}</span>
            </div>
          </div>

          <div style={{ textAlign: isAr ? 'left' : 'right' }}>
            <div style={{ fontSize: '11px', color: '#a5b4fc' }}>{t.proPriceLabel}</div>
            <div style={{ fontSize: '21px', fontWeight: 900, color: '#fff' }}>
              {activePlanPrice}{' '}
              <span style={{ fontSize: '15px', color: '#fde047' }}>{settings.proCurrency}</span>
            </div>
          </div>
        </div>

        {/* Description & Features */}
        <div
          style={{
            background: '#11111a',
            border: '1px solid #232336',
            borderRadius: '12px',
            padding: '12px 14px',
            marginBottom: '16px',
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#d1d5db' }}>{packageDesc}</p>
          <div style={{ fontWeight: 700, fontSize: '12px', color: '#c4b5fd', marginBottom: '6px' }}>
            {t.proFeaturesTitle}
          </div>
          <ul
            style={{
              margin: 0,
              paddingInlineStart: '18px',
              fontSize: '11.5px',
              color: '#cbd5e1',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
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
              <span>
                {isAr
                  ? `اشترك الآن في (${activePlanName} - ${activePlanPrice} ${settings.proCurrency}) عبر واتساب`
                  : `Subscribe to (${activePlanName} - ${activePlanPrice} ${settings.proCurrency}) via WhatsApp`}
              </span>
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
  onOpenProModal?: () => void;
}

export function UserAuthModal({
  open,
  onClose,
  state,
  onLoginSuccess,
  onRegisterUser,
  onLogout,
  onOpenAdminDashboard,
  onOpenProModal,
}: UserAuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingFirstTimeUser, setPendingFirstTimeUser] = useState<UserAccount | null>(null);

  const currentUser = state.users.find((u) => u.id === state.currentUserId) || null;

  useEffect(() => {
    if (open) {
      setErrorMsg('');
      setPendingFirstTimeUser(null);
      setIsSwitchingAccount(false);
      setShowPassword(false);
    }
  }, [open, state.currentUserId]);

  if (!open) return null;
  const isAr = state.language === 'ar';
  const t = getTranslation(state.language);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const nameClean = fullName.replace(/[<>]/g, '').trim();
    const emailClean = email.trim().toLowerCase();
    const pwdClean = password.trim();

    // Case 1: Completing one-time name setup for an account that never had a name set
    if (pendingFirstTimeUser) {
      if (!nameClean) {
        setErrorMsg(
          isAr
            ? 'يرجى اختيار اسمك الشخصي لمرة واحدة لتثبيته على حسابك'
            : 'Please choose your display name once to lock it to your account'
        );
        return;
      }
      const lockedUser = resolveAuthenticatedUserOnLogin(pendingFirstTimeUser, nameClean);
      onRegisterUser(lockedUser);
      onLoginSuccess(lockedUser.id);
      setPendingFirstTimeUser(null);
      setIsSwitchingAccount(false);
      setFullName('');
      setPassword('');
      onClose();
      if (canAccessAdminDashboard(lockedUser)) {
        onOpenAdminDashboard();
      }
      return;
    }

    if (mode === 'register' && !nameClean) {
      setErrorMsg(
        isAr
          ? 'يرجى إدخال الاسم الشخصي الخاص بك (يُحدد لمرة واحدة عند إنشاء الحساب)'
          : 'Please enter your full name (chosen once upon account creation)'
      );
      return;
    }
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
      let isFromRemote = false;

      // If not in local state, query Firestore directly for cross-device / fresh sessions
      if (!found) {
        try {
          const remoteUsers = await fetchFirestoreUsers();
          const remoteFound = remoteUsers.find(
            (u) => u.email.toLowerCase() === emailClean && !isPurgedLegacyAdmin(u)
          );
          if (remoteFound) {
            found = remoteFound;
            isFromRemote = true;
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

      // Check if this account has never chosen a display name (e.g. blank name or explicitly unlocked)
      const existingCleanName = typeof found.name === 'string' ? found.name.replace(/[<>]/g, '').trim() : '';
      if (!existingCleanName || found.nameLocked === false) {
        setPendingFirstTimeUser(found);
        setFullName('');
        return;
      }

      // Account already has its locked name -> NEVER ask for or overwrite the name on login!
      const finalAuthenticatedUser = resolveAuthenticatedUserOnLogin(found);

      if (isFromRemote || found.nameLocked !== true) {
        onRegisterUser(finalAuthenticatedUser);
      }

      onLoginSuccess(finalAuthenticatedUser.id);
      setIsSwitchingAccount(false);
      setPassword('');
      onClose();
      if (canAccessAdminDashboard(finalAuthenticatedUser)) {
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
            ? 'هذا البريد الإلكتروني مسجل بالفعل، يرجى تسجيل الدخول بالبريد وكلمة السر.'
            : 'This email is already registered, please sign in with email and password.'
        );
        return;
      }

      const newUser: UserAccount = {
        id: 'usr_' + Date.now(),
        name: nameClean || emailClean.split('@')[0],
        nameLocked: true,
        email: emailClean,
        password: pwdClean,
        role: 'user',
        isPro: false,
        createdAt: new Date().toISOString(),
      };
      onRegisterUser(newUser);
      onLoginSuccess(newUser.id);
      setIsSwitchingAccount(false);
      setFullName('');
      setPassword('');
      onClose();
    }
  };

  const hasCurrentAdminAccess = canAccessAdminDashboard(currentUser);
  const isCurrentSuperAdmin = isSuperAdminUser(currentUser);
  const currentEffectivePerms = getEffectiveAdminPermissions(currentUser);
  const showProfileView = Boolean(currentUser && !isSwitchingAccount && !pendingFirstTimeUser);

  return (
    <div
      role="dialog"
      aria-label={
        showProfileView
          ? isAr
            ? 'صفحة حساب المستخدم والبروفايل الشخصي'
            : 'User Account & Profile'
          : mode === 'login'
            ? t.authModalTitleLogin
            : t.authModalTitleRegister
      }
      dir={isAr ? 'rtl' : 'ltr'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(6, 6, 12, 0.84)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: showProfileView ? 'min(540px, 96vw)' : 'min(440px, 95vw)',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: '#11111b',
          border: '1px solid #27273f',
          borderRadius: '20px',
          padding: '24px',
          color: '#fff',
          boxShadow: '0 24px 70px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        {/* Top Modal Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #222236',
            paddingBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: showProfileView
                  ? 'linear-gradient(135deg, rgba(124, 92, 255, 0.22), rgba(16, 185, 129, 0.16))'
                  : 'rgba(124, 92, 255, 0.16)',
                border: '1px solid rgba(124, 92, 255, 0.4)',
                display: 'grid',
                placeItems: 'center',
                fontSize: '17px',
              }}
            >
              {showProfileView ? '👤' : mode === 'login' ? '🔑' : '✨'}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#f8fafc' }}>
                {showProfileView
                  ? isAr
                    ? 'صفحة حسابي والبروفايل الشخصي'
                    : 'My Account & Profile'
                  : pendingFirstTimeUser
                    ? isAr
                      ? 'تثبيت الاسم الشخصي لأول مرة'
                      : 'First-Time Display Name Setup'
                    : mode === 'login'
                      ? isAr
                        ? 'تسجيل الدخول إلى الحساب'
                        : 'Sign In to Account'
                      : isAr
                        ? 'إنشاء حساب مستخدم جديد'
                        : 'Create New Account'}
              </h3>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                {showProfileView
                  ? isAr
                    ? 'إدارة بيانات حسابك، حالة الاشتراك، والصلاحيات في مكان واحد'
                    : 'Manage your account details, subscription status, and permissions'
                  : pendingFirstTimeUser
                    ? isAr
                      ? 'اختر اسمك لمرة واحدة فقط ولن يُطلب منك مجدداً عند الدخول'
                      : 'Choose your display name once; it will be locked for future logins'
                    : mode === 'login'
                      ? isAr
                        ? 'أدخل البريد الإلكتروني وكلمة السر فقط لفتح حسابك'
                        : 'Enter your email and password only to open your account'
                      : isAr
                        ? 'حدد اسمك الشخصي لمرة واحدة عند التسجيل مع البريد وكلمة السر'
                        : 'Choose your permanent display name once along with email & password'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={isAr ? 'إغلاق' : 'Close'}
            style={{
              background: '#191927',
              border: '1px solid #2e2e46',
              color: '#cbd5e1',
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              fontSize: '14px',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* =====================================================================
            VIEW A: ORGANIZED PROFESSIONAL USER PROFILE PAGE (When Logged In)
           ===================================================================== */}
        {showProfileView && currentUser && (() => {
          const subInfo = getUserProSubscriptionInfo(currentUser, state.settings);
          const initials = (currentUser.name || currentUser.email || 'U')
            .trim()
            .slice(0, 2)
            .toUpperCase();

          return (
            <div
              id="userProfileSubscriptionCard"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* 1. User Hero Identity Banner */}
              <div
                style={{
                  background: hasCurrentAdminAccess
                    ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(16, 185, 129, 0.12))'
                    : subInfo.isActive
                      ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.16), rgba(124, 92, 255, 0.12))'
                      : 'linear-gradient(135deg, #171726, #141422)',
                  border: hasCurrentAdminAccess
                    ? '1px solid rgba(124, 92, 255, 0.5)'
                    : subInfo.isActive
                      ? '1px solid rgba(245, 158, 11, 0.45)'
                      : '1px solid #282840',
                  borderRadius: '16px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '54px',
                      height: '54px',
                      borderRadius: '14px',
                      background: hasCurrentAdminAccess
                        ? 'linear-gradient(135deg, #7c5cff, #4f46e5)'
                        : subInfo.isActive
                          ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                          : 'linear-gradient(135deg, #334155, #1e293b)',
                      color: subInfo.isActive && !hasCurrentAdminAccess ? '#000' : '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: '19px',
                      fontWeight: 900,
                      boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
                      flexShrink: 0,
                    }}
                  >
                    {hasCurrentAdminAccess ? (isCurrentSuperAdmin ? '👑' : '🛡️') : subInfo.isActive ? '👑' : initials}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '17px', fontWeight: 900, color: '#fff' }}>
                        {currentUser.name}
                      </span>
                      <span
                        title={
                          isAr
                            ? 'الاسم الشخصي مثبت على الحساب ولا يتغير عند تسجيل الدخول'
                            : 'Display name is permanently locked to your account'
                        }
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: 'rgba(148, 163, 184, 0.14)',
                          border: '1px solid rgba(148, 163, 184, 0.3)',
                          color: '#cbd5e1',
                        }}
                      >
                        🔒 {isAr ? 'اسم الحساب ثابت' : 'Locked Name'}
                      </span>
                    </div>

                    <div style={{ fontSize: '12.5px', color: '#a5b4fc', fontWeight: 600, marginTop: '3px' }}>
                      {currentUser.email}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                      {hasCurrentAdminAccess ? (
                        <span
                          id="userModalAdminBadge"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 10px',
                            borderRadius: '6px',
                            background: isCurrentSuperAdmin
                              ? 'linear-gradient(135deg, #7c5cff, #4f46e5)'
                              : 'linear-gradient(135deg, #10b981, #059669)',
                            color: '#fff',
                            fontSize: '10.5px',
                            fontWeight: 800,
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
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 10px',
                            borderRadius: '6px',
                            background: subInfo.isActive
                              ? 'rgba(245, 158, 11, 0.2)'
                              : 'rgba(100, 116, 139, 0.2)',
                            border: subInfo.isActive
                              ? '1px solid rgba(245, 158, 11, 0.5)'
                              : '1px solid #475569',
                            color: subInfo.isActive ? '#fde047' : '#cbd5e1',
                            fontSize: '11px',
                            fontWeight: 800,
                          }}
                        >
                          {subInfo.isActive
                            ? `👑 ${t.authStatusPro} — (${isAr ? subInfo.planNameAr : subInfo.planNameEn})`
                            : `👤 ${t.authStatusFree}`}
                        </span>
                      )}

                      {canUserCaptureScreen(currentUser) && (
                        <span
                          id="userModalScreenCaptureBadge"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 10px',
                            borderRadius: '6px',
                            background: 'rgba(6, 182, 212, 0.2)',
                            border: '1px solid rgba(6, 182, 212, 0.55)',
                            color: '#67e8f9',
                            fontSize: '10.5px',
                            fontWeight: 800,
                          }}
                        >
                          📸{' '}
                          {isAr
                            ? 'مصرح بتصوير الشاشة وتسجيل الفيديو'
                            : 'Screen Capture & Video Allowed'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Organized Account Details Grid */}
              <div
                id="userProfileAccountInfoBox"
                style={{
                  background: '#151522',
                  border: '1px solid #25253a',
                  borderRadius: '14px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>📋 {isAr ? 'البيانات الأساسية للحساب' : 'Account Information'}</span>
                  <span style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 600 }}>
                    {isAr ? 'محفوظة ومؤمنة تلقائياً' : 'Saved & Secured'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
                    gap: '10px',
                  }}
                >
                  <div
                    style={{
                      background: '#10101a',
                      border: '1px solid #222236',
                      borderRadius: '10px',
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                      {isAr ? 'الاسم الشخصي (ثابت):' : 'Display Name (Locked):'}
                    </div>
                    <div
                      style={{
                        fontSize: '13px',
                        fontWeight: 800,
                        color: '#f8fafc',
                        marginTop: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                      }}
                    >
                      <span>{currentUser.name}</span>
                      <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 700 }}>
                        🔒 {isAr ? 'مُثبت' : 'Locked'}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#10101a',
                      border: '1px solid #222236',
                      borderRadius: '10px',
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                      {isAr ? 'البريد الإلكتروني للفتح:' : 'Login Email Address:'}
                    </div>
                    <div
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: '#a5b4fc',
                        marginTop: '3px',
                        wordBreak: 'break-all',
                      }}
                    >
                      {currentUser.email}
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#10101a',
                      border: '1px solid #222236',
                      borderRadius: '10px',
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                      {isAr ? 'تاريخ إنشاء الحساب:' : 'Member Since:'}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginTop: '3px' }}>
                      📅{' '}
                      {currentUser.createdAt
                        ? new Date(currentUser.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#10101a',
                      border: '1px solid #222236',
                      borderRadius: '10px',
                      padding: '10px 12px',
                    }}
                  >
                    <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                      {isAr ? 'طريقة تسجيل الدخول:' : 'Sign-In Method:'}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#6ee7b7', marginTop: '3px' }}>
                      🔑 {isAr ? 'البريد الإلكتروني + كلمة السر فقط' : 'Email + Password Only'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Subscription Duration & Expiration Details inside Profile */}
              {!hasCurrentAdminAccess && (
                <div
                  id="profileSubscriptionDetailsBox"
                  style={{
                    background: '#151522',
                    border: subInfo.isActive ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid #25253a',
                    borderRadius: '14px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: subInfo.isActive ? '#fde047' : '#e2e8f0' }}>
                      {subInfo.isActive
                        ? isAr
                          ? '👑 تفاصيل اشتراك باقة برو في حسابك'
                          : '👑 Your Pro Subscription Details'
                        : isAr
                          ? '📦 حالة الاشتراك والباقة الحالية'
                          : '📦 Current Subscription & Plan'}
                    </span>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 800,
                        padding: '3px 9px',
                        borderRadius: '6px',
                        background: subInfo.isActive ? 'rgba(16, 185, 129, 0.18)' : 'rgba(100, 116, 139, 0.2)',
                        border: subInfo.isActive ? '1px solid #10b981' : '1px solid #475569',
                        color: subInfo.isActive ? '#6ee7b7' : '#94a3b8',
                      }}
                    >
                      {subInfo.isActive
                        ? isAr
                          ? '✅ اشتراك برو مفعل'
                          : '✅ Active Pro'
                        : isAr
                          ? '👤 مستخدم عادي (مجاني)'
                          : '👤 Regular Free User'}
                    </span>
                  </div>

                  {subInfo.isActive ? (
                    <>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                          gap: '8px',
                        }}
                      >
                        <div style={{ background: '#10101a', padding: '9px 11px', borderRadius: '10px', border: '1px solid #222236' }}>
                          <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                            {isAr ? 'الباقة ومدة الاشتراك:' : 'Plan & Duration:'}
                          </div>
                          <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#fde047', marginTop: '3px' }}>
                            {isAr ? subInfo.planNameAr : subInfo.planNameEn} ({subInfo.durationDays} {isAr ? 'يوم' : 'days'})
                          </div>
                        </div>

                        <div style={{ background: '#10101a', padding: '9px 11px', borderRadius: '10px', border: '1px solid #222236' }}>
                          <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                            {isAr ? 'المدة المتبقية للانتهاء:' : 'Remaining Time:'}
                          </div>
                          <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#6ee7b7', marginTop: '3px' }}>
                            ⏳ {isAr ? `${subInfo.remainingDays} يوم و ${subInfo.remainingHours} ساعة` : `${subInfo.remainingDays}d ${subInfo.remainingHours}h`}
                          </div>
                        </div>

                        {subInfo.activatedAtIso && (
                          <div style={{ background: '#10101a', padding: '9px 11px', borderRadius: '10px', border: '1px solid #222236' }}>
                            <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                              {isAr ? 'تاريخ بداية الاشتراك:' : 'Subscription Start Date:'}
                            </div>
                            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#e2e8f0', marginTop: '3px' }}>
                              📅 {new Date(subInfo.activatedAtIso).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                          </div>
                        )}

                        {subInfo.expiresAtIso && (
                          <div style={{ background: '#10101a', padding: '9px 11px', borderRadius: '10px', border: '1px solid rgba(245, 158, 11, 0.35)' }}>
                            <div style={{ fontSize: '10px', color: '#fde047' }}>
                              {isAr ? 'تاريخ انتهاء الاشتراك:' : 'Subscription End Date:'}
                            </div>
                            <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#fef08a', marginTop: '3px' }}>
                              ⏰ {new Date(subInfo.expiresAtIso).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Progress Bar of Remaining Subscription Time */}
                      <div style={{ marginTop: '2px' }}>
                        <div
                          style={{
                            height: '7px',
                            borderRadius: '99px',
                            background: '#1e1e30',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${subInfo.progressPercent}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, #10b981, #f59e0b)',
                              borderRadius: '99px',
                            }}
                          />
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <span>
                            {isAr
                              ? 'تُحسب المدة من يوم الاشتراك وعند انتهائها يعود الحساب مستخدم عادي تلقائياً'
                              : 'Duration calculated from activation date; reverts to Free user upon expiry'}
                          </span>
                          {onOpenProModal && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenProModal();
                              }}
                              style={{
                                background: 'rgba(245, 158, 11, 0.18)',
                                border: '1px solid #f59e0b',
                                color: '#fde047',
                                padding: '5px 11px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              👑 {isAr ? 'تجديد أو ترقية الباقة' : 'Renew / Upgrade'}
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        background: '#10101a',
                        border: '1px solid #222236',
                        borderRadius: '10px',
                        padding: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '10px',
                      }}
                    >
                      <span style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5, flex: '1 1 220px' }}>
                        {isAr
                          ? 'أنت حالياً على الباقة المجانية. اشترك في باقة برو لفتح جميع الصيغ والأدوات الاحترافية فوراً.'
                          : 'You are currently on the Free plan. Subscribe to Pro to unlock all formats and pro tools.'}
                      </span>
                      {onOpenProModal && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenProModal();
                          }}
                          style={{
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                            border: 0,
                            color: '#000',
                            padding: '8px 14px',
                            borderRadius: '9px',
                            fontSize: '12px',
                            fontWeight: 900,
                            cursor: 'pointer',
                            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)',
                          }}
                        >
                          👑 {isAr ? 'اشتراك في باقات برو' : 'Subscribe to Pro'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 4. Granted Admin Permissions Section (For Super Admin / Moderators) */}
              {hasCurrentAdminAccess && (
                <div
                  style={{
                    background: '#151522',
                    border: '1px solid rgba(124, 92, 255, 0.4)',
                    borderRadius: '14px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 800 }}>
                      {isAr ? '✨ صلاحيات الإدارة الممنوحة لحسابك:' : '✨ Your Granted Admin Permissions:'}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAdminDashboard();
                      }}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '9px',
                        background: 'linear-gradient(135deg, #7c5cff, #5a2fd0)',
                        border: 0,
                        color: '#fff',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(124, 92, 255, 0.35)',
                      }}
                    >
                      ⚙️ {t.navAdminDashboard}
                    </button>
                  </div>

                  {currentEffectivePerms.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {ALL_ADMIN_PERMISSIONS.filter((p) => currentEffectivePerms.includes(p.key)).map((perm) => (
                        <span
                          key={perm.key}
                          style={{
                            fontSize: '10.5px',
                            padding: '4px 9px',
                            borderRadius: '7px',
                            background: '#10101a',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            color: '#a7f3d0',
                            fontWeight: 700,
                          }}
                        >
                          {perm.icon} {isAr ? perm.labelAr : perm.labelEn}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 5. Clean Profile Footer Actions: Switch Account or Sign Out */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                  paddingTop: '4px',
                  borderTop: '1px solid #222236',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  id="switchAccountViewBtn"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                    setEmail('');
                    setPassword('');
                    setIsSwitchingAccount(true);
                  }}
                  style={{
                    flex: '1 1 180px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: '#181828',
                    border: '1px solid #2e2e48',
                    color: '#cbd5e1',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🔄 {isAr ? 'تبديل الحساب (دخول بحساب آخر)' : 'Switch Account'}
                </button>

                <button
                  type="button"
                  onClick={onLogout}
                  style={{
                    flex: '1 1 140px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(239, 68, 68, 0.14)',
                    border: '1px solid rgba(239, 68, 68, 0.5)',
                    color: '#fca5a5',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  🚪 {t.authLogout}
                </button>
              </div>
            </div>
          );
        })()}

        {/* =====================================================================
            VIEW B: CLEAN SIGN IN (Email + Password ONLY) & REGISTER (First-Time Name)
           ===================================================================== */}
        {!showProfileView && (
          <>
            {/* Back to current profile button if user clicked "Switch Account" while logged in */}
            {currentUser && !pendingFirstTimeUser && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#161625',
                  border: '1px solid #292942',
                  borderRadius: '10px',
                  padding: '8px 12px',
                }}
              >
                <span style={{ fontSize: '11.5px', color: '#cbd5e1', fontWeight: 600 }}>
                  👤 {isAr ? `الحساب الحالي: ${currentUser.name}` : `Current: ${currentUser.name}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsSwitchingAccount(false);
                    setErrorMsg('');
                  }}
                  style={{
                    background: 'rgba(124, 92, 255, 0.18)',
                    border: '1px solid rgba(124, 92, 255, 0.45)',
                    color: '#c4b5fd',
                    borderRadius: '7px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? '← العودة لصفحة حسابي' : '← Back to My Profile'}
                </button>
              </div>
            )}

            {/* Mode Switcher Tabs: Login vs Register (hidden only if completing 1-time name setup) */}
            {!pendingFirstTimeUser && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  background: '#0b0b13',
                  padding: '5px',
                  borderRadius: '12px',
                  border: '1px solid #222236',
                }}
              >
                <button
                  type="button"
                  id="authTabLoginBtn"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                  }}
                  style={{
                    padding: '9px 10px',
                    borderRadius: '9px',
                    border: 0,
                    background: mode === 'login' ? 'linear-gradient(135deg, #7c5cff, #5a2fd0)' : 'transparent',
                    color: mode === 'login' ? '#fff' : '#9494aa',
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontSize: '13px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  🔑 {isAr ? 'تسجيل الدخول' : 'Sign In'}
                </button>
                <button
                  type="button"
                  id="authTabRegisterBtn"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg('');
                  }}
                  style={{
                    padding: '9px 10px',
                    borderRadius: '9px',
                    border: 0,
                    background: mode === 'register' ? 'linear-gradient(135deg, #7c5cff, #5a2fd0)' : 'transparent',
                    color: mode === 'register' ? '#fff' : '#9494aa',
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontSize: '13px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  ✨ {isAr ? 'إنشاء حساب جديد' : 'Create Account'}
                </button>
              </div>
            )}

            {/* Auth Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* First-time-only Name Input: ONLY shown during 'register' OR if an account has never set its name */}
              {(mode === 'register' || pendingFirstTimeUser) && (
                <div
                  style={{
                    background: '#151524',
                    border: '1px solid rgba(124, 92, 255, 0.35)',
                    borderRadius: '12px',
                    padding: '12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '6px',
                      flexWrap: 'wrap',
                      gap: '4px',
                    }}
                  >
                    <label
                      htmlFor="authUserNameInput"
                      style={{ fontSize: '12.5px', color: '#f8fafc', fontWeight: 800 }}
                    >
                      👤 {isAr ? 'الاسم الشخصي (يُحدد لأول مرة فقط) *' : 'Display Name (First-time only) *'}
                    </label>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        background: 'rgba(16, 185, 129, 0.16)',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        color: '#6ee7b7',
                        fontWeight: 700,
                      }}
                    >
                      🔒 {isAr ? 'يثبت دائماً ولا يُطلب عند الدخول' : 'Locked permanently'}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="authUserNameInput"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={isAr ? 'اكتب اسمك هنا (مثال: محمد أحمد)' : 'Enter your name (e.g. John Doe)'}
                    style={{
                      width: '100%',
                      background: '#0e0e18',
                      border: '1px solid #2e2e46',
                      borderRadius: '9px',
                      padding: '10px 12px',
                      color: '#fff',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '6px', lineHeight: 1.4 }}>
                    {isAr
                      ? '💡 يتم اختيار الاسم لمرة واحدة فقط عند إنشاء الحساب، وبعد ذلك تفتح حسابك بالبريد الإلكتروني وكلمة السر فقط.'
                      : '💡 Name is chosen once upon registration. Afterwards, you sign in using only your email and password.'}
                  </div>
                </div>
              )}

              {/* Email & Password Fields (Shown in both login and register; hidden only if in step 2 of pendingFirstTimeUser) */}
              {!pendingFirstTimeUser && (
                <>
                  <div>
                    <label
                      htmlFor="authEmailInput"
                      style={{ display: 'block', fontSize: '12.5px', color: '#e2e8f0', marginBottom: '6px', fontWeight: 700 }}
                    >
                      📧 {isAr ? 'البريد الإلكتروني *' : 'Email Address *'}
                    </label>
                    <input
                      type="email"
                      id="authEmailInput"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      style={{
                        width: '100%',
                        background: '#141420',
                        border: '1px solid #2e2e46',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        color: '#fff',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="authPasswordInput"
                      style={{ display: 'block', fontSize: '12.5px', color: '#e2e8f0', marginBottom: '6px', fontWeight: 700 }}
                    >
                      🔒 {isAr ? 'كلمة السر *' : 'Password *'}
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="authPasswordInput"
                        required
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        style={{
                          width: '100%',
                          background: '#141420',
                          border: '1px solid #2e2e46',
                          borderRadius: '10px',
                          padding: '10px 38px 10px 12px',
                          color: '#fff',
                          fontSize: '14px',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        style={{
                          position: 'absolute',
                          insetInlineEnd: '8px',
                          background: 'transparent',
                          border: 0,
                          color: '#94a3b8',
                          cursor: 'pointer',
                          fontSize: '14px',
                          padding: '4px',
                        }}
                      >
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {errorMsg && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.14)',
                    border: '1px solid #ef4444',
                    borderRadius: '10px',
                    padding: '9px 12px',
                    color: '#fca5a5',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  ⚠️ {errorMsg}
                </div>
              )}

              <button
                type="submit"
                id="authSubmitBtn"
                style={{
                  marginTop: '4px',
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #7c5cff, #5a2fd0)',
                  border: 0,
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 6px 20px rgba(124, 92, 255, 0.35)',
                }}
              >
                {pendingFirstTimeUser
                  ? isAr
                    ? '✅ تثبيت الاسم وفتح الحساب'
                    : '✅ Lock Name & Open Account'
                  : mode === 'login'
                    ? isAr
                      ? '🔑 دخول إلى الحساب (بالبريد وكلمة السر)'
                      : '🔑 Sign In to Account'
                    : isAr
                      ? '✨ إنشاء الحساب الآن وتثبيت الاسم'
                      : '✨ Create Account Now'}
              </button>
            </form>
          </>
        )}
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
