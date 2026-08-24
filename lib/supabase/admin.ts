import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS.
 *
 * Only ever import this from route handlers that need to act without a signed-in
 * user: the public proposal page, the signature endpoint, and the Stripe
 * webhook. Never import it into a Client Component — the key must not reach the
 * browser.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
