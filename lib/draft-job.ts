import { createAdminClient } from "./supabase/admin";
import { composeProposal } from "./compose";
import { GenerationRefused } from "./generate";
import type { GenerateInput } from "./generate";
import { signJob } from "./job-auth";
import { siteUrl } from "./site";
import type { Proposal, ProposalContent } from "./types";

/** Where the Netlify Background Function lives. The `-background` suffix is
 *  what tells Netlify to run it asynchronously with a 15 minute limit. */
const WORKER_PATH = "/.netlify/functions/draft-background";

/**
 * Kicks off drafting for a proposal that was just created in `drafting` state.
 *
 * Where a background worker exists this hands off and returns immediately — the
 * model call takes ~30s, which is longer than a request-handling function is
 * allowed to live. Under local `next dev` there is no worker and no timeout to
 * dodge, so it drafts inline instead.
 *
 * The worker is detected by asking for it, not by reading an env var: Netlify
 * sets `NETLIFY` during builds but not in the function runtime, so branching on
 * it silently drafted inline in production and hit the very timeout this exists
 * to avoid.
 */
export async function startDrafting(proposalId: string): Promise<void> {
  let response: Response;

  try {
    response = await fetch(`${siteUrl()}${WORKER_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        proposal_id: proposalId,
        token: signJob(proposalId),
      }),
    });
  } catch {
    // Nothing listening at all — local dev. Draft inline.
    await runDraftJob(proposalId);
    return;
  }

  // Background functions answer 202 as soon as the job is queued.
  if (response.status === 202 || response.ok) return;

  // No such function: this deployment has no worker, so do the work here.
  if (response.status === 404) {
    await runDraftJob(proposalId);
    return;
  }

  throw new Error(`Drafting worker returned ${response.status}.`);
}

/**
 * Drafts a proposal and writes the result back. Runs inside the background
 * worker, so it must never throw — a thrown error there is invisible to the
 * user and would leave the proposal stuck on `drafting` forever. Every failure
 * path ends with the row moved to `draft_failed` and a message the user can act
 * on.
 */
export async function runDraftJob(proposalId: string): Promise<void> {
  const db = createAdminClient();

  const { data: proposal } = await db
    .from("proposals")
    .select("*")
    .eq("id", proposalId)
    .maybeSingle<Proposal>();

  if (!proposal) {
    console.error("draft job: proposal not found", proposalId);
    return;
  }

  const seed = proposal.content ?? ({} as ProposalContent);
  const input: GenerateInput = {
    brief: proposal.brief,
    client_name: seed.client_name ?? "",
    client_company: seed.client_company ?? "",
    client_email: seed.client_email ?? "",
    prepared_by: seed.prepared_by ?? "",
    prepared_by_company: seed.prepared_by_company ?? "",
    currency: seed.pricing?.currency ?? "EUR",
  };

  try {
    const content = await composeProposal(input);

    await db
      .from("proposals")
      .update({
        content,
        title: content.project_title,
        status: "draft",
        draft_error: null,
      })
      .eq("id", proposalId);
  } catch (err) {
    const message =
      err instanceof GenerationRefused
        ? "The model declined to draft this brief. Rephrase it and try again."
        : err instanceof Error
          ? err.message
          : "Drafting failed.";

    console.error("draft job failed", proposalId, err);

    await db
      .from("proposals")
      .update({ status: "draft_failed", draft_error: message })
      .eq("id", proposalId);
  }
}
