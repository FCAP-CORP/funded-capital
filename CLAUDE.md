# Funded Capital — repo instructions

Next.js site, portals, and the Lending OS CRM for an asset-based lender to **real estate investors**
(fix & flip, ground-up construction, DSCR rental, bridge). Never homebuyers.

Luis Fajardo is the founder, not a developer. Explain technical decisions in plain English.

---

## Read this first: you have no shell on this machine

Cowork sessions can read and write files here but **cannot run commands**. You cannot run
`npm install`, `npm run build`, `tsc`, or the tests yourself. Do not pretend otherwise and do not
claim something builds when you have not seen it build.

**The loop is:**

1. You write code.
2. Luis double-clicks `fc-check.bat` (or runs `npm run check`).
3. It writes `.fc-check/report.md` in this repo.
4. You read that report with `device_stage_files` — no copy-paste needed.
5. You fix what it found.

Always tell Luis to run `fc-check.bat` after you change code, and always read the report before
saying the change is good. `fc-check.bat --fast` skips the production build when you only need
typecheck and tests.

**Before spending one of Luis's runs, reproduce the build yourself.** Cowork sessions have a Linux
container with its own shell and a matching `node_modules`. Assemble a scratch app there — this
repo's `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`,
`next-env.d.ts`, `package.json`, a stub `app/layout.tsx`, plus only the routes you changed — and run
`npx next build` against it. Hard-link `node_modules` with `cp -al`; a symlink makes Turbopack panic
with *"points out of the filesystem root"*. A stub `.env.local` with a syntactically valid fake
`DATABASE_URL` is enough, because nothing connects at build time. This catches config-level errors
like the `cacheComponents` one below without a round trip, and it is the difference between finding
a problem in two minutes and finding it in twenty.

When a step does fail on Luis's machine, the complete output is in `.fc-check/fail-<step>.log` —
read that, not just the excerpt in `report.md`.

---

## Stack — non-negotiable

- Next.js App Router + React Server Components. Minimal client-side JavaScript.
- Tailwind CSS, Lucide icons, Clerk auth, Vercel deploys on push to `main`.
- **No heavy libraries.** No Bootstrap, no jQuery, no component frameworks. This rule is about the
  client bundle — dev-only tooling (`tsx`, type definitions) is fine.
- Performance is a feature: target Lighthouse 100. Semantic HTML5, `next/image` with `priority` on
  heroes.
- Small commits, clear messages. Push = deploy. Verify on the live site after every deploy.

### Output expectations for every page or component

TypeScript + Tailwind code, a brief note on **performance** impact, and a brief note on
**conversion** impact — what makes a visitor act.

---

## Brand and design system

Defined in `tailwind.config.ts`. Use the tokens, never raw hex.

| Token | Value | Use |
|---|---|---|
| `ink` | `#0D2035` | Document navy — matches participation agreements and one-pagers |
| `navy-950/900/800/700` | `#060D1F` … `#334155` | Institutional navy |
| `gold-400/500/600/700` | `#D4A844` … `#9A7A24` | Accent only. Never a background for body text |
| `slate-50` … `slate-900` | | Text and surfaces |

High contrast, ample whitespace, "knowledgeable capital partner" tone. Every page keeps the
**Apply Now** CTA prominent in header and footer. Voice, do's and don'ts live in the connected
AI Agent System folder under `04-brand/` — check there before writing a word of marketing copy.

**Rate ranges only, never guarantees.** In Revenue Share contexts they are *participants*, never
investors — never use "investment", "fund", "returns", or "yield", including in internal notes.

---

## The lead pipeline — trace it fully before touching it

`/apply` and `/contact` → `POST /api/lead` → spam screen (`lib/antispam.ts`) → TCPA consent stamp →
Google Apps Script webhook (**primary**) → Formspree (**backstop only**) → 502 + logged
`[api/lead] LEAD BACKUP` if both fail.

**The Apps Script is the lead engine, not a backup.** The sheet row, the acknowledgement email, the
Quo contact, and the "call now" alert all live in `Website.gs`. Anything that stops leads reaching
it stops all four, silently.

