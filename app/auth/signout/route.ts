import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";

/**
 * Signs the visitor out and returns them where they came from.
 *
 * The owner's sign out lands on /login, but a client has no password and no
 * business on that page, so this sends them back to the proposal, where they
 * get the panel to request a fresh link.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const form = await request.formData();
  const requested = String(form.get("next") ?? "/");
  const next =
    requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  return NextResponse.redirect(new URL(next, siteUrl()), {
    status: 303,
  });
}
