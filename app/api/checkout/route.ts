import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveClientAccess } from "@/lib/client-access";
import { stripe } from "@/lib/stripe";
import { siteUrl } from "@/lib/site";
import {
  amountDueNow,
  expiryOf,
  formatMoney,
  isExpired,
  signersOf,
} from "@/lib/types";
import { hashContent } from "@/lib/crypto";
import {
  DEFAULT_SIGNATURE_FONT,
  SIGNATURE_FONT_KEYS,
} from "@/lib/signature-fonts";
import type { PendingSignature } from "@/lib/finalise";

const Body = z.object({
  slug: z.string().min(8).max(64),
  // Present only when this checkout is completing the proposal: the signature
  // is parked on the payment row and written when the money lands.
  signature: z
    .object({
      font: z.enum(SIGNATURE_FONT_KEYS).optional().default(DEFAULT_SIGNATURE_FONT),
      image: z
        .string()
        .regex(/^data:image\/(png|jpeg|gif|bmp);base64,[A-Za-z0-9+/=]+$/)
        .max(4_400_000)
        .nullish(),
    })
    .optional(),
});

/** Creates a Stripe Checkout session for the amount due at signing. */
export async function POST(request: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const slug = body.slug;

  const access = await resolveClientAccess(slug);

  if (access.status === "not_found" || access.status === "wrong_user") {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  if (access.status === "anonymous") {
    return NextResponse.json(
      { error: "Please sign in to pay this proposal." },
      { status: 401 },
    );
  }

  const { proposal } = access;
  const db = createAdminClient();

  // Deliberately no "sign it first" gate. Any named signer may pay at any
  // point, in any order; the proposal is simply not complete until both the
  // signatures and the money have landed. `resolveClientAccess` above is what
  // keeps this route shut to everybody else.

  if (proposal.status === "declined") {
    return NextResponse.json(
      { error: "This proposal was declined and can no longer be paid." },
      { status: 409 },
    );
  }

  // Expiry closes a proposal to acceptance, not to money already agreed. Once
  // everybody has signed, the deposit stays payable however long it takes.
  if (isExpired(proposal.content)) {
    const { data: signedRows } = await db
      .from("signatures")
      .select("id")
      .eq("proposal_id", proposal.id);

    const allSigned =
      (signedRows?.length ?? 0) >= signersOf(proposal.content).length;

    if (!allSigned) {
      const end = expiryOf(proposal.content);
      const when = end
        ? end.toLocaleDateString("en-IE", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "";
      return NextResponse.json(
        { error: `This proposal expired on ${when}.` },
        { status: 409 },
      );
    }
  }

  const { data: alreadyPaid } = await db
    .from("payments")
    .select("id")
    .eq("proposal_id", proposal.id)
    .eq("status", "paid")
    .maybeSingle();

  if (alreadyPaid) {
    return NextResponse.json(
      { error: "This proposal has already been paid." },
      { status: 409 },
    );
  }

  const { pricing } = proposal.content;
  const amount = amountDueNow(pricing);

  if (amount <= 0) {
    return NextResponse.json(
      { error: "No payment is due on this proposal." },
      { status: 400 },
    );
  }

  const base = siteUrl();

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      // Whoever is paying, which need not be whoever signed first.
      customer_email: access.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: pricing.currency.toLowerCase(),
            unit_amount: amount,
            product_data: {
              name: proposal.content.project_title,
              description:
                pricing.payment_mode === "full"
                  ? "Full project fee"
                  : `Deposit: ${formatMoney(amount, pricing.currency)} of ${formatMoney(pricing.total, pricing.currency)}`,
            },
          },
        },
      ],
      // The webhook is the source of truth; these identify the proposal there.
      metadata: {
        proposal_id: proposal.id,
        proposal_slug: proposal.slug,
      },
      // Not straight back to the proposal: that route settles the payment and
      // writes any parked signature, so this works without the webhook, which
      // on localhost only arrives while `stripe listen` is running.
      success_url: `${base}/p/${proposal.slug}/paid?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/p/${proposal.slug}?cancelled=1`,
    });

    if (!session.url) throw new Error("Stripe returned no checkout URL.");

    // Built here, from the proposal and the session. The browser sends only a
    // font and an image; it cannot put a name on a contract.
    const held: PendingSignature | null =
      body.signature && access.signerName
        ? {
            signer_name: access.signerName,
            signer_email: access.email,
            signature_font: body.signature.font,
            signature_image: body.signature.image ?? null,
            content_hash: hashContent(proposal.content),
            ip_address:
              request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
              null,
            user_agent: request.headers.get("user-agent"),
          }
        : null;

    await db.from("payments").insert({
      proposal_id: proposal.id,
      stripe_session_id: session.id,
      amount,
      currency: pricing.currency,
      status: "pending",
      pending_signature: held,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("checkout session failed", err);
    return NextResponse.json(
      { error: "Could not open checkout. Please try again." },
      { status: 500 },
    );
  }
}
