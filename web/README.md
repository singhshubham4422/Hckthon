# MediCare Web (Supabase Edition)

This web app uses Supabase for:

- Email/password authentication
- User profile storage
- User-scoped medicines
- Taken/missed logs
- AI query history (for future personalization)

## 1) Create Supabase Schema

Run the SQL in the Supabase SQL editor:

- `../supabase/schema.sql`

This creates:

- `profiles`
- `medicines`
- `logs`
- `ai_history`

and enables Row Level Security policies so users only access their own rows.

## 2) Configure Environment Variables

Copy `.env.example` to `.env.local` and add your project values:

```bash
cp .env.example .env.local
```

Required keys:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 3) Install and Run

From workspace root:

```bash
npm install
npm run dev --workspace=web
```

Open `http://localhost:3000`.

## 4) What To Test

- Signup with email/password
- Login with email/password
- Session persistence after refresh
- Profile save and reload
- Add/update/delete medicines
- Mark taken/missed and verify log updates
- User data isolation across different accounts
