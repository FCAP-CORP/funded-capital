"use client";

import { useEffect, useState } from "react";

/**
 * Money + percent inputs for the pricing tools.
 *
 * Why these exist: a controlled <input type="number"> whose value is a number
 * coerces "" back to 0 on every keystroke, so a placeholder 0 is impossible to
 * delete without selecting it first. These keep their own text state, so the
 * field can be genuinely empty, and they format with commas as you type
 * (adding ".00" on blur).
 */

const labelCls = "block text-sm font-medium text-slate-700";
const inputBase =
  "w-full rounded-xl border border-slate-300 py-2.5 px-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition";

/** "40000" | "40000.5" → "40,000" | "40,000.5" */
function withCommas(raw: string): string {
  const [int, dec] = raw.split(".");
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec !== undefined ? `${intFmt}.${dec.slice(0, 2)}` : intFmt;
}

/** Keep digits and a single decimal point. */
function clean(raw: string): string {
  const stripped = raw.replace(/[^\d.]/g, "");
  const firstDot = stripped.indexOf(".");
  if (firstDot === -1) return stripped;
  return stripped.slice(0, firstDot + 1) + stripped.slice(firstDot + 1).replace(/\./g, "");
}

/** 40000 → "40,000.00" (blank for 0 so the placeholder shows) */
function displayValue(n: number): string {
  if (!n) return "";
  return withCommas(n.toFixed(2));
}

export function MoneyField({
  label,
  labelRight,
  value,
  onChange,
  highlight,
}: {
  label?: string;
  labelRight?: React.ReactNode;
  value: number;
  onChange: (n: number) => void;
  highlight?: boolean;
}) {
  const [text, setText] = useState(() => displayValue(value));
  const [focused, setFocused] = useState(false);

  // Re-sync when the value changes from outside (resets, derived amounts),
  // but never while the user is mid-edit.
  useEffect(() => {
    if (!focused) setText(displayValue(value));
  }, [value, focused]);

  const handleChange = (raw: string) => {
    const c = clean(raw);
    setText(withCommas(c));
    const n = c === "" || c === "." ? 0 : parseFloat(c);
    onChange(Number.isNaN(n) ? 0 : n);
  };

  return (
    <div>
      {(label || labelRight) && (
        <div className="flex items-center justify-between mb-1.5 min-h-[20px]">
          {label ? <label className={labelCls}>{label}</label> : <span />}
          {labelRight}
        </div>
      )}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={text}
          placeholder="0.00"
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(displayValue(value));
          }}
          onChange={(e) => handleChange(e.target.value)}
          className={`${inputBase} pl-7 ${highlight ? "border-gold-400 ring-1 ring-gold-200" : ""}`}
        />
      </div>
    </div>
  );
}

export function PercentField({
  label,
  value,
  onChange,
  step,
  suffix = "%",
}: {
  label?: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  suffix?: string;
}) {
  const [text, setText] = useState(() => (value ? String(value) : ""));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value ? String(value) : "");
  }, [value, focused]);

  const handleChange = (raw: string) => {
    const c = clean(raw);
    setText(c);
    const n = c === "" || c === "." ? 0 : parseFloat(c);
    onChange(Number.isNaN(n) ? 0 : n);
  };

  return (
    <div>
      {label && <label className={`${labelCls} mb-1.5`}>{label}</label>}
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          placeholder="0"
          step={step}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(value ? String(value) : "");
          }}
          onChange={(e) => handleChange(e.target.value)}
          className={`${inputBase} ${suffix ? "pr-8" : ""}`}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{suffix}</span>}
      </div>
    </div>
  );
}

/**
 * Small percent box that sits beside a slider.
 *
 * Clamping on every keystroke made this unusable: typing "75" clamped the "7"
 * up to the minimum before the "5" arrived, so the field fought the user.
 *
 * Rules:
 *  - Free text while focused; clamped on blur / Enter (Esc reverts).
 *  - Committed *live* when the typed value already sits inside [min,max], so the
 *    native up/down arrows still respond instantly.
 *  - Decimals accepted ("72.5") and rounded on commit — stays a whole percent.
 */
export function PctInput({
  value,
  min,
  max,
  onCommit,
  className = "",
  unit = "%",
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  className?: string;
  /** "" for unitless values like a credit score. */
  unit?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Follow external changes (slider drags, preset resets) unless mid-edit.
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const parse = (s: string): number | null => {
    if (s.trim() === "" || s === "." ) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const commit = () => {
    const n = parse(draft);
    if (n === null) {
      setDraft(String(value)); // junk/empty → revert
      return;
    }
    const clamped = Math.max(min, Math.min(max, Math.round(n)));
    setDraft(String(clamped));
    onCommit(clamped);
  };

  const handleChange = (raw: string) => {
    // digits + a single decimal point
    const cleaned = raw.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
    setDraft(cleaned);
    // Already a legal value? Commit live so the spinner arrows feel instant.
    const n = parse(cleaned);
    if (n !== null && n >= min && n <= max) onCommit(Math.round(n));
  };

  return (
    <div className="relative shrink-0">
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={1}
        value={draft}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
        className={className}
      />
      {unit && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{unit}</span>
      )}
    </div>
  );
}
