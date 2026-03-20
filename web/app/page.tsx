'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Flame,
  HeartPulse,
  Pencil,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppLayout } from '@/components/AppLayout';

type AuthMode = 'signup' | 'login';

type ReactNativeWindow = Window & {
  ReactNativeWebView?: {
    postMessage: (message: string) => void;
  };
};

const parseDurationDays = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
};

const toLocalDateString = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDateKey = (value: string): string => value.slice(0, 10);

const computeStreak = (logs: Array<{ status: 'taken' | 'missed'; taken_at: string }>): number => {
  const takenDays = new Set(logs.filter((log) => log.status === 'taken').map((log) => toDateKey(log.taken_at)));

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (true) {
    const key = toLocalDateString(cursor);
    if (!takenDays.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
};

interface MissedDoseAdvice {
  summary?: string;
  quickActions?: string[];
  precautions?: string[];
  riskLevel?: string;
  why?: string;
  warning?: string;
}

interface HealthInsightResponse {
  summary?: string;
  patterns?: string[];
  risks?: string[];
  suggestions?: string[];
  why?: string;
  warning?: string;
}

interface EmergencyResponse {
  summary?: string;
  quickActions?: string[];
  precautions?: string[];
  redFlags?: string[];
  why?: string;
  warning?: string;
}

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
    saveAIHistory,
  } = useAppStore();

  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [actionMedicineId, setActionMedicineId] = useState<string | null>(null);
  const [missedAdviceByMedicine, setMissedAdviceByMedicine] = useState<Record<string, MissedDoseAdvice>>({});
  const [healthInsights, setHealthInsights] = useState<HealthInsightResponse | null>(null);
  const [emergencyAdvice, setEmergencyAdvice] = useState<EmergencyResponse | null>(null);
  const [isInsightsLoading, setIsInsightsLoading] = useState(false);
  const [isEmergencyLoading, setIsEmergencyLoading] = useState(false);

  const today = toLocalDateString(new Date());

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

  const dashboard = useMemo(() => {
    const takenCount = logs.filter((entry) => entry.status === 'taken').length;
    const missedCount = logs.filter((entry) => entry.status === 'missed').length;
    const total = takenCount + missedCount;
    const adherence = total > 0 ? Math.round((takenCount / total) * 100) : 100;

    return {
      adherence,
      streak: computeStreak(logs),
      missedCount,
    };
  }, [logs]);

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

      if (status === 'missed' && session) {
        const missedMedicine = medicines.find((medicine) => medicine.id === medicineId);
        if (!missedMedicine) return;

        const nextReminderMinutes = Math.floor(Math.random() * 6) + 10;
        const nativeWindow = window as ReactNativeWindow;
        nativeWindow.ReactNativeWebView?.postMessage(
          JSON.stringify({
            type: 'QUICK_REMINDER',
            data: {
              id: missedMedicine.id,
              name: missedMedicine.name,
              timing: missedMedicine.timing,
              duration: parseDurationDays(missedMedicine.duration),
              startDate: missedMedicine.created_at ? missedMedicine.created_at.slice(0, 10) : today,
              minutes: nextReminderMinutes,
            },
          })
        );

        const query = `User missed ${missedMedicine.name}, what should they do?`;
        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            mode: 'missed-dose',
            query,
          }),
        });

        const data = (await response.json()) as MissedDoseAdvice;
        if (response.ok) {
          setMissedAdviceByMedicine((prev) => ({
            ...prev,
            [medicineId]: data,
          }));
          await saveAIHistory(query, data.summary || data.why || 'Missed dose guidance generated.');
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setActionMedicineId(null);
    }
  };

  const fetchHealthInsights = async () => {
    if (!session) return;

    setIsInsightsLoading(true);
    try {
      const query = 'Analyze user health pattern from medicines, logs, and past queries.';
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          mode: 'timeline',
          query,
        }),
      });

      const data = (await response.json()) as HealthInsightResponse;
      if (!response.ok) {
        throw new Error('Failed to fetch health insights.');
      }

      setHealthInsights(data);
      await saveAIHistory('Analyze user health pattern', data.summary || data.why || 'Health insights generated.');
    } catch (error) {
      console.error(error);
    } finally {
      setIsInsightsLoading(false);
    }
  };

  const fetchEmergencyAdvice = async () => {
    if (!session) return;

    setIsEmergencyLoading(true);
    try {
      const query = 'User feels unwell. Provide immediate steps.';
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          mode: 'emergency',
          query,
        }),
      });

      const data = (await response.json()) as EmergencyResponse;
      if (!response.ok) {
        throw new Error('Failed to fetch emergency guidance.');
      }

      setEmergencyAdvice(data);
      await saveAIHistory('I feel unwell - immediate steps', data.summary || data.why || 'Emergency guidance generated.');
    } catch (error) {
      console.error(error);
    } finally {
      setIsEmergencyLoading(false);
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

  const syncMedicinesToNative = useCallback(() => {
    if (typeof window === 'undefined') return;

    const nativeWindow = window as ReactNativeWindow;
    if (!nativeWindow.ReactNativeWebView) return;

    const payload = medicines.map((medicine) => ({
      id: medicine.id,
      name: medicine.name,
      timing: medicine.timing,
      duration: parseDurationDays(medicine.duration),
      startDate: medicine.created_at ? medicine.created_at.slice(0, 10) : today,
    }));

    nativeWindow.ReactNativeWebView.postMessage(
      JSON.stringify({
        type: 'SYNC_MEDICINES',
        data: payload,
      })
    );
  }, [medicines, today]);

  useEffect(() => {
    syncMedicinesToNative();
  }, [syncMedicinesToNative]);

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
        <Card className="border-2 border-teal-100 shadow-md dark:border-teal-900">
          <CardHeader>
            <CardTitle className="text-xl">Health Dashboard</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-teal-50 p-3 dark:bg-teal-900/20">
              <p className="text-xs uppercase tracking-wide text-teal-700 dark:text-teal-300">Adherence</p>
              <p className="mt-1 text-2xl font-bold text-teal-900 dark:text-teal-200">{dashboard.adherence}%</p>
            </div>
            <div className="rounded-2xl bg-orange-50 p-3 dark:bg-orange-900/20">
              <p className="text-xs uppercase tracking-wide text-orange-700 dark:text-orange-300">Streak</p>
              <p className="mt-1 inline-flex items-center gap-1 text-2xl font-bold text-orange-900 dark:text-orange-200">
                {dashboard.streak}
                <Flame className="h-5 w-5" />
              </p>
            </div>
            <div className="rounded-2xl bg-red-50 p-3 dark:bg-red-900/20">
              <p className="text-xs uppercase tracking-wide text-red-700 dark:text-red-300">Missed</p>
              <p className="mt-1 text-2xl font-bold text-red-900 dark:text-red-200">{dashboard.missedCount}</p>
            </div>
          </CardContent>
        </Card>

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

                      {isMissed && (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                          Warning: Missed dose detected. Follow AI guidance and set a reminder.
                        </div>
                      )}

                      {missedAdviceByMedicine[medicine.id] && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                          <p className="font-semibold">Missed Dose Intelligence</p>
                          <p className="mt-1">{missedAdviceByMedicine[medicine.id].summary ?? 'Guidance available.'}</p>
                          {(missedAdviceByMedicine[medicine.id].quickActions ?? []).length > 0 && (
                            <ul className="mt-2 list-disc space-y-1 pl-5">
                              {missedAdviceByMedicine[medicine.id].quickActions?.slice(0, 3).map((action) => (
                                <li key={action}>{action}</li>
                              ))}
                            </ul>
                          )}
                          {missedAdviceByMedicine[medicine.id].why && (
                            <p className="mt-2 text-xs">Why: {missedAdviceByMedicine[medicine.id].why}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <Card className="border-2 border-rose-100 shadow-md dark:border-rose-900">
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2 text-xl">
              <HeartPulse className="h-5 w-5 text-rose-600" />
              Emergency Mode
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="danger" className="w-full" onClick={fetchEmergencyAdvice} isLoading={isEmergencyLoading}>
              I feel unwell
            </Button>

            {emergencyAdvice && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-200">
                <p className="font-semibold">Immediate Steps</p>
                <p className="mt-1">{emergencyAdvice.summary}</p>
                {(emergencyAdvice.quickActions ?? []).length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {emergencyAdvice.quickActions?.slice(0, 4).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {(emergencyAdvice.precautions ?? []).length > 0 && (
                  <p className="mt-2 text-xs">Precautions: {emergencyAdvice.precautions?.join(' | ')}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-indigo-100 shadow-md dark:border-indigo-900">
          <CardHeader>
            <CardTitle className="inline-flex items-center gap-2 text-xl">
              <ShieldAlert className="h-5 w-5 text-indigo-600" />
              Health Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" onClick={fetchHealthInsights} isLoading={isInsightsLoading}>
              Analyze Health Pattern
            </Button>

            {healthInsights && (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/20 dark:text-indigo-200">
                <p className="font-semibold">{healthInsights.summary}</p>
                {(healthInsights.patterns ?? []).length > 0 && (
                  <p className="mt-2">Patterns: {healthInsights.patterns?.join(' | ')}</p>
                )}
                {(healthInsights.risks ?? []).length > 0 && (
                  <p className="mt-2 inline-flex items-center gap-1 text-red-700 dark:text-red-300">
                    <AlertTriangle className="h-4 w-4" />
                    Risks: {healthInsights.risks?.join(' | ')}
                  </p>
                )}
                {(healthInsights.suggestions ?? []).length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {healthInsights.suggestions?.slice(0, 4).map((suggestion) => (
                      <li key={suggestion}>{suggestion}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <section className="mt-8">
          <h2 className="text-xl font-bold mb-4 text-slate-700 dark:text-zinc-300">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
             <Link href="/ai">
               <Button variant="secondary" className="w-full text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 shadow-sm">
                AI History
               </Button>
             </Link>
             <Link href="/add">
               <Button variant="outline" className="w-full text-sm bg-white dark:bg-zinc-900 shadow-sm">
                Add Dose
               </Button>
             </Link>
             <Link href="/profile">
               <Button variant="outline" className="w-full text-sm bg-white dark:bg-zinc-900 shadow-sm">
                Health Profile
               </Button>
             </Link>
             <Link href="/settings">
               <Button variant="outline" className="w-full text-sm bg-white dark:bg-zinc-900 shadow-sm">Settings</Button>
             </Link>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
