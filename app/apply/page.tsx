import type { Metadata } from "next";
import { CheckCircle2, Clock, Shield } from "lucide-react";
import ApplyForm from "@/components/ApplyForm";

export const metadata: Metadata = {
  title: "Apply Now",
  description:
    "Apply for a private real estate loan with Funded Capital. Complete our 5-minute application and receive a term sheet within 24–48 hours.",
};

const trustPoints = [
  { icon: Clock, text: "Term sheet in 2 hours" },
  { icon: Shield, text: "No commitment to proceed" },
  { icon: CheckCircle2, text: "No upfront fees" },
];

export default function ApplyPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-navy-900 py-12">
        <div className="section-container">
          <div className="max-w-2xl mx-auto text-center">
            <p className="section-label">Apply Now</p>
            <h1 className="text-3xl lg:text-4xl font-bold text-white mt-2">
              Get Your Term Sheet in 2 Hours
            </h1>
            <p className="text-slate-300 mt-3 leading-relaxed">
              Complete the form below. A loan officer will review your request
              and reach out with a preliminary term sheet — no obligation required.
            </p>

            {/* Trust badges */}
            <div className="flex flex-wrap justify-center gap-4 mt-5">
              {trustPoints.map((tp) => {
                const Icon = tp.icon;
                return (
                  <span
                    key={tp.text}
                    className="flex items-center gap-1.5 text-slate-400 text-sm"
                  >
                    <Icon size={14} className="text-gold-500" />
                    {tp.text}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section className="section-padding bg-slate-50">
        <div className="section-container">
          <div className="max-w-3xl mx-auto">
            <ApplyForm />
          </div>
        </div>
      </section>
    </>
  );
}
