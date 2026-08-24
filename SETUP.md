# Setup

How to get the app running, from a clone to a deployed site. Work top to bottom;
each step ends with something you can verify.

You need four accounts: Supabase, Anthropic, Stripe, and Resend. All four have a
free tier that is enough to try this. Node 22 or newer.

## Contents

- [1. Install](#1-install)
- [2. Environment variables](#2-environment-variables)
- [3. Supabase](#3-supabase)
- [4. Anthropic](#4-anthropic)
- [5. Stripe](#5-stripe)
- [6. Resend](#6-resend)
- [7. Run it](#7-run-it)
- [8. Your first account](#8-your-first-account)
- [9. Deploy to Netlify](#9-deploy-to-netlify)
- [Privacy policy](#privacy-policy)
- [Swapping in your template](#swapping-in-your-template)
- [How the pieces fit](#how-the-pieces-fit)

## 1. Install

```bash
git clone <your fork>
cd proposal-generator
npm install
```

**On Windows, check your project path for an `&`.** npm's Windows shim splits
the path at an ampersand, so `npm run dev`, `npm run build`, and `npx` all fail
with a path that never existed. Rename any folder in the path that contains one.
If you would rather not, call the binary directly instead of using the npm
scripts:

```powershell
node .\node_modules\next\dist\bin\next dev
node .\node_modules\next\dist\bin\next build
```

Linux and macOS are unaffected, and so are Netlify builds, which run on Linux.

## 2. Environment variables

Create `.env.local` in the project root. Every variable below is required except
`NEXT_PUBLIC_SITE_URL` and `PRIVACY_POLICY_URL`. The next sections say where each
value comes from.

```bash
# Supabase: Dashboard -> Project Settings -> API
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic: console.anthropic.com -> API keys
ANTHROPIC_API_KEY=

# Stripe: dashboard.stripe.com -> Developers -> API keys
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Resend: resend.com -> API keys
RESEND_API_KEY=
EMAIL_FROM=Your Name <you@yourdomain.com>
# Footer on every message to a client. \n starts a new line. Leave blank for none.
EMAIL_SIGN_OFF=Your Name\nWhat you do, in one line.

# Absolute base URL, used for client links and Stripe return URLs.
# http://localhost:3000 locally, your real site address once deployed.
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Full address of your privacy policy, printed at the foot of the signed PDF.
# Leave it out and the PDF carries no policy line. The app serves its own
# page at /privacy, so this is normally your site address plus /privacy.
PRIVACY_POLICY_URL=http://localhost:3000/privacy
```

`.env.local` is git ignored, along with every other file starting with `.env`.
Keep it that way: `SUPABASE_SERVICE_ROLE_KEY` bypasses row level security and
`ANTHROPIC_API_KEY` spends money.

## 3. Supabase

1. Create a project at <https://supabase.com/dashboard>.
2. **SQL Editor -> New query**, paste the whole of `supabase/schema.sql`, and
   run it. It creates `profiles`, `proposals`, `signatures`, `payments`, the row
   level security policies, and the signup trigger. It is idempotent, so running
   it again is safe, and you will run it again whenever you pull a change that
   touches the schema.
3. **Project Settings -> API**, copy three values into `.env.local`:
   - Project URL into `NEXT_PUBLIC_SUPABASE_URL`
   - the `anon` `public` key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - the `service_role` `secret` key into `SUPABASE_SERVICE_ROLE_KEY`

   The service role key bypasses row level security. It is used only in server
   code, never in anything that reaches the browser. Do not put it in a variable
   whose name starts with `NEXT_PUBLIC_`.

4. **Authentication -> URL Configuration**: set the Site URL to
   `http://localhost:3000` for now, and add `http://localhost:3000/auth/callback`
   to the redirect URLs. Add your production URL and its callback once you
   deploy.
5. **Authentication -> Sign In / Providers -> Email**: leave "Confirm email" on
   for production. Turn it off while you are testing locally, so you can sign up
   and get straight in.

Supabase's own auth emails are not used for client invitations. They are all
built from that one Site URL field, so they point at the same host wherever the
app is actually running. The app sends its own mail instead, through Resend.

**Verify:** run the app, create an account, and check that a row appears in
`profiles` with your user id.

## 4. Anthropic

1. Get a key at <https://console.anthropic.com> under API keys.
2. Put it in `.env.local` as `ANTHROPIC_API_KEY`.

Drafting uses Claude Opus 5 (`claude-opus-5`) at medium effort, with server side
refusal fallbacks: if a brief is declined by safety classifiers, Anthropic
re runs it on a fallback model inside the same call rather than returning
nothing. Expect roughly $0.05 to $0.20 per proposal drafted.

To use a different model, change `MODEL` at the top of `lib/generate.ts`. Models
before Opus 4.6 do not support the `fallbacks` parameter, so remove `betas` and
`fallbacks` from that call if you go back that far.

**Verify:** create a proposal from a brief. It takes 30 to 90 seconds.

## 5. Stripe

1. Create an account and stay in **Test mode**.
2. **Developers -> API keys**: the secret key goes in `STRIPE_SECRET_KEY`, the
   publishable key in `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
3. The webhook is what marks a proposal paid when the client closes the tab.

   Locally, install the Stripe CLI and run:

   ```bash
   stripe login
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   Copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`.

   In production, **Developers -> Webhooks -> Add endpoint** pointing at
   `https://YOUR-SITE/api/stripe/webhook`. Subscribe to
   `checkout.session.completed`, `checkout.session.expired`, and
   `checkout.session.async_payment_failed`, then copy that endpoint's signing
   secret into your host's environment variables.

Stripe will not create a session for less than 0.50 in the account currency, so
a deposit below that fails at checkout.

**Verify:** sign a proposal and pay with card `4242 4242 4242 4242`, any future
expiry, any CVC. The proposal should show **Signed & paid** in the dashboard.

## 6. Resend

The app sends every message itself: client invitations, completion notices, and
both halves of a decline. Without a key, nothing is emailed and sending a
proposal fails.

1. Create an account at <https://resend.com> and add your domain under
   **Domains**, following the DNS records it gives you. Until a domain is
   verified you can only send to your own address.
2. **API keys -> Create API key**, and put it in `RESEND_API_KEY`.
3. Set `EMAIL_FROM` to a name and an address on that domain, in the form
   `Your Name <you@yourdomain.com>`. This is what your clients see as the
   sender. There is no default: with it unset, nothing is sent.
4. Set `EMAIL_SIGN_OFF` to the footer you want at the bottom of every message
   to a client, using `\n` for a line break. Leave it blank and messages
   carry no footer.

**Verify:** send a proposal to yourself and check it arrives. Look in spam the
first time.

## 7. Run it

```bash
npm run dev          # http://localhost:3000
```

You are redirected to `/login`. From here on, [README.md](./README.md) is the
guide to using the app.

## 8. Your first account

Sign up, then make yourself the owner. The dashboard is closed to everybody
without this flag, because your clients also get real accounts when you send
them a proposal.

In the Supabase SQL editor:

```sql
update public.profiles set is_owner = true
where id = (select id from auth.users where email = 'you@example.com');
```

**Verify:** open `/dashboard`. Without the flag you are turned away.

## 9. Deploy to Netlify

1. Push to a git repository, then **Add new site -> Import an existing project**.
2. Build settings come from `netlify.toml`. Leave them alone.
3. Add every variable from step 2 under **Site configuration -> Environment
   variables**, with production values. Set `NEXT_PUBLIC_SITE_URL` to your live
   site address, for example `https://your-site.netlify.app`.

   Set it. Left unset, the app works out its own address from Netlify's
   environment, and on a branch deploy that address is `branch--your-site`,
   which is not the one people are browsing. Sign in links then set the session
   cookie on one host and land the visitor on the other, so every client is
   bounced back to the sign in panel.
4. Set `PRIVACY_POLICY_URL` to your live site address plus `/privacy`, so the
   signed PDF links to a policy people can actually reach.
5. After the first deploy, go back to Supabase and update the Site URL and the
   redirect URLs, and add the production Stripe webhook endpoint.

If Netlify does not add the Next.js runtime plugin by itself, add it under
**Integrations -> Next.js**.

## Privacy policy

The app serves a policy at `/privacy`. It is a public page: clients who are not
signed in can read it, and the foot of every proposal links to it.

1. Open `app/privacy/page.tsx` and replace every bracketed placeholder: the
   business name, address, contact address, effective date, the legal reason
   for each use of data, the retention periods, international transfers, the
   cookie position, and the data protection authority to complain to. What
   ships is a skeleton, and it is not legal advice.
2. Set `PRIVACY_POLICY_URL` to the full address of that page. The signed PDF
   then carries the address as its last line, clickable. Left unset, the PDF
   simply leaves the line off.

The PDF stores the address only. Change the policy later and an old PDF points
at the new wording, so put a version or a date on the page if that matters to
you.

## Swapping in your template

`lib/template.ts` is the only file to edit. It holds:

- `TEMPLATE_SECTIONS`: which sections exist, their order, headings, and the
  instruction the model gets for each one.
- `TEMPLATE_VOICE`: tone and formatting rules applied across every section.

Nothing else hardcodes a section list. Add, remove, or reorder entries and the
editor, the client facing page, and the prompt all follow.

Exactly one section should carry `kind: "pricing"`. That is where the pricing
table renders.

What ships is a placeholder modelled on a standard services proposal. Replace it
with your own.

## How the pieces fit

| Path | What it does |
| --- | --- |
| `proxy.ts` | Refreshes the Supabase session and gates `/dashboard`. `/p/*` is excluded, so clients never hit auth. In Next.js 16 this file replaces `middleware.ts` |
| `lib/generate.ts` | The Claude call. Structured outputs pin the response shape, and sections are reassembled in template order so the model cannot drop or reorder one |
| `lib/crypto.ts` | 22 character base62 slugs, about 131 bits, and the SHA-256 content hash stored with every signature |
| `lib/client-access.ts` | The single decision about who may see or act on a proposal. The page and all three endpoints go through it |
| `app/api/sign` | Records a signature with IP, user agent, timestamp, and content hash. Idempotent |
| `app/api/decline` | Records a refusal and closes the proposal for every signer |
| `app/api/checkout` | Creates the Stripe Checkout session, and parks the signature that would complete an unpaid proposal |
| `app/api/stripe/webhook` | Source of truth for payment. Verifies the Stripe signature against the raw body |
| `lib/finalise.ts` | Everything that follows a successful payment, including writing the parked signature |
| `lib/notifications.ts` | Every message the app sends, in one file |
| `lib/pdf/ProposalPdf.tsx` | The signed PDF |

Once a proposal carries one signature the editor goes read only. Editing after
signing would invalidate the hash that proves what was agreed to.
