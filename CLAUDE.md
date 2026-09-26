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

~~Klaviyo vs ActiveCampaign~~ — **decided 26 Sep 2026: Klaviyo** is the system of record for marketing email; ActiveCampaign is no longer used. Seat count and roles.
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
  **Enforced in `app/crm/actions.ts` since 24 Sep 2026:** actions take a `from: CrmRoute` argument
  checked against a fixed list and refresh that one route via `revalidateFrom()`. Three actions
  shipped the day before refreshed both `/crm/dashboard` and `/crm`; the work-queue buttons would
  have frozen `/crm` on their first click. `lib/crm/guards.regress.ts` §8 fails the build if any
  action refreshes two routes or a dashboard button omits its route.
  `/crm/board` was added to the list with the pipeline board; its drops pass their route too, and
  §8 checks that as well.
- **The pipeline board (`/crm/board`) is a view, not a second source of truth.** It moves deals
  with the same `setStage` as the table, through one shared `moveStage()` in `app/crm/actions.ts`,
  so every move writes its `stage_transitions` row. Funded asks for confirmation (Cancel has
  focus); Closed – Lost requires a reason via `markLost`, which writes `applications.lost_reason`
  — unused from the first migration until 24 Sep 2026 — and the transition's `reason`. Since 24 Sep
  2026 the table's stage dropdown asks the same questions (`app/crm/StageDialogs.tsx`, shared). Only the seven fields a
  card shows are sent to the browser. Rules and tests: `lib/crm/board.ts`.
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
- **`tsx` DOES NOT TYPECHECK.** It strips types with esbuild and runs. A script that executes
  perfectly under `npx tsx` can still fail `npm run typecheck` and the production build — and
  because `tsconfig.json` includes `**/*.ts`, a broken script under `scripts/` blocks the BUILD,
  not just its own execution. It does this even when the file is untracked, so `fc-check` can fail
  on something Vercel has never seen. Always run `npx tsc --noEmit` after writing a script; running
  it is not evidence.
- **Casting a drizzle result needs to go through `unknown`.**
  `NeonHttpQueryResult<Record<string, unknown>>` does not structurally overlap with a hand-written
  `{ rows?: { n: number }[] }`, so a direct `as` is a TS2352 error. Use the `rowsOf` helper pattern
  (`(r as { rows?: Row[] }).rows ?? (r as Row[])` with `Row = Record<string, unknown>`) and convert
  fields with `Number()` / `String()` afterwards. `lib/broker/admin.server.ts` is the reference.
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

### One shell for both portals (Phase 2f)

`/crm` and `/broker-portal` render inside the **same** frame:
`components/workspace/WorkspaceShell.tsx` (server) + `WorkspaceNav.tsx` (client). It replaced
`app/crm/CrmNav.tsx` and `app/broker-portal/PortalNav.tsx`, which were the same component twice with
different arrays in them — and no way to get from one product to the other except the address bar.

**URLs did not change.** Nothing moved, nothing redirects. The only thing that changed is what the
sidebar contains.

- **`lib/workspace/nav.ts` is a VIEW, not a gate, and must never become one.** A link missing from
  the rail is missing from a menu; the person can still type the URL. The layouts, every page, every
  server action and `lib/broker/scope.ts` are what actually stop anyone, exactly as before. Treat any
  future comment claiming the nav protects something as a bug.
- **The link list is computed on the server** (`nav.server.ts`) from the two gates that already
  exist — `isCrmStaff()` and a `broker_users` row — never from a third. Links a broker is not
  entitled to are not hidden with a class; they are not in the payload.
- **`nav.server.ts` is broker-reachable**, so it asserts nothing about staff and may not import
  `admin.server.ts` or `invites.server.ts`. Same constraint as `provision.ts`, asserted by
  `guards.regress.ts` §5.
- **Staff short-circuit:** `isCrmStaff()` true returns both sections without the broker lookup, so
  this adds no database round trip to a CRM page. Luis has no `broker_users` row on purpose — one
  would put him in his own unassigned queue.
- **A suspended broker still gets the rail.** That matches the portal: `admitBroker` readmits anyone
  with a row and suspension empties the dashboard through `scope.ts` rather than locking the door.
  Change one half and the other has to move with it.
- **Longest match lights the link.** `activeHref` replaced two hard-coded exceptions (`/crm` exact,
  `/broker-portal/price` exact) with one rule, and matches on a segment boundary so `/crm/brokers`
  cannot light on `/crm/brokerage`. 46 tests in `nav.regress.ts`.
- The rail is a flex column now, not a footer pinned with `position: absolute` — that was fine with
  three links and would have overlapped at eight.
- `PortalNav` carried `if (pathname === "/broker-portal/login") return null`. That route DOES exist
  but is a bare `redirect("/broker-portal")`, so it throws before any child renders and the branch
  could never fire. Gone. (Checked on the machine, not assumed — the Cowork container's mirror of
  this repo is incomplete and does not contain every file.)

**`guards.regress.ts` §5 is a census: every `lib/**/*.server.ts` must be classified** staff-only or
explicitly exempt, with the reason in the source. `STAFF_ONLY_MODULES` was hand-maintained, so a new
cross-firm module could sail past §3 simply by not being mentioned. Now not deciding is a build
failure. It found `lib/revenueShare.server.ts` unclassified on its first run — correctly exempt (it
gates on `PARTICIPANT_ADMIN_EMAILS`, a separate allowlist), but note the open item recorded there:
**`getBook()` does not check anything itself** and relies on its one caller to gate first. That is
the pattern `/crm` abandoned deliberately. Worth fixing; separate change, separate product area.

### Dashboard and the work queue (Phase 3a)

`/crm/dashboard` is one screen, not two: a compact KPI strip, then the **work queue** as the body
of the page, then the funnel shape. The order is the argument — a number saying "84 stalled"
changes nothing about today; a list saying "these people are waiting, longest first" is a morning.

`lib/crm/dashboard.ts` holds every rule, pure and covered by `dashboard.regress.ts` (69 tests,
negative-tested in four directions). Five things there are deliberate:

