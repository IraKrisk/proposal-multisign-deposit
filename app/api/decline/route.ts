import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveClientAccess } from "@/lib/client-access";
import {
  sendDeclineToOwner,
  sendDeclineToSigner,
} from "@/lib/notifications";
import { sameEmail, type Proposal } from "@/lib/types";

const Body = z.object({
  slug: z.string().min(8).max(64),
  // Optional on purpose. Somebody who does not want the work should not have
  // to explain themselves before they are allowed to say no.
  reason: z.string().max(1000).optional().default(""),
});

/**
 * Records a signer's refusal.
 *
 * Declining ends the proposal for everybody, not just the person declining:
 * an agreement one named party has refused cannot be completed by the others.
 */
export async function POST(request: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const access = await resolveClientAccess(body.slug);

  if (access.status === "not_found" || access.status === "wrong_user") {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  if (access.status === "anonymous") {
    return NextResponse.json(
      { error: "Please sign in to decline this proposal." },
      { status: 401 },
    );
  }

  // The owner is not a party to their own proposal. If they want it gone, the
  // dashboard deletes it.
  if (access.signerName === null) {
    return NextResponse.json(
      { error: "This proposal is not addressed to you for signature." },
      { status: 403 },
    );
  }

  const { proposal, email, signerName } = access;
  const db = createAdminClient();

  // Already refused. Whoever got here twice sees the same outcome as the first
  // time rather than an error.
  if (proposal.status === "declined") {
    return NextResponse.json({ ok: true, already: true });
  }

  const { data: signed } = await db
    .from("signatures")
    .select("signer_email")
    .eq("proposal_id", proposal.id);

  if ((signed ?? []).some((r) => sameEmail(r.signer_email, email))) {
    return NextResponse.json(
      { error: "You have already signed this proposal." },
      { status: 409 },
    );
  }

  const { data: paidRow } = await db
    .from("payments")
    .select("id")
    .eq("proposal_id", proposal.id)
    .eq("status", "paid")
    .limit(1);

  if ((paidRow?.length ?? 0) > 0 || proposal.status === "paid") {
    return NextResponse.json(
      { error: "This proposal has been paid and cannot be declined." },
      { status: 409 },
    );
  }

  const reason = body.reason.trim();

  const { error: updateError } = await db
    .from("proposals")
    .update({
      status: "declined",
      declined_at: new Date().toISOString(),
      declined_by_name: signerName,
      declined_by_email: email,
      decline_reason: reason,
    })
    .eq("id", proposal.id);

  if (updateError) {
    console.error("decline update failed", updateError);
    return NextResponse.json(
      { error: "Could not record that. Please try again." },
      { status: 500 },
    );
  }

  // The refusal is recorded, so nothing below may fail the request.
  await notifyOfDecline(proposal, signerName, email, reason).catch((err) =>
    console.error("decline email failed", err),
  );

  return NextResponse.json({ ok: true, already: false });
}

/** Tells the owner, and confirms to the person who declined. Never throws. */
async function notifyOfDecline(
  proposal: Proposal,
  signerName: string,
  signerEmail: string,
  reason: string,
) {
  const title = proposal.content.project_title || proposal.title;
  const company = proposal.content.prepared_by_company ?? "";

  const toSigner = await sendDeclineToSigner({
    to: signerEmail,
    signerName,
    projectTitle: title,
    senderCompany: company,
  });
  if (toSigner.error) console.error("signer decline email", toSigner.error);

  const admin = createAdminClient();
  const { data: owner } = await admin.auth.admin.getUserById(proposal.owner_id);
  const ownerEmail = owner?.user?.email;

  if (!ownerEmail) {
    console.error("no owner address for proposal", proposal.id);
    return;
  }

  const toOwner = await sendDeclineToOwner({
    to: ownerEmail,
    proposalId: proposal.id,
    signerName,
    signerEmail,
    projectTitle: title,
    reason,
  });
  if (toOwner.error) console.error("owner decline email", toOwner.error);
}