Read the header comment in `app/api/lead/route.ts` before changing anything — it is the
authoritative description, and the Drive-primary ordering there is deliberate (a bot flood burned
the metered Formspree quota on 2026-09-02 and it began rejecting real leads).

**Testing a lead change means confirming four things, not one:** sheet row, ack email in Sent, Quo
contact created, alert email sent. Both times this broke, the visible symptom looked fine while the
lead data was being discarded behind it.

Never make spam quarantine skip the row. The row is how a wrongly-filtered borrower gets found.
Quarantined rows are written with `notify: false` and are never emailed, so no Gmail subject search
can ever find them — check the `spam_flag` column on the Website Leads sheet.

Live honeypots are `fc_x1`, `fc_x2`, `fc_x3` in `lib/antispam.ts`. There is no `contactByFax` field
and there never was.

---

## Consent — TCPA / A2P 10DLC

`lib/consent.ts` is the single source of truth. The form renders `SMS_CONSENT_TEXT` and the server
logs the same constant verbatim, so the words shown and the words stored can never drift.

- Any form with a phone field captures consent.
- Changing the wording means bumping `CONSENT_VERSION`, so older records stay attributable to the
  exact language shown at the time.
- Any automated SMS send must verify consent **at the current version** before sending, enforced in
  the executor rather than in configuration so it cannot be switched off.

---

## Lending OS (the CRM) — build in progress

**Live now at `/crm`** (Clerk-guarded in `proxy.ts`): Pipeline and Contacts, both sortable,
searchable, facet-filtered, with in-place editing of stage, notes and target market. `lib/crm/view.ts`
holds every pure presentation function and is fully covered by `lib/crm/view.regress.ts`;
`lib/crm/schema-sync.regress.ts` fails the build if a database enum value has no UI label, which is
the bug class that has already shipped three times here.

Not editable in the grid on purpose: **email, phone and consent.** Email is the identity key Klaviyo
resolves on, phone must pass E.164 normalisation, and consent is mirrored inbound only.

**Access is an allowlist, and being signed in is never enough.** `CRM_STAFF_EMAILS` (falling back to
`PARTICIPANT_ADMIN_EMAILS`) lists the staff addresses; `lib/crm/access.ts` is the only place that
decides, it **fails closed** when unset, and a non-staff user gets a 404 rather than a 403 so the
route does not advertise itself. The broker portal is invitation-only as of 23 Sep 2026, but "any
Clerk user" still includes every broker who holds an invitation — gating on `userId` alone would
expose the whole borrower book. Every new
`/crm` page and **every server action** carries its own check: an action is an addressable endpoint
and a guard on the page does not cover it.


### Broker portal ↔ CRM (Phase 2, in progress)

The database is now **multi-tenant**, and that changes the cost of a mistake. Until Phase 2 there
was one tenant and the only question was staff or not. Now brokerages share these tables, and a
scoping bug does not throw or look broken — it renders a tidy, plausible table containing a
competitor's borrowers. That ends a broker relationship and is a GLBA problem on top.

**`lib/broker/scope.ts` is the only place that decides what a broker may see.** It is pure, it is
covered by `lib/broker/scope.regress.ts`, and no query may re-derive the rule inline. Three things
it enforces that are easy to get wrong:

- **Scope comes from the session, never from the request.** A `firmId` in a body or query string is
  attacker-controlled. The only trusted input is the Clerk user id.
- **A null firm never matches a null firm.** Website and BiggerPockets leads have no
  `broker_firm_id`. A stray `null === null` hands every house lead to every broker in the system.
  Both null guards in `canViewApplication` are load-bearing.
- **Unassigned is still a normal state, but it is now the exception.** An invitation carries the
  firm and role, so an invited broker lands already assigned. A null firm means someone arrived
  another way, or was invited before Luis knew where to put them. They see their own submissions and
  nothing else. Firms are created by Luis in the CRM, never by self-service; a broker who could type
  a brokerage name into a form could join a competitor's pipeline.

`applications.broker_firm_id` is stamped once at submission and never recalculated. Deriving it from
the submitter's *current* firm means a broker changing brokerage drags their old deals into the new
firm's pipeline and out of the old one's.

