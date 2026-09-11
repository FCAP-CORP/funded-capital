import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Participant Portal",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The participant sign-in screen. This route is public in proxy.ts — it has to
 * be, or there is no way into the portal.
 */
export default async function ParticipantLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url } = await searchParams;

  // Only accept an internal path, so the sign-in screen can never be used to
  // bounce someone to another site.
  const safeRedirect =
    redirect_url && redirect_url.startsWith("/participant-portal")
      ? redirect_url
      : "/participant-portal";

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
            Sign in with the email address on your participation agreement.
          </p>
        </div>

        <SignIn
          routing="hash"
          fallbackRedirectUrl={safeRedirect}
          signUpUrl="/participant-portal/accept"
        />

        {/*
          The way in for someone who has never signed in. The welcome email
          tells participants to look for this exact wording, so if the label
          changes here it has to change there too.
        */}
        <a
          href="/participant-portal/accept"
          className="mt-6 flex items-center justify-center gap-1.5 rounded-md border border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-slate-300 transition-colors hover:border-gold-500/50 hover:bg-white/[0.06] hover:text-white"
        >
          First time here?{" "}
          <span className="font-semibold text-gold-500">Set your password</span>
        </a>

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
