import { NextResponse } from "next/server";
import { resolveBrokerViewer } from "@/lib/broker/viewer";
import { getBrokerPipeline } from "@/lib/broker/queries";
import { queryScope } from "@/lib/broker/scope";
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

  /**
   * No broker record means they are not admitted to the portal.
   *
   * Admission is decided in app/broker-portal/page.tsx, which holds the
   * invitation check and renders the gate screen. By the time a real broker's
   * dashboard calls this, their row exists — so reaching here with no viewer
   * means either a direct call to the endpoint or a race during sign-in.
   * Either way the honest answer is an empty pipeline, not an error.
   */
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

  /**
   * The scope LABEL comes from the same decision the QUERY used.
   *
   * This line used to re-derive it — `viewer.firmId && (role === "owner" ||
   * role === "lead")` — which is the rule from scope.ts written out a second
   * time, and the second copy was already wrong: it ignores `status`, so a
   * SUSPENDED broker got back `scope: "firm"` alongside an empty list. The data
   * was right (queryScope refuses them) but the label contradicted it, and a
   * dashboard reading the label would have said "showing your whole firm" over
   * nothing at all.
   *
   * Caught in a browser on 22 Sep 2026 by suspending a broker and watching the
   * response. CLAUDE.md already says no query may re-derive the scoping rule
   * inline; a label derived from it is the same rule and the same hazard.
   */
  const kind = queryScope(viewer).kind;
  const scope = kind === "firm-or-own" ? "firm" : kind === "own" ? "own" : "none";

  return NextResponse.json({ ok: true, deals: view, stats, scope });
}
