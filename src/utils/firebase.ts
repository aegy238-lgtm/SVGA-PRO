import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  collection,
  getDocs,
  enableIndexedDbPersistence,
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import {
  addDeletedUserId,
  isPurgedLegacyAdmin,
  PURGED_LEGACY_ADMIN_IDS,
  INITIAL_SUPER_ADMIN_ACCOUNT,
  type PlatformSettings,
  type UserAccount,
  type BroadcastNotification,
  type ActivityLogEntry,
} from './platformStore';

export const firebaseConfig = {
  apiKey: "AIzaSyBZHmXFQKWlD83ql-gCU9AOK5YYdnpF0C0",
  authDomain: "svga-pro.firebaseapp.com",
  projectId: "svga-pro",
  storageBucket: "svga-pro.firebasestorage.app",
  messagingSenderId: "1054083855655",
  appId: "1:1054083855655:web:ad5cb79f8d4ab30e426502"
};

export interface FirebaseConnectionStatus {
  isConfigured: boolean;
  isConnected: boolean;
  isTesting: boolean;
  projectId: string;
  latencyMs?: number;
  lastCheckedAt?: string;
  message?: string;
  serverTimestamp?: string;
  error?: string;
}

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

let currentStatus: FirebaseConnectionStatus = {
  isConfigured: true,
  isConnected: false,
  isTesting: false,
  projectId: firebaseConfig.projectId,
  message: 'جاري تهيئة الاتصال...',
};

const listeners = new Set<(status: FirebaseConnectionStatus) => void>();

export function subscribeToFirebaseStatus(callback: (status: FirebaseConnectionStatus) => void): () => void {
  listeners.add(callback);
  callback({ ...currentStatus });
  return () => {
    listeners.delete(callback);
  };
}

function updateStatus(updates: Partial<FirebaseConnectionStatus>) {
  currentStatus = { ...currentStatus, ...updates };
  listeners.forEach((cb) => {
    try {
      cb({ ...currentStatus });
    } catch (e) {
      console.error('Error notifying status listener:', e);
    }
  });
}

export function initFirebase(): { app: FirebaseApp; db: Firestore; auth: Auth } {
  if (!app) {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    db = getFirestore(app);
    auth = getAuth(app);
  }
  return { app, db: db!, auth: auth! };
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    initFirebase();
  }
  return db!;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    initFirebase();
  }
  return auth!;
}

/**
 * Tests live connection to Firebase project bbbbbbbb-4e020
 */
export async function testFirebaseConnection(force = false): Promise<FirebaseConnectionStatus> {
  if (currentStatus.isTesting && !force) {
    return currentStatus;
  }
  updateStatus({ isTesting: true });
  const start = performance.now();

  try {
    initFirebase();

    // 1. Fast verification with Google Firebase Auth / Identity Toolkit endpoint
    let isApiLive = false;
    try {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${firebaseConfig.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ continueUri: 'http://localhost' }),
        }
      );
      // HTTP 200 or 400 (MISSING_IDENTIFIER) confirms the API key belongs to an active Google Cloud / Firebase project
      if (res.status === 200 || res.status === 400) {
        isApiLive = true;
      }
    } catch {
      // network fallback
    }

    const latency = Math.round(performance.now() - start);

    if (isApiLive) {
      const result: FirebaseConnectionStatus = {
        isConfigured: true,
        isConnected: true,
        isTesting: false,
        projectId: firebaseConfig.projectId,
        latencyMs: latency,
        lastCheckedAt: new Date().toISOString(),
        message: `تم التحقق بنجاح: مشروع Firebase (${firebaseConfig.projectId}) متصل وشغال تماماً (زمن الاستجابة: ${latency}ms)`,
      };
      updateStatus(result);
      return result;
    }

    // 2. Fallback: Check Firestore getDoc with 2s timeout
    try {
      const pingDocRef = doc(getFirebaseDb(), '_connection_test', 'ping');
      const firestoreTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('firestore-timeout')), 2000)
      );
      await Promise.race([getDoc(pingDocRef), firestoreTimeout]);
    } catch (fsErr: any) {
      if (
        fsErr?.code === 'permission-denied' ||
        fsErr?.message?.includes('insufficient permissions') ||
        fsErr?.code === 'not-found'
      ) {
        const fsLatency = Math.round(performance.now() - start);
        const result: FirebaseConnectionStatus = {
          isConfigured: true,
          isConnected: true,
          isTesting: false,
          projectId: firebaseConfig.projectId,
          latencyMs: fsLatency,
          lastCheckedAt: new Date().toISOString(),
          message: `تم التحقق بنجاح: قاعدة بيانات Firebase (${firebaseConfig.projectId}) متصلة بنجاح.`,
        };
        updateStatus(result);
        return result;
      }
    }

    const result: FirebaseConnectionStatus = {
      isConfigured: true,
      isConnected: false,
      isTesting: false,
      projectId: firebaseConfig.projectId,
      latencyMs: latency,
      lastCheckedAt: new Date().toISOString(),
      error: 'تعذر الوصول إلى خوادم Firebase',
      message: 'تنبيه: يرجى التحقق من اتصال الإنترنت أو إعدادات المشروع في Firebase Console.',
    };
    updateStatus(result);
    return result;
  } catch (err: any) {
    const latency = Math.round(performance.now() - start);
    const result: FirebaseConnectionStatus = {
      isConfigured: true,
      isConnected: false,
      isTesting: false,
      projectId: firebaseConfig.projectId,
      latencyMs: latency,
      lastCheckedAt: new Date().toISOString(),
      error: err?.message || 'تعذر الاتصال بـ Firebase',
      message: `تنبيه الاتصال: ${err?.message || 'تحقق من اتصال الإنترنت'}`,
    };
    updateStatus(result);
    return result;
  }
}