**Firms and assignment live in `/crm/brokers`** (Phase 2d). `lib/broker/admin.ts` holds the pure
rules and is covered by `admin.regress.ts`; `lib/broker/admin.server.ts` holds the reads and writes
and every function in it calls `assertCrmStaff()` itself. Four things there are deliberate:

- **A deal is attached to a broker by hand, one at a time.** There is no auto-claim on email match
  at sign-in and no bulk button. An email address is not an authentication factor, and each
  attachment grants a specific person sight of a specific borrower's file.
- **A deal with no `broker` participant can never be claimed.** Website and BiggerPockets leads have
  none, so they are outside the set the claim query can return — a structural guarantee rather than
  a careful UI.
- **A broker with no firm cannot claim anything.** Attaching first would stamp a null
  `broker_firm_id` permanently, so the deal would show on that one person's dashboard and stay
  invisible to their colleagues forever, including after they are assigned. Assign, then attach.
- **`claimDeal` re-reads the row and re-runs `canClaimDeal` before writing**, and the UPDATE carries
  its own `IS NULL` conditions, so two clicks arriving together cannot both succeed.

### Invitations — the portal is invitation-only IN CODE (Phase 2e)

`app/sign-up` always said "Invitation only", but nothing in this repository enforced it: whether a
stranger could register depended on a **restricted mode toggle in the Clerk dashboard** — a control
outside version control that nobody could verify by reading the code, and that one wrong click
opens with no trace. Clerk's setting is still the outer lock. `broker_invites` is the inner one.

- **`app/broker-portal/layout.tsx` is the only door.** The check is in the LAYOUT, not the dashboard
  page — putting it on the page would leave `/broker-portal/apply` and `/price` reachable by anyone
  signed in. That hole was caught before shipping, not after.
- **An invite carries the firm and role**, so a broker lands inside their firm on first sign-in and
  sees their colleagues' deals immediately. That is the real value; the lock is the other half.
- **An invite never moves an existing broker.** `shouldApplyInviteToExistingBroker()` returns false
  and `admitBroker` throws if that ever changes. A stale invitation for a firm someone has left must
  not be able to re-home them — an invite decides where a person STARTS, never where they end up.
- **Single use, email-bound.** Acceptance stamps which Clerk account consumed it, and the UPDATE
  carries `accepted_at IS NULL`, so a forwarded link cannot be replayed.
- **Revoking blocks a future sign-in only.** Someone who already accepted has a `broker_users` row;
  SUSPENDING that row is what cuts them off. The screen and the button tooltip both say so.
- **Existing brokers are grandfathered** — anyone with a row keeps access, invitation or not.
- **Invitations never expire on a timer.** `inviteAgeDays` exists to nudge Luis, nothing more. A
  broker signing in three months late should get in, not hit a dead end neither of them understands.
- **`admitBroker` fails CLOSED on a database error**, which refuses existing brokers too. Deliberate,
  but not graceful — see the note in provision.ts before "improving" it.

`lib/broker/invites.ts` holds the rules (pure, `invites.regress.ts`); `invites.server.ts` is
staff-only issuing and revoking; `provision.ts` is the broker-facing acceptance and deliberately
cannot import either of the staff modules.

Broker roles are a separate axis from CRM staff access and grant no view of the book.
`lib/crm/access.ts` decides who is Funded Capital; `lib/broker/scope.ts` decides what a broker sees
inside their own firm. Keep the two gates independent so a bug in one cannot become a bug in both.

Full architecture: `docs/lending-os.md`. Decisions already locked, do not relitigate:

- **Postgres on Neon + Drizzle.** Clerk stays for auth. Deploy-on-push unchanged.
- **Pipeline data in Postgres. Borrower documents stay in Drive** and are referenced by metadata.
  The portal remains a pipe for files.
- **The application is the container** — not the borrower and not the loan. Participants attach to
  an application *with a role*, so one person can hold different roles across concurrent
  applications. Repeat investors with per-project LLCs break any other model.
- **Stage is derived from data state, never a dropdown someone remembers to change.** All history
  goes in `stage_transitions`; never compute funnel metrics from a mutable `stage` column.
- **A delay is a timestamp, not a sleeping process.** Workflow enrollments carry `wake_at`; a tick
  claims due rows with `FOR UPDATE SKIP LOCKED` and executes exactly one step. Never park a job for
  days.
