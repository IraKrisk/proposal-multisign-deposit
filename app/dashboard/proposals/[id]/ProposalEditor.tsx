"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveProposal, sendToClient, deleteProposal } from "./actions";
import {
  amountDueNow,
  formatMoney,
  signersOf,
  type LineItem,
  type PaymentMode,
  type ProposalContent,
  type ProposalStatus,
  type Signer,
} from "@/lib/types";
import { DEFAULT_SIGNATURE_FONT } from "@/lib/signature-fonts";
import SignatureControl, {
  type SignatureValue,
  type SignMode,
} from "@/components/proposal/SignatureControl";

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "deposit_percent", label: "Deposit: percentage of total" },
  { value: "deposit_fixed", label: "Deposit: fixed amount" },
  { value: "full", label: "Full amount at signing" },
  { value: "none", label: "No payment at signing" },
];

/** Money inputs work in major units; storage is always minor units. */
function toMajor(minor: number): string {
  return (minor / 100).toFixed(2).replace(/\.00$/, "");
}
function toMinor(major: string): number {
  const n = Number.parseFloat(major.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0;
}

export default function ProposalEditor({
  id,
  status,
  initialContent,
  locked,
}: {
  id: string;
  status: ProposalStatus;
  initialContent: ProposalContent;
  locked: boolean;
}) {
  const [content, setContent] = useState<ProposalContent>(initialContent);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [signatureMode, setSignatureMode] = useState<SignMode>(
    initialContent.sender_signature?.image ? "upload" : "style",
  );

  // Deliberately not `signersOf`: that drops entries with no email yet, which
  // is exactly what a row you have only just added looks like.
  const signers: Signer[] =
    content.signers && content.signers.length > 0
      ? content.signers
      : signersOf(content);
  const senderSignature: SignatureValue = {
    font: (content.sender_signature?.font ??
      DEFAULT_SIGNATURE_FONT) as SignatureValue["font"],
    image: content.sender_signature?.image ?? null,
  };

  /** Writes the whole list back, materialising it on a proposal that had none. */
  function patchSigners(next: Signer[]) {
    patch({ signers: next });
  }

  const total = useMemo(
    () => content.pricing.line_items.reduce((s, li) => s + li.amount, 0),
    [content.pricing.line_items],
  );
  const due = useMemo(
    () => amountDueNow({ ...content.pricing, total }),
    [content.pricing, total],
  );

  function patch(next: Partial<ProposalContent>) {
    setContent((c) => ({ ...c, ...next }));
    setDirty(true);
    setMessage(null);
  }

  function patchPricing(next: Partial<ProposalContent["pricing"]>) {
    setContent((c) => ({ ...c, pricing: { ...c.pricing, ...next } }));
    setDirty(true);
    setMessage(null);
  }

  function patchLineItem(index: number, next: Partial<LineItem>) {
    setContent((c) => {
      const items = c.pricing.line_items.map((li, i) =>
        i === index ? { ...li, ...next } : li,
      );
      return { ...c, pricing: { ...c.pricing, line_items: items } };
    });
    setDirty(true);
    setMessage(null);
  }

  function addLineItem() {
    setContent((c) => ({
      ...c,
      pricing: {
        ...c.pricing,
        line_items: [
          ...c.pricing.line_items,
          {
            id: `li_${Date.now()}`,
            name: "",
            description: "",
            amount: 0,
          },
        ],
      },
    }));
    setDirty(true);
  }

  function removeLineItem(index: number) {
    setContent((c) => ({
      ...c,
      pricing: {
        ...c.pricing,
        line_items: c.pricing.line_items.filter((_, i) => i !== index),
      },
    }));
    setDirty(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveProposal(id, { ...content, pricing: { ...content.pricing, total } });
      if (res.error) {
        setError(res.error);
      } else {
        setDirty(false);
        setMessage("Saved.");
      }
    });
  }

  function send() {
    if (dirty) {
      setError("Save your changes before sending.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await sendToClient(id);
      if (res.error) setError(res.error);
      else setMessage(`Sign in link sent to ${res.sentTo}.`);
    });
  }

  const disabled = locked || pending;

  return (
    <div className="space-y-10 pb-28">
      {/* Client & meta ---------------------------------------------------- */}
      <Panel title="Client & document">
        <div className="grid sm:grid-cols-2 gap-4">
          <Text
            label="Project title"
            value={content.project_title}
            onChange={(v) => patch({ project_title: v })}
            disabled={disabled}
          />
          <Text
            label="Subtitle"
            value={content.subtitle}
            onChange={(v) => patch({ subtitle: v })}
            disabled={disabled}
          />
          <Text
            label="Client company"
            value={content.client_company}
            onChange={(v) => patch({ client_company: v })}
            disabled={disabled}
          />
          <Text
            label="Your company"
            value={content.prepared_by_company}
            onChange={(v) => patch({ prepared_by_company: v })}
            disabled={disabled}
          />
          <div className="grid grid-cols-2 gap-4">
            <Text
              label="Date"
              type="date"
              value={content.proposal_date}
              onChange={(v) => patch({ proposal_date: v })}
              disabled={disabled}
            />
            <Text
              label="Valid until"
              type="date"
              value={content.valid_until ?? ""}
              onChange={(v) => patch({ valid_until: v || null })}
              disabled={disabled}
            />
          </div>
          <Text
            label="Prepared by"
            value={content.prepared_by}
            onChange={(v) => patch({ prepared_by: v })}
            disabled={disabled}
          />
        </div>
      </Panel>

      {/* Signers ----------------------------------------------------------- */}
      <Panel title="Who signs">
        <p className="text-sm text-app-muted mb-5 max-w-xl leading-relaxed">
          Everybody listed here gets their own link and signs separately. They
          cannot change the name you enter. The proposal is complete once all of
          them have signed.
        </p>

        <div className="space-y-4">
          {signers.map((signer, i) => (
            <div
              key={i}
              className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] items-start"
            >
              <input
                className="field"
                placeholder="Name"
                value={signer.name}
                disabled={disabled}
                onChange={(e) =>
                  patchSigners(
                    signers.map((s, si) =>
                      si === i ? { ...s, name: e.target.value } : s,
                    ),
                  )
                }
              />
              <input
                className="field"
                type="email"
                placeholder="Email"
                value={signer.email}
                disabled={disabled}
                onChange={(e) =>
                  patchSigners(
                    signers.map((s, si) =>
                      si === i ? { ...s, email: e.target.value } : s,
                    ),
                  )
                }
              />
              <button
                type="button"
                onClick={() =>
                  patchSigners(signers.filter((_, si) => si !== i))
                }
                disabled={disabled || signers.length === 1}
                className="btn btn-ghost px-3 py-2 text-app-muted"
                aria-label="Remove signer"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => patchSigners([...signers, { name: "", email: "" }])}
            disabled={disabled}
            className="btn btn-ghost text-sm"
          >
            + Add signer
          </button>
        </div>
      </Panel>

      {/* The owner's own signature ----------------------------------------- */}
      <Panel title="Your signature">
        <p className="text-sm text-app-muted mb-5 max-w-xl leading-relaxed">
          Printed on the proposal and in the PDF, above your client&apos;s. Set
          it once: the next proposal you write starts with the same one.
        </p>

        <div className="max-w-lg">
          <SignatureControl
            previewName={content.prepared_by}
            value={senderSignature}
            onChange={(next) =>
              patch({ sender_signature: { font: next.font, image: next.image } })
            }
            mode={signatureMode}
            onModeChange={setSignatureMode}
            disabled={disabled}
            onError={setError}
          />
        </div>
      </Panel>

      {/* Sections ---------------------------------------------------------- */}
      <Panel title="Sections">
        <div className="space-y-10">
          {content.sections.map((section, i) => (
            <div key={section.id}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs tabular-nums text-app-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <input
                  className="field field-heading font-medium"
                  value={section.heading}
                  disabled={disabled}
                  onChange={(e) => {
                    const heading = e.target.value;
                    patch({
                      sections: content.sections.map((s, si) =>
                        si === i ? { ...s, heading } : s,
                      ),
                    });
                  }}
                />
              </div>
              <AutoTextarea
                className="leading-relaxed"
                value={section.body}
                disabled={disabled}
                onChange={(body) =>
                  patch({
                    sections: content.sections.map((s, si) =>
                      si === i ? { ...s, body } : s,
                    ),
                  })
                }
              />
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-app-muted">
          Blank line starts a new paragraph. A line beginning with{" "}
          <code>- </code> becomes a bullet. <code>**text**</code> renders bold.
        </p>
      </Panel>

      {/* Pricing ----------------------------------------------------------- */}
      <Panel title="Pricing">
        <div className="space-y-4">
          {content.pricing.line_items.map((li, i) => (
            <div
              key={li.id}
              className="grid gap-3 sm:grid-cols-[1fr_1.4fr_150px_auto] items-start"
            >
              <input
                className="field"
                placeholder="Item"
                value={li.name}
                disabled={disabled}
                onChange={(e) => patchLineItem(i, { name: e.target.value })}
              />
              <input
                className="field"
                placeholder="Description"
                value={li.description}
                disabled={disabled}
                onChange={(e) =>
                  patchLineItem(i, { description: e.target.value })
                }
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-app-muted text-sm">
                  {content.pricing.currency}
                </span>
                <input
                  className="field pl-12 text-right tabular-nums"
                  inputMode="decimal"
                  value={toMajor(li.amount)}
                  disabled={disabled}
                  onChange={(e) =>
                    patchLineItem(i, { amount: toMinor(e.target.value) })
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => removeLineItem(i)}
                disabled={disabled}
                className="btn btn-ghost px-3 py-2 text-app-muted"
                aria-label="Remove line item"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addLineItem}
            disabled={disabled}
            className="btn btn-ghost text-sm"
          >
            + Add line item
          </button>
        </div>

        <div className="mt-6 pt-6 border-t border-app-border grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm text-app-muted mb-1.5">
              Payment at signing
            </span>
            <select
              className="field"
              value={content.pricing.payment_mode}
              disabled={disabled}
              onChange={(e) =>
                patchPricing({ payment_mode: e.target.value as PaymentMode })
              }
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          {content.pricing.payment_mode === "deposit_percent" && (
            <label className="block">
              <span className="block text-sm text-app-muted mb-1.5">
                Deposit percentage
              </span>
              <input
                className="field tabular-nums"
                type="number"
                min={1}
                max={100}
                value={content.pricing.deposit_percent ?? 50}
                disabled={disabled}
                onChange={(e) =>
                  patchPricing({
                    deposit_percent: Math.min(
                      100,
                      // 1 is the floor. A deposit of nothing is not a deposit:
                      // the way to ask for no money up front is the payment
                      // mode, not a zero here.
                      Math.max(1, Number(e.target.value) || 1),
                    ),
                  })
                }
              />
            </label>
          )}

          {content.pricing.payment_mode === "deposit_fixed" && (
            <label className="block">
              <span className="block text-sm text-app-muted mb-1.5">
                Deposit amount ({content.pricing.currency})
              </span>
              <input
                className="field tabular-nums"
                inputMode="decimal"
                value={toMajor(content.pricing.deposit_amount ?? 0)}
                disabled={disabled}
                onChange={(e) =>
                  patchPricing({ deposit_amount: toMinor(e.target.value) })
                }
              />
            </label>
          )}
        </div>

        <label className="block mt-4">
          <span className="block text-sm text-app-muted mb-1.5">
            Payment terms (shown under the table)
          </span>
          <AutoTextarea
            value={content.pricing.payment_terms}
            disabled={disabled}
            onChange={(v) => patchPricing({ payment_terms: v })}
          />
        </label>

        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span className="text-app-muted">
            Total:{" "}
            <strong className="text-app-fg tabular-nums">
              {formatMoney(total, content.pricing.currency)}
            </strong>
          </span>
          <span className="text-app-muted">
            Due at signing:{" "}
            <strong className="text-app-fg tabular-nums">
              {formatMoney(due, content.pricing.currency)}
            </strong>
          </span>
        </div>
      </Panel>

      <div>
        <button
          type="button"
          onClick={() => {
            if (confirm("Delete this proposal? This cannot be undone.")) {
              startTransition(() => {
                void deleteProposal(id);
              });
            }
          }}
          className="btn btn-ghost text-sm text-app-bad"
        >
          Delete proposal
        </button>
      </div>

      {/* Sticky action bar -------------------------------------------------- */}
      <div className="fixed bottom-0 inset-x-0 border-t border-app-border bg-app-panel/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm min-h-5">
            {error && <span className="text-app-bad">{error}</span>}
            {!error && message && (
              <span className="text-app-good">{message}</span>
            )}
            {!error && !message && dirty && (
              <span className="text-app-muted">Unsaved changes</span>
            )}
          </div>
          <div className="flex gap-2">
            {!locked && (
              <button onClick={send} disabled={pending} className="btn btn-ghost">
                {status === "draft" ? "Send to client" : "Send the link again"}
              </button>
            )}
            <button
              onClick={save}
              disabled={disabled || !dirty}
              className="btn btn-primary"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Textarea that grows to fit its content instead of scrolling inside itself, so
 * a whole section is readable at once while editing.
 */
function AutoTextarea({
  value,
  onChange,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Layout effect so the height is right before paint — otherwise every section
  // visibly jumps from one row to full height on load.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // Wrapping changes with the container width, so re-measure on resize.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`field resize-none overflow-hidden ${className}`}
    />
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-app-border bg-app-panel p-8">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-app-muted mb-7">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Text({
  label,
  value,
  onChange,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-sm text-app-muted mb-1.5">{label}</span>
      <input
        className="field"
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
