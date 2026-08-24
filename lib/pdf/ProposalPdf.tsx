import path from "node:path";
import {
  Document,
  Font,
  Image,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  amountDueNow,
  formatMoney,
  signersOf,
  type Payment,
  type ProposalContent,
  type Signature,
} from "@/lib/types";
import { SIGNATURE_FONTS } from "@/lib/signature-fonts";

/*
  The signed proposal as a PDF: what the client keeps, and the record of how it
  was signed.

  react-pdf has its own layout engine, so none of the app's CSS reaches here and
  the palette has to be repeated as literals. They are the brand's three and
  nothing else.
*/
const SLATE = "#334149";
const WHITE = "#ffffff";
const RED = "#8b0000";
const HAIR = "rgba(255, 255, 255, 0.12)";
const MUTED = "rgba(255, 255, 255, 0.65)";

/** The same four faces offered in the signing panel, as TTFs for the PDF. */
const fontFile = (name: string) =>
  path.join(process.cwd(), "public", "fonts", name);

// The brand face, so the PDF reads as the same document as the page.
Font.register({
  family: "IBMPlexSans",
  fonts: [
    { src: fontFile("IBMPlexSans-Regular.ttf"), fontWeight: 400 },
    { src: fontFile("IBMPlexSans-SemiBold.ttf"), fontWeight: 600 },
  ],
});

Font.register({ family: "sig-caveat", src: fontFile("Caveat-Medium.ttf") });
Font.register({
  family: "sig-dancing",
  src: fontFile("DancingScript-Medium.ttf"),
});
Font.register({ family: "sig-vibes", src: fontFile("GreatVibes-Regular.ttf") });
Font.register({
  family: "sig-sacramento",
  src: fontFile("Sacramento-Regular.ttf"),
});

/** Stops long hashes being broken across lines. */
Font.registerHyphenationCallback((word) => [word]);

function signatureFamily(key: string | null | undefined): string {
  const found = SIGNATURE_FONTS.find((f) => f.key === key);
  return `sig-${(found ?? SIGNATURE_FONTS[0]).key}`;
}

const s = StyleSheet.create({
  page: {
    backgroundColor: SLATE,
    color: WHITE,
    paddingTop: 48,
    paddingBottom: 64,
    paddingHorizontal: 52,
    fontFamily: "IBMPlexSans",
    fontSize: 10.5,
    lineHeight: 1.6,
  },
  bar: {
    backgroundColor: RED,
    borderRadius: 4,
    paddingTop: 5.6,
    paddingBottom: 10.4,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  barText: { color: WHITE, fontSize: 16 },
  // The cover title is 20pt in the same bar as the 16pt section headings, and
  // measured out at 12pt above the cap against 6.8 below the baseline. These
  // paddings even it up.
  barCover: { paddingTop: 8.4, paddingBottom: 18.6 },
  coverTitle: { color: WHITE, fontSize: 20 },
  subtitle: { fontSize: 15, marginTop: 26, marginBottom: 4 },
  rule: { height: 2, backgroundColor: RED, width: 190 },
  metaRow: { flexDirection: "row", marginTop: 30, marginBottom: 6 },
  metaCol: { width: "50%" },
  metaLabel: { fontSize: 10.5, color: WHITE, marginBottom: 3 },
  metaValue: { fontSize: 10.5, color: MUTED },
  // react-pdf has no thickness for a text underline, so the 3px rule under the
  // company name is drawn as a bar. The wrapper shrinks to the text width.
  metaCompanyWrap: { alignSelf: "flex-start" },
  metaCompany: { fontSize: 10.5, color: WHITE, lineHeight: 1 },
  // 2.25pt is 3px. Points are not pixels, which is why 3 looked heavy.
  metaCompanyRule: { height: 2.25, backgroundColor: RED, marginTop: 0 },
  section: { marginTop: 26 },
  paragraph: { marginBottom: 9, color: WHITE },
  bulletRow: { flexDirection: "row", marginBottom: 6 },
  bulletMark: {
    width: 11,
    height: 2,
    backgroundColor: RED,
    // Same alignment as the screen: level with the cap top, which at 10.5pt on
    // lineHeight 1.6 sits about 5pt below the top of the row.
    marginTop: 1.9,
    marginRight: 9,
  },
  bulletText: { flex: 1, color: WHITE },
  table: { marginTop: 12, borderRadius: 4, borderWidth: 1, borderColor: HAIR },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: HAIR,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  itemName: { color: WHITE },
  itemDesc: { color: MUTED, fontSize: 9.5, marginTop: 2 },
  amount: { width: 110, textAlign: "right", color: WHITE },
  totalRow: {
    flexDirection: "row",
    backgroundColor: RED,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  dueLine: { marginTop: 10, color: MUTED, fontSize: 9.5 },
  signBlock: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: HAIR,
    paddingTop: 18,
  },
  signName: { fontSize: 15, color: WHITE, marginBottom: 8 },
  signImage: {
    height: 40,
    width: 150,
    marginBottom: 8,
    objectFit: "contain",
    objectPosition: "left center",
    alignSelf: "flex-start",
  },
  signRule: { height: 0.5, backgroundColor: HAIR, width: 150, marginBottom: 6 },
  auditGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  signWho: { flexDirection: "row", justifyContent: "space-between" },
  signWhoLeft: { flexGrow: 1 },
  auditCell: { width: "50%", marginBottom: 6 },
  auditLabel: { fontSize: 8, color: MUTED, textTransform: "uppercase" },
  auditValue: { fontSize: 9.5, color: WHITE, marginTop: 2 },
  policyLine: { marginTop: 14, fontSize: 8.5, color: MUTED },
  policyLink: { color: MUTED, textDecoration: "underline" },
});

/*
  Where the privacy policy lives. Unset, the line is left off entirely rather
  than guessed at: this file is rendered on a server that may not be the one
  hosting the policy, and a wrong address in a signed document is worse than no
  address. `<siteUrl()>/privacy` is the value to use for this app's own page.
*/
const PRIVACY_URL = (process.env.PRIVACY_POLICY_URL ?? "").trim();

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Renders **bold** spans. Everything else is literal, as on the web page. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <Text key={i} style={{ fontWeight: 600 }}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        ),
      )}
    </>
  );
}

