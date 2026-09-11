import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export const metadata = {
  title: "Activate Your Access",
  robots: { index: false, follow: false },
};

/**
 * Shared activation screen.
 *
 * Clerk Dashboard invitations always land here, for brokers and revenue share
 * participants alike, so the wording stays audience-neutral. Where someone goes
 * afterwards is decided by /portal, not by this page.
 */
export default function SignUpPage() {
  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-navy-900 p-12 text-white">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LogoWhite.png" alt="Funded Capital" style={{ height: "56px", width: "auto" }} />
        </Link>
        <div>
          <h1 className="text-3xl font-bold leading-tight mb-4">
            Activate your<br />Funded Capital access
          </h1>
          <p className="text-slate-300 max-w-sm">
            Choose a password for the email address we invited. You will be taken
            to your portal as soon as you are done.
          </p>
          <div className="flex items-center gap-2 mt-8 text-sm text-slate-400">
            <ShieldCheck size={18} className="text-gold-400" />
            Invitation only. Bank-grade authentication.
          </div>
        </div>
        <p className="text-xs text-slate-500">© 2026 Funded Capital. Private access only.</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12 bg-slate-50">
        <SignUp fallbackRedirectUrl="/broker-portal" signInUrl="/sign-in" />
      </div>
    </div>
  );
}
