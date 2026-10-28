/**
 * Translate raw Supabase/Postgres schema-drift errors into actionable
 * messages for staff users (and precise fix hints for admins).
 */
export function friendlyDbError(raw?: string | null): string {
  if (!raw) return 'Unexpected database error.';
  const m = raw.toLowerCase();

  if (m.includes('does not exist') && (m.includes('column') || m.includes('relation') || m.includes('table'))) {
    return 'The database is out of date — a required table or column is missing. A Super Admin must open Supabase → SQL Editor and run supabase/schema.sql once, then reload this page (Supabase → Settings → API → restart, or simply wait ~1 min for the schema cache to refresh).';
  }
  if (m.includes('gen_salt') || m.includes('crypt') || m.includes('pgcrypto')) {
    return 'The pgcrypto extension is missing in the database. Run supabase/schema.sql once in the Supabase SQL Editor — section 0 installs it automatically.';
  }
  if (m.includes('row-level security') || m.includes('permission denied')) {
    return 'You do not have permission for this action. Ask an Admin / Super Admin, and make sure the RLS policies from supabase/schema.sql are applied.';
  }
  if (m.includes('duplicate key')) {
    if (m.includes('task_categories')) return 'A category with that name already exists.';
    return 'That value already exists (duplicate).';
  }
  if (m.includes('violates foreign key')) {
    return 'Related record is missing — please pick a valid option and try again.';
  }
  if (m.includes('fetch failed') || m.includes('failed to fetch')) {
    return 'Cannot reach the Supabase project. Check your internet connection and the VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY values in .env.local.';
  }
  return raw;
}
