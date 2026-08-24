import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveClientAccess } from "@/lib/client-access";
import ProposalDocument from "@/components/proposal/ProposalDocument";
import ClientSignIn from "@/components/proposal/ClientSignIn";
import SignPanel from "@/components/proposal/SignPanel";
import SuccessOverlay from "@/components/proposal/SuccessOverlay";
import { isExpired, type Payment, type Signature } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { slug: string };
type Search = { paid?: string; cancelled?: string; link?: string };

export async function generateMetadata(): Promise<Metadata> {
  // Deliberately generic: the title is visible before sign-in, so it must not
  // leak the client's name or the project.
  return {
    title: "Proposal",
    robots: { index: false, follow: false },
  };
}

export default async function PublicProposalPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const { paid, cancelled, link } = await searchParams;

  const access = await resolveClientAccess(slug);

  if (access.status === "not_found") notFound();

  if (access.status === "anonymous") {
    return (
      <ClientSignIn
        slug={slug}
        preparedByCompany={access.proposal.content?.prepared_by_company ?? ""}
        expired={link === "expired"}
      />
    );
  }

  // Signed in as somebody else. Indistinguishable from a bad slug on purpose.
  if (access.status === "wrong_user") notFound();

  const { proposal } = access;

  // A proposal whose copy has not been written yet has nothing to show and
  // nothing to sign. Treated as non-existent rather than rendered empty.
  if (proposal.status === "drafting" || proposal.status === "draft_failed") {
    notFound();
  }

  const db = createAdminClient();

  const [{ data: signatureRows }, { data: payments }] = await Promise.all([
    db
      .from("signatures")
      .select("*")
      .eq("proposal_id", proposal.id)
      .order("signed_at", { ascending: true })
      .returns<Signature[]>(),
    db
      .from("payments")
      .select("*")
      .eq("proposal_id", proposal.id)
      .eq("status", "paid")
      .limit(1),
  ]);

  const signatures = signatureRows ?? [];
  const payment = ((payments ?? [])[0] ?? null) as Payment | null;

  if (!proposal.first_viewed_at) {
    await db
      .from("proposals")
      .update({
        first_viewed_at: new Date().toISOString(),
        ...(proposal.status === "sent" ? { status: "viewed" } : {}),
      })
      .eq("id", proposal.id);
  }

  const isPaid = Boolean(payment) || proposal.status === "paid";

  // A proposal an owner marked declined by hand carries no name or reason, so
  // both fall back rather than the panel losing the state altogether.
  const decline =
    proposal.status === "declined"
      ? {
          name: proposal.declined_by_name ?? "",
          reason: proposal.decline_reason ?? "",
          at: proposal.declined_at ?? proposal.updated_at,
        }
      : null;

  // Worked out here, on the server, so the panel and the sign endpoint agree
  // about the date whatever the visitor's own clock says.
  const expired = isExpired(proposal.content);

  return (
    <>
      {/* Who you are signed in as, and how to stop being them. A client has no
          password, so signing out returns them to this page rather than to a
          login form. */}
      <div className="doc border-b border-doc-rule">
        <div className="mx-auto max-w-2xl px-8 py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <span className="text-doc-muted">
            Signed in as <span className="text-white">{access.email}</span>
          </span>
          <form action="/auth/signout" method="post">
            <input type="hidden" name="next" value={`/p/${slug}`} />
            <button
              type="submit"
              className="text-doc-muted underline underline-offset-2 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      {paid === "1" && (
        <SuccessOverlay clientName={proposal.content.client_name} />
      )}

      <ProposalDocument
        content={proposal.content}
        signatures={signatures}
        paid={isPaid}
      >
        <SignPanel
          slug={proposal.slug}
          content={proposal.content}
          signatures={signatures}
          paid={isPaid}
          cancelled={cancelled === "1"}
          expired={expired}
          decline={decline}
          signerName={access.signerName}
          signerEmail={access.email}
        />
      </ProposalDocument>
    </>
  );
}
