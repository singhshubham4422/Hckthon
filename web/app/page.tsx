'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { CheckCircle2, Circle, Clock, BellRing, Pencil, Trash2, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppLayout } from '@/components/AppLayout';

type AuthMode = 'signup' | 'login';

type ReactNativeWindow = Window & {
  ReactNativeWebView?: {
    postMessage: (message: string) => void;
  };
};

export default function Home() {
  const {
    session,
    medicines,
    logs,
    isAuthReady,
    authLoading,
    authError,
    authNotice,
    signUpWithEmail,
    signInWithEmail,
    clearAuthError,
    clearAuthNotice,
    logMedicineStatus,
    deleteMedicine,
  } = useAppStore();

  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [actionMedicineId, setActionMedicineId] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const todaysStatusByMedicine = useMemo(() => {
    const statusMap = new Map<string, 'taken' | 'missed'>();

    for (const log of logs) {
      if (!log.taken_at.startsWith(today)) continue;
      if (!statusMap.has(log.medicine_id)) {
        statusMap.set(log.medicine_id, log.status);
      }
    }

    return statusMap;
  }, [logs, today]);

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearAuthError();
    clearAuthNotice();

    try {
      if (authMode === 'signup') {
        await signUpWithEmail({
          name: nameInput,
          email: emailInput,
          password: passwordInput,
        });
      } else {
        await signInWithEmail({
          email: emailInput,
          password: passwordInput,
        });
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleStatusLog = async (medicineId: string, status: 'taken' | 'missed') => {
    setActionMedicineId(medicineId);
    try {
      await logMedicineStatus(medicineId, status);
    } catch (error) {
      console.error(error);
    } finally {
      setActionMedicineId(null);
    }
  };

  const handleDeleteMedicine = async (medicineId: string, medicineName: string) => {
    const shouldDelete = window.confirm(`Delete ${medicineName} from your medicines?`);
    if (!shouldDelete) return;

    setActionMedicineId(medicineId);
    try {
      await deleteMedicine(medicineId);
    } catch (error) {
      console.error(error);
    } finally {
      setActionMedicineId(null);
    }
  };

  const handleTestReminder = () => {
    if (typeof window === 'undefined') return;

    const nativeWindow = window as ReactNativeWindow;

    if (nativeWindow.ReactNativeWebView) {
      nativeWindow.ReactNativeWebView.postMessage(JSON.stringify({ 
        type: 'SCHEDULE_NOTIFICATION', 
        message: 'Time for your test medicine!' 
      }));
      alert('Native Reminder Scheduled! You will receive it in 5 seconds.');
    } else {
      alert('Web Reminder: Time for your test medicine! (Open in Expo wrapper to see native push notification)');
    }
  };

  if (!isAuthReady) {
    return (
      <AppLayout>
        <div className="p-8 text-center">Loading...</div>
      </AppLayout>
    );
  }

  if (!session) {
    return (
      <AppLayout>
        <div className="flex flex-col flex-1 p-6 items-center justify-center max-w-md mx-auto h-full">
          <Card className="w-full border-2 border-blue-100 shadow-md dark:border-blue-900">
            <CardHeader>
              <CardTitle>Welcome to MediCare</CardTitle>
              <p className="text-slate-500 text-base">
                Sign in with email to keep your profile, medicines, and logs synced.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="grid grid-cols-2 rounded-xl border border-slate-200 p-1 dark:border-zinc-800">
                <button
                  className={cn(
                    'rounded-lg py-2 text-sm font-semibold transition-colors',
                    authMode === 'login'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-900'
                  )}
                  onClick={() => setAuthMode('login')}
                  type="button"
                >
                  Login
                </button>
                <button
                  className={cn(
                    'rounded-lg py-2 text-sm font-semibold transition-colors',
                    authMode === 'signup'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-900'
                  )}
                  onClick={() => setAuthMode('signup')}
                  type="button"
                >
                  Signup
                </button>
              </div>

              <form className="space-y-3" onSubmit={handleAuthSubmit}>
                {authMode === 'signup' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={nameInput}
                      onChange={(event) => setNameInput(event.target.value)}
                      placeholder="e.g. Alex"
                      required
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={emailInput}
                    onChange={(event) => setEmailInput(event.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={passwordInput}
                    onChange={(event) => setPasswordInput(event.target.value)}
                    placeholder="At least 6 characters"
                    minLength={6}
                    required
                  />
                </div>

                <Button className="w-full" type="submit" isLoading={authLoading}>
                  {authMode === 'signup' ? 'Create Account' : 'Login'}
                </Button>
              </form>

              {authError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
                  {authError}
                </div>
              )}

              {authNotice && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
                  {authNotice}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-1 flex-col p-6 max-w-md mx-auto space-y-6">
        <section>
          <h2 className="text-2xl font-bold mb-4">Today&apos;s Medicine Status</h2>
          
          {medicines.length === 0 ? (
            <div className="text-center p-8 bg-slate-100 rounded-2xl border border-slate-200 dark:bg-zinc-900 dark:border-zinc-800">
              <CheckCircle2 className="mx-auto h-12 w-12 text-slate-400 mb-3" />
              <h3 className="text-lg font-semibold text-slate-700 dark:text-zinc-300">No medicines yet</h3>
              <p className="text-slate-500 mt-1">Add a medicine to see it here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {medicines.map((medicine) => {
                const status = todaysStatusByMedicine.get(medicine.id);
                const isTaken = status === 'taken';
                const isMissed = status === 'missed';
                const isActionLoading = actionMedicineId === medicine.id;
                
                return (
                  <Card 
                    key={medicine.id} 
                    className={cn(
                      "transition-all duration-200",
                      isTaken ? "opacity-70 bg-green-50/50 border-green-200 dark:bg-green-950/20 dark:border-green-900" 
                      : isMissed ? "bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-900" 
                      : ""
                    )}
                  >
                    <div className="p-4 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className={cn("text-xl font-bold truncate", isTaken ? "line-through text-slate-500" : "")}>{medicine.name}</h3>
                          <div className="flex items-center text-slate-500 mt-1 space-x-2">
                            <span className="font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2.5 py-0.5 rounded-full text-sm">
                              {medicine.dose}
                            </span>
                            <div className="flex items-center text-sm">
                              <Clock className="h-4 w-4 mr-1" />
                              {medicine.timing}
                            </div>
                          </div>
                          <p className="text-sm mt-1 text-slate-500 dark:text-zinc-400">Duration: {medicine.duration}</p>
                          {medicine.notes && (
                            <p className="text-sm mt-1 text-slate-500 dark:text-zinc-400">Notes: {medicine.notes}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <Link
                            href={`/add?id=${medicine.id}`}
                            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                            aria-label="Edit medicine"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => handleDeleteMedicine(medicine.id, medicine.name)}
                            className="rounded-full p-2 text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                            aria-label="Delete medicine"
                            disabled={isActionLoading}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          variant={isTaken ? 'primary' : 'outline'}
                          onClick={() => handleStatusLog(medicine.id, 'taken')}
                          isLoading={isActionLoading}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Taken
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1"
                          variant={isMissed ? 'danger' : 'outline'}
                          onClick={() => handleStatusLog(medicine.id, 'missed')}
                          isLoading={isActionLoading}
                        >
                          <Circle className="h-4 w-4 mr-2" />
                          Missed
                        </Button>
                      </div>

                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                        Today: {status ?? 'pending'}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
        
        <section className="mt-8">
          <h2 className="text-xl font-bold mb-4 text-slate-700 dark:text-zinc-300">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
             <Button variant="secondary" className="w-full text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 shadow-sm" onClick={() => window.location.href = '/ai'}>
                AI History
             </Button>
             <Button variant="outline" className="w-full text-sm bg-white dark:bg-zinc-900 shadow-sm" onClick={() => window.location.href = '/add'}>
                Add Dose
             </Button>
             <Button variant="outline" className="w-full text-sm bg-white dark:bg-zinc-900 shadow-sm" onClick={() => window.location.href = '/profile'}>
                Health Profile
             </Button>
             <Button variant="outline" className="w-full text-sm bg-white dark:bg-zinc-900 shadow-sm" onClick={() => window.location.href = '/settings'}>
               <Settings className="h-4 w-4 mr-2" />
               Settings
             </Button>
             <Button variant="outline" className="w-full text-sm border-blue-200 text-blue-700 dark:border-blue-900/50 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10 shadow-sm hover:bg-blue-100" onClick={handleTestReminder}>
                <BellRing className="h-4 w-4 mr-2" />
                Test Push Reminder
             </Button>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