- **Open, servicing and terminal are three different things.** `isOpen` matches the Pipeline page
  exactly (`NOT IN ('closed_lost','payoff')`) so the two screens can never disagree. `needsWork` is
  narrower and excludes `funded/active/draw_cycle/extension` — a performing loan sitting quietly for
  ninety days is a success, and a "needs attention" list full of successes gets ignored in a week.
- **One deal, one reason.** Priority runs `awaiting_reply` → `term_sheet_cold` → `duplicate` →
  `never_contacted` → `stalled`. An unanswered inbound email is first because it is the only one
  where the borrower KNOWS they are being ignored. Listing a deal under all five reasons would
  recreate the problem the screen exists to solve.
- **A repeat investor is not a duplicate.** Two open applications for one contact is the borrower
  this company wants most. A duplicate is two filings for the same contact within
  `duplicateWindowDays` (7). Getting this wrong trains whoever reads the screen to ignore it.
- **`fundedAt` is `COALESCE(applications.funded_at, first transition to 'funded')`.** Neither source
  covers the whole book — legacy rows carry a date with no history, UI moves write a transition —
  and preferring one silently undercounts half the book, which reads exactly like a bad month.
- **Empty stages stay on the chart.** A book with everything in `lead` and nothing in underwriting
  is not a chart with missing bars; the gap is the finding.

The page has **zero client JavaScript** — bars are divs with a width percentage, no chart library —
and every queue row carries a `mailto:` with the borrower's address already in it.

### The Pipeline page was counting some deals twice (fixed 23 Sep 2026)

`getPipeline` joined `participants` straight onto `applications`. The unique index there is
application + contact + **role**, so one person holding two roles on their own deal (broker AND
borrower — common for the brokers who submit their own files) produced TWO rows for one
application. The grid showed the deal twice and, worse because nobody questions a total, the stats
above it counted it twice.

The live symptom on 23 Sep was **"OPEN FILES 135 / 130 all time"** — 135 open out of 130
applications is impossible, and `$16,938,140` was inflated by the same deals. A number that cannot
be true is the lucky case; the identical bug on a chart nobody cross-checks just reads as a good
month.

Both `getPipeline` and `getDashboardApplications` now use `LEFT JOIN LATERAL … LIMIT 1` to pick
exactly one contact per application — the borrower when there is one, otherwise the earliest
attachment, ordered so the choice is stable across reloads. Applications with no participant still
render as "(unlinked)".

**This was verified against a real Postgres 16**, not reasoned about: the schema was built from
`drizzle/*.sql`, seeded with a contact holding two roles on one deal, and the old join reproduced
the bug exactly (4 applications → 5 rows) before the new one returned 4. Worth repeating for any
future query change — the container has `postgresql-16` installed and the migrations apply clean,
so "I cannot test SQL from here" is not true.

`getDashboardApplications` calls `assertCrmStaff()` itself. The older functions in
`lib/db/queries.ts` still rely on their calling page having checked — that file is imported only by
`/crm` pages today, but it is the same caller-gated pattern noted against `getBook()`, and it is
worth closing the same way.

### Marketing queue (Phase 3b)

`/crm/marketing` exists because the blog engine was meant to publish daily and **stopped on
1 September 2026 — twenty-two days of silence that nothing reported.** A pipeline that stops
produces no error; it produces nothing.

*(Correction, same day: this was first written as "30 August, twenty-four days", from a summarised
web fetch of /blog that silently dropped the two newest posts. The cadence card read the actual MDX
files and said 22. **The code was right and the hand-checked number was wrong** — which is the whole
argument for the card existing. The commit message still carries the wrong date; git history is not
rewritten for this.)* So the first thing on the screen is how long each channel has been quiet, and the
request form is underneath it — a "write me a post" button at the top would have made the real
problem worse, not better.

**The portal asks; it does not write.** A request inserts a row in `content_requests`. A scheduled
Claude task reads the queue through `scripts/content-queue.ts`, does the work with the brand-voice
and research skills that already exist, and writes back where the draft is. ~~Nothing in the Next.js
app calls a model.~~ **Reversed for the blog on 25 Sep 2026** — see "The daily blog is a Vercel cron"
below. LinkedIn and email requests are still worked by Claude tasks.

