import { Suspense } from "react";
import AuthForm from "./AuthForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen grid place-items-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="text-[11px] uppercase tracking-[0.22em] text-app-muted mb-3">
            Proposal Generator
          </div>
          {/* Same red heading bar as the proposal document. */}
          <div className="doc-banner">
            <h1 className="px-6 py-3 text-xl text-white">
              Sign in to your workspace
            </h1>
          </div>
        </div>
        <Suspense fallback={null}>
          <AuthForm />
        </Suspense>
      </div>
    </main>
  );
}
