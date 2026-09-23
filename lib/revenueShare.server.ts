import { cache } from "react";
import { currentUser } from "@clerk/nextjs/server";
import type {
  AdminState,
  BookSummary,
  LoggedPayment,
  Participation,
  ParticipantPacket,
  ParticipantRecord,
  ScheduledPayment,
} from "./revenueShare";
import {
  deriveAdminState,
  summarizeBook,
  summarizeHolder,
  toParticipationView,
} from "./revenueShare";

/**
 * Server-side access to the Revenue Share participant sheet.
 *
 * This module must never reach the browser: it holds the Apps Script secret
 * and the admin allowlist. That is enforced without an extra dependency —
 * it imports @clerk/nextjs/server, which reaches next/headers, and Next fails
 * the build if any of that is pulled into a client component.
 *
 * Mirrors the pattern already proven by /api/my-submissions: a Google Apps
 * Script web app fronts the sheet, this module is the only caller, and the
 * identity used to scope the query always comes from the Clerk session —
 * never from anything the browser sends.
 *
 * Environment:
 *   PARTICIPANT_WEBAPP_URL     deployed Apps Script /exec URL
 *   PARTICIPANT_WEBAPP_SECRET  shared secret, checked inside the script
 *   PARTICIPANT_ADMIN_EMAILS   comma-separated allowlist for the admin view
 */

/**
 * How long a sheet response may be reused.
 *
 * Apps Script answers in 2-7 seconds, so this window is what stands between a
 * participant and an instant page. Payments post once a month, so half an hour
 * of staleness costs nothing in accuracy — and Next serves the stale copy while
 * refreshing in the background, so in practice almost nobody waits on the sheet.
 */
const REVALIDATE_SECONDS = 1800;

interface RawPacket {
  /** Every row carrying this email — one per participation. */
  participants?: ParticipantRecord[];
  schedule?: ScheduledPayment[];
  payments?: LoggedPayment[];
}

interface RawBook {
  participants?: ParticipantRecord[];
  schedule?: ScheduledPayment[];
}

/** Not-configured and upstream-failure are different states and must stay so. */
export type FetchOutcome<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      reason: "unconfigured" | "unavailable" | "not_found";
      /**
       * What actually went wrong, for the admin view only. The old code threw
       * this away and the page printed a guess — "check the Apps Script
       * deployment" — which sent us chasing a perfectly healthy endpoint for
       * the better part of an afternoon. Never shown on a participant surface.
       */
      detail?: string;
    };

async function callScript<T>(
  params: Record<string, string>,
  opts: { cache?: boolean } = {}
): Promise<FetchOutcome<T>> {
  const url = process.env.PARTICIPANT_WEBAPP_URL;
  const secret = process.env.PARTICIPANT_WEBAPP_SECRET;
  if (!url || !secret) return { ok: false, reason: "unconfigured" };

  const qs = new URLSearchParams({ secret, ...params });
  const target = `${url}?${qs.toString()}`;

  /**
   * Apps Script fails transiently. It is a shared Google service with its own
   * cold starts and quotas, and when it stumbles it does not return an error
   * status — it returns an HTML page with HTTP 200. A single bad second used
   * to surface as a hard error on the page, and because the result feeds a
   * prerendered route, that error could then be served from cache long after
   * the endpoint recovered. One retry removes almost all of it.
   */
  let detail = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(target, {
        redirect: "follow",
        // The whole-book read backs a live admin screen, so it is never cached:
        // a cached failure is worse than a slow success. Per-holder packets keep
        // the shared window — the sheet changes a handful of times a month, and
        // the cache key includes the query string, so one holder's packet can
        // never be served to another.
        ...(opts.cache === false
          ? { cache: "no-store" as const }
          : { next: { revalidate: REVALIDATE_SECONDS } }),
      });

      if (!res.ok) {
        detail = `HTTP ${res.status} ${res.statusText}`.trim();
      } else {
        const text = await res.text();
        try {
          return { ok: true, data: JSON.parse(text) as T };
        } catch {
          // Almost always Google's own HTML error or sign-in page.
          const head = text.replace(/\s+/g, " ").slice(0, 160);
          detail = `HTTP 200 but not JSON — ${head || "(empty body)"}`;
        }
      }
    } catch (err) {
      detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }

    if (attempt === 1) await new Promise((r) => setTimeout(r, 700));
  }

  return { ok: false, reason: "unavailable", detail };
}

