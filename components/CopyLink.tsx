"use client";

import { useState } from "react";

export default function CopyLink({
  url,
  label = "Copy client link",
  className = "btn btn-ghost py-1.5 px-3 text-sm",
}: {
  url: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API is unavailable outside secure contexts; fall back.
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button type="button" onClick={copy} className={className}>
      {copied ? "Copied" : label}
    </button>
  );
}
