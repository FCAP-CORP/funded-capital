# Lending OS — architecture reference

The custom CRM replacing the Sheets CRM, the hourly triage tasks, and the manual drips.
Decided 2026-09-14. This file is the in-repo source of truth; keep it current as the build proceeds.

---

## Scope boundary

**In Postgres:** contacts, entities, applications, participants, properties, loans, draws,
conditions, activities, stage transitions, partners, workflow state, campaign stats.

**Not in Postgres:** borrower documents. Tax returns, bank statements, IDs and closing packages keep
flowing to Drive intake exactly as they do today. The `documents` table stores metadata only — name,
type, requested/received/expires dates, and the Drive file ID.

This keeps the portal a pipe for files and bounds the GLBA Safeguards surface. Changing it is a
deliberate decision with compliance consequences, not a refactor.

---

## Core objects

| Object | Holds |
|---|---|
| `contacts` | People. Name, email, phone (E.164), source, owner, consent state, verified deal count |
| `entities` | Borrowing LLCs and their relationship to contacts — one person, many disposable entities |
| `applications` | **The container.** Stage, product, channel, owner, term-sheet dates, decision timestamps |
| `participants` | Join of contact → application with a role: borrower, guarantor, co-borrower, UBO |
| `properties` | Collateral. Address, type, units, as-is value, ARV with source and date, lien position |
| `loans` | Funded paper. Rate, points, term, initial advance, holdback, maturity, exit strategy |
| `draws` | Construction draw line items with inspection, approval chain, disbursement, status |
| `conditions` | Underwriting conditions with `is_borrower_facing`, `cleared_at`, `cleared_by` |
| `documents` | Metadata + Drive file ID only |
| `activities` | Append-only. Every email, call, SMS, note, field change, automation event |
| `stage_transitions` | Append-only stage history |
| `partners` | Brokers and referral sources with submitted/funded/pull-through attribution |
| `campaign_stats` | Nightly pull of Klaviyo campaign and flow performance |

### Why the application is the container

Not the borrower, and not the loan. Participants attach to an application *with a role*, and the same
person can appear in multiple concurrent applications under different roles.

Modelling the borrower as the container is the documented flaw in Mortgage Automator — stored
profiles auto-generate income and debts onto new applications that cannot be edited, and income
sticks to one file when a client has several. Funded Capital's clients are repeat investors running
per-project LLCs. Any other model breaks immediately.

**The entity is where the deed lives; the person is where the track record lives.** Store
`claimed_deals` and `verified_deals` as separate fields with the verification method — borrowers
inflate their role, and the deals that would change an underwriting decision are by definition the
ones least likely to appear on an application.

### Hard-money fields no generic CRM has

Store all three leverage ratios computed simultaneously and flag which one binds:

- `ltc` — loan ÷ (purchase + rehab), typically capped ~90%
- `ltarv` — loan ÷ ARV, typically capped ~70%
- `ltv` — loan ÷ as-is value

The binding constraint is whichever is most conservative.

**ARV is the highest-risk field in the system** and the primary loss source when overstated. Model it
as a value plus a source, a date, a comp-set reference, and a stressed figure at 5–10% down — never a
single number someone typed.

---

## Pipeline stages

```
Origination    01 Lead → 02 Qualified → 03 Term Sheet Issued* → 04 Term Sheet Signed*
Underwriting   05 Application In → 06 Underwriting → 07 Conditional Approval* → 08 Conditions Clearing
Closing        09 Clear to Close* → 10 Docs Out → 11 Funded*
Servicing      12 Active → 13 Draw Cycle (loops) → 14 Payoff / Extension
```

`*` marks a gate — a stage whose entry is a measurable conversion event.

**Stage is derived from data state, never a dropdown.** Setting a term-sheet signature date moves the
deal; clearing the last condition moves the deal. A pipeline maintained by memory reports fiction.

