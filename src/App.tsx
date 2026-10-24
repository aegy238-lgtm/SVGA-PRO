import { useEffect, useRef, useState } from 'react';
import { initMotionToolsFixed } from './engine/motionTools';
import SvgaAeEditor from './components/SvgaAeEditor';
import AdminDashboardModal from './components/AdminDashboardModal';
import {
  NotificationsPopover,
  ProSubscriptionModal,
  UserAuthModal,
} from './components/PlatformModals';
import {
  ActivityLogEntry,
  BroadcastNotification,
  PlatformSettings,
  PlatformState,
  UserAccount,
  INITIAL_USERS,
  buildWhatsAppUrl,
  checkConversionPermission,
  loadPlatformState,
  savePlatformState,
  getDeletedUserIds,
  addDeletedUserId,
} from './utils/platformStore';
import { getTranslation } from './utils/i18n';
import {
  firebaseConfig,
  testFirebaseConnection,
  subscribeToFirebaseStatus,
  syncSettingsToFirestore,
  fetchFirestoreSettings,
  subscribeToFirestoreSettings,
  syncUsersToFirestore,
  saveUserToFirestore,
  subscribeToFirestoreUsers,
  fetchFirestoreUsers,
  syncNotificationsToFirestore,
  fetchFirestoreNotifications,
  subscribeToFirestoreNotifications,
  subscribeToFirestoreActivityLogs,
  fetchFirestoreActivityLogs,
  saveActivityLogToFirestore,
  FirebaseConnectionStatus,
} from './utils/firebase';

