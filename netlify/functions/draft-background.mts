import { runDraftJob } from "../../lib/draft-job";
import { verifyJob } from "../../lib/job-auth";

/**
 * Background drafting worker.
 *
 * The `-background` suffix in the filename is what makes this a Netlify
 * Background Function: Netlify answers 202 immediately and lets the body run
 * for up to 15 minutes. Ordinary functions are killed at 30 seconds, which is
 * less than one Claude drafting call takes.
 *
 * Nothing here returns anything useful to a caller — the result is written to
 * the proposals row, and the editor page picks it up.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let proposalId: string;
  let token: unknown;

  try {
    const body = (await request.json()) as {
      proposal_id?: unknown;
      token?: unknown;
    };
    if (typeof body.proposal_id !== "string" || !body.proposal_id) {
      return new Response("Bad request", { status: 400 });
    }
    proposalId = body.proposal_id;
    token = body.token;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // This URL is public. Without this check anyone could drive the model.
  if (!verifyJob(proposalId, token)) {
    return new Response("Forbidden", { status: 403 });
  }

  await runDraftJob(proposalId);

  return new Response(null, { status: 202 });
}
