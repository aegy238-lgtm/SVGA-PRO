
import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AppSettings } from '../types';

interface SettingsContextType {
  settings: AppSettings | null;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings | null>(() => {
    const cached = localStorage.getItem('appSettings');
    return cached ? JSON.parse(cached) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const docRef = doc(db, 'settings', 'global');
    
    // Initial fetch
    getDoc(docRef).then(docSnap => {
      if (docSnap.exists()) {
        const data = docSnap.data() as AppSettings;
        setSettings(data);
        localStorage.setItem('appSettings', JSON.stringify(data));
      }
      setLoading(false);
    }).catch(err => {
      console.warn("Settings fetch error:", err);
      setLoading(false);
    });

    // Real-time listener
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as AppSettings;
        setSettings(data);
        localStorage.setItem('appSettings', JSON.stringify(data));
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};
