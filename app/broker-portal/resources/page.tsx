import {
  BookOpen,
  FileSpreadsheet,
  PlayCircle,
  ScrollText,
  Download,
  ArrowUpRight,
} from "lucide-react";

export const metadata = {
  title: "Resource Library | Funded Capital Broker Portal",
};

type ResourceType = "guide" | "spreadsheet" | "tutorial" | "guideline";

interface Resource {
  title: string;
  desc: string;
  type: ResourceType;
  action: string; // "Download" | "Open" | "Watch"
}

const TYPE_META: Record<
  ResourceType,
  { label: string; icon: typeof BookOpen; badge: string }
> = {
  guide: { label: "Guide", icon: BookOpen, badge: "bg-blue-50 text-blue-700" },
  spreadsheet: { label: "Spreadsheet", icon: FileSpreadsheet, badge: "bg-emerald-50 text-emerald-700" },
  tutorial: { label: "Tutorial", icon: PlayCircle, badge: "bg-purple-50 text-purple-700" },
  guideline: { label: "Guideline", icon: ScrollText, badge: "bg-amber-50 text-amber-700" },
};

const RESOURCES: { section: string; items: Resource[] }[] = [
  {
    section: "Getting Started",
    items: [
      { title: "Broker Onboarding Guide", desc: "How to register, submit deals, and get paid — start to finish.", type: "guide", action: "Open" },
      { title: "Submitting Your First Deal", desc: "A 6-minute walkthrough of the application and document process.", type: "tutorial", action: "Watch" },
    ],
  },
  {
    section: "Deal Tools",
    items: [
      { title: "Fix & Flip Deal Analyzer", desc: "Model purchase, rehab, ARV, and profit before you submit.", type: "spreadsheet", action: "Download" },
      { title: "DSCR Cash-Flow Worksheet", desc: "Calculate DSCR from rent, taxes, insurance, and HOA.", type: "spreadsheet", action: "Download" },
      { title: "Term Sheet Explainer", desc: "What every line on a Funded Capital term sheet means.", type: "guide", action: "Open" },
    ],
  },
  {
    section: "Program Guidelines",
    items: [
      { title: "DSCR / Rental Guidelines", desc: "LTV caps, FICO tiers, reserves, and eligible property types.", type: "guideline", action: "Open" },
      { title: "Fix & Flip Guidelines", desc: "LTC/ARV limits, experience tiers, and draw schedule basics.", type: "guideline", action: "Open" },
      { title: "New Construction Guidelines", desc: "Ground-up requirements, budget review, and inspections.", type: "guideline", action: "Open" },
      { title: "Stabilized Bridge Guidelines", desc: "Eligibility, terms, and exit requirements.", type: "guideline", action: "Open" },
    ],
  },
  {
    section: "Document Checklists",
    items: [
      { title: "Required Documents by Program", desc: "Exactly what each loan type needs to reach approval fast.", type: "guide", action: "Open" },
      { title: "Entity & Vesting Requirements", desc: "LLC docs, operating agreements, and signing authority.", type: "guideline", action: "Open" },
    ],
  },
];

const actionIcon = (a: string) =>
  a === "Download" ? Download : a === "Watch" ? PlayCircle : ArrowUpRight;

export default function ResourcesPage() {
  return (
    <div className="p-5 sm:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BookOpen size={22} className="text-gold-600" /> Resource Library
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Guides, spreadsheets, tutorials, and program guidelines to help you close more deals.
        </p>
      </div>

      <div className="space-y-10">
        {RESOURCES.map(({ section, items }) => (
          <section key={section}>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 mb-3">
              {section}
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {items.map((r) => {
                const meta = TYPE_META[r.type];
                const Icon = meta.icon;
                const ActionIcon = actionIcon(r.action);
                return (
                  <a
                    key={r.title}
                    href="#"
                    className="group bg-white rounded-2xl border border-slate-200 shadow-card hover:shadow-card-hover transition p-5 flex gap-4"
                  >
                    <span className="h-11 w-11 shrink-0 grid place-items-center rounded-xl bg-navy-900/5 text-navy-800">
                      <Icon size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.badge}`}>
                          {meta.label}
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-900 leading-snug">{r.title}</h3>
                      <p className="text-sm text-slate-500 mt-1">{r.desc}</p>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gold-600 mt-3 group-hover:gap-1.5 transition-all">
                        {r.action} <ActionIcon size={13} />
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <p className="text-xs text-slate-400 mt-10 border-t border-slate-100 pt-4">
        Placeholder links. Point each card at your real files (Supabase Storage, Google Drive, or a CDN)
        once assets are ready.
      </p>
    </div>
  );
}
