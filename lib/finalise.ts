import { createAdminClient } from "./supabase/admin";
import { signersOf, type Proposal } from "./types";

/** A signature held back until the deposit is paid. Stored on the payment row. */
export type PendingSignature = {
  signer_name: string;
  signer_email: string;
  signature_font: string;
  signature_image: string | null;
  content_hash: string;
  ip_address: string | null;
  user_agent: string | null;
};

/**
 * Settles everything that follows a successful payment: marks the payment paid,
 * writes the signature that was held back for it, and moves the proposal on.
 *
 * The last signer on a proposal with money outstanding never gets their
 * signature recorded at the moment they press the button. It is parked on the
 * payment row and written here, so a cancelled checkout leaves no signature
 * behind and the agreement cannot exist unpaid.
 *
 * Safe to run twice: the webhook and the return from Stripe both call it, and
 * whichever arrives first does the work. The unique index on
 * (proposal_id, lower(signer_email)) makes the insert idempotent.
 */
export async function finalisePayment(sessionId: string): Promise<void> {
  const db = createAdminClient();

  const { data: payment } = await db
    .from("payments")
    .select("id, proposal_id, status, pending_signature")
    .eq("stripe_session_id", sessionId)
    .maybeSingle<{
      id: string;
      proposal_id: string;
      status: string;
      pending_signature: PendingSignature | null;
    }>();

  if (!payment) {
    console.error("no payment row for stripe session", sessionId);
    return;
  }

  if (payment.status !== "paid") {
    await db
      .from("payments")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", payment.id);
  }

  if (payment.pending_signature) {
    const held = payment.pending_signature;

    const { error } = await db.from("signatures").insert({
      proposal_id: payment.proposal_id,
      signer_name: held.signer_name,
      signer_email: held.signer_email,
      signature_font: held.signature_font,
      signature_image: held.signature_image,
      content_hash: held.content_hash,
      ip_address: held.ip_address,
      user_agent: held.user_agent,
    });

    // 23505 is the unique index: somebody already wrote this signature, which
    // is the outcome we wanted anyway.
    if (error && error.code !== "23505") {
      console.error("held signature insert failed", error);
      return;
    }

    await db
      .from("payments")
      .update({ pending_signature: null })
      .eq("id", payment.id);
  }

  // Only 'paid' once every named signer has a row. Money alone is not the deal.
  const { data: proposal } = await db
    .from("proposals")
    .select("*")
    .eq("id", payment.proposal_id)
    .maybeSingle<Proposal>();

  if (!proposal) return;

  const { data: rows } = await db
    .from("signatures")
    .select("id")
    .eq("proposal_id", proposal.id);

  const complete = (rows?.length ?? 0) >= signersOf(proposal.content).length;

  await db
    .from("proposals")
    .update({ status: complete ? "paid" : "signed" })
    .eq("id", proposal.id);
}
