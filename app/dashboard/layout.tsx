import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/owner";
import { signOut } from "../login/actions";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A signed in client is not a workspace user. Shown rather than redirected:
  // `/` sends visitors to `/dashboard`, so a redirect would loop.
  const owner = await isOwner();

  return (
    <div className="min-h-screen">
      <header className="border-b border-app-border bg-app-panel/60 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-4xl px-8 h-14 flex items-center justify-between gap-4">
          <Link
            href="/dashboard"
            className="text-sm font-semibold tracking-tight"
          >
            Proposal Generator
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-app-muted hidden sm:inline">
              {user?.email}
            </span>
            <form action={signOut}>
              <button className="btn btn-ghost py-1.5 px-3 text-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-8 py-14">
        {owner ? (
          children
        ) : (
          <div className="rounded-xl border border-app-border bg-app-panel p-8 max-w-xl">
            <h1 className="text-lg font-medium">This area is not for you</h1>
            <p className="mt-3 text-app-muted leading-relaxed">
              Your account can read and sign the proposals sent to you, nothing
              else. Open the link you were emailed to get to yours.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
