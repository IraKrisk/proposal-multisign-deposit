"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, type AuthState } from "./actions";

const EMPTY: AuthState = { error: null, notice: null };

export default function AuthForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [state, action, pending] = useActionState(signIn, EMPTY);

  return (
    <div className="rounded-xl border border-app-border bg-app-panel p-6">
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        <label className="block">
          <span className="block text-sm text-app-muted mb-1.5">Email</span>
          <input
            className="field"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
          />
        </label>

        <label className="block">
          <span className="block text-sm text-app-muted mb-1.5">Password</span>
          <input
            className="field"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </label>

        {state.error && (
          <p className="text-sm text-app-fg" role="alert">
            {state.error}
          </p>
        )}
        {state.notice && (
          <p className="text-sm text-app-good" role="status">
            {state.notice}
          </p>
        )}

        <button className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Working…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
