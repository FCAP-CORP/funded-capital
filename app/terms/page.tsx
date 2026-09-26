import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "The terms governing your use of the Funded Capital website and services, including our SMS/text messaging program terms. Reply STOP to opt out or HELP for help.",
};

const EFFECTIVE_DATE = "July 27, 2026";

export default function TermsPage() {
  return (
    <>
      {/* Hero */}
      <section aria-labelledby="legal-heading" className="bg-deep text-bone on-deep">
        <div className="section-container flex flex-col gap-5 py-16 lg:py-20">
          <p className="eyebrow">Legal</p>
          <h1 id="legal-heading" className="text-5xl leading-[0.98] sm:text-6xl">
            Terms &amp; Conditions
          </h1>
          <p className="font-figure text-[13px] text-[#A9B3C2]">
            Effective {EFFECTIVE_DATE}
          </p>
        </div>
      </section>

      {/* Body */}
      <section className="bg-bone text-deep">
        <div className="section-container py-16 lg:py-24">
          <article className="flex max-w-[760px] flex-col gap-8 text-[17px] leading-relaxed text-deep-muted">
            <p>
              These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your access
              to and use of the Funded Capital website and services. By using our
              website or submitting a form, you agree to these Terms. If you do not
              agree, please do not use the website.
            </p>

            <section>
              <h2 className="mb-3 text-2xl text-deep sm:text-[28px]">
                1. No Offer to Lend
              </h2>
              <p>
                Nothing on this website is an offer or commitment to lend. All
                loans are subject to underwriting, credit approval, and other
                conditions. Rates, terms, and program availability may change at
                any time without notice and vary by state and borrower profile.
              </p>
            </section>

            <section
              id="messaging"
              className="rounded-[2px] border border-rule bg-paper p-6"
            >
              <h2 className="mb-3 text-2xl text-deep sm:text-[28px]">
                2. Text Messaging &amp; Call Program Terms
              </h2>
              <p>
                By providing your phone number and checking the consent box on our
                forms, you agree to receive calls and text messages (SMS),
                including messages sent using automated technology, from Funded
                Capital at the number you provide about your inquiry and loan
                options. This program is operated by Funded Capital.
              </p>
              <ul className="mt-4 flex flex-col gap-2 list-disc pl-5">
                <li>
                  <strong>Consent is not a condition of any purchase, loan, or
                  service.</strong>
                </li>
                <li>Message frequency varies.</li>
                <li>Message and data rates may apply.</li>
                <li>
                  Reply <strong>STOP</strong> to any text message to opt out at
                  any time. After you send STOP, we will send one confirmation
                  message and then stop sending texts.
                </li>
                <li>
                  Reply <strong>HELP</strong> for help, or contact us at{" "}
                  <a href="tel:+13058575620" className="text-link">
                    +1 (305) 857-5620
                  </a>{" "}
                  or{" "}
                  <a
                    href="mailto:processing@fundedcapital.com"
                    className="text-link"
                  >
                    processing@fundedcapital.com
                  </a>
                  .
                </li>
                <li>
                  Carriers are not liable for delayed or undelivered messages.
                </li>
                <li>
                  Supported carriers may include major U.S. carriers; carrier
                  participation may change.
                </li>
              </ul>
              <p className="mt-4">
                For details on how we handle the information collected through this
                program, see our{" "}
                <Link href="/privacy" className="text-link">
                  Privacy Policy
                </Link>
                .
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl text-deep sm:text-[28px]">
                3. Eligibility &amp; Accurate Information
              </h2>
              <p>
                You represent that you are at least 18 years old and that the
                information you provide is accurate and that you are authorized to
                provide any phone number you submit. Providing false information or
                submitting a number you are not authorized to use is prohibited.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl text-deep sm:text-[28px]">
                4. Intellectual Property
              </h2>
              <p>
                All content on this website, including text, graphics, logos, and
                software, is owned by or licensed to Funded Capital and is
                protected by applicable intellectual property laws. You may not
                reproduce, distribute, or create derivative works without our
                permission.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl text-deep sm:text-[28px]">
                5. Disclaimers &amp; Limitation of Liability
              </h2>
              <p>
                The website and its content are provided &ldquo;as is&rdquo;
                without warranties of any kind, whether express or implied. To the
                fullest extent permitted by law, Funded Capital is not liable for
                any indirect, incidental, or consequential damages arising out of
                your use of the website or services.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl text-deep sm:text-[28px]">
                6. Governing Law
              </h2>
              <p>
                These Terms are governed by the laws of the State of Florida,
                without regard to its conflict-of-laws principles.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl text-deep sm:text-[28px]">
                7. Changes to These Terms
              </h2>
              <p>
                We may update these Terms from time to time. The
                &ldquo;Effective&rdquo; date above reflects the most recent
                revision. Your continued use of the website after changes are
                posted constitutes acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-2xl text-deep sm:text-[28px]">
                8. Contact Us
              </h2>
              <p>
                Funded Capital
                <br />
                100 N Biscayne Blvd, Suite 1210, Miami, FL 33132
                <br />
                Phone:{" "}
                <a href="tel:+13058575620" className="text-link">
                  +1 (305) 857-5620
                </a>
                <br />
                Email:{" "}
                <a
                  href="mailto:processing@fundedcapital.com"
                  className="text-link"
                >
                  processing@fundedcapital.com
                </a>
              </p>
            </section>
          </article>
        </div>
      </section>
    </>
  );
}
