import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://izvhbgrrhfllltmjnczs.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6dmhiZ3JyaGZsbGx0bWpuY3pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxNTExMzgsImV4cCI6MjEwODcyNzEzOH0.AOPxKSH4c72b0745Rwr7Dfd7LV7soMVaUaOXnx6uB3w';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
