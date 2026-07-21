import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export const metadata = {
  title: "Broker Sign In | Funded Capital",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-navy-900 p-12 text-white">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LogoWhite.png" alt="Funded Capital" style={{ height: "56px", width: "auto" }} />
        </Link>
        <div>
          <h1 className="text-3xl font-bold leading-tight mb-4">
            The Funded Capital<br />Broker Portal
          </h1>
          <p className="text-slate-300 max-w-sm">
            Price deals in seconds, submit applications, and upload documents securely — all in one place.
          </p>
          <div className="flex items-center gap-2 mt-8 text-sm text-slate-400">
            <ShieldCheck size={18} className="text-gold-400" />
            Partner access only. Bank-grade authentication.
          </div>
        </div>
        <p className="text-xs text-slate-500">© 2026 Funded Capital. Partner access only.</p>
      </div>

      {/* Clerk sign-in */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-slate-50">
        <SignIn fallbackRedirectUrl="/broker-portal" signUpUrl="/sign-up" />
      </div>
    </div>
  );
}
