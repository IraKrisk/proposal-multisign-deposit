/**
 * The signature styles a signer can choose between.
 *
 * A signature is meant to identify one person, so forcing every signer into one
 * face defeats it. The signer picks a style, the choice is stored on the
 * signature row, and the name renders in that style everywhere afterwards.
 *
 * The keys are what goes in the database. Never renumber or reuse one: an old
 * signature must keep rendering in the style it was signed with.
 */
export const SIGNATURE_FONTS = [
  { key: "caveat", label: "Caveat", varName: "--font-sig-caveat" },
  { key: "dancing", label: "Dancing Script", varName: "--font-sig-dancing" },
  { key: "vibes", label: "Great Vibes", varName: "--font-sig-vibes" },
  { key: "sacramento", label: "Sacramento", varName: "--font-sig-sacramento" },
] as const;

export type SignatureFontKey = (typeof SIGNATURE_FONTS)[number]["key"];

export const SIGNATURE_FONT_KEYS = SIGNATURE_FONTS.map(
  (f) => f.key,
) as unknown as [SignatureFontKey, ...SignatureFontKey[]];

export const DEFAULT_SIGNATURE_FONT: SignatureFontKey = "caveat";

/** CSS custom property for a stored key, falling back if the key is unknown. */
export function signatureFontVar(key: string | null | undefined): string {
  const found = SIGNATURE_FONTS.find((f) => f.key === key);
  return `var(${(found ?? SIGNATURE_FONTS[0]).varName}), cursive`;
}
