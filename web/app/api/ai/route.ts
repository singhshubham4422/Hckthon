import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

type AIMode = 'general' | 'missed-dose' | 'timeline' | 'emergency' | 'risk-check';

interface AIRequestBody {
  query?: string;
  mode?: AIMode;
  candidateMedicine?: {
    name?: string;
    dose?: string;
    timing?: string;
    notes?: string;
  };
}

function toSafeString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function safeArrayToList(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return 'None reported';
  const cleaned = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return cleaned.length > 0 ? cleaned.join(', ') : 'None reported';
}

function getModePrompt(mode: AIMode, query: string, candidateMedicine?: AIRequestBody['candidateMedicine']): string {
  if (mode === 'missed-dose') {
    return `TASK: The user missed a dose.\nUser Request: ${query}\n\nReturn ONLY valid JSON with this exact structure:\n{\n  "summary": "...",\n  "quickActions": ["...", "..."],\n  "precautions": ["...", "..."],\n  "riskLevel": "low|medium|high",\n  "why": "...",\n  "warning": "Not medical advice."\n}`;
  }

  if (mode === 'timeline') {
    return `TASK: Analyze health patterns from medicines, logs, and AI history.\nUser Request: ${query}\n\nReturn ONLY valid JSON with this exact structure:\n{\n  "summary": "...",\n  "patterns": ["...", "..."],\n  "risks": ["...", "..."],\n  "suggestions": ["...", "..."],\n  "why": "...",\n  "warning": "Not medical advice."\n}`;
  }

  if (mode === 'emergency') {
    return `TASK: User feels unwell and needs immediate safe next steps.\nUser Request: ${query}\n\nReturn ONLY valid JSON with this exact structure:\n{\n  "summary": "...",\n  "quickActions": ["...", "..."],\n  "precautions": ["...", "..."],\n  "redFlags": ["...", "..."],\n  "why": "...",\n  "warning": "Not medical advice."\n}`;
  }

  if (mode === 'risk-check') {
    const medicineSummary = candidateMedicine
      ? `${toSafeString(candidateMedicine.name, 'Unknown')} (${toSafeString(candidateMedicine.dose, 'Unknown dose')}, ${toSafeString(candidateMedicine.timing, 'Unknown timing')})`
      : 'Unknown medicine';

    return `TASK: Evaluate medicine conflict risk for a newly added medicine.\nCandidate Medicine: ${medicineSummary}\nUser Request: ${query}\n\nReturn ONLY valid JSON with this exact structure:\n{\n  "summary": "...",\n  "conflicts": ["...", "..."],\n  "warnings": ["...", "..."],\n  "safeToProceed": true,\n  "why": "...",\n  "warning": "Not medical advice."\n}`;
  }

  return `TASK: Provide health assistant response to user query.\nUser Request: ${query}\n\nReturn ONLY valid JSON with this exact structure:\n{\n  "suggestions": "...",\n  "precautions": "...",\n  "reason": "...",\n  "warning": "..."\n}`;
}

