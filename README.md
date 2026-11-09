# D.E.N.N.I.S - DILG Employee Navigation & Notices Information System

A task management dashboard for DILG (Department of the Interior and Local Government) employees.

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Backend/Database/Auth**: Supabase
- **Deployment**: Vercel
- **Version Control**: GitHub

## Features

- 📊 Dashboard with task statistics
- 🔐 Staff authentication (Login/Register)
- 👁️ Public viewing mode for unauthenticated users
- 📅 Task filtering by frequency (Daily, Weekly, Monthly, etc.)
- 🔔 Reminder system for upcoming tasks
- 📱 Responsive design

## Setup

### Prerequisites

- Node.js 18+
- A Supabase account (free tier available)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/dennis-dilg.git
cd dennis-dilg
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.local.example .env.local
```

4. Edit `.env.local` with your Supabase credentials:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

5. Run the development server:
```bash
npm run dev
```

## Supabase Setup

For an existing project, run `supabase/user_management_migration.sql` once in
the Supabase SQL Editor. For a new project, run `supabase/schema.sql`. The
migration removes the legacy direct-auth-user creation RPC, ensures public
signups cannot choose their own role, and synchronizes a profile email only
after Supabase Auth confirms an email change.

The Super Admin email-change action uses the
`supabase/functions/admin-change-user-email` Edge Function. Deploy it with the
Supabase CLI and configure a Resend sender:

```bash
supabase functions deploy admin-change-user-email
supabase secrets set RESEND_API_KEY=your-resend-api-key EMAIL_FROM="D.E.N.N.I.S. <accounts@example.com>" APP_URL=https://your-app.example.com
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to deployed
Supabase Edge Functions; the service-role key must never be added to the
browser app. Verify the sender domain in Resend, and add
`https://your-app.example.com/#/login` to Supabase Authentication's allowed
redirect URLs. The new address remains pending in Auth and in User Management
until its verification link is clicked. Account creation and confirmation
resends use Supabase Auth's built-in email flow and require the project's
Authentication → Providers → Email settings to allow signups and send email.

### Database Tables

Create the following tables in your Supabase SQL editor:

```sql
-- Tasks table
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMP WITH TIME ZONE,
  frequency TEXT DEFAULT 'one-time',
  status TEXT DEFAULT 'pending',
  assigned_to UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User profiles
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  full_name TEXT,
  position TEXT, -- Position / Designation
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view all tasks" ON tasks FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert tasks" ON tasks FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update own tasks" ON tasks FOR UPDATE USING (auth.uid() = assigned_to);
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
```

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy!

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous/public key |

## License

© 2026 D.E.N.N.I.S. • DILG Region NIR • Siquijor Provincial Office
Republic of the Philippines
