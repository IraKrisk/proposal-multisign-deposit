import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

/**
 * Public page. The proposal footer links here, so it has to be readable by a
 * client who is not signed in: the proxy matcher gates `/dashboard` only.
 *
 * The bracketed placeholders are the ones the policy shipped with. They are
 * left as placeholders on purpose — the business name, address and retention
 * periods belong to whoever runs the app, not to this repository.
 */
export default function PrivacyPolicyPage() {
  return (
    <main className="doc min-h-screen">
      <article className="mx-auto max-w-2xl px-8 py-16">
        <h1 className="doc-display text-3xl mb-2">Privacy policy</h1>
        <p className="text-sm text-doc-muted mb-10">
          Effective date: [DD Month YYYY]
        </p>

        <div className="doc-prose space-y-8">
          <section>
            <h2 className="doc-display text-xl mb-2">Who runs this app</h2>
            <p>[Business legal name] runs this proposal generator app.</p>
            <p>
              Contact: [privacy email address]
              <br />
              Address: [business address]
            </p>
          </section>

          <section>
            <h2 className="doc-display text-xl mb-2">The data we use</h2>
            <p>
              We use the following data to create, send, sign and pay for
              proposals:
            </p>
            <ul>
              <li>
                Client and signer names, company names and email addresses.
              </li>
              <li>
                Proposal briefs, generated proposal text, prices, terms and
                dates.
              </li>
              <li>
                Signature image or style, signing date, IP address, browser
                details and document hash.
              </li>
              <li>Stripe payment reference, amount and payment status.</li>
            </ul>
          </section>

          <section>
            <h2 className="doc-display text-xl mb-2">Why we use it</h2>
            <p>We use this data to:</p>
            <ul>
              <li>Create and edit proposals.</li>
              <li>Send proposals to the people named to sign them.</li>
              <li>Record signatures and provide a signed PDF.</li>
              <li>Take and record payment where payment is due.</li>
              <li>
                Deal with questions, disputes and legal obligations relating to
                an agreement.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="doc-display text-xl mb-2">Services we use</h2>
            <p>We use the following services to run the app:</p>
            <ul>
              <li>Supabase stores app data and manages sign in.</li>
              <li>
                Anthropic receives proposal briefs and produces proposal drafts.
              </li>
              <li>Resend sends proposal emails.</li>
              <li>Stripe processes card payments.</li>
            </ul>
          </section>

          <section>
            <h2 className="doc-display text-xl mb-2">
              Legal reason for using data
            </h2>
            <p>
              [Insert the legal reason chosen for each use of data after legal
              review.]
            </p>
          </section>

          <section>
            <h2 className="doc-display text-xl mb-2">How long we keep data</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-doc-rule">
                    <th className="py-2 pr-4 font-medium">Data</th>
                    <th className="py-2 font-medium">How long we keep it</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Unsent proposals", "[insert period]"],
                    ["Sent proposals", "[insert period]"],
                    ["Signed proposals and signatures", "[insert period]"],
                    ["Payment records", "[insert period]"],
                    ["Backups", "[insert period]"],
                  ].map(([what, how]) => (
                    <tr key={what} className="border-b border-doc-rule">
                      <td className="py-2 pr-4">{what}</td>
                      <td className="py-2 text-doc-muted">{how}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              We may keep some records for longer where required for tax,
              contract or dispute reasons.
            </p>
          </section>

          <section>
            <h2 className="doc-display text-xl mb-2">Your rights</h2>
            <p>
              You can ask us to provide a copy of your personal data, correct
              inaccurate data, or delete data where we are allowed to do so.
            </p>
            <p>To make a request, contact [privacy email address].</p>
            <p>
              You can also complain to [name and contact details of the relevant
              data protection authority].
            </p>
          </section>

          <section>
            <h2 className="doc-display text-xl mb-2">
              International transfers
            </h2>
            <p>
              [State whether personal data is transferred outside the EU or UK,
              which services are involved, and the safeguards used.]
            </p>
          </section>

          <section>
            <h2 className="doc-display text-xl mb-2">Security</h2>
            <p>
              The app limits proposal access to named, signed in people. Signed
              proposals are locked against editing. Signature records include
              the signer, date and document hash. Stripe payment notifications
              are verified before payment is recorded.
            </p>
          </section>

          <section>
            <h2 className="doc-display text-xl mb-2">Cookies</h2>
            <p>
              [State that the app does not use non essential cookies or
              tracking, if that remains true. Otherwise describe the cookies and
              consent choices.]
            </p>
          </section>

          <section>
            <h2 className="doc-display text-xl mb-2">Changes to this policy</h2>
            <p>
              We may update this policy when the app or our data handling
              changes. The current version will be available in the app.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