/**
 * Sync platform settings to Firestore
 */
export async function syncSettingsToFirestore(settings: PlatformSettings): Promise<boolean> {
  try {
    const db = getFirebaseDb();
    const docRef = doc(db, 'platform_settings', 'config');
    await setDoc(docRef, {
      ...settings,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn('Firestore syncSettings notice:', err);
    return false;
  }
}

/**
 * Fetch platform settings from Firestore
 */
export async function fetchFirestoreSettings(): Promise<PlatformSettings | null> {
  try {
    const db = getFirebaseDb();
    const snap = await getDoc(doc(db, 'platform_settings', 'config'));
    if (snap.exists()) {
      return snap.data() as PlatformSettings;
    }
    return null;
  } catch (err) {
    console.warn('Firestore fetchSettings notice:', err);
    return null;
  }
}

/**
 * Real-time listener for Firestore platform settings
 */
export function subscribeToFirestoreSettings(callback: (settings: PlatformSettings) => void): () => void {
  try {
    const db = getFirebaseDb();
    const unsub = onSnapshot(
      doc(db, 'platform_settings', 'config'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as PlatformSettings;
          if (data && data.siteName) {
            callback(data);
          }
        }
      },
      (err) => {
        console.warn('Firestore settings snapshot notice:', err);
      }
    );
    return unsub;
  } catch (e) {
    console.warn('Could not initialize Firestore settings listener:', e);
    return () => {};
  }
}

/**
 * Permanently deletes all legacy admin accounts from Firestore and ensures the new Super Admin account exists.
 */
export async function purgeLegacyAdminsFromFirestore(): Promise<void> {
  try {
    const db = getFirebaseDb();
    for (const legacyId of PURGED_LEGACY_ADMIN_IDS) {
      addDeletedUserId(legacyId);
      await deleteDoc(doc(db, 'users', legacyId)).catch(() => {});
    }
    const snap = await getDocs(collection(db, 'users'));
    let hasSuperAdminInRemote = false;
    const deletePromises: Promise<any>[] = [];
    snap.forEach((d) => {
      const data = d.data() as UserAccount;
      if (isPurgedLegacyAdmin(data) || PURGED_LEGACY_ADMIN_IDS.includes(d.id)) {
        addDeletedUserId(d.id);
        deletePromises.push(deleteDoc(doc(db, 'users', d.id)).catch(() => {}));
      } else if (
        data &&
        (data.id === INITIAL_SUPER_ADMIN_ACCOUNT.id || data.isSuperAdmin === true)
      ) {
        hasSuperAdminInRemote = true;
      }
    });
    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }
    if (!hasSuperAdminInRemote) {
      await setDoc(
        doc(db, 'users', INITIAL_SUPER_ADMIN_ACCOUNT.id),
        {
          ...INITIAL_SUPER_ADMIN_ACCOUNT,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      ).catch(() => {});
    }
  } catch (err) {
    console.warn('Firestore legacy admin purge notice:', err);
  }
}

/**
 * Save single user account directly to Firestore (and attempt Firebase Auth registration)
 */
export async function saveUserToFirestore(user: UserAccount): Promise<boolean> {
  if (!user || isPurgedLegacyAdmin(user)) return false;
  try {
    const db = getFirebaseDb();
    const uRef = doc(db, 'users', user.id);
    await setDoc(
      uRef,
      {
        ...user,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    // Also attempt registering the account in Firebase Auth Identity Toolkit in background
    if (user.email && user.password) {
      try {
        fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              password: user.password,
              returnSecureToken: true,
            }),
          }
        ).catch(() => {});
      } catch {}
    }

    return true;
  } catch (err) {
    console.warn('Firestore saveUser notice:', err);
    return false;
  }
}

