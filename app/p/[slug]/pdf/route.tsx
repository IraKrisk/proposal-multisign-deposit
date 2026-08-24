import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveClientAccess } from "@/lib/client-access";
import { ProposalPdf } from "@/lib/pdf/ProposalPdf";
import type { Payment, Signature } from "@/lib/types";

// Font registration reads TTFs off disk, so this cannot run on the edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Turns a title into something safe to hand a filesystem. */
function fileName(title: string): string {
  const base =
    title
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "proposal";
  return `${base}.pdf`;
}

/**
 * The signed proposal as a downloadable PDF.
 *
 * Access is the same decision as the page itself: the client it was addressed
 * to, or the owner. A slug on its own is not enough.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await resolveClientAccess(slug);

  if (access.status === "not_found" || access.status === "wrong_user") {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }

  if (access.status === "anonymous") {
    return NextResponse.json(
      { error: "Please sign in to download this proposal." },
      { status: 401 },
    );
  }

  const { proposal } = access;

  if (proposal.status === "drafting" || proposal.status === "draft_failed") {
    return NextResponse.json(
      { error: "This proposal has not been written yet." },
      { status: 409 },
    );
  }

  const db = createAdminClient();

  const [{ data: signatures }, { data: payments }] = await Promise.all([
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

  // The owner's address lives on their auth user, not on the proposal, so the
  // signature block has to be told it.
  const { data: owner } = await db.auth.admin.getUserById(proposal.owner_id);

  const buffer = await renderToBuffer(
    <ProposalPdf
      content={proposal.content}
      signatures={signatures ?? []}
      senderEmail={owner?.user?.email ?? null}
      payment={((payments ?? [])[0] ?? null) as Payment | null}
    />,
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName(proposal.content.project_title)}"`,
      // The document changes when it is signed or paid, so never cache it.
      "Cache-Control": "no-store",
    },
  });
}
