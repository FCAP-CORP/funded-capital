import { NextResponse, type NextRequest } from "next/server";
import { isCrmStaff, signedInUser } from "@/lib/crm/access";
import { googleAuthUrl, safeReturnPath, withGmailStatus } from "@/lib/comms/email";
import { OAUTH_COOKIE, OAUTH_COOKIE_MAX_AGE, newOAuthFlow } from "@/lib/comms/gmailOAuthCookie";

/**
 * GET /api/crm/google/connect?return=/crm?open=… — step 1 of Connect Gmail.
 *
 * STAFF ONLY, checked first; anyone else gets the same bare 404 as every /crm
 * surface. Sends the person to Google's consent screen asking for exactly two
 * permissions (send, and read the signature — lib/comms/email.ts GMAIL_SCOPES),
 * with a one-time `state` and a PKCE challenge held in a short httpOnly cookie.
 * The callback refuses anything that does not come back with the same state.
 */
export async function GET(request: NextRequest) {
  if (!(await isCrmStaff())) return new NextResponse(null, { status: 404 });

  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("return"));
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId || !process.env.GOOGLE_OAUTH_CLIENT_SECRET || !process.env.GMAIL_TOKEN_KEY) {
    return NextResponse.redirect(new URL(withGmailStatus(returnTo, "not-configured"), request.nextUrl.origin));
  }

  const user = await signedInUser();
  const flow = newOAuthFlow(returnTo);
  const url = googleAuthUrl({
    clientId,
    redirectUri: `${request.nextUrl.origin}/api/crm/google/callback`,
    state: flow.state,
    codeChallenge: flow.challenge,
    loginHint: user?.primaryEmailAddress?.emailAddress ?? null,
  });

  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, flow.cookie, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/crm/google",
    maxAge: OAUTH_COOKIE_MAX_AGE,
  });
  res.headers.set("cache-control", "private, no-store");
  return res;
}
