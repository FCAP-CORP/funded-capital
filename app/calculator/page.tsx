import type { Metadata } from "next";
import CalculatorClient from "./CalculatorClient";

export const metadata: Metadata = {
  alternates: { canonical: "/calculator" },
  title: "Loan Calculator",
  description:
    "Free real estate loan calculator — estimate Fix & Flip ROI, DSCR ratios, and monthly payments instantly.",
};

export default function CalculatorPage() {
  return <CalculatorClient />;
}
