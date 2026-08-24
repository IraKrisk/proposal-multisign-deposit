import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";

/** Handles the email-confirmation and magic-link redirect from Supabase. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // The site's own address, not the per deploy host. See app/auth/confirm.
  const origin = siteUrl();
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
