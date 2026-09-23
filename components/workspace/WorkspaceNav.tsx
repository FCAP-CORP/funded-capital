"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  Building2,
  Calculator,
  FilePlus2,
  GitBranch,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  X,
} from "lucide-react";
import { useUser, SignOutButton } from "@clerk/nextjs";
import { activeHref, activeSection, homeHref, type NavIcon, type NavSection } from "@/lib/workspace/nav";

/**
 * The one sidebar for the whole signed-in product.
 *
 * It replaces `app/crm/CrmNav.tsx` and `app/broker-portal/PortalNav.tsx`, which
 * were the same component twice with different arrays in them.
 *
 * IT RECEIVES ITS LINKS, IT DOES NOT DECIDE THEM. `sections` is computed on the
 * server by `lib/workspace/nav.server.ts` from what this person is entitled to
 * open. Nothing here reads a role, and nothing here should ever start to: a
 * client component's idea of who you are is a suggestion, since the props and
 * the bundle both arrive on a machine the visitor controls. The links a broker
 * is not entitled to are not hidden with a class — they are not in the payload.
 *
 * And a link is still only a link. See the header of `lib/workspace/nav.ts`:
 * the layouts, the pages, the server actions and `lib/broker/scope.ts` are what
 * actually stop anyone. This file is a menu.
 *
 * PERFORMANCE: one client component for the entire signed-in product instead of
 * two, and it is the only interactive thing in the shell. The state is a single
 * boolean for the mobile drawer; everything else is a plain `<Link>`, so
 * navigation is a server-rendered transition with no client router work beyond
 * what Next already does. The rail is `position: sticky` rather than re-mounted
 * per route, so moving from Contacts to the pricing tool repaints the content
 * column only.
 *
 * CONVERSION — the internal kind: every destination is one click from every
 * other. Before this, going from a contact record to the pricing tool meant
 * retyping the URL, and the cost of that was not the seconds, it was that
 * pricing a deal stopped happening while looking at the person who needed one.
 */

const ICONS: Record<NavIcon, React.ComponentType<{ size?: number }>> = {
  pipeline: GitBranch,
  contacts: Users,
  firms: Building2,
  dashboard: LayoutDashboard,
  pricing: Calculator,
  portfolio: Layers,
  apply: FilePlus2,
  resources: BookOpen,
};

export default function WorkspaceNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const { user } = useUser();

  const current = activeHref(pathname, sections);
  const here = activeSection(pathname, sections);
  const home = homeHref(pathname, sections);

  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Funded Capital";
  const email = user?.primaryEmailAddress?.emailAddress || "";
  const initials =
    user?.firstName || user?.lastName
      ? `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase()
      : (name[0] || "F").toUpperCase();

  return (
    <>
      {/* Mobile top bar. The label names the half of the product you are in. */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between bg-navy-900 px-4 h-14 border-b border-navy-800">
        <Link href={home} className="flex items-center gap-2" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LogoWhite.png" alt="Funded Capital" style={{ height: "34px", width: "auto" }} />
          <span className="text-slate-400 text-xs font-medium">{here?.label ?? "Funded Capital"}</span>
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

      {/*
        A FLEX COLUMN, not a footer pinned with `position: absolute`.
        Both old sidebars absolutely positioned the user block at the bottom,
        which was fine with three links and would have started overlapping the
        last link now that staff see eight. The nav strip scrolls; the logo and
        the user block stay put.
      */}
      <aside
        className={`${open ? "flex" : "hidden"} lg:flex flex-col fixed lg:sticky top-0 z-30 w-full lg:w-64 shrink-0 h-screen pt-14 lg:pt-0 bg-navy-900 border-r border-navy-800`}
      >
        <div className="hidden lg:flex items-center gap-2 px-6 h-20 shrink-0 border-b border-navy-800">
          <Link href={home}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/LogoWhite.png" alt="Funded Capital" style={{ height: "44px", width: "auto" }} />
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          {sections.map((section, i) => (
            <div key={section.id} className={i > 0 ? "mt-6 pt-6 border-t border-navy-800" : ""}>
              <p className="px-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                {section.label}
              </p>
              {section.note && (
                <p className="px-2 mt-1 mb-2 text-[11px] leading-snug text-slate-600">{section.note}</p>
              )}
              <nav className={`flex flex-col gap-1 ${section.note ? "" : "mt-2"}`}>
                {section.items.map(({ label, href, icon }) => {
                  const Icon = ICONS[icon];
                  const isActive = href === current;
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-gold-500 text-navy-900"
                          : "text-slate-300 hover:text-white hover:bg-navy-800"
                      }`}
                    >
                      <Icon size={18} />
                      {label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t border-navy-800 p-4">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="h-9 w-9 shrink-0 rounded-full bg-gold-500 text-navy-900 grid place-items-center text-sm font-bold">
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
