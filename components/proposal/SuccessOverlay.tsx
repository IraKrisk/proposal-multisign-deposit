"use client";

import { useEffect, useState } from "react";

/**
 * Shown once, after the client returns from Stripe with ?paid=1.
 * Confetti + a drawn checkmark, then it gets out of the way.
 */
export default function SuccessOverlay({
  clientName,
}: {
  clientName?: string;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    // Drop the ?paid=1 param so a refresh doesn't replay the celebration.
    const url = new URL(window.location.href);
    if (url.searchParams.has("paid")) {
      url.searchParams.delete("paid");
      window.history.replaceState({}, "", url.toString());
    }

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let cancelled = false;

    if (!reduced) {
      import("canvas-confetti").then(({ default: confetti }) => {
        if (cancelled) return;

        // Brand palette from the template deck.
        const colors = ["#8b0000", "#ffffff"];

        confetti({
          particleCount: 90,
          spread: 78,
          startVelocity: 42,
          origin: { y: 0.55 },
          colors,
          disableForReducedMotion: true,
        });

        const bursts = [
          { delay: 260, x: 0.2 },
          { delay: 420, x: 0.8 },
        ];
        for (const b of bursts) {
          setTimeout(() => {
            if (cancelled) return;
            confetti({
              particleCount: 55,
              angle: b.x < 0.5 ? 62 : 118,
              spread: 62,
              startVelocity: 38,
              origin: { x: b.x, y: 0.62 },
              colors,
              disableForReducedMotion: true,
            });
          }, b.delay);
        }
      });
    }

    const t = setTimeout(() => setOpen(false), 4200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  if (!open) return null;

  const firstName = clientName?.trim().split(/\s+/)[0] ?? "";

  return (
    <div
      className="anim-overlay fixed inset-0 z-50 grid place-items-center px-6"
      style={{
        background: "rgba(16, 22, 26, 0.68)",
        backdropFilter: "blur(6px)",
      }}
      role="status"
      aria-live="polite"
      onClick={() => setOpen(false)}
    >
      <div
        className="anim-card w-full max-w-md rounded-xl px-8 py-12 text-center shadow-2xl"
        style={{
          background: "var(--fill)",
          border: "1px solid var(--hair)",
        }}
      >
        <div className="relative mx-auto mb-7 h-24 w-24">
          <span
            className="anim-halo absolute inset-0 rounded-full"
            style={{ background: "rgba(196, 52, 52, 0.4)" }}
            aria-hidden
          />
          <svg
            viewBox="0 0 48 48"
            className="anim-ring relative h-24 w-24"
            fill="none"
            aria-hidden
          >
            <circle cx="24" cy="24" r="22" fill="var(--red)" />
            <circle
              cx="24"
              cy="24"
              r="22"
              stroke="var(--red)"
              strokeWidth="1.5"
              opacity="0.7"
            />
            <path
              className="anim-tick"
              d="M15 24.5 L21.5 31 L33 18.5"
              stroke="var(--white)"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2
          className="doc-display anim-rise text-3xl text-white"
          style={{ animationDelay: "520ms" }}
        >
          {firstName ? `Thank you, ${firstName}.` : "Thank you."}
        </h2>
        <p
          className="anim-rise mt-3 leading-relaxed"
          style={{ color: "var(--muted)", animationDelay: "640ms" }}
        >
          Your proposal is signed and your payment went through. You&apos;ll hear
          from me shortly to get started.
        </p>

        <button
          onClick={() => setOpen(false)}
          className="anim-rise mt-8 rounded-md px-5 py-2.5 text-sm font-medium text-white"
          style={{ background: "var(--red)", animationDelay: "760ms" }}
        >
          View the signed proposal
        </button>
      </div>
    </div>
  );
}
