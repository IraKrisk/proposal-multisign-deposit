/**
 * Outbound email, sent by the app itself through Resend's HTTP API.
 *
 * Supabase used to compose every sign-in email. It builds them from a single
 * Site URL setting, so a locally running app still emailed a link to the
 * deployed site. That is not fixable in code while Supabase writes the mail, so
 * the app writes it instead — see lib/auth-link.ts for the link half.
 *
 * Nothing here throws. An email that fails to send must never take down the
 * action that triggered it: a recorded signature is still a recorded signature.
 */

const ENDPOINT = "https://api.resend.com/emails";

/**
 * Verified sender on the Resend account, in the form `Name <you@domain>`.
 *
 * There is no default. A wrong sender address is not something to guess at:
 * Resend rejects an unverified domain, and a plausible looking fallback would
 * turn a missing setting into a delivery mystery.
 */
const FROM = process.env.EMAIL_FROM ?? "";

export type EmailResult = { error: string | null };

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
}: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<EmailResult> {
  if (!FROM.trim()) {
    console.error("EMAIL_FROM is not set: no email was sent.");
    return { error: "Email is not configured." };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Said plainly in the log rather than swallowed, because the symptom
    // otherwise is a silent no-op that looks like a delivery problem.
    console.error("RESEND_API_KEY is not set: no email was sent.");
    return { error: "Email is not configured." };
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Resend rejected the message", res.status, detail);
      return { error: `Could not send the email (${res.status}).` };
    }

    return { error: null };
  } catch (err) {
    console.error("Resend request failed", err);
    return { error: "Could not reach the email service." };
  }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

// Email clients strip stylesheets, so every value is inline. These are the
// three brand colours and the two greys declared in the brand token file:
// nothing is derived and nothing is invented.
const SLATE = "#334149";
const WHITE = "#ffffff";
const RED = "#8b0000";
const MUTED = "#a3abb0";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wraps body markup in the shell every message from this app shares: slate
 * card, white type, one red button.
 */
export function emailLayout({
  heading,
  body,
  buttonLabel,
  buttonHref,
  footer,
}: {
  heading: string;
  /** Trusted markup. Anything from a user must be escaped before it gets here. */
  body: string;
  buttonLabel?: string;
  buttonHref?: string;
  /** Plain text. Newlines become line breaks. */
  footer?: string;
}): string {
  const button =
    buttonLabel && buttonHref
      ? `<tr><td style="padding:8px 0 4px">
           <a href="${buttonHref}" style="display:inline-block;background:${RED};color:${WHITE};text-decoration:none;font-size:15px;font-weight:500;padding:13px 26px;border-radius:6px">${escapeHtml(buttonLabel)}</a>
         </td></tr>
         <tr><td style="padding:14px 0 0;font-size:12px;line-height:1.6;color:${MUTED}">
           If the button does not work, paste this into your browser:<br>
           <span style="color:${MUTED};word-break:break-all">${escapeHtml(buttonHref)}</span>
         </td></tr>`
      : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${SLATE}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SLATE};padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${SLATE};border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:32px">
            <tr>
              <td style="font-family:Helvetica,Arial,sans-serif;color:${WHITE};font-size:21px;line-height:1.35;padding-bottom:16px">
                ${escapeHtml(heading)}
              </td>
            </tr>
            <tr>
              <td style="font-family:Helvetica,Arial,sans-serif;color:${WHITE};font-size:15px;line-height:1.65;padding-bottom:22px">
                ${body}
              </td>
            </tr>
            ${button}
            ${
              footer
                ? `<tr><td style="font-family:Helvetica,Arial,sans-serif;color:${MUTED};font-size:12px;line-height:1.6;padding-top:22px">${footer.split("\n").map(escapeHtml).join("<br>")}</td></tr>`
                : ""
            }
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export { escapeHtml };
