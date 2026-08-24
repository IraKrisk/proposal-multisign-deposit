import type { Metadata } from "next";
import {
  Caveat,
  Dancing_Script,
  Great_Vibes,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Sacramento,
} from "next/font/google";
import "./globals.css";

/** The brand faces: IBM Plex Sans for text, IBM Plex Mono where it is needed. */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-sans-loaded",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-mono-loaded",
});

/**
 * The four signature faces a signer can choose between. Loaded as real font
 * files so a signature looks the same on every device, and so the style a
 * client picked still renders correctly when you open the proposal later.
 *
 * These are the only faces in the app outside the brand's IBM Plex system.
 */
const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
  variable: "--font-sig-caveat",
});
const dancing = Dancing_Script({
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
  variable: "--font-sig-dancing",
});
const vibes = Great_Vibes({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-sig-vibes",
});
const sacramento = Sacramento({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-sig-sacramento",
});

const signatureFonts = [plexSans, plexMono, caveat, dancing, vibes, sacramento]
  .map((f) => f.variable)
  .join(" ");

export const metadata: Metadata = {
  title: "Proposal Generator",
  description: "Draft, send, sign, and get paid, in one link.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Browser extensions write their own attributes onto <html> before React
    // hydrates, which React then reports as a mismatch. Nothing here differs
    // between server and client, so the warning is suppressed at this node only.
    <html
      lang="en"
      data-theme="dark"
      className={signatureFonts}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
