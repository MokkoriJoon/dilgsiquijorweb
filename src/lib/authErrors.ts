export function emailRateLimitMessage(raw: string): string | null {
  if (!/email rate limit exceeded|over_email_send_rate_limit|email.*rate.?limit/i.test(raw)) {
    return null;
  }

  return 'Supabase has temporarily limited email sending. Stop retrying and wait for the limit to reset. For this no-confirmation signup flow, turn off Confirm email in Supabase → Authentication → Providers → Email; see the README section “Disable signup email confirmation and require Super Admin approval.”';
}
