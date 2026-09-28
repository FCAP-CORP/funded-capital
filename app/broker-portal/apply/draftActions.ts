"use server";

import { discardMyDraft, listMyDrafts, loadMyDraft, saveMyDraft, type LoadedDraft, type MyDraft, type SaveResult } from "@/lib/broker/drafts.server";

/**
 * The four draft buttons behind the broker's application form and dashboard.
 *
 * Each is an addressable endpoint, so each goes straight to a function in
 * lib/broker/drafts.server.ts that checks, for itself, who is asking (the
 * session's own Clerk user — staff or an active broker) and touches only that
 * person's drafts. Nothing here takes a user or firm id from the browser.
 * guards.regress.ts §15 pins both halves.
 *
 * NEVER THROWS TO THE BROWSER: a failed save leaves the form exactly as it is
 * and says so; the broker loses nothing they typed.
 */

export async function saveDraftAction(id: string | null, data: unknown): Promise<SaveResult> {
  try {
    return await saveMyDraft(typeof id === "string" ? id : null, data);
  } catch {
    return { ok: false, error: "Couldn't save just now. Your answers are still here." };
  }
}

export async function loadDraftAction(id: string): Promise<LoadedDraft | null> {
  try {
    return await loadMyDraft(id);
  } catch {
    return null;
  }
}

export async function listDraftsAction(): Promise<MyDraft[]> {
  try {
    return await listMyDrafts();
  } catch {
    return [];
  }
}

export async function discardDraftAction(id: string): Promise<boolean> {
  try {
    return await discardMyDraft(id);
  } catch {
    return false;
  }
}
