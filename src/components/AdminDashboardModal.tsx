import React, { useState, useRef, useEffect } from 'react';
import {
  ActivityLogEntry,
  AdminPermissionKey,
  ALL_ADMIN_PERMISSIONS,
  ALL_ADMIN_PERMISSION_KEYS,
  ALL_SUPPORTED_FORMATS,
  BroadcastNotification,
  DEFAULT_PRO_PLANS,
  PlatformSettings,
  PlatformState,
  ProPlanDurationKey,
  ProSubscriptionPlan,
  UserAccount,
  buildWhatsAppUrl,
  canAccessAdminDashboard,
  canDeleteUserAccount,
  canUserCaptureScreen,
  getEffectiveAdminPermissions,
  hasAdminPermission,
  isPurgedLegacyAdmin,
  isSuperAdminUser,
  normalizeProPlans,
  sanitizeUsersList,
  getDeletedUserIds,
  addDeletedUserId,
  revokeAdminFromUserAccount,
  setUserScreenCapturePermission,
  getUserProSubscriptionInfo,
  optimizeLogoImageFile,
  sanitizeSiteLogoUrl,
  sanitizeSiteName,
  savePermanentBranding,
  loadPermanentBranding,
  PRO_TOOLS_DEFINITIONS,
  ProToolDefinition,
  ProFeatureRule,
  ProFeatureScope,
  normalizeProFeatureRules,
  resetFeatureFreeAttempts,
  applyUserBanAction,
  canBanUserAccount,
  getEffectiveUserNetworkId,
  isNetworkIdBanned,
  isUserAccountBanned,
} from '../utils/platformStore';
import { getTranslation } from '../utils/i18n';
import {
  firebaseConfig,
  testFirebaseConnection,
  syncAllToFirebase,
  syncSettingsToFirestore,
  subscribeToFirebaseStatus,
  fetchFirestoreUsers,
  saveUserToFirestore,
  deleteUserFromFirestore,
  fetchFirestoreActivityLogs,
  deleteActivityLogFromFirestore,
  clearAllActivityLogsFromFirestore,
  FirebaseConnectionStatus,
} from '../utils/firebase';

export type AdminDashboardTabId =
  | 'users'
  | 'admins_security'
  | 'activity_logs'
  | 'pro'
  | 'branding'
  | 'notifications'
  | 'firebase';

interface AdminDashboardModalProps {
  open: boolean;
  onClose: () => void;
  state: PlatformState;
  onUpdateSettings: (next: PlatformSettings) => void;
  onUpdateUsers: (next: UserAccount[]) => void;
  onUpdateNotifications: (next: BroadcastNotification[]) => void;
  onUpdateActivityLogs?: (next: ActivityLogEntry[]) => void;
  onChangePreviewRole: (role: 'actual' | 'free_user' | 'pro_user') => void;
  onPreviewBanScreen?: (mode: 'account' | 'network') => void;
  initialTab?: AdminDashboardTabId;
}

