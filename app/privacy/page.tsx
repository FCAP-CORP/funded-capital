import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Funded Capital collects, uses, and protects your information, including phone numbers used for calls and text messages. Opt out of messaging any time by replying STOP.",
};

const EFFECTIVE_DATE = "August 30, 2026";

export default function PrivacyPolicyPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-navy-900 py-14">
        <div className="section-container max-w-3xl">
          <p className="section-label">Legal</p>
          <h1 className="text-3xl lg:text-4xl font-bold text-white mt-2">
            Privacy Policy
          </h1>
          <p className="text-slate-400 mt-3 text-sm">
            Effective {EFFECTIVE_DATE}
          </p>
        </div>
      </section>

      {/* Body */}
      <section className="section-padding bg-white">
        <div className="section-container">
          <article className="max-w-3xl mx-auto flex flex-col gap-8 text-slate-600 leading-relaxed">
            <p>
              Funded Capital (&ldquo;Funded Capital,&rdquo; &ldquo;we,&rdquo;
              &ldquo;us,&rdquo; or &ldquo;our&rdquo;) respects your privacy. This
              Privacy Policy explains what information we collect through our
              website and forms, how we use it, and the choices you have. By using
              our website or submitting a form, you agree to this Policy.
            </p>

            <section>
              <h2 className="text-xl font-bold text-navy-900 mb-3">
                1. Information We Collect
              </h2>
              <p>
                When you complete an application, contact form, or other request,
                we collect the information you provide, which may include your
                name, email address, <strong>phone number</strong>, property and
                loan details, investment experience, and any additional
                information you choose to share. We also automatically collect
                limited technical information such as your IP address, browser
                type, device information, and the date and time of your
                submission.
              </p>
            </section>

            <section
              id="sms"
              className="rounded-2xl border border-slate-200 bg-slate-50 p-6"
            >
              <h2 className="text-xl font-bold text-navy-900 mb-3">
                2. Phone Numbers, Calls &amp; Text Messages (SMS)
              </h2>
              <p>
                We collect phone numbers so that we can respond to your inquiry
                and discuss your loan options. If you provide your phone number
                and give consent, we may contact you by phone call and by text
                message (SMS), <strong>including calls and messages sent using
                automated technology</strong>, at the number you provide, about
                your inquiry and loan options.
              </p>
              <ul className="mt-4 flex flex-col gap-2 list-disc pl-5">
                <li>
                  <strong>Consent is not a condition of any purchase, loan, or
                  service.</strong> You can request a loan or contact us without
                  agreeing to receive calls or texts.
                </li>
                <li>Message frequency varies.</li>
                <li>Message and data rates may apply.</li>
                <li>
                  To stop receiving text messages at any time, reply{" "}
                  <strong>STOP</strong> to any message. For help, reply{" "}
                  <strong>HELP</strong>, or contact us using the details below.
                </li>
                <li>
                  You may also ask us to stop calling or texting you by emailing
                  or calling us at the contact details in the Contact Us section below.
                </li>
              </ul>
              <p className="mt-4 font-semibold text-navy-900">
                We will not share mobile contact information with third parties or
                affiliates for marketing or promotional purposes. Mobile opt-in
                and consent information is never sold or shared with third parties,
                and text-messaging originator opt-in data is not shared with any
                third parties.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy-900 mb-3">
                3. How We Use Your Information
              </h2>
              <p>
                We use your information to respond to your inquiry, evaluate and
                process loan requests, provide preliminary term sheets, contact
                you about your request and our services, maintain records
                (including records of the consent you provide), comply with legal
                and regulatory obligations, and improve our website and services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy-900 mb-3">
                4. How We Share Your Information
              </h2>
              <p>
                We may share your information with service providers who help us
                operate our business (for example, form processing, hosting,
                customer communications, and phone/messaging providers) under
                obligations of confidentiality, and with lending partners solely
                to evaluate or fulfill your loan request. We may also disclose
                information when required by law or to protect our rights. As
                stated above, we do not sell your personal information, and we do
                not share mobile opt-in or consent data with third parties for
                their own marketing.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy-900 mb-3">
                5. Proof of Consent &amp; Recordkeeping
              </h2>
              <p>
                When you opt in to receive calls or text messages, we keep a
                record of your consent, including the date and time, the phone
                number provided, the IP address of the submission, the web page
                where consent was given, and the exact consent language displayed
                to you. We retain these records to document your consent and to
                comply with applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy-900 mb-3">
                6. Data Security
              </h2>
              <p>
                We use reasonable administrative, technical, and physical
                safeguards designed to protect your information. No method of
                transmission or storage is completely secure, however, and we
                cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy-900 mb-3">
                7. Analytics &amp; Website Measurement
              </h2>
              <p>
                We measure how our website is used so we can improve it. This
                tells us which pages people visit and how far they get through
                our forms. We use two tools:
              </p>
              <ul className="list-disc pl-5 mt-3 flex flex-col gap-2">
                <li>
                  <strong>Vercel Analytics</strong>, provided by our website
                  host. It does not use cookies and does not identify you
                  individually.
                </li>
                <li>
                  <strong>Google Analytics</strong>, which uses cookies and
                  similar technologies to recognize a returning browser. We have
                  it configured to shorten (anonymize) your IP address.
                </li>
              </ul>
              <p className="mt-4">
                These tools record page visits, the pages you came from, and
                general information about your device, browser, and approximate
                region. We also record when a form is started and when it is
                submitted successfully. We do{" "}
                <strong>not</strong> send the information you type into our
                forms &mdash; your name, email address, phone number, property
                details, or credit information &mdash; to any analytics
                provider.
              </p>
              <p className="mt-4">
                Most browsers let you block or delete cookies in their settings,
                and Google offers a browser add-on that opts you out of Google
                Analytics entirely. Blocking either tool does not affect your
                ability to use our website or submit a loan request.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy-900 mb-3">
                8. Your Choices &amp; Rights
              </h2>
              <p>
                You may opt out of text messages at any time by replying STOP, and
                you may ask us to stop contacting you by phone or email. Depending
                on where you live, you may have rights to access, correct, or
                delete your personal information. To exercise any of these choices,
                contact us using the details below.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy-900 mb-3">
                9. Contact Us
              </h2>
              <p>
                Funded Capital
                <br />
                100 N Biscayne Blvd, Suite 1210, Miami, FL 33132
                <br />
                Phone:{" "}
                <a href="tel:+13058575620" className="text-gold-600 underline hover:text-gold-700">
                  +1 (305) 857-5620
                </a>
                <br />
                Email:{" "}
                <a
                  href="mailto:processing@fundedcapital.com"
                  className="text-gold-600 underline hover:text-gold-700"
                >
                  processing@fundedcapital.com
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-navy-900 mb-3">
                10. Changes to This Policy
              </h2>
              <p>
                We may update this Privacy Policy from time to time. The
                &ldquo;Effective&rdquo; date above reflects the most recent
                revision. Your continued use of our website after changes are
                posted constitutes acceptance of the updated Policy.
              </p>
            </section>

            <p className="text-sm text-slate-400 border-t border-slate-100 pt-6">
              See also our{" "}
              <Link href="/terms" className="text-gold-600 underline hover:text-gold-700">
                Terms &amp; Conditions
              </Link>
              .
            </p>
          </article>
        </div>
      </section>
    </>
  );
}
