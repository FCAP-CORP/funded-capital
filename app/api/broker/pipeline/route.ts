import { NextResponse } from "next/server";
import { resolveBrokerViewer } from "@/lib/broker/viewer";
import { getBrokerPipeline } from "@/lib/broker/queries";
import { brokerStage, isOpenForBroker, isFundedForBroker } from "@/lib/broker/stageView";
import { PRODUCT_LABEL, label } from "@/lib/crm/view";

/**
 * The broker's own pipeline, read from the CRM.
 *
 * Replaces the Google Sheet read behind /api/my-submissions. The Sheet could
 * only show what was written at submission time, so a broker saw "Submitted"
 * indefinitely while the deal moved through underwriting somewhere they could
 * not see. This returns the live stage.
 *
 * Scope comes from the session, never the request — see lib/broker/viewer.ts.
 *
 * DEGRADES TO EMPTY, NEVER TO AN ERROR. A broker's dashboard failing shut is
 * worse than one that is briefly bare: they cannot fix it, and a red screen on
 * a partner-facing portal is a support call.
 */
export async function GET() {
  const viewer = await resolveBrokerViewer();

  // No broker record yet means they have never submitted anything, so there is
  // genuinely nothing to show — not an error, and not a reason to invent a scope.
  if (!viewer) {
    return NextResponse.json({
      ok: true, deals: [], scope: "none",
      stats: { active: 0, waitingOnYou: 0, pipelineValue: 0, funded: 0 },
    });
  }

  const deals = await getBrokerPipeline(viewer);

  const view = deals.map((d) => {
    const s = brokerStage(d.stage);
    return {
      applicationId: d.applicationId,
      borrower: d.borrower,
      // The broker sees the product NAME, not the enum slug.
      product: label(PRODUCT_LABEL, d.product),
      property: d.property,
      isPortfolio: d.isPortfolio,
      propertyCount: d.propertyCount,
      loanAmount: d.loanAmount,
      status: s.label,
      tone: s.tone,
      waitingOnYou: s.waitingOnBroker,
      submittedAt: d.submittedAt,
      driveFolder: d.driveFolder,
      submittedByOther: d.submittedByOther,
    };
  });

  const open = deals.filter((d) => isOpenForBroker(d.stage));
  const stats = {
    active: open.length,
    // The number that makes this better than the Sheet: how many are stuck
    // waiting on THEM. A term sheet sitting unsigned is the most expensive
    // thing on a broker's screen and nothing used to say so.
    waitingOnYou: deals.filter((d) => brokerStage(d.stage).waitingOnBroker).length,
    pipelineValue: open
      .filter((d) => !isFundedForBroker(d.stage))
      .reduce((n, d) => n + (d.loanAmount ?? 0), 0),
    funded: deals.filter((d) => isFundedForBroker(d.stage)).length,
  };

  // Owners and leads see their whole firm; everyone else sees their own desk.
  const scope = viewer.firmId && (viewer.role === "owner" || viewer.role === "lead") ? "firm" : "own";

  return NextResponse.json({ ok: true, deals: view, stats, scope });
}
