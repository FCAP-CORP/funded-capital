import { initBotId } from "botid/client/core";

/**
 * Vercel BotID — client-side challenge registration.
 *
 * Added 2026-09-03, replacing home-made heuristics as the primary bot defense
 * on the public lead forms.
 *
 * WHY THIS EXISTS. The first defense we shipped inferred "is this a human?"
 * from the content of the submission — name shape, email shape, how fast the
 * form was filled. Measured against 65 real surnames and the 18 the attacker
 * actually used, that approach flagged Schmidt, Schwartz and McKnight as
 * machine-generated while missing 28% of the real bot names. It also let
 * through, by construction, any bot that skips hidden fields and waits five
 * seconds before submitting.
 *
 * BotID replaces the guess with proof: the browser solves a cryptographic
 * challenge, and the server verifies it. A script cannot fake that by writing
 * a more convincing sentence.
 *
 * The paths listed here MUST match the routes that call checkBotId() on the
 * server. A route that calls checkBotId() without being registered here will
 * fail every request — this file is what makes the browser attach the
 * challenge headers in the first place.
 *
 * Performance: the challenge is fetched through a same-origin rewrite that
 * withBotId() adds in next.config.ts, so ad-blockers cannot strip it and it
 * does not block render. No visible widget, no user interaction, nothing for
 * a real applicant to notice or fail.
 */
initBotId({
  protect: [
    {
      // Both public forms — Apply and Contact — post here.
      path: "/api/lead",
      method: "POST",
    },
  ],
});
