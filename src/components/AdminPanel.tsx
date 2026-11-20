import React, { useState, useEffect } from 'react';
import { UserRecord, AppSettings, LicenseKey, PresetBackground, SubscriptionType, ActivityLog } from '../types';
import { db, storage } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, addDoc, deleteDoc, query, orderBy, Timestamp, setDoc, getDoc, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { StoreManager } from './StoreManager';
import { Users, Key, Image as ImageIcon, Settings as SettingsIcon, Trash2, Ban, CheckCircle, Upload, RefreshCw, X, FileText, Link as LinkIcon, BadgeCheck, Wifi, Smartphone, Store, UserPlus, Lock, Unlock, Shield, ShieldPlus, ShieldOff } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { logActivity } from '../utils/logger';

// Secondary app for creating users without logging out admin
const secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp');
const secondaryAuth = getAuth(secondaryApp);

interface AdminPanelProps {
  currentUser: UserRecord | null;
  onCancel: () => void;
}

const EXPORT_FORMATS = ['AE Project', 'SVGA 2.0 EX', 'SVGA 2.0', 'Image Sequence', 'GIF (Animation)', 'APNG (Animation)', 'WebM (Video)', 'WebP (Animated)', 'VAP 1.0.5', 'VAP (MP4)', 'SVGA → YYEVA'];

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, onCancel }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'store' | 'keys' | 'assets' | 'settings' | 'records'>('users');
  const [dropdownState, setDropdownState] = useState<{ userId: string; x: number; y: number; position: 'top' | 'bottom' } | null>(null);
  const [subDropdownState, setSubDropdownState] = useState<{ userId: string; x: number; y: number; position: 'top' | 'bottom' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [bannedIps, setBannedIps] = useState<string[]>([]);
  const [bannedDevices, setBannedDevices] = useState<string[]>([]);
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [backgrounds, setBackgrounds] = useState<PresetBackground[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    appName: 'SVGA Platinum',
    logoUrl: '',
    backgroundUrl: '',
    whatsappNumber: '',
    isRegistrationOpen: true,
    defaultFreeAttempts: 5,
    isSvgaExEnabled: false,
    costs: {
      svgaProcess: 0,
      batchCompress: 0,
      vipPrice: 0
    }
  });
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [cache, setCache] = useState<Record<string, { data: any, timestamp: number }>>({});
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'user' as 'admin' | 'moderator' | 'user' });
  const [creatingUser, setCreatingUser] = useState(false);
  const [permissionModal, setPermissionModal] = useState<{ userId: string; name: string; permissions: string[] } | null>(null);

  const TABS = [
    { id: 'users', label: 'المستخدمين', icon: <Users /> },
    { id: 'store', label: 'المتجر', icon: <Store /> },
    { id: 'keys', label: 'الاشتراكات', icon: <Key /> },
    { id: 'assets', label: 'الوسائط', icon: <ImageIcon /> },
    { id: 'records', label: 'السجلات', icon: <FileText /> },
    { id: 'settings', label: 'الإعدادات', icon: <SettingsIcon /> },
  ];

  const canAccessTab = (tabId: string) => {
    if (currentUser?.isSuperAdmin || currentUser?.role === 'admin') return true;
    if (currentUser?.role === 'moderator') {
      return currentUser.permissions?.includes(tabId);
    }
    return false;
  };

  const isSuperAdmin = (user: UserRecord) => user.isSuperAdmin || (user.role === 'admin' && user.email === 'iejehdgdig@gmail.com');

  const CACHE_DURATION = 30000; // 30 seconds

  // ... (rest of the component)

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email || !newUser.password) return alert("يرجى ملء جميع الحقول");
    
    setCreatingUser(true);
    try {
      const { user } = await createUserWithEmailAndPassword(secondaryAuth, newUser.email, newUser.password);
      
      const userData: UserRecord = {
        id: user.uid,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        isApproved: true,
        isVIP: newUser.role === 'admin' || newUser.role === 'moderator',
        status: 'active',
        subscriptionType: (newUser.role === 'admin' || newUser.role === 'moderator') ? 'year' : 'none',
        freeAttempts: (newUser.role === 'admin' || newUser.role === 'moderator') ? 999999 : settings.defaultFreeAttempts,
        coins: (newUser.role === 'admin' || newUser.role === 'moderator') ? 999999 : 0,
        subscriptionExpiry: (newUser.role === 'admin' || newUser.role === 'moderator') ? Timestamp.fromDate(new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)) : null,
        createdAt: Timestamp.now(),
        lastLogin: Timestamp.now(),
        deviceId: 'admin_created',
        lastIp: '0.0.0.0',
        hasSvgaExAccess: newUser.role === 'admin' || newUser.role === 'moderator',
        permissions: newUser.role === 'moderator' ? ['users'] : []
      };

      await setDoc(doc(db, 'users', user.uid), userData);
      
      // Sign out from secondary auth to avoid session confusion
      await secondaryAuth.signOut();
      
      alert("تم إنشاء الحساب بنجاح");
      setShowCreateUser(false);
      setNewUser({ name: '', email: '', password: '', role: 'user' });
      fetchData();
    } catch (error: any) {
      console.error("Error creating user:", error);
      alert("فشل إنشاء الحساب: " + (error.message || "خطأ غير معروف"));
    } finally {
      setCreatingUser(false);
    }
  };

  // URL Input States
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const [bgUrlInput, setBgUrlInput] = useState('');
  const [presetUrlInput, setPresetUrlInput] = useState('');

  // Fetch Data
  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    const now = Date.now();
    if (cache[activeTab] && (now - cache[activeTab].timestamp) < CACHE_DURATION) {
      const cached = cache[activeTab].data;
      if (activeTab === 'users') {
        setUsers(cached.users);
        setBannedIps(cached.bannedIps);
        setBannedDevices(cached.bannedDevices);
      } else if (activeTab === 'keys') {
        setKeys(cached);
      } else if (activeTab === 'assets') {
        setBackgrounds(cached.backgrounds);
        setSettings(cached.settings);
        setLogoUrlInput(cached.settings.logoUrl || '');
        setBgUrlInput(cached.settings.backgroundUrl || '');
      } else if (activeTab === 'settings') {
        setSettings(cached);
      } else if (activeTab === 'records') {
        setLogs(cached);
      }
      return;
    }

    setLoading(true);
    try {
      if (activeTab === 'users') {
        const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const usersData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserRecord));
        setUsers(usersData);

        // Fetch banned IPs and Devices
        const [ipSnap, deviceSnap] = await Promise.all([
          getDocs(collection(db, 'banned_ips')),
          getDocs(collection(db, 'banned_devices'))
        ]);
        const ips = ipSnap.docs.map(d => d.data().ip);
        const devices = deviceSnap.docs.map(d => d.id);
        setBannedIps(ips);
        setBannedDevices(devices);
        
        setCache(prev => ({ ...prev, users: { data: { users: usersData, bannedIps: ips, bannedDevices: devices }, timestamp: now } }));
      } else if (activeTab === 'keys') {
        const q = query(collection(db, 'licenseKeys'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const keysData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LicenseKey));
        setKeys(keysData);
        setCache(prev => ({ ...prev, keys: { data: keysData, timestamp: now } }));
      } else if (activeTab === 'assets') {
        const q = query(collection(db, 'presetBackgrounds'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const backgroundsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PresetBackground));
        setBackgrounds(backgroundsData);
        
        const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
        let settingsData = null;
        if (settingsDoc.exists()) {
            settingsData = settingsDoc.data() as AppSettings;
            setSettings(settingsData);
            setLogoUrlInput(settingsData.logoUrl || '');
            setBgUrlInput(settingsData.backgroundUrl || '');
        }
        setCache(prev => ({ ...prev, assets: { data: { backgrounds: backgroundsData, settings: settingsData }, timestamp: now } }));
      } else if (activeTab === 'settings') {
        const docRef = doc(db, 'settings', 'global');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const settingsData = docSnap.data() as AppSettings;
          setSettings(settingsData);
          setCache(prev => ({ ...prev, settings: { data: settingsData, timestamp: now } }));
        } else {
          setCache(prev => ({ ...prev, settings: { data: settings, timestamp: now } }));
        }
      } else if (activeTab === 'records') {
        const q = query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(100));
        const snapshot = await getDocs(q);
        const logsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog));
        setLogs(logsData);
        setCache(prev => ({ ...prev, records: { data: logsData, timestamp: now } }));
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  // ... (User Management)
  const handleBanUser = async (user: UserRecord) => {
    if (isSuperAdmin(user)) return alert("لا يمكن حظر حساب المدير العام");
    if (currentUser?.role === 'moderator' && user.role === 'admin') return alert("لا تملك صلاحية حظر المسؤولين");
    if (!confirm('هل أنت متأكد من تغيير حالة هذا المستخدم؟')) return;
    try {
      const newStatus = user.status === 'banned' ? 'active' : 'banned';
      await updateDoc(doc(db, 'users', user.id), { status: newStatus });
      
      // Also track in banned_emails to prevent re-registration
      if (user.email) {
        const emailDocId = (user.email || '').toLowerCase().replace(/\./g, '_');
        if (newStatus === 'banned') {
          await setDoc(doc(db, 'banned_emails', emailDocId), {
            email: (user.email || '').toLowerCase(),
            userId: user.id,
            bannedAt: Timestamp.now()
          });
        } else {
          await deleteDoc(doc(db, 'banned_emails', emailDocId));
        }
      }

      setUsers(users.map(u => u.id === user.id ? { ...u, status: newStatus as any } : u));
    } catch (error) {
      console.error("Error updating user:", error);
    }
  };

  const handleBanIp = async (ip: string | undefined) => {
    if (!ip) return alert("لا يوجد عنوان IP لهذا المستخدم");
    const ipDocId = ip.replace(/\./g, '_');
    const isBanned = bannedIps.includes(ip);
    
    if (!confirm(isBanned ? 'هل تريد فك حظر هذه الشبكة؟' : 'هل تريد حظر هذه الشبكة بالكامل؟')) return;

    try {
      if (isBanned) {
        await deleteDoc(doc(db, 'banned_ips', ipDocId));
        setBannedIps(bannedIps.filter(i => i !== ip));
      } else {
        await setDoc(doc(db, 'banned_ips', ipDocId), { ip, bannedAt: Timestamp.now() });
        setBannedIps([...bannedIps, ip]);
      }
    } catch (e) {
      console.error("IP Ban error:", e);
    }
  };

  const handleBanDevice = async (deviceId: string | undefined) => {
    if (!deviceId) return alert("لا يوجد معرف جهاز لهذا المستخدم");
    const isBanned = bannedDevices.includes(deviceId);
    
    if (!confirm(isBanned ? 'هل تريد فك حظر هذا الجهاز؟' : 'هل تريد حظر هذا الجهاز بالكامل؟')) return;

    try {
      if (isBanned) {
        await deleteDoc(doc(db, 'banned_devices', deviceId));
        setBannedDevices(bannedDevices.filter(d => d !== deviceId));
      } else {
        await setDoc(doc(db, 'banned_devices', deviceId), { bannedAt: Timestamp.now() });
        setBannedDevices([...bannedDevices, deviceId]);
      }
    } catch (e) {
      console.error("Device Ban error:", e);
    }
  };

  const handleToggleSvgaExAccess = async (userId: string, currentAccess: boolean) => {
    try {
      const newAccess = !currentAccess;
      await updateDoc(doc(db, 'users', userId), { hasSvgaExAccess: newAccess });
      setUsers(users.map(u => u.id === userId ? { ...u, hasSvgaExAccess: newAccess } : u));
    } catch (error) {
      console.error("Error updating SVGA EX access:", error);
      alert("فشل تحديث صلاحية SVGA EX");
    }
  };

  const handleSetSubscription = async (userId: string, type: SubscriptionType) => {
    if (!confirm(`هل تريد تفعيل اشتراك ${type} لهذا المستخدم؟`)) return;
    try {
      let expiry = new Date();
      if (type === 'day') expiry.setDate(expiry.getDate() + 1);
      if (type === 'week') expiry.setDate(expiry.getDate() + 7);
      if (type === 'month') expiry.setMonth(expiry.getMonth() + 1);
      if (type === 'year') expiry.setFullYear(expiry.getFullYear() + 1);

      await updateDoc(doc(db, 'users', userId), {
        subscriptionType: type,
        subscriptionExpiry: Timestamp.fromDate(expiry),
        isVIP: true
      });
      
      if (currentUser) {
        const targetUser = users.find(u => u.id === userId);
        logActivity(currentUser, 'subscription', `Set ${type} subscription for user: ${targetUser?.name || userId} (${targetUser?.email || 'N/A'})`);
      }
      
      fetchData(); // Refresh to show changes
    } catch (error) {
      console.error("Error setting subscription:", error);
    }
  };

  const handleRemoveSubscription = async (userId: string) => {
    if (!confirm('هل أنت متأكد من إزالة الاشتراك من هذا المستخدم؟')) return;
    try {
      const updates = {
        isVIP: false,
        subscriptionType: 'none',
        subscriptionExpiry: null,
        activatedKey: null
      };
      await updateDoc(doc(db, 'users', userId), updates);
      setUsers(users.map(u => u.id === userId ? { ...u, ...updates } : u));
      
      if (currentUser) {
        const targetUser = users.find(u => u.id === userId);
        logActivity(currentUser, 'subscription', `Removed subscription from user: ${targetUser?.name || userId} (${targetUser?.email || 'N/A'})`);
      }
      
      alert("تم إزالة الاشتراك بنجاح");
    } catch (error) {
      console.error("Error removing subscription:", error);
      alert("فشل إزالة الاشتراك");
    }
  };

  const handleSetAllowedFormat = async (userId: string, formats: string[] | null) => {
    try {
        // Use formats directly to allow empty array (Block All) or null (Default)
        const value = formats;
        await updateDoc(doc(db, 'users', userId), {
            allowedExportFormat: value
        });
        setUsers(users.map(u => u.id === userId ? { ...u, allowedExportFormat: value || undefined } : u));
    } catch (error) {
        console.error("Error setting allowed format:", error);
        alert("فشل تحديث الصيغة");
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user && isSuperAdmin(user)) return alert("لا يمكن حذف حساب المدير العام");
    if (user && currentUser?.role === 'moderator' && user.role === 'admin') return alert("لا تملك صلاحية حذف المسؤولين");
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم نهائياً؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
      setUsers(users.filter(u => u.id !== userId));
    } catch (error) {
      console.error("Error deleting user:", error);
      alert("فشل حذف المستخدم");
    }
  };

  const handleUpdatePermissions = async () => {
    if (!permissionModal) return;
    try {
      const userToUpdate = users.find(u => u.id === permissionModal.userId);
      const updates: any = {
        permissions: permissionModal.permissions
      };
      
      // If user is not already a moderator or admin, promote to moderator
      if (userToUpdate && userToUpdate.role !== 'admin' && userToUpdate.role !== 'moderator') {
        updates.role = 'moderator';
        // Also give them VIP perks as they are now staff
        updates.isVIP = true;
        updates.subscriptionType = 'year';
        updates.subscriptionExpiry = Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
        updates.coins = 999999;
        updates.freeAttempts = 999999;
        updates.hasSvgaExAccess = true;
      }

      await updateDoc(doc(db, 'users', permissionModal.userId), updates);
      setUsers(users.map(u => u.id === permissionModal.userId ? { ...u, ...updates } : u));
      setPermissionModal(null);
      alert("تم تحديث الصلاحيات بنجاح");
    } catch (error) {
      console.error("Error updating permissions:", error);
      alert("فشل تحديث الصلاحيات");
    }
  };

  const handleRevokeModeration = async (userId: string) => {
    if (!confirm('هل أنت متأكد من سحب الإشراف من هذا المستخدم؟ سيعود مستخدماً عادياً.')) return;
    try {
      const updates = {
        role: 'user',
        permissions: [],
        // Optionally reset perks, but maybe keep them if they were paid? 
        // Usually staff perks are revoked.
        isVIP: false,
        subscriptionType: 'none',
        subscriptionExpiry: null,
        coins: 0,
        freeAttempts: settings.defaultFreeAttempts,
        hasSvgaExAccess: false
      };
      await updateDoc(doc(db, 'users', userId), updates);
      setUsers(users.map(u => u.id === userId ? { ...u, ...updates } : u));
      alert("تم سحب الإشراف بنجاح");
    } catch (error) {
      console.error("Error revoking moderation:", error);
      alert("فشل سحب الإشراف");
    }
  };

  const handleClearLogs = async () => {
      if (!confirm('هل أنت متأكد من حذف جميع السجلات؟')) return;
      setLoading(true);
      try {
          const q = query(collection(db, 'activityLogs'));
          const snapshot = await getDocs(q);
          const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'activityLogs', d.id)));
          await Promise.all(deletePromises);
          setLogs([]);
          alert("تم حذف السجلات بنجاح");
      } catch (error) {
          console.error("Error clearing logs:", error);
          alert("فشل حذف السجلات");
      } finally {
          setLoading(false);
      }
  };

  // ... (Key Management)
  const handleGenerateKey = async (duration: SubscriptionType) => {
    try {
      const key = Math.random().toString(36).substring(2, 15).toUpperCase();
      const newKey: Omit<LicenseKey, 'id'> = {
        key,
        duration,
        isUsed: false,
        createdAt: Timestamp.now(),
        createdBy: currentUser?.id || 'admin'
      };
      await addDoc(collection(db, 'licenseKeys'), newKey);
      fetchData();
    } catch (error) {
      console.error("Error generating key:", error);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm('حذف هذا المفتاح؟')) return;
    try {
      await deleteDoc(doc(db, 'licenseKeys', keyId));
      setKeys(keys.filter(k => k.id !== keyId));
    } catch (error) {
      console.error("Error deleting key:", error);
    }
  };

  // ... (Asset Management)
  const handleUploadAsset = async (file: File, type: 'logo' | 'background' | 'preset') => {
    if (!file) return;
    try {
      const storageRef = ref(storage, `assets/${type}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      if (type === 'logo') {
        await setDoc(doc(db, 'settings', 'global'), { logoUrl: url }, { merge: true });
        setSettings(prev => prev ? { ...prev, logoUrl: url } : null);
        setLogoUrlInput(url);
      } else if (type === 'background') {
        await setDoc(doc(db, 'settings', 'global'), { backgroundUrl: url }, { merge: true });
        setSettings(prev => prev ? { ...prev, backgroundUrl: url } : null);
        setBgUrlInput(url);
      } else if (type === 'preset') {
        await addDoc(collection(db, 'presetBackgrounds'), {
          label: file.name,
          url,
          createdAt: Timestamp.now()
        });
        fetchData();
      }
    } catch (error) {
      console.error("Error uploading asset:", error);
      alert("فشل رفع الملف");
    }
  };

  const handleSaveAssetUrl = async (type: 'logo' | 'background') => {
      try {
          if (type === 'logo') {
              await setDoc(doc(db, 'settings', 'global'), { logoUrl: logoUrlInput }, { merge: true });
              setSettings(prev => prev ? { ...prev, logoUrl: logoUrlInput } : null);
          } else {
              await setDoc(doc(db, 'settings', 'global'), { backgroundUrl: bgUrlInput }, { merge: true });
              setSettings(prev => prev ? { ...prev, backgroundUrl: bgUrlInput } : null);
          }
          alert("تم حفظ الرابط بنجاح");
      } catch (error) {
          console.error("Error saving asset url:", error);
          alert("فشل حفظ الرابط");
      }
  };

  const handleAddPresetUrl = async () => {
      if (!presetUrlInput) return;
      try {
          await addDoc(collection(db, 'presetBackgrounds'), {
              label: 'External URL',
              url: presetUrlInput,
              createdAt: Timestamp.now()
          });
          setPresetUrlInput('');
          fetchData();
      } catch (error) {
          console.error("Error adding preset url:", error);
          alert("فشل إضافة الخلفية");
      }
  };

  const handleDeletePreset = async (id: string, url: string) => {
    if (!confirm('حذف هذه الخلفية؟')) return;
    try {
      // Try to delete from storage (optional, might fail if permission denied)
      // const storageRef = ref(storage, url);
      // await deleteObject(storageRef).catch(console.warn);
      
      await deleteDoc(doc(db, 'presetBackgrounds', id));
      setBackgrounds(backgrounds.filter(b => b.id !== id));
    } catch (error) {
      console.error("Error deleting preset:", error);
    }
  };

  // ... (Settings Management)
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'settings', 'global'), settings, { merge: true });
      alert("تم حفظ الإعدادات بنجاح");
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("فشل حفظ الإعدادات");
    }
  };

  return (
    <div className="w-full h-full flex flex-col text-white bg-slate-900/50 rounded-xl overflow-hidden border border-white/10">
      {/* Header */}
      <div className="flex justify-between items-center p-6 border-b border-white/10 bg-slate-900/80">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-indigo-400" />
          لوحة التحكم
        </h2>
        <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-full lg:w-64 bg-slate-950/50 border-b lg:border-b-0 lg:border-l border-white/10 flex flex-row lg:flex-col p-2 sm:p-4 gap-1 sm:gap-2 overflow-x-auto custom-scrollbar no-scrollbar">
          {TABS.map(tab => canAccessTab(tab.id) && (
            <NavButton 
              key={tab.id}
              active={activeTab === tab.id} 
              onClick={() => setActiveTab(tab.id as any)} 
              icon={tab.icon} 
              label={tab.label} 
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
          ) : (
            <>
              {activeTab === 'store' && <StoreManager />}
              {activeTab === 'users' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">إدارة المستخدمين</h3>
                    <button 
                      onClick={() => setShowCreateUser(true)}
                      className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                    >
                      <UserPlus className="w-4 h-4" />
                      إنشاء مستخدم جديد
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-400 text-sm">
                          <th className="p-3">الاسم</th>
                          <th className="p-3">البريد الإلكتروني</th>
                          <th className="p-3">الحالة</th>
                          <th className="p-3">الاشتراك</th>
                          <th className="p-3">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((user, index) => (
                          <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="p-3 font-medium flex items-center gap-2">
                                {user.name}
                                {isSuperAdmin(user) && <BadgeCheck className="w-4 h-4 text-amber-400" title="المدير العام" />}
                                {user.role === 'admin' && !isSuperAdmin(user) && <BadgeCheck className="w-4 h-4 text-blue-400" title="مسؤول" />}
                                {user.role === 'moderator' && <Shield className="w-4 h-4 text-green-400" title="مشرف" />}
                                {user.activatedKey && <BadgeCheck className="w-4 h-4 text-yellow-400" title="مفعل كود اشتراك" />}
                            </td>
                            <td className="p-3 text-slate-400">{user.email}</td>
                            <td className="p-3">
                              <span className={`px-2 py-1 rounded text-xs ${user.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {user.status === 'active' ? 'نشط' : 'محظور'}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-1 rounded text-xs ${
                                isSuperAdmin(user) ? 'bg-amber-500/20 text-amber-400' :
                                user.role === 'admin' ? 'bg-blue-500/20 text-blue-400' :
                                user.role === 'moderator' ? 'bg-green-500/20 text-green-400' :
                                'bg-slate-500/20 text-slate-400'
                              }`}>
                                {isSuperAdmin(user) ? 'مدير عام' : 
                                 user.role === 'admin' ? 'مسؤول' : 
                                 user.role === 'moderator' ? 'مشرف' : 
                                 'مستخدم'}
                              </span>
                            </td>
                            <td className="p-3 flex gap-2">
                              {!isSuperAdmin(user) && (
                                <>
                                  <button 
                                    onClick={() => handleBanUser(user)}
                                    className="p-1.5 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                                    title={user.status === 'active' ? 'حظر' : 'فك الحظر'}
                                  >
                                    <Ban className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => handleBanIp(user.lastIp)}
                                    className={`p-1.5 rounded transition-colors ${bannedIps.includes(user.lastIp || '') ? 'bg-red-500 text-white' : 'hover:bg-red-500/20 text-red-400'}`}
                                    title={bannedIps.includes(user.lastIp || '') ? 'فك حظر الشبكة' : 'حظر الشبكة (IP)'}
                                  >
                                    <Wifi className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => handleBanDevice(user.deviceId)}
                                    className={`p-1.5 rounded transition-colors ${bannedDevices.includes(user.deviceId || '') ? 'bg-red-500 text-white' : 'hover:bg-red-500/20 text-red-400'}`}
                                    title={bannedDevices.includes(user.deviceId || '') ? 'فك حظر الجهاز' : 'حظر الجهاز'}
                                  >
                                    <Smartphone className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteUser(user.id)}
                                    className="p-1.5 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                                    title="حذف المستخدم"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                  
                                  {user.role === 'moderator' ? (
                                    <>
                                      <button 
                                        onClick={() => setPermissionModal({ userId: user.id, name: user.name, permissions: user.permissions || [] })}
                                        className="p-1.5 hover:bg-green-500/20 text-green-400 rounded transition-colors"
                                        title="إدارة الصلاحيات"
                                      >
                                        <Lock className="w-4 h-4" />
                                      </button>
                                      <button 
                                        onClick={() => handleRevokeModeration(user.id)}
                                        className="p-1.5 hover:bg-orange-500/20 text-orange-400 rounded transition-colors"
                                        title="سحب الإشراف"
                                      >
                                        <ShieldOff className="w-4 h-4" />
                                      </button>
                                    </>
                                  ) : (
                                    user.role === 'user' && (
                                      <button 
                                        onClick={() => setPermissionModal({ userId: user.id, name: user.name, permissions: [] })}
                                        className="p-1.5 hover:bg-indigo-500/20 text-indigo-400 rounded transition-colors"
                                        title="إعطاء إشراف"
                                      >
                                        <ShieldPlus className="w-4 h-4" />
                                      </button>
                                    )
                                  )}

                                   <div className="relative">
                                     <button 
                                       onClick={(e) => {
                                           e.stopPropagation();
                                           if (subDropdownState?.userId === user.id) {
                                               setSubDropdownState(null);
                                           } else {
                                               const rect = e.currentTarget.getBoundingClientRect();
                                               const spaceBelow = window.innerHeight - rect.bottom;
                                               const dropdownHeight = 220;
                                               if (spaceBelow < dropdownHeight && rect.top > spaceBelow) {
                                                   setSubDropdownState({ userId: user.id, x: rect.left, y: rect.top - 8, position: 'top' });
                                               } else {
                                                   setSubDropdownState({ userId: user.id, x: rect.left, y: rect.bottom + 8, position: 'bottom' });
                                               }
                                           }
                                       }}
                                       className={`p-1.5 rounded transition-colors ${user.isVIP ? 'bg-indigo-500/20 text-indigo-400' : 'hover:bg-slate-500/20 text-slate-400'}`} 
                                       title="إدارة الاشتراك"
                                     >
                                       <RefreshCw className="w-4 h-4" />
                                     </button>
                                   </div>

                                   {(user.isVIP || user.activatedKey) && (
                                     <button 
                                       onClick={() => handleRemoveSubscription(user.id)}
                                       className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all flex items-center gap-2 text-[10px] font-bold border border-red-500/20"
                                       title="إلغاء الاشتراك"
                                     >
                                       <ShieldOff className="w-3 h-3" />
                                       <span>إلغاء الاشتراك</span>
                                     </button>
                                   )}
                                  
                                  {/* Format Restriction Dropdown */}
                                  <div className="relative">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (dropdownState?.userId === user.id) {
                                                setDropdownState(null);
                                            } else {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const spaceBelow = window.innerHeight - rect.bottom;
                                                const dropdownHeight = 320; // approx max height
                                                
                                                if (spaceBelow < dropdownHeight && rect.top > spaceBelow) {
                                                    // Flip up
                                                    setDropdownState({
                                                        userId: user.id,
                                                        x: rect.left,
                                                        y: rect.top - 8,
                                                        position: 'top'
                                                    });
                                                } else {
                                                    // Down
                                                    setDropdownState({
                                                        userId: user.id,
                                                        x: rect.left,
                                                        y: rect.bottom + 8,
                                                        position: 'bottom'
                                                    });
                                                }
                                            }
                                        }}
                                        className={`p-1.5 rounded transition-colors ${user.allowedExportFormat ? 'bg-amber-500/20 text-amber-400' : 'hover:bg-slate-500/20 text-slate-400'}`} 
                                        title="تحديد صيغة التصدير"
                                    >
                                      <SettingsIcon className="w-4 h-4" />
                                    </button>
                                  </div>
                                  <button 
                                    onClick={() => handleToggleSvgaExAccess(user.id, !!user.hasSvgaExAccess)}
                                    className={`p-1.5 rounded transition-colors ${user.hasSvgaExAccess ? 'bg-red-500/20 text-red-400' : 'hover:bg-slate-500/20 text-slate-400'}`} 
                                    title={user.hasSvgaExAccess ? "إلغاء صلاحية SVGA 2.0" : "منح صلاحية SVGA 2.0"}
                                  >
                                    <BadgeCheck className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Fixed Dropdown Portal */}
              {dropdownState && (
                  <>
                      <div className="fixed inset-0 z-40" onClick={() => setDropdownState(null)}></div>
                      <div 
                          className="fixed z-50 bg-slate-800 border border-white/10 rounded-lg p-2 shadow-xl w-56 max-h-80 overflow-y-auto custom-scrollbar flex flex-col"
                          style={{ 
                              left: dropdownState.x, 
                              top: dropdownState.position === 'bottom' ? dropdownState.y : 'auto',
                              bottom: dropdownState.position === 'top' ? (window.innerHeight - dropdownState.y) : 'auto'
                          }}
                      >
                          {(() => {
                              const user = users.find(u => u.id === dropdownState.userId);
                              if (!user) return null;
                              
                              return (
                                  <>
                                      <div className="flex gap-2 mb-2 sticky top-0 bg-slate-800 pb-2 z-10 border-b border-white/10 flex-wrap">
                                          <button 
                                              onClick={() => handleSetAllowedFormat(user.id, null)}
                                              className="flex-1 text-[10px] bg-green-500/20 text-green-400 py-1.5 rounded hover:bg-green-500/30 transition-colors whitespace-nowrap"
                                          >
                                              الوضع الافتراضي
                                          </button>
                                          <button 
                                              onClick={() => handleSetAllowedFormat(user.id, EXPORT_FORMATS)}
                                              className="flex-1 text-[10px] bg-indigo-500/20 text-indigo-400 py-1.5 rounded hover:bg-indigo-500/30 transition-colors whitespace-nowrap"
                                          >
                                              تحديد الكل
                                          </button>
                                          <button 
                                              onClick={() => handleSetAllowedFormat(user.id, [])}
                                              className="flex-1 text-[10px] bg-red-500/20 text-red-400 py-1.5 rounded hover:bg-red-500/30 transition-colors whitespace-nowrap"
                                          >
                                              إلغاء التحديد
                                          </button>
                                      </div>
                                      <div className="space-y-1">
                                          {EXPORT_FORMATS.map(format => {
                                              const currentFormats = Array.isArray(user.allowedExportFormat) 
                                                  ? user.allowedExportFormat 
                                                  : (user.allowedExportFormat ? [user.allowedExportFormat] : EXPORT_FORMATS);
                                              const isSelected = currentFormats.includes(format);
                                              
                                              return (
                                                  <button 
                                                      key={format}
                                                      onClick={() => {
                                                          let newFormats = [...currentFormats];
                                                          if (isSelected) {
                                                              newFormats = newFormats.filter(f => f !== format);
                                                          } else {
                                                              newFormats.push(format);
                                                          }
                                                          handleSetAllowedFormat(user.id, newFormats);
                                                      }}
                                                      className={`w-full text-xs text-right px-2 py-1.5 hover:bg-white/10 rounded flex items-center justify-between transition-colors ${isSelected ? 'text-amber-400 font-bold bg-amber-500/10' : 'text-slate-300'}`}
                                                  >
                                                      <span>{format}</span>
                                                      {isSelected && <CheckCircle className="w-3 h-3 flex-shrink-0" />}
                                                  </button>
                                              );
                                          })}
                                      </div>
                                  </>
                              );
                          })()}
                      </div>
                  </>
              )}

              {subDropdownState && (
                  <>
                      <div className="fixed inset-0 z-40" onClick={() => setSubDropdownState(null)}></div>
                      <div 
                          className="fixed z-50 bg-slate-800 border border-white/10 rounded-lg p-1 shadow-xl w-40 flex flex-col"
                          style={{ 
                              left: subDropdownState.x, 
                              top: subDropdownState.position === 'bottom' ? subDropdownState.y : 'auto',
                              bottom: subDropdownState.position === 'top' ? (window.innerHeight - subDropdownState.y) : 'auto'
                          }}
                      >
                          {(() => {
                              const user = users.find(u => u.id === subDropdownState.userId);
                              if (!user) return null;
                              
                              return (
                                  <>
                                      <div className="px-2 py-1.5 text-[10px] text-slate-500 border-b border-white/5 mb-1">تفعيل اشتراك</div>
                                      {['day', 'week', 'month', 'year'].map(type => (
                                          <button 
                                              key={type}
                                              onClick={() => {
                                                  handleSetSubscription(user.id, type as SubscriptionType);
                                                  setSubDropdownState(null);
                                              }}
                                              className="text-xs text-right px-3 py-2 hover:bg-white/10 rounded text-slate-300 transition-colors"
                                          >
                                              تفعيل {type === 'day' ? 'يوم' : type === 'week' ? 'أسبوع' : type === 'month' ? 'شهر' : 'سنة'}
                                          </button>
                                      ))}
                                      {(user.isVIP || user.activatedKey) && (
                                          <button 
                                              onClick={() => {
                                                  handleRemoveSubscription(user.id);
                                                  setSubDropdownState(null);
                                              }}
                                              className="text-xs text-right px-3 py-2 hover:bg-red-500/20 rounded text-red-400 border-t border-white/5 mt-1 flex items-center justify-between"
                                          >
                                              <span>إزالة الاشتراك</span>
                                              <ShieldOff className="w-3 h-3" />
                                          </button>
                                      )}
                                  </>
                              );
                          })()}
                      </div>
                  </>
              )}
              {activeTab === 'keys' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold">مفاتيح الاشتراك</h3>
                    <div className="flex gap-2">
                      {['day', 'week', 'month', 'year'].map(type => (
                        <button
                          key={type}
                          onClick={() => handleGenerateKey(type as SubscriptionType)}
                          className="px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 rounded-lg text-sm transition-colors border border-indigo-500/30"
                        >
                          + مفتاح {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {keys.map(key => (
                      <div key={key.id} className="bg-slate-950/50 border border-white/10 rounded-lg p-4 flex justify-between items-center group">
                        <div>
                          <p className="font-mono text-lg tracking-wider text-indigo-300">{key.key}</p>
                          <div className="flex gap-2 text-xs text-slate-500 mt-1">
                            <span>{key.duration}</span>
                            <span>•</span>
                            <span className={key.isUsed ? 'text-red-400' : 'text-green-400'}>
                              {key.isUsed ? 'مستخدم' : 'غير مستخدم'}
                            </span>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDeleteKey(key.id)}
                          className="p-2 text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'assets' && (
                <div className="space-y-8">
                  {/* App Branding */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-950/30 border border-white/10 rounded-xl p-6">
                      <h4 className="font-bold mb-4 flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-indigo-400" />
                        شعار التطبيق (Logo)
                      </h4>
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                            {settings?.logoUrl && (
                            <img src={settings.logoUrl} alt="Logo" className="w-16 h-16 rounded-lg object-contain bg-black/20" />
                            )}
                            <label className="flex-1 cursor-pointer">
                            <div className="border-2 border-dashed border-white/10 hover:border-indigo-500/50 rounded-lg p-4 text-center transition-colors">
                                <Upload className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                                <span className="text-sm text-slate-400">اختر ملف الشعار</span>
                            </div>
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleUploadAsset(e.target.files[0], 'logo')} />
                            </label>
                        </div>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={logoUrlInput} 
                                onChange={(e) => setLogoUrlInput(e.target.value)}
                                placeholder="أو أدخل رابط الشعار مباشرة"
                                className="flex-1 bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50"
                            />
                            <button onClick={() => handleSaveAssetUrl('logo')} className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg hover:bg-indigo-500/30">
                                <LinkIcon className="w-4 h-4" />
                            </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-950/30 border border-white/10 rounded-xl p-6">
                      <h4 className="font-bold mb-4 flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-purple-400" />
                        خلفية الموقع
                      </h4>
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                            {settings?.backgroundUrl && (
                            <img src={settings.backgroundUrl} alt="Background" className="w-24 h-16 rounded-lg object-cover bg-black/20" />
                            )}
                            <label className="flex-1 cursor-pointer">
                            <div className="border-2 border-dashed border-white/10 hover:border-purple-500/50 rounded-lg p-4 text-center transition-colors">
                                <Upload className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                                <span className="text-sm text-slate-400">اختر ملف الخلفية</span>
                            </div>
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleUploadAsset(e.target.files[0], 'background')} />
                            </label>
                        </div>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={bgUrlInput} 
                                onChange={(e) => setBgUrlInput(e.target.value)}
                                placeholder="أو أدخل رابط الخلفية مباشرة"
                                className="flex-1 bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500/50"
                            />
                            <button onClick={() => handleSaveAssetUrl('background')} className="p-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30">
                                <LinkIcon className="w-4 h-4" />
                            </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Preset Backgrounds */}
                  <div>
                    <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                      <h4 className="font-bold">خلفيات الاستوديو الجاهزة</h4>
                      <div className="flex gap-2 w-full md:w-auto">
                        <div className="flex gap-2 flex-1">
                            <input 
                                type="text" 
                                value={presetUrlInput} 
                                onChange={(e) => setPresetUrlInput(e.target.value)}
                                placeholder="رابط خلفية جديدة"
                                className="flex-1 bg-slate-950/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500/50"
                            />
                            <button onClick={handleAddPresetUrl} className="px-3 py-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg text-sm hover:bg-indigo-500/30">
                                إضافة
                            </button>
                        </div>
                        <label className="cursor-pointer px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 rounded-lg text-sm transition-colors border border-indigo-500/30 flex items-center gap-2 whitespace-nowrap">
                            <Upload className="w-4 h-4" />
                            <span>رفع ملف</span>
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleUploadAsset(e.target.files[0], 'preset')} />
                        </label>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {backgrounds.map(bg => (
                        <div key={bg.id} className="group relative aspect-video rounded-lg overflow-hidden border border-white/10">
                          <img src={bg.url} alt={bg.label} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button 
                              onClick={() => handleDeletePreset(bg.id, bg.url)}
                              className="p-2 bg-red-500/20 text-red-400 rounded-full hover:bg-red-500/40 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent text-xs text-white truncate">
                            {bg.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'records' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-bold">سجلات النشاط</h3>
                      <button 
                          onClick={handleClearLogs}
                          className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-bold hover:bg-red-500/20 transition-colors flex items-center gap-2"
                      >
                          <Trash2 className="w-3 h-3" />
                          حذف السجلات
                      </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-slate-400 text-sm">
                          <th className="p-3">المستخدم</th>
                          <th className="p-3">النشاط</th>
                          <th className="p-3">الصيغة</th>
                          <th className="p-3">التفاصيل</th>
                          <th className="p-3">التاريخ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map(log => (
                          <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="p-3 font-medium text-indigo-300">{log.userName}</td>
                            <td className="p-3">
                                <span className="px-2 py-1 rounded text-xs bg-slate-800 text-slate-300 border border-white/5">
                                    {log.action}
                                </span>
                            </td>
                            <td className="p-3">
                                {log.exportFormat && (
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                                        log.exportFormat.includes('VAP') ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                        log.exportFormat.includes('GIF') ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                        log.exportFormat.includes('WebM') ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                        'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                                    }`}>
                                        {log.exportFormat}
                                    </span>
                                )}
                            </td>
                            <td className="p-3 text-slate-400 text-sm">{log.details}</td>
                            <td className="p-3 text-slate-500 text-xs font-mono">
                                {log.timestamp?.toDate 
                                  ? log.timestamp.toDate().toLocaleString('ar-EG') 
                                  : (log.timestamp ? new Date(log.timestamp).toLocaleString('ar-EG') : 'N/A')}
                            </td>
                          </tr>
                        ))}
                        {logs.length === 0 && (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-slate-500">لا توجد سجلات نشاط حتى الآن</td>
                            </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="max-w-2xl mx-auto">
                  <h3 className="text-xl font-bold mb-6">الإعدادات العامة</h3>
                  <form onSubmit={handleSaveSettings} className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">اسم التطبيق</label>
                      <input 
                        type="text" 
                        value={settings.appName} 
                        onChange={e => setSettings({ ...settings, appName: e.target.value })}
                        className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500/50 transition-colors"
                        placeholder="اسم التطبيق"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">رقم واتساب للدعم</label>
                      <input 
                        type="text" 
                        value={settings.whatsappNumber} 
                        onChange={e => setSettings({ ...settings, whatsappNumber: e.target.value })}
                        className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500/50 transition-colors"
                        placeholder="مثال: 201000000000"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">تكلفة معالجة SVGA</label>
                        <input 
                          type="number" 
                          value={settings.costs.svgaProcess} 
                          onChange={e => setSettings({ ...settings, costs: { ...settings.costs, svgaProcess: Number(e.target.value) } })}
                          className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500/50 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">تكلفة الضغط المجمع</label>
                        <input 
                          type="number" 
                          value={settings.costs.batchCompress} 
                          onChange={e => setSettings({ ...settings, costs: { ...settings.costs, batchCompress: Number(e.target.value) } })}
                          className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500/50 transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-2">عدد المحاولات المجانية الافتراضي</label>
                        <input 
                          type="number" 
                          min="0"
                          value={settings.defaultFreeAttempts} 
                          onChange={e => setSettings({ ...settings, defaultFreeAttempts: Number(e.target.value) })}
                          className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-3 focus:outline-none focus:border-indigo-500/50 transition-colors"
                        />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-slate-950/30 border border-white/10 rounded-xl">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-bold text-white">فتح التسجيل للجميع</span>
                            <span className="text-[10px] text-slate-500">عند التعطيل، لن يتمكن المستخدمون الجدد من إنشاء حسابات</span>
                        </div>
                        <button 
                            type="button"
                            onClick={() => setSettings({ ...settings, isRegistrationOpen: !settings.isRegistrationOpen })}
                            className={`w-12 h-6 rounded-full transition-all relative ${settings.isRegistrationOpen ? 'bg-green-500' : 'bg-slate-700'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.isRegistrationOpen ? 'right-7' : 'right-1'}`}></div>
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-slate-950/30 border border-white/10 rounded-xl">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-bold text-white">تفعيل SVGA 2.0 للجميع</span>
                            <span className="text-[10px] text-slate-500">عند التفعيل، سيظهر الزر لجميع المستخدمين (مع القفل إذا لم يملكوا صلاحية)</span>
                        </div>
                        <button 
                            type="button"
                            onClick={() => setSettings({ ...settings, isSvgaExEnabled: !settings.isSvgaExEnabled })}
                            className={`w-12 h-6 rounded-full transition-all relative ${settings.isSvgaExEnabled ? 'bg-red-500' : 'bg-slate-700'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.isSvgaExEnabled ? 'right-7' : 'right-1'}`}></div>
                        </button>
                    </div>

                    <div className="pt-4 border-t border-white/10">
                      <button 
                        type="submit"
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-indigo-500/20"
                      >
                        حفظ التغييرات
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateUser && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                إنشاء مستخدم جديد
              </h3>
              <button onClick={() => setShowCreateUser(false)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">الاسم</label>
                <input 
                  type="text" 
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                  placeholder="الاسم الكامل"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">البريد الإلكتروني</label>
                <input 
                  type="email" 
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                  placeholder="email@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">كلمة المرور</label>
                <input 
                  type="password" 
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">الرتبة</label>
                <select 
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as any })}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                >
                  <option value="user">مستخدم عادي</option>
                  <option value="moderator">مشرف (Moderator)</option>
                  <option value="admin">مسؤول (Admin)</option>
                </select>
              </div>

              <button 
                type="submit"
                disabled={creatingUser}
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 mt-4"
              >
                {creatingUser ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Permission Modal */}
      {permissionModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-400" />
                صلاحيات المشرف: {permissionModal.name}
              </h3>
              <button onClick={() => setPermissionModal(null)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 mb-6">
              {TABS.map(tab => (
                <label key={tab.id} className="flex items-center justify-between p-3 bg-slate-950/30 border border-white/5 rounded-xl cursor-pointer hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-3">
                    {React.cloneElement(tab.icon as React.ReactElement, { className: 'w-4 h-4 text-slate-400' })}
                    <span className="text-sm">{tab.label}</span>
                  </div>
                  <input 
                    type="checkbox"
                    checked={permissionModal.permissions.includes(tab.id)}
                    onChange={(e) => {
                      const newPerms = e.target.checked 
                        ? [...permissionModal.permissions, tab.id]
                        : permissionModal.permissions.filter(p => p !== tab.id);
                      setPermissionModal({ ...permissionModal, permissions: newPerms });
                    }}
                    className="w-5 h-5 rounded border-white/10 bg-slate-950 text-indigo-500 focus:ring-indigo-500/50"
                  />
                </label>
              ))}
            </div>

            <button 
              onClick={handleUpdatePermissions}
              className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-green-500/20 transition-all"
            >
              حفظ الصلاحيات
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex-shrink-0 lg:w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-lg transition-all ${
      active 
        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
        : 'text-slate-400 hover:bg-white/5 hover:text-white'
    }`}
  >
    {React.cloneElement(icon as React.ReactElement, { className: 'w-4 h-4 sm:w-5 sm:h-5' })}
    <span className="font-medium text-xs sm:text-sm whitespace-nowrap">{label}</span>
  </button>
);
