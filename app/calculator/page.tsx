import type { Metadata } from "next";
import CalculatorClient from "./CalculatorClient";

export const metadata: Metadata = {
  title: "Loan Calculator | Funded Capital",
  description:
    "Free real estate loan calculator — estimate Fix & Flip ROI, DSCR ratios, and monthly payments instantly.",
};

export default function CalculatorPage() {
  return <CalculatorClient />;
}
