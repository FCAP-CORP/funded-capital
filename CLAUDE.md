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
  — unused from the first migration until 24 Sep 2026 — and the transition's `reason`. The table's
  stage dropdown can still close a deal without a reason; that gap is known. Only the seven fields a
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
and research skills that already exist, and writes back where the draft is. Nothing in the Next.js
app calls a model — one definition of the voice rather than two, and no model API key in a
public-facing service.

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
