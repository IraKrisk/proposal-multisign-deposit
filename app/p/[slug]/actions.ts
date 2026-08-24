"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendProposalInvite } from "@/lib/notifications";
import { signerFor, type ProposalContent } from "@/lib/types";

export type SignInState = { error: string | null; sent: boolean };

/**
 * Emails a fresh sign in link to a client who has landed on a proposal without
 * a session, or whose last link had already been used.
 *
 * This runs on the server rather than in the browser because the link is now
 * generated and posted by the app. The guard below matters: `generateLink`
 * creates an account for any address it has not seen, so an address that was
 * never written to must be refused here, before it reaches that call.
 */
export async function requestSignInLink(
  slug: string,
  rawEmail: string,
): Promise<SignInState> {
  const email = rawEmail.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return { error: "Please enter an email address.", sent: false };
  }

  const db = createAdminClient();
  const { data: proposal } = await db
    .from("proposals")
    .select("slug, content")
    .eq("slug", slug)
    .maybeSingle<{ slug: string; content: ProposalContent }>();

  if (!proposal) {
    return { error: "Proposal not found.", sent: false };
  }

  // Any of the named signers, not only the first. Checked here because
  // `generateLink` mints an account for an address it has not seen, so an
  // address nobody meant to write to must be refused before that call.
  const signer = signerFor(proposal.content, email);

  // Saying so plainly is a deliberate choice: it tells a client who mistyped
  // their address what actually went wrong, at the cost of letting somebody
  // holding the link probe for which address it was sent to.
  if (!signer) {
    return {
      error:
        "No account exists for that address. This proposal was sent to a different email: check with whoever sent it to you.",
      sent: false,
    };
  }

  const { error } = await sendProposalInvite({
    to: email,
    clientName: signer.name,
    projectTitle: proposal.content.project_title || "Your proposal",
    senderCompany: proposal.content.prepared_by_company ?? "",
    slug: proposal.slug,
  });

  if (error) {
    return { error: "Could not send the link. Please try again.", sent: false };
  }

  return { error: null, sent: true };
}
