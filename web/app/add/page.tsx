'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { Pill, UserRound, Clock, CalendarDays } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';

type ReactNativeWindow = Window & {
  ReactNativeWebView?: {
    postMessage: (message: string) => void;
  };
};

const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const LEGACY_TIMING_MAP: Record<string, string> = {
  morning: '08:00',
  noon: '12:00',
  afternoon: '14:00',
  evening: '18:00',
  night: '21:00',
  bedtime: '22:00',
};

function normalizeTimingForForm(value: string): string {
  const trimmed = value.trim();
  if (HHMM_REGEX.test(trimmed)) {
    return trimmed;
  }

  const legacy = LEGACY_TIMING_MAP[trimmed.toLowerCase()];
  if (legacy) {
    return legacy;
  }

  return '08:00';
}

function normalizeDurationForForm(value: string): string {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return '7';
  }

  return String(parsed);
}

export default function AddMedicine() {
  const router = useRouter();
  const session = useAppStore((state) => state.session);
  const medicines = useAppStore((state) => state.medicines);
  const addMedicine = useAppStore((state) => state.addMedicine);
  const updateMedicine = useAppStore((state) => state.updateMedicine);
  const [medicineId, setMedicineId] = useState<string | null>(null);
  const existingMedicine = useMemo(
    () => medicines.find((medicine) => medicine.id === medicineId),
    [medicineId, medicines]
  );

  const [formData, setFormData] = useState({
    name: '',
    dose: '',
    timing: '08:00',
    duration: '7',
    notes: '',
  });
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setMedicineId(params.get('id'));
  }, []);

  useEffect(() => {
    if (!existingMedicine) return;

    setFormData({
      name: existingMedicine.name,
      dose: existingMedicine.dose,
      timing: normalizeTimingForForm(existingMedicine.timing),
      duration: normalizeDurationForForm(existingMedicine.duration),
      notes: existingMedicine.notes ?? '',
    });
  }, [existingMedicine]);

  const triggerNativeSchedule = (payload: { id?: string; name: string; timing: string; duration: string }) => {
    if (typeof window === 'undefined') return;

    const nativeWindow = window as ReactNativeWindow;
    nativeWindow.ReactNativeWebView?.postMessage(
      JSON.stringify({
        type: 'SCHEDULE_NOTIFICATION',
        data: {
          id: payload.id,
          name: payload.name,
          timing: payload.timing,
          duration: Number.parseInt(payload.duration, 10),
        },
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formData.name.trim();
    const cleanDose = formData.dose.trim();
    const cleanTiming = formData.timing.trim();
    const cleanDuration = Number.parseInt(formData.duration, 10);

    if (!cleanName) { setError('Medicine name is required'); return; }
    if (!cleanDose) { setError('Dose is required'); return; }
    if (!HHMM_REGEX.test(cleanTiming)) {
      setError('Timing must be in HH:mm format (for example: 08:00).');
      return;
    }
    if (Number.isNaN(cleanDuration) || cleanDuration <= 0) {
      setError('Duration must be a valid number of days.');
      return;
    }

    const payload = {
      name: cleanName,
      dose: cleanDose,
      timing: cleanTiming,
      duration: String(cleanDuration),
      notes: formData.notes.trim(),
    };
    
    setError('');
    setIsSaving(true);

    try {
      if (existingMedicine) {
        await updateMedicine(existingMedicine.id, payload);
        triggerNativeSchedule({
          id: existingMedicine.id,
          name: payload.name,
          timing: payload.timing,
          duration: payload.duration,
        });
      } else {
        await addMedicine(payload);
        triggerNativeSchedule({
          name: payload.name,
          timing: payload.timing,
          duration: payload.duration,
        });
      }
      router.push('/');
    } catch (submitError) {
      console.error(submitError);
      setError(submitError instanceof Error ? submitError.message : 'Unable to save medicine. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!session) {
    return (
      <AppLayout>
        <div className="flex h-full flex-1 items-center justify-center p-6">
          <Card className="w-full max-w-md border-2 border-blue-100 p-4 shadow-md dark:border-blue-900">
            <CardContent className="space-y-4 pt-6">
              <h2 className="text-xl font-bold">Sign in required</h2>
              <p className="text-slate-600 dark:text-zinc-300">Please login with email first before managing medicines.</p>
              <Button className="w-full" onClick={() => router.push('/')}>Go to Login</Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col flex-1 p-6 max-w-md mx-auto space-y-6">
        <h2 className="text-3xl font-bold mt-4 mb-2">{existingMedicine ? 'Update Medicine' : 'Add Medicine'}</h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="p-2 border-2 border-blue-100 dark:border-blue-900 shadow-md">
            <CardContent className="space-y-5 pt-4">
              <div className="space-y-2">
                <Label className="flex items-center text-lg gap-2 text-slate-700 dark:text-zinc-300">
                  <Pill className="h-5 w-5 text-blue-500" />
                  Medicine Name
                </Label>
                <Input
                  placeholder="e.g. Paracetamol"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label className="flex items-center text-lg gap-2 text-slate-700 dark:text-zinc-300">
                  <UserRound className="h-5 w-5 text-blue-500" />
                  Dose
                </Label>
                <Input
                  placeholder="e.g. 500mg or 1 Tablet"
                  value={formData.dose}
                  onChange={e => setFormData({ ...formData, dose: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center text-lg gap-2 text-slate-700 dark:text-zinc-300">
                  <Clock className="h-5 w-5 text-blue-500" />
                  Timing
                </Label>
                <Input
                  type="time"
                  value={formData.timing}
                  onChange={(e) => setFormData({ ...formData, timing: e.target.value })}
                  required
                />
                <p className="text-sm text-slate-500 dark:text-zinc-400">Use 24-hour time in HH:mm format.</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center text-lg gap-2 text-slate-700 dark:text-zinc-300">
                  <CalendarDays className="h-5 w-5 text-blue-500" />
                  Duration
                </Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder="e.g. 7"
                  value={formData.duration}
                  onChange={e => setFormData({ ...formData, duration: e.target.value })}
                  required
                />
                <p className="text-sm text-slate-500 dark:text-zinc-400">Duration in days.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-700 dark:text-zinc-300">Notes (Optional)</Label>
                <Input
                  placeholder="e.g. Take after food"
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 dark:bg-red-900/20 dark:border-red-800 text-center font-medium">
              {error}
            </div>
          )}
          
          <Button size="lg" className="w-full h-16 text-xl rounded-2xl shadow-lg" type="submit" isLoading={isSaving}>
            {existingMedicine ? 'Update Medicine' : 'Save Medicine'}
          </Button>
        </form>
      </div>
    </AppLayout>
  );
}