Two stages carry weight the conventional mortgage lifecycle lacks. **Term Sheet Issued → Signed** is
the hard-money analogue of the rate lock and where true conversion measurement lives. **Conditions
Clearing** exists as a stage because most stalled files are stalled conditions — if conditions are not
objects, you cannot see why a deal is stuck.

Never compute funnel metrics from the mutable `stage` column. All history lives in
`stage_transitions`, which must exist from the first pipeline commit rather than be retrofitted.

---

## Automation engine

### A delay is a timestamp, not a sleeping process

Every workflow enrollment carries a `wake_at` column. A tick claims due rows and executes exactly one
step, always finishing in seconds — well inside Vercel's 300s function cap.

```sql
CREATE INDEX ON workflow_enrollments (wake_at)
  WHERE state = 'active' AND wake_at IS NOT NULL;

UPDATE workflow_enrollments SET state = 'running', claimed_at = now()
WHERE id IN (
  SELECT id FROM workflow_enrollments
  WHERE state = 'active' AND wake_at <= now()
  ORDER BY wake_at LIMIT 100
  FOR UPDATE SKIP LOCKED
) RETURNING *;
```

A job parked for fourteen days cannot be edited, cancelled, re-targeted or inspected, and hosted
runners cap free-tier sleep at seven days. With `wake_at`, delays are free, unbounded, editable,
cancellable, and visible in our own UI — we can see every contact waiting in a sequence and why.

### Tables

```
workflows              id, name, object_type, status, current_version_id, created_by
workflow_versions      id, workflow_id, version_no, definition jsonb, published_at
workflow_enrollments   id, workflow_id, version_id, subject_type, subject_id, state,
                       enrolled_at, exited_at, exit_reason, current_step_id, wake_at, context jsonb
                       UNIQUE (workflow_id, subject_id) WHERE state = 'active'
workflow_runs          id, enrollment_id, started_at, finished_at, status, error
workflow_step_runs     id, run_id, step_id, status, input jsonb, output jsonb, error
workflow_events        id, workflow_id, subject_id, kind, payload, created_at
```

Definitions are **versioned JSONB**, and each enrollment executes against the version it started on,
so editing a live workflow cannot corrupt in-flight records. The partial unique index *is* the
enroll-once rule. A step is `{ id, type, config, next, branches? }` — linear with branches, not a free
node graph; that covers ~95% of CRM automation at a fraction of the complexity.

Queue is **pg-boss in the same Postgres**, so a step execution and its audit row commit in one
transaction. No extra vendor, no per-run cost, no delay ceiling.

### Five features that are requirements, not polish

1. **Dry run** — execute a real record with side effects short-circuited and show what it *would* have done.
2. **Enrollment preview** — before publishing, show "N records match" and force a choice between enrolling existing matches and future events only. This is what stops a CSV import texting 400 borrowers.
3. **Rate guard** — hard cap on enrollments per hour, overflow parked and surfaced, never silently dropped.
4. **Run viewer** — every step's input, output and error, with single-step retry. Silent failure is the universal complaint against every incumbent builder.
5. **Consent gate** — any outbound SMS step reads `CONSENT_VERSION` from `lib/consent.ts` and hard-fails if the contact has no consent at the current version. Enforced in the executor, not the definition, so it cannot be configured away.

**Do not build a node-graph canvas.** A vertical stack of cards with indented branches is what the
easiest-to-use builders ship, and it is plain React plus dnd-kit.

---

## Integrations

The CRM owns identity. **Consent flows inbound only.**

| Field class | Authority | Direction |
|---|---|---|
| Identity — name, entity, contact UUID | CRM | CRM → Klaviyo, Quo |
| Pipeline — stage, loan terms, property | CRM | never leaves |
| Email engagement — opens, clicks, campaign membership | Klaviyo | Klaviyo → CRM |
| Email subscription & suppression | **Klaviyo** | Klaviyo → CRM only |
| SMS consent, STOP / opt-out | **Quo** + consent log | Quo → CRM only |
| Call and SMS history, transcripts | Quo | Quo → CRM |
| Documents | Drive | Drive ↔ metadata ref |

