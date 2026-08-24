"use client";

import { useState } from "react";
import { requestSignInLink } from "@/app/p/[slug]/actions";

/**
 * Shown in place of the proposal when the visitor isn't signed in as the client
 * it was addressed to. Sends a single use link to their inbox; the proposal URL
 * itself stays permanent and bookmarkable.
 */
export default function ClientSignIn({
  slug,
  preparedByCompany,
  expired = false,
}: {
  slug: string;
  preparedByCompany: string;
  /** Set when they arrived from a sign-in link that had already been used or
   *  had run out. Links are single-use and short-lived by design. */
  expired?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // The app builds and posts this link itself, so it points at whichever host
    // the app is running on. Supabase composes from a single Site URL setting,
    // which meant a local app emailed links to the deployed site.
    const state = await requestSignInLink(slug, email);

    if (state.error) {
      setError(state.error);
      setBusy(false);
      return;
    }

    setSent(true);
    setBusy(false);
  }

  return (
    <main className="doc min-h-screen grid place-items-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="text-[11px] uppercase tracking-[0.22em] text-doc-muted mb-3">
          {preparedByCompany || "Proposal"}
        </div>

        <div className="doc-banner mb-8">
          <h1 className="doc-display px-6 py-3 text-xl text-white">
            {sent ? "Check your email" : "Sign in to view this proposal"}
          </h1>
        </div>

        {sent ? (
          <p className="text-doc-muted leading-relaxed">
            If <strong className="text-white">{email}</strong> is the address
            this proposal was sent to, a sign in link is on its way. Click it and
            you&apos;ll land straight back here.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {expired && (
              <p
                className="rounded-md border px-4 py-3 text-sm leading-relaxed"
                style={{ borderColor: "var(--red)", color: "var(--text)" }}
                role="status"
              >
                That sign in link has already been used or has expired. Enter
                your address below and we&apos;ll send a fresh one.
              </p>
            )}

            <p className="text-doc-muted leading-relaxed">
              Enter the email address this proposal was sent to. We&apos;ll send
              you a single use link, no password to create or remember.
            </p>

            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.ie"
              className="w-full rounded-md border border-doc-rule bg-doc-panel-2 px-4 py-2.5 text-white placeholder:text-doc-muted/60 outline-none transition-colors focus:border-doc-accent-bright focus:ring-3 focus:ring-doc-accent-bright/25"
            />

            {error && (
              <p className="text-sm" style={{ color: "var(--text)" }} role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || email.trim().length < 3}
              className="inline-flex items-center justify-center rounded-md px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: "var(--red)" }}
            >
              {busy ? "Sending…" : "Email me a sign in link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
