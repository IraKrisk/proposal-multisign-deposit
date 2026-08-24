import type { GenerateInput } from "./generate";
import { generateProposal } from "./generate";
import type { LineItem, ProposalContent } from "./types";

/** How long a proposal stays valid, in days, from the date it is drafted. */
const VALID_FOR_DAYS = 30;

/** Default deposit when a proposal is first created. Editable afterwards. */
const DEFAULT_DEPOSIT_PERCENT = 50;

/**
 * Drafts a proposal and assembles the full `ProposalContent` stored on the row.
 *
 * Kept separate from the server action so the same assembly can be exercised
 * outside a request with a signed-in user.
 */
export async function composeProposal(
  input: GenerateInput,
): Promise<ProposalContent> {
  const drafted = await generateProposal(input);

  const lineItems: LineItem[] = drafted.line_items.map((li, i) => ({
    id: `li_${i + 1}`,
    name: li.name,
    description: li.description,
    // Money is stored in minor units. Never floats.
    amount: Math.max(0, Math.round(li.amount_major * 100)),
  }));

  const total = lineItems.reduce((sum, li) => sum + li.amount, 0);

  const today = new Date();
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + VALID_FOR_DAYS);

  return {
    client_name: input.client_name,
    client_company: input.client_company,
    client_email: input.client_email,
    project_title: drafted.project_title,
    subtitle: drafted.subtitle,
    prepared_by: input.prepared_by,
    prepared_by_company: input.prepared_by_company,
    proposal_date: today.toISOString().slice(0, 10),
    valid_until: validUntil.toISOString().slice(0, 10),
    sections: drafted.sections,
    pricing: {
      currency: input.currency,
      line_items: lineItems,
      total,
      payment_mode: "deposit_percent",
      deposit_percent: DEFAULT_DEPOSIT_PERCENT,
      deposit_amount: null,
      payment_terms: drafted.payment_terms,
    },
  };
}
