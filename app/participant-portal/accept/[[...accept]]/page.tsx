import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set Your Password | Participant Portal",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * First-time setup for a participant.
 *
 * Participants are sent here by the welcome email Luis writes himself, via the
 * "First time here? Set your password" link on the sign-in screen. Clerk is
 * only the password store — it sends no invitation of its own, so nothing in
 * this flow depends on Clerk's hosted pages or its dashboard redirect settings.
 *
 * Creating an account here grants nothing by itself: every figure in the portal
 * is scoped to the signed-in email's rows in the participant sheet, so someone
 * who signs up without a participation simply has nothing to see.
 */
export default function ParticipantAcceptPage() {
  return (
    <div className="min-h-screen grid place-items-center bg-ink px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/LogoWhite.png"
            alt="Funded Capital"
            style={{ height: "48px", width: "auto" }}
            className="mx-auto"
          />
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-500">
            Set Your Password
          </p>
          <p className="mt-3 text-sm text-slate-400">
            Use the email address on your participation agreement. We will send
            a short code to confirm it is you, then you choose a password.
          </p>
        </div>

        <SignUp
          routing="hash"
          fallbackRedirectUrl="/participant-portal"
          signInUrl="/participant-portal/login"
        />

        <p className="mt-8 text-center text-xs text-slate-500">
          Already have access?{" "}
          <a href="/participant-portal/login" className="text-gold-500 hover:underline">
            Sign in
          </a>
          {" · "}
          <a href="mailto:info@fundedcapital.com" className="text-gold-500 hover:underline">
            info@fundedcapital.com
          </a>
        </p>
      </div>
    </div>
  );
}
