/**
 * The Funded Capital mark, drawn inline: the ascending steps from the brand
 * SVG plus the wordmark in live text. Inline because it is 300 bytes, needs no
 * request, stays sharp at every size and takes its colour from the page, which
 * the old 30 KB LogoWhite.png could not.
 */
export function StepsMark({ className = "", tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const block = tone === "light" ? "#F3EEE4" : "#0A1628";
  return (
    <svg viewBox="0 0 160 110" className={className} aria-hidden="true" focusable="false">
      <rect x="0" y="68" width="95" height="26" rx="2" fill={block} />
      <rect x="32" y="34" width="95" height="26" rx="2" fill={block} />
      <rect x="64" y="0" width="95" height="26" rx="2" fill="#B88E3E" />
      <rect x="0" y="100" width="159" height="6" rx="2" fill="#B88E3E" />
    </svg>
  );
}

export default function Logo({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <span className={`inline-flex items-center gap-3 ${tone === "light" ? "text-bone" : "text-deep"}`}>
      <StepsMark className="h-7 w-10 shrink-0" tone={tone} />
      <span className="font-plex text-[13px] sm:text-[15px] font-semibold tracking-[0.22em] whitespace-nowrap">
        FUNDED CAPITAL
      </span>
    </span>
  );
}
