"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  amountDueNow,
  formatMoney,
  sameEmail,
  signersOf,
  type ProposalContent,
  type Signature,
} from "@/lib/types";
import {
  DEFAULT_SIGNATURE_FONT,
  signatureFontVar,
  type SignatureFontKey,
} from "@/lib/signature-fonts";
import SignatureControl, {
  signatureReady,
  type SignatureValue,
  type SignMode,
} from "./SignatureControl";

const buttonClass =
  "inline-flex items-center justify-center rounded-md px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40";

export default function SignPanel({
  slug,
  content,
  signatures,
  paid,
  cancelled,
  /** Worked out on the server, so the panel does not depend on the visitor's
   *  own clock being right. */
  expired,
  /** Who refused and why, or null if nobody has. */
  decline,
  /** Who this visitor is, taken from the proposal. Null when the owner looks. */
  signerName,
  signerEmail,
}: {
  slug: string;
  content: ProposalContent;
  signatures: Signature[];
  paid: boolean;
  cancelled: boolean;
  expired: boolean;
  decline: { name: string; reason: string; at: string } | null;
  signerName: string | null;
  signerEmail: string;
}) {
  const router = useRouter();
  const due = amountDueNow(content.pricing);
  const paymentRequired = due > 0;

  const signers = signersOf(content);
  const mine =
    signatures.find((s) => sameEmail(s.signer_email, signerEmail)) ?? null;
  const outstanding = signers.filter(
    (s) => !signatures.some((row) => sameEmail(row.signer_email, s.email)),
  );
  const allSigned = outstanding.length === 0;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [mode, setMode] = useState<SignMode>("style");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [signature, setSignature] = useState<SignatureValue>({
    font: DEFAULT_SIGNATURE_FONT,
    image: null,
  });

  /** `withSignature` parks this signature against the payment, to be written
   *  only if the money lands. Used when this signature would complete an
   *  unpaid proposal. */
  async function startCheckout(withSignature = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          ...(withSignature
            ? {
                signature: {
                  font: signature.font,
                  image: mode === "style" ? null : signature.image,
                },
              }
            : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not start checkout.");
      window.location.href = json.url as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  async function submitDecline() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not record that.");
      router.refresh();
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  async function submitSignature(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          signature_font: signature.font,
          // Only a drawn or uploaded signature carries an image; the style tab
          // falls back to rendering the name the owner entered.
          signature_image: mode === "style" ? null : signature.image,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not record signature.");

      // Nothing was written: this signature completes an unpaid proposal, so
      // it only exists if the payment goes through.
      if (json.hold_for_payment) {
        await startCheckout(true);
        return;
      }

      if (json.all_signed && json.payment_required) {
        await startCheckout();
        return;
      }
      router.refresh();
      // Without this the panel comes back with every button still disabled and
      // the Pay button reading "Opening secure checkout".
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  // ---- Declined ------------------------------------------------------------

  if (decline) {
    return (
      <Section>
        <h2 className="doc-display text-2xl sm:text-3xl text-white">
          This proposal was declined
        </h2>
        <p className="mt-3 leading-relaxed max-w-xl text-doc-muted">
          {decline.name || "A signer"} declined it on{" "}
          {new Date(decline.at).toLocaleDateString("en-IE", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          . Nothing was signed and nothing was charged.
        </p>
        {decline.reason && (
          <p className="mt-4 max-w-xl border-l-2 pl-4 leading-relaxed text-doc-muted"
             style={{ borderColor: "var(--red)" }}>
            {decline.reason}
          </p>
        )}
        <p className="mt-4 leading-relaxed max-w-xl text-doc-muted">
          {signerName === null
            ? "It can no longer be signed. Write a new proposal if you want to carry on."
            : "It can no longer be signed. If that was a mistake, reply to the sender and ask for a fresh proposal."}
        </p>
      </Section>
    );
  }

  // ---- Everybody signed, nothing outstanding -------------------------------

  if (allSigned && (paid || !paymentRequired)) {
    return (
      <Section>
        <div className="flex items-start gap-4">
          <CheckMark />
          <div>
            <h2 className="doc-display text-2xl sm:text-3xl text-white">
              We&apos;re underway
            </h2>
            <p className="mt-3 leading-relaxed max-w-xl text-doc-muted">
              Signed by{" "}
              {signatures.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && (i === signatures.length - 1 ? " and " : ", ")}
                  <strong
                    className="text-white text-2xl align-middle"
                    style={{ fontFamily: signatureFontVar(s.signature_font) }}
                  >
                    {s.signer_name}
                  </strong>
                </span>
              ))}
              {paid && paymentRequired ? (
                <>
                  , with{" "}
                  <strong className="text-white">
                    {formatMoney(due, content.pricing.currency)}
                  </strong>{" "}
                  received.
                </>
              ) : (
                "."
              )}
            </p>

            <a
              href={`/p/${slug}/pdf`}
              className={`${buttonClass} mt-6`}
              style={{ background: "var(--red)" }}
            >
              Download the signed PDF
            </a>
          </div>
        </div>
      </Section>
    );
  }

  // ---- Everybody signed, money outstanding ---------------------------------

  if (allSigned && paymentRequired && !paid) {
    return (
      <Section>
        <h2 className="doc-display text-2xl sm:text-3xl text-white">
          One step left
        </h2>
        <p className="mt-3 leading-relaxed max-w-xl text-doc-muted">
          Everybody has signed. To hold the start date, complete the{" "}
          {formatMoney(due, content.pricing.currency)} payment below.
        </p>
        {cancelled && <Cancelled />}
        {error && <Problem>{error}</Problem>}
        <PayButton
          busy={busy}
          due={due}
          currency={content.pricing.currency}
          onClick={() => startCheckout()}
        />
      </Section>
    );
  }

  // ---- Past its date --------------------------------------------------------

  if (expired) {
    return (
      <Section>
        <h2 className="doc-display text-2xl sm:text-3xl text-white">
          This proposal has expired
        </h2>
        <p className="mt-3 leading-relaxed max-w-xl text-doc-muted">
          It was open until{" "}
          {new Date(`${content.valid_until}T00:00:00`).toLocaleDateString(
            "en-IE",
            { day: "numeric", month: "long", year: "numeric" },
          )}
          , so it can no longer be signed.
        </p>
        <p className="mt-4 leading-relaxed max-w-xl text-doc-muted">
          {signerName === null
            ? "Change the date in your dashboard and send it again, or write a new one."
            : "If you still want to go ahead, reply to the sender and ask for a fresh proposal."}
        </p>
        {signatures.length > 0 && (
          <SignerList signatures={signatures} content={content} />
        )}
      </Section>
    );
  }

  // ---- The owner looking at their own proposal -----------------------------

  if (signerName === null) {
    return (
      <Section>
        <h2 className="doc-display text-2xl sm:text-3xl text-white">
          Awaiting signature
        </h2>
        <p className="mt-3 leading-relaxed max-w-xl text-doc-muted">
          You are looking at your own proposal, so there is nothing here for you
          to sign.
        </p>
        <SignerList signatures={signatures} content={content} />
      </Section>
    );
  }

  // ---- This person has signed, others have not -----------------------------

  if (mine) {
    return (
      <Section>
        <h2 className="doc-display text-2xl sm:text-3xl text-white">
          Your signature is recorded
        </h2>
        <p className="mt-3 leading-relaxed max-w-xl text-doc-muted">
          Thank you. The proposal is complete once{" "}
          {outstanding.length === 1
            ? outstanding[0].name || "the other signer"
            : `the other ${outstanding.length} signers`}{" "}
          {outstanding.length === 1 ? "has" : "have"} signed.
        </p>
        <SignerList signatures={signatures} content={content} />
        {cancelled && <Cancelled />}
        {error && <Problem>{error}</Problem>}
        {paymentRequired && !paid && (
          <>
            <p className="mt-6 leading-relaxed max-w-xl text-doc-muted">
              The {formatMoney(due, content.pricing.currency)} deposit is still
              outstanding. Any signer can settle it.
            </p>
            <PayButton
              busy={busy}
              due={due}
              currency={content.pricing.currency}
              onClick={() => startCheckout()}
            />
          </>
        )}
      </Section>
    );
  }

  // ---- Not yet signed ------------------------------------------------------

  return (
    <Section>
      <h2 className="doc-display text-2xl sm:text-3xl text-white">
        Accept this proposal
      </h2>
      <p className="mt-3 leading-relaxed max-w-xl text-doc-muted">
        Choose how your signature should look, then sign.
        {paymentRequired && signers.length === 1 && (
          <>
            {" "}
            You&apos;ll then be taken to secure checkout for the{" "}
            {formatMoney(due, content.pricing.currency)} due at signing.
          </>
        )}
      </p>

      {signers.length > 1 && (
        <SignerList signatures={signatures} content={content} />
      )}

      <form onSubmit={submitSignature} className="mt-8 space-y-5 max-w-lg">
        <div>
          <span className="block text-sm font-medium text-white mb-1.5">
            Signing as
          </span>
          {/* Set by whoever wrote the proposal. Not editable here: the name on a
              contract is not the signer's to change. */}
          <div
            className="signature-field"
            style={{ fontFamily: signatureFontVar(signature.font) }}
          >
            {signerName}
          </div>
          <p className="mt-1.5 text-xs text-doc-muted">{signerEmail}</p>
        </div>

        <div>
          <span className="block text-sm font-medium text-white mb-2">
            Choose your signature
          </span>
          <SignatureControl
            previewName={signerName}
            value={signature}
            onChange={setSignature}
            mode={mode}
            onModeChange={setMode}
            disabled={busy}
            onError={setError}
          />
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 h-4 w-4"
            style={{ accentColor: "var(--red)" }}
          />
          <span className="text-sm text-doc-muted leading-relaxed">
            By signing I agree to the terms of this proposal and intend this to
            be my electronic signature, legally equivalent to a handwritten one.
          </span>
        </label>

        {cancelled && <Cancelled />}
        {error && <Problem>{error}</Problem>}

        <button
          type="submit"
          disabled={busy || !agreed || !signatureReady(mode, signature)}
          className={buttonClass}
          style={{ background: "var(--red)" }}
        >
          {busy
            ? "Working…"
            : paymentRequired && signers.length === 1
              ? `Sign and pay ${formatMoney(due, content.pricing.currency)}`
              : "Sign and accept"}
        </button>

        <p className="text-xs text-doc-muted">
          Your name, email, IP address, and the time of signing are recorded as
          the audit trail for this agreement.
        </p>
      </form>

      {/* Outside the form on purpose: a button inside one defaults to submit,
          so pressing it inside would sign instead of decline. */}
      <div className="mt-8 pt-6 border-t border-doc-rule max-w-lg">
        {!declining ? (
          <>
            <p className="leading-relaxed text-doc-muted">
              Not going ahead? You can say so here instead of leaving it
              unanswered.
            </p>
            <button
              type="button"
              onClick={() => setDeclining(true)}
              disabled={busy}
              className="mt-4 inline-flex items-center justify-center rounded-md border border-doc-rule px-6 py-3 font-medium text-white transition-colors hover:bg-white/5 disabled:opacity-40"
            >
              Decline to sign
            </button>
          </>
        ) : (
          <>
            <p className="leading-relaxed text-doc-muted">
              This closes the proposal for everybody named on it. Nothing is
              signed and nothing is charged.
            </p>
            <label className="block mt-4">
              <span className="block text-sm font-medium text-white mb-1.5">
                Reason, if you want to give one
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={1000}
                disabled={busy}
                className="w-full resize-y rounded-md border border-doc-rule bg-doc-panel-2 px-4 py-2.5 text-white placeholder:text-doc-muted/60 outline-none transition-colors focus:border-doc-accent-bright focus:ring-3 focus:ring-doc-accent-bright/25"
              />
            </label>
            {error && <Problem>{error}</Problem>}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={submitDecline}
                disabled={busy}
                className={buttonClass}
                style={{ background: "var(--red)" }}
              >
                {busy ? "Working…" : "Confirm and decline"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeclining(false);
                  setError(null);
                }}
                disabled={busy}
                className="inline-flex items-center justify-center rounded-md border border-doc-rule px-6 py-3 font-medium text-white transition-colors hover:bg-white/5 disabled:opacity-40"
              >
                Keep reading
              </button>
            </div>
          </>
        )}
      </div>

      {paymentRequired && !paid && (
        <div className="mt-8 pt-6 border-t border-doc-rule max-w-lg">
          <p className="leading-relaxed text-doc-muted">
            The {formatMoney(due, content.pricing.currency)} deposit is
            outstanding. Any signer can settle it, before or after signing.
          </p>
          <PayButton
            busy={busy}
            due={due}
            currency={content.pricing.currency}
            onClick={() => startCheckout()}
          />
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section
      id="sign"
      className="rounded-lg border border-doc-rule bg-doc-panel p-8 sm:p-10 scroll-mt-8"
    >
      {children}
    </section>
  );
}

/** Who has signed and who has not. Only worth showing for a group. */
function SignerList({
  signatures,
  content,
}: {
  signatures: Signature[];
  content: ProposalContent;
}) {
  const signers = signersOf(content);
  if (signers.length < 2) return null;

  return (
    <ul className="mt-6 space-y-2 max-w-lg">
      {signers.map((s) => {
        const row = signatures.find((sig) => sameEmail(sig.signer_email, s.email));
        return (
          <li
            key={s.email}
            className="flex items-baseline justify-between gap-4 border-b border-doc-rule pb-2 text-sm"
          >
            <span className="text-white">{s.name || s.email}</span>
            <span className="text-doc-muted">
              {row
                ? `Signed ${new Date(row.signed_at).toLocaleDateString("en-IE", {
                    day: "numeric",
                    month: "long",
                  })}`
                : "Not yet signed"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function PayButton({
  busy,
  due,
  currency,
  onClick,
}: {
  busy: boolean;
  due: number;
  currency: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`mt-6 ${buttonClass}`}
      style={{ background: "var(--red)" }}
    >
      {busy ? "Opening secure checkout…" : `Pay ${formatMoney(due, currency)}`}
    </button>
  );
}

function Cancelled() {
  return (
    <p className="mt-3 text-sm text-doc-muted">
      Checkout was cancelled: nothing was charged.
    </p>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-sm" style={{ color: "var(--text)" }} role="alert">
      {children}
    </p>
  );
}

function CheckMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-9 w-9 shrink-0"
      style={{ color: "var(--text)" }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" opacity={0.4} />
      <path d="m7.5 12.5 3 3 6-6.5" />
    </svg>
  );
}
