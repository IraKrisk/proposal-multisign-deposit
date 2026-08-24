import { NextResponse, type NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { finalisePayment } from "@/lib/finalise";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";

/**
 * Where Stripe returns a payer to.
 *
 * The webhook does the same work, but it only reaches localhost while
 * `stripe listen` is running, and the signature parked against this payment
 * must be written the moment the money is real. So both paths call the same
 * idempotent function and whichever arrives first wins.
 *
 * The session id in the URL is not trusted on its own: it is looked up at
 * Stripe, and nothing happens unless Stripe itself says it is paid.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const sessionId = request.nextUrl.searchParams.get("session_id");
  const back = new URL(`/p/${slug}`, siteUrl());

  if (!sessionId) {
    back.searchParams.set("cancelled", "1");
    return NextResponse.redirect(back);
  }

  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid") {
      await finalisePayment(session.id);
      back.searchParams.set("paid", "1");
    } else {
      back.searchParams.set("cancelled", "1");
    }
  } catch (err) {
    console.error("could not settle checkout session", sessionId, err);
    back.searchParams.set("cancelled", "1");
  }

  return NextResponse.redirect(back);
}
