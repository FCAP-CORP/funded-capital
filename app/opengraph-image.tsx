import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Funded Capital — Fast Private Real Estate Loans";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0F172A",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px",
          position: "relative",
        }}
      >
        {/* Gold accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "6px",
            height: "100%",
            background: "#C9A84C",
          }}
        />

        {/* Label */}
        <div
          style={{
            color: "#C9A84C",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            marginBottom: 28,
          }}
        >
          Private Real Estate Lending — Nationwide
        </div>

        {/* Headline */}
        <div
          style={{
            color: "white",
            fontSize: 60,
            fontWeight: 800,
            lineHeight: 1.1,
            maxWidth: 820,
            marginBottom: 32,
          }}
        >
          Fast Capital for Real Estate Investors
        </div>

        {/* Sub */}
        <div
          style={{
            color: "#94A3B8",
            fontSize: 26,
            marginBottom: 52,
          }}
        >
          Fix &amp; Flip · DSCR · New Construction · Multifamily
        </div>

        {/* Trust pills */}
        <div style={{ display: "flex", gap: 32 }}>
          {["Term Sheet in 2 Hours", "Close in 5 Days", "44 States"].map(
            (item) => (
              <div
                key={item}
                style={{
                  background: "rgba(201,168,76,0.12)",
                  border: "1px solid rgba(201,168,76,0.3)",
                  borderRadius: 40,
                  padding: "10px 24px",
                  color: "#C9A84C",
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                {item}
              </div>
            )
          )}
        </div>

        {/* Domain */}
        <div
          style={{
            position: "absolute",
            bottom: 48,
            right: 80,
            color: "#334155",
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          fundedcapital.com
        </div>
      </div>
    ),
    { ...size }
  );
}
