import Link from "next/link";

/**
 * SMS / call consent checkbox for public lead forms (TCPA / A2P 10DLC).
 *
 * - Unchecked by default and intentionally NOT `required` — the form submits
 *   whether or not it is ticked. When it is left unticked the server records
 *   sms_consent = NO for that lead.
 * - The visible wording is kept in sync, word for word, with SMS_CONSENT_TEXT
 *   in lib/consent.ts, which the server logs verbatim as the proof-of-consent
 *   record. If you edit the words here, edit them there too and bump
 *   CONSENT_VERSION.
 */
export default function SmsConsentField() {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-slate-50 border border-slate-100 p-4">
      <input
        id="smsConsent"
        name="smsConsent"
        type="checkbox"
        value="true"
        className="mt-1 w-4 h-4 accent-gold-500 shrink-0"
      />
      <label htmlFor="smsConsent" className="text-xs text-slate-500 leading-relaxed">
        I agree to receive calls and text messages, including automated ones, from
        Funded Capital at the number provided about my inquiry and loan options.
        Consent is not a condition of any loan or service. Message and data rates
        may apply; message frequency varies. Reply STOP to opt out or HELP for help.
        See our{" "}
        <Link
          href="/privacy"
          target="_blank"
          className="text-gold-600 underline hover:text-gold-700"
        >
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link
          href="/terms"
          target="_blank"
          className="text-gold-600 underline hover:text-gold-700"
        >
          Terms &amp; Conditions
        </Link>
        .
      </label>
    </div>
  );
}
