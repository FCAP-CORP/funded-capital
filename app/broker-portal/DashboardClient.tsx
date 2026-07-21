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
} from "lucide-react";
import { fmtUsd } from "@/lib/pricing";

interface Submission {
  date: string;
  broker: string;
  borrower: string;
  program: string;
  property: string;
  loanAmount: string;
  status: string;
  folder: string;
}

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-blue-50 text-blue-700",
  "in review": "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  declined: "bg-red-50 text-red-700",
  funded: "bg-gold-500/15 text-gold-700",
};

function statusClass(s: string) {
  return STATUS_STYLES[s.trim().toLowerCase()] ?? "bg-slate-100 text-slate-600";
}

function money(v: string) {
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return n > 0 ? fmtUsd(n) : v || "—";
}

const quickActions = [
  { label: "Price a Deal", href: "/broker-portal/price", icon: Calculator },
  { label: "Portfolio Pricing", href: "/broker-portal/price/portfolio", icon: Layers },
  { label: "New Application", href: "/broker-portal/apply", icon: FilePlus2 },
  { label: "Resource Library", href: "/broker-portal/resources", icon: BookOpen },
];

export default function DashboardClient() {
  const { user } = useUser();
  const firstName = user?.firstName || user?.fullName?.split(" ")[0] || "there";
  const [subs, setSubs] = useState<Submission[] | null>(null);

  useEffect(() => {
    fetch("/api/my-submissions")
      .then((r) => r.json())
      .then((d) => setSubs(d.submissions ?? []))
      .catch(() => setSubs([]));
  }, []);

  const active = (subs ?? []).filter((s) => ["submitted", "in review", "approved"].includes(s.status.trim().toLowerCase()));
  const funded = (subs ?? []).filter((s) => s.status.trim().toLowerCase() === "funded");
  const inPipeline = active.reduce((n, s) => n + (Number(String(s.loanAmount).replace(/[^0-9.]/g, "")) || 0), 0);

  const stats = [
    { label: "Active Deals", value: subs ? String(active.length) : "—", icon: TrendingUp },
    { label: "In Pipeline", value: subs ? fmtUsd(inPipeline) : "—", icon: Clock },
    { label: "Funded", value: subs ? String(funded.length) : "—", icon: CheckCircle2 },
  ];

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back, {firstName}</h1>
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 shadow-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{label}</p>
              <span className="h-8 w-8 grid place-items-center rounded-lg bg-navy-900/5 text-navy-800">
                <Icon size={16} />
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
          </div>
        ))}
      </div>

      {/* Pipeline */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden mb-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Your Submissions</h2>
          {subs && <span className="text-xs text-slate-400">{subs.length} total</span>}
        </div>

        {subs === null ? (
          <div className="p-10 text-center text-slate-400">
            <Loader2 size={22} className="animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading your pipeline…</p>
          </div>
        ) : subs.length === 0 ? (
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
                  {subs.map((s, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">{s.borrower || "—"}</p>
                        <p className="text-xs text-slate-400">{s.date ? new Date(s.date).toLocaleDateString() : ""}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{s.program || "—"}</td>
                      <td className="px-5 py-4 text-slate-600">{s.property || "—"}</td>
                      <td className="px-5 py-4 font-medium text-slate-900">{money(s.loanAmount)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass(s.status)}`}>
                          {s.status || "Submitted"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {s.folder && (
                          <a href={s.folder} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gold-600 font-semibold text-xs hover:underline">
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
              {subs.map((s, i) => (
                <div key={i} className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900">{s.borrower || "—"}</p>
                    <span className={`shrink-0 ml-3 px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass(s.status)}`}>
                      {s.status || "Submitted"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {s.program} · {money(s.loanAmount)}
                  </p>
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
