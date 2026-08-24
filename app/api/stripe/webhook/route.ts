import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalisePayment } from "@/lib/finalise";

/**
 * Stripe webhook. This — not the browser redirect — is what marks a proposal
 * paid: the client can close the tab before the redirect fires, and the
 * redirect URL can be forged.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  // Raw body — parsing it first would break signature verification.
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    console.error("webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const db = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.payment_status !== "paid") break;

      if (!session.metadata?.proposal_id) {
        console.error("checkout session missing proposal_id", session.id);
        break;
      }

      // Marks the payment paid, writes any signature parked against it, and
      // moves the proposal on. Shared with the return from Stripe, and safe to
      // run twice.
      await finalisePayment(session.id);

      // Kept from before: the intent id is the reference for a refund.
      await db
        .from("payments")
        .update({
          stripe_payment_intent_id:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
        })
        .eq("stripe_session_id", session.id);

      break;
    }

    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      await db
        .from("payments")
        .update({ status: "failed" })
        .eq("stripe_session_id", session.id)
        .eq("status", "pending");
      break;
    }

    default:
      // Everything else is acknowledged and ignored.
      break;
  }

  return NextResponse.json({ received: true });
}
