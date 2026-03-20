'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { User, Heart, AlertTriangle, Plus, X } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';

const commonConditions = ['BP', 'Diabetes', 'Asthma', 'Heart Disease', 'Liver Disease', 'Kidney Disease', 'Thyroid', 'Arthritis'];
const commonAllergies = ['Penicillin', 'NSAID', 'Sulfa', 'Latex', 'Peanuts', 'Dairy', 'Gluten', 'Eggs'];

export default function ProfileSetup() {
  const router = useRouter();
  const session = useAppStore((state) => state.session);
  const user = useAppStore((state) => state.user);
  const updateUserProfile = useAppStore((state) => state.updateUserProfile);
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: '',
    conditions: [] as string[],
    allergies: [] as string[],
    customCondition: '',
    customAllergy: ''
  });
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!session) return;

    setFormData({
      name: user.name,
      age: user.age ? String(user.age) : '',
      gender: user.gender ?? '',
      conditions: [...user.conditions],
      allergies: [...user.allergies],
      customCondition: '',
      customAllergy: '',
    });
  }, [session, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }
    
    const ageNum = parseInt(formData.age);
    if (formData.age && (isNaN(ageNum) || ageNum < 1 || ageNum > 120)) {
      setError('Please enter a valid age between 1 and 120');
      return;
    }
    
    setError('');

    setIsSaving(true);
    try {
      await updateUserProfile({
        name: formData.name.trim(),
        age: formData.age ? parseInt(formData.age, 10) : undefined,
        gender: formData.gender,
        conditions: formData.conditions,
        allergies: formData.allergies,
      });

      alert('Profile updated successfully!');
      router.push('/');
    } catch (submitError) {
      console.error(submitError);
      setError('Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleCondition = (condition: string) => {
    setFormData(prev => ({
      ...prev,
      conditions: prev.conditions.includes(condition)
        ? prev.conditions.filter(c => c !== condition)
        : [...prev.conditions, condition]
    }));
  };

  const toggleAllergy = (allergy: string) => {
    setFormData(prev => ({
      ...prev,
      allergies: prev.allergies.includes(allergy)
        ? prev.allergies.filter(a => a !== allergy)
        : [...prev.allergies, allergy]
    }));
  };

  const addCustomCondition = () => {
    if (formData.customCondition.trim() && !formData.conditions.includes(formData.customCondition.trim())) {
      setFormData(prev => ({
        ...prev,
        conditions: [...prev.conditions, formData.customCondition.trim()],
        customCondition: ''
      }));
    }
  };

  const addCustomAllergy = () => {
    if (formData.customAllergy.trim() && !formData.allergies.includes(formData.customAllergy.trim())) {
      setFormData(prev => ({
        ...prev,
        allergies: [...prev.allergies, formData.customAllergy.trim()],
        customAllergy: ''
      }));
    }
  };

  if (!session) {
    return (
      <AppLayout>
        <div className="flex h-full flex-1 items-center justify-center p-6">
          <Card className="w-full max-w-md border-2 border-blue-100 p-4 shadow-md dark:border-blue-900">
            <CardHeader>
              <CardTitle>Sign in required</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600 dark:text-zinc-300">Please login with email first to manage your medical profile.</p>
            </CardContent>
            <Button className="w-full" onClick={() => router.push('/')}>Go to Login</Button>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col flex-1 p-6 max-w-md mx-auto space-y-6">
        <div className="flex items-center gap-3 mt-4 mb-2">
          <div className="bg-blue-100 p-3 rounded-full dark:bg-blue-900/40">
            <User className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Health Profile</h2>
            <p className="text-slate-500 text-sm">Help us personalize your care</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border-2 border-blue-100 dark:border-blue-900 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="e.g. Alex"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="age">Age (Optional)</Label>
                <Input
                  id="age"
                  type="number"
                  placeholder="e.g. 35"
                  value={formData.age}
                  onChange={e => setFormData({ ...formData, age: e.target.value })}
                  min="1"
                  max="120"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">Gender (Optional)</Label>
                <select
                  id="gender"
                  className="flex h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-lg outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-800 dark:bg-zinc-950"
                  value={formData.gender}
                  onChange={e => setFormData({ ...formData, gender: e.target.value })}
                >
                  <option value="">Select gender</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-amber-100 dark:border-amber-900 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Heart className="h-5 w-5 mr-2 text-amber-600" />
                Medical Conditions
              </CardTitle>
              <p className="text-sm text-slate-500">Select all that apply</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {commonConditions.map((condition) => (
                  <button
                    key={condition}
                    type="button"
                    onClick={() => toggleCondition(condition)}
                    className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                      formData.conditions.includes(condition)
                        ? 'bg-amber-500 text-white'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}
                  >
                    {condition}
                  </button>
                ))}
              </div>
              
              <div className="flex gap-2">
                <Input
                  placeholder="Add custom condition"
                  value={formData.customCondition}
                  onChange={e => setFormData({ ...formData, customCondition: e.target.value })}
                  className="flex-1"
                />
                <Button type="button" onClick={addCustomCondition} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              {formData.conditions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.conditions.map((condition) => (
                    <span
                      key={condition}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500 text-white rounded-full text-sm"
                    >
                      {condition}
                      <button
                        type="button"
                        onClick={() => toggleCondition(condition)}
                        className="ml-1 hover:bg-amber-600 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-2 border-red-100 dark:border-red-900 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-red-600" />
                Allergies
              </CardTitle>
              <p className="text-sm text-slate-500">Select all that apply</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {commonAllergies.map((allergy) => (
                  <button
                    key={allergy}
                    type="button"
                    onClick={() => toggleAllergy(allergy)}
                    className={`px-3 py-2 rounded-full text-sm font-medium transition-colors ${
                      formData.allergies.includes(allergy)
                        ? 'bg-red-500 text-white'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}
                  >
                    {allergy}
                  </button>
                ))}
              </div>
              
              <div className="flex gap-2">
                <Input
                  placeholder="Add custom allergy"
                  value={formData.customAllergy}
                  onChange={e => setFormData({ ...formData, customAllergy: e.target.value })}
                  className="flex-1"
                />
                <Button type="button" onClick={addCustomAllergy} size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              {formData.allergies.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.allergies.map((allergy) => (
                    <span
                      key={allergy}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-red-500 text-white rounded-full text-sm"
                    >
                      {allergy}
                      <button
                        type="button"
                        onClick={() => toggleAllergy(allergy)}
                        className="ml-1 hover:bg-red-600 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 dark:bg-red-900/20 dark:border-red-800 text-center font-medium">
              {error}
            </div>
          )}
          
          <div className="flex gap-4">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1"
              onClick={() => router.push('/')}
            >
              Skip
            </Button>
            <Button size="lg" className="flex-1" type="submit">
              {isSaving ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
