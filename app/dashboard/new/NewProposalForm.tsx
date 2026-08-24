"use client";

import { useActionState } from "react";
import { createProposal, type CreateState } from "./actions";

const EMPTY: CreateState = { error: null };

const PLACEHOLDER = `Kavanagh Joinery is a workshop of five in Bray. Their site is a single page Wix build from 2016 that does not work on phones, and there's no way to request a quote: every enquiry comes through Facebook messages that the owner misses. They want to be found for "fitted wardrobes Dublin" and to stop losing jobs to the two competitors who rank above them.

Six pages, a gallery of past work, a quote request form that emails them and logs to a sheet, and basic SEO on every page. WordPress so they can edit copy themselves. Around six weeks, fixed fee, 50% up front.`;

export default function NewProposalForm() {
  const [state, action, pending] = useActionState(createProposal, EMPTY);

  return (
    <form action={action} className="space-y-6">
      <div className="rounded-xl border border-app-border bg-app-panel p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm text-app-muted mb-1.5">
              Client contact name
            </span>
            <input
              className="field"
              name="client_name"
              placeholder="Dana Whitfield"
            />
          </label>
          <label className="block">
            <span className="block text-sm text-app-muted mb-1.5">
              Client company
            </span>
            <input
              className="field"
              name="client_company"
              placeholder="Northwind Logistics"
            />
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm text-app-muted mb-1.5">
              Client email
            </span>
            <input
              className="field"
              name="client_email"
              type="email"
              placeholder="dana@northwind.com"
            />
          </label>
          <label className="block">
            <span className="block text-sm text-app-muted mb-1.5">
              Currency
            </span>
            <select className="field" name="currency" defaultValue="EUR">
              {["EUR", "GBP", "USD", "CAD", "AUD"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-app-border bg-app-panel p-6">
        <label className="block">
          <span className="block text-sm font-medium mb-1.5">The brief</span>
          <span className="block text-sm text-app-muted mb-3">
            One or two paragraphs. What the client&apos;s problem is, what
            you&apos;ll do about it, and anything about scope, timeline, or
            price you already know. Specifics beat adjectives: the draft is
            only as concrete as what you put here.
          </span>
          <textarea
            className="field font-normal leading-relaxed"
            name="brief"
            rows={12}
            required
            placeholder={PLACEHOLDER}
          />
        </label>
      </div>

      {state.error && (
        <p className="text-sm text-app-bad" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Draft proposal"}
        </button>
        {pending && (
          <span className="text-sm text-app-muted">
            Claude writes the copy in the background: you&apos;ll land on the
            proposal straight away.
          </span>
        )}
      </div>
    </form>
  );
}
