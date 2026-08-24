"use client";

import {
  SIGNATURE_FONTS,
  signatureFontVar,
  type SignatureFontKey,
} from "@/lib/signature-fonts";
import SignatureCanvas from "./SignatureCanvas";

/** How the signer chose to produce their signature. */
export type SignMode = "style" | "draw" | "upload";

/**
 * Whether the current choice can actually be recorded. A style is always ready;
 * a drawn or uploaded one is only ready once there is an image.
 */
export function signatureReady(mode: SignMode, value: SignatureValue): boolean {
  return mode === "style" || value.image !== null;
}

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

export type SignatureValue = {
  font: SignatureFontKey;
  /** A drawn or uploaded signature as a data URL. Wins over the typed name. */
  image: string | null;
};

/**
 * Pick a script face, draw a signature, or upload one.
 *
 * Used by the client on the signing form and by the owner in the proposal
 * editor, so both adopt a signature the same way and there is one copy of the
 * behaviour rather than two that drift.
 */
export default function SignatureControl({
  previewName,
  value,
  onChange,
  mode,
  onModeChange,
  disabled = false,
  onError,
}: {
  /** Rendered inside the style swatches so the choice is seen, not guessed. */
  previewName: string;
  value: SignatureValue;
  onChange: (next: SignatureValue) => void;
  mode: SignMode;
  onModeChange: (next: SignMode) => void;
  disabled?: boolean;
  onError?: (message: string | null) => void;
}) {
  function readUpload(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      onError?.("That image is over 3MB. Please use a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onError?.(null);
      onChange({
        ...value,
        image: typeof reader.result === "string" ? reader.result : null,
      });
    };
    reader.onerror = () => onError?.("Could not read that file.");
    reader.readAsDataURL(file);
  }

  return (
    <fieldset disabled={disabled}>
      <div className="border-b border-doc-rule mb-4">
        {(
          [
            ["style", "Select style"],
            ["draw", "Draw"],
            ["upload", "Upload"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              onModeChange(key);
              // Leaving a tab drops whatever was made in it, so what is on
              // screen is always what would be recorded.
              onChange({ ...value, image: null });
              onError?.(null);
            }}
            aria-pressed={mode === key}
            className={`signature-tab ${mode === key ? "is-selected" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "style" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SIGNATURE_FONTS.map((f) => {
            const selected = f.key === value.font;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => onChange({ font: f.key, image: null })}
                aria-pressed={selected}
                className={`signature-swatch ${selected ? "is-selected" : ""}`}
                style={{ fontFamily: signatureFontVar(f.key) }}
              >
                {previewName.trim() || "Your name"}
              </button>
            );
          })}
        </div>
      )}

      {mode === "draw" && (
        <SignatureCanvas
          onChange={(image) => onChange({ ...value, image })}
          disabled={disabled}
        />
      )}

      {mode === "upload" && (
        <div className="signature-drop">
          {value.image ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value.image}
                alt="Your signature"
                className="mx-auto max-h-24"
              />
              <button
                type="button"
                onClick={() => onChange({ ...value, image: null })}
                className="mt-3 text-xs text-doc-muted underline underline-offset-2 hover:text-white"
              >
                Remove
              </button>
            </div>
          ) : (
            <label className="block cursor-pointer">
              <span className="text-sm text-doc-muted">
                Choose a photo or scan of your signature
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/bmp"
                className="block mx-auto mt-3 text-xs text-doc-muted"
                onChange={(e) => readUpload(e.target.files?.[0])}
              />
              <span className="block mt-2 text-xs text-doc-muted">
                PNG, JPG, GIF or BMP. Up to 3MB.
              </span>
            </label>
          )}
        </div>
      )}
    </fieldset>
  );
}

