import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Completes a magic-link sign-in.
 *
 * Clients get their link from `sendToClient`, which asks Supabase for it
 * server-side. That rules out the browser-secret (PKCE) flow, because the
 * secret would have to be generated in the client's browser. The alternative is
 * this: the email carries a single-use hash, and the server trades it for a
 * session here. Nothing sensitive ever appears in the URL, and the session
 * cookie is set on the same host the link points at.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Not the request's own origin. Behind Netlify that is the per deploy host,
  // `<id>--<site>.netlify.app`, so redirecting to it walked the browser off the
  // host the session cookie had just been set on and straight back to the sign
  // in panel, over and over.
  const origin = siteUrl();

  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "magiclink") as EmailOtpType;

  // Supabase substitutes the full redirect URL here. Only same-origin
  // destinations are honoured, so a tampered link cannot bounce a signed-in
  // client off to somebody else's site.
  const requested = searchParams.get("next") ?? "/dashboard";
  const next = safePath(requested, origin);

  if (!tokenHash) {
    return NextResponse.redirect(`${origin}/login?error=auth_link_invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    // Expired, already used, or tampered with. Send them back to the page they
    // were trying to reach — it offers a fresh link — rather than to a password
    // form they have no password for.
    return NextResponse.redirect(`${origin}${next}?link=expired`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

/** Reduces `next` to a path on this origin, or `/dashboard` if it is neither. */
function safePath(value: string, origin: string): string {
  if (value.startsWith("/") && !value.startsWith("//")) return value;

  try {
    const url = new URL(value);
    if (url.origin === origin) return `${url.pathname}${url.search}`;
  } catch {
    // Not a URL at all.
  }

  return "/dashboard";
}