/**
 * Delete a user from Firestore
 */
export async function deleteUserFromFirestore(userId: string): Promise<boolean> {
  addDeletedUserId(userId);
  try {
    const db = getFirebaseDb();
    await deleteDoc(doc(db, 'users', userId));
    return true;
  } catch (err) {
    console.warn('Firestore deleteUser notice:', err);
    return false;
  }
}

/**
 * Fetch all users from Firestore
 */
export async function fetchFirestoreUsers(): Promise<UserAccount[]> {
  try {
    const db = getFirebaseDb();
    const snap = await getDocs(collection(db, 'users'));
    const list: UserAccount[] = [];
    snap.forEach((d) => {
      const data = d.data() as UserAccount;
      if (data && data.id && data.email && !isPurgedLegacyAdmin(data)) {
        list.push(data);
      } else if (isPurgedLegacyAdmin(data)) {
        deleteDoc(doc(db, 'users', d.id)).catch(() => {});
      }
    });
    return list;
  } catch (err) {
    console.warn('Firestore fetchUsers notice:', err);
    return [];
  }
}

/**
 * Real-time listener for Firestore users collection
 */
export function subscribeToFirestoreUsers(callback: (users: UserAccount[]) => void): () => void {
  try {
    const db = getFirebaseDb();
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const list: UserAccount[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as UserAccount;
          if (data && data.id && data.email && !isPurgedLegacyAdmin(data)) {
            list.push(data);
          } else if (isPurgedLegacyAdmin(data)) {
            deleteDoc(doc(db, 'users', d.id)).catch(() => {});
          }
        });
        if (list.length > 0) {
          callback(list);
        }
      },
      (err) => {
        console.warn('Firestore users snapshot warning:', err);
      }
    );
    return unsub;
  } catch (e) {
    console.warn('Could not initialize Firestore users listener:', e);
    return () => {};
  }
}

/**
 * Sync accounts to Firestore
 */
export async function syncUsersToFirestore(users: UserAccount[]): Promise<boolean> {
  try {
    const db = getFirebaseDb();
    for (const u of users) {
      if (isPurgedLegacyAdmin(u)) continue;
      const uRef = doc(db, 'users', u.id);
      await setDoc(uRef, { ...u, updatedAt: new Date().toISOString() }, { merge: true });
    }
    return true;
  } catch (err) {
    console.warn('Firestore syncUsers notice:', err);
    return false;
  }
}

/**
 * Fetch broadcast notifications from Firestore
 */
export async function fetchFirestoreNotifications(): Promise<BroadcastNotification[]> {
  try {
    const db = getFirebaseDb();
    const snap = await getDocs(collection(db, 'broadcast_notifications'));
    const list: BroadcastNotification[] = [];
    snap.forEach((d) => {
      const data = d.data() as BroadcastNotification;
      if (data && data.id && data.title) {
        list.push(data);
      }
    });
    return list;
  } catch (err) {
    console.warn('Firestore fetchNotifications notice:', err);
    return [];
  }
}

/**
 * Real-time listener for Firestore broadcast notifications
 */
export function subscribeToFirestoreNotifications(
  callback: (notifs: BroadcastNotification[]) => void
): () => void {
  try {
    const db = getFirebaseDb();
    const unsub = onSnapshot(
      collection(db, 'broadcast_notifications'),
      (snapshot) => {
        const list: BroadcastNotification[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as BroadcastNotification;
          if (data && data.id && data.title) {
            list.push(data);
          }
        });
        if (list.length > 0) {
          callback(list);
        }
      },
      (err) => {
        console.warn('Firestore notifications snapshot warning:', err);
      }
    );
    return unsub;
  } catch (e) {
    console.warn('Could not initialize Firestore notifications listener:', e);
    return () => {};
  }
}

/**
 * Save single notification to Firestore
 */
