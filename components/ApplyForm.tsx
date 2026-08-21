"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, AlertTriangle } from "lucide-react";
import SmsConsentField from "@/components/SmsConsentField";

export default function ApplyForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(false);
    const form = e.currentTarget;
    const data = new FormData(form);
    // Routed through our own API so the server can capture the real IP,
    // a trustworthy timestamp, and the exact consent language as proof.
    data.append("formType", "apply");
    data.append(
      "consent_page_url",
      typeof window !== "undefined" ? window.location.href : ""
    );
    // Only show the thank-you page when the lead actually went through.
    // A failed submission keeps the visitor's answers on screen and shows
    // a direct phone/email fallback so the lead is never silently lost.
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`lead submit failed: ${res.status}`);
      router.push("/thank-you");
    } catch {
      setError(true);
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <form className="flex flex-col gap-8" onSubmit={handleSubmit}>
        {/* Section: Your Information */}
        <fieldset className="flex flex-col gap-5">
          <legend className="font-bold text-navy-900 text-lg border-b border-slate-100 pb-3 w-full">
            Your Information
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className="form-label">First Name *</label>
              <input id="firstName" name="firstName" type="text" required className="form-input" placeholder="John" />
            </div>
            <div>
              <label htmlFor="lastName" className="form-label">Last Name *</label>
              <input id="lastName" name="lastName" type="text" required className="form-input" placeholder="Smith" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="email" className="form-label">Email Address *</label>
              <input id="email" name="email" type="email" required className="form-input" placeholder="john@example.com" />
            </div>
            <div>
              <label htmlFor="phone" className="form-label">Phone Number *</label>
              <input id="phone" name="phone" type="tel" required className="form-input" placeholder="(555) 000-0000" />
            </div>
          </div>

          {/* SMS / call consent — directly below the phone field. Optional. */}
          <SmsConsentField />

          <div>
            <label htmlFor="borrowerType" className="form-label">I am a... *</label>
            <select id="borrowerType" name="borrowerType" required className="form-input">
              <option value="">Select...</option>
              <option value="investor">Real Estate Investor</option>
              <option value="broker">Mortgage Broker (submitting on behalf of borrower)</option>
              <option value="developer">Developer / Builder</option>
              <option value="other">Other</option>
            </select>
          </div>
        </fieldset>

        {/* Section: Loan Details */}
        <fieldset className="flex flex-col gap-5">
          <legend className="font-bold text-navy-900 text-lg border-b border-slate-100 pb-3 w-full">
            Loan Details
          </legend>
          <div>
            <label htmlFor="loanType" className="form-label">Loan Program *</label>
            <select id="loanType" name="loanType" required className="form-input">
              <option value="">Select a program...</option>
              <option value="fix-flip">Fix &amp; Flip</option>
              <option value="dscr">DSCR / Rental</option>
              <option value="construction">New Construction</option>
              <option value="multifamily">Multifamily</option>
              <option value="unsure">Not sure — help me choose</option>
            </select>
          </div>
          <div>
            <label htmlFor="propertyAddress" className="form-label">Property Address</label>
            <input id="propertyAddress" name="propertyAddress" type="text" className="form-input" placeholder="123 Main St, Miami, FL 33101" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="propertyType" className="form-label">Property Type *</label>
              <select id="propertyType" name="propertyType" required className="form-input">
                <option value="">Select...</option>
                <option value="sfr">Single Family Residence</option>
                <option value="2-4">2–4 Units</option>
                <option value="multifamily">5+ Units (Multifamily)</option>
                <option value="condo">Condo / Townhome</option>
                <option value="commercial">Commercial</option>
                <option value="land">Land / Lot</option>
              </select>
            </div>
            <div>
              <label htmlFor="purchasePrice" className="form-label">Purchase Price / Current Value</label>
              <input id="purchasePrice" name="purchasePrice" type="text" className="form-input" placeholder="$450,000" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="loanAmount" className="form-label">Loan Amount Requested</label>
              <input id="loanAmount" name="loanAmount" type="text" className="form-input" placeholder="$350,000" />
            </div>
            <div>
              <label htmlFor="arv" className="form-label">After Repair Value (ARV)</label>
              <input id="arv" name="arv" type="text" className="form-input" placeholder="$600,000 (for Fix &amp; Flip)" />
            </div>
          </div>
          <div>
            <label htmlFor="exitStrategy" className="form-label">Exit Strategy *</label>
            <select id="exitStrategy" name="exitStrategy" required className="form-input">
              <option value="">Select...</option>
              <option value="sell">Sell / Flip</option>
              <option value="refi">Refinance to Long-Term</option>
              <option value="hold">Hold as Rental</option>
              <option value="construction-sell">Build &amp; Sell</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="timeline" className="form-label">Desired Closing Timeline *</label>
            <select id="timeline" name="timeline" required className="form-input">
              <option value="">Select...</option>
              <option value="asap">ASAP (under 7 days)</option>
              <option value="2weeks">Within 2 weeks</option>
              <option value="month">Within 30 days</option>
              <option value="flexible">Flexible</option>
            </select>
          </div>
        </fieldset>

        {/* Section: Experience */}
        <fieldset className="flex flex-col gap-5">
          <legend className="font-bold text-navy-900 text-lg border-b border-slate-100 pb-3 w-full">
            Your Experience
          </legend>
          <div>
            <label htmlFor="experience" className="form-label">Real Estate Investment Experience *</label>
            <select id="experience" name="experience" required className="form-input">
              <option value="">Select...</option>
              <option value="first">First deal</option>
              <option value="1-3">1–3 deals completed</option>
              <option value="4-10">4–10 deals completed</option>
              <option value="10+">10+ deals completed</option>
            </select>
          </div>
          <div>
            <label htmlFor="creditScore" className="form-label">Estimated Credit Score *</label>
            <select id="creditScore" name="creditScore" required className="form-input">
              <option value="">Select a range...</option>
              <option value="below600">Below 600</option>
              <option value="600-619">600–619</option>
              <option value="620-659">620–659</option>
              <option value="660-699">660–699</option>
              <option value="700-739">700–739</option>
              <option value="740+">740+</option>
            </select>
          </div>
          <div>
            <label htmlFor="additionalInfo" className="form-label">Anything else we should know?</label>
            <textarea id="additionalInfo" name="additionalInfo" rows={4} className="form-input resize-none" placeholder="Rehab scope, deal specifics, timeline constraints, or questions for us..." />
          </div>
        </fieldset>

        {/* General consent to be contacted about the inquiry (required). */}
        <div className="flex items-start gap-3">
          <input id="consent" name="consent" type="checkbox" required className="mt-1 w-4 h-4 accent-gold-500" />
          <label htmlFor="consent" className="text-xs text-slate-500 leading-relaxed">
            By submitting this form, I consent to being contacted by Funded Capital
            regarding my loan inquiry. I understand this is not a loan commitment
            and that all loans are subject to underwriting approval.
          </label>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4" role="alert">
            <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 leading-relaxed">
              Something went wrong sending your application — your answers are
              still here. Please try again, or reach us directly at{" "}
              <a href="tel:+13058575620" className="font-semibold underline">
                +1 (305) 857-5620
              </a>{" "}
              or{" "}
              <a href="mailto:processing@fundedcapital.com" className="font-semibold underline">
                processing@fundedcapital.com
              </a>
              .
            </p>
          </div>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full justify-center text-base py-4">
          {submitting ? "Submitting..." : error ? "Try Again" : "Submit My Application"}
          {!submitting && <ArrowRight size={18} />}
        </button>

        <p className="text-xs text-slate-400 text-center">
          Your information is encrypted and kept strictly confidential. We will never sell or share your data.
        </p>
      </form>
    </div>
  );
}
