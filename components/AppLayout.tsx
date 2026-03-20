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

  useEffect(() => {
    void initializeAuth();
    const unsubscribe = startAuthListener();
    return () => {
      unsubscribe();
    };
  }, [initializeAuth, startAuthListener]);

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
          <main className="flex-1 overflow-y-auto pb-24">
            {children}
          </main>
          <BottomNav />
        </div>
      </ThemeProvider>
    </NoSSR>
  );
}
