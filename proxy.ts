import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Auth routing for the two portals.
 *
 * A protected route that simply calls auth.protect() with no sign-in URL
 * resolved returns a bare 404 to signed-out visitors. That is what happened
 * here: /participant-portal(.*) matched the portal's own sign-in screen, so
 * the only page that could let someone in was itself behind the wall. Nobody
 * outside an existing session could ever reach either portal.
 *
 * Now: the sign-in screens are explicitly public, and a signed-out visitor to
 * a protected route is redirected to the correct branded sign-in with a
 * redirect_url so they land where they were headed.
 */

// Must stay reachable while signed out — these ARE the way in.
const isPublicAuthRoute = createRouteMatcher([
  "/participant-portal/login(.*)",
  "/participant-portal/accept(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

const isParticipantRoute = createRouteMatcher(["/participant-portal(.*)"]);
const isGuardedRoute = createRouteMatcher([
  "/broker-portal(.*)",
  "/participant-portal(.*)",
  "/portal(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isPublicAuthRoute(request)) return;
  if (!isGuardedRoute(request)) return;

  const { userId } = await auth();
  if (userId) return;

  // Participants get their own screen; brokers and admin use the existing one.
  const target = isParticipantRoute(request) ? "/participant-portal/login" : "/sign-in";
  const url = new URL(target, request.url);
  url.searchParams.set(
    "redirect_url",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );
  return NextResponse.redirect(url);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
