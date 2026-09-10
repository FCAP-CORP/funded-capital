import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// The broker portal, the participant portal and the admin area require a login.
// The public marketing site, blog, and utility APIs (treasury, address lookup)
// stay open.
const isProtectedRoute = createRouteMatcher(["/broker-portal(.*)", "/participant-portal(.*)", "/admin(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
