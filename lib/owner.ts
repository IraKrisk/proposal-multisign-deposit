import { createClient } from "./supabase/server";

/**
 * Whether the signed in visitor is a workspace owner.
 *
 * `sendToClient` mints a real Supabase account for every signer, so "has a
 * session" is not the same question as "may use the dashboard". Without this,
 * anybody who has ever opened a proposal link could write proposals of their
 * own, spending the owner's Anthropic credit and sending mail from the owner's
 * address.
 *
 * Read through the session scoped client on purpose: row level security lets a
 * user read their own profile row and nobody else's, so no service role key is
 * involved and the answer cannot be forged from the browser.
 */
export async function isOwner(): Promise<boolean> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data } = await supabase
    .from("profiles")
    .select("is_owner")
    .eq("id", user.id)
    .maybeSingle<{ is_owner: boolean }>();

  return data?.is_owner === true;
}

/** The message every guarded action returns when the caller is not an owner. */
export const NOT_OWNER = "This workspace belongs to somebody else.";
