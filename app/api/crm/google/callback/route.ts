import { NextResponse, type NextRequest } from "next/server";
import { isCrmStaff, signedInUser } from "@/lib/crm/access";
import { hasAllScopes, withGmailStatus } from "@/lib/comms/email";
import { OAUTH_COOKIE, readOAuthFlow, sameState } from "@/lib/comms/gmailOAuthCookie";
import { exchangeCode, getSendAs, googleConfig } from "@/lib/comms/gmail.server";
import { saveMailConnection } from "@/lib/comms/mailbox.server";

/**
 * GET /api/crm/google/callback — step 2 of Connect Gmail. Google sends the
 * person back here with a one-time code.
 *
 * IN ORDER, AND EVERY STEP FAILS CLOSED:
 *   1. staff, or a bare 404;
 *   2. the `state` must match the cookie set by /connect (no cookie, expired,
 *      or different → "expired"); the cookie is cleared either way;
 *   3. trade the code for tokens (with the PKCE verifier);
 *   4. both permissions granted, and a refresh token returned;
 *   5. the Google mailbox must be THE SAME ADDRESS the person is signed in to
 *      Lending OS with — nobody connects someone else's mailbox;
 *   6. store the refresh token encrypted (lib/comms/mailbox.server.ts).
 * Then back to the page they came from with ?gmail=<status>, which the Email
 * panel turns into a sentence. Nothing sensitive is ever put in that URL.
 */
export async function GET(request: NextRequest) {
  if (!(await isCrmStaff())) return new NextResponse(null, { status: 404 });

  const flow = readOAuthFlow(request.cookies.get(OAUTH_COOKIE)?.value, Date.now());
  const back = (status: string) => {
    const res = NextResponse.redirect(new URL(withGmailStatus(flow?.returnTo ?? "/crm", status), request.nextUrl.origin));
    res.cookies.set(OAUTH_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/crm/google", maxAge: 0 });
    res.headers.set("cache-control", "private, no-store");
    return res;
  };

  const q = request.nextUrl.searchParams;
  if (!flow || !sameState(q.get("state"), flow.state)) return back("expired");
  if (q.get("error")) return back("denied");
  const code = q.get("code");
  if (!code) return back("error");

  const config = googleConfig();
  if (!config) return back("not-configured");

  const tokens = await exchangeCode({
    config,
    code,
    codeVerifier: flow.verifier,
    redirectUri: `${request.nextUrl.origin}/api/crm/google/callback`,
  });
  if (!tokens.ok) return back("error");
  if (!hasAllScopes(tokens.scope)) return back("scopes");
  if (!tokens.refreshToken) return back("no-refresh");

  const who = await getSendAs(tokens.accessToken);
  if (!who.ok) return back("error");

  const user = await signedInUser();
  const signedIn = user?.primaryEmailAddress?.emailAddress?.trim().toLowerCase();
  const mailbox = who.sendAs.email.trim().toLowerCase();
  if (!user || !signedIn || signedIn !== mailbox) return back("wrong-account");

  const saved = await saveMailConnection({
    email: mailbox,
    clerkUserId: user.id,
    refreshToken: tokens.refreshToken,
    scopes: tokens.scope,
  });
  return back(saved.ok ? "connected" : "not-configured");
}
