import { createHash, randomBytes } from "node:crypto";
import type { ProposalContent } from "./types";

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Unguessable public slug. 22 chars of base62 ≈ 131 bits — the proposal URL is
 * the only access control on the client-facing page, so it has to be
 * unbruteforceable, not just unique.
 */
export function generateSlug(length = 22): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Stable stringify so the same content always hashes the same. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

/**
 * Fingerprint of exactly what the signer saw. Stored on the signature row so
 * that a later edit to the proposal is provably a later edit.
 */
export function hashContent(content: ProposalContent): string {
  return createHash("sha256").update(canonical(content)).digest("hex");
}