- **Nothing reaches the public without Luis, on any channel.** `autoPublishes` is false for all
  three and `requests.regress.ts` asserts it stays that way. The first version said the blog
  published itself, because a post is an MDX file and a push deploys it — but the push is
  `publish-blog.bat`, a person double-clicking something. `publishStep` names the one action that
  makes each channel public ("run publish-blog.bat" / "post it on LinkedIn" / "send it from
  Klaviyo") and the form says it before you click. If that flag ever flips, something must genuinely
  be able to put content in front of borrowers unattended — a decision to make on purpose, not to
  discover.
- **Blog cadence reads the MDX archive, not this table.** Reading it from `content_requests` would
  report "no record yet" on day one despite fifty published posts. LinkedIn and email have no
  archive, so they are measured from the portal and carry that caveat on the card.
- **"Unknown" is its own level, not "stalled".** A channel with no recorded history is unmeasured.
  Colouring it red teaches the reader to ignore red.
- **Blog drafts travel through the table; nothing else does.** `draft_body` (0008, 24 Sep 2026)
  holds a blog post's MDX between the 7am task writing it and Luis pulling it down with
  `fc-pull-drafts.bat` — so the task no longer needs his laptop awake. It is a transit copy: the
  published copy lives in `content/blog`, and a drafted redo without a body clears it. LinkedIn and
  email rows never carry a body; `draft_url` still points at the Gmail draft or Klaviyo template.
  Marketing content only — borrower documents still never touch the database.
- **Blog status is derived, not recorded.** `/crm/marketing` shows a drafted blog row as Published
  when its slug is live in `content/blog` (`lib/marketing/published.ts`), so nobody has to remember a
  button. LinkedIn and email keep "Mark published": there is no file to check.
- **`in_progress` with no finish is surfaced.** A task that claims a job and dies leaves a row
  looking busy forever; `stuckRequests` flags it after 6 hours and the retry keeps the brief.
- **`scripts/content-queue.ts` imports the transition rules from `lib/marketing/requests.ts`** rather
  than restating them, and **prints which database branch it is on every run.** `.env.local` points
  at the DEV branch and the real queue is in production — a run against the wrong one looks exactly
  like an empty queue, which is the same shape as the invitations-on-localhost trap.
  `fc-content-queue-prod.bat` pulls production credentials to a scratch file and deletes it after.

**Migration 0006 adds `content_requests` plus the `content_channel` and `content_status` enums.**
`apply-migration.mjs` picks up any new `drizzle/*.sql` automatically, so `fc-migrate-dev.bat` and
`fc-migrate-prod.bat` need no change — but **production must be migrated BEFORE the push**, or the
deploy serves a page querying a table that is not there.

### Ground-Up LTFC is tier-aware (fixed 23 Sep 2026)

The committee raised Tier 5 Ground-Up to **90% LTFC on construction dollars, with the usual 5%
interest-reserve band on top — 95% all-in** on 30 July 2026. `lib/pricing.ts` never learned it. Every
tier was capped at 85% until 23 September, so **a Tier 5 builder was quoted five points of cost less
than they qualified for** — $250,000 on a $5M project — with no error, no warning, and nothing in the
output a broker could have spotted.

- `guLtfcCap(tier)` and `guLtfcWithIrCap(tier)` now decide it, mirroring `guArltvCap`. There is no
  flat read of `CAPS.new_construction.ltfc` left anywhere; the only two references are inside those
  two functions.
- Tiers 1–4: 85% construction + 5% reserve band. **Tier 5: 90% + 5%.** The band is the same width at
  every tier; what moved is where it starts. It funds a financed reserve and never build budget.
- The blocker text reads the tier's own cap, so a Tier 5 broker is told "90% LTFC" rather than 85%.
- Portfolio uses the same function. It was flat there too.
- 19 new tests in `pricing.regress.ts` (12 → 31), negative-tested three ways: flattening the cap,
  letting the band buy construction dollars, and promoting Tier 4 by mistake.

**The lesson is not "add a constant."** A committee decision that changes leverage has to land in
`lib/pricing.ts`, because that file is what the broker quotes from. A marketing page said 85%, a memo
said 90%, and the quote was the only one of the three anybody acted on. The content calendar carried
a note about the discrepancy across four consecutive runs and nobody closed it.

**Still open:** `guLeverageAdj` adds +0.20% for LTFC ≥ 80% and does not distinguish 85% from 90%.
Whether Tier 5's extra five points carries its own rate adjustment is a committee question, not
something to infer.

### Architecture decisions, 23 Sep 2026

From the CRM/dashboard brief. Recorded here so they are not relitigated:

- **Data layer stays Neon + Drizzle.** Supabase is the same Postgres with auth and storage bundled;
  Clerk and Drive already own those, deliberately. Its row-level security would put "who can see this
  borrower" in a *second* place alongside `lib/broker/scope.ts`, which is the failure this codebase is
  built to avoid. Revisit only for realtime subscriptions or if Clerk is ever replaced.
- **Adopting: shadcn/ui with Funded Capital brand tokens, TanStack Table, dnd-kit, Tremor.** The first
  three carry little or no bundle cost. Tremor pulls Recharts (100KB+) for charts the dashboard
  currently draws with divs — accepted knowingly, and it is the one that trades against Lighthouse.
- **Treasury data already exceeds the brief.** `/api/treasury` reads `home.treasury.gov`'s own XML
  feed — the primary source. FRED republishes it with a lag. No reason to switch.
- **Notion for build tasks only**, never customer data. OpenRush, Exa/Firecrawl and Perplexity are
  research and keyword tools; none is connected yet.
- Unchanged and non-negotiable: pricing is deterministic and auditable, formulas in code and versioned
  in git, **no AI-generated numbers in borrower-facing pricing**, every published rate claim cites a
  source.

### The marketing queue API, and why the first fulfilment design never ran (23 Sep 2026)

**The scheduled task never worked once.** Its first step ran `npx vercel env pull` and
`npx tsx scripts/content-queue.ts` on Luis's machine — and **there is no tool in this environment
that runs commands on his machine.** File tools yes (`device_list_dir`, `device_stage_files`,
`device_commit_files`); a shell, no. Both runs ended in about a minute having done nothing.

The instruction "END LOUDLY when you cannot do the job" worked exactly as written: the task said so
clearly, **inside its own session**, where nobody was looking. That is the same silent failure this
whole feature exists to prevent, rebuilt one level down. Writing a loud failure is not the same as
routing it somewhere a person will see.

**`/api/crm/content-queue` is the fix.** The portal already holds the database connection, so an
outside agent talks to it over HTTP instead of needing a shell and production credentials.

- **`proxy.ts` matches `/api` but does NOT list it as a guarded route**, so Clerk lets every request
  reach the handler. The bearer token is the only thing between the internet and this data.
- **It fails closed**, in the same shape as `lib/crm/access.ts`: `CONTENT_QUEUE_TOKEN` unset, or
  shorter than 32 characters, admits nobody. That minimum is not style — it stops
  `CONTENT_QUEUE_TOKEN=test`, set once while debugging, from being a live credential.
- **Constant-time comparison over SHA-256 digests**, so neither length nor content leaks by timing.
- **The blast radius is asserted, not promised.** `guards.regress.ts` §6 fails the build if
  `queue.api.server.ts` ever queries `applications`, `contacts`, `broker_users`, `broker_firms`,
  `participants` or `documents` — and checks it *does* query `content_requests`, so the test cannot
  pass vacuously.
- **A task may claim, draft and fail. It may NOT publish.** Also asserted. An endpoint that let a
  bearer token mark something published would be a quiet way around the rule that nothing reaches
  the public unattended.
- **The token lives in `.queue-token`** (git-ignored) and in Vercel. Never in a task prompt, never in
  chat. The daily task stages that file and reads it.

**The guard suite's comment-matching bug appeared for the THIRD time** and is now fixed properly.
It flagged the new module because a doc comment *explains* why `assertCrmStaff()` cannot work there.
Negative checks now strip comments first via `codeOnly()`; positive checks still read raw source,
because an approximation that eats code makes a must-not-contain check stricter (a false alarm,
cheap) and a must-contain check weaker (a missed guard, not cheap).

**Update 24 Sep 2026:** the device gate is also why the task produced nothing that morning — the
laptop was asleep at 7:00 and the task was suspended (`device_absent`). The device-free path is
built (draft into `draft_body`, pulled down by `fc-pull-drafts.bat`) and switched on the same day.
The daily blog is now **`trig_01UWtAw89jQKtYPqoYshPWm4`**, a cloud-only scheduled task (not bound
to any computer — a bound task is suspended as `device_absent` before its prompt even runs, so
changing the prompt alone could never have fixed this). The old `trig_016uyqKsWzrAcUn9FhGdKYUf`
is disabled and kept for its history. The task reads the queue token from Drive:
`My Drive/Funded Capital - AI Agent System/00-private/content-queue-token.txt`, put there by
`fc-queue-token-to-drive.bat`, which refuses to copy unless git confirms `00-private/` is ignored —
that folder is itself a git repo that `backup-agent-system.bat` pushes to GitHub. Failures leave a
Gmail DRAFT titled "Daily blog did not run: …" rather than a note in a session nobody opens.

**One blog system, not two.** The 7am daily task now works the queue and keeps its device gate — the
gate is why it has always worked. The three-times-daily marketing-queue task is disabled; it was
built around a shell that does not exist.

### The daily blog is a Vercel cron (25 Sep 2026)

**Why it moved.** The 7am scheduled Claude task (`trig_01UWtAw89jQKtYPqoYshPWm4`) had to fetch the
queue token out of `00-private/content-queue-token.txt` in Drive and send it to
`/api/crm/content-queue`. On 25 Sep the run's automatic safety check refused that step: an agent
reading a credential from a file and sending it to a web address is exactly what credential theft
looks like from outside. No post was written. That check will keep firing on some mornings, so the
fix was to stop any agent handling the token. Luis chose to move the job into the site.

- **`app/api/cron/daily-blog/route.ts`**, scheduled by `vercel.json` at `0 11 * * *` (7am EDT /
  6am EST). It answers only to `CRON_SECRET` (Vercel sends it; `tokenOk`, fail-closed, constant
  time, checked before anything else — guard §12).
- **It talks to the queue over HTTP**, with `CONTENT_QUEUE_TOKEN` from its own environment, through
  the same door the task used. So `draft.ts`, the transition rules and "a task may not publish"
  still decide everything; the route never imports the database. Guard §12 pins all three.
- **Order is the safety:** secret → config check (nothing claimed if a key is missing) → read queue →
  skip if a blog draft already landed today (Vercel can repeat a cron; `?force=1` overrides) →
  claim → research + write → check in code → one repair round → draft → carousel + caption. Any
  failure after the claim marks the request **failed** with a sentence Luis can act on, shown on
  `/crm/marketing`. It is never left `in_progress`.
- **The model call** is a plain `fetch` to the Messages API (no SDK), `web_search_20250305` server
  tool, `pause_turn` followed. Model is `BLOG_MODEL` or **`claude-opus-5-5`** (switched from
  Sonnet the same evening: the first Sonnet draft passed every check but pasted one sentence twice
  and credited one claim to two sources). **The site is on Vercel Pro**, so `maxDuration = 800` and
  the route stops starting new model work at 760 s. On Hobby both would have to drop to 300 / 270 s.
- **Checks added after that first draft:** a run of 7+ words repeated inside one paragraph fails
  (`repeatedPassages` — paragraph-scoped on purpose: a post-wide version flagged six of eight live
  posts for legitimate restatement); at least 2 distinct links to live posts; a slide with a space
  before punctuation is refused. The prompt now says to paraphrase, credit one source per claim, and
  re-read for repeats.
- **Carousel renderer fix:** `wordsOf` (carousel.ts) cuts headlines at real spaces only, so
  `Came Back *Low*.` keeps its full stop. Every run used to be split separately, which drew "Low ."
  on every carousel with punctuation after a highlight — old decks are redrawn correctly too.
- **Every check the task ran in its sandbox is now code** in `lib/marketing/dailyBlog.ts` (pure,
  `dailyBlog.regress.ts`): frontmatter shape and date, category, 5–8 keywords, 4–6 FAQ, 1,200–1,800
  words, no FAQ section in the body, compliance line exactly once, phone + `/apply`, every
  `/blog/` link live in the sitemap, own slug not live, banned words, and the four forbidden figures
  ("44 states", "as little as 5 days", "680 floor", "85% LTC"). A bad carousel never blocks the post.
- **The brand voice is `lib/marketing/brand-voice.md`**, a copy of
  `04-brand/voice/funded-capital-brand-voice.md` from the agent-system Drive, shipped with the route
  by `outputFileTracingIncludes`. **Two copies now — update both**, or the cron and the Claude
  skills drift apart.
- **LinkedIn caption** (migration 0012, `content_requests.linkedin_caption`). A cron cannot leave a
  Gmail draft, so the caption is posted with the carousel (`{ id, carouselSpec?, linkedinCaption? }`,
  no status) and shown on `/crm/marketing` under "LinkedIn caption".
- **Secrets:** `CRON_SECRET` (made by `fc-cron-setup.bat`, kept in git-ignored `.cron-secret`) and
  `ANTHROPIC_API_KEY`, both Production-only in Vercel. The key is read by this one route and never
  reaches a browser. `fc-run-daily-blog.bat` runs it on demand with `?force=1`.
- **What it does NOT do:** tell anyone when it fails, beyond the failed row on `/crm/marketing` and
  Vercel's function logs. The cadence card is the backstop.
- `scripts/pull-drafts.mjs` now sets `process.exitCode` instead of calling `process.exit()`. On
  Windows, exiting while fetch's socket was closing crashed Node in libuv
  (`UV_HANDLE_CLOSING`, `src\win\async.c`), and the .bat reported "Nothing was changed" over a run
  that had written three drafts.

### Record cards (24 Sep 2026)

Click a borrower on `/crm`, a card on `/crm/board`, or a row on `/crm/dashboard` and a record card
slides in from the right: contact, loan and properties, next follow-up, **tasks**, deal notes,
documents (names and status only) and one activity timeline. Salesforce and HubSpot call this the
record page; here it is a drawer so the list behind it keeps its place.

- **The card is the URL:** `?open=<applicationId>` on whatever page you are on. It can be linked,
  survives a refresh, and Back closes it. The page function never awaits `searchParams` — the
  `RecordCardSlot` awaits it inside its own `<Suspense>`, which is the PPR rule above applied to a
  new input. Guard §8b checks every `/crm` page for this.
- **`lib/crm/record.server.ts` asserts staff itself** and reads everything in one `db.batch`, so a
  card costs one round trip to Neon. The Drive file id of a document never leaves that module.
- **Tasks are new: `crm_tasks`, migration 0010.** Title 1–200 characters, an optional due DATE (a New
  York calendar day, never in the past), done/undone, soft delete. Rules in `lib/crm/tasks.ts`.
  Tasks do not write to the activity timeline yet.
- **Every action the card calls takes `from`** and refreshes that one route; `setApplicationNotes`
  and `setContactField` gained the argument, so they no longer refresh a hard-coded route from
  whichever page they are called on. `/crm/contacts` joined `CRM_ROUTES` for that.
- **On the board, Enter opens the card and Space picks a card up.** A click within 250 ms of a drop
  is ignored, so letting go of a drag does not open a card. The card's stage menu asks before Funded
  and requires a lost reason like the board; the table's dropdown still does not.
- Opening a card re-renders the page it sits on, including its main query. If that ever feels slow,
  intercepting routes are the fix — a bigger change, not needed yet.

### LinkedIn carousels are drawn by the site (24 Sep 2026)

The daily blog task used to draw carousels with a Python script in its sandbox and upload PNGs to
Drive. The upload failed from the cloud, and every design change meant editing a script outside
this repo. Now the task sends only the **words** — a small JSON spec — and the site draws the
slides on request.

- **`POST /api/crm/content-queue` with `{ id, carouselSpec }` and no `status`** attaches a carousel
  to a drafted or published blog request, replacing any earlier one. It never changes the status,
  and sending it together with a status is refused (guard §9).
- **`lib/marketing/carousel.ts` refuses anything that would draw badly**, with a sentence the task
  can act on: text past the length that fits, too many rows, a missing source on a chart, and any
  character outside the Latin subset of Inter (arrows, the approx sign, check marks, emoji) — those
  render as blank boxes. The limits were set by rendering a deck with every field at its maximum
  and looking at it; change a font size in the renderer and re-run that check
  (`scripts/carousel-preview.tsx`).
- **`app/api/crm/carousel/[id]`** returns the PDF LinkedIn's document post takes, or `?slide=N` as a
  PNG. Two doors only: a staff session, or the queue token (so the task can look at what it made).
  Everyone else gets a 404. The route reads no table itself (guard §9).
- **The design lives in `lib/marketing/carousel.render.tsx`** (next/og, which ships with Next, plus
  `pdf-lib` for the PDF). Change it there and every carousel changes on the next push — including
  old ones, which are redrawn from their words.
- **Fonts and logos are read from `lib/marketing/carousel-assets/` at runtime**, which Vercel's
  file tracer cannot follow. `outputFileTracingIncludes` in `next.config.ts` ships them with the
  function; without it every slide fails with ENOENT in production only.
- Test a deck without the site:
  `npx tsx --conditions=react-server scripts/carousel-preview.tsx spec.json out-folder`.

### BiggerPockets leads reach Lending OS (24 Sep 2026)

Website leads have written straight into Postgres at submit time since 14 Sep (`lib/leads/record.ts`,
called from `/api/lead`). BiggerPockets leads did not: they arrive as emails, the Apps Script
BiggerPockets file handles them, and nothing sent them to the CRM, so every BP lead after the
14 Sep migration was missing from `/crm`.

- **`POST /api/crm/lead-intake`** takes parsed BP leads from the Apps Script. Same guard as
  `/api/crm/activity`: `CRM_SYNC_SECRET` in the body, constant-time, fails closed. Up to 50 leads
  per call, body capped before parsing; a bad lead is reported per-lead and never blocks the rest.
- **One lead is written once, ever.** The key is `bp:gmail:<Gmail message id>` on the lead's
  `form_submission` activity. That insert goes LAST in the `db.batch` with no on-conflict clause,
  so the unique index rolls back the whole lead on a repeat — no half-written application. A
  hand-typed sheet row with no message id gets a server-built fallback key; the caller can never
  supply its own.
- **Repeat enquirers reuse their contact**, exactly as `record.ts` does. A phone match is used only
  when there is no usable email AND exactly one contact holds that number.
- `apps-script/BiggerPocketsToLendingOS.gs` holds the Apps Script side: the live post (never throws,
  runs after the ack, alert and sheet row), `checkLendingOsConnection`, and
  `backfillBpLeadsToLendingOs` for the gap since 14 Sep (safe to run twice). **Save only, never
  Deploy** — the BP trigger runs saved code; the website form's web-app deployment must not move.
- Rules in `lib/leads/biggerpockets.ts` (137 tests); guards §10 pins the route's secret check and
  the tables it may write.

### Dashboard redesign (24 Sep 2026)

`/crm/dashboard` was rebuilt from an approved mockup. It supersedes parts of the Phase 3a notes
above: the page now has three small client pieces (queue tabs, the "More" menu, task checkboxes),
and its data comes from `lib/crm/dashboard.server.ts`, not `getDashboardApplications` (left in
`lib/db/queries.ts`, unused).

- **One round trip.** `getDashboardData(now)` asserts staff itself and sends the book and today's
  tasks in one `db.batch`. Every number on the page is computed by `lib/crm/dashboardView.ts`
  (pure, 128 tests) from that read and a single `now`.
- **New York time everywhere:** greeting, date line, month-to-date, Funded YTD, 12 Monday–Sunday
  weeks (DST-tested), tasks due today.
- **Dates use `submittedAt ?? createdAt`, never `created_at` alone.** The legacy import stamped
  `created_at` with the import day, so `created_at` would put the whole historic book into "last
  30 days".
- **Term sheets** use the first move into `term_sheet_issued`, falling back to the legacy
  `term_sheet_issued_at` column — the same pattern as the funded date.
- Charts are divs, no chart library and no client JS; each has a visually hidden table.
- The queue's "More" menu renders its contents only while open (page HTML 879 KB → 410 KB).
- `signedInUser` in `lib/crm/access.ts` caches Clerk's `currentUser()` per request so the greeting
  reuses the staff check's lookup. It is NOT a gate.
- Guard §8 scans every `.tsx` in `app/crm/dashboard` for action calls and requires `HERE`.
- The stage select in the dashboard queue's More menu confirms Funded and asks for a lost reason,
  like the board, table and record card (closed 24 Sep 2026).


### Component kit, ⌘K and pro tables (24 Sep 2026)

- **`components/ui/`** is the shared kit (shadcn/ui style, copied in, themed to the brand tokens):
  Button, Card, Badge/StageBadge, Tabs, fields, Dialog, DropdownMenu, Tooltip, EmptyState,
  Skeleton, StatCard, PageHeader, toast. `cn()` lives in `lib/utils.ts`. Read
  `components/ui/README.md` before building a new screen — new pages use the kit, not ad-hoc classes.
- **Contrast:** gold-700 on white is 4.05:1 and fails small text. The kit uses navy text with a gold
  underline/ring; gold is for fills, large type and focus rings.
- **⌘K / Ctrl K** (`components/workspace/CommandPalette.tsx`, `cmdk`, lazy-loaded on first use):
  page navigation for everyone; borrower/deal search for staff only, via `/api/crm/search`, which
  404s non-staff before any query, caps results, and treats `%` and `_` literally.
  `lib/crm/guards.ui.regress.ts` pins all of that and that no kit package reaches the public site.
- **Pipeline and Contacts run on TanStack Table v8** (`app/crm/DataTable.tsx`): column visibility and
  resizing, sticky header, row selection with bulk "Move stage" (through the same `setStage` /
  `markLost` and the same Funded/Lost questions, capped at 50 per run), CSV export with a
  formula-injection guard, saved views in localStorage (per browser). Pure logic in
  `lib/crm/tableView.ts`.
- New packages, all exact-pinned: `@tanstack/react-table` 8.21.3 (v9 is too new), `cmdk` 1.1.1,
  `clsx` 2.1.1, `tailwind-merge` 2.6.1 (v3 targets Tailwind 4).
- The Broker Workspace pages have not been moved onto the kit yet.

### Texting and calling through Quo (24 Sep 2026)

The record card can **Text** (compose panel) and **Call (opens Quo)** (a `tel:` link — Quo cannot
place calls by API). Calls and texts log themselves from Quo's webhooks.

- **The consent gate is in the executor.** `lib/comms/consent.ts` `canText()` requires an E.164
  phone, no opt-out, and consent at the CURRENT `CONSENT_VERSION`; the Quo client
  (`lib/comms/quo.server.ts`) will not send without the permit it returns. BiggerPockets leads have no
  SMS consent and cannot be texted — intended. Guard §11 pins the order (gate before send).
- **Outbox** (`outbound_messages`, migration 0011): a browser-generated idempotency key, unique, so a
  double click sends once. States queued → sending → sent → delivered, or failed / blocked. A
  timeout leaves `sending` and blocks retry for 15 minutes so a borrower is never texted twice; the
  delivery receipt settles it. Retry re-checks consent. The `sms_out` activity is written only when
  Quo accepts the message.
- **Webhook** `/api/webhooks/quo`: signature first (both Quo schemes; `QUO_WEBHOOK_SECRET`,
  comma-separated for rotation), then claim `webhook_events(provider, event_id)`, then cheap writes.
  Dedup keys on activities are Quo's own message/call ids. Unknown numbers are stored, not attached.
- **STOP is authoritative and one-way.** A whole-message STOP/UNSUBSCRIBE/etc. opts out every
  contact with that number. START does NOT re-subscribe — they must re-consent on the website form.
  Opt-out wording inside a longer message is flagged, not applied.
- **Awaiting reply** on the dashboard now counts inbound texts (`sms_in`) as well as email.
- Open: quiet hours (TCPA 8am–9pm; Florida FTSA 8am–8pm) are not enforced — counsel question;
  `webhook_events` keeps full payloads with no purge yet; `call` activities carry no direction.

### Contacts showed 0 deals and "never" for everyone (fixed 24 Sep 2026)

**Drizzle writes a column in a single-table SELECT list without its table name.** `${contacts.id}`
inside a correlated subquery in `.select({...}).from(contacts)` came out as a bare `"id"`, and
Postgres resolves a bare name to the INNER table first — so `p.contact_id = "id"` compared a
participant with itself. Every row on `/crm/contacts` said 0 deals and "never" contacted, and the
header said "0 have had a deal". It ran, returned numbers, and every number was wrong.

- The same column inside a WHERE clause IS qualified, which is why "Never contacted" on `/crm` was
  right. Only the select list does this.
- `lib/db/contactSubqueries.ts` writes `"contacts"."id"` out by hand; `contactSubqueries.regress.ts`
  renders the real query with `drizzle.mock()` (no connection) and fails on a bare `"id"`.
  Negative-tested, and checked on Postgres 16: old SQL 0 deals / 0 contacted, new 9 / 8 on the
  same seed.
- **Rule:** a correlated subquery in a select list names the outer table explicitly. Never
  `${table.column}` there.

### Polish from the 24 Sep live check

- Pipeline rows were ~107px (a two-row notes box plus a two-line message in every row — six deals
  to a screen). The notes cell is now one line until focused (`InlineText compact`, still a
  textarea so line breaks survive) and the borrower's message is one truncated line.
- ⌘K dropped the first keys typed while its code was still loading. The palette chunk now
  prefetches when the page is idle, and keys typed before the input exists are kept and handed to
  it (`takeEarlyKeys` in `WorkspaceNav.tsx`).
- The Text panel for someone who cannot be texted shows the reason and Close — no greyed-out box.

### Quo webhook: the first live test was refused (25 Sep 2026)

Quo's "Send Test Request" got `401 unauthorized`. The Vercel MCP still cannot read runtime logs,
so the reason was not visible from Cowork. Changes, all in `lib/comms/quoSignature.ts`:

- **The doc contradicts itself on the key.** Its Node example turns the decoded key into a
  "binary" string and hands that to `createHmac`, which re-encodes it as UTF-8, so any byte of 0x80
  or above becomes two bytes. Its Python example uses the raw bytes. The legacy scheme now tries
  both, plus the secret's own text, and the body with all whitespace removed (the doc's wording).
  Every candidate is still an exact HMAC under the configured secret. Tests §5, negative-tested.
