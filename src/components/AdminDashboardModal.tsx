import React, { useState, useRef, useEffect } from 'react';
import {
  ALL_SUPPORTED_FORMATS,
  BroadcastNotification,
  PlatformSettings,
  PlatformState,
  UserAccount,
  buildWhatsAppUrl,
} from '../utils/platformStore';
import { getTranslation } from '../utils/i18n';
import {
  firebaseConfig,
  testFirebaseConnection,
  syncAllToFirebase,
  subscribeToFirebaseStatus,
  fetchFirestoreUsers,
  saveUserToFirestore,
  deleteUserFromFirestore,
  FirebaseConnectionStatus,
} from '../utils/firebase';

interface AdminDashboardModalProps {
  open: boolean;
  onClose: () => void;
  state: PlatformState;
  onUpdateSettings: (next: PlatformSettings) => void;
  onUpdateUsers: (next: UserAccount[]) => void;
  onUpdateNotifications: (next: BroadcastNotification[]) => void;
  onChangePreviewRole: (role: 'actual' | 'free_user' | 'pro_user') => void;
  initialTab?: 'users' | 'pro' | 'branding' | 'notifications' | 'firebase';
}

export default function AdminDashboardModal({
  open,
  onClose,
  state,
  onUpdateSettings,
  onUpdateUsers,
  onUpdateNotifications,
  onChangePreviewRole,
  initialTab = 'users',
}: AdminDashboardModalProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'pro' | 'branding' | 'notifications' | 'firebase'>(initialTab);
  const [fbStatus, setFbStatus] = useState<FirebaseConnectionStatus>({
    isConfigured: true,
    isConnected: false,
    isTesting: false,
    projectId: firebaseConfig.projectId,
  });
  const [fbSyncing, setFbSyncing] = useState(false);
  const [fbLog, setFbLog] = useState<string>('');
  const [userSearch, setUserSearch] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('123456');
  const [newUserIsPro, setNewUserIsPro] = useState(true);

  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifImportant, setNotifImportant] = useState(true);
  const [saveFeedback, setSaveFeedback] = useState('');

  const logoFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = subscribeToFirebaseStatus((status) => {
      setFbStatus(status);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (open && initialTab) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (open && activeTab === 'firebase') {
      testFirebaseConnection();
    }
    if (open && activeTab === 'users') {
      fetchFirestoreUsers().then((fetched) => {
        if (fetched && fetched.length > 0) {
          const userMap = new Map<string, UserAccount>();
          users.forEach((u) => userMap.set(u.id, u));
          fetched.forEach((u) => userMap.set(u.id, u));
          onUpdateUsers(Array.from(userMap.values()));
        }
      }).catch(() => {});
    }
  }, [open, activeTab]);

  const [isRefreshingUsers, setIsRefreshingUsers] = useState(false);

  if (!open) return null;

  const isAr = state.language === 'ar';
  const t = getTranslation(state.language);
  const { settings, users, notifications } = state;

  const showSavedFeedback = (msgAr: string, msgEn: string) => {
    setSaveFeedback(isAr ? msgAr : msgEn);
    setTimeout(() => setSaveFeedback(''), 2500);
  };

  const handleRefreshUsersFromFirebase = async () => {
    setIsRefreshingUsers(true);
    try {
      const fetched = await fetchFirestoreUsers();
      if (fetched && fetched.length > 0) {
        const userMap = new Map<string, UserAccount>();
        users.forEach((u) => userMap.set(u.id, u));
        fetched.forEach((u) => userMap.set(u.id, u));
        onUpdateUsers(Array.from(userMap.values()));
        showSavedFeedback(
          `تم جلب وتحديث الحسابات من Firebase بنجاح (${fetched.length} مستخدم) ✓`,
          `Users refreshed from Firebase (${fetched.length} users) ✓`
        );
      } else {
        showSavedFeedback(
          'قائمة الحسابات متزامنة تماماً مع Firebase ✓',
          'Users list is up-to-date with Firebase ✓'
        );
      }
    } catch {
      showSavedFeedback('تعذر جلب البيانات من خادم Firebase', 'Could not refresh from Firebase');
    } finally {
      setIsRefreshingUsers(false);
    }
  };

  const handleTestFirebase = async () => {
    setFbLog(isAr ? 'جاري فحص الاتصال بقاعدة بيانات Firebase...' : 'Testing connection to Firebase...');
    const res = await testFirebaseConnection();
    setFbLog(res.message || (res.isConnected ? 'متصل بنجاح' : 'خطأ في الاتصال'));
    if (res.isConnected) {
      showSavedFeedback('تم التحقق من الاتصال بـ Firebase بنجاح ✓', 'Firebase connection verified ✓');
    }
  };

  const handleSyncFirebase = async () => {
    setFbSyncing(true);
    setFbLog(
      isAr
        ? 'جاري رفع ومزامنة الإعدادات والحسابات والإشعارات إلى Firestore...'
        : 'Syncing settings, accounts, and notifications with Firestore...'
    );
    const res = await syncAllToFirebase({ settings, users, notifications });
    setFbSyncing(false);
    setFbLog(res.message);
    if (res.success) {
      showSavedFeedback('تمت المزامنة وحفظ البيانات سحابياً بنجاح ✓', 'Data synced to Firebase successfully ✓');
    }
  };

  const handleToggleUserPro = (userId: string) => {
    let updatedUser: UserAccount | undefined;
    const next = users.map((u) => {
      if (u.id !== userId) return u;
      const nextPro = !u.isPro;
      updatedUser = {
        ...u,
        isPro: nextPro,
        proActivatedAt: nextPro ? new Date().toISOString() : undefined,
      };
      return updatedUser;
    });
    onUpdateUsers(next);
    if (updatedUser) {
      saveUserToFirestore(updatedUser);
    }
    showSavedFeedback('تم تحديث حالة اشتراك المستخدم بنجاح ✓', 'User Pro status updated ✓');
  };

  const handleDeleteUser = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (!target || target.role === 'admin') return;
    onUpdateUsers(users.filter((u) => u.id !== userId));
    deleteUserFromFirestore(userId);
    showSavedFeedback('تم حذف الحساب بنجاح', 'User account removed');
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    const exists = users.some((u) => u.email.toLowerCase() === newUserEmail.trim().toLowerCase());
    if (exists) {
      showSavedFeedback('البريد الإلكتروني مسجل بالفعل!', 'Email already exists!');
      return;
    }
    const created: UserAccount = {
      id: 'usr_' + Date.now(),
      name: newUserName.trim(),
      email: newUserEmail.trim(),
      phone: newUserPhone.trim(),
      password: newUserPassword || '123456',
      role: 'user',
      isPro: newUserIsPro,
      createdAt: new Date().toISOString(),
      proActivatedAt: newUserIsPro ? new Date().toISOString() : undefined,
    };
    onUpdateUsers([created, ...users]);
    saveUserToFirestore(created);
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPhone('');
    showSavedFeedback('تم إنشاء الحساب وحفظه في Firebase بنجاح ✓', 'User account created & saved to Firebase ✓');
  };

  const handleToggleFormatPro = (fmtKey: string) => {
    const exists = settings.proFormats.includes(fmtKey);
    const nextProFormats = exists
      ? settings.proFormats.filter((k) => k !== fmtKey)
      : [...settings.proFormats, fmtKey];
    onUpdateSettings({
      ...settings,
      proFormats: nextProFormats,
    });
    showSavedFeedback('تم تحديث صلاحيات الصيغة ✓', 'Format permission updated ✓');
  };

  const handleSetAllFormatsPro = (makePro: boolean) => {
    onUpdateSettings({
      ...settings,
      proFormats: makePro ? ALL_SUPPORTED_FORMATS.map((f) => f.key) : [],
      requireProForAllConversions: makePro,
    });
    showSavedFeedback(
      makePro ? 'تم تعيين جميع الصيغ ضمن باقة أدوات برو ✓' : 'تم جعل جميع الصيغ مجانية ✓',
      makePro ? 'All formats set to Pro ✓' : 'All formats set to Free ✓'
    );
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateSettings({
          ...settings,
          siteLogoUrl: reader.result,
        });
        showSavedFeedback('تم رفع وتحديث لوجو الموقع بنجاح ✓', 'Site logo updated ✓');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSendNotification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) return;
    const newNotif: BroadcastNotification = {
      id: 'notif_' + Date.now(),
      title: notifTitle.trim(),
      message: notifMessage.trim(),
      createdAt: new Date().toISOString(),
      important: notifImportant,
    };
    onUpdateNotifications([newNotif, ...notifications]);
    setNotifTitle('');
    setNotifMessage('');
    showSavedFeedback(
      'تم إرسال الإشعار لجميع المستخدمين في الموقع بنجاح 🔔',
      'Notification broadcasted to all users 🔔'
    );
  };

  const handleDeleteNotification = (id: string) => {
    onUpdateNotifications(notifications.filter((n) => n.id !== id));
    showSavedFeedback('تم حذف الإشعار', 'Notification deleted');
  };

  const isRecentUser = (u: UserAccount) => {
    if (!u.createdAt) return false;
    const diffHours = (Date.now() - new Date(u.createdAt).getTime()) / (1000 * 60 * 60);
    return diffHours < 48;
  };

  // Sort newest registrations first so new users always appear at the top!
  const sortedUsers = [...users].sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  const filteredUsers = sortedUsers.filter((u) => {
    const q = userSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q)
    );
  });

  const recentUsers = sortedUsers.filter((u) => u.role !== 'admin' && isRecentUser(u));

  const proUsersCount = users.filter((u) => u.isPro).length;
  const freeUsersCount = users.filter((u) => !u.isPro).length;

  return (
    <div
      role="dialog"
      aria-label={t.dashTitle}
      dir={isAr ? 'rtl' : 'ltr'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 5, 10, 0.82)',
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
          width: 'min(1060px, 98vw)',
          height: 'min(760px, 92vh)',
          background: '#0e0e16',
          border: '1px solid #28283c',
          borderRadius: '16px',
          boxShadow: '0 24px 70px rgba(0,0,0,0.75)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#e8e8ee',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid #222232',
            background: 'linear-gradient(90deg, rgba(124,92,255,0.14), rgba(14,14,22,0.95))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #7c5cff, #5a2fd0)',
                display: 'grid',
                placeItems: 'center',
                fontSize: '20px',
                boxShadow: '0 4px 16px rgba(124,92,255,0.4)',
              }}
            >
              ⚙️
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#fff' }}>
                {t.dashTitle}
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#9898ad' }}>{t.dashSub}</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Quick Preview Role Switcher for Admin */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#161622',
                border: '1px solid #2c2c42',
                padding: '5px 10px',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            >
              <span style={{ color: '#a0a0b8', fontWeight: 600 }}>{t.dashPreviewModeLabel}</span>
              <select
                aria-label={t.dashPreviewModeLabel}
                value={state.adminPreviewRole}
                onChange={(e) => onChangePreviewRole(e.target.value as any)}
                style={{
                  width: 'auto',
                  background: '#0d0d14',
                  border: '1px solid #7c5cff',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  color: '#fff',
                  fontWeight: 600,
                }}
              >
                <option value="actual">{t.dashPreviewActual}</option>
                <option value="free_user">{t.dashPreviewFree}</option>
                <option value="pro_user">{t.dashPreviewPro}</option>
              </select>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Dashboard"
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                border: '1px solid #2c2c3e',
                background: '#181824',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '20px',
                lineHeight: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '10px 22px',
            background: '#11111a',
            borderBottom: '1px solid #222232',
            overflowX: 'auto',
          }}
        >
          {(
            [
              { id: 'users', label: t.dashTabUsers },
              { id: 'pro', label: t.dashTabProFormats },
              { id: 'branding', label: t.dashTabBranding },
              { id: 'notifications', label: t.dashTabNotifications },
              {
                id: 'firebase',
                label: isAr ? '🔥 قاعدة بيانات Firebase' : '🔥 Firebase Database',
              },
            ] as const
          ).map((tab) => {
            const on = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: on ? '1px solid #7c5cff' : '1px solid #242436',
                  background: on ? 'rgba(124,92,255,0.2)' : '#161622',
                  color: on ? '#fff' : '#9c9cb2',
                  fontWeight: on ? 700 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontSize: '13px',
                }}
              >
                {tab.label}
              </button>
            );
          })}

          {saveFeedback && (
            <div
              style={{
                marginInlineStart: 'auto',
                alignSelf: 'center',
                background: 'rgba(16, 185, 129, 0.16)',
                border: '1px solid #10b981',
                color: '#34d399',
                padding: '5px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {saveFeedback}
            </div>
          )}
        </div>

        {/* Body Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          {/* TAB 1: USERS & ACCOUNTS */}
          {activeTab === 'users' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Recent Registrations Live Activity Card */}
              {recentUsers.length > 0 && (
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.16) 0%, rgba(59, 130, 246, 0.14) 100%)',
                    border: '1px solid rgba(16, 185, 129, 0.5)',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    boxShadow: '0 8px 24px rgba(16, 185, 129, 0.12)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '26px' }}>🔔</span>
                    <div>
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: '14px',
                          color: '#6ee7b7',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <span>
                          {isAr
                            ? `تم تسجيل مستخدم جديد مؤخراً (${recentUsers.length} حساب جديد)!`
                            : `New User Registered Recently (${recentUsers.length} new account${recentUsers.length > 1 ? 's' : ''})!`}
                        </span>
                        <span
                          style={{
                            background: '#10b981',
                            color: '#022c22',
                            padding: '2px 8px',
                            borderRadius: '99px',
                            fontSize: '11px',
                            fontWeight: 800,
                          }}
                        >
                          {isAr ? 'حساب جديد' : 'NEW'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '3px' }}>
                        {isAr
                          ? `أحدث تسجيل: ${recentUsers[0].email} — ${new Date(recentUsers[0].createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}`
                          : `Latest: ${recentUsers[0].email} — ${new Date(recentUsers[0].createdAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleToggleUserPro(recentUsers[0].id)}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '8px',
                        background: recentUsers[0].isPro
                          ? 'rgba(239, 68, 68, 0.2)'
                          : 'linear-gradient(135deg, #f59e0b, #d97706)',
                        border: '1px solid rgba(245, 158, 11, 0.6)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {recentUsers[0].isPro
                        ? isAr
                          ? 'إلغاء برو لأحدث مستخدم'
                          : 'Revoke Pro'
                        : isAr
                          ? '👑 تفعيل باقة برو للمستخدم الجديد فوراً'
                          : '👑 Activate Pro for New User'}
                    </button>
                  </div>
                </div>
              )}

              {/* Summary Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    background: '#151520',
                    border: '1px solid #252538',
                    borderRadius: '10px',
                    padding: '14px',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#8e8ea6' }}>
                    {isAr ? 'إجمالي الحسابات المسجلة' : 'Total Registered Accounts'}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: '#fff' }}>
                    {users.length}
                  </div>
                </div>
                <div
                  style={{
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    borderRadius: '10px',
                    padding: '14px',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#fcd34d' }}>
                    {isAr ? 'المشتركون في باقة برو 👑' : 'Active Pro Subscribers 👑'}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: '#fbbf24' }}>
                    {proUsersCount}
                  </div>
                </div>
                <div
                  style={{
                    background: '#151520',
                    border: '1px solid #252538',
                    borderRadius: '10px',
                    padding: '14px',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#8e8ea6' }}>
                    {isAr ? 'الحسابات المجانية' : 'Free Accounts'}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: '#cbd5e1' }}>
                    {freeUsersCount}
                  </div>
                </div>
                <div
                  style={{
                    background: 'rgba(124, 92, 255, 0.1)',
                    border: '1px solid rgba(124, 92, 255, 0.4)',
                    borderRadius: '10px',
                    padding: '14px',
                  }}
                >
                  <div style={{ fontSize: '12px', color: '#c4b5fd' }}>
                    {isAr ? 'سعر باقة أدوات برو الحالي' : 'Current Pro Package Price'}
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px', color: '#a78bfa' }}>
                    {settings.proPrice} {settings.proCurrency}
                  </div>
                </div>
              </div>

              {/* Add New Account Form */}
              <form
                onSubmit={handleAddUser}
                style={{
                  background: '#14141f',
                  border: '1px solid #26263a',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '10px',
                  alignItems: 'flex-end',
                }}
              >
                <div style={{ width: '100%', fontWeight: 700, fontSize: '13px', color: '#c4b5fd' }}>
                  {isAr ? '➕ إضافة أو تفعيل حساب مستخدم جديد يدوياً:' : '➕ Add & Activate User Account:'}
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#9494aa', marginBottom: '4px' }}>
                    {isAr ? 'اسم المستخدم' : 'Full Name'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={isAr ? 'مثال: محمد أحمد' : 'e.g. John Doe'}
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                  />
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#9494aa', marginBottom: '4px' }}>
                    {isAr ? 'البريد الإلكتروني' : 'Email'}
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="user@example.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                  />
                </div>
                <div style={{ flex: '1 1 140px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#9494aa', marginBottom: '4px' }}>
                    {isAr ? 'رقم الهاتف / واتساب' : 'Phone / WhatsApp'}
                  </label>
                  <input
                    type="text"
                    placeholder="2010..."
                    value={newUserPhone}
                    onChange={(e) => setNewUserPhone(e.target.value)}
                  />
                </div>
                <div style={{ flex: '0 0 120px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#9494aa', marginBottom: '4px' }}>
                    {isAr ? 'الباقة' : 'Plan'}
                  </label>
                  <select
                    value={newUserIsPro ? 'pro' : 'free'}
                    onChange={(e) => setNewUserIsPro(e.target.value === 'pro')}
                  >
                    <option value="pro">{isAr ? 'باقة برو 👑' : 'Pro Plan 👑'}</option>
                    <option value="free">{isAr ? 'مجاني' : 'Free'}</option>
                  </select>
                </div>
                <button
                  type="submit"
                  style={{
                    padding: '7px 16px',
                    borderRadius: '8px',
                    background: '#7c5cff',
                    border: 0,
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? 'إضافة الحساب' : 'Add Account'}
                </button>
              </form>

              {/* Search & Accounts Table */}
              <div
                style={{
                  background: '#14141f',
                  border: '1px solid #26263a',
                  borderRadius: '12px',
                  padding: '14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <b style={{ fontSize: '14px' }}>
                      {isAr
                        ? `جميع الحسابات المسجلة على الموقع (${filteredUsers.length})`
                        : `Registered User Accounts (${filteredUsers.length})`}
                    </b>
                    <button
                      type="button"
                      onClick={handleRefreshUsersFromFirebase}
                      disabled={isRefreshingUsers}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: 'rgba(59, 130, 246, 0.15)',
                        border: '1px solid rgba(59, 130, 246, 0.4)',
                        color: '#93c5fd',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                      }}
                      title={isAr ? 'تحديث ومزامنة الحسابات مباشرة من Firebase' : 'Refresh users directly from Firebase'}
                    >
                      <span>🔄</span>
                      <span>
                        {isRefreshingUsers
                          ? (isAr ? 'جاري التحديث...' : 'Refreshing...')
                          : (isAr ? 'تحديث من Firebase' : 'Sync Firebase')}
                      </span>
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder={
                      isAr
                        ? '🔍 ابحث بالاسم أو البريد الإلكتروني أو الرقم...'
                        : '🔍 Search by name, email, or phone...'
                    }
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    style={{ maxWidth: '300px' }}
                  />
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '12px',
                      textAlign: isAr ? 'right' : 'left',
                    }}
                  >
                    <thead>
                      <tr style={{ borderBottom: '1px solid #26263a', color: '#9494aa' }}>
                        <th style={{ padding: '10px 8px' }}>{isAr ? 'المستخدم' : 'User'}</th>
                        <th style={{ padding: '10px 8px' }}>{isAr ? 'البريد الإلكتروني' : 'Email'}</th>
                        <th style={{ padding: '10px 8px' }}>{isAr ? 'الواتساب / الهاتف' : 'Phone'}</th>
                        <th style={{ padding: '10px 8px' }}>{isAr ? 'تاريخ التسجيل' : 'Created'}</th>
                        <th style={{ padding: '10px 8px' }}>{isAr ? 'حالة الاشتراك' : 'Subscription'}</th>
                        <th style={{ padding: '10px 8px' }}>{isAr ? 'تفعيل / إجراءات' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => {
                        const isRecent = isRecentUser(u) && u.role !== 'admin';
                        return (
                        <tr
                          key={u.id}
                          style={{
                            borderBottom: '1px solid #1d1d2b',
                            background: isRecent ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
                          }}
                        >
                          <td style={{ padding: '10px 8px', fontWeight: 600, color: '#fff' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{u.name}</span>
                              {isRecent && (
                                <span
                                  style={{
                                    background: '#10b981',
                                    color: '#022c22',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    fontWeight: 800,
                                  }}
                                >
                                  🌟 {isAr ? 'جديد' : 'NEW'}
                                </span>
                              )}
                              {u.role === 'admin' && (
                                <span
                                  style={{
                                    background: '#3b82f6',
                                    color: '#fff',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                  }}
                                >
                                  {isAr ? 'مدير' : 'Admin'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '10px 8px', color: '#cbd5e1' }}>{u.email}</td>
                          <td style={{ padding: '10px 8px', color: '#94a3b8' }}>{u.phone || '—'}</td>
                          <td style={{ padding: '10px 8px', color: '#94a3b8' }}>
                            <div>{new Date(u.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}</div>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>
                              {new Date(u.createdAt).toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            {u.isPro ? (
                              <span
                                style={{
                                  background: 'rgba(245, 158, 11, 0.18)',
                                  border: '1px solid #f59e0b',
                                  color: '#fde047',
                                  padding: '3px 9px',
                                  borderRadius: '99px',
                                  fontWeight: 700,
                                  fontSize: '11px',
                                  display: 'inline-block',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {isAr ? '👑 مفعل (باقة برو)' : '👑 Active PRO'}
                              </span>
                            ) : (
                              <span
                                style={{
                                  background: '#222230',
                                  color: '#94a3b8',
                                  padding: '3px 9px',
                                  borderRadius: '99px',
                                  fontSize: '11px',
                                  display: 'inline-block',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {isAr ? 'مجاني (معاينة)' : 'Free User'}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleToggleUserPro(u.id)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  border: u.isPro ? '1px solid #ef4444' : '1px solid #10b981',
                                  background: u.isPro
                                    ? 'rgba(239, 68, 68, 0.14)'
                                    : 'rgba(16, 185, 129, 0.18)',
                                  color: u.isPro ? '#fca5a5' : '#6ee7b7',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {u.isPro
                                  ? isAr
                                    ? 'إلغاء باقة برو'
                                    : 'Revoke Pro'
                                  : isAr
                                    ? '✅ تفعيل باقة برو'
                                    : '✅ Activate Pro'}
                              </button>
                              {u.role !== 'admin' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u.id)}
                                  style={{
                                    padding: '5px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #3f3f52',
                                    background: '#1d1d2b',
                                    color: '#f87171',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                  }}
                                  title={isAr ? 'حذف الحساب' : 'Delete User'}
                                >
                                  🗑
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRO PACKAGE PRICING & FORMATS */}
          {activeTab === 'pro' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Pricing & Package Settings */}
              <div
                style={{
                  background: '#14141f',
                  border: '1px solid #26263a',
                  borderRadius: '12px',
                  padding: '16px',
                }}
              >
                <h3 style={{ margin: '0 0 12px', fontSize: '15px', color: '#fde047' }}>
                  {isAr
                    ? '👑 إعدادات وسعر باقة أدوات برو (Pro Tools)'
                    : '👑 Pro Tools Package & Pricing Configuration'}
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                    gap: '12px',
                  }}
                >
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#9494aa', marginBottom: '4px' }}>
                      {isAr ? 'اسم الباقة (بالعربية)' : 'Package Name (Arabic)'}
                    </label>
                    <input
                      type="text"
                      value={settings.proPackageNameAr}
                      onChange={(e) => {
                        onUpdateSettings({ ...settings, proPackageNameAr: e.target.value });
                        showSavedFeedback('تم حفظ اسم الباقة', 'Saved');
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#9494aa', marginBottom: '4px' }}>
                      {isAr ? 'اسم الباقة (بالإنجليزية)' : 'Package Name (English)'}
                    </label>
                    <input
                      type="text"
                      value={settings.proPackageNameEn}
                      onChange={(e) => {
                        onUpdateSettings({ ...settings, proPackageNameEn: e.target.value });
                        showSavedFeedback('تم حفظ اسم الباقة', 'Saved');
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#9494aa', marginBottom: '4px' }}>
                      {isAr ? 'سعر الاشتراك (المبلغ الشرائي)' : 'Subscription Price Amount'}
                    </label>
                    <input
                      type="text"
                      value={settings.proPrice}
                      onChange={(e) => {
                        onUpdateSettings({ ...settings, proPrice: e.target.value });
                        showSavedFeedback('تم تحديث سعر باقة برو', 'Price updated');
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#9494aa', marginBottom: '4px' }}>
                      {isAr ? 'العملة (مثل: $ أو ج.م أو ر.س)' : 'Currency (e.g. $, EGP, SAR)'}
                    </label>
                    <input
                      type="text"
                      value={settings.proCurrency}
                      onChange={(e) => {
                        onUpdateSettings({ ...settings, proCurrency: e.target.value });
                        showSavedFeedback('تم تحديث العملة', 'Currency updated');
                      }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#9494aa', marginBottom: '4px' }}>
                    {isAr ? 'وصف ومميزات الباقة التي تظهر للمستخدم عند طلب الاشتراك:' : 'Package Description:'}
                  </label>
                  <input
                    type="text"
                    value={isAr ? settings.proDescriptionAr : settings.proDescriptionEn}
                    onChange={(e) => {
                      onUpdateSettings(
                        isAr
                          ? { ...settings, proDescriptionAr: e.target.value }
                          : { ...settings, proDescriptionEn: e.target.value }
                      );
                      showSavedFeedback('تم تحديث الوصف', 'Description updated');
                    }}
                  />
                </div>
              </div>

              {/* Formats Allocation: Pro vs Free */}
              <div
                style={{
                  background: '#14141f',
                  border: '1px solid #26263a',
                  borderRadius: '12px',
                  padding: '16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                    marginBottom: '12px',
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', color: '#fff' }}>
                      {isAr
                        ? 'تحديد الصيغ في أدوات برو (Pro) والصيغ المجانية (Free)'
                        : 'Configure Pro Formats vs Free Formats'}
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#9494aa' }}>
                      {isAr
                        ? 'ملاحظة: جميع المستخدمين يمكنهم رفع وتجربة ومعاينة أي ملف مجاناً. الصيغ المحددة كـ "أدوات برو" ستطلب الاشتراك عند الضغط على زر (بدء التحويل / التصدير).'
                        : 'Note: All users can upload and preview any file for free. Formats marked as PRO require a subscription when clicking Start Conversion / Export.'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleSetAllFormatsPro(true)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #f59e0b',
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: '#fde047',
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {isAr ? '👑 جعل كل الصيغ برو' : '👑 Make All Pro'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetAllFormatsPro(false)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid #10b981',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#6ee7b7',
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {isAr ? '✅ جعل كل الصيغ مجانية' : '✅ Make All Free'}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: '10px',
                  }}
                >
                  {ALL_SUPPORTED_FORMATS.map((fmt) => {
                    const isPro =
                      settings.requireProForAllConversions || settings.proFormats.includes(fmt.key);
                    return (
                      <div
                        key={fmt.key}
                        onClick={() => handleToggleFormatPro(fmt.key)}
                        style={{
                          padding: '12px',
                          borderRadius: '10px',
                          border: isPro ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid #26263a',
                          background: isPro ? 'rgba(245, 158, 11, 0.08)' : '#101018',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: '#fff' }}>
                            {isAr ? fmt.labelAr : fmt.labelEn}
                          </div>
                          <div style={{ fontSize: '11px', color: '#8a8aa2', marginTop: '2px' }}>
                            .{fmt.key.toUpperCase()}
                          </div>
                        </div>

                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '99px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: isPro ? '#f59e0b' : 'rgba(16, 185, 129, 0.2)',
                            color: isPro ? '#000' : '#34d399',
                            border: isPro ? 'none' : '1px solid #10b981',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {isPro ? (isAr ? '👑 أدوات برو' : '👑 PRO') : isAr ? '✅ مجاني' : '✅ FREE'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SITE BRANDING (NAME + LOGO) & WHATSAPP */}
          {activeTab === 'branding' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Site Name & Logo */}
              <div
                style={{
                  background: '#14141f',
                  border: '1px solid #26263a',
                  borderRadius: '12px',
                  padding: '16px',
                }}
              >
                <h3 style={{ margin: '0 0 12px', fontSize: '15px', color: '#c4b5fd' }}>
                  {isAr ? '🎨 تغيير اسم الموقع ولوجو الموقع' : '🎨 Website Name & Logo Branding'}
                </h3>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '16px',
                    alignItems: 'start',
                  }}
                >
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#9494aa', marginBottom: '6px' }}>
                      {isAr ? 'اسم الموقع (يظهر في الشريط العلوي والعنوان):' : 'Website Name:'}
                    </label>
                    <input
                      type="text"
                      value={settings.siteName}
                      placeholder="MotionTools"
                      onChange={(e) => {
                        onUpdateSettings({ ...settings, siteName: e.target.value });
                        showSavedFeedback('تم تحديث اسم الموقع ✓', 'Site name updated ✓');
                      }}
                    />

                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: '#9494aa',
                        marginTop: '14px',
                        marginBottom: '6px',
                      }}
                    >
                      {isAr ? 'رابط صورة اللوجو (أو ارفع صورة من جهازك بالأسفل):' : 'Logo Image URL:'}
                    </label>
                    <input
                      type="text"
                      value={settings.siteLogoUrl}
                      placeholder="https://example.com/logo.png"
                      onChange={(e) => {
                        onUpdateSettings({ ...settings, siteLogoUrl: e.target.value });
                        showSavedFeedback('تم تحديث اللوجو ✓', 'Logo updated ✓');
                      }}
                    />
                  </div>

                  <div
                    style={{
                      background: '#101018',
                      border: '1px dashed #32324c',
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <div style={{ fontSize: '12px', color: '#9494aa' }}>
                      {isAr ? 'معاينة اللوجو والاسم الحالي:' : 'Live Brand Preview:'}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        background: '#181826',
                        padding: '10px 18px',
                        borderRadius: '10px',
                        border: '1px solid #2b2b40',
                      }}
                    >
                      {settings.siteLogoUrl ? (
                        <img
                          src={settings.siteLogoUrl}
                          alt="Site Logo"
                          style={{
                            width: '28px',
                            height: '28px',
                            objectFit: 'contain',
                            borderRadius: '6px',
                          }}
                        />
                      ) : (
                        <i
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            background: 'var(--ac)',
                            display: 'inline-block',
                          }}
                        />
                      )}
                      <span style={{ fontWeight: 800, fontSize: '16px', color: '#fff' }}>
                        {settings.siteName || 'MotionTools'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => logoFileInputRef.current?.click()}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          background: '#7c5cff',
                          border: 0,
                          color: '#fff',
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        {isAr ? '📁 رفع صورة لوجو من الجهاز' : '📁 Upload Logo Image'}
                      </button>
                      {settings.siteLogoUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateSettings({ ...settings, siteLogoUrl: '' });
                            showSavedFeedback('تمت استعادة اللوجو الافتراضي', 'Default logo restored');
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: '#222230',
                            border: '1px solid #3a3a4e',
                            color: '#fca5a5',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          {isAr ? 'حذف اللوجو' : 'Reset Logo'}
                        </button>
                      )}
                      <input
                        ref={logoFileInputRef}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={handleLogoFileUpload}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* WhatsApp Configuration */}
              <div
                style={{
                  background: '#14141f',
                  border: '1px solid rgba(37, 211, 102, 0.35)',
                  borderRadius: '12px',
                  padding: '16px',
                }}
              >
                <h3 style={{ margin: '0 0 12px', fontSize: '15px', color: '#4ade80' }}>
                  {isAr
                    ? '💬 إعدادات رقم وعلامة الواتساب (WhatsApp)'
                    : '💬 WhatsApp Button & Contact Number'}
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '14px',
                  }}
                >
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#9494aa', marginBottom: '6px' }}>
                      {isAr
                        ? 'رقم الواتساب الخاص بك (مع كود الدولة بدون + مثل: 201012345678):'
                        : 'Your WhatsApp Number (with country code, e.g. 201012345678):'}
                    </label>
                    <input
                      type="text"
                      value={settings.whatsappNumber}
                      placeholder="201000000000"
                      onChange={(e) => {
                        onUpdateSettings({ ...settings, whatsappNumber: e.target.value });
                        showSavedFeedback('تم حفظ رقم الواتساب ✓', 'WhatsApp number saved ✓');
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#9494aa', marginBottom: '6px' }}>
                      {isAr ? 'الرسالة التلقائية عند تواصل العميل عبر واتساب:' : 'Default WhatsApp Message:'}
                    </label>
                    <input
                      type="text"
                      value={isAr ? settings.whatsappDefaultMsgAr : settings.whatsappDefaultMsgEn}
                      onChange={(e) => {
                        onUpdateSettings(
                          isAr
                            ? { ...settings, whatsappDefaultMsgAr: e.target.value }
                            : { ...settings, whatsappDefaultMsgEn: e.target.value }
                        );
                        showSavedFeedback('تم حفظ رسالة الواتساب ✓', 'Message saved ✓');
                      }}
                    />
                  </div>
                </div>

                {settings.whatsappNumber && (
                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <a
                      href={buildWhatsAppUrl(
                        settings.whatsappNumber,
                        isAr ? settings.whatsappDefaultMsgAr : settings.whatsappDefaultMsgEn
                      )}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '8px',
                        background: '#25D366',
                        color: '#052e16',
                        fontWeight: 700,
                        textDecoration: 'none',
                        fontSize: '12px',
                      }}
                    >
                      💬 {isAr ? 'تجربة رابط الواتساب الآن' : 'Test WhatsApp Link'}
                    </a>
                    <span style={{ fontSize: '11px', color: '#8a8aa2' }}>
                      {buildWhatsAppUrl(settings.whatsappNumber)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: BROADCAST NOTIFICATIONS (BELL) */}
          {activeTab === 'notifications' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <form
                onSubmit={handleSendNotification}
                style={{
                  background: '#14141f',
                  border: '1px solid #26263a',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '15px', color: '#fde047' }}>
                  {isAr
                    ? '🔔 إرسال إشعار أو رسالة نصية لجميع المستخدمين داخل الموقع'
                    : '🔔 Send Broadcast Notification to All Users'}
                </h3>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#9494aa', marginBottom: '4px' }}>
                    {isAr ? 'عنوان الإشعار / التحديث:' : 'Notification Title:'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      isAr
                        ? 'مثال: تحديث جديد في محرر SVGA أو عرض خاص على باقة برو 🎉'
                        : 'e.g. New Update Available 🎉'
                    }
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#9494aa', marginBottom: '4px' }}>
                    {isAr ? 'نص الرسالة التي ستظهر للمستخدمين عند الدخول أو فتح الجرس:' : 'Message Content:'}
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder={
                      isAr
                        ? 'اكتب تفاصيل التحديث أو الرسالة النصية هنا...'
                        : 'Write your announcement message here...'
                    }
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#14141c',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      padding: '8px 10px',
                      color: '#fff',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={notifImportant}
                      onChange={(e) => setNotifImportant(e.target.checked)}
                      style={{ width: 'auto' }}
                    />
                    <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
                      {isAr
                        ? 'إظهار كتنبيه بارز أعلى الموقع فور دخول المستخدم'
                        : 'Show as prominent top banner when user visits'}
                    </span>
                  </label>

                  <button
                    type="submit"
                    style={{
                      padding: '8px 20px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #7c5cff, #5a2fd0)',
                      border: 0,
                      color: '#fff',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🔔 {isAr ? 'إرسال الإشعار للجميع الآن' : 'Broadcast Notification Now'}
                  </button>
                </div>
              </form>

              {/* Sent Notifications History */}
              <div
                style={{
                  background: '#14141f',
                  border: '1px solid #26263a',
                  borderRadius: '12px',
                  padding: '16px',
                }}
              >
                <h4 style={{ margin: '0 0 12px', fontSize: '14px' }}>
                  {isAr
                    ? `الإشعارات المرسلة حالياً (${notifications.length})`
                    : `Active Broadcast Notifications (${notifications.length})`}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      style={{
                        padding: '12px',
                        borderRadius: '10px',
                        background: '#101018',
                        border: '1px solid #242436',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: '#fff', fontSize: '13px' }}>{n.title}</div>
                        <div style={{ color: '#a0a0b8', fontSize: '12px', marginTop: '4px' }}>
                          {n.message}
                        </div>
                        <div style={{ color: '#6b6b80', fontSize: '11px', marginTop: '6px' }}>
                          {new Date(n.createdAt).toLocaleString(isAr ? 'ar-EG' : 'en-US')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteNotification(n.id)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid #3f3f52',
                          background: '#1d1d2b',
                          color: '#f87171',
                          cursor: 'pointer',
                          fontSize: '11px',
                        }}
                      >
                        {isAr ? 'حذف' : 'Delete'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: FIREBASE DATABASE */}
          {activeTab === 'firebase' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Connection Status Card */}
              <div
                style={{
                  background: fbStatus.isConnected
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.14), rgba(14, 14, 22, 0.95))'
                    : 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(14, 14, 22, 0.95))',
                  border: fbStatus.isConnected
                    ? '1px solid rgba(16, 185, 129, 0.45)'
                    : '1px solid rgba(245, 158, 11, 0.4)',
                  borderRadius: '14px',
                  padding: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      background: fbStatus.isConnected
                        ? 'linear-gradient(135deg, #10b981, #059669)'
                        : 'linear-gradient(135deg, #f59e0b, #d97706)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: '24px',
                      boxShadow: fbStatus.isConnected
                        ? '0 6px 20px rgba(16, 185, 129, 0.35)'
                        : '0 6px 20px rgba(245, 158, 11, 0.35)',
                    }}
                  >
                    🔥
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '17px', color: '#fff', fontWeight: 800 }}>
                        {isAr ? 'قاعدة بيانات Firebase المتصلة' : 'Connected Firebase Database'}
                      </h3>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '99px',
                          background: fbStatus.isConnected
                            ? 'rgba(16, 185, 129, 0.25)'
                            : 'rgba(245, 158, 11, 0.25)',
                          color: fbStatus.isConnected ? '#34d399' : '#fbbf24',
                          border: fbStatus.isConnected
                            ? '1px solid #10b981'
                            : '1px solid #f59e0b',
                        }}
                      >
                        {fbStatus.isConnected
                          ? isAr
                            ? '● متصل بنجاح'
                            : '● Connected'
                          : isAr
                            ? '● جاري التحقق...'
                            : '● Verifying...'}
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#a0a0b8' }}>
                      {isAr ? 'معرف المشروع:' : 'Project ID:'}{' '}
                      <strong style={{ color: '#fff' }}>{fbStatus.projectId}</strong>
                      {fbStatus.latencyMs !== undefined && (
                        <span style={{ marginInlineStart: '10px', color: '#34d399' }}>
                          ⚡ {fbStatus.latencyMs}ms
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleTestFirebase}
                    disabled={fbStatus.isTesting}
                    style={{
                      padding: '9px 16px',
                      borderRadius: '8px',
                      border: '1px solid #10b981',
                      background: 'rgba(16, 185, 129, 0.18)',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: fbStatus.isTesting ? 'wait' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>{fbStatus.isTesting ? '⏳' : '⚡'}</span>
                    <span>
                      {fbStatus.isTesting
                        ? isAr
                          ? 'جاري الاختبار...'
                          : 'Testing...'
                        : isAr
                          ? 'اختبار الاتصال المباشر'
                          : 'Test Live Connection'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSyncFirebase}
                    disabled={fbSyncing}
                    style={{
                      padding: '9px 16px',
                      borderRadius: '8px',
                      border: '1px solid #7c5cff',
                      background: 'linear-gradient(135deg, #7c5cff, #5a2fd0)',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: fbSyncing ? 'wait' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>{fbSyncing ? '⏳' : '☁️'}</span>
                    <span>
                      {fbSyncing
                        ? isAr
                          ? 'جاري المزامنة...'
                          : 'Syncing...'
                        : isAr
                          ? 'مزامنة البيانات فوراً إلى Firebase'
                          : 'Sync All to Firebase'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Status / Output Log */}
              {fbLog && (
                <div
                  style={{
                    background: '#0c0c14',
                    border: '1px solid #28283e',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    color: fbLog.includes('خطأ') || fbLog.includes('error') ? '#f87171' : '#34d399',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <span>ℹ️</span>
                  <span>{fbLog}</span>
                </div>
              )}

              {/* Firebase Project Credentials Card */}
              <div
                style={{
                  background: '#14141f',
                  border: '1px solid #26263a',
                  borderRadius: '12px',
                  padding: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', color: '#fff', fontWeight: 700 }}>
                    {isAr ? 'تفاصيل إعدادات اتصال Firebase' : 'Firebase Connection Credentials'}
                  </h4>
                  <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>
                    ✓ {isAr ? 'تم التهيئة والربط بنجاح' : 'Configured & Integrated'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '12px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ background: '#0e0e16', padding: '10px 14px', borderRadius: '8px', border: '1px solid #222234' }}>
                    <div style={{ color: '#88889c', fontSize: '11px' }}>Project ID</div>
                    <div style={{ color: '#fff', fontWeight: 700, fontFamily: 'monospace', marginTop: '3px' }}>
                      {firebaseConfig.projectId}
                    </div>
                  </div>

                  <div style={{ background: '#0e0e16', padding: '10px 14px', borderRadius: '8px', border: '1px solid #222234' }}>
                    <div style={{ color: '#88889c', fontSize: '11px' }}>Auth Domain</div>
                    <div style={{ color: '#fff', fontWeight: 700, fontFamily: 'monospace', marginTop: '3px' }}>
                      {firebaseConfig.authDomain}
                    </div>
                  </div>

                  <div style={{ background: '#0e0e16', padding: '10px 14px', borderRadius: '8px', border: '1px solid #222234' }}>
                    <div style={{ color: '#88889c', fontSize: '11px' }}>Storage Bucket</div>
                    <div style={{ color: '#fff', fontWeight: 700, fontFamily: 'monospace', marginTop: '3px' }}>
                      {firebaseConfig.storageBucket}
                    </div>
                  </div>

                  <div style={{ background: '#0e0e16', padding: '10px 14px', borderRadius: '8px', border: '1px solid #222234' }}>
                    <div style={{ color: '#88889c', fontSize: '11px' }}>Messaging Sender ID</div>
                    <div style={{ color: '#fff', fontWeight: 700, fontFamily: 'monospace', marginTop: '3px' }}>
                      {firebaseConfig.messagingSenderId}
                    </div>
                  </div>

                  <div style={{ background: '#0e0e16', padding: '10px 14px', borderRadius: '8px', border: '1px solid #222234', gridColumn: '1 / -1' }}>
                    <div style={{ color: '#88889c', fontSize: '11px' }}>Web App ID</div>
                    <div style={{ color: '#fff', fontWeight: 700, fontFamily: 'monospace', marginTop: '3px' }}>
                      {firebaseConfig.appId}
                    </div>
                  </div>
                </div>
              </div>

              {/* Synced Collections Guide */}
              <div
                style={{
                  background: '#14141f',
                  border: '1px solid #26263a',
                  borderRadius: '12px',
                  padding: '18px',
                }}
              >
                <h4 style={{ margin: '0 0 12px', fontSize: '15px', color: '#fff', fontWeight: 700 }}>
                  {isAr ? 'مجموعات البيانات السحابية (Firestore Collections)' : 'Cloud Firestore Collections'}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                  <div style={{ background: '#101018', border: '1px solid #222234', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ color: '#7c5cff', fontWeight: 700, fontSize: '13px' }}>
                      📁 platform_settings
                    </div>
                    <div style={{ color: '#9898ad', fontSize: '12px', marginTop: '4px' }}>
                      {isAr
                        ? 'تخزين اسم الموقع والشعار، أسعار باقة برو، صيغ الهدايا المحددة، ورقم الواتساب.'
                        : 'Stores branding, Pro package pricing, format restrictions, and WhatsApp contact.'}
                    </div>
                  </div>

                  <div style={{ background: '#101018', border: '1px solid #222234', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '13px' }}>
                      📁 users
                    </div>
                    <div style={{ color: '#9898ad', fontSize: '12px', marginTop: '4px' }}>
                      {isAr
                        ? 'تخزين الحسابات المسجلة بالموقع، والصلاحيات، والاشتراكات في باقة برو.'
                        : 'Stores registered user accounts, admin roles, and Pro tool subscription statuses.'}
                    </div>
                  </div>

                  <div style={{ background: '#101018', border: '1px solid #222234', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '13px' }}>
                      📁 broadcast_notifications
                    </div>
                    <div style={{ color: '#9898ad', fontSize: '12px', marginTop: '4px' }}>
                      {isAr
                        ? 'تخزين رسائل التحديثات والإشعارات العامة لجميع زوار ومستخدمي الموقع.'
                        : 'Stores global announcement broadcasts displayed under the notification bell.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
