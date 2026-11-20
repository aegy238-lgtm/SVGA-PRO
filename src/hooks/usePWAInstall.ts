import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PWAInstallState {
  /** Native install prompt is ready (Chrome/Edge on Windows & Android) */
  isInstallable: boolean;
  /** Already running inside an installed PWA, Electron app, or Offline Windows Desktop app */
  isInstalled: boolean;
  /** Running on iOS Safari where manual "Add to Home Screen" is needed */
  isIOS: boolean;
  /** Trigger the native OS install prompt */
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export function usePWAInstall(): PWAInstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    const isDesktopApp = Boolean(
      (window as any).__DESKTOP_APP__?.isElectron ||
        (window as any).__MOTIONTOOLS_DESKTOP_BRANDING__
    );
    return isStandalone || isDesktopApp;
  });

  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as any).MSStream;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    };

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    mql?.addEventListener?.('change', onDisplayModeChange);
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      mql?.removeEventListener?.('change', onDisplayModeChange);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable';
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt) && !isInstalled,
    isInstalled,
    isIOS: isIOS && !isInstalled,
    install,
  };
}