function Body({ body, marks = true }: { body: string; marks?: boolean }) {
  const blocks = body
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").map((l) => l.trim());
        const isList = lines.every((l) => l.startsWith("- "));

        if (isList) {
          return (
            <View key={bi} style={{ marginBottom: 9 }}>
              {lines.map((line, li) => (
                <View key={li} style={s.bulletRow}>
                  {marks && <View style={s.bulletMark} />}
                  <Text style={s.bulletText}>
                    <RichText text={line.slice(2)} />
                  </Text>
                </View>
              ))}
            </View>
          );
        }

        return (
          <Text key={bi} style={s.paragraph}>
            <RichText text={block.replace(/^- /gm, "")} />
          </Text>
        );
      })}
    </>
  );
}

export function ProposalPdf({
  content,
  signatures,
  payment,
  senderEmail,
}: {
  content: ProposalContent;
  /** Every signature recorded so far, oldest first. */
  signatures: Signature[];
  payment: Payment | null;
  /** The owner's own address. Not held on the proposal, so it is passed in. */
  senderEmail?: string | null;
}) {
  const { pricing } = content;
  const due = amountDueNow(pricing);
  const balance = pricing.total - due;

  return (
    <Document
      title={content.project_title}
      author={content.prepared_by_company || content.prepared_by}
    >
      <Page size="A4" style={s.page}>
        <View style={[s.bar, s.barCover]}>
          <Text style={s.coverTitle}>{content.project_title}</Text>
        </View>

        {Boolean(content.subtitle) && (
          <View>
            <Text style={s.subtitle}>{content.subtitle}</Text>
            <View style={s.rule} />
          </View>
        )}

        <View style={s.metaRow}>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Prepared for:</Text>
            {Boolean(content.client_company) && (
              <View style={s.metaCompanyWrap}>
                <Text style={s.metaCompany}>{content.client_company}</Text>
                <View style={s.metaCompanyRule} />
              </View>
            )}
            {signersOf(content)
              .map((signer) => signer.name)
              .filter(Boolean)
              .map((name, i) => (
                <Text key={`${name}${i}`} style={s.metaValue}>
                  {name}
                </Text>
              ))}
          </View>
          <View style={s.metaCol}>
            <Text style={s.metaLabel}>Prepared by:</Text>
            <Text style={s.metaValue}>{content.prepared_by || "Not given"}</Text>
            {Boolean(content.prepared_by_company) && (
              <Text style={s.metaValue}>{content.prepared_by_company}</Text>
            )}
            <Text style={s.metaValue}>{fmtDate(content.proposal_date)}</Text>
          </View>
        </View>

        {content.sections.map((section) => {
          // First paragraph travels with the heading, so a heading can never be
          // stranded alone at the foot of a page.
          const blocks = section.body
            .split(/\n{2,}/)
            .map((b) => b.trim())
            .filter(Boolean);
          const [lead, ...rest] = blocks;

          return (
          <View key={section.id} style={s.section}>
            {/* The heading and the paragraph under it are one unwrappable
                unit, so a heading can never be left alone at the foot of a
                page. `minPresenceAhead` on the bar was ignored here. */}
            <View wrap={false}>
              <View style={s.bar}>
                <Text style={s.barText}>{section.heading}</Text>
              </View>
              {lead && (
                <Body body={lead} marks={section.id !== "timeline"} />
              )}
            </View>

            {rest.length > 0 && (
              <Body
                body={rest.join("\n\n")}
                marks={section.id !== "timeline"}
              />
            )}

            {section.kind === "pricing" && (
              <>
                <View style={s.table}>
                  {pricing.line_items.map((li) => (
                    <View key={li.id} style={s.tableRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.itemName}>{li.name}</Text>
                        {Boolean(li.description) && (
                          <Text style={s.itemDesc}>{li.description}</Text>
                        )}
                      </View>
                      <Text style={s.amount}>
                        {formatMoney(li.amount, pricing.currency)}
                      </Text>
                    </View>
                  ))}
                  <View style={s.totalRow}>
                    <Text style={{ flex: 1, fontWeight: 600 }}>
                      Total
                    </Text>
                    <Text style={[s.amount, { fontWeight: 600 }]}>
                      {formatMoney(pricing.total, pricing.currency)}
                    </Text>
                  </View>
                </View>

                {due > 0 && (
                  <Text style={s.dueLine}>
                    Due at signing: {formatMoney(due, pricing.currency)}
                    {balance > 0
                      ? `     Balance on completion: ${formatMoney(balance, pricing.currency)}`
                      : ""}
                  </Text>
                )}

                {Boolean(pricing.payment_terms) && (
                  <Text style={[s.dueLine, { marginTop: 8 }]}>
                    {pricing.payment_terms}
                  </Text>
                )}
              </>
            )}
          </View>
          );
        })}

        {/* The sender signs first, dated the day the proposal went out. */}
        <View style={s.signBlock} wrap={false}>
          <Text style={s.auditLabel}>Signed by</Text>

          {content.sender_signature?.image ? (
            // react-pdf's Image is not the DOM one and takes no alt text.
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={content.sender_signature.image} style={s.signImage} />
          ) : (
            <Text
              style={[
                s.signName,
                {
                  fontFamily: signatureFamily(
                    content.sender_signature?.font ?? null,
                  ),
                },
              ]}
            >
              {content.prepared_by}
            </Text>
          )}

          <View style={s.signRule} />
          <View style={s.signWho}>
            <View style={s.signWhoLeft}>
              <Text style={s.auditValue}>{content.prepared_by}</Text>
              {Boolean(senderEmail) && (
                <Text style={s.metaValue}>{senderEmail}</Text>
              )}
              {Boolean(content.prepared_by_company) && (
                <Text style={s.metaValue}>{content.prepared_by_company}</Text>
              )}
            </View>
            <Text style={s.auditValue}>{fmtDate(content.proposal_date)}</Text>
          </View>
        </View>

        {signatures.map((signature) => (
          <View key={signature.id} style={s.signBlock} wrap={false}>
            <Text style={s.auditLabel}>Signed by</Text>

            {signature.signature_image ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={signature.signature_image} style={s.signImage} />
            ) : (
              <Text
                style={[
                  s.signName,
                  { fontFamily: signatureFamily(signature.signature_font) },
                ]}
              >
                {signature.signer_name}
              </Text>
            )}

            <View style={s.signRule} />
            <View style={s.signWho}>
              <View style={s.signWhoLeft}>
                <Text style={s.auditValue}>{signature.signer_name}</Text>
                <Text style={s.metaValue}>{signature.signer_email}</Text>
              </View>
              <Text style={s.auditValue}>{fmtDate(signature.signed_at)}</Text>
            </View>
          </View>
        ))}

        {/* One deposit and one fingerprint for the document, not one of each
            per signer: there is a single payment, and the hash is of the
            document itself, so it is the same value every time. */}
        {signatures.length > 0 && (
          <View style={s.signBlock} wrap={false}>
            <Text style={s.auditLabel}>Deposit</Text>
            <Text style={s.auditValue}>
              {payment
                ? `${formatMoney(payment.amount, payment.currency)} paid`
                : due > 0
                  ? "Outstanding"
                  : "None due"}
            </Text>

            <Text style={[s.auditLabel, { marginTop: 10 }]}>
              Document fingerprint (SHA-256)
            </Text>
            <Text style={[s.auditValue, { fontSize: 8 }]}>
              {signatures[0].content_hash}
            </Text>

            <Text style={[s.dueLine, { marginTop: 6 }]}>
              This record shows what was agreed and when. The fingerprint is
              taken from the exact document that was on screen at the moment of
              signing, so any later change to it would produce a different one.
            </Text>
          </View>
        )}

        {/* The address in full, and clickable. Printed or forwarded, the words
            "Privacy policy" alone would leave the reader nowhere to go. */}
        {Boolean(PRIVACY_URL) && (
          <Text style={s.policyLine}>
            Privacy policy:{" "}
            <Link src={PRIVACY_URL} style={s.policyLink}>
              {PRIVACY_URL}
            </Link>
          </Text>
        )}
      </Page>
    </Document>
  );
}
