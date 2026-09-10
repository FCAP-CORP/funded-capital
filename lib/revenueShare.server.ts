import { cache } from "react";
import { currentUser } from "@clerk/nextjs/server";
import type {
  BookSummary,
  LoggedPayment,
  Participation,
  ParticipantPacket,
  ParticipantRecord,
  ScheduledPayment,
} from "./revenueShare";
import { summarizeBook, summarizeHolder, toParticipationView } from "./revenueShare";

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
  | { ok: false; reason: "unconfigured" | "unavailable" | "not_found" };

async function callScript<T>(params: Record<string, string>): Promise<FetchOutcome<T>> {
  const url = process.env.PARTICIPANT_WEBAPP_URL;
  const secret = process.env.PARTICIPANT_WEBAPP_SECRET;
  if (!url || !secret) return { ok: false, reason: "unconfigured" };

  const qs = new URLSearchParams({ secret, ...params });

  try {
    const res = await fetch(`${url}?${qs.toString()}`, {
      redirect: "follow",
      // Apps Script answers in 2-7 seconds, which made every in-portal
      // navigation feel broken. The underlying sheet changes a handful of
      // times a month, so a short shared cache costs nothing in accuracy and
      // turns repeat page loads into instant ones. The cache key includes the
      // query string, so one holder's packet can never be served to another.
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return { ok: false, reason: "unavailable" };

    // Apps Script returns an HTML error page rather than a JSON error status
    // when the deployment is misconfigured, so parse defensively.
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, data: parsed as T };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
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
  const result = await callScript<RawBook>({ action: "book" });
  if (!result.ok) return result;

  const participants = (result.data.participants ?? []).filter((r) => r.participantId);
  const schedule = result.data.schedule ?? [];

  return {
    ok: true,
    data: { participants, schedule, summary: summarizeBook(participants, schedule) },
  };
}

export const getBook = cache(loadBook);
