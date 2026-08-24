"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { startDrafting } from "@/lib/draft-job";
import { generateSlug } from "@/lib/crypto";
import type { ProposalContent } from "@/lib/types";
import { isOwner, NOT_OWNER } from "@/lib/owner";

export type CreateState = { error: string | null };

/**
 * Creates a proposal and hands drafting off to a background job.
 *
 * The row is saved before the model is called, so the user gets a page to look
 * at straight away and a failed draft is still recoverable — the brief is on
 * the row and can be retried. Waiting for the model here is not an option:
 * drafting takes about 30s and a Netlify function is killed at 30s.
 */
export async function createProposal(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You are not signed in." };

  // Being signed in is not enough. Client accounts are created automatically
  // when a proposal is sent, and drafting spends the owner's Anthropic credit.
  if (!(await isOwner())) return { error: NOT_OWNER };

  const brief = String(formData.get("brief") ?? "").trim();
  if (brief.length < 40) {
    return {
      error:
        "Give me a bit more to work with: at least a couple of sentences about the client and the work.",
    };
  }

  const clientName = String(formData.get("client_name") ?? "").trim();
  const clientCompany = String(formData.get("client_company") ?? "").trim();
  const clientEmail = String(formData.get("client_email") ?? "").trim();
  const currency = (
    String(formData.get("currency") ?? "EUR").trim() || "EUR"
  ).toUpperCase();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, company_name, default_currency, signature_font, signature_image")
    .eq("id", user.id)
    .maybeSingle();

  // Everything the drafting job needs, minus the parts the model writes. The
  // job reads these back off the row rather than being passed them, so a retry
  // needs no extra state.
  const seed: Partial<ProposalContent> = {
    client_name: clientName,
    client_company: clientCompany,
    client_email: clientEmail,
    // The client contact is signer one. More can be added in the editor.
    signers: clientEmail ? [{ name: clientName, email: clientEmail }] : [],
    // Whatever the owner adopted last time, so it is already set.
    sender_signature: profile?.signature_font
      ? {
          font: profile.signature_font as string,
          image: (profile.signature_image as string | null) ?? null,
        }
      : null,
    prepared_by: profile?.full_name || user.email || "",
    prepared_by_company: profile?.company_name || "",
    pricing: {
      currency,
      line_items: [],
      total: 0,
      payment_mode: "deposit_percent",
      deposit_percent: 50,
      deposit_amount: null,
      payment_terms: "",
    },
  };

  const { data: inserted, error } = await supabase
    .from("proposals")
    .insert({
      owner_id: user.id,
      slug: generateSlug(),
      title: clientCompany || clientName || "Untitled proposal",
      status: "drafting",
      content: seed,
      brief,
    })
    .select("id")
    .single();

  if (error) return { error: `Could not save proposal: ${error.message}` };

  try {
    await startDrafting(inserted.id);
  } catch (err) {
    console.error("could not start drafting", err);
    await supabase
      .from("proposals")
      .update({
        status: "draft_failed",
        draft_error:
          "Could not start the drafting job. Use Retry drafting below.",
      })
      .eq("id", inserted.id);
  }

  redirect(`/dashboard/proposals/${inserted.id}`);
}
