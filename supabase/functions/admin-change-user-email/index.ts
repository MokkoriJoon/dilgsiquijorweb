import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Supabase server credentials are not configured.' });
  }

  const authorization = request.headers.get('Authorization');
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return jsonResponse(401, { error: 'A signed-in Super Admin is required.' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerData, error: callerError } = await admin.auth.getUser(accessToken);
  if (callerError || !callerData.user) {
    return jsonResponse(401, { error: 'Your session is invalid or expired. Please sign in again.' });
  }

  const { data: callerProfile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error('Could not verify caller role:', profileError.message);
    return jsonResponse(500, { error: 'Could not verify Super Admin permissions.' });
  }
  if (callerProfile?.role !== 'SUPER_ADMIN') {
    return jsonResponse(403, { error: 'Only SUPER_ADMIN can change user email addresses.' });
  }

  let body: { userId?: unknown; newEmail?: unknown };
  try {
    const parsedBody: unknown = await request.json();
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return jsonResponse(400, { error: 'Request body must be a JSON object.' });
    }
    body = parsedBody as { userId?: unknown; newEmail?: unknown };
  } catch {
    return jsonResponse(400, { error: 'Request body must be valid JSON.' });
  }

  const userId = typeof body.userId === 'string' ? body.userId : '';
  const newEmail =
    typeof body.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return jsonResponse(400, { error: 'A valid user ID is required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return jsonResponse(400, { error: 'A valid new email address is required.' });
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom = Deno.env.get('EMAIL_FROM');
  const appUrl = Deno.env.get('APP_URL');
  if (!resendApiKey || !emailFrom || !appUrl) {
    return jsonResponse(500, {
      error: 'Email verification is not configured. Set RESEND_API_KEY, EMAIL_FROM, and APP_URL for this Edge Function.',
    });
  }

  let redirectTo: string;
  try {
    redirectTo = new URL('/#/login', appUrl).toString();
  } catch {
    return jsonResponse(500, { error: 'APP_URL must be a valid application URL.' });
  }

  const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(userId);
  if (targetError || !targetData.user) {
    return jsonResponse(404, { error: 'User not found.' });
  }
  const oldEmail = targetData.user.email?.trim().toLowerCase();
  if (!oldEmail) {
    return jsonResponse(400, { error: 'This account has no email address to change.' });
  }
  if (oldEmail === newEmail) {
    return jsonResponse(400, { error: 'The new email is the same as the current email.' });
  }

  const { data: newEmailLink, error: newEmailLinkError } = await admin.auth.admin.generateLink({
    type: 'email_change_new',
    email: oldEmail,
    newEmail,
    options: { redirectTo },
  });
  if (newEmailLinkError || !newEmailLink.properties?.action_link) {
    console.error(
      'Could not generate new-email verification link:',
      newEmailLinkError?.message ?? 'No action link returned',
    );
    return jsonResponse(400, {
      error: newEmailLinkError?.message ?? 'Supabase could not generate an email verification link.',
    });
  }

  const { data: currentEmailLink, error: currentEmailLinkError } =
    await admin.auth.admin.generateLink({
      type: 'email_change_current',
      email: oldEmail,
      newEmail,
      options: { redirectTo },
    });
  if (currentEmailLinkError || !currentEmailLink.properties?.action_link) {
    console.error(
      'Could not generate current-email confirmation link:',
      currentEmailLinkError?.message ?? 'No action link returned',
    );
    return jsonResponse(400, {
      error: currentEmailLinkError?.message ?? 'Supabase could not generate a current-email confirmation link.',
    });
  }

  const userName =
    typeof targetData.user.user_metadata?.full_name === 'string'
      ? targetData.user.user_metadata.full_name
      : 'there';
  const safeName = escapeHtml(userName);
  const safeNewLink = escapeHtml(newEmailLink.properties.action_link);
  const safeCurrentLink = escapeHtml(currentEmailLink.properties.action_link);

  async function sendVerificationEmail(to: string, subject: string, text: string, html: string) {
    return fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: emailFrom, to: [to], subject, text, html }),
    });
  }

  let currentMailResponse: Response;
  let newMailResponse: Response;
  try {
    currentMailResponse = await sendVerificationEmail(
      oldEmail,
      'Confirm email change request',
      `Hello ${userName},\n\nA Super Admin requested changing the email on your account to ${newEmail}. Confirm this request using this link: ${currentEmailLink.properties.action_link}\n\nYour email will not change until the new address is verified.`,
      `<p>Hello ${safeName},</p><p>A Super Admin requested changing the email on your account to <strong>${escapeHtml(newEmail)}</strong>.</p><p><a href="${safeCurrentLink}">Confirm this request</a></p><p>Your email will not change until the new address is verified. If you did not expect this request, do not click the link.</p>`,
    );
    if (!currentMailResponse.ok) {
      console.error('Email provider rejected the current-email confirmation:', currentMailResponse.status);
      return jsonResponse(502, {
        error: 'The current-email confirmation could not be delivered. Check the Resend API key and verified sender address.',
      });
    }

    newMailResponse = await sendVerificationEmail(
      newEmail,
      'Verify your new email address',
      `Hello ${userName},\n\nA Super Admin requested changing the email on your account to ${newEmail}. Verify the new address using this link: ${newEmailLink.properties.action_link}\n\nYour account will keep its current email until the new address is verified. If you did not expect this change, you can ignore this message.`,
      `<p>Hello ${safeName},</p><p>A Super Admin requested changing the email on your account to <strong>${escapeHtml(newEmail)}</strong>.</p><p><a href="${safeNewLink}">Verify this email address</a></p><p>Your account will keep its current email until the new address is verified. If you did not expect this change, you can ignore this message.</p>`,
    );
  } catch (error) {
    console.error(
      'Email provider request failed:',
      error instanceof Error ? error.message : 'Unknown network error',
    );
    return jsonResponse(502, {
      error: 'A verification email could not be delivered. Check the Resend API key and verified sender address.',
    });
  }
  if (!newMailResponse.ok) {
    console.error('Email provider rejected the new-email verification:', newMailResponse.status);
    return jsonResponse(502, {
      error: 'The new-email verification could not be delivered. Check the Resend API key and verified sender address.',
    });
  }

  return jsonResponse(200, { message: 'Verification emails sent.' });
});