- Workflow definitions are **versioned JSONB**, and each enrollment executes against the version it
  started on.
- Queue is **pg-boss in the same Postgres**, so a step execution and its audit row commit together.
- **Consent flows inbound only.** A Klaviyo unsubscribe or a Quo STOP is authoritative. Code that
  lets the CRM re-subscribe a suppressed profile is a compliance incident, not a bug.
- Klaviyo `external_id` is always the CRM contact UUID, and email and phone always go in the same
  payload — splitting them across calls is what creates duplicate profiles.
- Webhooks dedupe on the provider's own event ID via `INSERT … ON CONFLICT DO NOTHING RETURNING id`.
  Never hash the body. Quo's handler timeout is 10 seconds: verify, claim, enqueue, return 200.
- Outbound calls to Klaviyo and Quo go through a transactional outbox, never inline in a handler.

### Not decided yet

Klaviyo vs ActiveCampaign as system of record (both connected and paid). Seat count and roles.
Whether the broker portal merges in. Whether servicing stays in-portal or moves to a vendor —
payments, ACH, amortisation, 1098/1099 and investor distributions are regulated, high-consequence,
and zero differentiation, so buying that layer later is the expected outcome. Keep the API boundary
clean so it stays cheap.

---

## Testing

Regression suites are plain scripts named `*.regress.ts`, with no test framework. They print
`PASS` / `**FAIL**` lines and `process.exit(fail > 0 ? 1 : 0)`. `lib/pricing.regress.ts` is the
reference implementation. `fc-check.bat` discovers and runs every `*.regress.ts` in the repo.

Follow that pattern for new suites. Anything touching money, consent, or borrower data needs one
before it ships — that means the pricing engine, the consent gate, webhook dedup, and stage
transitions at minimum.

**`lib/crm/guards.regress.ts` fails the build if a staff-only surface is missing its guard.** It
reads the source of every `/crm` page and layout, every `"use server"` export, and the staff-only
`*.server.ts` modules, and asserts each one calls a staff assertion. It also asserts the INVERSE for
`lib/broker/provision.ts`: that file runs as a broker, so an `assertCrmStaff()` added there — or an
import of `admin.server`/`invites.server` — would lock every broker out of the portal behind a
screen that looks exactly like a correct refusal.

Write the guard, and this suite stops you forgetting it on the next page. Two things learned
building it, both worth keeping:

- It found real dead code on its first run (`listBrokersAtFirm`, exported and never called). Deleted.
- Two of its first three failures were bugs in the TEST: it searched raw source for "admin.server"
  and matched the comment in provision.ts that says it must never import admin.server. A substring
  scan cannot tell a prohibition from a violation, so it parses import statements now. **A new
  guard test is not trustworthy until you have removed a guard and watched it fail** — all three
  directions were verified that way before it shipped.

---

## Known quirks — check here before debugging

- **Never write `export const dynamic = "force-dynamic"`.** `next.config.ts` sets
  `cacheComponents: true` (Next 16 Partial Prerendering), and any route segment config is a hard
  build error: *"Route segment config \"dynamic\" is not compatible with
  `nextConfig.cacheComponents`"*. The replacement is structural — keep the page a static shell and
  put everything that reads live data inside a `<Suspense>` boundary, which makes that subtree
  dynamic on its own. `app/crm/page.tsx` is the reference. This does not show up in `npm run
  typecheck`; only the production build catches it.
- **`await params` must happen INSIDE the `<Suspense>` boundary, not in the page function.**
  Same root cause as the `dynamic` rule above: under `cacheComponents: true`, touching
  `params`, `searchParams`, `cookies()` or `headers()` outside a boundary makes the whole
  route unprerenderable and the build fails with *"Next.js encountered uncached or runtime
  data during prerendering"*. Pass the params PROMISE down to the async component inside the
  boundary and await it there. `app/crm/brokers/[id]/page.tsx` is the reference. The typecheck
  passes either way; only the production build catches it.