/**
 * Everything the signed-in holder owns, scoped by their session email.
 *
 * A holder normally has several participations. All of them come back, each
 * with its own schedule and payment history, plus a consolidated total. The
 * email is read from the Clerk session on the server and there is no code path
 * that accepts an email from the request, so one holder can never see another's.
 */
async function loadMyParticipation(): Promise<FetchOutcome<ParticipantPacket>> {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase();
  if (!email) return { ok: false, reason: "not_found" };

  const result = await callScript<RawPacket>({ action: "participant", email });
  if (!result.ok) return result;

  const records = (result.data.participants ?? []).filter((r) => r?.participantId);
  if (records.length === 0) return { ok: false, reason: "not_found" };

  const schedule = result.data.schedule ?? [];
  const payments = result.data.payments ?? [];

  const participations: Participation[] = records
    .map((record) => {
      const id = record.participantId;
      return {
        // The single chokepoint. Program version and tier stop here.
        view: toParticipationView(record),
        schedule: schedule
          .filter((r) => r.participantId === id)
          .sort((a, b) => (a.paymentNumber || 0) - (b.paymentNumber || 0)),
        payments: payments
          .filter((r) => r.participantId === id)
          .sort((a, b) => String(b.dateSent).localeCompare(String(a.dateSent))),
      };
    })
    // Active first, then by participation id, so the list is stable across loads.
    .sort((a, b) => {
      const aActive = (a.view.status || "").toLowerCase() === "active" ? 0 : 1;
      const bActive = (b.view.status || "").toLowerCase() === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.view.participationId.localeCompare(b.view.participationId);
    });

  // The holder's name comes from the first record; entity name wins when set.
  const first = participations[0].view;

  return {
    ok: true,
    data: {
      holder: {
        displayName: first.displayName,
        participationCount: participations.length,
      },
      participations,
      totals: summarizeHolder(participations),
    },
  };
}

/**
 * Deduped per request: a page and its layout can both ask for the packet and
 * the sheet is still only consulted once.
 */
export const getMyParticipation = cache(loadMyParticipation);

/** One participation by id, scoped to the signed-in holder. */
export async function getMyParticipationById(
  participationId: string
): Promise<FetchOutcome<{ packet: ParticipantPacket; participation: Participation }>> {
  const result = await getMyParticipation();
  if (!result.ok) return result;

  const match = result.data.participations.find(
    (p) => p.view.participationId === participationId
  );
  // Not-found rather than forbidden: a holder should not be able to probe for
  // which participation ids exist by watching the error change.
  if (!match) return { ok: false, reason: "not_found" };

  return { ok: true, data: { packet: result.data, participation: match } };
}

