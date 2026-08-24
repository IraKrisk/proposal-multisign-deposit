# Proposal Generator

A guide to using the app: writing a proposal, sending it, and what your clients
see when they sign and pay.

If you are installing it for the first time, do [SETUP.md](./SETUP.md) first.
Nothing below works until the database schema is applied and the credentials are
in place.

## Contents

- [Starting it](#starting-it)
- [Signing in](#signing-in)
- [Writing a proposal](#writing-a-proposal)
- [Editing it](#editing-it)
- [Sending it](#sending-it)
- [What the client sees](#what-the-client-sees)
- [Declining](#declining)
- [Expiry](#expiry)
- [Getting paid](#getting-paid)
- [The signed PDF](#the-signed-pdf)
- [The privacy policy](#the-privacy-policy)
- [Statuses](#statuses)
- [When something goes wrong](#when-something-goes-wrong)

## Starting it

```bash
npm install
npm run dev          # http://localhost:3000
```

For payments to be recorded while you are working locally, run the Stripe
listener in a second terminal:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Without it, a payment still completes, because the page you return to from
Stripe settles it as well. The listener is what catches the case where the
client closes the tab.

## Signing in

Go to `/login` and sign in with your email and password. You land on the
dashboard, which lists every proposal, its status, and its client link.

Only accounts with `is_owner` set on their profile row can open the dashboard.
Your clients get real accounts when you send them a proposal, and that flag is
what keeps them out of your side of the app. To make an account an owner:

```sql
update public.profiles set is_owner = true
where id = (select id from auth.users where email = 'you@example.com');
```

## Writing a proposal

**New proposal** on the dashboard. Fill in the client contact name, their
company, their email, and the currency, then write the brief.

The brief is the only part that matters to the quality of the draft. One or two
paragraphs: what the client's problem is, what you will do about it, and
anything you already know about scope, timeline, or price. Specifics beat
adjectives. The form shows a full worked example as placeholder text; write
yours at that level of detail.

Press **Draft proposal**. You land on the proposal straight away, marked
**Writing…**, while Claude writes the copy in the background. It takes 30 to 90
seconds. Refresh to see it arrive.

## Editing it

The proposal page has five panels.

**Client & document.** Names, the company on the cover, the proposal date, and
the valid until date. Anything you leave blank is left off the document rather
than filled with a placeholder.

**Who signs.** One row per person, each with a name and an email address. Add as
many as you need. Everybody listed here has to sign before the proposal is
complete, and each of them signs under the name you typed. They cannot change
it. This list replaces the single client contact from the create form.

**Your signature.** Your own countersignature: pick a script face, draw it, or
upload an image. It is saved to your profile, so the next proposal starts with
it already chosen. It appears on the proposal and in the PDF.

**Sections.** The body copy Claude wrote, one box per section. Edit freely.

**Pricing.** Line items with a name, a description, and an amount. The total is
recalculated on save from the line items, so it always matches. Under it, choose
what is due at signing:

| Payment mode | What the client is asked for |
| --- | --- |
| Deposit: percentage of total | A percentage, from 1 to 100 |
| Deposit: fixed amount | A set figure |
| Full amount at signing | The whole total |
| No payment at signing | Nothing. They sign only |

Stripe will not take less than 0.50 in the account currency, so a deposit below
that fails at checkout.

**Save changes** before sending. The bar at the bottom tells you when there is
something unsaved.

## Sending it

**Send to client** on the bottom bar. For each person in Who signs, the app
creates a Supabase account if they do not already have one, then emails them a
link that opens the proposal and signs them in.

The link is single use. If they come back to it later and it has expired, the
page offers them a fresh one by email, to the same address, so they are never
stuck.

The proposal moves to **Sent**, and to **Viewed** the first time somebody opens
it. **Send the link again** re-sends to everybody.

You can also copy the client link from the top of the page. It works, but the
recipient still has to be signed in as one of the named signers, so the email is
the normal way in.

## What the client sees

The full document, then a signing panel at the end.

They pick how their signature should look: one of four script faces, a signature
drawn with the mouse or a finger, or an uploaded image. They tick the box saying
they intend it as their electronic signature, then sign.

With more than one signer, the panel lists who has signed and who has not.
Nobody sees a name they can edit: the name on the contract is the one you typed.

Once everybody has signed and any money is settled, the panel turns into a
confirmation with a button to download the PDF, and everybody is emailed.

## Declining

Any named signer can decline instead of signing, with an optional reason. It
closes the proposal for everybody on it, not only for the person declining.
Nothing is signed and nothing is charged.

You get an email with the reason, and the proposal shows a Declined panel in
your dashboard carrying who declined, when, and what they said. A declined
proposal cannot be signed or paid afterwards. To carry on, write a new one.

Somebody who has already signed cannot then decline, and a paid proposal cannot
be declined.

## Expiry

The **valid until** date is enforced. The proposal is open through the whole of
that day and closed from midnight after.

After it, signers see an "expired" panel where the signing form was, and they
are told to ask you for a fresh proposal. You see an Expired panel on your side.
If nobody has signed, change the date and save to reopen it. If somebody has
signed, editing is locked, so write a new proposal instead.

Leave the field blank and the proposal never expires.

## Getting paid

Any signer can pay, in any order, before or after they sign. The Pay button is
on the proposal page whenever money is outstanding.

The proposal cannot be completed while the deposit is unpaid. If the last person
signs and the money is still owed, their signature is not recorded when they
press the button: it is held against the payment and written only when the money
lands. If they abandon the checkout, no signature is left behind, and the
proposal is still waiting for them.

Test cards work while Stripe is in test mode: `4242 4242 4242 4242`, any future
expiry, any CVC.

## The signed PDF

`Download the signed PDF` on the proposal page, `PDF ↓` in the dashboard. It
carries your countersignature, every client signature with the name, email and
date, and the document fingerprint: a SHA-256 hash of the exact content each
person signed.

Once one signature exists the proposal is read only. Editing after signing would
break the fingerprint that proves what was agreed to. Write a new proposal if
the terms have to change.

## The privacy policy

The app serves a policy page at `/privacy`, and every proposal links to it from
its footer. Clients do not have to be signed in to read it.

What ships is a skeleton with bracketed placeholders in it: business name,
address, contact address, retention periods and the rest. Fill them in before
you send anything to a client. `app/privacy/page.tsx` is the file, and
[SETUP.md](./SETUP.md) lists what has to be replaced.

The signed PDF carries the address of the policy as its last line, clickable,
when `PRIVACY_POLICY_URL` is set. Unset, the PDF leaves the line off.

## Statuses

| Badge | Meaning |
| --- | --- |
| Writing… | Claude is drafting it. No copy yet |
| Drafting failed | The job failed. The reason is on the page, and you can retry |
| Draft | Written, not sent |
| Sent | Emailed to the signers |
| Viewed | Somebody has opened it |
| Signed | Everybody signed |
| Signed & paid | Everybody signed and the money arrived |
| Declined | A signer refused. It is closed |

## When something goes wrong

**Drafting failed.** The page shows the reason and a retry button. Your brief is
kept, so nothing needs retyping.

**A client says the link does not work.** The link is single use. Sending them
the proposal again issues a new one, or they can request one from the page.

**A client cannot sign.** Check the address they are signed in as matches a row
in Who signs, exactly. Access is by address, not by having the link.

**A payment does not show.** In local development the Stripe listener has to be
running. Check the payments table for a row with status `paid`.

**Emails are not arriving.** Check `RESEND_API_KEY` is set and look in spam. The
app sends its own mail through Resend, so the Supabase auth email settings have
no effect on it.
