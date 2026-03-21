import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = 'gemini-1.5-flash';

interface ScanRequestBody {
  image?: string;
  mimeType?: string;
}

interface ScanResult {
  name: string;
  dose: string;
  timing: string;
  explanation: string;
  precautions: string;
  warning?: string;
}

const FALLBACK_RESPONSE: ScanResult = {
  name: 'Unable to detect',
  dose: 'Check label',
  timing: 'Manual entry required',
  explanation: 'Could not read prescription clearly.',
  precautions: 'Verify before use.',
};

function asSafeString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function safeList(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    return 'None reported';
  }

  const cleaned = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return cleaned.length > 0 ? cleaned.join(', ') : 'None reported';
}

function parseJsonText(rawText: string): Record<string, unknown> | null {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toScanResult(value: unknown): ScanResult {
  if (typeof value !== 'object' || value === null) {
    return FALLBACK_RESPONSE;
  }

  const record = value as Record<string, unknown>;
  return {
    name: asSafeString(record.name, FALLBACK_RESPONSE.name),
    dose: asSafeString(record.dose, FALLBACK_RESPONSE.dose),
    timing: asSafeString(record.timing, FALLBACK_RESPONSE.timing),
    explanation: asSafeString(record.explanation, FALLBACK_RESPONSE.explanation),
    precautions: asSafeString(record.precautions, FALLBACK_RESPONSE.precautions),
    warning: asSafeString(record.warning, ''),
  };
}

async function callGemini(payload: Record<string, unknown>, logLabel: string): Promise<{ text: string; raw: unknown }> {
  if (!geminiApiKey) {
    throw new Error('Gemini API is not configured on the server.');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[scan-ai] Gemini HTTP failure', { status: response.status, body: errorText });
    throw new Error(`Gemini request failed: ${errorText}`);
  }

  const data = await response.json();
  console.log(`[scan-ai] Raw Gemini response (${logLabel})`, JSON.stringify(data));
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') {
    throw new Error('Gemini returned empty output.');
  }

  return { text, raw: data };
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json(FALLBACK_RESPONSE, { status: 200 });
    }

    const token = authHeader.replace(/^Bearer\s+/, '');

    const body = (await req.json()) as ScanRequestBody;
    const base64Image = asSafeString(body.image);
    const mimeType = asSafeString(body.mimeType, 'image/jpeg');

    if (!base64Image) {
      return NextResponse.json({ ...FALLBACK_RESPONSE, warning: 'Image data missing.' }, { status: 200 });
    }

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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ...FALLBACK_RESPONSE, warning: 'Unauthorized scan request.' }, { status: 200 });
    }

    const [{ data: profile }, { data: medicines }, { data: logs }, { data: aiHistory }] = await Promise.all([
      supabase.from('profiles').select('age, conditions, allergies').eq('id', user.id).maybeSingle(),
      supabase.from('medicines').select('name, dose, timing, notes').eq('user_id', user.id),
      supabase.from('logs').select('status, taken_at, medicine_id').eq('user_id', user.id).order('taken_at', { ascending: false }).limit(40),
      supabase.from('ai_history').select('query, response, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(12),
    ]);

    const profileText = profile
      ? `Age: ${profile.age || 'Unknown'}\nConditions: ${safeList(profile.conditions)}\nAllergies: ${safeList(profile.allergies)}`
      : 'Age: Unknown\nConditions: None reported\nAllergies: None reported';

    const medicinesText = Array.isArray(medicines) && medicines.length > 0
      ? medicines.map((entry) => `- ${entry.name} (${entry.dose}, ${entry.timing})`).join('\n')
      : '- No current medicines';

    const logsText = Array.isArray(logs) && logs.length > 0
      ? logs.map((entry) => `- ${entry.status} at ${entry.taken_at} for ${entry.medicine_id}`).join('\n')
      : '- No recent logs';

    const historyText = Array.isArray(aiHistory) && aiHistory.length > 0
      ? aiHistory.map((entry) => `- Q: ${entry.query}\n  A: ${entry.response}`).join('\n')
      : '- No recent AI history';

    const ocrDebugPrompt = `You are a medical OCR assistant.

Read all visible text from this medicine or prescription image.

Rules:
- Extract exact text only.
- Do not infer or guess.
- Preserve key labels, medicine names, dose, and timing if visible.
- Return plain text only.`;

    const ocrDebugPayload = {
      contents: [
        {
          parts: [
            { text: ocrDebugPrompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
    };

    const ocrDebugResult = await callGemini(ocrDebugPayload, 'ocr-text');
    const extractedText = ocrDebugResult.text.trim();
    console.log('[scan-ai] Extracted OCR text', extractedText);

    const analysisPrompt = `You are a medical OCR + AI assistant.

STEP 1: Carefully read ALL visible text from the image.

* Extract EXACT text
* DO NOT guess
* DO NOT hallucinate

STEP 2: Identify from extracted text:

* medicine name (brand or generic)
* dose (mg/ml/tablet)
* timing (if visible)

STEP 3: If partially unclear:

* infer ONLY from visible text
* DO NOT return 'Unknown' unless nothing readable

STEP 4: Use user context:

User Profile:
${profileText}

Current Medicines:
${medicinesText}

Recent Logs:
${logsText}

AI History:
${historyText}

STEP 5: Provide:

* explanation (why used)
* precautions (side effects / warnings)
* conflict warnings

IMPORTANT RULES:

* Prefer EXACT text from image
* If brand name like 'Cofsils' exists -> return it
* Be safe, not creative
* If unsure -> say assumption clearly

Return STRICT JSON ONLY:

{
  "name": "",
  "dose": "",
  "timing": "",
  "explanation": "",
  "precautions": "",
  "warning": ""
}`;

    const analysisPayload = {
      contents: [
        {
          parts: [
            { text: analysisPrompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
    };

    const analysisResult = await callGemini(analysisPayload, 'structured-json');
    const parsed = parseJsonText(analysisResult.text);

    if (!parsed) {
      return NextResponse.json({
        ...FALLBACK_RESPONSE,
        warning: 'Could not parse AI response. Please verify manually.',
      });
    }

    return NextResponse.json(toScanResult(parsed));
  } catch (error) {
    console.error('AI scan route error:', error);
    return NextResponse.json(FALLBACK_RESPONSE, { status: 200 });
  }
}