Code that lets the CRM re-subscribe a suppressed profile is a compliance incident, not a bug.

**Klaviyo:** set `external_id` to the CRM contact UUID on every profile, always — it is the
highest-ranked identifier we control. Always send email and phone in the same payload; Klaviyo merges
on co-occurrence, and splitting them across calls is what creates duplicates.

**Webhooks:** dedupe on the provider's own event ID, claimed atomically with
`INSERT … ON CONFLICT DO NOTHING RETURNING id`. Never hash the body — re-serialising JSON reorders
keys. Return 200 for duplicates; an error response just schedules more of them. Guard the
crash-after-claim case with a `status` column so a mid-processing crash does not swallow the event.
Quo's handler timeout is 10 seconds: verify, claim, enqueue, return 200, do the work off the request.

**Outbound:** transactional outbox. Write the intent in the same transaction as the CRM mutation and
let a worker deliver it with a forwarded idempotency key. Never call Klaviyo or Quo inline from a
request handler.

---

## Build order

Each phase ends at something usable.

1. **Spine** — Neon, schema, `/api/lead` writing direct, Sheets migration, editable table view with Excel paste.
2. **Pipeline & record** — stage model + `stage_transitions`, unified activity timeline, saved views as rows, kanban, Cmd+K.
3. **Automation engine** — `wake_at`, pg-boss, versioned definitions, builder, and the five guardrails.
4. **Two-way sync** — Klaviyo, Quo webhooks, Gmail association, outbox, webhook dedup.
5. **KPIs** — SQL views for funnel, cohort, first-touch and linear attribution; nightly Klaviyo pull; goals.
6. **Servicing views** — draws, maturity ladder, LTC/LTARV distribution against caps, partner leaderboards.

Phase 6 is the one with a question mark. Payments, ACH, amortisation, 1098/1099 and investor
distributions are regulated, high-consequence and zero differentiation — buying that layer later is
the expected outcome, so keep the API boundary clean.

---

## Scheduled tasks this replaces

| Task | Verdict |
|---|---|
| `website-lead-triage` (hourly :25) | Retire — Phase 1 |
| `biggerpockets-lead-triage` (hourly :55) | Retire — Phase 1 |
| `website-lead-drip` (daily) | Retire — Phase 3, belongs in a Klaviyo flow |
| `biggerpockets-daily-drip` (daily) | Retire — Phase 3, belongs in a Klaviyo flow |
| Daily lead pipeline & spam health check | Keep — periodic observation, no triggering event |
| `lead-flow-watchdog` | **Fix now** — searches for a subject line and honeypot that never existed |
| Weekly investor newsletter draft | Keep |

A cron fires once at a fixed UTC time for everybody. A Klaviyo flow starts per contact from the moment
they enter, with quiet hours, exit-on-reply, unsubscribe handling and per-step reporting. That is a
capability gap, not a preference.

---

## Open decisions

- Klaviyo vs ActiveCampaign as system of record. Both are connected and paid; Klaviyo holds the lists, templates and newsletter tooling.
- Seat count and roles — building multi-role access now is nearly free; retrofitting it is not.
- Whether the broker portal merges in, so brokers submit deals that land directly as applications.
- What the Sheets CRM actually contains. Industry migration shortfall rates run 30–83%; this is the least-estimated line in the project.
- Whether servicing stays in-portal or moves to a vendor within a year.

---

## Compliance

Storing borrower NPI makes Funded Capital a covered institution under the GLBA Safeguards Rule even
with documents in Drive. Budget these as build scope rather than discovering them during an incident:
**encryption at rest, MFA, network monitoring, staff training.** Neon encrypts at rest by default and
Clerk handles MFA; the rest is process.

Two questions belong with counsel, not with Claude: whether Funded Capital sits under the
fewer-than-5,000-consumer partial exemption, and whether business-purpose loans to investor entities
are consumer relationships at all. The answer determines whether a written risk assessment, incident
response plan and annual board report are owed.
