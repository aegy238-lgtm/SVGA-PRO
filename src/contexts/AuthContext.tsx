
import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserRecord } from '../types';

// Helper to get or generate device ID
const getDeviceId = () => {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('deviceId', id);
  }
  return id;
};

// Helper to get client IP
const getClientIp = async () => {
  try {
    const res = await fetch('/api/ip');
    const data = await res.json();
    return data.ip;
  } catch (e) {
    console.warn("Could not fetch IP:", e);
    return 'unknown';
  }
};

interface AuthContextType {
  currentUser: UserRecord | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  signup: (email: string, pass: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Set up real-time listener for user document
        const userDocRef = doc(db, 'users', user.uid);
        
        // Initial fetch to ensure we have data before setting loading to false
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const userData = userDoc.data() as UserRecord;
          setCurrentUser({ ...userData, id: user.uid });
        } else {
          // Create user record if it doesn't exist
          const deviceId = getDeviceId();
          const lastIp = await getClientIp();
          const isAdmin = user.email === 'uhbijnokmpl098900@gmail.com';
          
          // Fetch settings for default free attempts
          const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
          const defaultFreeAttempts = settingsDoc.exists() ? (settingsDoc.data().defaultFreeAttempts ?? 5) : 5;
          
          const newUser: UserRecord = {
            id: user.uid,
            name: user.displayName || user.email?.split('@')[0] || 'User',
            email: user.email || undefined,
            role: isAdmin ? 'admin' : 'user',
            isApproved: true,
            isVIP: isAdmin,
            status: 'active',
            subscriptionType: isAdmin ? 'year' : 'none',
            freeAttempts: isAdmin ? 999999 : defaultFreeAttempts,
            coins: isAdmin ? 999999 : 0,
            subscriptionExpiry: isAdmin ? Timestamp.fromDate(new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)) : null,
            createdAt: Timestamp.now(),
            lastLogin: Timestamp.now(),
            deviceId,
            lastIp,
            hasSvgaExAccess: isAdmin
          };
          await setDoc(userDocRef, newUser);
          setCurrentUser(newUser);
        }

        // Start real-time listener
        unsubscribeUser = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            setCurrentUser({ ...doc.data() as UserRecord, id: user.uid });
          }
        });

      } else {
        setCurrentUser(null);
        if (unsubscribeUser) {
          unsubscribeUser();
          unsubscribeUser = null;
        }
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
    };
  }, []);

  const login = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const signup = async (email: string, pass: string, name: string) => {
    // Check if registration is open
    const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
    let defaultFreeAttempts = 5;
    if (settingsDoc.exists()) {
      const settings = settingsDoc.data();
      if (settings.isRegistrationOpen === false) {
        throw new Error('التسجيل مغلق حالياً من قبل الإدارة');
      }
      if (settings.defaultFreeAttempts !== undefined) {
        defaultFreeAttempts = settings.defaultFreeAttempts;
      }
    }

    const { user } = await createUserWithEmailAndPassword(auth, email, pass);
    const deviceId = getDeviceId();
    const lastIp = await getClientIp();
    const isAdmin = email === 'uhbijnokmpl098900@gmail.com';

    const newUser: UserRecord = {
      id: user.uid,
      name,
      email,
      role: isAdmin ? 'admin' : 'user',
      isApproved: true,
      isVIP: isAdmin,
      status: 'active',
      subscriptionType: isAdmin ? 'year' : 'none',
      freeAttempts: isAdmin ? 999999 : defaultFreeAttempts,
      coins: isAdmin ? 999999 : 0,
      subscriptionExpiry: isAdmin ? Timestamp.fromDate(new Date(Date.now() + 1000 * 60 * 60 * 24 * 365)) : null,
      createdAt: Timestamp.now(),
      lastLogin: Timestamp.now(),
      deviceId,
      lastIp,
      hasSvgaExAccess: isAdmin
    };

    await setDoc(doc(db, 'users', user.uid), newUser);
    await updateProfile(user, { displayName: name });
    setCurrentUser(newUser);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const refreshUser = async () => {
    if (auth.currentUser) {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        setCurrentUser({ ...userDoc.data() as UserRecord, id: auth.currentUser.uid });
      }
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
