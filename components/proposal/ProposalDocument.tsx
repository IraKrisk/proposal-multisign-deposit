import Prose from "./Prose";
import { signatureFontVar } from "@/lib/signature-fonts";
import {
  amountDueNow,
  formatMoney,
  signersOf,
  type ProposalContent,
  type Signature,
} from "@/lib/types";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * The bevelled red heading banner from the template deck.
 *
 * Spans the column and nothing more, so it reads the same whether the reader
 * has a laptop or a 32-inch monitor. Anything that runs to the window edge
 * strands the heading in a field of empty colour on a wide screen.
 */
function Banner({ children }: { children: React.ReactNode }) {
  return <div className="doc-banner px-6 py-2.5">{children}</div>;
}

/** Width of the reading column. Narrow on purpose — long lines are tiring. */
const COLUMN = "mx-auto max-w-2xl px-8";

export default function ProposalDocument({
  content,
  signatures = [],
  paid,
  children,
}: {
  content: ProposalContent;
  /** Every signature recorded so far, oldest first. */
  signatures?: Signature[];
  paid?: boolean;
  /** Sign / pay panel, rendered after the last section. */
  children?: React.ReactNode;
}) {
  const { pricing } = content;
  const due = amountDueNow(pricing);
  const balance = pricing.total - due;

  const clientCompany = content.client_company?.trim() ?? "";
  // Everybody who has to sign, one to a line, under the company.
  const signerNames = signersOf(content)
    .map((s) => s.name?.trim())
    .filter(Boolean) as string[];

  return (
    <article className="doc min-h-screen overflow-x-hidden">
      {/* Cover — slide 1 --------------------------------------------------- */}
      <header className="pt-16 sm:pt-24 pb-14 sm:pb-20">
        <div className={COLUMN}>
          <Banner>
            <h1 className="doc-display text-[2rem] text-white leading-tight py-[18px]">
              {content.project_title}
            </h1>
          </Banner>

          {content.subtitle && (
            <div className="mt-12 sm:mt-16 inline-block">
              <p className="doc-display text-xl sm:text-3xl text-white">
                {content.subtitle}
              </p>
              <div
                className="mt-2 h-0.5 w-full"
                style={{ background: "var(--red)" }}
              />
            </div>
          )}

          <dl className="mt-16 sm:mt-24 grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-xl">
            <div>
              <dt className="text-base sm:text-lg text-white">Prepared for:</dt>
              <dd className="mt-1.5 text-doc-muted">
                {clientCompany && (
                  <span
                    className="text-white"
                    style={{
                      textDecoration: "underline",
                      textDecorationColor: "var(--red)",
                      textDecorationThickness: "3px",
                    }}
                  >
                    {clientCompany}
                  </span>
                )}
                {signerNames.length === 0 && !clientCompany && "Not given"}
                {signerNames.map((name, i) => (
                  <span key={name + i}>
                    {(i > 0 || clientCompany) && <br />}
                    {name}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-base sm:text-lg text-white">Prepared by:</dt>
              <dd className="mt-1.5 text-doc-muted">
                {content.prepared_by || "Not given"}
                {content.prepared_by_company && (
                  <>
                    <br />
                    {content.prepared_by_company}
                  </>
                )}
                <br />
                {fmtDate(content.proposal_date)}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      {/* Sections — slides 2, 3, and onward -------------------------------- */}
      <div className="space-y-9 pb-24">
        {content.sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-8">
            <div className={COLUMN}>
              <Banner>
                <h2 className="doc-display text-[1.8rem] text-white">
                  {section.heading}
                </h2>
              </Banner>

              <div className="mt-5 rounded-lg border border-doc-rule bg-doc-panel px-8 py-7">
                <Prose body={section.body} />

                {section.kind === "pricing" && (
                  <PricingTable content={content} due={due} balance={balance} />
                )}
              </div>
            </div>
          </section>
        ))}

        {content.sender_signature && (
          <section className={`${COLUMN} mb-14`}>
            <div className="border-t border-doc-rule pt-8 max-w-lg">
              <span className="text-[11px] uppercase tracking-[0.22em] text-doc-muted">
                Prepared and signed by
              </span>
              {content.sender_signature.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={content.sender_signature.image}
                  alt={`${content.prepared_by} signature`}
                  className="mt-3 max-h-20"
                />
              ) : (
                <p
                  className="mt-2 text-3xl text-white"
                  style={{
                    fontFamily: signatureFontVar(content.sender_signature.font),
                  }}
                >
                  {content.prepared_by}
                </p>
              )}
              <div className="mt-3 border-t border-doc-rule w-64" />
              <p className="mt-2 text-sm text-doc-muted">
                {content.prepared_by}
                {content.prepared_by_company
                  ? `, ${content.prepared_by_company}`
                  : ""}
              </p>
            </div>
          </section>
        )}

        {children && <section className={COLUMN}>{children}</section>}
      </div>

      {/* Footer ------------------------------------------------------------ */}
      <footer className="border-t border-doc-rule">
        <div className="mx-auto max-w-2xl px-8 py-10 flex flex-wrap gap-x-6 gap-y-2 justify-between text-sm text-doc-muted">
          <span>
            {content.prepared_by_company || content.prepared_by}
            {content.valid_until
              ? ` · Valid until ${fmtDate(content.valid_until)}`
              : ""}
            {" · "}
            {/* Opens in its own tab: a signer part way through the panel below
                should not lose the page to a policy. */}
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Privacy policy
            </a>
          </span>
          {signatures.length > 0 && (
            <span>
              Signed by{" "}
              {signatures.map((s) => s.signer_name).filter(Boolean).join(", ")}{" "}
              on{" "}
              {new Date(
                signatures[signatures.length - 1].signed_at,
              ).toLocaleDateString("en-IE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {paid ? " · Deposit received" : ""}
            </span>
          )}
        </div>
      </footer>
    </article>
  );
}

function PricingTable({
  content,
  due,
  balance,
}: {
  content: ProposalContent;
  due: number;
  balance: number;
}) {
  const { pricing } = content;

  return (
    <div className="mt-8">
      <div className="rounded-lg border border-doc-rule bg-doc-panel overflow-hidden">
        <table className="w-full text-[15px]">
          <tbody>
            {pricing.line_items.map((li) => (
              <tr key={li.id} className="border-b border-doc-rule last:border-0">
                <td className="px-5 py-4 align-top">
                  <div className="font-medium text-white">{li.name}</div>
                  {li.description && (
                    <div className="text-doc-muted text-sm mt-0.5 max-w-md">
                      {li.description}
                    </div>
                  )}
                </td>
                <td className="px-5 py-4 text-right align-top tabular-nums font-medium text-white whitespace-nowrap">
                  {formatMoney(li.amount, pricing.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "var(--red)" }}>
              <td className="px-5 py-4 font-semibold text-white">Total</td>
              <td className="px-5 py-4 text-right tabular-nums font-semibold text-white whitespace-nowrap">
                {formatMoney(pricing.total, pricing.currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {pricing.payment_mode !== "none" && due > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span className="text-doc-muted">
            Due at signing:{" "}
            <strong className="text-white tabular-nums">
              {formatMoney(due, pricing.currency)}
            </strong>
          </span>
          {balance > 0 && (
            <span className="text-doc-muted">
              Balance on completion:{" "}
              <strong className="text-white tabular-nums">
                {formatMoney(balance, pricing.currency)}
              </strong>
            </span>
          )}
        </div>
      )}

      {pricing.payment_terms && (
        <p className="mt-4 text-sm text-doc-muted max-w-2xl leading-relaxed">
          {pricing.payment_terms}
        </p>
      )}
    </div>
  );
}