- **A refusal now logs the check that failed, the scheme and the clock skew**, e.g.
  `[webhooks/quo] rejected: stale scheme=legacy skew=3600s`. Never the secret or the body.
  `no_secret` means the Vercel variable is missing or the deployment predates it.
- Quo's sample test event (`apiVersion v3`, with `media`) parses correctly — checked.

### Email from the record card, through Gmail (25 Sep 2026)

The record card has an **Email** button next to Text. It sends from the signed-in person's own
Gmail (`luis@fundedcapital.com`), adds their Gmail signature, lands in their Sent folder, and logs
`email_out` on the timeline. To the recipient it is identical to an email typed in Gmail — same
servers, same SPF/DKIM/DMARC (all three checked on 25 Sep: SPF includes Google and Klaviyo,
`google._domainkey` present, DMARC `p=quarantine`). No tracking pixel, no rewritten links.

- **Connect Gmail is one-time:** `/api/crm/google/connect` → Google → `/api/crm/google/callback`.
  Two scopes only: `gmail.send` and `gmail.settings.basic` (the signature lives in send-as
  settings). It cannot read the inbox — replies still reach the timeline through
  `apps-script/GmailSync.gs`. State + PKCE in a 10-minute httpOnly cookie; the callback refuses a
  Google account that is not the Lending OS sign-in address (`wrong-account`). Return paths are
  `/crm…` only (`safeReturnPath`). The result comes back as `?gmail=<status>`, which the card turns
  into a sentence and removes from the address bar.
