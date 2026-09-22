"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  Calculator,
  Layers,
  FilePlus2,
  BookOpen,
  TrendingUp,
  Clock,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Inbox,
  AlertCircle,
} from "lucide-react";
import { fmtUsd } from "@/lib/pricing";

/**
 * One deal as /api/broker/pipeline returns it. Read from the CRM, so `status`
 * is the LIVE stage rather than whatever was written at submission time — the
 * whole point of replacing the Google Sheet behind this screen.
 */
interface Deal {
  applicationId: string;
  borrower: string | null;
  product: string;
  property: string | null;
  isPortfolio: boolean;
  propertyCount: number | null;
  loanAmount: number | null;
  status: string;
  tone: string;
  /** The next move is theirs. This is the most useful field on the screen. */
  waitingOnYou: boolean;
  submittedAt: string | null;
  driveFolder: string | null;
  submittedByOther: boolean;
}

interface Stats {
  active: number;
  waitingOnYou: number;
  pipelineValue: number;
  funded: number;
}

/** Tones come from lib/broker/stageView.ts so the meaning lives in one place. */
const TONE_STYLES: Record<string, string> = {
  received: "bg-slate-100 text-slate-600",
  progress: "bg-blue-50 text-blue-700",
  action: "bg-amber-50 text-amber-800",
  funded: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-500",
};

function toneClass(t: string) {
  return TONE_STYLES[t] ?? "bg-slate-100 text-slate-600";
}

function money(v: number | null) {
  return v && v > 0 ? fmtUsd(v) : "—";
}

const quickActions = [
  { label: "Price a Deal", href: "/broker-portal/price", icon: Calculator },
  { label: "Portfolio Pricing", href: "/broker-portal/price/portfolio", icon: Layers },
  { label: "New Application", href: "/broker-portal/apply", icon: FilePlus2 },
  { label: "Resource Library", href: "/broker-portal/resources", icon: BookOpen },
];

export default function DashboardClient() {
  const { user } = useUser();
  /**
   * Clerk has no first name for anyone who signed up with an email address
   * alone, which is most brokers. "Welcome back, there" was the result. When
   * there is no name to use, the greeting simply ends.
   */
  const firstName = user?.firstName || user?.fullName?.split(" ")[0] || null;
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  /** "firm" when this broker is an owner or lead and sees colleagues' deals. */
  const [scope, setScope] = useState<string>("own");

  useEffect(() => {
    fetch("/api/broker/pipeline")
      .then((r) => r.json())
      .then((d) => {
        setDeals(d.deals ?? []);
        setStats(d.stats ?? null);
        setScope(d.scope ?? "own");
      })
      .catch(() => setDeals([]));
  }, []);

  const tiles = [
    { label: "Active Deals", value: stats ? String(stats.active) : "—", icon: TrendingUp, alert: false },
    // The tile the Google Sheet could never show: how many are stuck on THEM.
    { label: "Waiting on you", value: stats ? String(stats.waitingOnYou) : "—", icon: AlertCircle, alert: Boolean(stats && stats.waitingOnYou > 0) },
    { label: "In Pipeline", value: stats ? fmtUsd(stats.pipelineValue) : "—", icon: Clock, alert: false },
    { label: "Funded", value: stats ? String(stats.funded) : "—", icon: CheckCircle2, alert: false },
  ];

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{firstName ? `Welcome back, ${firstName}` : "Welcome back"}</h1>
          <p className="text-slate-500 text-sm mt-1">{user?.primaryEmailAddress?.emailAddress || "Broker Portal"}</p>
        </div>
        <div className="flex gap-3">
          <Link href="/broker-portal/price" className="btn-secondary text-sm px-4 py-2.5">
            <Calculator size={16} /> Price a Deal
          </Link>
          <Link href="/broker-portal/apply" className="btn-primary text-sm px-4 py-2.5">
            <FilePlus2 size={16} /> New Application
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {tiles.map(({ label, value, icon: Icon, alert }) => (
          <div
            key={label}
            className={`bg-white rounded-2xl border shadow-card p-5 ${alert ? "border-amber-300" : "border-slate-200"}`}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{label}</p>
              <span className={`h-8 w-8 grid place-items-center rounded-lg ${alert ? "bg-amber-50 text-amber-700" : "bg-navy-900/5 text-navy-800"}`}>
                <Icon size={16} />
              </span>
            </div>
            <p className={`text-2xl font-bold mt-2 ${alert ? "text-amber-700" : "text-slate-900"}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Pipeline */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden mb-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">
            {scope === "firm" ? "Your firm's deals" : "Your deals"}
          </h2>
          {deals && <span className="text-xs text-slate-400">{deals.length} total</span>}
        </div>

        {deals === null ? (
          <div className="p-10 text-center text-slate-400">
            <Loader2 size={22} className="animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading your pipeline…</p>
          </div>
        ) : deals.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto h-12 w-12 grid place-items-center rounded-full bg-slate-100 text-slate-400 mb-3">
              <Inbox size={22} />
            </div>
            <p className="font-medium text-slate-700">No submissions yet</p>
            <p className="text-sm text-slate-400 mt-1 mb-4">Price a deal and submit an application — it&apos;ll show up here with live status.</p>
            <Link href="/broker-portal/apply" className="btn-primary text-sm px-4 py-2.5">
              <FilePlus2 size={16} /> Start an Application
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="px-5 py-3 font-medium">Borrower</th>
                    <th className="px-5 py-3 font-medium">Program</th>
                    <th className="px-5 py-3 font-medium">Property</th>
                    <th className="px-5 py-3 font-medium">Loan</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((d) => (
                    <tr key={d.applicationId} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{d.borrower || "—"}</p>
                        <p className="text-xs text-slate-400">
                          {d.submittedAt ? new Date(d.submittedAt).toLocaleDateString() : ""}
                          {/* Only an owner or lead ever sees a colleague's deal. */}
                          {d.submittedByOther && " · filed by a colleague"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{d.product}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {d.property || "—"}
                        {d.isPortfolio && (
                          <span className="block text-xs text-slate-400">
                            Portfolio · {d.propertyCount ?? 0} properties
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-900">{money(d.loanAmount)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${toneClass(d.tone)}`}>
                          {d.status}
                        </span>
                        {/* The ball is in their court — say so where they will see it. */}
                        {d.waitingOnYou && (
                          <span className="block text-xs font-semibold text-amber-700 mt-1">Waiting on you</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {d.driveFolder && (
                          <a href={d.driveFolder} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gold-600 font-semibold text-xs hover:underline">
                            Documents <ExternalLink size={12} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {deals.map((d) => (
                <div key={d.applicationId} className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900">{d.borrower || "—"}</p>
                    <span className={`shrink-0 ml-3 px-2.5 py-1 rounded-full text-xs font-semibold ${toneClass(d.tone)}`}>
                      {d.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {d.product} · {money(d.loanAmount)}
                    {d.isPortfolio && ` · ${d.propertyCount ?? 0} properties`}
                  </p>
                  {d.waitingOnYou && (
                    <p className="text-xs font-semibold text-amber-700 mt-1">Waiting on you</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickActions.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="bg-white rounded-2xl border border-slate-200 shadow-card hover:shadow-card-hover hover:border-gold-300 transition p-4 flex flex-col gap-2"
          >
            <span className="h-9 w-9 grid place-items-center rounded-xl bg-navy-900/5 text-navy-800">
              <Icon size={18} />
            </span>
            <span className="text-sm font-semibold text-slate-800">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