/** True when the signed-in user is on the admin allowlist. */
async function loadIsPortalAdmin(): Promise<boolean> {
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase();
  if (!email) return false;

  const allowlist = (process.env.PARTICIPANT_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return allowlist.includes(email);
}

export const isPortalAdmin = cache(loadIsPortalAdmin);

export interface BookPacket {
  participants: ParticipantRecord[];
  schedule: ScheduledPayment[];
  summary: BookSummary;
}

/**
 * The whole book. Callers MUST gate on isPortalAdmin() first — this function
 * does not check, so that the page can render a proper 404 instead of leaking
 * the existence of an admin route to a participant who guesses the URL.
 */
async function loadBook(): Promise<FetchOutcome<BookPacket>> {
  const result = await callScript<RawBook>({ action: "book" }, { cache: false });
  if (!result.ok) return result;

  const participants = (result.data.participants ?? []).filter((r) => r.participantId);
  const schedule = result.data.schedule ?? [];

  return {
    ok: true,
    data: { participants, schedule, summary: summarizeBook(participants, schedule) },
  };
}

export const getBook = cache(loadBook);

/* ------------------------------------------------------------------ */
/* Writes — the admin action path                                      */
/* ------------------------------------------------------------------ */

/**
 * Sends an action to the Apps Script write endpoint.
 *
 * Deliberately separate from callScript(): different secret, different HTTP
 * method, never cached, and no retry. A read that fails twice costs nothing;
 * a write that fails halfway and is retried could log a payment run twice.
 * The Apps Script side takes a lock and refuses duplicates, but the honest
 * answer to an uncertain write is to say so rather than to try again.
 *
 * The secret travels in the body rather than the query string so it cannot
 * land in an access log. Nothing here is callable from the browser: the module
 * imports @clerk/nextjs/server, which Next refuses to bundle into a client
 * component, and every caller gates on isPortalAdmin() first.
 */
async function callWrite(
  payload: Record<string, unknown>
): Promise<FetchOutcome<{ message: string; [key: string]: unknown }>> {
  const url = process.env.PARTICIPANT_WEBAPP_URL;
  const secret = process.env.PARTICIPANT_WEBAPP_WRITE_SECRET;
  if (!url || !secret) return { ok: false, reason: "unconfigured" };

  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
      cache: "no-store",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, secret }),
      // Apps Script is a shared Google service and its response time is not
      // ours to control — measured between 0.9s and 34s for the same call. A
      // button that hangs indefinitely is worse than one that says it timed
      // out, because the second at least tells you to go and check the sheet.
      signal: AbortSignal.timeout(20000),
    });

    const text = await res.text();
    if (!res.ok) {
      return { ok: false, reason: "unavailable", detail: `HTTP ${res.status} ${res.statusText}` };
    }

    let data: { ok?: boolean; error?: string; detail?: string; message?: string };
    try {
      data = JSON.parse(text);
    } catch {
      // Apps Script answers with an HTML page when the deployment is stale.
      const head = text.replace(/\s+/g, " ").slice(0, 160);
      return {
        ok: false,
        reason: "unavailable",
        detail:
          "The endpoint answered with a web page instead of data — the deployment " +
          `is probably not serving doPost yet. Redeploy with a NEW VERSION. (${head})`,
      };
    }

    if (!data.ok) {
      // "unauthorized" has exactly one cause worth naming, and the generic word
      // sent us looking in the wrong place once already.
      if (data.error === "unauthorized") {
        return {
          ok: false,
          reason: "unconfigured",
          detail:
            "The tracker rejected the write secret. PARTICIPANT_WEBAPP_WRITE_SECRET " +
            "in Vercel does not match WRITE_SECRET in the Apps Script — check for " +
            "quotes or a trailing space, and remember a changed variable only takes " +
            "effect on the next deploy.",
        };
      }
      return {
        ok: false,
        reason: "unavailable",
        detail: data.detail || data.error || "The write was refused.",
      };
    }

    return { ok: true, data: { ...data, message: data.message ?? "Done." } };
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return {
        ok: false,
        reason: "unavailable",
        detail:
          "The tracker did not answer within 20 seconds. The change may or may not " +
          "have been made — open the spreadsheet and check before trying again.",
      };
    }
    return {
      ok: false,
      reason: "unavailable",
      detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}

/** True when the write path is configured. Drives whether the panel renders. */
export function isWriteConfigured(): boolean {
  return Boolean(process.env.PARTICIPANT_WEBAPP_URL && process.env.PARTICIPANT_WEBAPP_WRITE_SECRET);
}

export type { AdminState, AwaitingCapital, OutstandingRun } from "./revenueShare";

/**
 * What the admin panel needs.
 *
 * Reads the book — which the Program Book is loading anyway and which React
 * cache() dedupes to a single sheet call — and derives the rest locally. No
 * second round trip, so the panel costs the page nothing.
 */
export async function getAdminState(): Promise<FetchOutcome<AdminState>> {
  if (!(await isPortalAdmin())) return { ok: false, reason: "not_found" };
  const book = await getBook();
  if (!book.ok) return book;
  return { ok: true, data: deriveAdminState(book.data.participants, book.data.schedule) };
}

/**
 * Every admin write goes through here, so the permission check cannot be
 * forgotten at a call site. Returns not_found rather than forbidden for the
 * same reason the admin page 404s: never confirm the route exists.
 */
async function adminWrite(
  payload: Record<string, unknown>
): Promise<FetchOutcome<{ message: string }>> {
  if (!(await isPortalAdmin())) return { ok: false, reason: "not_found" };
  const result = await callWrite(payload);
  if (!result.ok) return result;
  return { ok: true, data: { message: String(result.data.message) } };
}

export function logPaymentRun(period: string, sent: string) {
  return adminWrite({ action: "log_run", period, sent });
}
export function markRunInitiated(date: string) {
  return adminWrite({ action: "mark_initiated", date });
}
export function clearRunInitiated() {
  return adminWrite({ action: "clear_initiated" });
}
export function markLoanPaidOff(key: string, date: string) {
  return adminWrite({ action: "mark_paid_off", key, date });
}
export function recordCapitalReturned(id: string, date: string) {
  return adminWrite({ action: "capital_returned", id, date });
}
