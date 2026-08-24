import Anthropic from "@anthropic-ai/sdk";
import {
  TEMPLATE_SECTIONS,
  TEMPLATE_VOICE,
  TERMS_DATA_CLAUSE,
} from "./template";
import type { ProposalContent, ProposalSection } from "./types";

const MODEL = "claude-opus-5";

export type GenerateInput = {
  /** One or two paragraphs from the user describing what they want. */
  brief: string;
  client_name: string;
  client_company: string;
  client_email: string;
  prepared_by: string;
  prepared_by_company: string;
  currency: string;
};

/** Exactly what we ask the model to return. Everything else is assembled locally. */
type Drafted = {
  project_title: string;
  subtitle: string;
  sections: { id: string; body: string }[];
  line_items: { name: string; description: string; amount_major: number }[];
  payment_terms: string;
};

/** Only the sections Claude writes. Fixed sections use their default body. */
const GENERATED = TEMPLATE_SECTIONS.filter((s) => s.generate);
const SECTION_IDS = GENERATED.map((s) => s.id);

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    project_title: {
      type: "string",
      description:
        'Cover title. The template\'s default is "Website Development Proposal". ' +
        "Keep that phrasing unless the brief is clearly about a different " +
        'service, in which case name that one the same way (e.g. "AI Automation ' +
        'Proposal"). Not a sentence, not a slogan.',
    },
    subtitle: {
      type: "string",
      description:
        'One line under the cover title, in the register of the template\'s ' +
        '"Improve your online presence". States the outcome for this client, ' +
        "not the activity. Six words or fewer.",
    },
    sections: {
      type: "array",
      description:
        "One entry per template section, in the same order, using the same ids.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", enum: SECTION_IDS },
          body: {
            type: "string",
            description:
              "Section body. Plain text paragraphs separated by blank lines. " +
              "For bullet content, start each line with '- '. Use **bold** only " +
              "for phase names. No headings, because the heading is rendered separately.",
          },
        },
        required: ["id", "body"],
        additionalProperties: false,
      },
    },
    line_items: {
      type: "array",
      description:
        "Suggested pricing breakdown. 1-5 items. The user will edit these, so " +
        "propose defensible amounts based on the scope described, and say so in " +
        "the description rather than padding.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          amount_major: {
            type: "number",
            description:
              "Amount in whole currency units (e.g. dollars, not cents).",
          },
        },
        required: ["name", "description", "amount_major"],
        additionalProperties: false,
      },
    },
    payment_terms: {
      type: "string",
      description:
        "One or two sentences on the payment schedule, shown beneath the pricing table.",
    },
  },
  required: [
    "project_title",
    "subtitle",
    "sections",
    "line_items",
    "payment_terms",
  ],
  additionalProperties: false,
} as const;

function buildSystemPrompt(): string {
  const sectionSpec = GENERATED.map(
    (s) =>
      `### ${s.id}: "${s.heading}"\n${s.instruction}\nTarget length: about ${s.target_words} words.`,
  ).join("\n\n");

  return [
    "You draft client-facing services proposals. You are given a short brief " +
      "from the person sending the proposal, and you write the full body copy.",
    "",
    "## Voice",
    TEMPLATE_VOICE,
    "",
    "## Sections",
    "Write every section below, in this order, keyed by its id.",
    "",
    sectionSpec,
    "",
    "## Hard rules",
    "- Never fabricate facts. No invented metrics, client logos, case studies, " +
      "team sizes, or credentials. If the brief does not supply a detail, write " +
      "around it rather than making one up.",
    "- Do not write section headings into the body. Headings are rendered from " +
      "the template.",
    "- Do not put currency amounts in section bodies. Pricing is rendered from " +
      "structured data.",
    "- Match the brief's scale. A two week engagement does not get a five phase plan.",
    "- Never use a dash of any kind in the prose you write: no em dash, no en " +
      "dash, and no hyphen joining words. Use a comma, a colon, or a full stop " +
      'instead, and prefer unhyphenated wording ("single use", not "single-use"). ' +
      "The one exception is the `- ` that starts a bullet line.",
  ].join("\n");
}

function buildUserPrompt(input: GenerateInput): string {
  return [
    `Client contact: ${input.client_name || "(not given)"}`,
    `Client company: ${input.client_company || "(not given)"}`,
    `Proposal is from: ${input.prepared_by} at ${input.prepared_by_company}`,
    `Currency: ${input.currency}`,
    "",
    "Brief:",
    input.brief.trim(),
  ].join("\n");
}

export class GenerationRefused extends Error {
  constructor(public category: string | null) {
    super("The model declined to draft this proposal.");
    this.name = "GenerationRefused";
  }
}

/**
 * Drafts proposal copy with Claude Opus 5.
 *
 * Server-side fallbacks are enabled: if safety classifiers decline the request,
 * Anthropic re-runs it on a fallback model inside the same call instead of
 * returning nothing.
 */
export async function generateProposal(
  input: GenerateInput,
): Promise<Pick<ProposalContent, "project_title" | "subtitle" | "sections"> & {
  line_items: Drafted["line_items"];
  payment_terms: string;
}> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: buildUserPrompt(input) }],
  });

  if (response.stop_reason === "refusal") {
    throw new GenerationRefused(response.stop_details?.category ?? null);
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Model returned no text content.");
  }

  const drafted = JSON.parse(textBlock.text) as Drafted;

  // Assemble sections in template order, so a missing or reordered id from the
  // model can never reorder or drop a section on the page. Fixed sections take
  // their template default and are never touched by the model.
  const byId = new Map(drafted.sections.map((s) => [s.id, s.body]));
  const sections: ProposalSection[] = TEMPLATE_SECTIONS.map((t) => {
    const body = t.generate
      ? (byId.get(t.id) ?? "").trim()
      : (t.default_body ?? "").trim();

    // The data-retention paragraph is fixed wording, appended rather than
    // drafted, so it reads the same on every proposal. It lands in the stored
    // content, so it can still be edited per proposal in the dashboard.
    return {
      id: t.id,
      heading: t.heading,
      kind: t.kind,
      body:
        t.id === "terms" && body ? `${body}

${TERMS_DATA_CLAUSE}` : body,
    };
  });

  return {
    project_title: drafted.project_title,
    subtitle: drafted.subtitle,
    sections,
    line_items: drafted.line_items,
    payment_terms: drafted.payment_terms,
  };
}
