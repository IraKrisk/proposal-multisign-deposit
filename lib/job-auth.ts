import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Authentication for the background drafting job.
 *
 * The worker at `/.netlify/functions/draft-background` is a public URL, so
 * without a check anyone could POST to it and burn Anthropic tokens or
 * overwrite someone's proposal. Rather than introduce another secret to
 * configure, each job carries an HMAC of its proposal id keyed by the
 * service-role key. The key itself never leaves the server — only the digest
 * travels — and both caller and worker already have it in their environment.
 */
function jobKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return key;
}

export function signJob(proposalId: string): string {
  return createHmac("sha256", jobKey()).update(proposalId).digest("hex");
}

export function verifyJob(proposalId: string, token: unknown): boolean {
  if (typeof token !== "string" || token.length === 0) return false;

  const expected = Buffer.from(signJob(proposalId), "utf8");
  const given = Buffer.from(token, "utf8");

  // timingSafeEqual throws on length mismatch, so check that first.
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
