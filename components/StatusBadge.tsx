import type { ProposalStatus } from "@/lib/types";

const STYLES: Record<ProposalStatus, { label: string; className: string }> = {
  drafting: { label: "Writing…", className: "bg-app-warn/15 text-app-warn" },
  draft_failed: {
    label: "Drafting failed",
    className: "bg-app-bad/15 text-app-bad",
  },
  draft: { label: "Draft", className: "bg-white/6 text-app-muted" },
  sent: { label: "Sent", className: "bg-app-accent/15 text-app-accent" },
  viewed: { label: "Viewed", className: "bg-app-warn/15 text-app-warn" },
  signed: { label: "Signed", className: "bg-app-good/15 text-app-good" },
  paid: { label: "Signed & paid", className: "bg-app-good/25 text-app-good" },
  declined: { label: "Declined", className: "bg-app-bad/15 text-app-bad" },
};

export default function StatusBadge({ status }: { status: ProposalStatus }) {
  const s = STYLES[status] ?? STYLES.draft;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}
    >
      {s.label}
    </span>
  );
}