- **The refresh token is encrypted at rest** (`lib/comms/tokenCrypto.ts`, AES-256-GCM, key
  `GMAIL_TOKEN_KEY` = 32 random bytes, base64, made by `fc-gmail-key.bat`). A database dump alone
  cannot send mail. Lose the key and the fix is a new key plus Connect Gmail again.
- **Tables (migration 0013):** `mail_connections` (one row per mailbox, unique on lower(email);
  `last_error` set when Google revokes the grant, so the card says Reconnect) and `outbound_emails`
  (the outbox — separate from `outbound_messages` so texting code never sees email rows).
- **Executor** `lib/comms/emailOutbox.server.ts`, reached only from `app/crm/emailActions.ts`:
  draft rules → idempotency replay → own mailbox (sender from Clerk, never the request) →
  `canEmail()` on a fresh read (a Klaviyo unsubscribe mirrored in BLOCKS; only the person can undo
  it) → `sending` row → access token → signature (no signature read = not sent) → Gmail → `sent` +
  activity in one `db.batch`. Timeout = outcome unknown: "check your Sent folder", key kept.
- **The activity key is `gmailDedupKey(id, recipient)`** — the same key `GmailSync.gs` writes when
  it later finds the message in Sent, so the two never double up.
- **Subjects never carry HTML entities** (`parseEmailDraft` refuses `&amp;` etc. — the 3 Sep
  incident), and a line break in a header is refused twice (draft rules and `buildMime`).
