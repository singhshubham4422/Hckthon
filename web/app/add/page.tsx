'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { Pill, UserRound, Clock, CalendarDays } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';

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
    timing: 'Morning',
    duration: '7 Days',
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
      timing: existingMedicine.timing,
      duration: existingMedicine.duration,
      notes: existingMedicine.notes ?? '',
    });
  }, [existingMedicine]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { setError('Medicine name is required'); return; }
    if (!formData.dose.trim()) { setError('Dose is required'); return; }
    if (!formData.duration.trim()) { setError('Duration is required'); return; }
    
    setError('');
    setIsSaving(true);

    try {
      if (existingMedicine) {
        await updateMedicine(existingMedicine.id, formData);
      } else {
        await addMedicine(formData);
      }
      router.push('/');
    } catch (submitError) {
      console.error(submitError);
      setError('Unable to save medicine. Please try again.');
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
                <div className="grid grid-cols-2 gap-3">
                  {['Morning', 'Noon', 'Evening', 'Night'].map((time) => (
                    <div 
                      key={time}
                      onClick={() => setFormData({ ...formData, timing: time })}
                      className={`p-4 rounded-xl border-2 text-center text-lg font-medium transition cursor-pointer ${formData.timing === time ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30' : 'border-slate-200 text-slate-600 dark:border-zinc-800 dark:text-zinc-400'}`}
                    >
                      {time}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center text-lg gap-2 text-slate-700 dark:text-zinc-300">
                  <CalendarDays className="h-5 w-5 text-blue-500" />
                  Duration
                </Label>
                <Input
                  placeholder="e.g. 7 Days or Lifetime"
                  value={formData.duration}
                  onChange={e => setFormData({ ...formData, duration: e.target.value })}
                  required
                />
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