export default function AdminDashboardModal({
  open,
  onClose,
  state,
  onUpdateSettings,
  onUpdateUsers,
  onUpdateNotifications,
  onUpdateActivityLogs,
  onChangePreviewRole,
  onPreviewBanScreen,
  initialTab = 'users',
}: AdminDashboardModalProps) {
  const [activeTab, setActiveTab] = useState<AdminDashboardTabId>(initialTab);
  const [fbStatus, setFbStatus] = useState<FirebaseConnectionStatus>({
    isConfigured: true,
    isConnected: false,
    isTesting: false,
    projectId: firebaseConfig.projectId,
  });
  const [fbSyncing, setFbSyncing] = useState(false);
  const [fbLog, setFbLog] = useState<string>('');
  const [userSearch, setUserSearch] = useState('');
  const [userFilterRole, setUserFilterRole] = useState<
    'all' | 'admin' | 'pro' | 'free' | 'screen_capture' | 'banned'
  >('all');
  const [customBanTargetInput, setCustomBanTargetInput] = useState('');
  const [customBanReasonInput, setCustomBanReasonInput] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserPassword] = useState('123456');
  const [newUserPlanChoice, setNewUserPlanChoice] = useState<'free' | ProPlanDurationKey>('month');
  const [newUserAllowScreenCapture, setNewUserAllowScreenCapture] = useState<boolean>(false);

  // Moderator & Granular Permissions Editor state
  const [selectedModUserId, setSelectedModUserId] = useState<string>('');
  const [modIsAdmin, setModIsAdmin] = useState<boolean>(false);
  const [modAllowScreenCapture, setModAllowScreenCapture] = useState<boolean>(false);
  const [modBadgeTitle, setModBadgeTitle] = useState<string>('مشرف معتمد 🛡️');
  const [modPermissions, setModPermissions] = useState<AdminPermissionKey[]>([
    'manage_users',
    'view_logs',
  ]);

  // Super Admin Account Security state
  const [superAdminNameInput, setSuperAdminNameInput] = useState<string>('');
  const [superAdminEmailInput, setSuperAdminEmailInput] = useState<string>('');
  const [superAdminPasswordInput, setSuperAdminPasswordInput] = useState<string>('');
  const [showSuperAdminPassword, setShowSuperAdminPassword] = useState<boolean>(false);

  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifImportant, setNotifImportant] = useState(true);
  const [saveFeedback, setSaveFeedback] = useState('');

  // Branding local draft & server-pinning states so siteName and siteLogoUrl never overwrite each other
  const [brandNameDraft, setBrandNameDraft] = useState<string>(state.settings.siteName || 'MotionTools');
  const [externalLogoUrlDraft, setExternalLogoUrlDraft] = useState<string>(
    state.settings.siteLogoUrl && !state.settings.siteLogoUrl.startsWith('data:image/')
      ? state.settings.siteLogoUrl
      : ''
  );
  const [isSavingBranding, setIsSavingBranding] = useState<boolean>(false);
  const [brandingSyncNotice, setBrandingSyncNotice] = useState<string>('');

  const latestSettingsRef = useRef<PlatformSettings>(state.settings);
  latestSettingsRef.current = state.settings;

  const logoFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.settings.siteName) {
      setBrandNameDraft(state.settings.siteName);
    }
    if (state.settings.siteLogoUrl && !state.settings.siteLogoUrl.startsWith('data:image/')) {
      setExternalLogoUrlDraft(state.settings.siteLogoUrl);
    } else if (!state.settings.siteLogoUrl) {
      setExternalLogoUrlDraft('');
    }
  }, [open, state.settings.siteName, state.settings.siteLogoUrl]);

  const currentUser = state.users.find((u) => u.id === state.currentUserId) || null;
  const isCurrentSuperAdmin = isSuperAdminUser(currentUser);
  const hasDashboardAccess = canAccessAdminDashboard(currentUser);

  const tabPermissionMap: Record<AdminDashboardTabId, AdminPermissionKey> = {
    users: 'manage_users',
    admins_security: 'manage_admins',
    activity_logs: 'view_logs',
    pro: 'manage_pro',
    branding: 'manage_branding',
    notifications: 'manage_notifications',
    firebase: 'manage_firebase',
  };

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

  // Ensure activeTab is always a permitted tab for the logged-in admin/moderator
  useEffect(() => {
    if (!open || !currentUser) return;
    const reqPerm = tabPermissionMap[activeTab];
    if (reqPerm && !hasAdminPermission(currentUser, reqPerm)) {
      const firstAllowed = (Object.keys(tabPermissionMap) as AdminDashboardTabId[]).find((tId) =>
        hasAdminPermission(currentUser, tabPermissionMap[tId])
      );
      if (firstAllowed) {
        setActiveTab(firstAllowed);
      }
    }
  }, [open, activeTab, currentUser]);

  // Populate Super Admin credential inputs when opening admins_security tab
  useEffect(() => {
    const superAdminAcc = state.users.find((u) => isSuperAdminUser(u));
    if (superAdminAcc) {
      setSuperAdminNameInput(superAdminAcc.name || '');
      setSuperAdminEmailInput(superAdminAcc.email || '');
      setSuperAdminPasswordInput(superAdminAcc.password || '');
    }
  }, [open, state.users]);

  // Sync selected user into the Moderator Permissions editor
  useEffect(() => {
    const nonSuperUsers = state.users.filter((u) => !isSuperAdminUser(u) && !isPurgedLegacyAdmin(u));
    if (!selectedModUserId && nonSuperUsers.length > 0) {
      setSelectedModUserId(nonSuperUsers[0].id);
      return;
    }
    const target = state.users.find((u) => u.id === selectedModUserId);
    if (target) {
      const isTargetMod = canAccessAdminDashboard(target);
      setModIsAdmin(isTargetMod);
      setModAllowScreenCapture(Boolean(target.allowScreenCapture));
      setModBadgeTitle(target.adminBadgeTitle || 'مشرف معتمد 🛡️');
      const existingPerms = getEffectiveAdminPermissions(target);
      setModPermissions(existingPerms.length > 0 ? existingPerms : ['manage_users', 'view_logs']);
    }
  }, [selectedModUserId, state.users]);

  useEffect(() => {
    if (open && activeTab === 'firebase') {
      testFirebaseConnection();
    }
    if (open && (activeTab === 'users' || activeTab === 'admins_security')) {
      fetchFirestoreUsers().then((fetched) => {
        if (fetched && fetched.length > 0) {
          const deletedIds = getDeletedUserIds();
          const userMap = new Map<string, UserAccount>();
          state.users.forEach((u) => {
            if (!isPurgedLegacyAdmin(u) && !deletedIds.includes(u.id)) userMap.set(u.id, u);
          });
          fetched.forEach((u) => {
            if (!isPurgedLegacyAdmin(u) && !deletedIds.includes(u.id)) userMap.set(u.id, u);
          });
          onUpdateUsers(sanitizeUsersList(Array.from(userMap.values()), deletedIds));
        }
      }).catch(() => {});
    }
    if (open && activeTab === 'activity_logs') {
      fetchFirestoreActivityLogs().then((fetched) => {
        if (fetched && onUpdateActivityLogs) {
          onUpdateActivityLogs(fetched);
        }
      }).catch(() => {});
    }
  }, [open, activeTab]);

  const [isRefreshingUsers, setIsRefreshingUsers] = useState(false);

  // Strict security gate: never render Admin Dashboard if closed or user lacks admin/moderator permissions
  if (!open || !hasDashboardAccess) return null;

  const isAr = state.language === 'ar';
  const t = getTranslation(state.language);
  const { settings, users, notifications } = state;

  const showSavedFeedback = (msgAr: string, msgEn: string) => {
    setSaveFeedback(isAr ? msgAr : msgEn);
    setTimeout(() => setSaveFeedback(''), 2800);
  };

  const handleSelectUserForPermissions = (userId: string) => {
    setSelectedModUserId(userId);
    setActiveTab('admins_security');
  };

  const handleToggleModPermissionKey = (permKey: AdminPermissionKey) => {
    setModPermissions((prev) =>
      prev.includes(permKey) ? prev.filter((k) => k !== permKey) : [...prev, permKey]
    );
  };

  const handleSaveModeratorPermissions = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!hasAdminPermission(currentUser, 'manage_admins')) return;
    const candidateUsers = sortedUsers.filter((u) => !isSuperAdminUser(u));
    const target =
      candidateUsers.find((u) => u.id === selectedModUserId) || candidateUsers[0] || null;
    if (!target || isSuperAdminUser(target)) return;

    const cleanPerms = modIsAdmin ? modPermissions : [];
    const effectiveRole: 'admin' | 'user' = modIsAdmin && cleanPerms.length > 0 ? 'admin' : 'user';
    const nowIso = new Date().toISOString();

    const baseUpdated: UserAccount =
      effectiveRole === 'admin'
        ? {
            ...target,
            role: 'admin',
            isSuperAdmin: false,
            adminPermissions: cleanPerms,
            adminBadgeTitle: modBadgeTitle.trim() || 'مشرف معتمد 🛡️',
            adminGrantedAt: target.adminGrantedAt || nowIso,
            isPro: true,
          }
        : revokeAdminFromUserAccount(target);

    const updatedUser: UserAccount = setUserScreenCapturePermission(
      baseUpdated,
      modAllowScreenCapture,
      nowIso
    );

    if (effectiveRole === 'user') {
      setModIsAdmin(false);
      setModPermissions([]);
      setModBadgeTitle('');
    }

    const nextUsers = users.map((u) => (u.id === updatedUser.id ? updatedUser : u));
    onUpdateUsers(nextUsers);
    await saveUserToFirestore(updatedUser);

    showSavedFeedback(
      effectiveRole === 'admin'
        ? `🛡️ تم حفظ صلاحيات الحساب (${updatedUser.email}) كمشرف${updatedUser.allowScreenCapture ? ' + السماح بتصوير الشاشة والفيديو 📸' : ''} ✓`
        : updatedUser.allowScreenCapture
          ? `📸 تم منح الحساب (${updatedUser.email}) صلاحية تصوير الشاشة وتسجيل فيديو الشاشة بحرية ✓`
          : `✅ تم تحديث صلاحيات الحساب (${updatedUser.email}) كمستخدم عادي ✓`,
      effectiveRole === 'admin'
        ? `🛡️ Moderator permissions${updatedUser.allowScreenCapture ? ' + Screen Capture 📸' : ''} saved for ${updatedUser.email} ✓`
        : updatedUser.allowScreenCapture
          ? `📸 Screen capture & video recording permission granted to ${updatedUser.email} ✓`
          : `✅ Updated permissions for ${updatedUser.email} ✓`
    );
  };

  const handleToggleUserScreenCapture = async (userId: string) => {
    if (
      !hasAdminPermission(currentUser, 'manage_users') &&
      !hasAdminPermission(currentUser, 'manage_admins')
    ) {
      return;
    }
    const target = users.find((u) => u.id === userId);
    if (!target || isSuperAdminUser(target)) return;

    const nextAllowed = !target.allowScreenCapture;
    const updatedUser = setUserScreenCapturePermission(target, nextAllowed);

    if (selectedModUserId === userId) {
      setModAllowScreenCapture(nextAllowed);
    }

    const nextUsers = users.map((u) => (u.id === updatedUser.id ? updatedUser : u));
    onUpdateUsers(nextUsers);
    await saveUserToFirestore(updatedUser);

    showSavedFeedback(
      nextAllowed
        ? `📸 تم منح الحساب (${updatedUser.email}) صلاحية تصوير الشاشة وتسجيل فيديو الشاشة من أي موقع أو أداة بحرية ✓`
        : `🚫 تم إلغاء صلاحية تصوير الشاشة وتسجيل الفيديو من الحساب (${updatedUser.email}) وتفعيل الحماية عليه ✓`,
      nextAllowed
        ? `📸 Granted screenshot & screen video recording permission to ${updatedUser.email} ✓`
        : `🚫 Revoked screenshot & screen video recording permission from ${updatedUser.email} ✓`
    );
  };

  const handleQuickRevokeModerator = async (userId: string) => {
    if (!hasAdminPermission(currentUser, 'manage_admins')) return;
    const target = users.find((u) => u.id === userId);
    if (!target || isSuperAdminUser(target)) return;

    const updatedUser = revokeAdminFromUserAccount(target);
    if (selectedModUserId === userId) {
      setModIsAdmin(false);
      setModPermissions([]);
      setModBadgeTitle('');
    }
    const nextUsers = users.map((u) => (u.id === updatedUser.id ? updatedUser : u));
    onUpdateUsers(nextUsers);
    await saveUserToFirestore(updatedUser);
    showSavedFeedback(
      `🚫 تم حذف صلاحية الأدمن من الحساب (${updatedUser.email}) نهائياً وإعادته كمستخدم عادي ✓`,
      `🚫 Admin role removed permanently from ${updatedUser.email} ✓`
    );
  };

  const handleUpdateSuperAdminCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCurrentSuperAdmin) return;
    const emailClean = superAdminEmailInput.trim().toLowerCase();
    const pwdClean = superAdminPasswordInput.trim();
    const nameClean = superAdminNameInput.trim() || 'المدير العام (Super Admin)';

    if (!emailClean || !pwdClean || pwdClean.length < 6) {
      showSavedFeedback(
        '⚠️ يرجى إدخال بريد إلكتروني صحيح وكلمة مرور قوية (6 أحرف على الأقل)',
        '⚠️ Please enter a valid email and strong password (min 6 chars)'
      );
      return;
    }
    if (isPurgedLegacyAdmin({ email: emailClean })) {
      showSavedFeedback(
        '⛔ لا يمكن استخدام بريد المدير القديم المحذوف نهائياً، اختر بريداً جديداً.',
        '⛔ Cannot use a purged legacy admin email.'
      );
      return;
    }

    const superAcc = users.find((u) => isSuperAdminUser(u));
    if (!superAcc) return;

    const updatedSuper: UserAccount = {
      ...superAcc,
      name: nameClean,
      email: emailClean,
      password: pwdClean,
      role: 'admin',
      isSuperAdmin: true,
      adminPermissions: [...ALL_ADMIN_PERMISSION_KEYS],
      isPro: true,
    };

    const nextUsers = users.map((u) => (u.id === superAcc.id ? updatedSuper : u));
    onUpdateUsers(nextUsers);
    await saveUserToFirestore(updatedSuper);
    showSavedFeedback(
      '🔐 تم تحديث وتأمين بيانات حساب المدير العام ومزامنتها مع الخادم بنجاح ✓',
      '🔐 Super Admin credentials updated and secured in Firebase ✓'
    );
  };

  const handleRefreshUsersFromFirebase = async () => {
    setIsRefreshingUsers(true);
    try {
      const fetched = await fetchFirestoreUsers();
      if (fetched && fetched.length > 0) {
        const deletedIds = getDeletedUserIds();
        const userMap = new Map<string, UserAccount>();
        users.forEach((u) => {
          if (!isPurgedLegacyAdmin(u) && !deletedIds.includes(u.id)) userMap.set(u.id, u);
        });
        fetched.forEach((u) => {
          if (!isPurgedLegacyAdmin(u) && !deletedIds.includes(u.id)) userMap.set(u.id, u);
        });
        onUpdateUsers(sanitizeUsersList(Array.from(userMap.values()), deletedIds));
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
    if (!hasAdminPermission(currentUser, 'manage_firebase')) return;
    setFbLog(isAr ? 'جاري فحص الاتصال بقاعدة بيانات Firebase...' : 'Testing connection to Firebase...');
    const res = await testFirebaseConnection();
    setFbLog(res.message || (res.isConnected ? 'متصل بنجاح' : 'خطأ في الاتصال'));
    if (res.isConnected) {
      showSavedFeedback('تم التحقق من الاتصال بـ Firebase بنجاح ✓', 'Firebase connection verified ✓');
    }
  };

  const handleSyncFirebase = async () => {
    if (!hasAdminPermission(currentUser, 'manage_firebase')) return;
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

  const normalizedPlans = normalizeProPlans(settings.proPlans, settings.proPrice);

  const handleSetUserProPlan = async (userId: string, planChoice: 'free' | ProPlanDurationKey) => {
    if (!hasAdminPermission(currentUser, 'manage_users')) return;
    let updatedUser: UserAccount | undefined;
    const chosenPlan =
      planChoice === 'free'
        ? null
        : normalizedPlans.find((p) => p.id === planChoice) || normalizedPlans[1] || normalizedPlans[0];

    const next = users.map((u) => {
      if (u.id !== userId) return u;
      if (!chosenPlan) {
        updatedUser = {
          ...u,
          isPro: false,
          proPlanId: undefined,
          proPlanName: '',
          proExpiresAt: '',
          proActivatedAt: '',
        };
      } else {
        const now = new Date();
        const expires = new Date(now.getTime() + chosenPlan.durationDays * 24 * 60 * 60 * 1000);
        updatedUser = {
          ...u,
          isPro: true,
          proPlanId: chosenPlan.id,
          proPlanName: isAr ? chosenPlan.nameAr : chosenPlan.nameEn,
          proActivatedAt: now.toISOString(),
          proExpiresAt: expires.toISOString(),
        };
      }
      return updatedUser;
    });
    onUpdateUsers(next);
    if (updatedUser) {
      await saveUserToFirestore(updatedUser);
      showSavedFeedback(
        updatedUser.isPro
          ? `تم تفعيل (${updatedUser.proPlanName}) للحساب (${updatedUser.name}) وحفظه في Firebase ⚡`
          : `تم إزالة باقة برو من الحساب (${updatedUser.name}) وإعادته مستخدم عادي ❌`,
        updatedUser.isPro
          ? `Pro plan (${updatedUser.proPlanName}) activated for ${updatedUser.name} ⚡`
          : 'Pro removed and saved to Firebase ❌'
      );
    }
  };

  const handleToggleUserPro = async (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    await handleSetUserProPlan(userId, target.isPro ? 'free' : target.proPlanId || 'month');
  };

  const handleUpdateProPlan = (planId: ProPlanDurationKey, patch: Partial<ProSubscriptionPlan>) => {
    if (!hasAdminPermission(currentUser, 'manage_pro')) return;
    const nextPlans = normalizedPlans.map((p) => (p.id === planId ? { ...p, ...patch } : p));
    const monthPlan = nextPlans.find((p) => p.id === 'month');
    onUpdateSettings({
      ...settings,
      proPlans: nextPlans,
      proPrice: monthPlan ? monthPlan.price : settings.proPrice,
    });
    showSavedFeedback(
      'تم حفظ وتحديث أسعار وباقات أدوات برو بنجاح ✓',
      'Pro subscription plans & pricing updated ✓'
    );
  };

  const handleDeleteUser = async (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (!target || !canDeleteUserAccount(currentUser, target)) return;

    const confirmMsg = isAr
      ? `هل أنت متأكد من حذف حساب "${target.name}" (${target.email}) وجميع صلاحياته بشكل نهائي من قاعدة بيانات Firebase ومن الداشبورد؟`
      : `Are you sure you want to permanently delete user "${target.name}" (${target.email}) from Firebase and dashboard?`;

    if (!window.confirm(confirmMsg)) return;

    addDeletedUserId(userId);
    const strippedUser = revokeAdminFromUserAccount(target);
    onUpdateUsers(users.filter((u) => u.id !== userId));
    await saveUserToFirestore({
      ...strippedUser,
      isPro: false,
      proPlanName: '',
      proExpiresAt: '',
      proActivatedAt: '',
    });
    const isDeletedInFs = await deleteUserFromFirestore(userId);

    showSavedFeedback(
      isDeletedInFs
        ? `🗑️ تم حذف الحساب "${target.name}" وإلغاء جميع صلاحياته نهائياً من قاعدة البيانات والداشبورد ✓`
        : `🗑️ تم حذف الحساب "${target.name}" وإلغاء صلاحياته نهائياً ✓`,
      `User account "${target.name}" deleted permanently ✓`
    );
  };

  const handleToggleAccountBan = async (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (!target || !canBanUserAccount(currentUser, target)) return;

    const currentlyBanned = isUserAccountBanned(target, settings);
    const nextBanAccount = !currentlyBanned;
    const nextBanNetwork = nextBanAccount ? Boolean(target.networkBanned) : false;

    const res = applyUserBanAction({
      users,
      settings: latestSettingsRef.current,
      targetUserId: userId,
      banAccount: nextBanAccount,
      banNetwork: nextBanNetwork,
      reason: nextBanAccount
        ? customBanReasonInput.trim() || 'حظر حساب نهائي من الإدارة (Account Ban)'
        : '',
    });

    latestSettingsRef.current = res.settings;
    onUpdateUsers(res.users);
    onUpdateSettings(res.settings);
    if (res.updatedUser) {
      await saveUserToFirestore(res.updatedUser);
    }
    await syncSettingsToFirestore(res.settings);

    showSavedFeedback(
      nextBanAccount
        ? `🚫 تم حظر حساب "${target.name}" (${target.email}) نهائياً ومنعه من دخول المنصة ✓`
        : `✅ تم فك حظر حساب "${target.name}" واستعادة إمكانية دخوله للمنصة ✓`,
      nextBanAccount
        ? `Account "${target.name}" permanently banned from platform ✓`
        : `Account "${target.name}" unbanned ✓`
    );
  };

  const handleToggleNetworkBan = async (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (!target || !canBanUserAccount(currentUser, target)) return;

    const targetNetId = getEffectiveUserNetworkId(target);
    const currentlyNetBanned =
      Boolean(target.networkBanned) || isNetworkIdBanned(targetNetId, settings, users);
    const nextBanNetwork = !currentlyNetBanned;
    const nextBanAccount = nextBanNetwork ? true : false;

    const res = applyUserBanAction({
      users,
      settings: latestSettingsRef.current,
      targetUserId: userId,
      banAccount: nextBanAccount,
      banNetwork: nextBanNetwork,
      reason: nextBanNetwork
        ? customBanReasonInput.trim() ||
          `حظر شبكة وحساب نهائي (${targetNetId}) — ممنوع من دخول المنصة نهائياً`
        : '',
    });

    latestSettingsRef.current = res.settings;
    onUpdateUsers(res.users);
    onUpdateSettings(res.settings);
    if (res.updatedUser) {
      await saveUserToFirestore(res.updatedUser);
    }
    await syncSettingsToFirestore(res.settings);

    showSavedFeedback(
      nextBanNetwork
        ? `🌐🚫 تم حظر شبكة (${targetNetId}) وحساب "${target.name}" نهائياً من دخول المنصة ✓`
        : `✅ تم فك حظر الشبكة (${targetNetId}) والحساب "${target.name}" بنجاح ✓`,
      nextBanNetwork
        ? `Network (${targetNetId}) & account "${target.name}" permanently banned ✓`
        : `Network (${targetNetId}) & account unbanned ✓`
    );
  };

  const handleManualFirewallBan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAdminPermission(currentUser, 'manage_users') && !hasAdminPermission(currentUser, 'manage_admins')) {
      return;
    }
    const rawTarget = customBanTargetInput.trim();
    if (!rawTarget) return;

    const upperTarget = rawTarget.toUpperCase();
    const lowerTarget = rawTarget.toLowerCase();

    // Check if it matches an existing user by email, name, or networkId
    const matchedUser = users.find(
      (u) =>
        !isSuperAdminUser(u) &&
        (u.email.toLowerCase() === lowerTarget ||
          getEffectiveUserNetworkId(u) === upperTarget ||
          u.id === rawTarget)
    );

    if (matchedUser) {
      const netId = getEffectiveUserNetworkId(matchedUser);
      const res = applyUserBanAction({
        users,
        settings: latestSettingsRef.current,
        targetUserId: matchedUser.id,
        banAccount: true,
        banNetwork: true,
        reason: customBanReasonInput.trim() || `حظر شبكة وحساب نهائي (${netId})`,
      });
      latestSettingsRef.current = res.settings;
      onUpdateUsers(res.users);
      onUpdateSettings(res.settings);
      if (res.updatedUser) {
        await saveUserToFirestore(res.updatedUser);
      }
      await syncSettingsToFirestore(res.settings);
      setCustomBanTargetInput('');
      setCustomBanReasonInput('');
      showSavedFeedback(
        `🌐🚫 تم حظر حساب "${matchedUser.name}" وشبكته (${netId}) نهائياً من المنصة ✓`,
        `Banned user "${matchedUser.name}" and network (${netId}) ✓`
      );
      return;
    }

    // Otherwise, add directly to bannedNetworkIds or bannedEmails
    const curSettings = latestSettingsRef.current;
    const isEmail = lowerTarget.includes('@');
    const nextBannedNets = new Set(
      (curSettings.bannedNetworkIds || []).map((n) => n.trim().toUpperCase()).filter(Boolean)
    );
    const nextBannedEmails = new Set(
      (curSettings.bannedEmails || []).map((em) => em.trim().toLowerCase()).filter(Boolean)
    );

    if (isEmail) {
      nextBannedEmails.add(lowerTarget);
    } else {
      const formattedNet = upperTarget.startsWith('NET-') ? upperTarget : `NET-${upperTarget}`;
      nextBannedNets.add(formattedNet);
    }

    const nextSettings: PlatformSettings = {
      ...curSettings,
      bannedNetworkIds: Array.from(nextBannedNets),
      bannedEmails: Array.from(nextBannedEmails),
    };
    latestSettingsRef.current = nextSettings;
    onUpdateSettings(nextSettings);
    await syncSettingsToFirestore(nextSettings);
    setCustomBanTargetInput('');
    setCustomBanReasonInput('');
    showSavedFeedback(
      isEmail
        ? `🚫 تم إدراج البريد (${lowerTarget}) في قائمة الحظر النهائي ✓`
        : `🌐🚫 تم إدراج معرف الشبكة (${upperTarget}) في جدار الحظر النهائي للمنصة ✓`,
      'Added to permanent platform firewall blocklist ✓'
    );
  };

  const handleUnbanNetworkIdFromFirewall = async (netId: string) => {
    const cleanNet = netId.trim().toUpperCase();
    let curUsers = [...users];
    let curSettings: PlatformSettings = {
      ...latestSettingsRef.current,
      bannedNetworkIds: (latestSettingsRef.current.bannedNetworkIds || []).filter(
        (n) => n.trim().toUpperCase() !== cleanNet
      ),
    };

    const affectedUsers = curUsers.filter(
      (u) => !isSuperAdminUser(u) && getEffectiveUserNetworkId(u) === cleanNet && (u.isBanned || u.networkBanned)
    );

    for (const u of affectedUsers) {
      const res = applyUserBanAction({
        users: curUsers,
        settings: curSettings,
        targetUserId: u.id,
        banAccount: false,
        banNetwork: false,
      });
      curUsers = res.users;
      curSettings = res.settings;
      if (res.updatedUser) {
        await saveUserToFirestore(res.updatedUser);
      }
    }

    latestSettingsRef.current = curSettings;
    onUpdateUsers(curUsers);
    onUpdateSettings(curSettings);
    await syncSettingsToFirestore(curSettings);
    showSavedFeedback(
      `✅ تم رفع الحظر عن الشبكة (${cleanNet}) بنجاح ✓`,
      `Unbanned network (${cleanNet}) ✓`
    );
  };

  const handleDeleteLogEntry = async (logId: string) => {
    if (!hasAdminPermission(currentUser, 'view_logs')) return;
    const nextLogs = (state.activityLogs || []).filter((l) => l.id !== logId);
    if (onUpdateActivityLogs) {
      onUpdateActivityLogs(nextLogs);
    }
    await deleteActivityLogFromFirestore(logId);
    showSavedFeedback('تم حذف السجل بنجاح من قاعدة البيانات والداشبورد ✓', 'Log deleted from database & dashboard ✓');
  };

  const handleClearAllLogs = async () => {
    if (!hasAdminPermission(currentUser, 'view_logs')) return;
    const allLogs = state.activityLogs || [];
    if (allLogs.length === 0) return;
    if (
      !window.confirm(
        isAr
          ? 'هل أنت متأكد من مسح جميع السجلات بشكل نهائي من قاعدة البيانات؟'
          : 'Are you sure you want to delete all activity logs from the database?'
      )
    )
      return;

    const logIds = allLogs.map((l) => l.id);
    if (onUpdateActivityLogs) {
      onUpdateActivityLogs([]);
    }
    await clearAllActivityLogsFromFirestore(logIds);
    showSavedFeedback('تم مسح جميع السجلات نهائياً من قاعدة البيانات ✓', 'All activity logs cleared from database ✓');
  };

  const handleRefreshLogsFromFirebase = async () => {
    setIsRefreshingLogs(true);
    try {
      const fetched = await fetchFirestoreActivityLogs();
      if (fetched && onUpdateActivityLogs) {
        onUpdateActivityLogs(fetched);
        showSavedFeedback(
          `تم جلب السجلات وتحديثها من Firebase (${fetched.length} عنصر) ✓`,
          `Activity logs refreshed from Firebase (${fetched.length} entries) ✓`
        );
      }
    } catch {
      showSavedFeedback('تعذر جلب السجلات من Firebase', 'Could not refresh activity logs');
    } finally {
      setIsRefreshingLogs(false);
    }
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAdminPermission(currentUser, 'manage_users')) return;
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    const emailClean = newUserEmail.trim().toLowerCase();
    if (isPurgedLegacyAdmin({ email: emailClean })) {
      showSavedFeedback('هذا البريد محظور أمنياً!', 'This email is restricted!');
      return;
    }
    const exists = users.some((u) => u.email.toLowerCase() === emailClean);
    if (exists) {
      showSavedFeedback('البريد الإلكتروني مسجل بالفعل!', 'Email already exists!');
      return;
    }
    const chosenPlan =
      newUserPlanChoice === 'free'
        ? null
        : normalizedPlans.find((p) => p.id === newUserPlanChoice) || normalizedPlans[1];
    const now = new Date();
    const expires = chosenPlan
      ? new Date(now.getTime() + chosenPlan.durationDays * 24 * 60 * 60 * 1000)
      : null;

    const created: UserAccount = {
      id: 'usr_' + Date.now(),
      name: newUserName.trim(),
      email: emailClean,
      phone: newUserPhone.trim(),
      password: newUserPassword || '123456',
      role: 'user',
      allowScreenCapture: Boolean(newUserAllowScreenCapture),
      screenCaptureGrantedAt: newUserAllowScreenCapture ? now.toISOString() : '',
      isPro: !!chosenPlan,
      proPlanId: chosenPlan ? chosenPlan.id : undefined,
      proPlanName: chosenPlan ? (isAr ? chosenPlan.nameAr : chosenPlan.nameEn) : undefined,
      createdAt: now.toISOString(),
      proActivatedAt: chosenPlan ? now.toISOString() : undefined,
      proExpiresAt: expires ? expires.toISOString() : undefined,
    };
    onUpdateUsers([created, ...users]);
    saveUserToFirestore(created);
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPhone('');
    setNewUserAllowScreenCapture(false);
    showSavedFeedback(
      created.allowScreenCapture
        ? 'تم إنشاء الحساب مع منحه صلاحية تصوير الشاشة وتسجيل الفيديو وحفظه في Firebase ✓'
        : 'تم إنشاء الحساب وحفظه في Firebase بنجاح ✓',
      created.allowScreenCapture
        ? 'User account created with screen capture permission & saved to Firebase ✓'
        : 'User account created & saved to Firebase ✓'
    );
  };

  const handleToggleFormatPro = (fmtKey: string) => {
    if (!hasAdminPermission(currentUser, 'manage_pro')) return;
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
    if (!hasAdminPermission(currentUser, 'manage_pro')) return;
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

  const normalizedFeatureRules = normalizeProFeatureRules(settings.proFeatureRules);

  const handleUpdateProFeatureRule = (featureKey: string, patch: Partial<ProFeatureRule>) => {
    if (!hasAdminPermission(currentUser, 'manage_pro')) return;
    const currentRule = normalizedFeatureRules[featureKey] || {
      isPro: true,
      scope: 'export',
      allowFreeAttempts: true,
      freeAttemptsCount: 3,
    };
    const nextRules = {
      ...normalizedFeatureRules,
      [featureKey]: {
        ...currentRule,
        ...patch,
      },
    };
    onUpdateSettings({
      ...settings,
      proFeatureRules: nextRules,
    });
    showSavedFeedback(
      'تم تحديث إعدادات ميزة برو والمحاولات المجانية ✓',
      'Pro feature & free attempts settings updated ✓'
    );
  };

  const handleResetFeatureAttemptsForTesting = (featureKey: string) => {
    resetFeatureFreeAttempts(featureKey);
    showSavedFeedback(
      'تمت إعادة تصفير المحاولات المجانية بنجاح للتجربة ✓',
      'Free attempts reset for testing ✓'
    );
  };

  const handleSiteNameChange = (rawName: string) => {
    if (!hasAdminPermission(currentUser, 'manage_branding')) return;
    setBrandNameDraft(rawName);
    const currentSettings = latestSettingsRef.current;
    const vault = loadPermanentBranding();
    // Always preserve the currently uploaded/saved logo when changing siteName!
    const preservedLogo =
      sanitizeSiteLogoUrl(currentSettings.siteLogoUrl) || vault?.siteLogoUrl || '';
    const nowIso = new Date().toISOString();
    const safeName = rawName.trim() ? sanitizeSiteName(rawName) : currentSettings.siteName || 'MotionTools';

    const nextSettings: PlatformSettings = {
      ...currentSettings,
      siteName: safeName,
      siteLogoUrl: preservedLogo,
      brandingUpdatedAt: nowIso,
      logoExplicitlyRemoved: preservedLogo ? false : Boolean(currentSettings.logoExplicitlyRemoved),
    };
    savePermanentBranding({
      siteName: nextSettings.siteName,
      siteLogoUrl: nextSettings.siteLogoUrl,
      brandingUpdatedAt: nowIso,
      logoExplicitlyRemoved: nextSettings.logoExplicitlyRemoved,
    });
    onUpdateSettings(nextSettings);
    showSavedFeedback('تم تحديث اسم الموقع مع الحفاظ على اللوجو ✓', 'Site name updated & logo preserved ✓');
  };

  const handleExternalLogoUrlChange = (rawUrl: string) => {
    if (!hasAdminPermission(currentUser, 'manage_branding')) return;
    setExternalLogoUrlDraft(rawUrl);
    const trimmed = rawUrl.trim();
    const currentSettings = latestSettingsRef.current;
    const vault = loadPermanentBranding();
    // If the user clears the external URL box while an uploaded data:image logo is active, keep the uploaded logo!
    if (!trimmed && currentSettings.siteLogoUrl?.startsWith('data:image/')) {
      return;
    }
    const safeLogo = sanitizeSiteLogoUrl(trimmed);
    if (trimmed && !safeLogo) {
      return;
    }
    const nowIso = new Date().toISOString();
    const preservedName = sanitizeSiteName(
      brandNameDraft || currentSettings.siteName || vault?.siteName || 'MotionTools'
    );
    const nextSettings: PlatformSettings = {
      ...currentSettings,
      siteName: preservedName,
      siteLogoUrl: safeLogo,
      brandingUpdatedAt: nowIso,
      logoExplicitlyRemoved: !safeLogo,
    };
    savePermanentBranding({
      siteName: nextSettings.siteName,
      siteLogoUrl: nextSettings.siteLogoUrl,
      brandingUpdatedAt: nowIso,
      logoExplicitlyRemoved: nextSettings.logoExplicitlyRemoved,
    });
    onUpdateSettings(nextSettings);
    showSavedFeedback('تم تحديث رابط اللوجو ✓', 'Logo URL updated ✓');
  };

  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasAdminPermission(currentUser, 'manage_branding')) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsSavingBranding(true);
    setBrandingSyncNotice(
      isAr
        ? '⏳ جاري تحسين وضغط صورة اللوجو وحفظها وتثبيتها في السيرفر...'
        : '⏳ Optimizing & pinning logo image to server...'
    );

    try {
      const optimizedDataUrl = await optimizeLogoImageFile(file, 256);
      if (!optimizedDataUrl) {
        setBrandingSyncNotice(
          isAr ? '⚠️ تعذر قراءة ملف الصورة، يرجى اختيار صورة صالحة.' : '⚠️ Could not process image file.'
        );
        setIsSavingBranding(false);
        return;
      }

      const currentSettings = latestSettingsRef.current;
      const vault = loadPermanentBranding();
      const preservedSiteName = sanitizeSiteName(
        brandNameDraft || currentSettings.siteName || vault?.siteName || 'MotionTools'
      );
      const nowIso = new Date().toISOString();

      const nextSettings: PlatformSettings = {
        ...currentSettings,
        siteName: preservedSiteName,
        siteLogoUrl: optimizedDataUrl,
        brandingUpdatedAt: nowIso,
        logoExplicitlyRemoved: false,
      };

      savePermanentBranding({
        siteName: preservedSiteName,
        siteLogoUrl: optimizedDataUrl,
        brandingUpdatedAt: nowIso,
        logoExplicitlyRemoved: false,
      });

      setExternalLogoUrlDraft('');
      onUpdateSettings(nextSettings);
      const synced = await syncSettingsToFirestore(nextSettings);

      setBrandingSyncNotice(
        synced
          ? isAr
            ? '✅ تم رفع وتثبيت اللوجو الجديد واسم الموقع في السيرفر وقاعدة البيانات بشكل دائم!'
            : '✅ New logo & site name permanently pinned to Firebase server!'
          : isAr
            ? '✅ تم حفظ وتثبيت اللوجو الجديد واسم الموقع بشكل دائم!'
            : '✅ New logo & site name permanently saved!'
      );
      showSavedFeedback('تم رفع وتثبيت لوجو الموقع بشكل دائم ✓', 'Site logo permanently saved ✓');
    } catch {
      setBrandingSyncNotice(
        isAr ? '⚠️ حدث خطأ أثناء معالجة الصورة.' : '⚠️ Error processing logo image.'
      );
    } finally {
      setIsSavingBranding(false);
    }
  };

  const handleSaveBrandingPermanently = async () => {
    if (!hasAdminPermission(currentUser, 'manage_branding')) return;
    setIsSavingBranding(true);
    const currentSettings = latestSettingsRef.current;
    const vault = loadPermanentBranding();

    const finalSiteName = sanitizeSiteName(
      brandNameDraft || currentSettings.siteName || vault?.siteName || 'MotionTools'
    );
    const candidateExternal = sanitizeSiteLogoUrl(externalLogoUrlDraft);
    const finalLogoUrl =
      candidateExternal ||
      sanitizeSiteLogoUrl(currentSettings.siteLogoUrl) ||
      (currentSettings.logoExplicitlyRemoved ? '' : vault?.siteLogoUrl || '');

    const nowIso = new Date().toISOString();
    const nextSettings: PlatformSettings = {
      ...currentSettings,
      siteName: finalSiteName,
      siteLogoUrl: finalLogoUrl,
      brandingUpdatedAt: nowIso,
      logoExplicitlyRemoved: finalLogoUrl ? false : Boolean(currentSettings.logoExplicitlyRemoved),
    };

    savePermanentBranding({
      siteName: nextSettings.siteName,
      siteLogoUrl: nextSettings.siteLogoUrl,
      brandingUpdatedAt: nowIso,
      logoExplicitlyRemoved: nextSettings.logoExplicitlyRemoved,
    });

    onUpdateSettings(nextSettings);
    const ok = await syncSettingsToFirestore(nextSettings);
    setIsSavingBranding(false);
    setBrandingSyncNotice(
      ok
        ? isAr
          ? `✅ تم حفظ وتثبيت اسم الموقع (${finalSiteName}) واللوجو في السيرفر بشكل دائم ولن يتم حذفهما!`
          : `✅ Site name (${finalSiteName}) and logo permanently pinned on server!`
        : isAr
          ? `✅ تم تثبيت اسم الموقع (${finalSiteName}) واللوجو بشكل دائم!`
          : `✅ Site name & logo permanently saved!`
    );
    showSavedFeedback(
      'تم حفظ وتثبيت اسم ولوجو الموقع في السيرفر بشكل دائم ✓',
      'Branding permanently pinned to server ✓'
    );
  };

  const handleResetLogoToDefault = async () => {
    if (!hasAdminPermission(currentUser, 'manage_branding')) return;
    const currentSettings = latestSettingsRef.current;
    const preservedSiteName = sanitizeSiteName(
      brandNameDraft || currentSettings.siteName || 'MotionTools'
    );
    const nowIso = new Date().toISOString();
    const nextSettings: PlatformSettings = {
      ...currentSettings,
      siteName: preservedSiteName,
      siteLogoUrl: '',
      brandingUpdatedAt: nowIso,
      logoExplicitlyRemoved: true,
    };
    setExternalLogoUrlDraft('');
    savePermanentBranding({
      siteName: preservedSiteName,
      siteLogoUrl: '',
      brandingUpdatedAt: nowIso,
      logoExplicitlyRemoved: true,
    });
    onUpdateSettings(nextSettings);
    await syncSettingsToFirestore(nextSettings);
    setBrandingSyncNotice(
      isAr
        ? '🔄 تمت إزالة الصورة المرفوعة واستعادة اللوجو الافتراضي للموقع.'
        : '🔄 Uploaded logo removed and default logo restored.'
    );
    showSavedFeedback('تمت استعادة اللوجو الافتراضي', 'Default logo restored');
  };

  const handleSendNotification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAdminPermission(currentUser, 'manage_notifications')) return;
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
    if (!hasAdminPermission(currentUser, 'manage_notifications')) return;
    onUpdateNotifications(notifications.filter((n) => n.id !== id));
    showSavedFeedback('تم حذف الإشعار', 'Notification deleted');
  };

  const isRecentUser = (u: UserAccount) => {
    if (!u.createdAt) return false;
    const diffHours = (Date.now() - new Date(u.createdAt).getTime()) / (1000 * 60 * 60);
    return diffHours < 48;
  };

  // Sort newest registrations first so new users always appear at the top!
  const sortedUsers = [...users]
    .filter((u) => !isPurgedLegacyAdmin(u))
    .sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

  const filteredUsers = sortedUsers.filter((u) => {
    const isUserAdmin = canAccessAdminDashboard(u);
    const isBanned = isUserAccountBanned(u, settings) || isNetworkIdBanned(getEffectiveUserNetworkId(u), settings, users);
    if (userFilterRole === 'admin' && !isUserAdmin) return false;
    if (userFilterRole === 'pro' && (!u.isPro || isUserAdmin || isBanned)) return false;
    if (userFilterRole === 'free' && (u.isPro || isUserAdmin || isBanned)) return false;
    if (userFilterRole === 'screen_capture' && !canUserCaptureScreen(u)) return false;
    if (userFilterRole === 'banned' && !isBanned) return false;

    const q = userSearch.toLowerCase().trim();
    if (!q) return true;
    const userNetId = getEffectiveUserNetworkId(u).toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q) ||
      userNetId.includes(q)
    );
  });

  const filteredLogs = [...(state.activityLogs || [])]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .filter((log) => {
      const q = logSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        log.fileName.toLowerCase().includes(q) ||
        log.userName.toLowerCase().includes(q) ||
        log.userEmail.toLowerCase().includes(q) ||
        (log.format || '').toLowerCase().includes(q)
      );
    });

  const recentUsers = sortedUsers.filter((u) => !canAccessAdminDashboard(u) && isRecentUser(u));

  const proUsersCount = sortedUsers.filter((u) => u.isPro && !isUserAccountBanned(u, settings)).length;
  const freeUsersCount = sortedUsers.filter((u) => !u.isPro && !isUserAccountBanned(u, settings)).length;
  const screenCaptureAllowedCount = sortedUsers.filter((u) => canUserCaptureScreen(u)).length;
  const bannedUsersList = sortedUsers.filter(
    (u) => isUserAccountBanned(u, settings) || isNetworkIdBanned(getEffectiveUserNetworkId(u), settings, users)
  );
  const bannedUsersCount = bannedUsersList.length;
  const allBannedNetworkIds = Array.from(
    new Set([
      ...(settings.bannedNetworkIds || []).map((n) => n.trim().toUpperCase()).filter(Boolean),
      ...sortedUsers
        .filter((u) => !isSuperAdminUser(u) && u.networkBanned)
        .map((u) => getEffectiveUserNetworkId(u)),
    ])
  );
  const allDefinitionsTabs: { id: AdminDashboardTabId; label: string; perm: AdminPermissionKey }[] = [
    { id: 'users', label: t.dashTabUsers, perm: 'manage_users' },
    {
      id: 'admins_security',
      label: isAr ? '🛡️ المشرفين والحماية' : '🛡️ Admins & Security',
      perm: 'manage_admins',
    },
    {
      id: 'activity_logs',
      label: isAr ? '📋 سجل النشاط والرفع' : '📋 Activity Logs',
      perm: 'view_logs',
    },
    { id: 'pro', label: t.dashTabProFormats, perm: 'manage_pro' },
    { id: 'branding', label: t.dashTabBranding, perm: 'manage_branding' },
    { id: 'notifications', label: t.dashTabNotifications, perm: 'manage_notifications' },
    {
      id: 'firebase',
      label: isAr ? '🔥 قاعدة بيانات Firebase' : '🔥 Firebase Database',
      perm: 'manage_firebase',
    },
  ];

  const visibleTabs = allDefinitionsTabs.filter((tab) =>
    hasAdminPermission(currentUser, tab.perm)
  );

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
          width: 'min(1260px, 98vw)',
          height: 'min(860px, 94vh)',
          background: 'linear-gradient(180deg, #0d0f1a 0%, #090a12 100%)',
          border: '1px solid rgba(124, 92, 255, 0.32)',
          borderRadius: '20px',
          boxShadow: '0 28px 80px rgba(0,0,0,0.85), 0 0 40px rgba(124, 92, 255, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#e8e8ee',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {/* Executive Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background:
              'linear-gradient(90deg, rgba(124, 92, 255, 0.16) 0%, rgba(15, 23, 42, 0.92) 55%, rgba(14, 14, 22, 0.98) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #7c5cff 0%, #4f46e5 100%)',
                border: '1px solid rgba(196, 181, 253, 0.4)',
                display: 'grid',
                placeItems: 'center',
                fontSize: '21px',
                boxShadow: '0 6px 20px rgba(124,92,255,0.45)',
              }}
            >
              ⚙️
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>
                  {t.dashTitle}
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '3px 11px',
                    borderRadius: '99px',
                    background: isCurrentSuperAdmin
                      ? 'linear-gradient(135deg, #7c5cff, #4f46e5)'
                      : 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#fff',
                    boxShadow: '0 2px 10px rgba(124, 92, 255, 0.3)',
                  }}
                >
                  {isCurrentSuperAdmin
                    ? isAr
                      ? '👑 المدير العام — كامل الصلاحيات المؤمنة'
                      : '👑 Super Admin — Full Secured Access'
                    : isAr
                      ? `🛡️ ${currentUser?.adminBadgeTitle || 'مشرف معتمد'} (${visibleTabs.length} أقسام مصرح بها)`
                      : `🛡️ ${currentUser?.adminBadgeTitle || 'Moderator'} (${visibleTabs.length} permitted tabs)`}
                </span>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    padding: '2px 9px',
                    borderRadius: '99px',
                    background: fbStatus.isConnected
                      ? 'rgba(16, 185, 129, 0.15)'
                      : 'rgba(59, 130, 246, 0.15)',
                    border: fbStatus.isConnected
                      ? '1px solid rgba(16, 185, 129, 0.45)'
                      : '1px solid rgba(59, 130, 246, 0.45)',
                    color: fbStatus.isConnected ? '#6ee7b7' : '#93c5fd',
                  }}
                >
                  {fbStatus.isConnected
                    ? isAr
                      ? '🟢 متصل بـ Firebase مباشر'
                      : '🟢 Firebase Live'
                    : isAr
                      ? '⚡ مزامنة سحابية نشطة'
                      : '⚡ Cloud Sync Active'}
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94a3b8' }}>{t.dashSub}</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Quick Preview Role Switcher for Admin */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(22, 22, 36, 0.9)',
                border: '1px solid rgba(124, 92, 255, 0.3)',
                padding: '5px 11px',
                borderRadius: '10px',
                fontSize: '12px',
              }}
            >
              <span style={{ color: '#cbd5e1', fontWeight: 700 }}>{t.dashPreviewModeLabel}</span>
              <select
                aria-label={t.dashPreviewModeLabel}
                value={state.adminPreviewRole}
                onChange={(e) => onChangePreviewRole(e.target.value as any)}
                style={{
                  width: 'auto',
                  background: '#0b0c14',
                  border: '1px solid #7c5cff',
                  borderRadius: '7px',
                  padding: '3px 8px',
                  color: '#fff',
                  fontWeight: 700,
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
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(24, 24, 38, 0.9)',
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

        {/* Navigation Tabs (Filtered by Granular Admin Permissions) */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '10px 24px',
            background: '#0b0d17',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            overflowX: 'auto',
            alignItems: 'center',
          }}
        >
          {visibleTabs.map((tab) => {
            const on = activeTab === tab.id;
            const badgeCount =
              tab.id === 'users'
                ? sortedUsers.length
                : tab.id === 'activity_logs'
                  ? (state.activityLogs || []).length
                  : tab.id === 'notifications'
                    ? notifications.length
                    : null;
            return (
              <button
                key={tab.id}
                type="button"
                id={`adminTab_${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '8px 15px',
                  borderRadius: '10px',
                  border: on ? '1px solid #7c5cff' : '1px solid rgba(255,255,255,0.07)',
                  background: on
                    ? 'linear-gradient(135deg, rgba(124,92,255,0.28), rgba(79,70,229,0.2))'
                    : '#131524',
                  color: on ? '#fff' : '#94a3b8',
                  fontWeight: on ? 800 : 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontSize: '12.5px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  boxShadow: on ? '0 4px 14px rgba(124,92,255,0.22)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{tab.label}</span>
                {badgeCount !== null && (
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 800,
                      padding: '1px 7px',
                      borderRadius: '99px',
                      background: on ? '#7c5cff' : 'rgba(255,255,255,0.08)',
                      color: on ? '#fff' : '#cbd5e1',
                    }}
                  >
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}

          {saveFeedback && (
            <div
              id="adminSaveFeedbackToast"
              style={{
                marginInlineStart: 'auto',
                alignSelf: 'center',
                background: 'rgba(16, 185, 129, 0.18)',
                border: '1px solid #10b981',
                color: '#6ee7b7',
                padding: '6px 14px',
                borderRadius: '9px',
                fontSize: '12px',
                fontWeight: 700,
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.2)',
              }}
            >
              {saveFeedback}
            </div>
          )}
        </div>

        {/* Body Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {/* TAB 1: USERS & ACCOUNTS */}
          {activeTab === 'users' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Recent Registrations Live Activity Card */}
              {recentUsers.length > 0 && (
                <div
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(59, 130, 246, 0.12) 100%)',
                    border: '1px solid rgba(16, 185, 129, 0.45)',
                    borderRadius: '14px',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>🔔</span>
                    <div>
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: '13.5px',
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
                            fontSize: '10.5px',
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
                        borderRadius: '9px',
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

              {/* Executive KPI Summary Strip (Interactive Click-to-Filter) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
                  gap: '12px',
                }}
              >
                <div
                  onClick={() => setUserFilterRole('all')}
                  style={{
                    background:
                      userFilterRole === 'all'
                        ? 'linear-gradient(180deg, rgba(124, 92, 255, 0.18), #141625)'
                        : '#121422',
                    border:
                      userFilterRole === 'all'
                        ? '1px solid #7c5cff'
                        : '1px solid rgba(255,255,255,0.08)',
                    borderTop: '3px solid #7c5cff',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 700 }}>
                    {isAr ? '👥 إجمالي الحسابات المسجلة' : '👥 Total Registered Accounts'}
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: 900, marginTop: '6px', color: '#fff' }}>
                    {sortedUsers.length}
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#a5b4fc', marginTop: '4px', fontWeight: 600 }}>
                    {isAr ? 'اضغط لعرض جميع الحسابات' : 'Click to view all accounts'}
                  </div>
                </div>

                <div
                  onClick={() => setUserFilterRole('pro')}
                  style={{
                    background:
                      userFilterRole === 'pro'
                        ? 'linear-gradient(180deg, rgba(245, 158, 11, 0.2), #141625)'
                        : 'rgba(245, 158, 11, 0.07)',
                    border:
                      userFilterRole === 'pro'
                        ? '1px solid #f59e0b'
                        : '1px solid rgba(245, 158, 11, 0.3)',
                    borderTop: '3px solid #f59e0b',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: '11.5px', color: '#fcd34d', fontWeight: 700 }}>
                    {isAr ? '👑 المشتركون في باقة برو' : '👑 Active Pro Subscribers'}
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: 900, marginTop: '6px', color: '#fbbf24' }}>
                    {proUsersCount}
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#fde68a', marginTop: '4px', fontWeight: 600 }}>
                    {isAr ? 'حسابات برو النشطة حالياً' : 'Active paid subscriptions'}
                  </div>
                </div>

                <div
                  onClick={() => setUserFilterRole('free')}
                  style={{
                    background:
                      userFilterRole === 'free'
                        ? 'linear-gradient(180deg, rgba(148, 163, 184, 0.2), #141625)'
                        : '#121422',
                    border:
                      userFilterRole === 'free'
                        ? '1px solid #94a3b8'
                        : '1px solid rgba(255,255,255,0.08)',
                    borderTop: '3px solid #64748b',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: '11.5px', color: '#cbd5e1', fontWeight: 700 }}>
                    {isAr ? '👤 الحسابات المجانية' : '👤 Free Accounts'}
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: 900, marginTop: '6px', color: '#e2e8f0' }}>
                    {freeUsersCount}
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '4px', fontWeight: 600 }}>
                    {isAr ? 'حسابات بدون اشتراك برو' : 'Standard free accounts'}
                  </div>
                </div>

                <div
                  onClick={() => setUserFilterRole('screen_capture')}
                  style={{
                    background:
                      userFilterRole === 'screen_capture'
                        ? 'linear-gradient(180deg, rgba(6, 182, 212, 0.22), #141625)'
                        : 'rgba(6, 182, 212, 0.08)',
                    border:
                      userFilterRole === 'screen_capture'
                        ? '1px solid #06b6d4'
                        : '1px solid rgba(6, 182, 212, 0.32)',
                    borderTop: '3px solid #06b6d4',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: '11.5px', color: '#67e8f9', fontWeight: 700 }}>
                    {isAr ? '📸 مصرح بتصوير الشاشة' : '📸 Screen Capture Allowed'}
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: 900, marginTop: '6px', color: '#22d3ee' }}>
                    {screenCaptureAllowedCount}
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#a5f3fc', marginTop: '4px', fontWeight: 600 }}>
                    {isAr ? 'مسموح بالسيلفي والفيديو' : 'Authorized for recording'}
                  </div>
                </div>

                <div
                  id="kpiBannedAccountsCard"
                  onClick={() => setUserFilterRole('banned')}
                  style={{
                    background:
                      userFilterRole === 'banned'
                        ? 'linear-gradient(180deg, rgba(239, 68, 68, 0.26), #1a1118)'
                        : 'rgba(239, 68, 68, 0.09)',
                    border:
                      userFilterRole === 'banned'
                        ? '1px solid #ef4444'
                        : '1px solid rgba(239, 68, 68, 0.38)',
                    borderTop: '3px solid #ef4444',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: '11.5px', color: '#fca5a5', fontWeight: 800 }}>
                    {isAr ? '🚫🌐 المحظورون (حساب / شبكة)' : '🚫🌐 Banned (Account / Network)'}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '8px',
                      marginTop: '6px',
                    }}
                  >
                    <span style={{ fontSize: '26px', fontWeight: 900, color: '#f87171' }}>
                      {bannedUsersCount}
                    </span>
                    <span style={{ fontSize: '11px', color: '#fecaca', fontWeight: 700 }}>
                      {isAr
                        ? `حساب • ${allBannedNetworkIds.length} شبكة`
                        : `acc • ${allBannedNetworkIds.length} net`}
                    </span>
                  </div>
                  <div style={{ fontSize: '10.5px', color: '#fca5a5', marginTop: '4px', fontWeight: 600 }}>
                    {isAr ? 'ممنوعون من دخول المنصة نهائياً' : 'Permanently blocked from platform'}
                  </div>
                </div>
              </div>

              {/* Network & Account Security Firewall Bar (حظر شبكة وحظر حساب نهائي) */}
              <div
                id="networkAndAccountBanFirewallPanel"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(220, 38, 38, 0.12) 0%, rgba(18, 20, 34, 0.96) 60%, rgba(124, 92, 255, 0.1) 100%)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '14px',
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: 800,
                        color: '#fca5a5',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span>🌐🚫</span>
                      <span>
                        {isAr
                          ? 'جدار الحماية الفوري: حظر شبكة (IP / الجهاز) وحظر حساب نهائياً من دخول المنصة'
                          : 'Platform Security Firewall: Permanent Network (IP/Device) & Account Ban'}
                      </span>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: '11.5px', color: '#cbd5e1' }}>
                      {isAr
                        ? 'عند تفعيل "حظر حساب" يتم طرد المستخدم ومنعه من تسجيل الدخول. وعند تفعيل "حظر شبكة" يُمنع المستخدم وجهازه وشبكته من فتح المنصة أو تصفحها نهائياً حتى كزائر.'
                        : 'Account Ban revokes login & sessions immediately. Network Ban blocks the user device & network from opening the platform entirely.'}
                    </p>
                  </div>

                  {onPreviewBanScreen && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        id="previewNetworkBanScreenBtn"
                        onClick={() => onPreviewBanScreen('network')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(239, 68, 68, 0.55)',
                          background: 'rgba(239, 68, 68, 0.16)',
                          color: '#fecaca',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                        title={
                          isAr
                            ? 'معاينة شاشة الإغلاق الكامل التي تظهر للمستخدم عند حظر شبكته أو حسابه'
                            : 'Preview the full-screen platform lockdown shown to banned users'
                        }
                      >
                        👁️ {isAr ? 'معاينة شاشة الحظر النهائي' : 'Preview Lockdown Screen'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Manual Network ID / Email Quick Ban Form */}
                <form
                  onSubmit={handleManualFirewallBan}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    alignItems: 'center',
                  }}
                >
                  <input
                    type="text"
                    id="manualFirewallBanInput"
                    placeholder={
                      isAr
                        ? 'أدخل معرف الشبكة (مثال: NET-4A8F-19C2) أو البريد الإلكتروني لحظره فوراً...'
                        : 'Enter Network ID (e.g. NET-4A8F-19C2) or Email to ban immediately...'
                    }
                    value={customBanTargetInput}
                    onChange={(e) => setCustomBanTargetInput(e.target.value)}
                    style={{
                      flex: '1 1 260px',
                      background: '#0b0c14',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <input
                    type="text"
                    id="manualFirewallBanReasonInput"
                    placeholder={
                      isAr
                        ? 'سبب الحظر (اختياري — يظهر للمستخدم المحظور)...'
                        : 'Ban reason (optional — shown on block screen)...'
                    }
                    value={customBanReasonInput}
                    onChange={(e) => setCustomBanReasonInput(e.target.value)}
                    style={{
                      flex: '1 1 220px',
                      background: '#0b0c14',
                      border: '1px solid #28283e',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <button
                    type="submit"
                    id="manualFirewallBanSubmitBtn"
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1px solid #ef4444',
                      background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 4px 12px rgba(220, 38, 38, 0.35)',
                    }}
                  >
                    🌐🚫 {isAr ? 'حظر الشبكة / الحساب فوراً' : 'Ban Network / Account Now'}
                  </button>
                </form>

                {/* Active Banned Networks & Accounts Chips */}
                {(allBannedNetworkIds.length > 0 || bannedUsersList.length > 0) && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px',
                      alignItems: 'center',
                      paddingTop: '6px',
                      borderTop: '1px solid rgba(239, 68, 68, 0.2)',
                    }}
                  >
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#fca5a5' }}>
                      {isAr ? '🔒 الشبكات والحسابات المحظورة حالياً:' : '🔒 Currently Banned Networks & Accounts:'}
                    </span>
                    {allBannedNetworkIds.map((netId) => (
                      <span
                        key={netId}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'rgba(220, 38, 38, 0.22)',
                          border: '1px solid #ef4444',
                          color: '#fecaca',
                          padding: '3px 10px',
                          borderRadius: '99px',
                          fontSize: '11px',
                          fontWeight: 800,
                        }}
                      >
                        <span>🌐 {netId}</span>
                        <button
                          type="button"
                          onClick={() => handleUnbanNetworkIdFromFirewall(netId)}
                          style={{
                            border: 0,
                            background: 'rgba(0,0,0,0.35)',
                            color: '#6ee7b7',
                            borderRadius: '99px',
                            padding: '1px 6px',
                            fontSize: '10px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                          title={isAr ? 'فك حظر هذه الشبكة' : 'Unban this network'}
                        >
                          {isAr ? 'فك الحظر ✓' : 'Unban ✓'}
                        </button>
                      </span>
                    ))}
                    {bannedUsersList.map((bu) => (
                      <span
                        key={bu.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'rgba(249, 115, 22, 0.2)',
                          border: '1px solid #f97316',
                          color: '#fed7aa',
                          padding: '3px 10px',
                          borderRadius: '99px',
                          fontSize: '11px',
                          fontWeight: 800,
                        }}
                      >
                        <span>
                          {bu.networkBanned ? '🌐🚫' : '🚫'} {bu.name} ({bu.email})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleAccountBan(bu.id)}
                          style={{
                            border: 0,
                            background: 'rgba(0,0,0,0.35)',
                            color: '#6ee7b7',
                            borderRadius: '99px',
                            padding: '1px 6px',
                            fontSize: '10px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          {isAr ? 'فك الحظر ✓' : 'Unban ✓'}
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Add New Account Form */}
              <form
                onSubmit={handleAddUser}
                style={{
                  background: '#121422',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '14px',
                  padding: '16px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '10px',
                  alignItems: 'flex-end',
                }}
              >
                <div style={{ width: '100%', fontWeight: 800, fontSize: '13px', color: '#c4b5fd' }}>
                  {isAr ? '➕ إضافة أو تفعيل حساب مستخدم جديد يدوياً:' : '➕ Add & Activate User Account:'}
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
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
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
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
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    {isAr ? 'رقم الهاتف / واتساب' : 'Phone / WhatsApp'}
                  </label>
                  <input
                    type="text"
                    placeholder="2010..."
                    value={newUserPhone}
                    onChange={(e) => setNewUserPhone(e.target.value)}
                  />
                </div>
                <div style={{ flex: '0 0 175px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    {isAr ? 'الباقة والمدة' : 'Subscription Plan'}
                  </label>
                  <select
                    value={newUserPlanChoice}
                    onChange={(e) => setNewUserPlanChoice(e.target.value as 'free' | ProPlanDurationKey)}
                  >
                    {normalizedPlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        👑 {isAr ? p.nameAr : p.nameEn} ({p.price} {settings.proCurrency})
                      </option>
                    ))}
                    <option value="free">{isAr ? '👤 مجاني (Free)' : '👤 Free'}</option>
                  </select>
                </div>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: newUserAllowScreenCapture
                      ? '1px solid #06b6d4'
                      : '1px solid #2e2e46',
                    background: newUserAllowScreenCapture
                      ? 'rgba(6, 182, 212, 0.16)'
                      : '#0b0c14',
                    color: newUserAllowScreenCapture ? '#67e8f9' : '#cbd5e1',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newUserAllowScreenCapture}
                    onChange={(e) => setNewUserAllowScreenCapture(e.target.checked)}
                    style={{ width: '15px', height: '15px', accentColor: '#06b6d4' }}
                  />
                  <span>
                    📸 {isAr ? 'السماح بتصوير الشاشة والفيديو' : 'Allow Screen Capture & Video'}
                  </span>
                </label>
                <button
                  type="submit"
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #7c5cff, #5a2fd0)',
                    border: 0,
                    color: '#fff',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {isAr ? 'إضافة الحساب' : 'Add Account'}
                </button>
              </form>

              {/* Search & Accounts Table */}
              <div
                style={{
                  background: '#121422',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '14px',
                  padding: '16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '14px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <b style={{ fontSize: '15px', color: '#fff' }}>
                      {isAr
                        ? `قائمة الحسابات المسجلة وإدارة الحظر (${filteredUsers.length})`
                        : `Registered Accounts & Ban Management (${filteredUsers.length})`}
                    </b>
                    <button
                      type="button"
                      onClick={handleRefreshUsersFromFirebase}
                      disabled={isRefreshingUsers}
                      style={{
                        padding: '5px 11px',
                        borderRadius: '7px',
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
                          ? isAr
                            ? 'جاري التحديث...'
                            : 'Refreshing...'
                          : isAr
                            ? 'تحديث من Firebase'
                            : 'Sync Firebase'}
                      </span>
                    </button>
                  </div>

                  {/* Filter Tabs by Account Type */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {(
                      [
                        { id: 'all', label: isAr ? 'الكل' : 'All' },
                        { id: 'admin', label: isAr ? '👑 المديرين' : '👑 Admins' },
                        { id: 'pro', label: isAr ? '⚡ مشترك برو' : '⚡ Pro Users' },
                        { id: 'free', label: isAr ? '👤 مجاني' : '👤 Free Users' },
                        {
                          id: 'screen_capture',
                          label: isAr ? '📸 مصرح بالتصوير' : '📸 Screen Capture',
                        },
                        {
                          id: 'banned',
                          label: isAr
                            ? `🚫 المحظورون (${bannedUsersCount})`
                            : `🚫 Banned (${bannedUsersCount})`,
                        },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        id={`userFilterTab_${f.id}`}
                        onClick={() => setUserFilterRole(f.id)}
                        style={{
                          padding: '5px 11px',
                          borderRadius: '8px',
                          border:
                            userFilterRole === f.id
                              ? f.id === 'banned'
                                ? '1px solid #ef4444'
                                : '1px solid #7c5cff'
                              : '1px solid #28283d',
                          background:
                            userFilterRole === f.id
                              ? f.id === 'banned'
                                ? 'rgba(239, 68, 68, 0.25)'
                                : 'rgba(124, 92, 255, 0.25)'
                              : '#0b0c14',
                          color:
                            userFilterRole === f.id
                              ? '#fff'
                              : f.id === 'banned'
                                ? '#fca5a5'
                                : '#a0a0b8',
                          fontSize: '11px',
                          fontWeight: userFilterRole === f.id ? 800 : 600,
                          cursor: 'pointer',
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    placeholder={
                      isAr
                        ? '🔍 ابحث بالاسم، البريد، الرقم، أو معرف الشبكة...'
                        : '🔍 Search by name, email, phone, or Network ID...'
                    }
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    style={{ maxWidth: '280px', fontSize: '12px', padding: '7px 11px' }}
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
                      <tr
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.1)',
                          color: '#94a3b8',
                          background: 'rgba(11, 12, 20, 0.6)',
                        }}
                      >
                        <th style={{ padding: '11px 10px' }}>{isAr ? 'المستخدم' : 'User'}</th>
                        <th style={{ padding: '11px 10px' }}>
                          {isAr ? 'نوع الحساب / الحالة' : 'Role & Status'}
                        </th>
                        <th style={{ padding: '11px 10px' }}>
                          {isAr ? 'معرف الشبكة وحالة الحظر' : 'Network ID & Ban Status'}
                        </th>
                        <th style={{ padding: '11px 10px' }}>
                          {isAr ? 'البريد والهاتف' : 'Email & Phone'}
                        </th>
                        <th style={{ padding: '11px 10px' }}>{isAr ? 'تاريخ التسجيل' : 'Created'}</th>
                        <th style={{ padding: '11px 10px' }}>
                          {isAr
                            ? 'تفعيل برو / حظر حساب وشبكة / إجراءات'
                            : 'Pro / Account & Network Ban / Actions'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: '28px', textAlign: 'center', color: '#8e8ea6' }}>
                            {isAr ? 'لا يوجد حسابات مطابقة للبحث أو التصفية.' : 'No users match your criteria.'}
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => {
                          const isSuper = isSuperAdminUser(u);
                          const isAdminRole = canAccessAdminDashboard(u);
                          const isRecent = isRecentUser(u) && !isAdminRole;
                          const userPerms = getEffectiveAdminPermissions(u);
                          const userNetId = getEffectiveUserNetworkId(u);
                          const isAccBanned = isUserAccountBanned(u, settings);
                          const isNetBanned =
                            !isSuper &&
                            (Boolean(u.networkBanned) ||
                              isNetworkIdBanned(userNetId, settings, users));
                          const canBanThisUser = canBanUserAccount(currentUser, u);

                          return (
                            <tr
                              key={u.id}
                              id={`userRow_${u.id}`}
                              style={{
                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                                background: isNetBanned
                                  ? 'rgba(220, 38, 38, 0.11)'
                                  : isAccBanned
                                    ? 'rgba(249, 115, 22, 0.09)'
                                    : isRecent
                                      ? 'rgba(16, 185, 129, 0.05)'
                                      : 'transparent',
                              }}
                            >
                              <td style={{ padding: '11px 10px', fontWeight: 600, color: '#fff' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                                  <div
                                    style={{
                                      width: '32px',
                                      height: '32px',
                                      borderRadius: '10px',
                                      background: isSuper
                                        ? 'linear-gradient(135deg, #6366f1, #a855f7)'
                                        : isNetBanned || isAccBanned
                                          ? 'linear-gradient(135deg, #dc2626, #991b1b)'
                                          : isAdminRole
                                            ? 'linear-gradient(135deg, #10b981, #059669)'
                                            : u.isPro
                                              ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                              : '#222234',
                                      display: 'grid',
                                      placeItems: 'center',
                                      fontSize: '14px',
                                      color: '#fff',
                                      fontWeight: 800,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {isSuper
                                      ? '👑'
                                      : isNetBanned
                                        ? '🌐'
                                        : isAccBanned
                                          ? '🚫'
                                          : isAdminRole
                                            ? '🛡️'
                                            : u.isPro
                                              ? '⚡'
                                              : '👤'}
                                  </div>
                                  <div>
                                    <div
                                      style={{
                                        color: isNetBanned || isAccBanned ? '#fca5a5' : '#fff',
                                        fontWeight: 800,
                                        textDecoration:
                                          isNetBanned || isAccBanned ? 'line-through' : 'none',
                                      }}
                                    >
                                      {u.name}
                                    </div>
                                    {isRecent && !isAccBanned && (
                                      <span
                                        style={{
                                          background: '#10b981',
                                          color: '#022c22',
                                          padding: '1px 6px',
                                          borderRadius: '4px',
                                          fontSize: '10px',
                                          fontWeight: 800,
                                          display: 'inline-block',
                                          marginTop: '2px',
                                        }}
                                      >
                                        🌟 {isAr ? 'حساب جديد' : 'NEW'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              <td style={{ padding: '11px 10px' }}>
                                {isSuper ? (
                                  <span
                                    style={{
                                      background:
                                        'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.25))',
                                      border: '1px solid #818cf8',
                                      color: '#c7d2fe',
                                      padding: '3px 10px',
                                      borderRadius: '99px',
                                      fontWeight: 800,
                                      fontSize: '11px',
                                      display: 'inline-block',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    👑 {isAr ? 'المدير العام (Super Admin)' : 'Super Admin'}
                                  </span>
                                ) : isNetBanned ? (
                                  <span
                                    style={{
                                      background: 'rgba(220, 38, 38, 0.25)',
                                      border: '1px solid #ef4444',
                                      color: '#fecaca',
                                      padding: '3px 10px',
                                      borderRadius: '99px',
                                      fontWeight: 800,
                                      fontSize: '11px',
                                      display: 'inline-block',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    🌐🚫 {isAr ? 'محظور شبكة وحساب نهائياً' : 'Network & Account Banned'}
                                  </span>
                                ) : isAccBanned ? (
                                  <span
                                    style={{
                                      background: 'rgba(249, 115, 22, 0.22)',
                                      border: '1px solid #f97316',
                                      color: '#fed7aa',
                                      padding: '3px 10px',
                                      borderRadius: '99px',
                                      fontWeight: 800,
                                      fontSize: '11px',
                                      display: 'inline-block',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    🚫 {isAr ? 'حساب محظور من الدخول' : 'Account Banned'}
                                  </span>
                                ) : isAdminRole ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span
                                      style={{
                                        background:
                                          'linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(5, 150, 105, 0.22))',
                                        border: '1px solid #10b981',
                                        color: '#a7f3d0',
                                        padding: '3px 10px',
                                        borderRadius: '99px',
                                        fontWeight: 800,
                                        fontSize: '11px',
                                        display: 'inline-block',
                                        whiteSpace: 'nowrap',
                                        width: 'fit-content',
                                      }}
                                    >
                                      🛡️ {u.adminBadgeTitle || (isAr ? 'مشرف معتمد (Admin)' : 'Moderator')} ({userPerms.length})
                                    </span>
                                  </div>
                                ) : u.isPro ? (
                                  (() => {
                                    const subInfo = getUserProSubscriptionInfo(u, settings);
                                    return (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span
                                          style={{
                                            background:
                                              'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(217, 119, 6, 0.22))',
                                            border: '1px solid #f59e0b',
                                            color: '#fef08a',
                                            padding: '3px 10px',
                                            borderRadius: '99px',
                                            fontWeight: 800,
                                            fontSize: '11px',
                                            display: 'inline-block',
                                            whiteSpace: 'nowrap',
                                            width: 'fit-content',
                                          }}
                                        >
                                          ⚡ {isAr ? 'مشترك باقة برو' : 'Active PRO'}
                                          {u.proPlanName
                                            ? ` (${u.proPlanName})`
                                            : ` (${isAr ? subInfo.planNameAr : subInfo.planNameEn})`}
                                        </span>
                                        {subInfo.expiresAtIso && (
                                          <span style={{ fontSize: '10px', color: '#fde047', fontWeight: 700 }}>
                                            ⏳{' '}
                                            {isAr
                                              ? `متبقي ${subInfo.remainingDays} يوم و ${subInfo.remainingHours} س`
                                              : `${subInfo.remainingDays}d ${subInfo.remainingHours}h left`}{' '}
                                            •{' '}
                                            <span style={{ color: '#94a3b8', fontWeight: 500 }}>
                                              {isAr ? 'ينتهي:' : 'Ends:'}{' '}
                                              {new Date(subInfo.expiresAtIso).toLocaleDateString(
                                                isAr ? 'ar-EG' : 'en-US'
                                              )}
                                            </span>
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()
                                ) : (
                                  <span
                                    style={{
                                      background: 'rgba(100, 116, 139, 0.2)',
                                      border: '1px solid #475569',
                                      color: '#cbd5e1',
                                      padding: '3px 10px',
                                      borderRadius: '99px',
                                      fontWeight: 600,
                                      fontSize: '11px',
                                      display: 'inline-block',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    👤 {isAr ? 'مستخدم مجاني (Free)' : 'Free User'}
                                  </span>
                                )}
                                {canUserCaptureScreen(u) && !isAccBanned && (
                                  <div style={{ marginTop: '4px' }}>
                                    <span
                                      id={`screenCaptureBadge_${u.id}`}
                                      style={{
                                        background: 'rgba(6, 182, 212, 0.18)',
                                        border: '1px solid #06b6d4',
                                        color: '#67e8f9',
                                        padding: '2px 9px',
                                        borderRadius: '99px',
                                        fontWeight: 800,
                                        fontSize: '10.5px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      📸{' '}
                                      {isAr
                                        ? 'مصرح بتصوير الشاشة والفيديو'
                                        : 'Screen Capture Allowed'}
                                    </span>
                                  </div>
                                )}
                              </td>

                              {/* Network ID & Ban Status Column */}
                              <td style={{ padding: '11px 10px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <span
                                    id={`userNetworkBadge_${u.id}`}
                                    style={{
                                      fontFamily: 'monospace',
                                      fontSize: '11px',
                                      fontWeight: 800,
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      background: isNetBanned
                                        ? 'rgba(220, 38, 38, 0.25)'
                                        : 'rgba(15, 23, 42, 0.85)',
                                      border: isNetBanned
                                        ? '1px solid #ef4444'
                                        : '1px solid rgba(148, 163, 184, 0.25)',
                                      color: isNetBanned ? '#fca5a5' : '#93c5fd',
                                      width: 'fit-content',
                                      whiteSpace: 'nowrap',
                                    }}
                                    title={
                                      isAr
                                        ? 'معرف الشبكة والبصمة الرقمية لجهاز المستخدم'
                                        : 'User Network & Device Fingerprint ID'
                                    }
                                  >
                                    🌐 {userNetId}
                                  </span>

                                  <span
                                    id={`userBanStatusBadge_${u.id}`}
                                    style={{
                                      fontSize: '10.5px',
                                      fontWeight: 800,
                                      color: isNetBanned
                                        ? '#f87171'
                                        : isAccBanned
                                          ? '#fb923c'
                                          : '#34d399',
                                    }}
                                  >
                                    {isNetBanned
                                      ? isAr
                                        ? '⛔ شبكة وحساب محظور نهائياً'
                                        : '⛔ Network & Account Blocked'
                                      : isAccBanned
                                        ? isAr
                                          ? '🚫 الحساب محظور من الدخول'
                                          : '🚫 Account Login Blocked'
                                        : isAr
                                          ? '✅ مسموح بالدخول'
                                          : '✅ Access Allowed'}
                                  </span>
                                </div>
                              </td>

                              {/* Email & Phone Column */}
                              <td style={{ padding: '11px 10px', color: '#cbd5e1' }}>
                                <div style={{ fontWeight: 600 }}>{u.email}</div>
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                  {u.phone || '—'}
                                </div>
                              </td>

                              <td style={{ padding: '11px 10px', color: '#94a3b8' }}>
                                <div>
                                  {new Date(u.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}
                                </div>
                                <div style={{ fontSize: '10px', color: '#64748b' }}>
                                  {new Date(u.createdAt).toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </div>
                              </td>

                              <td style={{ padding: '11px 10px' }}>
                                <div
                                  style={{
                                    display: 'flex',
                                    gap: '6px',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  {/* Account Ban & Network Ban Controls (حظر حساب + حظر شبكة) */}
                                  {canBanThisUser && (
                                    <>
                                      <button
                                        type="button"
                                        id={`toggleAccountBanBtn_${u.id}`}
                                        onClick={() => handleToggleAccountBan(u.id)}
                                        style={{
                                          padding: '6px 10px',
                                          borderRadius: '8px',
                                          border: isAccBanned
                                            ? '1px solid #10b981'
                                            : '1px solid #f97316',
                                          background: isAccBanned
                                            ? 'rgba(16, 185, 129, 0.18)'
                                            : 'rgba(249, 115, 22, 0.18)',
                                          color: isAccBanned ? '#6ee7b7' : '#fed7aa',
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          fontSize: '11px',
                                          whiteSpace: 'nowrap',
                                        }}
                                        title={
                                          isAr
                                            ? 'حظر الحساب نهائياً من تسجيل الدخول أو استخدام المنصة (أو فك الحظر)'
                                            : 'Ban or unban this user account from logging into the platform'
                                        }
                                      >
                                        {isAccBanned
                                          ? isAr
                                            ? '✅ فك حظر الحساب'
                                            : '✅ Unban Account'
                                          : isAr
                                            ? '🚫 حظر حساب'
                                            : '🚫 Ban Account'}
                                      </button>

                                      <button
                                        type="button"
                                        id={`toggleNetworkBanBtn_${u.id}`}
                                        onClick={() => handleToggleNetworkBan(u.id)}
                                        style={{
                                          padding: '6px 10px',
                                          borderRadius: '8px',
                                          border: isNetBanned
                                            ? '1px solid #10b981'
                                            : '1px solid #ef4444',
                                          background: isNetBanned
                                            ? 'rgba(16, 185, 129, 0.2)'
                                            : 'linear-gradient(135deg, rgba(220, 38, 38, 0.32), rgba(153, 27, 27, 0.35))',
                                          color: isNetBanned ? '#6ee7b7' : '#fecaca',
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          fontSize: '11px',
                                          whiteSpace: 'nowrap',
                                          boxShadow: isNetBanned
                                            ? 'none'
                                            : '0 2px 10px rgba(220, 38, 38, 0.28)',
                                        }}
                                        title={
                                          isAr
                                            ? 'حظر شبكة المستخدم وجهازه وحسابه نهائياً بحيث لا يستطيع فتح المنصة على الإطلاق'
                                            : 'Permanently ban user network & device from accessing the platform at all'
                                        }
                                      >
                                        {isNetBanned
                                          ? isAr
                                            ? '🌐✅ فك حظر الشبكة'
                                            : '🌐✅ Unban Network'
                                          : isAr
                                            ? '🌐🚫 حظر شبكة'
                                            : '🌐🚫 Ban Network'}
                                      </button>
                                    </>
                                  )}

                                  {!isSuper && !isAccBanned && (
                                    <>
                                      <select
                                        aria-label={isAr ? 'اختر باقة المستخدم' : 'Select user plan'}
                                        value={u.isPro ? u.proPlanId || 'month' : 'free'}
                                        onChange={(e) =>
                                          handleSetUserProPlan(
                                            u.id,
                                            e.target.value as 'free' | ProPlanDurationKey
                                          )
                                        }
                                        style={{
                                          width: 'auto',
                                          padding: '5px 8px',
                                          borderRadius: '8px',
                                          background: '#0b0c14',
                                          border: u.isPro ? '1px solid #f59e0b' : '1px solid #334155',
                                          color: u.isPro ? '#fde047' : '#cbd5e1',
                                          fontSize: '11px',
                                          fontWeight: 700,
                                        }}
                                      >
                                        <option value="free">{isAr ? '👤 مجاني' : '👤 Free'}</option>
                                        {normalizedPlans.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            👑 {isAr ? p.nameAr : p.nameEn} ({p.price} {settings.proCurrency})
                                          </option>
                                        ))}
                                      </select>

                                      <button
                                        type="button"
                                        onClick={() => handleToggleUserPro(u.id)}
                                        style={{
                                          padding: '6px 10px',
                                          borderRadius: '8px',
                                          border: u.isPro ? '1px solid #ef4444' : '1px solid #10b981',
                                          background: u.isPro
                                            ? 'rgba(239, 68, 68, 0.15)'
                                            : 'linear-gradient(135deg, #10b981, #059669)',
                                          color: u.isPro ? '#fca5a5' : '#fff',
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          fontSize: '11px',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {u.isPro
                                          ? isAr
                                            ? '❌ إزالة برو'
                                            : '❌ Remove Pro'
                                          : isAr
                                            ? '⚡ تفعيل برو'
                                            : '⚡ Activate Pro'}
                                      </button>

                                      <button
                                        type="button"
                                        id={`toggleScreenCaptureBtn_${u.id}`}
                                        onClick={() => handleToggleUserScreenCapture(u.id)}
                                        style={{
                                          padding: '6px 10px',
                                          borderRadius: '8px',
                                          border: u.allowScreenCapture
                                            ? '1px solid #06b6d4'
                                            : '1px solid rgba(6, 182, 212, 0.45)',
                                          background: u.allowScreenCapture
                                            ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.28), rgba(14, 116, 144, 0.28))'
                                            : 'rgba(6, 182, 212, 0.1)',
                                          color: u.allowScreenCapture ? '#a5f3fc' : '#67e8f9',
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          fontSize: '11px',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {u.allowScreenCapture
                                          ? isAr
                                            ? '📸 التصوير مفعل'
                                            : '📸 Capture On'
                                          : isAr
                                            ? '📸 سماح بالتصوير'
                                            : '📸 Allow Capture'}
                                      </button>
                                    </>
                                  )}

                                  {!isSuper && hasAdminPermission(currentUser, 'manage_admins') && !isAccBanned && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleSelectUserForPermissions(u.id)}
                                        style={{
                                          padding: '6px 10px',
                                          borderRadius: '8px',
                                          border: '1px solid #7c5cff',
                                          background: isAdminRole
                                            ? 'rgba(124, 92, 255, 0.25)'
                                            : 'rgba(124, 92, 255, 0.14)',
                                          color: '#e0d4ff',
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          fontSize: '11px',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        🛡️ {isAr ? 'صلاحيات المشرف' : 'Permissions'}
                                      </button>

                                      {isAdminRole && (
                                        <button
                                          type="button"
                                          id={`revokeAdminBtn_${u.id}`}
                                          onClick={() => handleQuickRevokeModerator(u.id)}
                                          style={{
                                            padding: '6px 10px',
                                            borderRadius: '8px',
                                            border: '1px solid #f97316',
                                            background: 'rgba(249, 115, 22, 0.2)',
                                            color: '#fed7aa',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            fontSize: '11px',
                                            whiteSpace: 'nowrap',
                                          }}
                                        >
                                          🚫 {isAr ? 'حذف الأدمن' : 'Remove Admin'}
                                        </button>
                                      )}
                                    </>
                                  )}

                                  {canDeleteUserAccount(currentUser, u) && (
                                    <button
                                      type="button"
                                      id={`deleteUserBtn_${u.id}`}
                                      onClick={() => handleDeleteUser(u.id)}
                                      style={{
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid #dc2626',
                                        background: 'rgba(220, 38, 38, 0.18)',
                                        color: '#f87171',
                                        cursor: 'pointer',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      🗑️ {isAr ? 'حذف' : 'Delete'}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: ADMINS, MODERATORS & PLATFORM SECURITY */}
          {activeTab === 'admins_security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Section 1: Assign Sub-Admin / Moderator & Granular Permissions */}
              <div
                style={{
                  background: 'linear-gradient(180deg, #161626 0%, #12121d 100%)',
                  border: '1px solid rgba(124, 92, 255, 0.45)',
                  borderRadius: '14px',
                  padding: '20px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginBottom: '16px',
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>🛡️</span>
                      <span>
                        {isAr
                          ? 'تعيين المشرفين (الأدمن) وتخصيص صلاحيات الداشبورد'
                          : 'Assign Moderators (Sub-Admins) & Granular Dashboard Permissions'}
                      </span>
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#a0a0b8' }}>
                      {isAr
                        ? 'اختر أي مستخدم مسجل، وامنحه رتبة مشرف مع تحديد الأقسام المسموح له باستخدامها فقط. ستظهر علامة المشرف المعتمد تلقائياً في حسابه الشخصي.'
                        : 'Select any registered user, grant them Moderator access, and pick the exact dashboard sections they can use. Their verified badge will appear automatically in their account.'}
                    </p>
                  </div>
                </div>

                {(() => {
                  const candidateUsers = sortedUsers.filter((u) => !isSuperAdminUser(u));
                  const selectedUserObj =
                    candidateUsers.find((u) => u.id === selectedModUserId) || candidateUsers[0] || null;

                  if (!selectedUserObj) {
                    return (
                      <div style={{ padding: '16px', color: '#94a3b8', fontSize: '13px' }}>
                        {isAr
                          ? 'لا يوجد مستخدمون مسجلون حالياً لتعيينهم كمشرفين. أضف حساب مستخدم أولاً من تبويب المستخدمين.'
                          : 'No regular user accounts available. Add a user account first.'}
                      </div>
                    );
                  }

                  return (
                    <form onSubmit={handleSaveModeratorPermissions} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* Step 1 & Step 2: Select User + Toggle Admin Status + Badge Title */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                          gap: '14px',
                          background: '#0f0f18',
                          border: '1px solid #252538',
                          borderRadius: '12px',
                          padding: '14px',
                        }}
                      >
                        <div>
                          <label
                            htmlFor="selectModeratorUser"
                            style={{ display: 'block', fontSize: '12px', color: '#c4b5fd', fontWeight: 700, marginBottom: '6px' }}
                          >
                            {isAr ? '1️⃣ اختر حساب المستخدم:' : '1️⃣ Select User Account:'}
                          </label>
                          <select
                            id="selectModeratorUser"
                            aria-label={isAr ? 'اختر حساب المستخدم' : 'Select User Account'}
                            value={selectedUserObj.id}
                            onChange={(e) => setSelectedModUserId(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '9px 12px',
                              borderRadius: '8px',
                              background: '#161624',
                              border: '1px solid #7c5cff',
                              color: '#fff',
                              fontWeight: 700,
                              fontSize: '13px',
                            }}
                          >
                            {candidateUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.email}) {canAccessAdminDashboard(u) ? '— 🛡️ مشرف حالياً' : '— 👤 مستخدم'}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '12px', color: '#c4b5fd', fontWeight: 700, marginBottom: '6px' }}>
                            {isAr ? '2️⃣ حالة صلاحية الأدمن / المشرف:' : '2️⃣ Moderator / Admin Role Status:'}
                          </label>
                          <button
                            type="button"
                            id="toggleGrantModeratorBtn"
                            onClick={() => setModIsAdmin((prev) => !prev)}
                            style={{
                              width: '100%',
                              padding: '9px 14px',
                              borderRadius: '8px',
                              border: modIsAdmin ? '1px solid #10b981' : '1px solid #475569',
                              background: modIsAdmin
                                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.25))'
                                : '#181826',
                              color: modIsAdmin ? '#6ee7b7' : '#cbd5e1',
                              fontWeight: 800,
                              fontSize: '13px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                            }}
                          >
                            <span>{modIsAdmin ? '✅' : '⚪'}</span>
                            <span>
                              {modIsAdmin
                                ? isAr
                                  ? 'مفعّل كمشرف (Admin) في الداشبورد'
                                  : 'Enabled as Dashboard Admin / Moderator'
                                : isAr
                                  ? 'مستخدم عادي (اضغط هنا لمنحه رتبة أدمن)'
                                  : 'Regular User (Click to Grant Admin Role)'}
                            </span>
                          </button>
                        </div>

                        <div>
                          <label
                            htmlFor="modBadgeTitleInput"
                            style={{ display: 'block', fontSize: '12px', color: '#c4b5fd', fontWeight: 700, marginBottom: '6px' }}
                          >
                            {isAr
                              ? '3️⃣ العلامة التي تظهر في حسابه الشخصي:'
                              : '3️⃣ Badge Displayed on User Account:'}
                          </label>
                          <input
                            id="modBadgeTitleInput"
                            type="text"
                            value={modBadgeTitle}
                            onChange={(e) => setModBadgeTitle(e.target.value)}
                            placeholder={isAr ? 'مثال: مشرف معتمد 🛡️' : 'e.g. Verified Admin 🛡️'}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              background: '#161624',
                              border: '1px solid #2e2e46',
                              color: '#fff',
                              fontSize: '13px',
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '12px', color: '#67e8f9', fontWeight: 700, marginBottom: '6px' }}>
                            {isAr
                              ? '📸 صلاحية تصوير الشاشة وتسجيل الفيديو للحساب:'
                              : '📸 Account Screen Capture & Video Permission:'}
                          </label>
                          <button
                            type="button"
                            id="toggleModScreenCaptureBtn"
                            onClick={() => setModAllowScreenCapture((prev) => !prev)}
                            style={{
                              width: '100%',
                              padding: '9px 14px',
                              borderRadius: '8px',
                              border: modAllowScreenCapture ? '1px solid #06b6d4' : '1px solid #475569',
                              background: modAllowScreenCapture
                                ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(8, 145, 178, 0.25))'
                                : '#181826',
                              color: modAllowScreenCapture ? '#67e8f9' : '#cbd5e1',
                              fontWeight: 800,
                              fontSize: '12.5px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                            }}
                          >
                            <span>{modAllowScreenCapture ? '📸' : '🔒'}</span>
                            <span>
                              {modAllowScreenCapture
                                ? isAr
                                  ? 'مسموح بتصوير الشاشة وتسجيل فيديو الشاشة ✓'
                                  : 'Screen Capture & Video Recording Allowed ✓'
                                : isAr
                                  ? 'ممنوع من التصوير (اضغط للسماح للحساب بالتصوير)'
                                  : 'Blocked (Click to Allow Screen Capture)'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Step 3: Granular Permissions Grid */}
                      <div
                        style={{
                          background: '#0f0f18',
                          border: '1px solid #252538',
                          borderRadius: '12px',
                          padding: '16px',
                          opacity: modIsAdmin ? 1 : 0.65,
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
                          <div style={{ fontWeight: 800, fontSize: '13px', color: '#fde047' }}>
                            {isAr
                              ? `4️⃣ حدد الصلاحيات المسموح بها للمستخدم (${selectedUserObj.email}) داخل الداشبورد:`
                              : `4️⃣ Select Allowed Dashboard Permissions for (${selectedUserObj.email}):`}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setModIsAdmin(true);
                                setModPermissions([...ALL_ADMIN_PERMISSION_KEYS]);
                              }}
                              style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                border: '1px solid #7c5cff',
                                background: 'rgba(124, 92, 255, 0.18)',
                                color: '#ddd6fe',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              {isAr ? '✓ تحديد كل الصلاحيات' : '✓ Select All'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setModIsAdmin(true);
                                setModPermissions(['manage_users', 'view_logs']);
                              }}
                              style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                border: '1px solid #10b981',
                                background: 'rgba(16, 185, 129, 0.16)',
                                color: '#a7f3d0',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              {isAr ? '👥 إدارة المستخدمين والسجل فقط' : '👥 Users & Logs Only'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setModPermissions([])}
                              style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                border: '1px solid #475569',
                                background: '#181826',
                                color: '#94a3b8',
                                fontSize: '11px',
                                cursor: 'pointer',
                              }}
                            >
                              {isAr ? 'إلغاء التحديد' : 'Clear'}
                            </button>
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(235px, 1fr))',
                            gap: '10px',
                          }}
                        >
                          {ALL_ADMIN_PERMISSIONS.map((perm) => {
                            const checked = modIsAdmin && modPermissions.includes(perm.key);
                            return (
                              <label
                                key={perm.key}
                                style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '10px',
                                  padding: '10px 12px',
                                  borderRadius: '10px',
                                  border: checked
                                    ? '1px solid #10b981'
                                    : '1px solid #242438',
                                  background: checked
                                    ? 'rgba(16, 185, 129, 0.12)'
                                    : '#151522',
                                  cursor: 'pointer',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    if (!modIsAdmin) setModIsAdmin(true);
                                    handleToggleModPermissionKey(perm.key);
                                  }}
                                  style={{ width: '16px', height: '16px', marginTop: '2px', accentColor: '#10b981' }}
                                />
                                <div>
                                  <div style={{ fontWeight: 800, fontSize: '12.5px', color: checked ? '#6ee7b7' : '#fff' }}>
                                    {perm.icon} {isAr ? perm.labelAr : perm.labelEn}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px', lineHeight: 1.35 }}>
                                    {isAr ? perm.descAr : perm.descEn}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Live Account Badge Preview & Save Action */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '12px',
                          background: '#12121e',
                          border: '1px solid #282840',
                          borderRadius: '10px',
                          padding: '12px 16px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                            {isAr ? 'معاينة العلامة في حساب المستخدم:' : 'User Account Badge Preview:'}
                          </span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 12px',
                              borderRadius: '99px',
                              border: modIsAdmin ? '1px solid #10b981' : '1px solid #475569',
                              background: modIsAdmin ? 'rgba(16, 185, 129, 0.18)' : '#1a1a28',
                              color: modIsAdmin ? '#6ee7b7' : '#94a3b8',
                              fontSize: '12px',
                              fontWeight: 800,
                            }}
                          >
                            <span>{modIsAdmin ? '🛡️' : '👤'}</span>
                            <span>{selectedUserObj.email.split('@')[0]}</span>
                            <span
                              style={{
                                background: modIsAdmin ? '#10b981' : '#334155',
                                color: modIsAdmin ? '#022c22' : '#cbd5e1',
                                padding: '1px 7px',
                                borderRadius: '6px',
                                fontSize: '10px',
                                fontWeight: 900,
                              }}
                            >
                              {modIsAdmin ? modBadgeTitle || 'مشرف معتمد 🛡️' : isAr ? 'مستخدم عادي' : 'User'}
                            </span>
                          </span>
                        </div>

                        <button
                          type="submit"
                          id="saveModeratorPermissionsBtn"
                          style={{
                            padding: '10px 22px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            border: 0,
                            color: '#022c22',
                            fontWeight: 900,
                            fontSize: '13px',
                            cursor: 'pointer',
                            boxShadow: '0 6px 20px rgba(16, 185, 129, 0.35)',
                          }}
                        >
                          💾 {isAr ? 'حفظ وتطبيق الصلاحيات للمستخدم فوراً' : 'Save & Apply User Permissions'}
                        </button>
                      </div>
                    </form>
                  );
                })()}

                {/* Active Moderators List */}
                <div style={{ marginTop: '18px', borderTop: '1px solid #26263c', paddingTop: '14px' }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: '#c4b5fd', marginBottom: '10px' }}>
                    {isAr
                      ? `🛡️ قائمة المديرين والمشرفين المعتمدين حالياً (${sortedUsers.filter((u) => canAccessAdminDashboard(u)).length})`
                      : `🛡️ Currently Active Admins & Moderators (${sortedUsers.filter((u) => canAccessAdminDashboard(u)).length})`}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {sortedUsers
                      .filter((u) => canAccessAdminDashboard(u))
                      .map((adminAcc) => {
                        const isSuper = isSuperAdminUser(adminAcc);
                        const perms = getEffectiveAdminPermissions(adminAcc);
                        return (
                          <div
                            key={adminAcc.id}
                            style={{
                              background: '#0f0f18',
                              border: isSuper
                                ? '1px solid rgba(124, 92, 255, 0.5)'
                                : '1px solid rgba(16, 185, 129, 0.4)',
                              borderRadius: '10px',
                              padding: '10px 14px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '10px',
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 800, color: '#fff', fontSize: '13px' }}>
                                  {isSuper ? '👑' : '🛡️'} {adminAcc.name} ({adminAcc.email})
                                </span>
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '99px',
                                    background: isSuper ? '#7c5cff' : '#10b981',
                                    color: isSuper ? '#fff' : '#022c22',
                                    fontSize: '10px',
                                    fontWeight: 900,
                                  }}
                                >
                                  {isSuper
                                    ? isAr
                                      ? 'المدير العام (كامل الصلاحيات)'
                                      : 'Super Admin (Full Access)'
                                    : adminAcc.adminBadgeTitle || (isAr ? 'مشرف معتمد' : 'Moderator')}
                                </span>
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
                                {ALL_ADMIN_PERMISSIONS.filter((p) => perms.includes(p.key)).map((p) => (
                                  <span
                                    key={p.key}
                                    style={{
                                      fontSize: '10px',
                                      padding: '2px 7px',
                                      borderRadius: '5px',
                                      background: '#181828',
                                      border: '1px solid #2e2e46',
                                      color: '#cbd5e1',
                                    }}
                                  >
                                    {p.icon} {isAr ? p.labelAr : p.labelEn}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {!isSuper && (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedModUserId(adminAcc.id)}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid #7c5cff',
                                    background: 'rgba(124, 92, 255, 0.16)',
                                    color: '#ddd6fe',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  ⚙️ {isAr ? 'تعديل الصلاحيات' : 'Edit'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickRevokeModerator(adminAcc.id)}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid #ef4444',
                                    background: 'rgba(239, 68, 68, 0.16)',
                                    color: '#fca5a5',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  ❌ {isAr ? 'سحب الإشراف' : 'Revoke'}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

              {/* Section 1.5: Dedicated Screen Capture & Screen Video Recording Authorization Panel */}
              <div
                id="screenCapturePermissionsPanel"
                style={{
                  background: 'linear-gradient(180deg, #101926 0%, #0f131d 100%)',
                  border: '1px solid rgba(6, 182, 212, 0.45)',
                  borderRadius: '14px',
                  padding: '20px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginBottom: '14px',
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '16px',
                        fontWeight: 800,
                        color: '#67e8f9',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span>📸</span>
                      <span>
                        {isAr
                          ? 'إدارة صلاحية تصوير الشاشة وتسجيل فيديو الشاشة للحسابات'
                          : 'Account Screen Capture & Screen Video Recording Permissions'}
                      </span>
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                      {isAr
                        ? 'الموقع يمنع تصوير الشاشة وتسجيل الفيديو تلقائياً لحماية المحتوى. يمكنك من هنا منح صلاحية لأي حساب مستخدم لكي يتمكن من استخدام الموقع وأخذ لقطات شاشة (Screenshot) وتسجيل فيديو شاشة (Screen Video) بحرية من أي موقع أو برنامج أو أداة دون توقف الموقع.'
                        : 'The platform blocks screenshots and screen recording by default. Grant permission below to any user account so they can freely take screenshots and record screen video from any tool, browser, or website without interruption.'}
                    </p>
                  </div>
                  <span
                    style={{
                      background: 'rgba(6, 182, 212, 0.18)',
                      border: '1px solid #06b6d4',
                      color: '#a5f3fc',
                      padding: '4px 12px',
                      borderRadius: '99px',
                      fontSize: '11.5px',
                      fontWeight: 800,
                    }}
                  >
                    📸{' '}
                    {isAr
                      ? `${screenCaptureAllowedCount} حساب مصرح له بالتصوير`
                      : `${screenCaptureAllowedCount} Authorized Account(s)`}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sortedUsers.map((acc) => {
                    const isSuper = isSuperAdminUser(acc);
                    const allowed = canUserCaptureScreen(acc);
                    return (
                      <div
                        key={acc.id}
                        style={{
                          background: '#0b0f19',
                          border: allowed
                            ? '1px solid rgba(6, 182, 212, 0.5)'
                            : '1px solid #1e293b',
                          borderRadius: '10px',
                          padding: '10px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '16px' }}>
                            {isSuper ? '👑' : allowed ? '📸' : '🔒'}
                          </span>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '13px', color: '#fff' }}>
                              {acc.name}{' '}
                              <span style={{ color: '#94a3b8', fontWeight: 500 }}>({acc.email})</span>
                            </div>
                            <div style={{ fontSize: '11px', color: allowed ? '#67e8f9' : '#64748b', marginTop: '2px' }}>
                              {isSuper
                                ? isAr
                                  ? 'المدير العام — مسموح له بتصوير الشاشة وتسجيل الفيديو دائماً'
                                  : 'Super Admin — Always allowed to capture & record screen'
                                : allowed
                                  ? isAr
                                    ? '✅ مصرح للحساب بتصوير الشاشة وتسجيل سكرين فيديو من أي موقع أو أداة عادي'
                                    : '✅ Authorized to take screenshots & record screen video freely'
                                  : isAr
                                    ? '🚫 الحماية مفعلة على هذا الحساب (ممنوع من تصوير الشاشة وتسجيل الفيديو)'
                                    : '🚫 Screen capture & recording blocked for this account'}
                            </div>
                          </div>
                        </div>

                        {!isSuper && (
                          <button
                            type="button"
                            id={`secPanelToggleCapture_${acc.id}`}
                            onClick={() => handleToggleUserScreenCapture(acc.id)}
                            style={{
                              padding: '7px 14px',
                              borderRadius: '8px',
                              border: allowed ? '1px solid #ef4444' : '1px solid #06b6d4',
                              background: allowed
                                ? 'rgba(239, 68, 68, 0.16)'
                                : 'linear-gradient(135deg, #06b6d4, #0891b2)',
                              color: allowed ? '#fca5a5' : '#042f2e',
                              fontWeight: 900,
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            {allowed
                              ? isAr
                                ? '🚫 سحب صلاحية التصوير'
                                : '🚫 Revoke Capture Permission'
                              : isAr
                                ? '📸 منح صلاحية تصوير الشاشة والفيديو'
                                : '📸 Grant Screen Capture Permission'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Super Admin Account Credentials & Platform Anti-Hacking Fortress */}
              {isCurrentSuperAdmin && (
                <div
                  style={{
                    background: '#14141f',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    borderRadius: '14px',
                    padding: '20px',
                  }}
                >
                  <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 800, color: '#6ee7b7' }}>
                    🔐 {isAr ? 'بيانات حساب المدير العام وحصن الأمان ضد الاختراق' : 'Super Admin Credentials & Security Fortress'}
                  </h3>
                  <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#a0a0b8' }}>
                    {isAr
                      ? 'تم حذف جميع حسابات المدير القديمة نهائياً من السيرفر والداشبورد. يمكنك من هنا تعديل البريد الإلكتروني وكلمة السر الخاصة بحساب المدير العام الجديد في أي وقت.'
                      : 'All legacy admin accounts have been permanently purged. You can update the Super Admin email and password below at any time.'}
                  </p>

                  <form
                    onSubmit={handleUpdateSuperAdminCredentials}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '12px',
                      alignItems: 'end',
                      background: '#0f0f18',
                      border: '1px solid #242438',
                      borderRadius: '12px',
                      padding: '14px',
                      marginBottom: '16px',
                    }}
                  >
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#9494aa', marginBottom: '4px' }}>
                        {isAr ? 'اسم المدير العام' : 'Super Admin Name'}
                      </label>
                      <input
                        type="text"
                        required
                        value={superAdminNameInput}
                        onChange={(e) => setSuperAdminNameInput(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#9494aa', marginBottom: '4px' }}>
                        {isAr ? 'البريد الإلكتروني الرسمي للمدير العام' : 'Super Admin Email'}
                      </label>
                      <input
                        type="email"
                        required
                        value={superAdminEmailInput}
                        onChange={(e) => setSuperAdminEmailInput(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#9494aa', marginBottom: '4px' }}>
                        {isAr ? 'كلمة المرور المشفرة للمدير العام' : 'Super Admin Password'}
                      </label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type={showSuperAdminPassword ? 'text' : 'password'}
                          required
                          value={superAdminPasswordInput}
                          onChange={(e) => setSuperAdminPasswordInput(e.target.value)}
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSuperAdminPassword((p) => !p)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: '1px solid #2e2e46',
                            background: '#181826',
                            color: '#cbd5e1',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          {showSuperAdminPassword ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>
                    <button
                      type="submit"
                      style={{
                        padding: '9px 16px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #7c5cff, #5a2fd0)',
                        border: 0,
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      🔐 {isAr ? 'تحديث بيانات المدير العام' : 'Update Super Admin'}
                    </button>
                  </form>

                  {/* Security Layers Status Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    {[
                      {
                        title: isAr ? 'حذف الحسابات القديمة نهائياً' : 'Legacy Admin Purge',
                        desc: isAr
                          ? 'تم مسح حسابات المدير السابقة من السيرفر والتخزين المحلي ومنع دخولها نهائياً.'
                          : 'All previous admin accounts purged from Firestore and local storage.',
                      },
                      {
                        title: isAr ? 'توقيع الجلسة المشفر (Session Signature)' : 'Cryptographic Session Token',
                        desc: isAr
                          ? 'حماية ضد التلاعب ببيانات المتصفح أو محاولة رفع الصلاحيات عبر التخزين المحلي.'
                          : 'Prevents localStorage role/permission tampering via cryptographic signatures.',
                      },
                      {
                        title: isAr ? 'الحماية ضد التخمين (Anti-Brute-Force)' : 'Brute-Force Lockout',
                        desc: isAr
                          ? 'قفل تلقائي لمحاولات تسجيل الدخول بعد 5 محاولات خاطئة لمنع اختراق كلمات السر.'
                          : 'Automatic account lockout after 5 failed password attempts.',
                      },
                      {
                        title: isAr ? 'مكافحة البرمجة العكسية والتصوير' : 'Anti-Reverse Engineering & Capture',
                        desc: isAr
                          ? 'تعطيل أدوات الفحص واختصارات السورس كود ومنع تصوير الشاشة والفيديو.'
                          : 'Blocks source inspection shortcuts, DevTools tampering, and screen capture.',
                      },
                    ].map((sec, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#0f0f18',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          borderRadius: '10px',
                          padding: '12px',
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: '12px', color: '#34d399' }}>
                          ✓ {sec.title}
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', lineHeight: 1.4 }}>
                          {sec.desc}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: ACTIVITY LOGS */}
          {activeTab === 'activity_logs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Summary Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
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
                    {isAr ? 'إجمالي الملفات المرفوعة والمحولة' : 'Total Uploaded & Converted Files'}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: '#c4b5fd' }}>
                    {(state.activityLogs || []).length}
                  </div>
                </div>

                <div
                  style={{
                    background: '#151520',
                    border: '1px solid #252538',
                    borderRadius: '10px',
                    padding: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', color: '#8e8ea6' }}>
                      {isAr ? 'مزامنة السجل مع Firebase' : 'Firebase Sync Status'}
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>
                      {isAr ? 'متصل ومزامن مباشرة' : 'Live Synced'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRefreshLogsFromFirebase}
                    disabled={isRefreshingLogs}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      background: 'rgba(59, 130, 246, 0.15)',
                      color: '#93c5fd',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🔄 {isRefreshingLogs ? (isAr ? 'جاري التحديث...' : 'Loading...') : isAr ? 'تحديث' : 'Refresh'}
                  </button>
                </div>

                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '10px',
                    padding: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', color: '#fca5a5' }}>
                      {isAr ? 'حذف كافة السجلات' : 'Clear All Logs'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>
                      {isAr ? 'يحذف السجل كاملاً من قاعدة البيانات' : 'Permanently deletes all logs from Firebase'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearAllLogs}
                    disabled={(state.activityLogs || []).length === 0}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid #ef4444',
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#fca5a5',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      opacity: (state.activityLogs || []).length === 0 ? 0.5 : 1,
                    }}
                  >
                    🗑️ {isAr ? 'مسح كل السجل' : 'Clear All'}
                  </button>
                </div>
              </div>

              {/* Logs Table */}
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
                    gap: '12px',
                    marginBottom: '14px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <b style={{ fontSize: '15px', color: '#fff' }}>
                      {isAr ? 'سجل عمليات الرفع والمعاينة' : 'Activity & Upload Logs'}
                    </b>
                    <span style={{ fontSize: '12px', color: '#9494aa' }}>
                      ({filteredLogs.length} {isAr ? 'عملية' : 'entries'})
                    </span>
                  </div>

                  <input
                    type="text"
                    placeholder={
                      isAr
                        ? '🔍 ابحث باسم الملف أو اسم المستخدم أو البريد...'
                        : '🔍 Search file name, user, or email...'
                    }
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    style={{ maxWidth: '280px', fontSize: '12px', padding: '6px 10px' }}
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
                        <th style={{ padding: '10px 8px' }}>{isAr ? 'اسم الملف المرفوع' : 'File Name'}</th>
                        <th style={{ padding: '10px 8px' }}>{isAr ? 'اسم المستخدم والحساب' : 'User Account'}</th>
                        <th style={{ padding: '10px 8px' }}>{isAr ? 'الصيغة والحجم' : 'Format & Size'}</th>
                        <th style={{ padding: '10px 8px' }}>{isAr ? 'تاريخ وساعة الرفع' : 'Timestamp'}</th>
                        <th style={{ padding: '10px 8px' }}>{isAr ? 'إجراء' : 'Action'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#8e8ea6' }}>
                            {isAr ? 'لا يوجد عناصر في سجل النشاط حالياً.' : 'No activity log entries found.'}
                          </td>
                        </tr>
                      ) : (
                        filteredLogs.map((log) => (
                          <tr key={log.id} style={{ borderBottom: '1px solid #1d1d2b' }}>
                            <td style={{ padding: '10px 8px', fontWeight: 700, color: '#fff' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '16px' }}>📄</span>
                                <span style={{ wordBreak: 'break-all' }}>{log.fileName}</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 8px' }}>
                              <div style={{ fontWeight: 700, color: '#c7d2fe' }}>{log.userName}</div>
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{log.userEmail}</div>
                            </td>
                            <td style={{ padding: '10px 8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span
                                  style={{
                                    background: 'rgba(124, 92, 255, 0.2)',
                                    border: '1px solid #7c5cff',
                                    color: '#c4b5fd',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    fontWeight: 800,
                                    fontSize: '11px',
                                  }}
                                >
                                  {log.format}
                                </span>
                                <span style={{ color: '#94a3b8', fontSize: '11px' }}>{log.fileSize || '—'}</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 8px', color: '#cbd5e1' }}>
                              <div>{new Date(log.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}</div>
                              <div style={{ fontSize: '10px', color: '#64748b' }}>
                                {new Date(log.createdAt).toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </div>
                            </td>
                            <td style={{ padding: '10px 8px' }}>
                              <button
                                type="button"
                                onClick={() => handleDeleteLogEntry(log.id)}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  border: '1px solid #dc2626',
                                  background: 'rgba(220, 38, 38, 0.18)',
                                  color: '#f87171',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                }}
                                title={isAr ? 'حذف من قاعدة البيانات والسجل' : 'Delete log entry'}
                              >
                                🗑️ {isAr ? 'حذف' : 'Delete'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRO PACKAGE PRICING & FORMATS */}
          {activeTab === 'pro' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Multi-Tier Subscription Plans Configuration (أسبوع / شهر / 3 شهور / سنة) */}
              <div
                style={{
                  background: 'linear-gradient(180deg, #161426 0%, #12121d 100%)',
                  border: '1px solid rgba(245, 158, 11, 0.45)',
                  borderRadius: '14px',
                  padding: '18px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                    marginBottom: '14px',
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#fde047' }}>
                      {isAr
                        ? '💳 تحديد باقات وأسعار اشتراك أدوات برو (أسبوع / شهر / 3 شهور / سنة)'
                        : '💳 Configure Pro Subscription Plans & Pricing (Week / Month / 3 Months / Year)'}
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#a0a0b8' }}>
                      {isAr
                        ? 'حدد المبلغ الخاص بكل باقة (أسبوع، شهر، 3 شهور، سنة) وتحكم في تفعيل أو إخفاء أي باقة. يتم حفظ الأسعار فوراً وظهورها للمستخدمين في نافذة الاشتراك.'
                        : 'Set the custom price for each duration plan (1 Week, 1 Month, 3 Months, 1 Year) and toggle plan visibility.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateSettings({
                        ...settings,
                        proPlans: DEFAULT_PRO_PLANS.map((p) => ({ ...p })),
                        proPrice: '15',
                      });
                      showSavedFeedback(
                        'تمت استعادة الأسعار الافتراضية للباقات الأربع ✓',
                        'Default 4-tier pricing restored ✓'
                      );
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: '1px solid #3f3f5a',
                      background: '#1b1b2c',
                      color: '#cbd5e1',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🔄 {isAr ? 'استعادة الأسعار الافتراضية' : 'Reset Default Prices'}
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '12px',
                  }}
                >
                  {normalizedPlans.map((plan) => (
                    <div
                      key={plan.id}
                      style={{
                        background: plan.enabled ? '#0f0f1a' : 'rgba(15, 15, 26, 0.5)',
                        border: plan.enabled
                          ? '1px solid rgba(245, 158, 11, 0.45)'
                          : '1px solid #252538',
                        borderRadius: '12px',
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        opacity: plan.enabled ? 1 : 0.65,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: '14px', color: '#fde047' }}>
                          👑 {isAr ? plan.nameAr : plan.nameEn}
                        </div>
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '11px',
                            color: plan.enabled ? '#6ee7b7' : '#94a3b8',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={plan.enabled}
                            onChange={(e) =>
                              handleUpdateProPlan(plan.id, { enabled: e.target.checked })
                            }
                            style={{ width: '14px', height: '14px', accentColor: '#10b981' }}
                          />
                          <span>{plan.enabled ? (isAr ? 'مفعلة' : 'Active') : isAr ? 'مخفية' : 'Hidden'}</span>
                        </label>
                      </div>

                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        ⏱️ {isAr ? plan.periodAr : plan.periodEn}
                      </div>

                      <div>
                        <label
                          htmlFor={`adminProPlanPrice_${plan.id}`}
                          style={{
                            display: 'block',
                            fontSize: '11px',
                            color: '#c4b5fd',
                            fontWeight: 700,
                            marginBottom: '4px',
                          }}
                        >
                          {isAr
                            ? `💰 سعر الباقة (${settings.proCurrency}):`
                            : `💰 Plan Price (${settings.proCurrency}):`}
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input
                            id={`adminProPlanPrice_${plan.id}`}
                            type="text"
                            value={plan.price}
                            onChange={(e) =>
                              handleUpdateProPlan(plan.id, { price: e.target.value })
                            }
                            placeholder="15"
                            style={{
                              fontWeight: 800,
                              fontSize: '15px',
                              color: '#fff',
                              background: '#161625',
                              border: '1px solid #7c5cff',
                            }}
                          />
                          <span
                            style={{
                              fontWeight: 800,
                              fontSize: '14px',
                              color: '#fde047',
                              padding: '0 6px',
                            }}
                          >
                            {settings.proCurrency}
                          </span>
                        </div>
                      </div>

                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '11px',
                            color: '#9494aa',
                            marginBottom: '4px',
                          }}
                        >
                          {isAr ? 'اسم الباقة المعروض:' : 'Display Name:'}
                        </label>
                        <input
                          type="text"
                          value={isAr ? plan.nameAr : plan.nameEn}
                          onChange={(e) =>
                            handleUpdateProPlan(
                              plan.id,
                              isAr ? { nameAr: e.target.value } : { nameEn: e.target.value }
                            )
                          }
                          style={{ fontSize: '12px' }}
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: 'block',
                            fontSize: '11px',
                            color: '#9494aa',
                            marginBottom: '4px',
                          }}
                        >
                          {isAr ? 'الشارة الترويجية (اختياري):' : 'Promotional Badge:'}
                        </label>
                        <input
                          type="text"
                          value={(isAr ? plan.badgeAr : plan.badgeEn) || ''}
                          onChange={(e) =>
                            handleUpdateProPlan(
                              plan.id,
                              isAr ? { badgeAr: e.target.value } : { badgeEn: e.target.value }
                            )
                          }
                          placeholder={isAr ? 'مثال: الأكثر طلباً 🔥' : 'e.g. Best Value 👑'}
                          style={{ fontSize: '12px' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* General Package Title, Currency & Description Settings */}
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
                    ? '👑 الإعدادات العامة لباقة أدوات برو والعملة'
                    : '👑 General Pro Package & Currency Settings'}
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
                      {isAr ? 'اسم الباقة الرئيسي (بالعربية)' : 'Package Name (Arabic)'}
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
                      {isAr ? 'اسم الباقة الرئيسي (بالإنجليزية)' : 'Package Name (English)'}
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
                      {isAr ? 'العملة المعتمدة لجميع الباقات (مثل: $ أو ج.م أو ر.س)' : 'Currency (e.g. $, EGP, SAR)'}
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

              {/* SECTION: PRO TOOLS & FREE TRIAL ATTEMPTS CONFIGURATION */}
              <div
                id="adminProToolsSection"
                style={{
                  background: 'linear-gradient(180deg, #131224 0%, #0d0d17 100%)',
                  border: '1px solid rgba(168, 85, 247, 0.45)',
                  borderRadius: '14px',
                  padding: '18px',
                  boxShadow: '0 8px 24px rgba(168, 85, 247, 0.1)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginBottom: '16px',
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '16px',
                        fontWeight: 800,
                        color: '#c084fc',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span>💎</span>
                      <span>
                        {isAr
                          ? 'تخصيص وظائف وميزات برو ومحاولات التجربة المجانية'
                          : 'Configure Pro Tools & Free Trial Attempts'}
                      </span>
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#a0a0b8' }}>
                      {isAr
                        ? 'حدد الوظائف المشمولة في باقة برو (مثل: استوديو الهدايا، أداة إنشاء الصور)، واختر نطاق القفل (الدخول للوظيفة بالكامل أم زر التصدير والتحميل فقط)، مع إمكانية منح المستخدمين غير المشتركين عدد محدد من المحاولات المجانية وتظهر شارتها على الأزرار.'
                        : 'Select tools included in Pro, choose lock scope (feature access vs export only), and grant non-subscribers a configurable number of free trial attempts with live UI badges.'}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {PRO_TOOLS_DEFINITIONS.map((tool) => {
                    const rule = normalizedFeatureRules[tool.key] || {
                      isPro: tool.defaultIsPro,
                      scope: tool.defaultScope,
                      allowFreeAttempts: true,
                      freeAttemptsCount: tool.defaultFreeAttempts,
                    };

                    return (
                      <div
                        key={tool.key}
                        id={`proToolCard_${tool.key}`}
                        style={{
                          background: rule.isPro ? '#10101c' : 'rgba(16, 16, 28, 0.5)',
                          border: rule.isPro
                            ? '1px solid rgba(168, 85, 247, 0.4)'
                            : '1px solid #26263a',
                          borderRadius: '12px',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            flexWrap: 'wrap',
                            gap: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '24px' }}>{tool.icon}</span>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '14px', color: '#fff' }}>
                                {isAr ? tool.labelAr : tool.labelEn}
                              </div>
                              <div style={{ fontSize: '11px', color: '#9494aa', marginTop: '2px' }}>
                                {isAr ? tool.descAr : tool.descEn}
                              </div>
                            </div>
                          </div>

                          {/* Pro Toggle */}
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateProFeatureRule(tool.key, { isPro: !rule.isPro })
                            }
                            style={{
                              padding: '5px 14px',
                              borderRadius: '99px',
                              border: rule.isPro
                                ? '1px solid #a855f7'
                                : '1px solid #10b981',
                              background: rule.isPro
                                ? 'rgba(168, 85, 247, 0.22)'
                                : 'rgba(16, 185, 129, 0.18)',
                              color: rule.isPro ? '#e9d5ff' : '#6ee7b7',
                              fontSize: '12px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <span>{rule.isPro ? '👑' : '✅'}</span>
                            <span>
                              {rule.isPro
                                ? isAr
                                  ? 'ضمن باقة برو (مقيدة)'
                                  : 'Pro Membership Only'
                                : isAr
                                  ? 'مجانية للجميع'
                                  : 'Free For Everyone'}
                            </span>
                          </button>
                        </div>

                        {rule.isPro && (
                          <div
                            style={{
                              borderTop: '1px solid #1f1f32',
                              paddingTop: '12px',
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                              gap: '14px',
                            }}
                          >
                            {/* Scope Selector: Access vs Export */}
                            <div>
                              <label
                                style={{
                                  display: 'block',
                                  fontSize: '11px',
                                  color: '#c4b5fd',
                                  fontWeight: 700,
                                  marginBottom: '6px',
                                }}
                              >
                                {isAr
                                  ? '🔒 تحديد موضع قفل برو (الميزة أم زر التصدير):'
                                  : '🔒 Lock Scope (Feature Access vs Export Button):'}
                              </label>
                              <select
                                value={rule.scope}
                                onChange={(e) =>
                                  handleUpdateProFeatureRule(tool.key, {
                                    scope: e.target.value as ProFeatureScope,
                                  })
                                }
                                style={{
                                  width: '100%',
                                  padding: '7px 10px',
                                  borderRadius: '8px',
                                  background: '#161625',
                                  border: '1px solid #3d3d5c',
                                  color: '#fff',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                }}
                              >
                                <option value="export">
                                  {isAr
                                    ? '⬇ قفل زر التصدير والتحميل فقط (المعاينة والتجربة متاحة)'
                                    : '⬇ Lock Export & Download Button Only (Free Preview)'}
                                </option>
                                <option value="access">
                                  {isAr
                                    ? '🔒 قفل الدخول واستخدام الوظيفة بالكامل'
                                    : '🔒 Lock Entire Feature Access'}
                                </option>
                              </select>
                            </div>

                            {/* Free Attempts Configuration */}
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: '6px',
                                }}
                              >
                                <label
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '11px',
                                    color: '#fde047',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={rule.allowFreeAttempts}
                                    onChange={(e) =>
                                      handleUpdateProFeatureRule(tool.key, {
                                        allowFreeAttempts: e.target.checked,
                                      })
                                    }
                                    style={{
                                      width: '14px',
                                      height: '14px',
                                      accentColor: '#f59e0b',
                                    }}
                                  />
                                  <span>
                                    {isAr
                                      ? '🎁 إتاحة محاولات تجربة مجانية لغير المشتركين'
                                      : '🎁 Allow Free Trial Attempts'}
                                  </span>
                                </label>

                                {rule.allowFreeAttempts && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleResetFeatureAttemptsForTesting(tool.key)
                                    }
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      border: '1px solid #475569',
                                      background: '#1a1a2a',
                                      color: '#cbd5e1',
                                      fontSize: '10px',
                                      cursor: 'pointer',
                                    }}
                                    title={
                                      isAr
                                        ? 'إعادة تصفير محاولات جهازك للتجربة'
                                        : 'Reset trial attempts on this device for testing'
                                    }
                                  >
                                    🔄 {isAr ? 'تصفير للتجربة' : 'Reset'}
                                  </button>
                                )}
                              </div>

                              {rule.allowFreeAttempts ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <input
                                    type="number"
                                    min="1"
                                    max="50"
                                    value={rule.freeAttemptsCount}
                                    onChange={(e) =>
                                      handleUpdateProFeatureRule(tool.key, {
                                        freeAttemptsCount: Math.max(
                                          1,
                                          Number(e.target.value) || 1
                                        ),
                                      })
                                    }
                                    style={{
                                      width: '70px',
                                      padding: '6px 8px',
                                      borderRadius: '8px',
                                      background: '#161625',
                                      border: '1px solid #f59e0b',
                                      color: '#fde047',
                                      fontSize: '13px',
                                      fontWeight: 800,
                                      textAlign: 'center',
                                    }}
                                  />
                                  <span style={{ fontSize: '11px', color: '#9494aa' }}>
                                    {isAr ? 'محاولات مجانية' : 'free attempts'}
                                  </span>

                                  {/* Quick chips */}
                                  <div style={{ display: 'flex', gap: '4px', marginInlineStart: 'auto' }}>
                                    {[1, 2, 3, 5, 10].map((num) => (
                                      <button
                                        key={num}
                                        type="button"
                                        onClick={() =>
                                          handleUpdateProFeatureRule(tool.key, {
                                            freeAttemptsCount: num,
                                          })
                                        }
                                        style={{
                                          padding: '3px 7px',
                                          borderRadius: '5px',
                                          border:
                                            rule.freeAttemptsCount === num
                                              ? '1px solid #f59e0b'
                                              : '1px solid #2e2e42',
                                          background:
                                            rule.freeAttemptsCount === num
                                              ? 'rgba(245, 158, 11, 0.25)'
                                              : '#161624',
                                          color:
                                            rule.freeAttemptsCount === num
                                              ? '#fde047'
                                              : '#cbd5e1',
                                          fontSize: '10px',
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                        }}
                                      >
                                        {num}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ fontSize: '11px', color: '#ef4444' }}>
                                  {isAr
                                    ? '🚫 لا توجد محاولات مجانية (مطلوب اشتراك فوري)'
                                    : '🚫 No free attempts (Immediate subscription required)'}
                                </div>
                              )}
                            </div>

                            {/* Live Badge Preview */}
                            <div
                              style={{
                                gridColumn: '1 / -1',
                                background: '#0b0b14',
                                border: '1px dashed #2d2d46',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '8px',
                              }}
                            >
                              <span style={{ fontSize: '11px', color: '#9494aa' }}>
                                {isAr ? 'معاينة شكل الشارة في الموقع:' : 'Live Button Badge Preview:'}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '3px 8px',
                                    borderRadius: '99px',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    background: rule.allowFreeAttempts
                                      ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(16, 185, 129, 0.22))'
                                      : 'rgba(245, 158, 11, 0.2)',
                                    border: rule.allowFreeAttempts
                                      ? '1px solid #10b981'
                                      : '1px solid #f59e0b',
                                    color: rule.allowFreeAttempts ? '#6ee7b7' : '#fde047',
                                  }}
                                >
                                  <span>👑 PRO</span>
                                  {rule.allowFreeAttempts && (
                                    <span>
                                      · {rule.freeAttemptsCount}{' '}
                                      {isAr ? 'محاولات مجانية' : 'Free Trials'}
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                    marginBottom: '14px',
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', color: '#c4b5fd' }}>
                      {isAr ? '🎨 تغيير اسم الموقع ولوجو الموقع (حفظ دائم في السيرفر)' : '🎨 Website Name & Logo Branding (Permanent Server Sync)'}
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: '#94a3b8' }}>
                      {isAr
                        ? 'عند رفع صورة اللوجو أو تعديل اسم الموقع يتم ضغط الصورة تلقائياً وحفظها وتثبيتها بشكل دائم في السيرفر دون أن تُحذف عند تغيير الاسم.'
                        : 'Uploaded logos are automatically optimized and permanently pinned to the server so changing the site name never deletes your logo.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    id="saveBrandingPermanentBtn"
                    disabled={isSavingBranding}
                    onClick={handleSaveBrandingPermanently}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      border: '1px solid #34d399',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '12.5px',
                      cursor: isSavingBranding ? 'wait' : 'pointer',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>💾</span>
                    <span>
                      {isSavingBranding
                        ? isAr
                          ? 'جاري التثبيت في السيرفر...'
                          : 'Pinning to Server...'
                        : isAr
                          ? 'حفظ وتثبيت الاسم واللوجو بشكل دائم'
                          : 'Save & Pin Name & Logo Permanently'}
                    </span>
                  </button>
                </div>

                {brandingSyncNotice && (
                  <div
                    id="brandingServerSyncStatus"
                    style={{
                      marginBottom: '14px',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: 'rgba(16, 185, 129, 0.14)',
                      border: '1px solid rgba(16, 185, 129, 0.45)',
                      color: '#6ee7b7',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    {brandingSyncNotice}
                  </div>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '16px',
                    alignItems: 'start',
                  }}
                >
                  <div>
                    <label
                      htmlFor="adminSiteNameInput"
                      style={{ display: 'block', fontSize: '12px', color: '#9494aa', marginBottom: '6px', fontWeight: 700 }}
                    >
                      {isAr ? 'اسم الموقع (يظهر في الشريط العلوي والعنوان):' : 'Website Name:'}
                    </label>
                    <input
                      id="adminSiteNameInput"
                      type="text"
                      value={brandNameDraft}
                      placeholder="MotionTools"
                      onChange={(e) => handleSiteNameChange(e.target.value)}
                    />

                    <label
                      htmlFor="adminExternalLogoUrlInput"
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        color: '#9494aa',
                        marginTop: '14px',
                        marginBottom: '6px',
                        fontWeight: 700,
                      }}
                    >
                      {isAr ? 'رابط صورة اللوجو الخارجي (اختياري - أو ارفع صورة من جهازك):' : 'External Logo Image URL (Optional):'}
                    </label>
                    <input
                      id="adminExternalLogoUrlInput"
                      type="text"
                      value={externalLogoUrlDraft}
                      placeholder={
                        settings.siteLogoUrl?.startsWith('data:image/')
                          ? isAr
                            ? '✅ تم رفع وتثبيت صورة لوجو من جهازك بنجاح'
                            : '✅ Custom uploaded logo image is active'
                          : 'https://example.com/logo.png'
                      }
                      onChange={(e) => handleExternalLogoUrlChange(e.target.value)}
                    />

                    {settings.siteLogoUrl && (
                      <div
                        style={{
                          marginTop: '8px',
                          fontSize: '11px',
                          color: '#6ee7b7',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 700,
                        }}
                      >
                        <span>📌</span>
                        <span>
                          {settings.siteLogoUrl.startsWith('data:image/')
                            ? isAr
                              ? 'حالة اللوجو: صورة مرفوعة من جهازك ومثبتة في السيرفر بشكل دائم'
                              : 'Logo Status: Uploaded image permanently pinned on server'
                            : isAr
                              ? 'حالة اللوجو: رابط صورة خارجي مثبت في السيرفر'
                              : 'Logo Status: External logo URL pinned on server'}
                        </span>
                      </div>
                    )}
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
                    <div style={{ fontSize: '12px', color: '#9494aa', fontWeight: 700 }}>
                      {isAr ? 'معاينة اللوجو والاسم المثبت حالياً:' : 'Live Pinned Brand Preview:'}
                    </div>
                    <div
                      id="adminBrandingLivePreviewBox"
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
                          id="adminPreviewLogoImg"
                          src={settings.siteLogoUrl}
                          alt="Site Logo"
                          style={{
                            width: '30px',
                            height: '30px',
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
                      <span id="adminPreviewSiteNameText" style={{ fontWeight: 800, fontSize: '16px', color: '#fff' }}>
                        {brandNameDraft || settings.siteName || 'MotionTools'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <button
                        type="button"
                        id="uploadLogoFromDeviceBtn"
                        onClick={() => logoFileInputRef.current?.click()}
                        style={{
                          padding: '7px 14px',
                          borderRadius: '8px',
                          background: '#7c5cff',
                          border: 0,
                          color: '#fff',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        {isAr ? '📁 رفع وتثبيت صورة لوجو من الجهاز' : '📁 Upload & Pin Logo Image'}
                      </button>
                      {settings.siteLogoUrl && (
                        <button
                          type="button"
                          id="resetSiteLogoBtn"
                          onClick={handleResetLogoToDefault}
                          style={{
                            padding: '7px 12px',
                            borderRadius: '8px',
                            background: '#222230',
                            border: '1px solid #3a3a4e',
                            color: '#fca5a5',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 700,
                          }}
                        >
                          {isAr ? '🗑️ حذف اللوجو' : '🗑️ Remove Logo'}
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
