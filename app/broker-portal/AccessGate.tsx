import Link from "next/link";
import { ShieldCheck, Mail } from "lucide-react";

/**
 * What someone sees when they reach the broker portal without an invitation.
 *
 * TONE MATTERS HERE MORE THAN ANYWHERE ELSE IN THE PORTAL. Most people who land
 * on this screen are not attackers — they are a broker whose colleague forwarded
 * a link, or someone who signed up with a personal address when the invitation
 * went to their work one. A blunt "access denied" tells them nothing and costs a
 * relationship. This says what happened, what to do, and who to write to.
 *
 * It also deliberately reveals NOTHING about whether an invitation exists for
 * any address. The reason is always the same shape, so this page cannot be used
 * to find out who Funded Capital works with.
 *
 * PERFORMANCE: a server component with no client JavaScript at all.
 * CONVERSION: the one action is an email link with the address prefilled, so a
 * broker who should be here can resolve it in one click instead of giving up.
 */
export default function AccessGate({ email }: { email: string | null }) {
  const subject = encodeURIComponent("Broker portal access");
  const body = encodeURIComponent(
    `Hi,\n\nI tried to sign in to the broker portal${email ? ` with ${email}` : ""} and it says I need an invitation.\n\nCould you set that up?\n\nThanks,\n`,
  );

  return (
    <main className="min-h-screen bg-slate-50 grid place-items-center px-5 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 sm:p-10 text-center">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full bg-navy-900">
          <ShieldCheck size={22} className="text-gold-400" />
        </div>

        <h1 className="text-xl font-bold text-navy-900">The broker portal is invitation only</h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          We could not find an invitation for
          {email ? <span className="font-medium text-navy-900"> {email}</span> : " this account"}.
          If a colleague forwarded you a link, or your invitation went to a different address, that
          would explain it.
        </p>

        <a
          href={`mailto:info@fundedcapital.com?subject=${subject}&body=${body}`}
          className="mt-7 inline-flex items-center gap-2 rounded-lg bg-gold-500 px-5 py-3 text-sm font-semibold text-navy-900 hover:bg-gold-400"
        >
          <Mail size={16} />
          Ask for access
        </a>

        <p className="mt-6 text-xs text-slate-500">
          Already work with us? Reply to any email from your account manager and we will sort it out
          the same day.
        </p>

        <div className="mt-8 border-t border-slate-100 pt-6 text-xs text-slate-400">
          <Link href="/" className="hover:text-navy-900">
            Return to fundedcapital.com
          </Link>
        </div>
      </div>
    </main>
  );
}