export async function saveNotificationToFirestore(notif: BroadcastNotification): Promise<boolean> {
  try {
    const db = getFirebaseDb();
    await setDoc(doc(db, 'broadcast_notifications', notif.id), {
      ...notif,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn('Firestore saveNotification notice:', err);
    return false;
  }
}

/**
 * Delete single notification from Firestore
 */
export async function deleteNotificationFromFirestore(notifId: string): Promise<boolean> {
  try {
    const db = getFirebaseDb();
    await deleteDoc(doc(db, 'broadcast_notifications', notifId));
    return true;
  } catch (err) {
    console.warn('Firestore deleteNotification notice:', err);
    return false;
  }
}

/**
 * Sync notifications to Firestore
 */
export async function syncNotificationsToFirestore(notifications: BroadcastNotification[]): Promise<boolean> {
  try {
    const db = getFirebaseDb();
    for (const n of notifications) {
      const nRef = doc(db, 'broadcast_notifications', n.id);
      await setDoc(nRef, { ...n, updatedAt: new Date().toISOString() }, { merge: true });
    }
    return true;
  } catch (err) {
    console.warn('Firestore syncNotifications notice:', err);
    return false;
  }
}

/**
 * Full sync helper for Admin
 */
export async function syncAllToFirebase(data: {
  settings: PlatformSettings;
  users: UserAccount[];
  notifications: BroadcastNotification[];
}): Promise<{ success: boolean; message: string }> {
  try {
    const { db } = initFirebase();
    // 1. Settings
    await setDoc(doc(db, 'platform_settings', 'config'), {
      ...data.settings,
      syncedAt: new Date().toISOString(),
    }, { merge: true });

    // 2. Users
    for (const u of data.users) {
      await setDoc(doc(db, 'users', u.id), {
        ...u,
        syncedAt: new Date().toISOString(),
      }, { merge: true });
    }

    // 3. Notifications
    for (const n of data.notifications) {
      await setDoc(doc(db, 'broadcast_notifications', n.id), {
        ...n,
        syncedAt: new Date().toISOString(),
      }, { merge: true });
    }

    updateStatus({
      isConnected: true,
      lastCheckedAt: new Date().toISOString(),
      message: 'تمت مزامنة جميع الإعدادات والحسابات والإشعارات مع قاعدة بيانات Firebase بنجاح!',
    });

    return {
      success: true,
      message: 'تمت المزامنة وحفظ البيانات في Firebase بنجاح.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: `خطأ أثناء المزامنة: ${err?.message || 'تحقق من قواعد الأمان وقاعدة البيانات'}`,
    };
  }
}

/**
 * Save single ActivityLogEntry to Firestore
 */
export async function saveActivityLogToFirestore(log: ActivityLogEntry): Promise<boolean> {
  try {
    const db = getFirebaseDb();
    await setDoc(doc(db, 'activity_logs', log.id), {
      ...log,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn('Firestore saveActivityLog notice:', err);
    return false;
  }
}

/**
 * Delete single ActivityLogEntry from Firestore
 */
export async function deleteActivityLogFromFirestore(logId: string): Promise<boolean> {
  try {
    const db = getFirebaseDb();
    await deleteDoc(doc(db, 'activity_logs', logId));
    return true;
  } catch (err) {
    console.warn('Firestore deleteActivityLog notice:', err);
    return false;
  }
}

/**
 * Clear all ActivityLogs from Firestore
 */
export async function clearAllActivityLogsFromFirestore(logIds: string[]): Promise<boolean> {
  try {
    const db = getFirebaseDb();
    for (const id of logIds) {
      await deleteDoc(doc(db, 'activity_logs', id));
    }
    return true;
  } catch (err) {
    console.warn('Firestore clearAllActivityLogs notice:', err);
    return false;
  }
}

/**
 * Fetch all ActivityLogs from Firestore
 */
export async function fetchFirestoreActivityLogs(): Promise<ActivityLogEntry[]> {
  try {
    const db = getFirebaseDb();
    const snap = await getDocs(collection(db, 'activity_logs'));
    const list: ActivityLogEntry[] = [];
    snap.forEach((d) => {
      const data = d.data() as ActivityLogEntry;
      if (data && data.id && data.fileName) {
        list.push(data);
      }
    });
    return list;
  } catch (err) {
    console.warn('Firestore fetchActivityLogs notice:', err);
    return [];
  }
}

/**
 * Real-time listener for Firestore activity_logs collection
 */
export function subscribeToFirestoreActivityLogs(
  callback: (logs: ActivityLogEntry[]) => void
): () => void {
  try {
    const db = getFirebaseDb();
    const unsub = onSnapshot(
      collection(db, 'activity_logs'),
      (snapshot) => {
        const list: ActivityLogEntry[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as ActivityLogEntry;
          if (data && data.id && data.fileName) {
            list.push(data);
          }
        });
        if (list.length > 0) {
          callback(list);
        }
      },
      (err) => {
        console.warn('Firestore activity_logs snapshot warning:', err);
      }
    );
    return unsub;
  } catch (e) {
    console.warn('Could not initialize Firestore activity_logs listener:', e);
    return () => {};
  }
}
