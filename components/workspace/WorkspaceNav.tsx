"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Building2,
  Calculator,
  FilePlus2,
  GaugeCircle,
  GitBranch,
  Layers,
  Megaphone,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Users,
  X,
} from "lucide-react";
import { useUser, SignOutButton } from "@clerk/nextjs";
import { activeHref, activeSection, homeHref, type NavIcon, type NavSection } from "@/lib/workspace/nav";
import { paletteLinks, shortcutLabel } from "@/lib/workspace/palette";
import { FOCUS_RING_DARK } from "@/components/ui/focus";
// clsx, not cn(): this file is in every signed-in page's first load, and cn()
// brings tailwind-merge (~7 KB gzipped) with it. Nothing here needs merging —
// no caller passes classes in to override ours.
import { clsx as cn } from "clsx";

/**
 * The ⌘K palette, loaded on first use. `cmdk` and the palette's own code are a
 * separate chunk that no page pays for until someone presses ⌘K / Ctrl K or
 * clicks Search — hovering the Search button starts the download early.
 */
const loadPalette = () => import("./CommandPalette");
const CommandPalette = dynamic(loadPalette, { ssr: false });

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

const ICONS: Record<NavIcon, React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  overview: GaugeCircle,
  pipeline: GitBranch,
  contacts: Users,
  firms: Building2,
  marketing: Megaphone,
  dashboard: LayoutDashboard,
  pricing: Calculator,
  portfolio: Layers,
  apply: FilePlus2,
  resources: BookOpen,
};

export default function WorkspaceNav({ sections, canSearch = false }: { sections: NavSection[]; canSearch?: boolean }) {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const { user } = useUser();

  /* ---- ⌘K: the command bar. `paletteMounted` stays true once opened, so the
     lazily-loaded chunk is fetched once and reopening is instant. */
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMounted, setPaletteMounted] = useState(false);
  const [shortcut, setShortcut] = useState<string | null>(null);
  const links = useMemo(() => paletteLinks(sections), [sections]);

  // Keys typed between opening the palette and its input taking focus.
  const early = useRef("");
  const waiting = useRef(false);
  const takeEarlyKeys = useCallback(() => {
    waiting.current = false;
    const keys = early.current;
    early.current = "";
    return keys;
  }, []);


  useEffect(() => {
    // Read after mount: the server cannot know the visitor's platform, and
    // guessing would make the first paint disagree with the second.
    setShortcut(shortcutLabel(navigator.platform || navigator.userAgent));
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteMounted(true);
        setPaletteOpen((o) => {
          waiting.current = !o;
          if (!o) early.current = "";
          return !o;
        });
        return;
      }
      // Typing straight after ⌘K, before the palette's code has arrived: keep
      // the keys instead of dropping them on the page. Found live on 24 Sep —
      // "trevar" typed a second after Ctrl K vanished on the first open.
      if (waiting.current && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key.length === 1) { early.current += e.key; e.preventDefault(); }
        else if (e.key === "Backspace") { early.current = early.current.slice(0, -1); e.preventDefault(); }
      }
    }
    window.addEventListener("keydown", onKey);
    // Fetch the palette's code once the page is idle, so the first ⌘K is
    // instant. It is off the critical path: nothing on the page waits for it.
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const prefetch = () => { void loadPalette(); };
    const idle = w.requestIdleCallback ? w.requestIdleCallback(prefetch) : window.setTimeout(prefetch, 2000);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (!w.requestIdleCallback) window.clearTimeout(idle);
    };
  }, []);

  function openPalette() {
    setOpen(false);
    setPaletteMounted(true);
    waiting.current = true;
    early.current = "";
    setPaletteOpen(true);
  }
  const searchLabel = canSearch ? "Search deals, people, pages" : "Go to a page";

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
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openPalette}
            onPointerEnter={() => { void loadPalette(); }}
            className={cn("grid h-10 w-10 place-items-center rounded-lg text-slate-300 hover:bg-navy-800 hover:text-white", FOCUS_RING_DARK)}
            aria-label={searchLabel}
            aria-haspopup="dialog"
          >
            <Search size={19} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={cn("grid h-10 w-10 place-items-center rounded-lg text-slate-300 hover:bg-navy-800 hover:text-white", FOCUS_RING_DARK)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
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

        <div className="hidden lg:block shrink-0 px-4 pt-4">
          <button
            type="button"
            onClick={openPalette}
            onPointerEnter={() => { void loadPalette(); }}
            onFocus={() => { void loadPalette(); }}
            aria-haspopup="dialog"
            aria-label={searchLabel}
            aria-keyshortcuts="Meta+K Control+K"
            className={cn(
              "flex h-10 w-full items-center gap-2.5 rounded-lg border border-navy-700 bg-navy-800/60 px-3 text-left text-sm text-slate-300",
              "transition-colors hover:border-slate-500 hover:text-white motion-reduce:transition-none",
              FOCUS_RING_DARK,
            )}
          >
            <Search size={16} aria-hidden="true" className="shrink-0" />
            <span className="flex-1 truncate">{canSearch ? "Search" : "Go to…"}</span>
            {shortcut && (
              <kbd className="rounded border border-navy-700 bg-navy-900 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-400">
                {shortcut}
              </kbd>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          {sections.map((section, i) => (
            <div key={section.id} className={i > 0 ? "mt-6 pt-6 border-t border-navy-800" : ""}>
              <p className="px-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                {section.label}
              </p>
              {section.note && (
                <p className="px-2 mt-1 mb-2 text-[11px] leading-snug text-slate-400">{section.note}</p>
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
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors motion-reduce:transition-none",
                        FOCUS_RING_DARK,
                        isActive ? "bg-gold-500 text-navy-900" : "text-slate-300 hover:text-white hover:bg-navy-800",
                      )}
                    >
                      <Icon size={18} aria-hidden />
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

      {paletteMounted && (
        <CommandPalette
          open={paletteOpen}
          onClose={() => { waiting.current = false; setPaletteOpen(false); }}
          takeEarlyKeys={takeEarlyKeys}
          links={links}
          canSearch={canSearch}
        />
      )}
    </>
  );
}
