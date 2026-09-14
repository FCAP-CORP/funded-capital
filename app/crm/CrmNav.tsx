"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { GitBranch, Users, LogOut, Menu, X } from "lucide-react";
import { useUser, SignOutButton } from "@clerk/nextjs";

/**
 * Lending OS sidebar.
 *
 * Deliberately the same shape and tokens as the broker and participant portals:
 * navy rail, gold active state, user block pinned to the bottom. Three products
 * that look like three different companies is how a small team ends up training
 * people on each one separately.
 */

const links = [
  { label: "Pipeline", href: "/crm", icon: GitBranch },
  { label: "Contacts", href: "/crm/contacts", icon: Users },
];

export default function CrmNav() {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const { user } = useUser();

  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Funded Capital";
  const email = user?.primaryEmailAddress?.emailAddress || "";
  const initials =
    user?.firstName || user?.lastName
      ? `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase()
      : (name[0] || "F").toUpperCase();

  // /crm is the pipeline itself, so it must match exactly or it stays lit on
  // every child route.
  const isActive = (href: string) =>
    href === "/crm" ? pathname === "/crm" : pathname.startsWith(href);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between bg-navy-900 px-4 h-14 border-b border-navy-800">
        <Link href="/crm" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LogoWhite.png" alt="Funded Capital" style={{ height: "34px", width: "auto" }} />
          <span className="text-slate-400 text-xs font-medium">Lending OS</span>
        </Link>
        <button onClick={() => setOpen(!open)} className="p-2 text-slate-300" aria-label="Toggle menu">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <aside
        className={`${
          open ? "block" : "hidden"
        } lg:block fixed lg:sticky top-0 z-30 w-full lg:w-64 shrink-0 lg:h-screen bg-navy-900 border-r border-navy-800`}
      >
        <div className="hidden lg:flex items-center gap-2 px-6 h-20 border-b border-navy-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LogoWhite.png" alt="Funded Capital" style={{ height: "44px", width: "auto" }} />
        </div>

        <div className="px-4 py-5">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
            Lending OS
          </p>
          <nav className="flex flex-col gap-1">
            {links.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(href)
                    ? "bg-gold-500 text-navy-900"
                    : "text-slate-300 hover:text-white hover:bg-navy-800"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="absolute bottom-0 left-0 right-0 border-t border-navy-800 p-4">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="h-9 w-9 rounded-full bg-gold-500 text-navy-900 grid place-items-center text-sm font-bold">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{name}</p>
              <p className="text-xs text-slate-400 truncate">{email}</p>
            </div>
          </div>
          <SignOutButton redirectUrl="/sign-in">
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-navy-800 transition-colors">
              <LogOut size={16} />
              Sign out
            </button>
          </SignOutButton>
        </div>
      </aside>
    </>
  );
}
