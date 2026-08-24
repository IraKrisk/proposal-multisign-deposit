import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Lazily constructed so that a missing key fails at request time with a clear
 * message rather than at module load, which would break unrelated routes.
 *
 * `apiVersion` is intentionally omitted — the SDK pins the version it was built
 * against, which is what its own types describe.
 */
export function stripe(): Stripe {
  if (cached) return cached;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");

  cached = new Stripe(key, { typescript: true });
  return cached;
}
