import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import { signerFor, type Proposal } from "./types";

export type ClientAccess =
  | { status: "not_found" }
  /** No session — the visitor should be shown the sign-in panel. */
  | { status: "anonymous"; proposal: Proposal }
  /** Signed in, but as somebody other than one of the named signers. */
  | { status: "wrong_user"; proposal: Proposal }
  | {
      status: "ok";
      proposal: Proposal;
      email: string;
      /** The signer this session is, or null when it is the owner looking. */
      signerName: string | null;
    };

/**
 * Single decision point for who may see or act on a proposal's client page.
 *
 * The proposal itself is fetched with the service-role client because there is
 * no RLS policy granting client users access — the check lives here instead, so
 * the page and the sign/checkout endpoints can't drift apart.
 */
export async function resolveClientAccess(
  slug: string,
): Promise<ClientAccess> {
  const db = createAdminClient();
  const { data } = await db
    .from("proposals")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Proposal>();

  if (!data) return { status: "not_found" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { status: "anonymous", proposal: data };

  // Signers are checked first, deliberately. Somebody can be both the author
  // and a named signer on their own proposal, and in that case they still have
  // to be able to sign it. The name comes from the proposal, so it is the
  // author's word for who this is, not the visitor's.
  const signer = signerFor(data.content, user.email);

  if (signer) {
    return {
      status: "ok",
      proposal: data,
      email: user.email,
      signerName: signer.name,
    };
  }

  // The author counts as allowed even when they are not signing. Without this
  // the Preview link 404s for the one person certain to be entitled to look.
  if (user.id === data.owner_id) {
    return {
      status: "ok",
      proposal: data,
      email: user.email,
      signerName: null,
    };
  }

  return { status: "wrong_user", proposal: data };
}
