import { createAdminClient } from "./supabase/admin";
import { siteUrl } from "./site";

/**
 * Builds a sign-in link that points at whichever host the app is running on.
 *
 * Supabase can email these itself, but it composes every message from one Site
 * URL setting, so a locally running app emailed links to the deployed site. The
 * link is generated here instead and posted by lib/email.ts, which makes the
 * host `siteUrl()` and therefore correct in every environment.
 *
 * `generateLink` returns the link rather than sending it, so nothing leaves the
 * building until we send it. It does, however, create the account when one does
 * not exist — so anywhere a stranger can type an address, check the address is
 * one you meant to write to *before* calling this.
 */
export async function createSignInLink(
  email: string,
  /** Path on this site to land on once the session is set, e.g. `/p/abc123`. */
  next: string,
): Promise<{ link: string | null; error: string | null }> {
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error || !data?.properties?.hashed_token) {
    return {
      link: null,
      error: error?.message ?? "Could not generate a sign in link.",
    };
  }

  const url = new URL("/auth/confirm", siteUrl());
  url.searchParams.set("token_hash", data.properties.hashed_token);
  url.searchParams.set("type", "magiclink");
  url.searchParams.set("next", next);

  return { link: url.toString(), error: null };
}
