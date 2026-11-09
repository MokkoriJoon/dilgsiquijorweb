export function emailRateLimitMessage(raw: string): string | null {
  if (!/email rate limit exceeded|over_email_send_rate_limit|email.*rate.?limit/i.test(raw)) {
    return null;
  }

  return 'Supabase has temporarily limited confirmation emails. Its built-in email sender allows only 2 emails per hour for the whole project. Stop retrying and wait for the limit to reset. To allow more signups, configure a custom SMTP provider in Supabase → Authentication → SMTP Settings; then review Authentication → Rate Limits. Step-by-step instructions are in the README under “Fix signup email rate limits.”';
}
