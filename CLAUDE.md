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
route does not advertise itself. The broker portal has open sign-up, so "any Clerk user" includes
every registered broker — gating on `userId` alone would expose the whole borrower book. Every new
`/crm` page and **every server action** carries its own check: an action is an addressable endpoint
and a guard on the page does not cover it.


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

---

## Known quirks — check here before debugging

- **Never write `export const dynamic = "force-dynamic"`.** `next.config.ts` sets
  `cacheComponents: true` (Next 16 Partial Prerendering), and any route segment config is a hard
  build error: *"Route segment config \"dynamic\" is not compatible with
  `nextConfig.cacheComponents`"*. The replacement is structural — keep the page a static shell and
  put everything that reads live data inside a `<Suspense>` boundary, which makes that subtree
  dynamic on its own. `app/crm/page.tsx` is the reference. This does not show up in `npm run
  typecheck`; only the production build catches it.
- **`db.transaction()` does not work.** `lib/db` uses Drizzle's `neon-http` driver, which talks to
  Postgres over HTTP and throws `No transactions support in neon-http driver` at runtime. It
  compiles and builds clean, so nothing catches it until the first write. Use **`db.batch([...])`**
  — it sends the statements in one request inside a real Postgres transaction. Anything that must
  commit together (a `stage_transitions` row and the `applications.stage` cache, above all) goes
  through `db.batch`.
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
