import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  void req;

  return NextResponse.json(
    {
      error: 'AI service is not configured yet. Query logging is available through ai_history.',
    },
    { status: 501 }
  );
}
