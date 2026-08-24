import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveClientAccess } from "@/lib/client-access";
import { hashContent } from "@/lib/crypto";
import {
  sendCompletionToClient,
  sendCompletionToOwner,
} from "@/lib/notifications";
import {
  amountDueNow,
  expiryOf,
  isExpired,
  signersOf,
  type Proposal,
} from "@/lib/types";
import {
  DEFAULT_SIGNATURE_FONT,
  SIGNATURE_FONT_KEYS,
} from "@/lib/signature-fonts";

/**
 * The body carries the signature and nothing else.
 *
 * Who is signing is decided from the session and the proposal's own signer
 * list, never from what the browser sends. That is what stops a client editing
 * the name on a contract they were named on.
 */
const Body = z.object({
  slug: z.string().min(8).max(64),
  // Validated against the known keys, so nothing arbitrary reaches the column.
  signature_font: z
    .enum(SIGNATURE_FONT_KEYS)
    .optional()
    .default(DEFAULT_SIGNATURE_FONT),
  // A drawn or uploaded signature, as a data URL. Restricted to image types
  // and to roughly 3MB once base64 expansion is accounted for, so the column
  // cannot be used to store arbitrary payloads.
  signature_image: z
    .string()
    .regex(
      /^data:image\/(png|jpeg|gif|bmp);base64,[A-Za-z0-9+/=]+$/,
      "Unsupported image.",
    )
    .max(4_400_000)
    .nullish(),
});

/** Records one signer's electronic signature and the audit trail around it. */
export async function POST(request: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Please choose a signature and try again." },
      { status: 400 },
    );
  }

  // Knowing a slug is not enough — the caller has to be signed in as one of the
  // people the proposal names. Without this, gating only the page would leave
  // signing reachable by anyone who has ever seen a link.
  const access = await resolveClientAccess(body.slug);

  if (access.status === "not_found" || access.status === "wrong_user") {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  if (access.status === "anonymous") {
    return NextResponse.json(
      { error: "Please sign in to sign this proposal." },
      { status: 401 },
    );
  }

  // The owner can read their own proposal but is not one of its signers.
  if (access.signerName === null) {
    return NextResponse.json(
      { error: "This proposal is not addressed to you for signature." },
      { status: 403 },
    );
  }

  const { proposal, email, signerName } = access;
  const db = createAdminClient();

  if (proposal.status === "declined") {
    return NextResponse.json(
      { error: "This proposal is no longer open for signature." },
      { status: 409 },
    );
  }

  // The date on the proposal is the date it closes. A signature after it would
  // be a signature on terms the owner has stopped standing behind.
  if (isExpired(proposal.content)) {
    return NextResponse.json(
      { error: `This proposal expired on ${expiryLabel(proposal)}.` },
      { status: 409 },
    );
  }

  const due = amountDueNow(proposal.content.pricing);
  const signers = signersOf(proposal.content);

  const { data: rows } = await db
    .from("signatures")
    .select("signer_email")
    .eq("proposal_id", proposal.id);

  const already = rows ?? [];
  const mine = already.some(
    (r) => r.signer_email?.trim().toLowerCase() === email.trim().toLowerCase(),
  );

  const { data: paidRow } = await db
    .from("payments")
    .select("id")
    .eq("proposal_id", proposal.id)
    .eq("status", "paid")
    .limit(1);

  const settled = (paidRow?.length ?? 0) > 0 || proposal.status === "paid";
  const wouldComplete = !mine && already.length + 1 >= signers.length;

  // The signature that completes an unpaid proposal is not written here. It is
  // handed to checkout and parked on the payment row, so backing out at Stripe
  // leaves no signature behind and the agreement cannot exist unpaid.
  if (wouldComplete && due > 0 && !settled) {
    return NextResponse.json({
      ok: true,
      hold_for_payment: true,
      payment_required: true,
      all_signed: false,
      signed_count: already.length,
      signer_count: signers.length,
    });
  }

  // Idempotent, so a double submit or a back-button doesn't error this signer
  // out of the flow.
  if (!mine) {
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : null;

    const { error: sigError } = await db.from("signatures").insert({
      proposal_id: proposal.id,
      // Both taken from the proposal and the session, never from the body.
      signer_name: signerName,
      signer_email: email,
      signature_font: body.signature_font,
      signature_image: body.signature_image ?? null,
      content_hash: hashContent(proposal.content),
      ip_address: ip,
      user_agent: request.headers.get("user-agent"),
    });

    // A unique index collision means a concurrent request won the race, which
    // is the same outcome as this one succeeding.
    if (sigError && sigError.code !== "23505") {
      console.error("signature insert failed", sigError);
      return NextResponse.json(
        { error: "Could not record the signature. Please try again." },
        { status: 500 },
      );
    }
  }

  const signedCount = mine ? already.length : already.length + 1;
  const allSigned = signedCount >= signers.length;

  if (allSigned) {
    await db
      .from("proposals")
      .update({ status: "signed" })
      .eq("id", proposal.id)
      .neq("status", "paid");

    // The signatures are already recorded, so nothing below may fail the
    // request. Somebody who signed successfully must not be shown an error
    // because an inbox was unreachable.
    await notifyOfCompletion(proposal, due).catch((err) =>
      console.error("completion email failed", err),
    );
  }

  return NextResponse.json({
    ok: true,
    // Money is independent of order: anybody may pay, and the last signature
    // cannot finish the proposal while it is outstanding.
    payment_required: due > 0 && !settled,
    hold_for_payment: false,
    all_signed: allSigned,
    signed_count: signedCount,
    signer_count: signers.length,
  });
}

/** Emails every signer their copy, and the owner the news. Never throws. */
async function notifyOfCompletion(proposal: Proposal, due: number) {
  const title = proposal.content.project_title || proposal.title;
  const signers = signersOf(proposal.content);

  for (const signer of signers) {
    const sent = await sendCompletionToClient({
      to: signer.email,
      signerName: signer.name,
      projectTitle: title,
      slug: proposal.slug,
    });
    if (sent.error) console.error("client completion email", sent.error);
  }

  // The owner has no row in `content`, only an id on the proposal.
  const admin = createAdminClient();
  const { data: owner } = await admin.auth.admin.getUserById(proposal.owner_id);
  const ownerEmail = owner?.user?.email;

  if (!ownerEmail) {
    console.error("no owner address for proposal", proposal.id);
    return;
  }

  const names = signers.map((s) => s.name).filter(Boolean).join(", ");

  const toOwner = await sendCompletionToOwner({
    to: ownerEmail,
    proposalId: proposal.id,
    signerName: names || "Your client",
    signerEmail: signers[0]?.email ?? "",
    projectTitle: title,
    amountDue: due,
    currency: proposal.content.pricing.currency,
  });
  if (toOwner.error) console.error("owner completion email", toOwner.error);
}

/** The valid-until date, written the way the proposal writes it. */
function expiryLabel(proposal: Proposal): string {
  const end = expiryOf(proposal.content);
  if (!end) return "";
  return end.toLocaleDateString("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
