"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";

interface Suggestion {
  id: string;
  label: string;
}

/**
 * Address field with type-ahead suggestions (debounced, keyboard-navigable).
 * Suggestions come from /api/address-suggest, which proxies Google Places when
 * a key is configured and falls back to a keyless provider otherwise.
 * Free typing always works — the lookup is an assist, never a gate.
 */
export default function AddressAutocomplete({
  label = "Property address",
  value,
  onChange,
  placeholder = "Start typing an address…",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  // Set when the user picks a suggestion, so we don't immediately re-query it.
  const justPicked = useRef(false);

  // Debounced lookup
  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/address-suggest?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { suggestions?: Suggestion[] };
        setSuggestions(data.suggestions ?? []);
        setOpen((data.suggestions ?? []).length > 0);
        setActive(-1);
      } catch {
        /* aborted or offline — typing still works */
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (s: Suggestion) => {
    justPicked.current = true;
    onChange(s.label);
    setOpen(false);
    setSuggestions([]);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      {label && <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>}
      <div className="relative">
        <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-9 text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition"
        />
        {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-card-hover overflow-hidden max-h-64 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(s)}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-start gap-2 transition-colors ${
                  i === active ? "bg-gold-500/10 text-navy-900" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <MapPin size={14} className="shrink-0 mt-0.5 text-slate-400" />
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