- **Templates** (`lib/crm/emailTemplates.ts`): blank, first reply, follow-up, request documents,
  term-sheet follow-up. Starting points — the box is editable. Tests refuse rates, amounts,
  percentages, guarantee/approval language and homebuyer language in any template.
- Guard §13 pins: gate before Gmail, one send call, sender from Clerk, the Google client
  logs nothing and reads no table, the token is encrypted before storage, both OAuth routes check
  staff first, state before code exchange, account match before storing, and no other file talks to
  Gmail or Google's token endpoint. `mailbox.server.ts` is staff-only (§3).
- Env (Production): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GMAIL_TOKEN_KEY`. The
  Google Cloud OAuth client is "Internal" (Workspace users only) with redirect URIs
  `https://www.fundedcapital.com/api/crm/google/callback` and the non-www twin.
- **Not built yet:** replying inside an existing Gmail thread (every send starts a new thread),
  attachments, scheduling, and showing failed/unknown email attempts on the timeline (they are in
  `outbound_emails` and the panel says so at the time).

### Reports (`/crm/reports`, 26 Sep 2026)

How the lead engine is performing over a period picked from links (30 days, 90 days — the default —
year to date, 12 months, all time; `?range=`). Six headline numbers, new leads per week or month
stacked by source, a lead → contacted → term sheet → signed → funded funnel, speed to first contact,
a source comparison table, loan types requested and lost reasons.

