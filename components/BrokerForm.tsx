"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, AlertTriangle } from "lucide-react";
import SmsConsentField from "@/components/SmsConsentField";
import FormShield from "@/components/FormShield";
import { trackFormStart, trackLead, trackLeadError } from "@/lib/analytics";

/**
 * Broker partner registration.
 *
 * A broker is a PARTNER, not a borrower. They are registering themselves, not
 * submitting a deal — so this form asks nothing about credit score, property
 * address, ARV, purchase price, loan amount or exit strategy. Sending brokers
 * through /apply asked them all of that, which is both a poor first impression
 * and data we cannot use.
 *
 * Posts to the same /api/lead endpoint with formType="broker", so the consent
 * capture, spam screening and Drive intake are identical to every other form.
 */
const PROGRAMS = [
  { value: "fix-flip", label: "Fix & Flip" },
  { value: "dscr", label: "DSCR / Rental" },
  { value: "construction", label: "New Construction" },
  { value: "multifamily", label: "Multifamily" },
];

export default function BrokerForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const startedRef = useRef(false);

  function handleFirstInteraction() {
    if (startedRef.current) return;
    startedRef.current = true;
    trackFormStart("broker");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(false);
    const form = e.currentTarget;
    const data = new FormData(form);
    let reported = false;

    // Checkboxes share one name, and the server keeps a single value per key.
    // Collapse them to one comma-separated field before sending.
    const programs = data.getAll("programs").map(String).filter(Boolean);
    data.delete("programs");
    if (programs.length) data.append("programs", programs.join(", "));

    data.append("formType", "broker");
    data.append(
      "consent_page_url",
      typeof window !== "undefined" ? window.location.href : ""
    );

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        reported = true;
        trackLeadError("broker", res.status);
        throw new Error(`broker registration failed: ${res.status}`);
      }
      trackLead("broker", {
        loanType: programs.join(", "),
        smsConsent: data.get("smsConsent") != null,
      });
      router.push("/thank-you");
    } catch {
      if (!reported) trackLeadError("broker", "network");
      setError(true);
      setSubmitting(false);
    }
  }

  return (
    <div className="border border-rule bg-paper p-6 sm:p-8">
      <h2 className="mb-1 text-3xl text-deep">Register as a Broker Partner</h2>
      <p className="mb-6 text-sm text-deep-muted">
        Free to register, no minimum volume. A dedicated account manager is
        assigned within 24 hours.
      </p>

      <form
        className="relative flex flex-col gap-5"
        onSubmit={handleSubmit}
        onFocusCapture={handleFirstInteraction}
      >
        <FormShield />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="form-label">First Name *</label>
            <input id="firstName" name="firstName" type="text" required className="form-input" placeholder="Dana" />
          </div>
          <div>
            <label htmlFor="lastName" className="form-label">Last Name *</label>
            <input id="lastName" name="lastName" type="text" required className="form-input" placeholder="Reyes" />
          </div>
        </div>

        <div>
          <label htmlFor="company" className="form-label">Company / Brokerage *</label>
          <input id="company" name="company" type="text" required className="form-input" placeholder="Reyes Capital Partners" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="email" className="form-label">Work Email *</label>
            <input id="email" name="email" type="email" required className="form-input" placeholder="dana@brokerage.com" />
          </div>
          <div>
            <label htmlFor="phone" className="form-label">Phone Number *</label>
            <input id="phone" name="phone" type="tel" required className="form-input" placeholder="(555) 000-0000" />
          </div>
        </div>

        <SmsConsentField />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="partnerType" className="form-label">I am a... *</label>
            <select id="partnerType" name="partnerType" required className="form-input">
              <option value="">Select...</option>
              <option value="mortgage-broker">Mortgage Broker</option>
              <option value="real-estate-agent">Real Estate Agent</option>
              <option value="wholesaler">Wholesaler</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="licenseNumber" className="form-label">NMLS or License #</label>
            <input id="licenseNumber" name="licenseNumber" type="text" className="form-input" placeholder="Optional" />
          </div>
        </div>

        <div>
          <label htmlFor="statesServed" className="form-label">States You Work In *</label>
          <input id="statesServed" name="statesServed" type="text" required className="form-input" placeholder="FL, GA, TX" />
          <p className="mt-1.5 text-xs text-deep-soft">
            We lend nationwide with a handful of exclusions — we&apos;ll confirm your
            states when we set you up.
          </p>
        </div>

        <fieldset>
          <legend className="form-label">Programs You Place</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
            {PROGRAMS.map((p) => (
              <label key={p.value} htmlFor={`program-${p.value}`} className="flex min-h-[44px] items-center gap-2.5 text-sm text-deep">
                <input
                  id={`program-${p.value}`}
                  name="programs"
                  type="checkbox"
                  value={p.value}
                  className="h-4 w-4 rounded-[2px] border-rule text-brass-700 accent-brass-500 focus:ring-brass-500"
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="monthlyVolume" className="form-label">Deals You Place Per Month</label>
          <select id="monthlyVolume" name="monthlyVolume" className="form-input">
            <option value="">Select...</option>
            <option value="1-2">1–2</option>
            <option value="3-5">3–5</option>
            <option value="6-10">6–10</option>
            <option value="10+">10+</option>
            <option value="varies">It varies</option>
          </select>
          <p className="mt-1.5 text-xs text-deep-soft">No minimum required.</p>
        </div>

        <div>
          <label htmlFor="message" className="form-label">Anything Else We Should Know?</label>
          <textarea id="message" name="message" rows={4} className="form-input resize-none" placeholder="Current lender relationships, deal types you specialise in, questions about the fee schedule..." />
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-[2px] bg-red-50 border border-red-200 p-4" role="alert">
            <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 leading-relaxed">
              Something went wrong sending your registration — your answers are
              still here. Please try again, or reach us directly at{" "}
              <a href="tel:+13058575620" className="font-semibold underline">
                +1 (305) 857-5620
              </a>{" "}
              or{" "}
              <a href="mailto:info@fundedcapital.com" className="font-semibold underline">
                info@fundedcapital.com
              </a>
              .
            </p>
          </div>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full justify-center text-base py-4">
          {submitting ? "Registering..." : error ? "Try Again" : "Register as a Partner"}
          {!submitting && <ArrowRight size={16} />}
        </button>

        <p className="text-xs text-deep-soft text-center">
          Free to register. Referral fees are quoted per deal and paid at
          closing; terms are confirmed in your partner agreement.
        </p>
      </form>
    </div>
  );
}
