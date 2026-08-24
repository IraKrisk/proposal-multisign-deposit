/**
 * The messages the app sends, in one place, so wording and branding do not
 * drift between the invite and the receipt.
 *
 * Every function here returns rather than throws. Callers treat a failed send
 * as worth logging and nothing more: the proposal was still sent, the signature
 * was still recorded.
 */

import { emailLayout, escapeHtml, sendEmail, type EmailResult } from "./email";
import { createSignInLink } from "./auth-link";
import { siteUrl } from "./site";
import { formatMoney } from "./types";

/**
 * The sign off at the foot of every message to a client, taken from the
 * environment. Write a line break as \n. Unset simply leaves the footer off.
 */
const SIGN_OFF = (process.env.EMAIL_SIGN_OFF ?? "").split("\\n").join("\n");

/** Invites a client to read and sign a proposal. Carries their sign in link. */
export async function sendProposalInvite({
  to,
  clientName,
  projectTitle,
  senderCompany,
  slug,
}: {
  to: string;
  clientName: string;
  projectTitle: string;
  senderCompany: string;
  slug: string;
}): Promise<EmailResult> {
  const { link, error } = await createSignInLink(to, `/p/${slug}`);
  if (!link) return { error };

  const from = senderCompany.trim();
  const greeting = clientName.trim() ? `Hi ${clientName.trim()},` : "Hello,";
  const opener = from
    ? `${escapeHtml(from)} has prepared a proposal for you`
    : "A proposal has been prepared for you";

  return sendEmail({
    to,
    subject: `Your proposal: ${projectTitle}`,
    html: emailLayout({
      heading: "Your proposal is ready",
      body: `
        <p style="margin:0 0 14px">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 14px">${opener}: <strong>${escapeHtml(projectTitle)}</strong>.</p>
        <p style="margin:0 0 14px">The link below opens the proposal and signs you in. It can be used once. To return to it later, request a new link from the same page.</p>
        <p style="margin:0">Do not share this link.</p>
      `,
      buttonLabel: "Open the proposal",
      buttonHref: link,
      footer: SIGN_OFF,
    }),
  });
}

/**
 * Tells the client their proposal is agreed, and gives them a way back into it
 * for the PDF. Sent the moment the signature row lands.
 */
export async function sendCompletionToClient({
  to,
  signerName,
  projectTitle,
  slug,
}: {
  to: string;
  signerName: string;
  projectTitle: string;
  slug: string;
}): Promise<EmailResult> {
  const { link, error } = await createSignInLink(to, `/p/${slug}`);
  if (!link) return { error };

  const greeting = signerName.trim() ? `Thanks ${signerName.trim()},` : "Thanks,";

  return sendEmail({
    to,
    subject: `Completed: ${projectTitle}`,
    html: emailLayout({
      heading: `Completed: ${projectTitle}`,
      body: `
        <p style="margin:0 0 14px">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 14px"><strong>${escapeHtml(projectTitle)}</strong> has been signed and is now agreed.</p>
        <p style="margin:0">Your copy stays where it was. Open it below to read it again or to download the signed PDF, which carries the signature and the record of how it was signed.</p>
      `,
      buttonLabel: "Open the signed proposal",
      buttonHref: link,
      footer: SIGN_OFF,
    }),
  });
}

/** Tells the owner somebody signed, and what it was worth. */
export async function sendCompletionToOwner({
  to,
  proposalId,
  signerName,
  signerEmail,
  projectTitle,
  amountDue,
  currency,
}: {
  to: string;
  proposalId: string;
  signerName: string;
  signerEmail: string;
  projectTitle: string;
  /** Minor units due at signing. Zero when no deposit was asked for. */
  amountDue: number;
  currency: string;
}): Promise<EmailResult> {
  const money =
    amountDue > 0
      ? `${formatMoney(amountDue, currency)} is due at signing, and Stripe will confirm separately once it clears.`
      : "No deposit was due at signing.";

  return sendEmail({
    to,
    subject: `Signed: ${projectTitle}`,
    replyTo: signerEmail,
    html: emailLayout({
      heading: `Signed: ${projectTitle}`,
      body: `
        <p style="margin:0 0 14px"><strong>${escapeHtml(signerName)}</strong> (${escapeHtml(signerEmail)}) signed <strong>${escapeHtml(projectTitle)}</strong>.</p>
        <p style="margin:0">${escapeHtml(money)}</p>
      `,
      buttonLabel: "Open it in your dashboard",
      buttonHref: `${siteUrl()}/dashboard/proposals/${proposalId}`,
    }),
  });
}

/** Tells the owner that a signer refused, and what reason they gave. */
export async function sendDeclineToOwner({
  to,
  proposalId,
  signerName,
  signerEmail,
  projectTitle,
  reason,
}: {
  to: string;
  proposalId: string;
  signerName: string;
  signerEmail: string;
  projectTitle: string;
  /** Empty when they gave none. */
  reason: string;
}): Promise<EmailResult> {
  const said = reason.trim()
    ? `<p style="margin:0 0 14px">Their reason: ${escapeHtml(reason.trim())}</p>`
    : `<p style="margin:0 0 14px">They gave no reason.</p>`;

  return sendEmail({
    to,
    subject: `Declined: ${projectTitle}`,
    replyTo: signerEmail,
    html: emailLayout({
      heading: `Declined: ${projectTitle}`,
      body: `
        <p style="margin:0 0 14px"><strong>${escapeHtml(signerName)}</strong> (${escapeHtml(signerEmail)}) declined to sign <strong>${escapeHtml(projectTitle)}</strong>.</p>
        ${said}
        <p style="margin:0">Nobody can sign it now. To carry on, write a new proposal and send that instead.</p>
      `,
      buttonLabel: "Open it in your dashboard",
      buttonHref: `${siteUrl()}/dashboard/proposals/${proposalId}`,
    }),
  });
}

/** Confirms to the signer that their refusal was recorded. */
export async function sendDeclineToSigner({
  to,
  signerName,
  projectTitle,
  senderCompany,
}: {
  to: string;
  signerName: string;
  projectTitle: string;
  senderCompany: string;
}): Promise<EmailResult> {
  const from = senderCompany.trim();
  const greeting = signerName.trim() ? `Hi ${signerName.trim()},` : "Hello,";
  const told = from
    ? `${escapeHtml(from)} has been told.`
    : "The sender has been told.";

  return sendEmail({
    to,
    subject: `Declined: ${projectTitle}`,
    html: emailLayout({
      heading: `Declined: ${projectTitle}`,
      body: `
        <p style="margin:0 0 14px">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 14px">You declined <strong>${escapeHtml(projectTitle)}</strong>. Nothing was signed and nothing was charged.</p>
        <p style="margin:0">${told} If this was a mistake, reply to them and they can send a fresh proposal.</p>
      `,
      footer: SIGN_OFF,
    }),
  });
}
