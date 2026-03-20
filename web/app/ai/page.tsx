'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Bot, Send, History, AlertTriangle, ShieldAlert, HeartPulse, Info } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';

interface AIResponse {
  suggestions?: string;
  precautions?: string;
  reason?: string;
  warning?: string;
  error?: string;
}

export default function AIAssistant() {
  const router = useRouter();
  const session = useAppStore((state) => state.session);
  const aiHistory = useAppStore((state) => state.aiHistory);
  const loadAIHistory = useAppStore((state) => state.loadAIHistory);
  const saveAIHistory = useAppStore((state) => state.saveAIHistory);
  
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    void loadAIHistory();
  }, [session, loadAIHistory]);

  const handleQuerySubmit = async () => {
    if (!query.trim() || !session) return;

    setIsLoading(true);
    setError('');
    setResponse(null);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ query })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get AI response');
      }

      setResponse(data);
      
      const historySummary = data.suggestions || data.reason || data.warning || 'Query answered.';
      await saveAIHistory(query, historySummary.substring(0, 100) + '...');
      setQuery('');
      
      // Reload history to show the newly saved query
      await loadAIHistory();
    } catch (e: any) {
      console.error('AI Error:', e);
      setError(e.message || 'Could not process query. Please try again.');
    } finally {
      setIsLoading(false);
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
              <p className="text-slate-600 dark:text-zinc-300">Please login with email first to use the AI Assistant.</p>
            </CardContent>
            <Button className="w-full" onClick={() => router.push('/')}>Go to Login</Button>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col flex-1 p-6 max-w-2xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-3 mt-4 mb-2">
          <div className="bg-blue-100 p-3 rounded-full dark:bg-blue-900/40">
            <Bot className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Health AI Assistant</h2>
            <p className="text-slate-500 text-sm">Personalized guidance based on your health profile</p>
          </div>
        </div>
        
        <Card className="border-2 border-slate-200 shadow-sm relative overflow-hidden">
          <CardContent className="pt-6 space-y-4">
            <textarea
              className="w-full h-32 p-4 text-lg rounded-xl border border-slate-200 bg-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none dark:bg-zinc-900 dark:border-zinc-800"
              placeholder="e.g. I have a headache, what can I take?"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={isLoading}
            />
            <Button onClick={handleQuerySubmit} isLoading={isLoading} disabled={isLoading || !query.trim()} className="w-full py-6 text-lg">
              {!isLoading && <Send className="h-5 w-5 mr-2" />}
              {isLoading ? 'Thinking...' : 'Ask AI'}
            </Button>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {response && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {response.suggestions && (
              <Card className="border-l-4 border-l-blue-500 shadow-sm bg-blue-50/50 dark:bg-blue-900/10 dark:border-l-blue-600">
                <CardContent className="p-4 flex gap-3">
                  <HeartPulse className="h-6 w-6 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-1">Suggestions</h4>
                    <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed">{response.suggestions}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {response.precautions && (
              <Card className="border-l-4 border-l-orange-500 shadow-sm bg-orange-50/50 dark:bg-orange-900/10 dark:border-l-orange-600">
                <CardContent className="p-4 flex gap-3">
                  <AlertTriangle className="h-6 w-6 text-orange-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-orange-900 dark:text-orange-300 mb-1">Precautions</h4>
                    <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed">{response.precautions}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {response.reason && (
              <Card className="border-l-4 border-l-emerald-500 shadow-sm bg-emerald-50/50 dark:bg-emerald-900/10 dark:border-l-emerald-600">
                <CardContent className="p-4 flex gap-3">
                  <Info className="h-6 w-6 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-emerald-900 dark:text-emerald-300 mb-1">Why</h4>
                    <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed">{response.reason}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {response.warning && (
              <Card className="border-l-4 border-l-red-500 shadow-sm bg-red-50/50 dark:bg-red-900/10 dark:border-l-red-600">
                <CardContent className="p-4 flex gap-3">
                  <ShieldAlert className="h-6 w-6 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-red-900 dark:text-red-300 mb-1">Warnings</h4>
                    <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed">{response.warning}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            
            <p className="text-xs text-center text-slate-400 mt-4 uppercase tracking-wider font-semibold">
              Warning: This is not medical advice. Consult a doctor for critical issues.
            </p>
          </div>
        )}

        {!response && aiHistory.length > 0 && (
          <Card className="border-2 border-slate-100 shadow-sm dark:border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center text-slate-700 dark:text-slate-300">
                <History className="h-5 w-5 mr-2" />
                Recent Queries
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {aiHistory.slice(0, 5).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50 transition-colors">
                  <p className="font-medium text-slate-800 dark:text-zinc-100 text-sm">"{entry.query}"</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400 line-clamp-2">{entry.response}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
