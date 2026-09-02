"use client";

import { useEffect, useState } from "react";
import { Building2, ChevronDown, Check, ImageUp, Trash2 } from "lucide-react";

/**
 * White-label branding for broker term sheets.
 * A broker sets their company brand once; it's stored in the browser and reused
 * on every term sheet they generate. Modes: "whitelabel" (broker's own brand,
 * for sending to their borrower) or "funded" (Funded Capital letterhead).
 */
export interface BrokerBrand {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  nmls: string;
  logoDataUrl: string;
}

export const EMPTY_BRAND: BrokerBrand = {
  companyName: "",
  contactName: "",
  phone: "",
  email: "",
  nmls: "",
  logoDataUrl: "",
};

export type BrandMode = "whitelabel" | "funded";

const BRAND_KEY = "fc_broker_brand";
const MODE_KEY = "fc_term_sheet_brand_mode";

/** Persisted broker brand + branding mode, hydrated on the client only. */
export function useBrokerBrand(defaultMode: BrandMode) {
  const [brand, setBrandState] = useState<BrokerBrand>(EMPTY_BRAND);
  const [mode, setModeState] = useState<BrandMode>(defaultMode);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const b = localStorage.getItem(BRAND_KEY);
      if (b) setBrandState({ ...EMPTY_BRAND, ...JSON.parse(b) });
      const m = localStorage.getItem(MODE_KEY);
      if (m === "whitelabel" || m === "funded") setModeState(m);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  const setBrand = (b: BrokerBrand) => {
    setBrandState(b);
    try {
      localStorage.setItem(BRAND_KEY, JSON.stringify(b));
    } catch {
      /* ignore */
    }
  };
  const setMode = (m: BrandMode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  return { brand, setBrand, mode, setMode, loaded };
}

export const hasBrand = (b: BrokerBrand) => !!(b.companyName || b.logoDataUrl);

/* ---------- No-print control bar ---------- */

export function BrandBar({
  brand,
  setBrand,
  mode,
  setMode,
}: {
  brand: BrokerBrand;
  setBrand: (b: BrokerBrand) => void;
  mode: BrandMode;
  setMode: (m: BrandMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);
  // First-time brokers (no saved brand): auto-open the editor once, after async load.
  useEffect(() => {
    if (!autoOpened && mode === "whitelabel" && !hasBrand(brand)) {
      setOpen(true);
      setAutoOpened(true);
    }
  }, [mode, brand, autoOpened]);
  const set = (k: keyof BrokerBrand, v: string) => setBrand({ ...brand, [k]: v });

  const onLogo = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 600_000) {
      alert("Logo is too large — please use an image under ~500 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("logoDataUrl", String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="no-print bg-white/95 rounded-xl border border-slate-200 mb-3 text-slate-700">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
          <button
            onClick={() => setMode("whitelabel")}
            className={`px-3 py-1.5 rounded-md font-medium transition ${mode === "whitelabel" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
          >
            My brand
          </button>
          <button
            onClick={() => setMode("funded")}
            className={`px-3 py-1.5 rounded-md font-medium transition ${mode === "funded" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
          >
            Funded Capital
          </button>
        </div>
        {mode === "whitelabel" && (
          <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <Building2 size={15} />
            {hasBrand(brand) ? "Edit brand" : "Set up your brand"}
            <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {mode === "whitelabel" && open && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Company name" value={brand.companyName} onChange={(v) => set("companyName", v)} placeholder="Acme Capital Partners" />
            <Field label="Contact name" value={brand.contactName} onChange={(v) => set("contactName", v)} placeholder="Jane Broker" />
            <Field label="Phone" value={brand.phone} onChange={(v) => set("phone", v)} placeholder="(555) 123-4567" />
            <Field label="Email" value={brand.email} onChange={(v) => set("email", v)} placeholder="jane@acmecapital.com" />
            <Field label="NMLS # (optional)" value={brand.nmls} onChange={(v) => set("nmls", v)} placeholder="1234567" />
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Logo (optional, PNG/JPG)</label>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-slate-300 cursor-pointer hover:bg-slate-50">
                  <ImageUp size={15} /> Upload
                  <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
                </label>
                {brand.logoDataUrl && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={brand.logoDataUrl} alt="Logo preview" style={{ height: "28px", width: "auto" }} className="rounded" />
                    <button onClick={() => set("logoDataUrl", "")} className="text-slate-400 hover:text-red-500" title="Remove logo">
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Check size={12} className="text-emerald-500" /> Saved on this device — reused on every term sheet you generate.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 py-2 px-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
      />
    </div>
  );
}

/* ---------- Print header mark (logo or company name) ---------- */

export function BrandHeaderMark({ mode, brand }: { mode: BrandMode; brand: BrokerBrand }) {
  // If the mark ever fails to load, render a text wordmark instead — a term
  // sheet must never print with a broken-image icon in the letterhead.
  const [logoFailed, setLogoFailed] = useState(false);

  if (mode === "funded") {
    if (logoFailed) {
      return <div className="text-lg font-bold text-navy-900">FUNDED CAPITAL</div>;
    }
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src="/Original.png"
        alt="Funded Capital"
        style={{ height: "40px", width: "auto" }}
        onError={() => setLogoFailed(true)}
      />
    );
  }
  if (brand.logoDataUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brand.logoDataUrl} alt={brand.companyName || "Company"} style={{ height: "40px", width: "auto" }} />;
  }
  return <div className="text-lg font-bold text-slate-900">{brand.companyName || "Preliminary Term Sheet"}</div>;
}

/** Header-right contact block (white-label only). */
export function BrandContact({ mode, brand }: { mode: BrandMode; brand: BrokerBrand }) {
  if (mode !== "whitelabel" || !hasBrand(brand)) return null;
  return (
    <div className="text-[11px] text-slate-500 leading-relaxed mt-1">
      {brand.contactName && <p className="text-slate-700 font-medium">{brand.contactName}</p>}
      {brand.phone && <p>{brand.phone}</p>}
      {brand.email && <p>{brand.email}</p>}
      {brand.nmls && <p>NMLS #{brand.nmls}</p>}
    </div>
  );
}

/** Footer "prepared by" line (white-label only). */
export function brandPreparedBy(mode: BrandMode, brand: BrokerBrand): string {
  if (mode === "whitelabel" && brand.companyName) {
    return ` Prepared by ${brand.companyName}${brand.nmls ? ` (NMLS #${brand.nmls})` : ""}. Financing provided by a third-party lender; terms subject to lender approval.`;
  }
  return " Funded Capital.";
}
