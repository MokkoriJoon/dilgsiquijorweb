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

### Disable signup email confirmation and require Super Admin approval

This mode sends no signup or confirmation emails. Supabase Auth creates the
account, then the app holds it at a pending-approval screen until a Super Admin
approves it in User Management. A pending user may authenticate, but cannot use
the app's protected features until approved. Existing profiles remain approved;
only new public signups and Admin-created accounts start pending.

1. In Supabase, open **Authentication → Sign In / Providers → Email** (the
   exact label may appear as **Authentication → Providers → Email**).
2. Turn **Confirm email** off and save. This is a Supabase project setting; a
   website deployment or SQL migration cannot turn it off. Keep the Email
   provider enabled so users can still sign in with email and password.
3. Open **Supabase → SQL Editor** and run `supabase/user_approval_migration.sql`
   once. This adds the approval column and row-level security, updates the
   signup trigger, and fixes the Super Admin Add User UUID function. It does
   not delete existing accounts. Do not run only the older
   `fix_admin_create_user_uuid.sql` if applying this migration.
4. Merge/deploy the website changes so the registration page, pending screen,
   and User Management approval controls are available.
5. In **User Management**, use the green approval action on a pending account
   to allow website access. Use the clock action to revoke access again. The
   current Super Admin account cannot revoke its own approval.
6. Test with one new account. It should receive no email and remain on the
   pending screen after authentication until a Super Admin approves it. After
   approval, the user can reload the page or sign in again to use the app.

If a new signup succeeds but the page says Supabase confirmation is still
enabled, return to step 1 and turn off **Confirm email**. Existing users are
preserved. Existing accounts still unconfirmed in Supabase Auth may need to be
confirmed manually in **Authentication → Users** before they can sign in; this
migration does not confirm existing Auth accounts.

**Security note:** Turning off email confirmation means the app cannot prove
that a person owns the email address they enter. Super Admins should verify a
person's identity through an appropriate offline channel before approval.
Approval controls app access; it is not email ownership verification.

Email-based forgot-password and password-reset links are disabled in the
website. If a user forgets their password, a Super Admin can set a new password
directly from **User Management → Set Password** and share it securely. The
password can be generated randomly in that dialog.

### Recurring task occurrences

Recurring schedules show each due date as its own occurrence. Missed dates
remain overdue while today's and the next scheduled dates remain separate
pending items. Completing a date records completion only for that occurrence
and assignee; the next scheduled date stays pending.

For an existing project, run `supabase/task_occurrences_migration.sql` once in
the SQL Editor after the account-approval migration has been applied. New
projects get this table from `supabase/schema.sql`. Deploy the website changes
after the migration; no existing tasks are rewritten.

### Organizational chart

For an existing project, run `supabase/organizational_chart_migration.sql`
once in the SQL Editor before deploying the organization-chart feature. It adds
the staff contact phone field and organizational-chart tables without changing
existing profile or task data. Super Admins can choose each staff member's
supervisor in **User Management** or edit it directly from the chart. The chart
automatically arranges personnel and draws aligned reporting lines. The chart
and personnel email/contact details, including focal-person programs, are
publicly visible on the public dashboard and in the authenticated sidebar view.

Run `supabase/focal_person_programs_migration.sql` after the organizational-chart
migration on existing projects and before deploying focal-person registration.
It adds the profile fields and updates the signup trigger to save focal-person
status and programs. Programs entered during registration or account management
are displayed in that person's chart details.

Run `supabase/org_chart_layout_preferences_migration.sql` on existing projects
before deploying chart badge and layout controls. Super Admins can add a badge
to a person and configure their reports' layout.

Run `supabase/org_chart_mixed_report_groups_migration.sql` after the layout
preferences migration and before deploying mixed report groups. Super Admins
can group a person's direct reports, choose horizontal or vertical arrangement
per group, and set a default for future reports. Each supervisor can have a
different combination of layouts.

Supabase reference: [Auth email confirmation](https://supabase.com/docs/guides/auth/auth-email-password#email-confirmation)
and [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

### Database setup

For a new Supabase project, run the complete `supabase/schema.sql` in the SQL
Editor once. It creates the application's tables, policies, triggers, and
functions. Do not use partial sample table SQL in place of that file. For an
existing project, use the focused migration described above so current data and
accounts are preserved.

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
