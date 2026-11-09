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

### Fix signup email rate limits

The application cannot override Supabase Auth's email-sending limit. Supabase's
built-in email sender is intended for testing: it allows **2 emails per hour
per project** and only sends to addresses belonging to the Supabase
organization team. Use custom SMTP to send confirmation emails to staff:

1. **Stop repeated signup attempts.** Wait for the current email quota to refill.
   In Supabase, open **Authentication → Users** and check whether the address
   already has an account before trying again.
2. **Choose an SMTP provider** (for example, Resend or Brevo) and verify a sender
   domain/address there. Add the provider's recommended SPF/DKIM DNS records.
3. In the Supabase dashboard, open **Project Settings → Authentication → SMTP
   Settings** (or **Authentication → SMTP Settings**), enable custom SMTP, and
   enter the SMTP host, port, username, password, and verified sender address.
   Keep the SMTP password private; do not put it in this repository or in
   `VITE_*` browser environment variables.
4. Open **Authentication → Rate Limits**. Review the project email-send limit
   and set it to a value supported by your SMTP provider. Start conservatively;
   the default email-sender limit is not increased just by changing app code.
5. In **Authentication → URL Configuration**, set the app's site URL and add
   its sign-in/confirmation URL to the redirect allow list. Save the settings.
6. Submit signup once with an email address you control and check its inbox and
   spam folder. Avoid repeatedly clicking signup or resend; these endpoints
   have per-address limits too.

Supabase documentation: [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
and [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).
If signup already created an unconfirmed user, do not register that address
again; after SMTP is configured, send a single confirmation resend from User
Management.

### Fix Super Admin "Add User" UUID error

For an existing project, open **Supabase → SQL Editor**, paste the contents of
`supabase/fix_admin_create_user_uuid.sql`, and run it once. This replaces only
the `admin_create_user` function, correcting its UUID `instance_id`; it does not
delete or modify existing accounts. Then reload the website and try Add User
again. New installs can use the corrected function in `supabase/schema.sql`.
Super Admin-created accounts are marked confirmed immediately by this RPC and
do not receive a confirmation email; use the public signup flow when email
confirmation is required.

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
