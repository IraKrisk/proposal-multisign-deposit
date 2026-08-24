"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startDrafting } from "@/lib/draft-job";
import { sendProposalInvite } from "@/lib/notifications";
import { isOwner, NOT_OWNER } from "@/lib/owner";
import { signersOf, type ProposalContent, type ProposalStatus } from "@/lib/types";

export type SaveState = { error: string | null; savedAt: string | null };

/** Persists an edited proposal. RLS scopes the update to the signed-in owner. */
export async function saveProposal(
  id: string,
  content: ProposalContent,
): Promise<SaveState> {
  if (!(await isOwner())) return { error: NOT_OWNER, savedAt: null };

  const supabase = await createClient();

  // Recompute the total server-side so the stored figure always matches the
  // line items, whatever the client sent.
  const total = content.pricing.line_items.reduce(
    (sum, li) => sum + (Number.isFinite(li.amount) ? li.amount : 0),
    0,
  );

  const normalised: ProposalContent = {
    ...content,
    pricing: { ...content.pricing, total },
  };

  const { error } = await supabase
    .from("proposals")
    .update({ content: normalised, title: content.project_title })
    .eq("id", id);

  if (error) return { error: error.message, savedAt: null };

  // Remember the owner's own signature so the next proposal starts with it
  // already chosen. There is no settings page: this is where it gets set.
  if (normalised.sender_signature) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await supabase
        .from("profiles")
        .update({
          signature_font: normalised.sender_signature.font,
          signature_image: normalised.sender_signature.image,
        })
        .eq("id", user.id);
    }
  }

  revalidatePath(`/dashboard/proposals/${id}`);
  revalidatePath("/dashboard");
  return { error: null, savedAt: new Date().toISOString() };
}

export async function setStatus(
  id: string,
  status: ProposalStatus,
): Promise<{ error: string | null }> {
  if (!(await isOwner())) return { error: NOT_OWNER };

  const supabase = await createClient();
  const { error } = await supabase
    .from("proposals")
    .update({ status })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/proposals/${id}`);
  revalidatePath("/dashboard");
  return { error: null };
}

/**
 * Sends the proposal to its client: makes sure a Supabase account exists for
 * the client's address, emails them a one-time sign-in link that lands on the
 * proposal, and marks the proposal sent.
 *
 * The account is created server-side with the service-role key so that public
 * signups can stay closed — only addresses you send a proposal to can ever
 * sign in.
 */
export async function sendToClient(
  id: string,
): Promise<{ error: string | null; sentTo: string | null }> {
  if (!(await isOwner())) return { error: NOT_OWNER, sentTo: null };

  const supabase = await createClient();

  const { data: proposal } = await supabase
    .from("proposals")
    .select("slug, content, status")
    .eq("id", id)
    .maybeSingle<{
      slug: string;
      content: ProposalContent;
      status: ProposalStatus;
    }>();

  if (!proposal) return { error: "Proposal not found.", sentTo: null };

  if (proposal.status === "drafting" || proposal.status === "draft_failed") {
    return {
      error: "This proposal has no copy yet. Wait for drafting to finish.",
      sentTo: null,
    };
  }

  // Every named signer, not just the first. A proposal written before multiple
  // signers existed falls back to its single client contact.
  const signers = signersOf(proposal.content).filter((s) => s.email);

  if (signers.length === 0) {
    return {
      error: "Add at least one signer with an email address before sending.",
      sentTo: null,
    };
  }

  const admin = createAdminClient();

  for (const signer of signers) {
    // Idempotent: re-sending a proposal must not fail because the signer
    // already has an account from the first send.
    const { error: createError } = await admin.auth.admin.createUser({
      email: signer.email,
      email_confirm: true,
      user_metadata: { full_name: signer.name },
    });

    if (
      createError &&
      !/already been registered|already exists/i.test(createError.message)
    ) {
      return {
        error: `Could not create an account for ${signer.email}: ${createError.message}`,
        sentTo: null,
      };
    }

    // The app composes and posts this itself rather than letting Supabase do
    // it. Supabase builds every message from one Site URL setting, so its
    // emails pointed at the deployed site even when running locally.
    const { error: sendError } = await sendProposalInvite({
      to: signer.email,
      clientName: signer.name,
      projectTitle: proposal.content.project_title || "Your proposal",
      senderCompany: proposal.content.prepared_by_company ?? "",
      slug: proposal.slug,
    });

    if (sendError) {
      return {
        error: `Could not email ${signer.email}: ${sendError}`,
        sentTo: null,
      };
    }
  }

  await supabase.from("proposals").update({ status: "sent" }).eq("id", id);

  revalidatePath(`/dashboard/proposals/${id}`);
  revalidatePath("/dashboard");
  return { error: null, sentTo: signers.map((s) => s.email).join(", ") };
}

/**
 * Re-runs the background drafting job for a proposal that failed, or that got
 * stuck because the worker was never reached. The brief is already on the row,
 * so nothing needs re-entering.
 */
export async function retryDrafting(
  id: string,
): Promise<{ error: string | null }> {
  if (!(await isOwner())) return { error: NOT_OWNER };

  const supabase = await createClient();

  // RLS scopes this to the owner, so a stranger cannot restart someone's job.
  const { error: claimError } = await supabase
    .from("proposals")
    .update({ status: "drafting", draft_error: null })
    .eq("id", id);

  if (claimError) return { error: claimError.message };

  try {
    await startDrafting(id);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not start the drafting job.";
    await supabase
      .from("proposals")
      .update({ status: "draft_failed", draft_error: message })
      .eq("id", id);
    return { error: message };
  }

  revalidatePath(`/dashboard/proposals/${id}`);
  return { error: null };
}

export async function deleteProposal(id: string) {
  if (!(await isOwner())) return;

  const supabase = await createClient();
  await supabase.from("proposals").delete().eq("id", id);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
