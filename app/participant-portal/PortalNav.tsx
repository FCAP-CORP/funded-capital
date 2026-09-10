"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FileText, LayoutGrid, Receipt, ShieldCheck, LogOut, Menu, X } from "lucide-react";
import { useUser, SignOutButton } from "@clerk/nextjs";

const BASE_LINKS = [
  { label: "Overview", href: "/participant-portal", icon: LayoutGrid },
  { label: "Payments", href: "/participant-portal/payments", icon: Receipt },
  { label: "Documents", href: "/participant-portal/documents", icon: FileText },
];

const ADMIN_LINK = {
  label: "Program Book",
  href: "/participant-portal/admin",
  icon: ShieldCheck,
};

export default function PortalNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const { user } = useUser();

  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Participant";
  const email = user?.primaryEmailAddress?.emailAddress || "";
  const initials =
    user?.firstName || user?.lastName
      ? `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase()
      : (name[0] || "P").toUpperCase();

  // The sign-in and invitation screens are full-bleed.
  if (
    pathname === "/participant-portal/login" ||
    pathname.startsWith("/participant-portal/accept")
  ) {
    return null;
  }

  const links = isAdmin ? [...BASE_LINKS, ADMIN_LINK] : BASE_LINKS;

  // Overview is an exact match so it does not stay lit on every child route.
  const isActive = (href: string) =>
    href === "/participant-portal" ? pathname === href : pathname.startsWith(href);

  return (
    <>
      {/* Mobile bar */}
      <div className="pp-no-print lg:hidden sticky top-0 z-40 flex items-center justify-between bg-ink px-4 h-14 border-b border-white/10">
        <Link href="/participant-portal" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LogoWhite.png" alt="Funded Capital" style={{ height: "30px", width: "auto" }} />
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-gold-500/80">
            Participant
          </span>
        </Link>
        <button
          onClick={() => setOpen(!open)}
          className="p-2 text-slate-300"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <aside
        className={`pp-no-print ${open ? "block" : "hidden"} lg:block fixed lg:sticky top-0 z-30 w-full lg:w-64 shrink-0 lg:h-screen bg-ink border-r border-white/10`}
      >
        <div className="hidden lg:flex flex-col justify-center px-6 h-24 border-b border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LogoWhite.png" alt="Funded Capital" style={{ height: "40px", width: "auto" }} />
          <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-500">
            Participant Portal
          </span>
        </div>

        <nav className="px-3 py-5 flex flex-col gap-0.5">
          {links.map(({ label, href, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-white/[0.07] text-white font-semibold"
                    : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <span
                  aria-hidden
                  className={`-ml-3 h-5 w-[2px] rounded-full transition-colors ${
                    active ? "bg-gold-500" : "bg-transparent"
                  }`}
                />
                <Icon size={17} className={active ? "text-gold-500" : ""} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 p-4">
          <div className="flex items-center gap-3 px-1 mb-3">
            <div className="h-9 w-9 rounded-full bg-gold-500 text-ink grid place-items-center text-xs font-bold">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{name}</p>
              <p className="text-xs text-slate-500 truncate">{email}</p>
            </div>
          </div>
          <SignOutButton redirectUrl="/participant-portal/login">
            <button className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">
              <LogOut size={15} />
              Sign out
            </button>
          </SignOutButton>
        </div>
      </aside>
    </>
  );
}
