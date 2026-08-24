import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import CopyLink from "@/components/CopyLink";
import StatusBadge from "@/components/StatusBadge";
import ProposalEditor from "./ProposalEditor";
import DraftingPanel from "./DraftingPanel";
import type { Payment, Proposal, Signature } from "@/lib/types";
import { expiryOf, formatMoney, isExpired, signersOf } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proposal } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle<Proposal>();

  if (!proposal) notFound();

  const [{ data: signatureRows }, { data: payments }] = await Promise.all([
    supabase
      .from("signatures")
      .select("*")
      .eq("proposal_id", id)
      .order("signed_at", { ascending: true })
      .returns<Signature[]>(),
    supabase.from("payments").select("*").eq("proposal_id", id),
  ]);

  const signatures = signatureRows ?? [];

  const paid = ((payments ?? []) as Payment[]).find((p) => p.status === "paid");
  const publicUrl = `${siteUrl()}/p/${proposal.slug}`;
  // Editing stops at the first signature. Anything written after that would
  // no longer match the fingerprint the first signer agreed to.
  const locked = signatures.length > 0;
  const signers = signersOf(proposal.content);

  // Until the background job finishes there is no body copy to edit, and no
  // link worth sending.
  const drafting =
    proposal.status === "drafting" || proposal.status === "draft_failed";

  const declinedAt = proposal.declined_at;
  // Only worth flagging while it still matters: once it is signed or paid the
  // date it was open until is history.
  const expired =
    isExpired(proposal.content) &&
    signatures.length < signers.length &&
    proposal.status !== "declined";
  const validUntil = expiryOf(proposal.content);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <Link
            href="/dashboard"
            className="text-sm text-app-muted hover:text-app-fg transition-colors"
          >
            ← All proposals
          </Link>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">
              {proposal.title}
            </h1>
            <StatusBadge status={proposal.status} />
          </div>
        </div>
        {!drafting && (
          <div className="flex gap-2">
            <CopyLink url={publicUrl} />
            <a
              href={`/p/${proposal.slug}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost py-1.5 px-3 text-sm"
            >
              Preview ↗
            </a>
            <a
              href={`/p/${proposal.slug}/pdf`}
              className="btn btn-ghost py-1.5 px-3 text-sm"
            >
              PDF ↓
            </a>
          </div>
        )}
      </div>

      {!drafting && (
        <div className="rounded-lg border border-app-border bg-app-panel-2 px-4 py-3 mb-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-app-muted">Client link</span>
          <code className="text-app-muted break-all">{publicUrl}</code>
        </div>
      )}

      {proposal.status === "declined" && (
        <div className="rounded-xl border border-app-bad/35 bg-app-bad/10 p-5 mb-8">
          <h2 className="font-medium text-app-bad">Declined</h2>
          <p className="mt-2 text-sm">
            {proposal.declined_by_name || "A signer"}
            {proposal.declined_by_email
              ? ` (${proposal.declined_by_email})`
              : ""}{" "}
            declined this proposal
            {declinedAt
              ? ` on ${new Date(declinedAt).toLocaleString("en-US")}`
              : ""}
            .
          </p>
          <p className="mt-3 text-sm text-app-muted">
            {proposal.decline_reason?.trim()
              ? `Reason: ${proposal.decline_reason.trim()}`
              : "They gave no reason."}
          </p>
          <p className="mt-3 text-sm text-app-muted">
            Nobody can sign or pay it now. Write a new proposal to carry on.
          </p>
        </div>
      )}

      {expired && (
        <div className="rounded-xl border border-app-warn/35 bg-app-warn/10 p-5 mb-8">
          <h2 className="font-medium text-app-warn">Expired</h2>
          <p className="mt-2 text-sm">
            This proposal was open until{" "}
            {validUntil?.toLocaleDateString("en-US", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            , so nobody can sign it.
          </p>
          <p className="mt-3 text-sm text-app-muted">
            {locked
              ? "Editing is off because it already carries a signature, so the date cannot be moved. Write a new proposal instead."
              : "Change the valid until date below and save to reopen it."}
          </p>
        </div>
      )}

      {locked && (
        <div className="rounded-xl border border-app-good/35 bg-app-good/10 p-5 mb-8">
          <h2 className="font-medium text-app-good">
            {signatures.length === signers.length
              ? "Signed by all parties"
              : `Signed by ${signatures.length} of ${signers.length}`}
          </h2>

          {signers.map((signer) => {
            const row = signatures.find(
              (sig) =>
                sig.signer_email.trim().toLowerCase() ===
                signer.email.trim().toLowerCase(),
            );

            if (!row) {
              return (
                <p key={signer.email} className="mt-4 text-sm text-app-muted">
                  {signer.name || signer.email}: not yet signed.
                </p>
              );
            }

            return (
              <div
                key={signer.email}
                className="mt-4 pt-4 border-t border-app-border first:border-0 first:pt-0"
              >
                <h3 className="text-sm font-medium">{row.signer_name}</h3>
                <dl className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                  {[
                    ["Email", row.signer_email],
                    [
                      "Signed at",
                      new Date(row.signed_at).toLocaleString("en-US"),
                    ],
                    ["IP address", row.ip_address || "Not recorded"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-app-muted text-xs uppercase tracking-wide">
                        {k}
                      </dt>
                      <dd className="mt-0.5 break-all">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-app-muted break-all">
                  Content hash at signing:{" "}
                  <code className="text-app-muted">{row.content_hash}</code>
                </p>
              </div>
            );
          })}

          {paid && (
            <p className="mt-4 text-sm text-app-good">
              Paid {formatMoney(paid.amount, paid.currency)} on{" "}
              {paid.paid_at
                ? new Date(paid.paid_at).toLocaleDateString("en-US")
                : "Not recorded"}
              .
            </p>
          )}
          <p className="mt-4 text-sm text-app-warn">
            Editing is disabled: this proposal has been signed. Changing it now
            would invalidate the audit trail. Duplicate it instead if you need a
            revised version.
          </p>
        </div>
      )}

      {drafting ? (
        <DraftingPanel
          id={proposal.id}
          failed={proposal.status === "draft_failed"}
          error={proposal.draft_error}
        />
      ) : (
        <ProposalEditor
          id={proposal.id}
          status={proposal.status}
          initialContent={proposal.content}
          locked={locked}
        />
      )}
    </div>
  );
}
