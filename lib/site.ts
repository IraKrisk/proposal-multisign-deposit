/**
 * Absolute base URL for links that leave the app (client proposal links,
 * Stripe return URLs, sign in links).
 *
 * On Netlify, `URL` is the site's own address and `DEPLOY_PRIME_URL` is the
 * per-branch one. The branch address is used only when Netlify says this is a
 * preview or a branch deploy. The test used to be the other way round, asking
 * whether `CONTEXT` was "production" and taking the branch address otherwise.
 * `CONTEXT` is a build variable and was not there at request time, so the live
 * site emailed sign in links pointing at `main--<site>`: the session cookie was
 * set on that host, the visitor landed on the real one, and every client was
 * bounced back to the sign in panel.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const context = process.env.CONTEXT;
  const preview = context === "deploy-preview" || context === "branch-deploy";

  const netlify = preview
    ? process.env.DEPLOY_PRIME_URL || process.env.URL
    : process.env.URL || process.env.DEPLOY_PRIME_URL;

  if (netlify) return netlify.replace(/\/$/, "");

  return "http://localhost:3000";
}