function parseJsonResponse(candidateText: string, mode: AIMode) {
  const cleanedText = candidateText.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();

  try {
    return JSON.parse(cleanedText) as Record<string, unknown>;
  } catch {
    if (mode === 'timeline') {
      return {
        summary: 'Unable to parse timeline details from AI output.',
        patterns: [],
        risks: [],
        suggestions: [],
        why: cleanedText,
        warning: 'Not medical advice.',
      };
    }

    if (mode === 'missed-dose' || mode === 'emergency') {
      return {
        summary: 'Unable to parse structured guidance from AI output.',
        quickActions: [],
        precautions: [],
        riskLevel: 'medium',
        redFlags: [],
        why: cleanedText,
        warning: 'Not medical advice.',
      };
    }

    if (mode === 'risk-check') {
      return {
        summary: 'Unable to parse risk-check details from AI output.',
        conflicts: [],
        warnings: [],
        safeToProceed: true,
        why: cleanedText,
        warning: 'Not medical advice.',
      };
    }

    return {
      suggestions: 'Could not structure the AI response.',
      precautions: 'Review the full fallback text.',
      reason: cleanedText,
      warning: 'Not medical advice.',
    };
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const token = authHeader.replace(/^Bearer\s+/, '');

    // Initialize Supabase client for this request with the user's token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized', details: userError?.message }, { status: 401 });
    }

    // Parse request body
    const body = (await req.json()) as AIRequestBody;
    const mode: AIMode = body.mode ?? 'general';
    const query = toSafeString(body.query);

    if (!query) {
      return NextResponse.json({ error: 'Missing query in request body' }, { status: 400 });
    }

    // Fetch user profile (age, conditions, allergies)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('age, conditions, allergies')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
    }

    // Fetch user medicines
    const { data: medicines, error: medsError } = await supabase
      .from('medicines')
      .select('id, name, dose, timing, notes, created_at')
      .eq('user_id', user.id);

    if (medsError) {
      console.error('Medicines fetch error:', medsError);
      return NextResponse.json({ error: 'Failed to fetch medicines' }, { status: 500 });
    }

    const [{ data: logs, error: logsError }, { data: aiHistory, error: aiHistoryError }] = await Promise.all([
      supabase
        .from('logs')
        .select('status,taken_at,medicine_id')
        .eq('user_id', user.id)
        .order('taken_at', { ascending: false })
        .limit(60),
      supabase
        .from('ai_history')
        .select('query,response,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (logsError) {
      console.error('Logs fetch error:', logsError);
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }

    if (aiHistoryError) {
      console.error('AI history fetch error:', aiHistoryError);
      return NextResponse.json({ error: 'Failed to fetch AI history' }, { status: 500 });
    }

    let profileStr = '';
    if (profile) {
      profileStr += `* Age: ${profile.age || 'Unknown'}\n`;
      profileStr += `* Conditions: ${safeArrayToList(profile.conditions)}\n`;
      profileStr += `* Allergies: ${safeArrayToList(profile.allergies)}\n`;
    }

    let medsStr = '';
    if (medicines && medicines.length > 0) {
      medsStr = medicines.map((m) => `* ${m.name} (${m.dose}, ${m.timing})`).join('\n');
    } else {
      medsStr = '* No current medicines';
    }

    const logsStr = (logs ?? []).length
      ? (logs ?? [])
          .map((entry) => `* ${entry.status} at ${entry.taken_at} for medicine ${entry.medicine_id}`)
          .join('\n')
      : '* No recent medicine logs';

    const historyStr = (aiHistory ?? []).length
      ? (aiHistory ?? [])
          .map((entry) => `* Q: ${entry.query}\n  A: ${entry.response}`)
          .join('\n')
      : '* No recent AI history';

    const taskPrompt = getModePrompt(mode, query, body.candidateMedicine);

    const prompt = `You are a cautious health assistant.

User Profile:
${profileStr}

Current Medicines:
${medsStr}

Recent Logs:
${logsStr}

AI Query History:
${historyStr}

${taskPrompt}

Hard requirements:
- Response must be valid JSON only
- Include a WHY explanation field
- Keep recommendations conservative and safe
- Include disclaimer content in the warning field`;

    // Call Gemini API
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json({ error: 'Gemini API is not configured on the server' }, { status: 500 });
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errData = await geminiResponse.text();
      console.error('Gemini API Error:', errData);
      return NextResponse.json({ error: 'Failed to generate response from Gemini' }, { status: 502 });
    }

    const geminiData = await geminiResponse.json();
    const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return NextResponse.json({ error: 'Received empty response from Gemini' }, { status: 502 });
    }

    const parsedResponse = parseJsonResponse(candidateText, mode);

    return NextResponse.json(parsedResponse);
  } catch (error: unknown) {
    console.error('API /ai unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Internal Server Error', details: message }, { status: 500 });
  }
}
