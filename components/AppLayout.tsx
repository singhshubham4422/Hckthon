'use client';

import React, { useEffect } from 'react';
import { Navbar } from './ui/Navbar';
import { BottomNav } from './ui/BottomNav';
import { NoSSR } from './NoSSR';
import { ThemeProvider } from './ThemeProvider';
import { useAppStore } from '../store/useStore';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const initializeAuth = useAppStore((state) => state.initializeAuth);
  const startAuthListener = useAppStore((state) => state.startAuthListener);
  const syncStatus = useAppStore((state) => state.syncStatus);
  const setSyncStatus = useAppStore((state) => state.setSyncStatus);

  useEffect(() => {
    void initializeAuth();
    const unsubscribe = startAuthListener();
    return () => {
      unsubscribe();
    };
  }, [initializeAuth, startAuthListener]);

  useEffect(() => {
    const handleOnline = () => setSyncStatus('synced');
    const handleOffline = () => setSyncStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setSyncStatus]);

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<{
        type?: string;
        data?: {
          action?: string;
          medicineId?: string;
        };
      }>;

      if (customEvent.detail?.type !== 'NATIVE_NOTIFICATION_ACTION') return;

      const action = customEvent.detail.data?.action;
      const medicineId = customEvent.detail.data?.medicineId;

      if (action !== 'MARK_TAKEN' || !medicineId) return;

      void useAppStore
        .getState()
        .logMedicineStatus(medicineId, 'taken')
        .catch((error) => {
          console.error('Failed to log taken from native action:', error);
        });
    };

    window.addEventListener('medicare-notification-action', listener as EventListener);
    return () => {
      window.removeEventListener('medicare-notification-action', listener as EventListener);
    };
  }, []);

  return (
    <NoSSR fallback={
      <div className="flex h-full flex-col bg-slate-50 text-slate-900">
        <div className="animate-pulse h-16 bg-slate-200"></div>
        <main className="flex-1 p-6">
          <div className="animate-pulse h-32 bg-slate-200 rounded-2xl mb-4"></div>
          <div className="animate-pulse h-64 bg-slate-200 rounded-2xl"></div>
        </main>
        <div className="animate-pulse h-20 bg-slate-200"></div>
      </div>
    }>
      <ThemeProvider>
        <div className="flex h-full flex-col bg-slate-50 text-slate-900 dark:bg-black dark:text-zinc-50">
          <Navbar />
          {syncStatus === 'offline' && (
            <div className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              Offline Mode Active: showing cached medicines, schedule, and AI insights.
            </div>
          )}
          <main className="flex-1 overflow-y-auto pb-24">
            {children}
          </main>
          <BottomNav />
        </div>
      </ThemeProvider>
    </NoSSR>
  );
}
