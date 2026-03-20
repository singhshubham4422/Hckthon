'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { AlertTriangle, CalendarDays, Camera, Pill, UserRound, Clock } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';

type ReactNativeWindow = Window & {
  ReactNativeWebView?: {
    postMessage: (message: string) => void;
  };
};

interface RiskCheckResponse {
  summary?: string;
  conflicts?: string[];
  warnings?: string[];
  safeToProceed?: boolean;
  why?: string;
  warning?: string;
}

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

function toLocalDateString(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const [riskAlert, setRiskAlert] = useState<RiskCheckResponse | null>(null);
  const [isRiskChecking, setIsRiskChecking] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

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

  const triggerNativeSchedule = (payload: {
    id?: string;
    name: string;
    timing: string;
    duration: string;
    startDate: string;
  }) => {
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
          startDate: payload.startDate,
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
      if (!existingMedicine && session) {
        setIsRiskChecking(true);
        const riskResponse = await fetch('/api/ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            mode: 'risk-check',
            query: `Assess risk for adding medicine ${payload.name}`,
            candidateMedicine: {
              name: payload.name,
              dose: payload.dose,
              timing: payload.timing,
              notes: payload.notes,
            },
          }),
        });

        const riskData = (await riskResponse.json()) as RiskCheckResponse;
        setRiskAlert(riskData);

        if (!riskResponse.ok) {
          throw new Error('Failed to complete AI risk check.');
        }

        const hasWarnings = (riskData.warnings ?? []).length > 0 || (riskData.conflicts ?? []).length > 0;
        if (hasWarnings) {
          const confirmed = window.confirm(
            `AI Risk Alert: ${(riskData.warnings ?? riskData.conflicts ?? ['Potential conflict detected.'])[0]}\n\nContinue adding anyway?`
          );
          if (!confirmed) {
            setIsSaving(false);
            return;
          }
        }
      }

      if (existingMedicine) {
        await updateMedicine(existingMedicine.id, payload);
        triggerNativeSchedule({
          id: existingMedicine.id,
          name: payload.name,
          timing: payload.timing,
          duration: payload.duration,
          startDate: existingMedicine.created_at
            ? existingMedicine.created_at.slice(0, 10)
            : toLocalDateString(new Date()),
        });
      } else {
        await addMedicine(payload);
        triggerNativeSchedule({
          name: payload.name,
          timing: payload.timing,
          duration: payload.duration,
          startDate: toLocalDateString(new Date()),
        });
      }
      router.push('/');
    } catch (submitError) {
      console.error(submitError);
      setError(submitError instanceof Error ? submitError.message : 'Unable to save medicine. Please try again.');
    } finally {
      setIsSaving(false);
      setIsRiskChecking(false);
    }
  };

  const handleSimulatedScan = () => {
    setIsScanning(true);
    const simulatedMeds = [
      { name: 'Paracetamol 500', dose: '500mg' },
      { name: 'Amlodipine 5', dose: '5mg' },
      { name: 'Metformin 500', dose: '500mg' },
      { name: 'Atorvastatin 10', dose: '10mg' },
    ];

    const picked = simulatedMeds[Math.floor(Math.random() * simulatedMeds.length)];
    window.setTimeout(() => {
      setFormData((prev) => ({
        ...prev,
        name: picked.name,
        dose: prev.dose || picked.dose,
        notes: prev.notes || 'Scanned using Smart Medicine Scanner (simulated).',
      }));
      setIsScanning(false);
    }, 1200);
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

        {!existingMedicine && (
          <Card className="border-2 border-indigo-100 dark:border-indigo-900 shadow-md">
            <CardContent className="space-y-3 pt-5">
              <div className="rounded-2xl border border-dashed border-indigo-300 bg-indigo-50 p-4 text-center dark:border-indigo-800 dark:bg-indigo-950/20">
                <Camera className="mx-auto h-8 w-8 text-indigo-600" />
                <p className="mt-2 text-sm font-semibold text-indigo-800 dark:text-indigo-200">Smart Medicine Scanner</p>
                <p className="text-xs text-indigo-700 dark:text-indigo-300">Camera placeholder for hackathon demo. Simulates OCR autofill.</p>
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={handleSimulatedScan} isLoading={isScanning}>
                {isScanning ? 'Scanning...' : 'Scan Medicine'}
              </Button>
            </CardContent>
          </Card>
        )}
        
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

          {riskAlert && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              <p className="inline-flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                AI Risk Alerts
              </p>
              {riskAlert.summary && <p className="mt-2">{riskAlert.summary}</p>}
              {(riskAlert.conflicts ?? []).length > 0 && <p className="mt-2">Conflicts: {riskAlert.conflicts?.join(' | ')}</p>}
              {(riskAlert.warnings ?? []).length > 0 && <p className="mt-2">Warnings: {riskAlert.warnings?.join(' | ')}</p>}
              {riskAlert.why && <p className="mt-2 text-xs">Why: {riskAlert.why}</p>}
            </div>
          )}
          
          <Button size="lg" className="w-full h-16 text-xl rounded-2xl shadow-lg" type="submit" isLoading={isSaving || isRiskChecking}>
            {existingMedicine ? 'Update Medicine' : 'Save Medicine'}
          </Button>
        </form>
      </div>
    </AppLayout>
  );
}
