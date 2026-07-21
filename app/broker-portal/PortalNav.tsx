"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Calculator,
  Layers,
  FilePlus2,
  BookOpen,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useUser, SignOutButton } from "@clerk/nextjs";

const links = [
  { label: "Dashboard", href: "/broker-portal", icon: LayoutDashboard },
  { label: "Price a Deal", href: "/broker-portal/price", icon: Calculator },
  { label: "Portfolio Pricing", href: "/broker-portal/price/portfolio", icon: Layers },
  { label: "New Application", href: "/broker-portal/apply", icon: FilePlus2 },
  { label: "Resource Library", href: "/broker-portal/resources", icon: BookOpen },
];

export default function PortalNav() {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const { user } = useUser();
  const brokerName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Broker";
  const brokerEmail = user?.primaryEmailAddress?.emailAddress || "";
  const initials =
    user?.firstName || user?.lastName
      ? `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase()
      : (brokerName[0] || "B").toUpperCase();

  // The login screen is full-bleed and has no sidebar.
  if (pathname === "/broker-portal/login") return null;

  const isActive = (href: string) =>
    href === "/broker-portal" || href === "/broker-portal/price" ? pathname === href : pathname.startsWith(href);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between bg-navy-900 px-4 h-14 border-b border-navy-800">
        <Link href="/broker-portal" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LogoWhite.png" alt="Funded Capital" style={{ height: "34px", width: "auto" }} />
          <span className="text-slate-400 text-xs font-medium">Broker Portal</span>
        </Link>
        <button
          onClick={() => setOpen(!open)}
          className="p-2 text-slate-300"
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Sidebar */}
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
            Broker Workspace
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
              <p className="text-sm font-semibold text-white truncate">{brokerName}</p>
              <p className="text-xs text-slate-400 truncate">{brokerEmail}</p>
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
