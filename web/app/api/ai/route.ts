import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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
    const body = await req.json();
    const { query } = body;

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
      .select('name, dose, timing')
      .eq('user_id', user.id);

    if (medsError) {
      console.error('Medicines fetch error:', medsError);
      return NextResponse.json({ error: 'Failed to fetch medicines' }, { status: 500 });
    }

    // Construct the prompt
    let profileStr = '';
    if (profile) {
      profileStr += `* Age: ${profile.age || 'Unknown'}\n`;
      profileStr += `* Conditions: ${profile.conditions && profile.conditions.length > 0 ? profile.conditions.join(', ') : 'None reported'}\n`;
      profileStr += `* Allergies: ${profile.allergies && profile.allergies.length > 0 ? profile.allergies.join(', ') : 'None reported'}\n`;
    }

    let medsStr = '';
    if (medicines && medicines.length > 0) {
      medsStr = medicines.map(m => `* ${m.name} (${m.dose}, ${m.timing})`).join('\n');
    } else {
      medsStr = '* No current medicines';
    }

    const prompt = `You are a medical assistant.

User Profile:
${profileStr}

Current Medicines:
${medsStr}

User Query: ${query}

Give:
1. Safe medicine suggestions
2. Precautions
3. WHY explanation
4. Conflict warnings

Always include disclaimer: Not medical advice.

RESPOND ONLY WITH VALID JSON using the following structure. Do not wrap in markdown or include any other text:
{
  "suggestions": "...",
  "precautions": "...",
  "reason": "...",
  "warning": "..."
}`;

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

    let parsedResponse;
    try {
      // Clean up markdown formatting if Gemini still wraps in json block
      const cleanedText = candidateText.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      parsedResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse Gemini response as JSON:', parseError, candidateText);
      // Fallback
      parsedResponse = {
        suggestions: "Could not structure the AI response.",
        precautions: "See full response below.",
        reason: candidateText,
        warning: "Not medical advice."
      };
    }

    return NextResponse.json(parsedResponse);
  } catch (error: any) {
    console.error('API /ai unexpected error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
