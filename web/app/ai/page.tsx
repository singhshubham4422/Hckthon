'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useStore';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Bot, Send, History } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';

export default function AIAssistant() {
  const router = useRouter();
  const session = useAppStore((state) => state.session);
  const aiHistory = useAppStore((state) => state.aiHistory);
  const loadAIHistory = useAppStore((state) => state.loadAIHistory);
  const saveAIHistory = useAppStore((state) => state.saveAIHistory);
  const [query, setQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!session) return;
    void loadAIHistory();
  }, [session, loadAIHistory]);

  const handleSaveQuery = async () => {
    if (!query.trim()) return;

    setIsSaving(true);
    setFeedback('');
    try {
      const placeholderResponse = 'AI engine is not enabled yet. Your query is saved for future personalization.';
      await saveAIHistory(query, placeholderResponse);
      setFeedback('Saved. This query will be available when AI personalization is enabled.');
      setQuery('');
    } catch (e) {
      console.error(e);
      setFeedback('Could not save your query. Please try again.');
    } finally {
      setIsSaving(false);
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
              <p className="text-slate-600 dark:text-zinc-300">Please login with email first to use AI history.</p>
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
            <Bot className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">AI History</h2>
            <p className="text-slate-500 text-sm">Store user prompts for future personalization</p>
          </div>
        </div>
        
        <Card className="border-2 border-slate-200 shadow-sm">
          <CardContent className="pt-6 space-y-4">
            <textarea
              className="w-full h-32 p-4 text-lg rounded-xl border border-slate-200 bg-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none dark:bg-zinc-900 dark:border-zinc-800"
              placeholder="e.g. I feel dizzy after taking my morning medicine"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button onClick={handleSaveQuery} isLoading={isSaving} className="w-full py-6 text-lg">
              {!isSaving && <Send className="h-5 w-5 mr-2" />}
              Save Query
            </Button>

            {feedback && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
                {feedback}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-blue-100 shadow-md dark:border-blue-900">
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <History className="h-5 w-5 mr-2 text-blue-500" />
              Recent Queries
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiHistory.length === 0 ? (
              <p className="text-slate-500 dark:text-zinc-400">No AI queries saved yet.</p>
            ) : (
              aiHistory.slice(0, 8).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="font-medium text-slate-800 dark:text-zinc-100">{entry.query}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">{entry.response}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