- **Cohort vs activity, never mixed.** Cohort figures follow the leads that ARRIVED in the period to
  wherever they got (contact rate, speed, funnel, source table, loan types). Activity figures count
  what HAPPENED in the period (term sheets issued, funded, lost). Dividing one by the other gives
  conversion rates above 100%; `reports.regress.ts` §3 pins that it cannot happen.
- **First contact** = the first `email_out`, `sms_out` or `call` on or after arrival (5-minute grace).
  Calls have no direction yet, so a call the borrower placed counts too — the page says so.
- **Reached a stage** = its dated history (first move into the stage, else the legacy column), else
  its current position — except `closed_lost`, whose position says nothing about how far it got.
- `lib/crm/reports.ts` (pure, 65 tests, negative-tested) · `lib/crm/reports.server.ts` (staff-only,
  one query, no names or emails selected, same LATERAL one-contact-per-deal join as the pipeline —
  checked on Postgres 16) · `app/crm/reports/*`. The request-dependent part lives in
  `ReportsContent.tsx` so `searchParams` is awaited inside the page's `<Suspense>` (guard §8b).
- **Zero client JavaScript**: div charts, native `title` tooltips, link-based period picker, a hidden
  table per chart. Phone layout checked at 390px (bars go under their labels).
- **Source colours are now shared tokens** in `tailwind.config.ts` (`chart-website`, `chart-bp`,
  `chart-broker`, `chart-other`), validated with the data-viz palette checker (lightness, chroma,
  colour-blind separation all pass; two sit under 3:1 on white, so numbers are always printed and
  every chart has a table). The dashboard's "Where leads came from" uses the same four.
