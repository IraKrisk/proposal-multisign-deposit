import type { SectionKind } from "./types";

/**
 * THE DEFAULT PROPOSAL TEMPLATE — derived from `proposal-template.pdf`.
 *
 * The supplied template is a three-slide deck: a cover ("Website Development
 * Proposal / Improve your online presence / Prepared for: / Prepared by:"), an
 * "About" slide, and a "Services" slide. Its cover and those two sections are
 * reproduced here as-is.
 *
 * The deck carries no scope, timeline, pricing, terms, or signature block, so
 * there would be nothing for a client to agree to or pay for. The sections
 * marked ADDED below fill that gap. They are additions, not part of the
 * supplied template.
 *
 * This is the only file to edit when changing the template. Nothing else
 * hardcodes a section list.
 */

export type TemplateSection = {
  id: string;
  heading: string;
  kind: SectionKind;
  /**
   * true  → Claude writes this section per proposal, using `instruction`.
   * false → `default_body` is used verbatim; the user edits it in the editor.
   */
  generate: boolean;
  /** Told to the model verbatim. Only used when `generate` is true. */
  instruction?: string;
  /** Starting copy for non-generated sections. */
  default_body?: string;
  target_words?: number;
};

export const TEMPLATE_SECTIONS: TemplateSection[] = [
  // ---- From the supplied deck --------------------------------------------
  {
    id: "about",
    heading: "About",
    kind: "narrative",
    generate: false,
    default_body:
      "Building websites that fit the business.\n\n" +
      "Higher Diploma in Science in Web Technologies, NCI",
  },
  {
    id: "services",
    heading: "Services",
    kind: "bullets",
    generate: false,
    default_body:
      "- Web Design\n" +
      "- Web Development\n" +
      "- AI Automation\n" +
      "- Agentic AI Systems",
  },

  // ---- ADDED: needed for a proposal that can be signed and paid ----------
  {
    id: "understanding",
    heading: "Project",
    kind: "narrative",
    generate: true,
    instruction:
      "Restate the client's situation and what they want their website to do, " +
      "in their own framing, specific enough that they recognise themselves in " +
      "it. Name the concrete problem, meaning what the current site fails to do, or " +
      "what not having one is costing them. No solution talk yet. This section " +
      "exists to prove you listened.",
    target_words: 150,
  },
  {
    id: "scope",
    heading: "Scope of Work",
    kind: "phases",
    generate: true,
    instruction:
      "Break the build into 3-4 phases. Use one `- ` bullet per phase. Start " +
      "each with the phase name and duration in bold, e.g. " +
      "'**Discovery and design, 2 weeks.**', then one or two sentences on what " +
      "happens, then a sentence starting 'Deliverable: ' naming exactly what " +
      "the client receives. Be concrete about pages, integrations, and " +
      "handover.",
    target_words: 240,
  },
  {
    id: "timeline",
    heading: "Timeline",
    kind: "bullets",
    generate: true,
    instruction:
      "Bullets covering start, the key milestones by week, and launch. End " +
      "with one bullet naming what you need from the client to hold the start " +
      "date: content, brand assets, access.",
    target_words: 110,
  },
  {
    id: "investment",
    heading: "Investment",
    kind: "pricing",
    generate: true,
    instruction:
      "Two or three sentences framing the price against what the site will do " +
      "for the business, not against hours worked. Do NOT write any numbers " +
      "here. The pricing table is rendered separately from structured data.",
    target_words: 70,
  },
  {
    id: "terms",
    heading: "Terms",
    kind: "terms",
    generate: true,
    instruction:
      "Plain-language terms: what is included, what is out of scope, how many " +
      "rounds of revisions, hosting and domain responsibility, payment " +
      "schedule, what happens if the project stalls, and who owns the code and " +
      "content at the end. Short sentences. No legalese, no capitalised " +
      "defined terms. Write nothing about data, privacy, or GDPR: a fixed " +
      "paragraph covering that is appended automatically.",
    target_words: 180,
  },
];

/**
 * Appended to the end of every drafted Terms section.
 *
 * The signature is only worth as much as the audit trail behind it, and that
 * trail is personal data, so the client is told what is kept and for how long.
 * Six years is the limitation period for a simple contract in Ireland.
 *
 * Written once here rather than left to the model, so the wording never drifts
 * between proposals. It is copied into the proposal's stored content, so it
 * stays editable per proposal in the dashboard.
 */
export const TERMS_DATA_CLAUSE = `Your data: when you sign, I record your name, email address, IP address, the time of signing, and a fingerprint of the exact document you signed. That record is what makes the signature hold up, so I keep it for six years, the limitation period for a contract in Ireland. It is never sold or used for marketing. Ask me at any time for a copy of it, or for it to be deleted, and I will delete it unless it is still needed to defend a legal claim.`;

/** Voice and formatting rules applied across every generated section. */
export const TEMPLATE_VOICE = `
Write in the voice of an independent web developer talking directly to a small
business owner who is about to spend real money. Specifically:

- Second person ("you", "your site"). First person singular for your own side
  ("I"), never "we". This is a solo practice.
- Short declarative sentences. No throat-clearing, no "in today's digital age".
- Concrete over abstract. Name real pages, integrations, and deliverables.
- Plain words over jargon. The reader runs a business; they are not technical.
- No superlatives about yourself ("world-class", "cutting-edge", "passionate").
- No filler transitions ("Furthermore", "Moreover", "It is worth noting that").
- Confidence without hype. State what you will do; do not promise what you cannot.
- Never invent facts the brief does not contain: no fake metrics, client names,
  case studies, or credentials. If the brief is thin, write tighter, not vaguer.
`.trim();

/** Cover-page defaults, matching the deck. */
export const TEMPLATE_COVER = {
  title: "Website Development Proposal",
  subtitle: "Improve your online presence",
};
