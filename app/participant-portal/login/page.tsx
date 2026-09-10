import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Participant Portal",
  robots: { index: false, follow: false, nocache: true },
};

export default function ParticipantLoginPage() {
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
            Participant Portal
          </p>
          <p className="mt-3 text-sm text-slate-400">
            Access is by invitation. Sign in with the email address on your
            participation agreement.
          </p>
        </div>
        <SignIn
          routing="hash"
          fallbackRedirectUrl="/participant-portal"
          signUpUrl="/participant-portal/login"
        />
        <p className="mt-8 text-center text-xs text-slate-500">
          Need help signing in? Contact{" "}
          <a href="mailto:info@fundedcapital.com" className="text-gold-500 hover:underline">
            info@fundedcapital.com
          </a>
        </p>
      </div>
    </div>
  );
}
