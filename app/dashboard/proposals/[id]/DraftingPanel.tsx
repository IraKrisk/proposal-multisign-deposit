"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryDrafting } from "./actions";

/** How often to re-check whether the background job has finished. */
const POLL_MS = 3000;

/**
 * Shown in place of the editor while the background drafting job runs, and
 * when it has failed.
 *
 * Drafting happens outside this request, so there is nothing to await — the
 * page just re-reads itself until the row leaves `drafting`. `router.refresh()`
 * re-runs the server component, which is what swaps this panel out for the
 * editor.
 */
export default function DraftingPanel({
  id,
  failed,
  error,
}: {
  id: string;
  failed: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (failed) return;

    const poll = setInterval(() => {
      setSeconds((s) => s + POLL_MS / 1000);
      router.refresh();
    }, POLL_MS);

    return () => clearInterval(poll);
  }, [failed, router]);

  function retry() {
    startTransition(async () => {
      await retryDrafting(id);
      router.refresh();
    });
  }

  if (failed) {
    return (
      <div className="rounded-xl border border-app-bad/35 bg-app-bad/10 p-6">
        <h2 className="font-medium text-app-bad">Drafting failed</h2>
        <p className="mt-2 text-sm text-app-muted">
          {error || "Something went wrong while writing this proposal."}
        </p>
        <p className="mt-2 text-sm text-app-muted">
          Your brief is saved, so retrying uses it again and nothing needs typing.
        </p>
        <button
          className="btn btn-primary mt-5"
          onClick={retry}
          disabled={pending}
        >
          {pending ? "Starting…" : "Retry drafting"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-app-border bg-app-panel p-6">
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-4 w-4 rounded-full border-2 border-app-accent border-t-transparent animate-spin"
          aria-hidden
        />
        <h2 className="font-medium">Writing your proposal…</h2>
      </div>
      <p className="mt-3 text-sm text-app-muted">
        Claude is drafting the body copy. This usually takes about half a
        minute. You can leave this page: the draft is saved when it finishes.
      </p>
      {seconds >= 90 && (
        <p className="mt-3 text-sm text-app-warn">
          Taking longer than usual. It is still running; long briefs take more
          time.
        </p>
      )}
    </div>
  );
}
