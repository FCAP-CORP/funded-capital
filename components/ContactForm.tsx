"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, AlertTriangle } from "lucide-react";
import SmsConsentField from "@/components/SmsConsentField";

export default function ContactForm() {
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
    data.append("formType", "contact");
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
      <h2 className="text-xl font-bold text-navy-900 mb-6">
        Send Us a Message
      </h2>
      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
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
            <label htmlFor="phone" className="form-label">Phone Number</label>
            <input id="phone" name="phone" type="tel" className="form-input" placeholder="(555) 000-0000" />
          </div>
        </div>

        {/* SMS / call consent — directly below the phone field. Optional. */}
        <SmsConsentField />

        <div>
          <label htmlFor="subject" className="form-label">Subject *</label>
          <select id="subject" name="subject" required className="form-input">
            <option value="">Select a topic...</option>
            <option value="loan-inquiry">Loan Inquiry</option>
            <option value="broker">Broker Partnership</option>
            <option value="existing-loan">Existing Loan Question</option>
            <option value="rates">Rates &amp; Programs</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label htmlFor="message" className="form-label">Message *</label>
          <textarea id="message" name="message" required rows={5} className="form-input resize-none" placeholder="Tell us about your deal or question..." />
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4" role="alert">
            <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800 leading-relaxed">
              Something went wrong sending your message — your answers are still
              here. Please try again, or reach us directly at{" "}
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
          {submitting ? "Sending..." : error ? "Try Again" : "Send Message"}
          {!submitting && <ArrowRight size={16} />}
        </button>

        <p className="text-xs text-slate-400 text-center">
          We typically respond within 2 business hours. Your information is kept confidential.
        </p>
      </form>
    </div>
  );
}