- **The root layout is what makes every `/crm` route prerenderable.** `app/layout.tsx` wraps
  `<ClerkProvider dynamic>` in `<Suspense fallback={null}>`. Without that wrapper, any page
  under a layout that calls `currentUser()` — which is every `/crm` page, via
  `lib/crm/access.ts` — fails the build with the same prerender error, even though the page
  itself is written correctly. Worth knowing when reproducing a build in a scratch app: a
  stubbed root layout will produce a failure that does not exist in this repo. That exact
  false alarm cost a round trip on 22 Sep 2026.
- **`db.transaction()` does not work.** `lib/db` uses Drizzle's `neon-http` driver, which talks to
  Postgres over HTTP and throws `No transactions support in neon-http driver` at runtime. It
  compiles and builds clean, so nothing catches it until the first write. Use **`db.batch([...])`**
  — it sends the statements in one request inside a real Postgres transaction. Anything that must
  commit together (a `stage_transitions` row and the `applications.stage` cache, above all) goes
  through `db.batch`.
- **`scripts/merge-env.mjs` has two modes, and the difference matters.** Default adds
  only MISSING database keys and never replaces — that is what `fc-db.bat` wants, and it
  is what keeps a machine on the Neon dev branch when credentials are pulled. `--replace`
  overwrites them, and is what `fc-refresh-env.bat` uses after a password rotation.
  Until 22 Sep 2026 the replace mode did not exist, so the refresh script kept the stale
  password and reported it as "left untouched"; the first production migration failed on
  those credentials with *"password authentication failed for user 'neondb_owner'"*.
  `--replace` REFUSES when `.env.local` points at a different endpoint from the one
  Vercel holds, because replacing would move local development off the dev branch and
  back onto production. On a dev branch, rotate by re-copying from Neon with
  `fc-use-dev-db.bat` instead.
- **Production migrations go through `fc-migrate-prod.bat`,** which pulls CURRENT
  credentials from Vercel into a scratch `.env.vercel` and deletes it afterwards.
  Never rely on `.env.local.before-dev-branch` for this — it is a snapshot from the
  moment of the dev-branch switch and goes stale at the next rotation.
- **Do not `revalidatePath` a PPR route from a server action on a different route.**
  Every page under `/crm` is a static shell plus a `<Suspense>` boundary. Calling
  `revalidatePath("/crm")` from an action invoked on `/crm/brokers/[id]` left the entire
  `/crm` subtree serving its shell forever — heading and sidebar painted, the streamed half
  never arrived. HTTP 200, no console error, no server error: it simply looked like a page
  stuck loading. The same database was answering an API route normally at the time, which is
  the check that separates this from a database problem. Revalidate only the route the action
  was called from; a page that shows nothing the action changed does not need revalidating at
  all. The in-memory cache clears on a dev-server restart, so a restart that fixes it is the
  confirmation.