- Next on the roadmap (project doc `claude/lending-os-roadmap.md`): lead nurturing — Gmail follow-up
  sequences for warm leads, Klaviyo campaigns for old ones, auto-stop on reply.

### Lead nurturing through Klaviyo (`/crm/nurture`, 26 Sep 2026)

Klaviyo is the system of record for marketing email (ActiveCampaign is no longer used). **Lending OS
decides WHO; Klaviyo decides WHAT and WHEN.** Five programmes, each a Klaviyo list created for Lending
OS alone — Quiet leads `Yq4vxf`, BiggerPockets no term sheet `VYBzq9`, Lost deals `SW9AEq`, Past
borrowers `WwZmFn`, Investor contacts `S2b2zL`. A Klaviyo flow per list ("Added to list" trigger, flow filter "is in list <that
list>") sends the emails. Nobody should add people to those lists by hand.

- **Rules are pure and tested** (`lib/nurture/nurture.ts`, `nurture.regress.ts`, 95 tests,
  mutation-tested): one programme per person at a time and never the same one twice; nobody in touch
  either way in the last 30 days (Luis's threshold); nobody with a deal from term sheet to closing;
  no brokers, no `@fundedcapital.com`, no not-our-product / duplicate / spam; unsubscribed never.
  Priority: past borrower → BiggerPockets → quiet → lost.
- **Investor contacts (added 26 Sep 2026, migration 0015)** is the ~600 contacts with NO deal — the
  old spreadsheet's aged-prospect pool, which the first version silently left out (the live page
  showed 3 quiet leads). Same 30-day quiet rule, measured from the contact's "Date Added"; brokers
  (by contact lead source) excluded. Luis called the pool "a mix", so this programme's Ready list
  starts UNTICKED (`Program.preselect = false`) and has a search box and a note line (date added +
  tags) for reviewing. Its first email (`QNvVvW`) does not claim they asked about a loan, and the
  shared emails' footers now say "you're in Funded Capital's contacts".
- **Luis reviews, then enrols** (`app/crm/nurture/actions.ts`). The server re-reads and re-classifies
  every chosen person before inserting, so a stale page cannot enrol someone who just wrote in.
  `ON CONFLICT DO NOTHING` over two unique indexes (contact + programme; one active per contact)
  makes double clicks harmless. Enrol and stop each write an `automation` activity on the timeline.
- **Auto-stop** (`lib/nurture/sync.server.ts`, cron every 15 min, `/api/cron/nurture`, CRON_SECRET):
  a reply (email_in/sms_in), a new enquiry, a forward stage move (a move INTO closed_lost does not
  count), Luis reaching out himself, or an unsubscribe → stopped and removed from the list. Stops run
  BEFORE any Klaviyo call.
- **Consent flows in only.** The sync reads each list back with consent: UNSUBSCRIBED / spam
  complaint / user-suppressed → `contacts.email_subscribed = false` (never true — guard §14), which
  also blocks the record card's Email button; a bounce stops the row without touching consent. The
  Klaviyo client (`lib/comms/klaviyo.server.ts`) has no subscribe or unsuppress call and sends no
  phone number and no consent field; adding to a list does not change Klaviyo consent. Klaviyo emails
  "never subscribed" profiles who are not suppressed, and adds the unsubscribe link and our address.
- **Outbox in the row**: `nurture_enrollments` (migration 0014) carries `sync_state`
  (pending_add → added, pending_remove → removed), a 5-minute claim lease, backoff to 6 h, and gives
  up after 8 tries with a "Try again" button. A 409 from Klaviyo's profile import uses the existing
  profile Klaviyo names. `after()` drains right after a click; the cron is the backstop.
- **Widening a CHECK needs a drop + re-add**, which `fc-migrate-prod.bat` used to refuse along
  with every other DROP. `scripts/migration-safety.mjs` (tested by `migration-safety.regress.ts`,
  mutation-tested) now allows exactly one form: `ALTER TABLE "t" DROP CONSTRAINT IF EXISTS
  "x_check"` when the SAME file also runs `ADD CONSTRAINT "x_check" CHECK (…)` on the same table.
  Every other DROP is still refused. Because every migration re-runs on every migrate, 0015 reports
  "2 applied" each time — harmless.
- **Arrival for legacy rows** is the contact's sheet date, not the import day, or every legacy lead
  would look "recent" until mid-October.
- **Verified on Postgres 16** with Klaviyo faked at `fetch` (44 checks: who qualifies, concurrency,
  auto-stop, consent mirror, bounce, removed-by-hand, backoff, retry, no key). Harness note: in
  `@neondatabase/serverless` a batch's PER-QUERY `arrayMode` wins over the transaction's — a fake
  client that lets the transaction's win turns every raw `db.execute` in a `db.batch` into arrays.
- **Env**: `KLAVIYO_PRIVATE_KEY` (Production; scopes profiles:read/write, lists:read/write). Without
  it the page works, enrolments queue, and nothing is sent to Klaviyo.
- **Email templates** in Klaviyo (plain, from Luis, no rates, compliance line where a speed or
  leverage claim is made): Quiet 1 `W6rzMJ`, BiggerPockets 1 `S2pwJL`, Lost 1 `TDyTyt`, Past 1
  `X9Mqe3`, Past 2 `Ws97g2`, Investor contacts 1 `QNvVvW`, shared 2 `WJ3SsH` / 3 `RNwKR7` / 4 `XDyWip`. Plain-text unsubscribe tag
  is `{% unsubscribe_link %}` (`unsubscribe_url` fails to render).
- **Not built yet:** Gmail follow-up sequences for warm leads (track A), automatic daily enrolment,
  mirroring unsubscribes for people who were never enrolled, nurture results on /crm/reports.

