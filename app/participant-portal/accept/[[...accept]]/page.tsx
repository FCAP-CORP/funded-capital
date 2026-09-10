import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Activate Your Access | Participant Portal",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Where a Clerk invitation lands.
 *
 * The program is invitation-only: Clerk's sign-up mode is Restricted, so this
 * form only completes when the visitor arrives carrying a valid invitation
 * ticket. Anyone who finds the URL on their own sees the notice and nothing
 * else useful. Set the invitation's redirect URL to this page when inviting a
 * participant.
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
            Activate Your Access
          </p>
          <p className="mt-3 text-sm text-slate-400">
            Choose a password for the email address we invited. This is a
            private program — accounts are created by invitation only.
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
