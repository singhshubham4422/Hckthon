'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useAppStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { Cloud, CloudOff, Lock, Moon, ShieldCheck, Sun, Trash2 } from 'lucide-react';

function formatLastSyncTime(value: string | null): string {
  if (!value) return 'No offline cache saved yet.';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No offline cache saved yet.';

  return `Cached ${date.toLocaleString()}`;
}

export default function SettingsPage() {
  const router = useRouter();
  const session = useAppStore((state) => state.session);
  const appLockEnabled = useAppStore((state) => state.appLockEnabled);
  const theme = useAppStore((state) => state.theme);
  const syncStatus = useAppStore((state) => state.syncStatus);
  const lastOfflineSyncAt = useAppStore((state) => state.lastOfflineSyncAt);
  const setTheme = useAppStore((state) => state.setTheme);
  const setAppLockEnabled = useAppStore((state) => state.setAppLockEnabled);
  const clearOfflineCache = useAppStore((state) => state.clearOfflineCache);
  const [dataNotice, setDataNotice] = useState<string | null>(null);

  const syncText = useMemo(() => {
    if (syncStatus === 'offline') return 'Offline (using cache)';
    if (syncStatus === 'syncing') return 'Syncing with Supabase';
    return 'Synced';
  }, [syncStatus]);

  const handleClearCache = () => {
    const shouldClear = window.confirm('Clear offline cache stored on this device?');
    if (!shouldClear) return;

    clearOfflineCache();
    setDataNotice('Offline cache cleared. Fresh data will be cached after the next successful sync.');
  };

  if (!session) {
    return (
      <AppLayout>
        <div className="flex h-full flex-1 items-center justify-center p-6">
          <Card className="w-full max-w-md border-2 border-blue-100 p-4 shadow-md dark:border-blue-900">
            <CardHeader>
              <CardTitle>Sign in required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-600 dark:text-zinc-300">Please login with email first to open Settings.</p>
              <Button className="w-full" onClick={() => router.push('/')}>Go to Login</Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-6">
        <div className="mt-2">
          <h2 className="text-3xl font-bold">Settings</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">Security, appearance, and offline behavior.</p>
        </div>

        <Card className="border-2 border-blue-100 shadow-md dark:border-blue-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4 dark:border-zinc-800">
              <div>
                <p className="font-semibold text-slate-900 dark:text-zinc-100">Enable App Lock</p>
                <p className="text-sm text-slate-500 dark:text-zinc-400">
                  Use biometrics with device fallback on app launch and resume.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAppLockEnabled(!appLockEnabled)}
                className={cn(
                  'relative h-7 w-14 rounded-full transition-colors',
                  appLockEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-zinc-700'
                )}
                aria-pressed={appLockEnabled}
                aria-label="Toggle app lock"
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
                    appLockEnabled ? 'translate-x-7' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>
            <div className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-zinc-900 dark:text-zinc-300">
              {appLockEnabled ? (
                <span className="inline-flex items-center gap-2"><Lock className="h-4 w-4" /> App lock is enabled</span>
              ) : (
                <span className="inline-flex items-center gap-2"><Lock className="h-4 w-4" /> App lock is disabled</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-purple-100 shadow-md dark:border-purple-900">
          <CardHeader>
            <CardTitle className="text-xl">Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-zinc-400">Theme is stored locally and applied globally.</p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={theme === 'light' ? 'primary' : 'outline'}
                onClick={() => setTheme('light')}
                className="w-full"
              >
                <Sun className="mr-2 h-4 w-4" />
                Light
              </Button>
              <Button
                type="button"
                variant={theme === 'dark' ? 'primary' : 'outline'}
                onClick={() => setTheme('dark')}
                className="w-full"
              >
                <Moon className="mr-2 h-4 w-4" />
                Dark
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-emerald-100 shadow-md dark:border-emerald-900">
          <CardHeader>
            <CardTitle className="text-xl">Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-zinc-800">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Sync Status</p>
              <p className="mt-2 inline-flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-zinc-100">
                {syncStatus === 'offline' ? (
                  <CloudOff className="h-4 w-4 text-red-500" />
                ) : (
                  <Cloud className="h-4 w-4 text-green-500" />
                )}
                {syncText}
              </p>
              <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">{formatLastSyncTime(lastOfflineSyncAt)}</p>
            </div>

            <Button type="button" variant="outline" className="w-full" onClick={handleClearCache}>
              <Trash2 className="mr-2 h-4 w-4" />
              Clear Offline Cache
            </Button>

            {dataNotice && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
                {dataNotice}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