export default function App() {
  const [aeModalOpen, setAeModalOpen] = useState(false);
  const [externalSvgaFile, setExternalSvgaFile] = useState<File | null>(null);
  const [edgeFeatherPx, setEdgeFeatherPx] = useState(0);
  const [watermarkText, setWatermarkText] = useState('');

  const [platformState, setPlatformState] = useState<PlatformState>(() => loadPlatformState());
  const { settings, users, currentUserId, notifications, readNotificationIds, adminPreviewRole } =
    platformState;
  const currentUser = users.find((u) => u.id === currentUserId) || null;
  const isAdminUser =
    currentUser?.role === 'admin' ||
    currentUser?.email === 'aegy238@gmail.com';

  const [adminOpen, setAdminOpen] = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState<
    'users' | 'pro' | 'branding' | 'notifications' | 'firebase'
  >('users');
  const [firebaseStatus, setFirebaseStatus] = useState<FirebaseConnectionStatus>({
    isConfigured: true,
    isConnected: false,
    isTesting: false,
    projectId: firebaseConfig.projectId,
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [proModalOpen, setProModalOpen] = useState(false);
  const [blockedFormatKey, setBlockedFormatKey] = useState('svga');
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [screenShieldActive, setScreenShieldActive] = useState(false);

  const stateRef = useRef(platformState);
  stateRef.current = platformState;

  const updatePlatformState = (updater: (prev: PlatformState) => PlatformState) => {
    setPlatformState((prev) => {
      const next = updater(prev);
      savePlatformState(next);
      return next;
    });
  };

  useEffect(() => {
    document.title = `${platformState.settings.siteName || 'MotionTools'} — SVGA, VAP, YYEVA & Motion Converter`;
  }, [platformState.settings.siteName]);

  useEffect(() => {
    const unsub = subscribeToFirebaseStatus((status) => {
      setFirebaseStatus(status);
    });
    // Automatic ping and live connection verification on boot
    testFirebaseConnection();
    return unsub;
  }, []);

  // Full real-time synchronization with Firebase Firestore (Settings, Users, Notifications)
  useEffect(() => {
    // 1. Settings Real-Time Listener (Logo, Site Name, Pro Pricing, Formats, WhatsApp)
    const unsubSettings = subscribeToFirestoreSettings((liveSettings) => {
      if (!liveSettings || !liveSettings.siteName) return;
      updatePlatformState((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          ...liveSettings,
        },
      }));
    });

    // Initial fetch of settings from Firestore
    fetchFirestoreSettings().then((remoteSettings) => {
      if (remoteSettings && remoteSettings.siteName) {
        updatePlatformState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            ...remoteSettings,
          },
        }));
      } else {
        // Bootstrap initial platform settings to Firestore
        syncSettingsToFirestore(stateRef.current.settings);
      }
    });

    // 2. Users Real-Time Listener
    const unsubUsers = subscribeToFirestoreUsers((liveUsers) => {
      if (!liveUsers) return;
      const deletedIds = getDeletedUserIds();
      updatePlatformState((prev) => {
        const cleanLive = liveUsers.filter(
          (u) => u.email.toLowerCase() !== 'admin@motiontools.com' && !deletedIds.includes(u.id)
        );
        let nextCurrentUserId = prev.currentUserId;
        if (nextCurrentUserId && !cleanLive.some((u) => u.id === nextCurrentUserId)) {
          nextCurrentUserId = null;
        }
        return {
          ...prev,
          users: cleanLive.length > 0 ? cleanLive : prev.users.filter((u) => !deletedIds.includes(u.id)),
          currentUserId: nextCurrentUserId,
        };
      });
    });

    // Initial fetch of users from Firestore
    fetchFirestoreUsers().then((fetched) => {
      if (fetched && fetched.length > 0) {
        const deletedIds = getDeletedUserIds();
        updatePlatformState((prev) => {
          const cleanUsers = fetched.filter(
            (u) => u.email.toLowerCase() !== 'admin@motiontools.com' && !deletedIds.includes(u.id)
          );
          let nextCurrentUserId = prev.currentUserId;
          if (nextCurrentUserId && !cleanUsers.some((u) => u.id === nextCurrentUserId)) {
            nextCurrentUserId = null;
          }
          return {
            ...prev,
            users: cleanUsers.length > 0 ? cleanUsers : prev.users.filter((u) => !deletedIds.includes(u.id)),
            currentUserId: nextCurrentUserId,
          };
        });
      }
    });

    // 3. Notifications Real-Time Listener
    const unsubNotifs = subscribeToFirestoreNotifications((liveNotifs) => {
      if (!liveNotifs || liveNotifs.length === 0) return;
      updatePlatformState((prev) => ({
        ...prev,
        notifications: liveNotifs,
      }));
    });

    // Initial fetch of notifications from Firestore
    fetchFirestoreNotifications().then((remoteNotifs) => {
      if (remoteNotifs && remoteNotifs.length > 0) {
        updatePlatformState((prev) => ({
          ...prev,
          notifications: remoteNotifs,
        }));
      }
    });

    // 4. Activity Logs Real-Time Listener
    const unsubLogs = subscribeToFirestoreActivityLogs((liveLogs) => {
      if (!liveLogs || liveLogs.length === 0) return;
      updatePlatformState((prev) => ({
        ...prev,
        activityLogs: liveLogs,
      }));
    });

    fetchFirestoreActivityLogs().then((remoteLogs) => {
      if (remoteLogs && remoteLogs.length > 0) {
        updatePlatformState((prev) => ({
          ...prev,
          activityLogs: remoteLogs,
        }));
      }
    });

    return () => {
      unsubSettings();
      unsubUsers();
      unsubNotifs();
      unsubLogs();
    };
  }, []);



  const isSecurityEnforced =
    !isAdminUser || adminPreviewRole === 'free_user' || adminPreviewRole === 'pro_user';

  // Toggle Admin Attribute and Style on Body for Unrestricted Text Selection vs Enforced Protection
  useEffect(() => {
    if (!isSecurityEnforced) {
      document.body.setAttribute('data-role', 'admin');
      document.body.classList.add('is-admin');
      document.body.style.userSelect = 'text';
      document.body.style.webkitUserSelect = 'text';
    } else {
      document.body.removeAttribute('data-role');
      document.body.classList.remove('is-admin');
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
    }
  }, [isSecurityEnforced]);

  // Screen Shield Active Class on Body
  useEffect(() => {
    if (screenShieldActive && isSecurityEnforced) {
      document.body.classList.add('screen-shield-active');
    } else {
      document.body.classList.remove('screen-shield-active');
    }
  }, [screenShieldActive, isSecurityEnforced]);

  // Programmatic Security, Anti-Inspection & Anti-Screenshot Protection
  useEffect(() => {
    if (!isSecurityEnforced) {
      return;
    }

    const triggerShield = () => {
      setScreenShieldActive(true);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          navigator.clipboard.writeText('');
        } catch {}
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      e.preventDefault();
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Devtools shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U/S/P)
      if (
        e.key === 'F12' ||
        e.keyCode === 123 ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) ||
        ((e.ctrlKey || e.metaKey) && ['u', 'U', 's', 'S', 'p', 'P'].includes(e.key))
      ) {
        e.preventDefault();
        e.stopPropagation();
        triggerShield();
        return false;
      }

      // PrintScreen & Screenshot / Recording shortcuts (Win+Shift+S, Win+Alt+R, Cmd+Shift+3/4/5)
      if (
        e.key === 'PrintScreen' ||
        e.code === 'PrintScreen' ||
        e.keyCode === 44 ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && ['3', '4', '5', 's', 'S', 'r', 'R'].includes(e.key)) ||
        ((e.metaKey || e.altKey) && ['r', 'R'].includes(e.key) && e.shiftKey)
      ) {
        e.preventDefault();
        e.stopPropagation();
        triggerShield();
        return false;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen' || e.keyCode === 44) {
        e.preventDefault();
        e.stopPropagation();
        triggerShield();
      }
    };

    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'IMG' ||
          target.tagName === 'CANVAS' ||
          target.id === 'view' ||
          target.closest('#view'))
      ) {
        e.preventDefault();
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      e.preventDefault();
      triggerShield();
    };

    const handleVisibilityOrBlur = () => {
      if (document.hidden || !document.hasFocus()) {
        triggerShield();
      }
    };

    // Heartbeat focus monitor to instantly trigger shield if Snipping tool or Game bar opens
    const focusInterval = setInterval(() => {
      if (isSecurityEnforced && (!document.hasFocus() || document.hidden)) {
        triggerShield();
      }
    }, 600);

    window.addEventListener('contextmenu', handleContextMenu, { capture: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('dragstart', handleDragStart, { capture: true });
    window.addEventListener('copy', handleCopy, { capture: true });
    window.addEventListener('blur', handleVisibilityOrBlur, { capture: true });
    document.addEventListener('visibilitychange', handleVisibilityOrBlur, { capture: true });

    return () => {
      clearInterval(focusInterval);
      window.removeEventListener('contextmenu', handleContextMenu, { capture: true });
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      window.removeEventListener('dragstart', handleDragStart, { capture: true });
      window.removeEventListener('copy', handleCopy, { capture: true });
      window.removeEventListener('blur', handleVisibilityOrBlur, { capture: true });
      document.removeEventListener('visibilitychange', handleVisibilityOrBlur, { capture: true });
    };
  }, [isSecurityEnforced]);

  // Anti-Screen-Recording Interception (Media Capture API & MediaRecorder override)
  useEffect(() => {
    if (!isSecurityEnforced) return;

    // Overwrite getDisplayMedia
    const originalGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(
      navigator.mediaDevices
    );
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia = async () => {
        setScreenShieldActive(true);
        throw new Error('🚫 يمنع تصوير الشاشة أو تسجيل الفيديو داخل المنصة.');
      };
    }

    // Overwrite MediaRecorder constructor
    const OriginalMediaRecorder = window.MediaRecorder;
    if (OriginalMediaRecorder) {
      const CustomMediaRecorder = function (this: any, stream: MediaStream, options?: any) {
        setScreenShieldActive(true);
        throw new Error('🚫 تسجيل الشاشة والفيديو غير مسموح به في الموقع.');
      } as any;

      CustomMediaRecorder.isTypeSupported = (type: string) => false;
      (window as any).MediaRecorder = CustomMediaRecorder;
    }

    return () => {
      if (navigator.mediaDevices && originalGetDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia;
      }
      if (OriginalMediaRecorder) {
        (window as any).MediaRecorder = OriginalMediaRecorder;
      }
    };
  }, [isSecurityEnforced]);

  useEffect(() => {
    initMotionToolsFixed();
    (window as any).__openInSvgaEditor = (file: File) => {
      setExternalSvgaFile(file);
      if (file && typeof (window as any).__recordUploadActivity === 'function') {
        const ext = file.name.split('.').pop()?.toUpperCase() || 'SVGA';
        const sz = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
        (window as any).__recordUploadActivity(file.name, sz, ext);
      }
      document.querySelectorAll('.view').forEach((el) => {
        el.classList.toggle('on', el.id === 'editor');
      });
      document.querySelectorAll('nav a[data-v]').forEach((a) => {
        a.classList.toggle('on', (a as HTMLElement).dataset.v === 'editor');
      });
    };

    (window as any).__checkConversionAccess = (targetFmt: string, sourceFileName?: string) => {
      const st = stateRef.current;
      const currentUser = st.users.find((u) => u.id === st.currentUserId) || null;
      const res = checkConversionPermission(
        currentUser,
        st.settings,
        targetFmt,
        sourceFileName,
        st.adminPreviewRole
      );
      if (!res.allowed) {
        setBlockedFormatKey(res.effectiveFormatKey);
        setProModalOpen(true);
        return false;
      }
      return true;
    };

    (window as any).__recordUploadActivity = (fileName: string, fileSizeStr?: string, formatStr?: string) => {
      const st = stateRef.current;
      const currUser = st.users.find((u) => u.id === st.currentUserId) || null;
      const userName = currUser ? currUser.name : 'زائر مجاني (Guest)';
      const userEmail = currUser ? currUser.email : 'زائر غير مسجل';

      const newLog: ActivityLogEntry = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        userName,
        userEmail,
        fileName,
        fileSize: fileSizeStr || '—',
        format: (formatStr || fileName.split('.').pop() || 'SVGA').toUpperCase(),
        createdAt: new Date().toISOString(),
      };

      updatePlatformState((prev) => ({
        ...prev,
        activityLogs: [newLog, ...(prev.activityLogs || [])],
      }));

      saveActivityLogToFirestore(newLog);
    };
  }, []);

  const switchToEditor = () => {
    document.querySelectorAll('.view').forEach((el) => {
      el.classList.toggle('on', el.id === 'editor');
    });
    document.querySelectorAll('nav a[data-v]').forEach((a) => {
      a.classList.toggle('on', (a as HTMLElement).dataset.v === 'editor');
    });
  };

  const handleToggleEdgeFeather = () => {
    const next = edgeFeatherPx === 0 ? 12 : edgeFeatherPx === 12 ? 24 : 0;
    setEdgeFeatherPx(next);
    const viewEl = document.getElementById('view');
    if (viewEl) {
      viewEl.style.maskImage =
        next > 0
          ? `radial-gradient(circle, rgba(0,0,0,1) ${100 - next * 1.5}%, rgba(0,0,0,0) 100%)`
          : '';
    }
  };

  const handleToggleWatermark = () => {
    const brandName = platformState.settings.siteName || 'MotionTools';
    const next = watermarkText ? '' : brandName;
    setWatermarkText(next);
    const stageEl = document.getElementById('stage');
    if (!stageEl) return;
    let wm = document.getElementById('stageWatermark');
    if (!next) {
      wm?.remove();
    } else {
      if (!wm) {
        wm = document.createElement('div');
        wm.id = 'stageWatermark';
        wm.style.cssText =
          'position:absolute;right:18px;bottom:52px;padding:4px 10px;border-radius:6px;background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.2);color:#fff;font-weight:700;font-size:12px;pointer-events:none;z-index:20';
        stageEl.appendChild(wm);
      }
      wm.textContent = next;
    }
  };

  const handleUpdateSettings = (nextSettings: PlatformSettings) => {
    updatePlatformState((prev) => ({ ...prev, settings: nextSettings }));
    syncSettingsToFirestore(nextSettings);
  };

  const handleUpdateUsers = (nextUsers: UserAccount[]) => {
    updatePlatformState((prev) => ({ ...prev, users: nextUsers }));
    syncUsersToFirestore(nextUsers);
  };

  const handleUpdateNotifications = (nextNotifs: BroadcastNotification[]) => {
    setBannerDismissed(false);
    updatePlatformState((prev) => ({ ...prev, notifications: nextNotifs }));
    syncNotificationsToFirestore(nextNotifs);
  };

  const handleUpdateActivityLogs = (nextLogs: ActivityLogEntry[]) => {
    updatePlatformState((prev) => ({ ...prev, activityLogs: nextLogs }));
  };

  const handleToggleLanguage = () => {
    updatePlatformState((prev) => ({
      ...prev,
      language: prev.language === 'ar' ? 'en' : 'ar',
    }));
  };

  const handleMarkAllNotificationsRead = () => {
    updatePlatformState((prev) => ({
      ...prev,
      readNotificationIds: prev.notifications.map((n) => n.id),
    }));
    setBannerDismissed(true);
  };

  const isAr = platformState.language === 'ar';
  const t = getTranslation(platformState.language);

  const effectiveIsPro =
    adminPreviewRole === 'free_user'
      ? false
      : adminPreviewRole === 'pro_user'
        ? true
        : !!(currentUser && (currentUser.role === 'admin' || currentUser.isPro));

  const unreadNotifications = notifications.filter((n) => !readNotificationIds.includes(n.id));
  const latestUnreadImportant = unreadNotifications.find((n) => n.important) || unreadNotifications[0];

  const isFmtPro = (key: string) =>
    settings.requireProForAllConversions || settings.proFormats.includes(key);

  const fmtTag = (key: string) => (isFmtPro(key) ? ' 👑 PRO' : '');

  const whatsappUrl = buildWhatsAppUrl(
    settings.whatsappNumber,
    isAr ? settings.whatsappDefaultMsgAr : settings.whatsappDefaultMsgEn
  );

  return (
    <>
      <nav>
        <div className="logo" style={{ cursor: 'pointer' }} data-v="home">
          {settings.siteLogoUrl ? (
            <img
              src={settings.siteLogoUrl}
              alt={settings.siteName}
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '5px',
                objectFit: 'contain',
              }}
            />
          ) : (
            <i></i>
          )}
          <span id="siteBrandName">{settings.siteName || 'MotionTools'}</span>
        </div>

        <div className="links">
          <a data-v="home" className="on">
            {t.navMotionProcessing}
          </a>
          <a
            data-v="editor"
            style={{
              padding: '3px 9px',
              borderRadius: '6px',
            }}
          >
            {t.navSvgaEditor}
          </a>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Admin Dashboard Button - Strictly visible to Authenticated Administrator */}
          {currentUser?.role === 'admin' && (
            <button
              type="button"
              id="adminDashBtn"
              onClick={() => {
                setAdminInitialTab('users');
                setAdminOpen(true);
              }}
              style={{
                padding: '4px 11px',
                borderRadius: '99px',
                border: '1px solid rgba(124, 92, 255, 0.6)',
                background: 'rgba(124, 92, 255, 0.18)',
                color: '#e0d4ff',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>⚙️</span>
              <span>{t.navAdminDashboard}</span>
            </button>
          )}

          {/* WhatsApp Header Link */}
          {whatsappUrl && (
            <a
              id="whatsappNavBtn"
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              title={t.navWhatsapp}
              style={{
                padding: '4px 9px',
                borderRadius: '99px',
                border: '1px solid rgba(37, 211, 102, 0.5)',
                background: 'rgba(37, 211, 102, 0.14)',
                color: '#4ade80',
                fontSize: '11px',
                fontWeight: 700,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>💬</span>
              <span className="hide-sm">WhatsApp</span>
            </a>
          )}

          {/* Language Toggle Button (AR / EN) */}
          <button
            type="button"
            id="langToggleBtn"
            onClick={handleToggleLanguage}
            style={{
              padding: '4px 9px',
              borderRadius: '99px',
              border: '1px solid #2b2b3d',
              background: '#151520',
              color: '#cbd5e1',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🌐 {t.navLangToggle}
          </button>

          {/* Notification Bell Button */}
          <button
            type="button"
            id="bellBtn"
            aria-label={t.navNotifications}
            onClick={() => setNotifOpen((p) => !p)}
            style={{
              position: 'relative',
              background: '#151520',
              border: '1px solid #2b2b3d',
              borderRadius: '99px',
              padding: '3px 9px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '13px',
            }}
          >
            <span>🔔</span>
            {unreadNotifications.length > 0 && (
              <span
                id="bellUnreadBadge"
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 800,
                  padding: '0 5px',
                  borderRadius: '99px',
                  lineHeight: '15px',
                }}
              >
                {unreadNotifications.length}
              </span>
            )}
          </button>

          {/* User Account / Sign In Button */}
          <button
            type="button"
            id="userAccountBtn"
            onClick={() => setAuthOpen(true)}
            className="av"
            style={{
              width: 'auto',
              height: '28px',
              padding: '0 12px',
              borderRadius: '99px',
              border: currentUser
                ? currentUser.role === 'admin'
                  ? '1px solid rgba(124, 92, 255, 0.6)'
                  : effectiveIsPro
                    ? '1px solid #f59e0b'
                    : '1px solid #2b2b3d'
                : '1px solid rgba(124, 92, 255, 0.45)',
              background: currentUser
                ? currentUser.role === 'admin'
                  ? 'rgba(124, 92, 255, 0.16)'
                  : effectiveIsPro
                    ? 'rgba(245, 158, 11, 0.16)'
                    : '#161622'
                : 'linear-gradient(135deg, rgba(124, 92, 255, 0.22), #14141f)',
              color: currentUser
                ? currentUser.role === 'admin'
                  ? '#e0d4ff'
                  : effectiveIsPro
                    ? '#fde047'
                    : '#e2e8f0'
                : '#ddd6fe',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '12px',
            }}
          >
            <span>{currentUser ? (currentUser.role === 'admin' ? '⚙️' : effectiveIsPro ? '👑' : '👤') : '🔑'}</span>
            <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentUser
                ? currentUser.email.split('@')[0]
                : isAr
                  ? 'تسجيل الدخول'
                  : 'Sign In'}
            </span>
            {currentUser && (
              <span
                style={{
                  fontSize: '9px',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: currentUser.role === 'admin' ? '#7c5cff' : effectiveIsPro ? '#f59e0b' : '#2d2d3f',
                  color: currentUser.role === 'admin' || effectiveIsPro ? '#fff' : '#cbd5e1',
                  fontWeight: 800,
                }}
              >
                {currentUser.role === 'admin'
                  ? isAr
                    ? 'مدير'
                    : 'Admin'
                  : effectiveIsPro
                    ? t.navProBadge
                    : t.navFreeBadge}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Top Broadcast Announcement Banner when unread notification exists */}
      {latestUnreadImportant && !bannerDismissed && (
        <div
          id="broadcastBanner"
          dir={isAr ? 'rtl' : 'ltr'}
          style={{
            background: 'linear-gradient(90deg, #4c1d95, #6d28d9, #4c1d95)',
            borderBottom: '1px solid rgba(255,255,255,0.18)',
            color: '#fff',
            padding: '6px 16px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            zIndex: 20,
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                background: '#fde047',
                color: '#000',
                fontWeight: 800,
                padding: '1px 7px',
                borderRadius: '99px',
                fontSize: '10px',
              }}
            >
              🔔 {t.notifNewBanner}
            </span>
            <b>{latestUnreadImportant.title}:</b>
            <span style={{ color: '#e9d5ff' }}>{latestUnreadImportant.message}</span>
          </div>
          <button
            type="button"
            onClick={handleMarkAllNotificationsRead}
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.25)',
              color: '#fff',
              borderRadius: '6px',
              padding: '2px 8px',
              fontSize: '11px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            ×
          </button>
        </div>
      )}

      <main>
        <section className="view on" id="home">
          <canvas id="bg"></canvas>
          <div className="hero">
            <div className="chips">
              <span>PAG</span>
              <span>SVGA</span>
              <span>Lottie</span>
              <span>VAP</span>
              <span>YYEVA</span>
              <span>Dual Channel</span>
              <span>GIF</span>
              <span>WebP</span>
              <span>MP4</span>
              <span>MOV</span>
              <span>PNG Sequence ZIP</span>
            </div>
            <h1>{t.heroTitle}</h1>
            <p className="sub">{t.heroSub}</p>
            <p style={{ fontSize: '12px', color: '#a78bfa', margin: 0, fontWeight: 600 }}>
              {t.heroFreePreviewNote}
            </p>
            <button className="drop" id="drop" aria-label="Upload a file">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9" />
                <path d="M12 21v-8M9 15l3-3 3 3" />
              </svg>
            </button>
            <button
              className="pill"
              onClick={() => document.getElementById('file')?.click()}
            >
              {t.heroOpenBtn}
            </button>
            <input
              type="file"
              id="file"
              hidden
              accept=".motiontools,.vap,.yyeva,.svga,.json,.lottie,.gif,.webp,.png,.apng,.jpg,.jpeg,.mp4,.mov,.webm,.pag,.svg,.zip"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && typeof (window as any).__recordUploadActivity === 'function') {
                  const ext = f.name.split('.').pop()?.toUpperCase() || 'SVGA';
                  const sz = (f.size / (1024 * 1024)).toFixed(1) + ' MB';
                  (window as any).__recordUploadActivity(f.name, sz, ext);
                }
              }}
            />
          </div>
        </section>

        <section className="view" id="convert">
          <div className="app">
            <aside className="side">
              <h4>{t.audioAssets}</h4>
              <div className="box" id="audBox">
                {t.clickToAddAudio}
              </div>
              <h4>{t.edgeFeather}</h4>
              <div
                className="box"
                onClick={handleToggleEdgeFeather}
                style={{ cursor: 'pointer' }}
              >
                {edgeFeatherPx > 0 ? t.edgeFeatherActive(edgeFeatherPx) : t.addEdgeFeather}
              </div>
              <h4>{t.imageAssets}</h4>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                <button
                  className="pill"
                  style={{ padding: '3px 8px' }}
                  onClick={handleToggleWatermark}
                >
                  {watermarkText ? t.removeWatermark : t.addWatermark}
                </button>
                <button
                  className="pill"
                  style={{ padding: '3px 8px' }}
                  onClick={switchToEditor}
                >
                  {t.openSvgaEditor}
                </button>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                <input
                  className="search"
                  id="q"
                  type="text"
                  placeholder={t.searchImagesPlaceholder}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  id="toggleAssetsColsBtn"
                  className="pill"
                  title="تغيير أسلوب العرض (عرض ممتد كامل / شبكة)"
                  onClick={(e) => {
                    const assetsEl = document.getElementById('assets');
                    if (!assetsEl) return;
                    if (assetsEl.classList.contains('cols-2')) {
                      assetsEl.classList.remove('cols-2');
                      assetsEl.classList.add('cols-1');
                      (e.currentTarget as HTMLElement).textContent = '📱 شبكة';
                    } else if (assetsEl.classList.contains('cols-1')) {
                      assetsEl.classList.remove('cols-1');
                      assetsEl.classList.add('cols-3');
                      (e.currentTarget as HTMLElement).textContent = '📐 مصغر';
                    } else {
                      assetsEl.classList.remove('cols-3');
                      assetsEl.classList.add('cols-2');
                      (e.currentTarget as HTMLElement).textContent = '↕️ عرض كامل';
                    }
                  }}
                  style={{
                    padding: '3px 8px',
                    fontSize: '11px',
                    whiteSpace: 'nowrap',
                    background: '#191926',
                    borderColor: '#2f2f45',
                  }}
                >
                  ↕️ عرض كامل
                </button>
              </div>
              <div className="grid cols-2" id="assets"></div>
            </aside>

            <div className="stage" id="stage">
              <div id="view">{t.dropToPreview}</div>
              <div className="bar">
                <button className="pill" id="pp" style={{ padding: '3px 10px' }}>
                  {t.pause}
                </button>
                <button className="pill" id="snd" style={{ padding: '3px 10px' }}>
                  {t.sound}
                </button>
                <input type="range" id="seek" min="0" max="100" defaultValue="0" />
              </div>
              <div className="pill" style={{ cursor: 'default' }} id="again">
                {t.dropAgain}
              </div>
            </div>

            <div className="zoom-bar" id="zoomBar">
              <button
                type="button"
                id="zoomOutBtn"
                className="zoom-btn"
                title={t.zoomOutTitle}
                aria-label={t.zoomOutTitle}
              >
                −
              </button>
              <button
                type="button"
                id="zoomResetBtn"
                className="zoom-val"
                title={t.zoomResetTitle}
                aria-label={t.zoomResetTitle}
              >
                100%
              </button>
              <button
                type="button"
                id="zoomInBtn"
                className="zoom-btn"
                title={t.zoomInTitle}
                aria-label={t.zoomInTitle}
              >
                +
              </button>
            </div>

            <div className="dots" id="dots">
              <button
                type="button"
                id="bgImgBtn"
                className="bg-img-btn"
                title={t.uploadBgImgTitle}
                aria-label="Upload custom background image"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L6 21" />
                </svg>
              </button>
              <input type="file" id="bgImgInput" accept="image/*" style={{ display: 'none' }} />
              <button
                type="button"
                id="clearBgImgBtn"
                style={{
                  display: 'none',
                  width: '15px',
                  height: '15px',
                  borderRadius: '50%',
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  fontSize: '11px',
                  lineHeight: '1',
                  cursor: 'pointer',
                  padding: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title={t.clearBgImgTitle}
              >
                ×
              </button>
              <b data-bg="#000000" style={{ background: '#000000' }} title="Black background (#000000)"></b>
              <b data-bg="#ffffff" style={{ background: '#ffffff' }} title="White background (#ffffff)"></b>
              <b data-bg="#00ff00" style={{ background: '#00ff00' }} title="Green screen (#00ff00)"></b>
              <b data-bg="#7c3aed" style={{ background: '#7c3aed' }} title="Purple background (#7c3aed)"></b>
              <b data-bg="#3b82f6" style={{ background: '#3b82f6' }} title="Blue background (#3b82f6)"></b>
              <b
                data-bg="chk"
                className="active"
                style={{ background: 'repeating-conic-gradient(#888 0 25%,#ddd 0 50%) 0 0/6px 6px' }}
                title="Transparency Checkerboard"
              ></b>
            </div>

            <aside className="side r">
              <h4>{t.animationInfo}</h4>
              <div className="info" id="info">
                <span>{t.noFileLoaded}</span>
              </div>
              <h4>{t.animationEdit}</h4>
              <div className="row">
                <label>{t.resize}</label>
                <span style={{ display: 'flex', gap: '4px' }}>
                  <input type="number" id="w" defaultValue="413" />
                  <input type="number" id="h" defaultValue="413" />
                </span>
              </div>
              <div className="row">
                <label>{t.contentFit}</label>
                <select id="fit" defaultValue="stretch">
                  <option value="stretch">{t.fitStretch}</option>
                  <option value="contain">{t.fitContain}</option>
                  <option value="cover">{t.fitCover}</option>
                </select>
              </div>
              <div className="row">
                <label>{t.contentScale}</label>
                <input type="number" id="scale" defaultValue="100" min="1" max="1000" />
              </div>
              <div className="row">
                <label>{t.sequenceFps}</label>
                <input type="number" id="fps" defaultValue="15" />
              </div>
              <div className="row">
                <label>{t.trimDuration}</label>
                <input type="checkbox" id="trim" style={{ width: 'auto' }} />
              </div>
              <div className="row" id="trimRange" hidden>
                <label>{t.trimSeconds}</label>
                <span style={{ display: 'flex', gap: '4px' }}>
                  <input
                    id="trimStart"
                    type="number"
                    defaultValue="0"
                    min="0"
                    step="0.01"
                    aria-label="Trim start"
                  />
                  <input id="trimEnd" type="number" min="0" step="0.01" aria-label="Trim end" />
                </span>
              </div>
              <div className="row">
                <label>{t.mirrorMode}</label>
                <select id="mirror" defaultValue="none">
                  <option value="none">{t.mirrorNone}</option>
                  <option value="horizontal">{t.mirrorHorizontal}</option>
                  <option value="vertical">{t.mirrorVertical}</option>
                </select>
              </div>
              <div className="row">
                <label>{t.videoAlphaLayout}</label>
                <select id="lay" defaultValue="n">
                  <option value="n">{t.alphaNormal}</option>
                  <option value="r">{t.alphaRight}</option>
                  <option value="l">{t.alphaLeft}</option>
                </select>
              </div>
              <div className="row">
                <label>{t.formatConversion}</label>
                <select id="fmt" defaultValue="orig">
                  <option value="orig">{t.fmtKeepOriginal}</option>
                  <option value="zip">PNG Sequence{fmtTag('zip')}</option>
                  <option value="lottie">Lottie{fmtTag('lottie')}</option>
                  <option value="dotlottie">DotLottie{fmtTag('dotlottie')}</option>
                  <option value="webp">WebP{fmtTag('webp')}</option>
                  <option value="gif">GIF{fmtTag('gif')}</option>
                  <option value="mov">MOV{fmtTag('mov')}</option>
                  <option value="webm">WebM{fmtTag('webm')}</option>
                  <option value="mp4">MP4{fmtTag('mp4')}</option>
                  <option value="vap">VAP{fmtTag('vap')}</option>
                  <option value="yyeva">YYEVA{fmtTag('yyeva')}</option>
                  <option value="dual">Dual Channel{fmtTag('dual')}</option>
                  <option value="pag">PAG{fmtTag('pag')}</option>
                  <option value="svga">SVGA{fmtTag('svga')}</option>
                </select>
              </div>
              <div className="row">
                <label>{t.compressionQuality}</label>
                <input type="number" id="qual" defaultValue="100" min="1" max="100" />
              </div>
              <button className="go" id="start">
                {t.startConversion}
              </button>
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                <button className="pill" id="saveProject">
                  {t.saveProject}
                </button>
                <button className="pill" id="openProject">
                  {t.openProject}
                </button>
              </div>
              <input id="projectFile" type="file" accept=".motiontools" hidden />
              <p style={{ color: 'var(--mu)', fontSize: '11px' }}>{t.saveProjectHint}</p>
              <div
                id="exportStatus"
                role="status"
                style={{ marginTop: '10px', overflowWrap: 'anywhere' }}
              ></div>
            </aside>
          </div>
        </section>

        <section className="view" id="editor">
          <SvgaAeEditor
            externalSvgaFile={externalSvgaFile}
            aeModalOpen={aeModalOpen}
            onCloseAeModal={() => setAeModalOpen(false)}
            onSyncToMotionTools={(file) => {
              if ((window as any).MotionTools?.load) {
                (window as any).MotionTools.load(file);
              }
            }}
          />
        </section>
      </main>

      {/* Notifications Bell Popover */}
      <NotificationsPopover
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        state={platformState}
        onMarkAllRead={handleMarkAllNotificationsRead}
      />

      {/* User Auth / Account Modal */}
      <UserAuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        state={platformState}
        onLoginSuccess={(userId) =>
          updatePlatformState((prev) => ({
            ...prev,
            currentUserId: userId,
            adminPreviewRole: 'actual',
          }))
        }
        onRegisterUser={(newUser) => {
          updatePlatformState((prev) => ({
            ...prev,
            users: [newUser, ...prev.users.filter((u) => u.id !== newUser.id)],
            currentUserId: newUser.id,
            adminPreviewRole: 'actual',
          }));
          // Immediately save to Firebase Firestore so it appears in Admin Dashboard
          saveUserToFirestore(newUser);
        }}
        onLogout={() =>
          updatePlatformState((prev) => ({
            ...prev,
            currentUserId: null,
            adminPreviewRole: 'free_user',
          }))
        }
        onOpenAdminDashboard={() => setAdminOpen(true)}
      />

      {/* Pro Subscription Gate Modal */}
      <ProSubscriptionModal
        open={proModalOpen}
        blockedFormatKey={blockedFormatKey}
        onClose={() => setProModalOpen(false)}
        onOpenAuth={() => setAuthOpen(true)}
        state={platformState}
      />

      {/* Admin Control Dashboard Modal */}
      <AdminDashboardModal
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        state={platformState}
        initialTab={adminInitialTab}
        onUpdateSettings={handleUpdateSettings}
        onUpdateUsers={handleUpdateUsers}
        onUpdateNotifications={handleUpdateNotifications}
        onUpdateActivityLogs={handleUpdateActivityLogs}
        onChangePreviewRole={(role) =>
          updatePlatformState((prev) => ({ ...prev, adminPreviewRole: role }))
        }
      />

      {/* Screen Security & Anti-Recording Shield Overlay */}
      {screenShieldActive && isSecurityEnforced && (
        <div
          id="screenSecurityShield"
          role="alertdialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(4, 4, 8, 0.96)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            color: '#fff',
            backdropFilter: 'blur(30px)',
          }}
        >
          <div
            style={{
              width: '88px',
              height: '88px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.18)',
              border: '2px solid #ef4444',
              display: 'grid',
              placeItems: 'center',
              fontSize: '40px',
              marginBottom: '20px',
              boxShadow: '0 0 60px rgba(239, 68, 68, 0.5)',
              animation: 'pulse 2s infinite',
            }}
          >
            🚫
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#fca5a5', margin: '0 0 12px' }}>
            ⛔ عذراً: الموقع متوقف ومجمد مؤقتاً!
          </h2>
          <p
            style={{
              maxWidth: '560px',
              fontSize: '15px',
              color: '#cbd5e1',
              lineHeight: 1.6,
              margin: '0 0 28px',
              fontWeight: 600,
            }}
          >
            عذراً، الموقع متوقف لحين ما تلغي تسجيل السكرين الفيديو أو أداة التقاط لقطة الشاشة (Screenshot). يرجى إغلاق أداة التصوير للاستمرار في استخدام المنصة.
          </p>
          <button
            type="button"
            onClick={() => setScreenShieldActive(false)}
            style={{
              padding: '12px 30px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
              border: 0,
              color: '#fff',
              fontWeight: 800,
              fontSize: '14px',
              cursor: 'pointer',
              boxShadow: '0 6px 24px rgba(239, 68, 68, 0.45)',
            }}
          >
            🔄 إلغاء التصوير والعودة للموقع
          </button>
        </div>
      )}

      <div id="toast" role="status"></div>
    </>
  );
}
