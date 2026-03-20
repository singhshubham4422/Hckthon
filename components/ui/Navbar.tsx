'use client';

import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useStore';
import { Moon, Sun, Cloud, CloudOff, LogOut } from 'lucide-react';

export function Navbar() {
  const isSetup = useAppStore((state) => state.user.isSetup);
  const user = useAppStore((state) => state.user);
  const theme = useAppStore((state) => state.theme);
  const syncStatus = useAppStore((state) => state.syncStatus);
  const authLoading = useAppStore((state) => state.authLoading);
  const setTheme = useAppStore((state) => state.setTheme);
  const setSyncStatus = useAppStore((state) => state.setSyncStatus);
  const signOut = useAppStore((state) => state.signOut);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    setSyncStatus(navigator.onLine ? 'synced' : 'offline');

    const handleOnline = () => setSyncStatus('synced');
    const handleOffline = () => setSyncStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setSyncStatus]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSigningOut(false);
    }
  };

  if (!isSetup) {
    return (
      <header className="flex h-16 items-center border-b border-slate-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-950 px-safe">
        <h1 className="text-xl font-bold tracking-tight text-blue-600 dark:text-blue-500">MediCare</h1>
      </header>
    );
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 pt-safe dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col">
        <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Good Morning,</span>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">{user.name}</h1>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-zinc-900 rounded-full text-[10px] font-bold tracking-wide uppercase text-slate-600 dark:text-zinc-400">
          {syncStatus === 'syncing' && <><Cloud className="h-3 w-3 mr-1.5 animate-pulse text-blue-500" /> Syncing</>}
          {syncStatus === 'synced' && <><Cloud className="h-3 w-3 mr-1.5 text-green-500" /> Synced</>}
          {syncStatus === 'offline' && <><CloudOff className="h-3 w-3 mr-1.5 text-red-500" /> Offline</>}
        </div>
        
        <button onClick={toggleTheme} className="rounded-full bg-slate-100 p-2.5 text-slate-500 transition-colors hover:bg-slate-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800">
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <button
          onClick={handleSignOut}
          disabled={authLoading || isSigningOut}
          className="rounded-full bg-slate-100 p-2.5 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          aria-label="Sign out"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
