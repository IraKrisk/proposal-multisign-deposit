import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StatusBadge from "@/components/StatusBadge";
import CopyLink from "@/components/CopyLink";
import { amountDueNow, formatMoney, type Proposal } from "@/lib/types";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proposals")
    .select("*")
    .order("created_at", { ascending: false });

  const proposals = (data ?? []) as Proposal[];

  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proposals</h1>
          <p className="text-sm text-app-muted mt-1">
            {proposals.length === 0
              ? "Nothing here yet."
              : `${proposals.length} proposal${proposals.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Link href="/dashboard/new" className="btn btn-primary">
          Create new proposal
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-app-bad/40 bg-app-bad/10 p-4 text-sm text-app-bad mb-6">
          Could not load proposals: {error.message}
        </div>
      )}

      {proposals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-app-border p-12 text-center">
          <h2 className="text-lg font-medium">Create your first proposal</h2>
          <p className="text-sm text-app-muted mt-2 max-w-md mx-auto">
            Describe the engagement in a paragraph or two. Claude drafts the
            full document from your template; you edit the pricing and send the
            link.
          </p>
          <Link href="/dashboard/new" className="btn btn-primary mt-6">
            Create new proposal
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {proposals.map((p) => {
            const due = p.content?.pricing
              ? amountDueNow(p.content.pricing)
              : 0;
            const currency = p.content?.pricing?.currency ?? "USD";
            const total = p.content?.pricing?.total ?? 0;

            return (
              <li
                key={p.id}
                className="rounded-xl border border-app-border bg-app-panel p-5 hover:border-app-accent/50 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Link
                        href={`/dashboard/proposals/${p.id}`}
                        className="font-medium hover:text-app-accent transition-colors"
                      >
                        {p.title}
                      </Link>
                      <StatusBadge status={p.status} />
                    </div>
                    <p className="text-sm text-app-muted mt-1">
                      {p.content?.client_company || p.content?.client_name || "No client yet"}
                      {" · "}
                      {new Date(p.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-medium tabular-nums">
                        {formatMoney(total, currency)}
                      </div>
                      {due > 0 && due !== total && (
                        <div className="text-xs text-app-muted tabular-nums">
                          {formatMoney(due, currency)} due at signing
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <CopyLink url={`${siteUrl()}/p/${p.slug}`} />
                      <Link
                        href={`/dashboard/proposals/${p.id}`}
                        className="btn btn-ghost py-1.5 px-3 text-sm"
                      >
                        Edit
                      </Link>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