- **`/crm` 404s on localhost unless `CRM_STAFF_EMAILS` is set in `.env.local` by hand.**
  `scripts/merge-env.mjs` copies only DATABASE keys across from Vercel (`WANTED` in that
  file), so the staff allowlist has never come down with an env pull. Production has the
  variable, local development does not, and `lib/crm/access.ts` fails closed — so every
  `/crm` route returns 404 rather than an error, for the owner included. That is the gate
  working, not a bug, and it is why `/crm` had only ever been used live. `fc-fix-local-crm.bat`
  adds the line. Next reads `.env.local` once at startup, so the dev server must be restarted
  after. Diagnosis tell: the 404 page's TITLE is the route's own metadata ("Brokers | Funded
  Capital Lending OS") when the route exists and `notFound()` fired, versus a bare
  "404: This page could not be found." when the route itself is missing.
- **A brand-new page or API route that 404s locally is a stale `.next` cache,** not a
  missing file. Next's dev server was serving a route manifest from before the route
  existed — `/api/broker/consent-status` 404'd while `/api/my-submissions` worked and
  the production build compiled both. `fc-dev-clean.bat` clears the cache and restarts.
  A suspiciously fast "Ready in 481ms" is the tell.
- **A `.bat` that calls `npx` MUST use `call npx`,** or the window closes without running
  anything after that line. `npx` on Windows is `npx.cmd` — a batch file — and one `.bat`
  invoking another without `call` hands over control and never comes back, so the `pause`
  at the end never runs and the error scrolls past in a window that shuts instantly.
  `fc-check.bat` does not need this because `node` is an `.exe`. Symptom: "it opens and
  closes immediately."
- **A script under `scripts/` must load `.env.local` itself,** with
  `loadEnv({ path: join(ROOT, ".env.local") })` before importing anything that reads
  `DATABASE_URL` — `lib/db` throws at import time when it is unset. `migrate-crm.ts`,
  `backfill-broker-sheet.ts` and `test-broker-submission.ts` all do this. A script tested by
  passing `DATABASE_URL=... npx tsx ...` on the command line will appear to work and then
  fail for the person double-clicking the `.bat`, because that is the one condition the test
  never reproduced. Test scripts the way the `.bat` runs them: with nothing preset.
- **A script that imports a `server-only` module needs `--conditions=react-server`.**
  `server-only`'s default export throws by design; the `react-server` condition resolves it
  to an empty file instead. `npx tsx --conditions=react-server scripts/x.ts` is how
  `scripts/test-invites.ts` can call the real `admitBroker`.
- **`neon(url).query(text)` does not exist here.** `@neondatabase/serverless` is pinned at 0.10.4,
  where `neon()` returns a tagged-template function carrying only `.transaction` — `.query()` arrived
  in a later major. To run raw SQL (a migration file, say), go through drizzle:
  `drizzle(neon(url)).execute(sql.raw(statement))`. `scripts/apply-migration.mjs` is the reference.
  Calling the non-existent method fails with *"sql.query is not a function"* at the first statement.
- **A dry run proves nothing about the database path.** `--dry-run` skips every line that touches the
  driver, so a script can dry-run perfectly and still die on its first real statement — this happened
  twice in a row on migration 0001. To test the real path without real credentials, run it for
  actual against a bogus Neon host: reaching *"password authentication failed"* proves the statement
  was built, sent and rejected by a server. Anything earlier than that is a bug in the script.
- **Row shapes passed to the CRM grid must be `type` aliases, not `interface`s.** TypeScript gives a
  type alias an implicit index signature and an interface none, so only the alias form satisfies the
  grid's `Record<string, unknown>` constraint. Tidying `PipelineRow` back into an interface breaks
  the build.
- **`npm run lint` is stubbed to `exit 0`** so Vercel builds don't fail on lint. It catches nothing.
  `npm run typecheck` is the real check. Do not assume a green build means clean code.
- **MDX tables need `remark-gfm`** in the MDXRemote options. Already wired into `blog/[slug]/page.tsx`.
- **Local dev uses Clerk dev keys** with a separate user list from production.
- **Write files with LF endings**, not CRLF — except `.bat` files, which need CRLF.
- **`wmic` was removed from Windows 11.** Use PowerShell for date stamps in batch scripts; the old
  `wmic` call silently produced commit messages like "Site update (--)".
- **Vercel functions cap at 300s** on every plan. Nothing may block that long.
- **Vercel MCP cannot reach runtime logs** — the only team it sees returns an empty project list, so
  `[api/lead]` log diagnosis has to happen in the Vercel dashboard by hand.
- **`vercel env pull .env.local` overwrites the file, it does not merge.** Local dev uses Clerk DEV
  keys that Vercel does not hold, so the pull deletes them and points local dev at live Clerk users.
  Always pull to `.env.vercel` and merge with `scripts/merge-env.mjs` — that is what `fc-db.bat` and
  `npm run db:pull-env` do. Both used to run the destructive form; fixed 21 Sep 2026.
- `info@fundedcapital.com` is correct. **`inquire@fundedcapital.com` does not exist** and still
  appears in older documents.

---

## Scheduled tasks

Before writing one, ask what fires it. If an event already exists — a form submit, a webhook, a
stage change — the logic belongs in the code path that owns that event, where it lives in this repo,
deploys on push, and runs instantly. Reserve cron for genuine periodic observation with no
triggering event: health checks, digests, reporting rollups.

Use the Claude Code Remote MCP trigger tools for anything scheduled. Never the local `Cron*` tools —
those run in-process and are lost when the session ends, so the task silently never runs.

Do not add n8n, Make, or Zapier. They are also visual configs outside this repo and add a second
runtime where business rules can hide.
