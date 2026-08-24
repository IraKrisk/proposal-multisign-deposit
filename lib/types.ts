// Core data model for proposals.
//
// `sections` is deliberately generic so the default template can be swapped
// without a schema migration: the template defines which sections exist and in
// what order, the AI fills `body` for each one.

export type SectionKind =
  | "cover"
  | "narrative"
  | "bullets"
  | "phases"
  | "pricing"
  | "terms";

export type ProposalSection = {
  /** Stable id, unique within a proposal. Used as the anchor target. */
  id: string;
  /** Heading shown to the client. */
  heading: string;
  /** Markdown-ish body. Supports paragraphs and `- ` bullet lines. */
  body: string;
  kind: SectionKind;
};

export type LineItem = {
  id: string;
  name: string;
  description: string;
  /** Minor units (cents). Never floats — money is integers. */
  amount: number;
};

export type PaymentMode = "full" | "deposit_percent" | "deposit_fixed" | "none";

export type Pricing = {
  /** ISO-4217, uppercase. */
  currency: string;
  line_items: LineItem[];
  /** Minor units. Sum of line items unless overridden. */
  total: number;
  payment_mode: PaymentMode;
  /** 1-100, used when payment_mode === "deposit_percent". */
  deposit_percent: number | null;
  /** Minor units, used when payment_mode === "deposit_fixed". */
  deposit_amount: number | null;
  /** Free text shown under the pricing table, e.g. remaining balance terms. */
  payment_terms: string;
};

/** One person who has to sign. Named by the owner, never by the signer. */
export type Signer = {
  name: string;
  email: string;
};

/** The owner's own signature, as it stood when this proposal was written. */
export type SenderSignature = {
  /** Key from lib/signature-fonts.ts. */
  font: string;
  /** A drawn or uploaded signature as a data URL. Wins over the typed name. */
  image: string | null;
};

export type ProposalContent = {
  client_name: string;
  client_company: string;
  client_email: string;
  /** Everybody who has to sign. Absent on proposals written before multiple
   *  signers existed, which is what `signersOf` covers. */
  signers?: Signer[];
  /** Absent until the owner adopts a signature. */
  sender_signature?: SenderSignature | null;
  project_title: string;
  /** Short line under the title on the cover. */
  subtitle: string;
  prepared_by: string;
  prepared_by_company: string;
  /** ISO date string (yyyy-mm-dd). */
  proposal_date: string;
  /** ISO date string. Shown as "valid until". Nullable. */
  valid_until: string | null;
  sections: ProposalSection[];
  pricing: Pricing;
};

export type ProposalStatus =
  /** Claude is writing the body copy in a background job. No content yet. */
  | "drafting"
  /** The background job failed. `draft_error` says why; the user can retry. */
  | "draft_failed"
  | "draft"
  | "sent"
  | "viewed"
  | "signed"
  | "paid"
  | "declined";

export type Proposal = {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  status: ProposalStatus;
  content: ProposalContent;
  /** The one-or-two paragraph brief the user typed. Kept for regeneration. */
  brief: string;
  /** Set only when status is `draft_failed`. */
  draft_error: string | null;
  /** Set when a signer declined. Null on every other proposal. */
  declined_at: string | null;
  declined_by_name: string | null;
  declined_by_email: string | null;
  /** What the signer typed as their reason. Empty when they gave none. */
  decline_reason: string | null;
  created_at: string;
  updated_at: string;
  first_viewed_at: string | null;
};

export type Signature = {
  id: string;
  proposal_id: string;
  signer_name: string;
  signer_email: string;
  signer_title: string;
  /** Which script face they signed in. See lib/signature-fonts.ts. */
  signature_font: string | null;
  /** A drawn or uploaded signature, as a data URL. Takes precedence over the
   *  typed name when present. */
  signature_image: string | null;
  /** Initials, as adopted alongside the signature. */
  signature_initials: string | null;
  /** SHA-256 of the content that was on screen when they signed. */
  content_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  signed_at: string;
};

export type Payment = {
  id: string;
  proposal_id: string;
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed";
  created_at: string;
  paid_at: string | null;
};

/** Two addresses are the same person. Case and stray spaces do not count. */
export function sameEmail(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

/**
 * Everybody who has to sign a proposal.
 *
 * Proposals written before multiple signers existed have no `signers` array, so
 * they fall back to the single client contact. That keeps every row already in
 * the database working without a migration.
 */
export function signersOf(content: ProposalContent): Signer[] {
  const listed = (content.signers ?? []).filter((s) => s?.email?.trim());

  if (listed.length > 0) {
    return listed.map((s) => ({
      name: s.name?.trim() ?? "",
      email: s.email.trim(),
    }));
  }

  return [
    {
      name: content.client_name?.trim() ?? "",
      email: content.client_email?.trim() ?? "",
    },
  ];
}

/** The signer a given signed-in address corresponds to, if any. */
export function signerFor(
  content: ProposalContent,
  email: string | null | undefined,
): Signer | null {
  return signersOf(content).find((s) => sameEmail(s.email, email)) ?? null;
}

/**
 * The moment a proposal stops being open, or null when it never does.
 *
 * "Valid until 3 September" means the whole of the 3rd is still in time, so the
 * deadline is the end of that day, not its start.
 */
export function expiryOf(content: ProposalContent): Date | null {
  const iso = content.valid_until?.trim();
  if (!iso) return null;

  const end = new Date(`${iso}T23:59:59.999`);
  return Number.isNaN(end.getTime()) ? null : end;
}

/** Whether the date on the proposal has passed. No date means no expiry. */
export function isExpired(
  content: ProposalContent,
  now: Date = new Date(),
): boolean {
  const end = expiryOf(content);
  return end !== null && now.getTime() > end.getTime();
}

/** What the client actually owes at signing, given the pricing config. */
export function amountDueNow(pricing: Pricing): number {
  switch (pricing.payment_mode) {
    case "full":
      return pricing.total;
    case "deposit_percent":
      return Math.round((pricing.total * (pricing.deposit_percent ?? 0)) / 100);
    case "deposit_fixed":
      return pricing.deposit_amount ?? 0;
    case "none":
      return 0;
  }
}

export function formatMoney(minorUnits: number, currency: string): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: minorUnits % 100 === 0 ? 0 : 2,
  }).format(minorUnits / 100);
}
