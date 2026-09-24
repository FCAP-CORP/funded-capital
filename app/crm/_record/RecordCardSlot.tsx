import {
  ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Bot, Building2, CalendarClock, Clock, FileText, FolderOpen,
  History, Landmark, ListTodo, Mail, MessageSquare, PencilLine, Phone, Quote, StickyNote, TriangleAlert,
  UserRound, Users,
} from "lucide-react";
import { isCrmStaff } from "@/lib/crm/access";
import { getRecordCard, type RecordCardData, type RecordProperty } from "@/lib/crm/record.server";
import {
  DOC_STATUS_LABEL,
  ROLE_LABEL,
  addressLine,
  buildTimeline,
  docStatus,
  emailConsent,
  loanPurposeLabel,
  ratioText,
  smsConsent,
  stageAge,
  stageLabel,
  telHref,
  whenLabel,
  type ConsentTone,
  type TimelineItem,
} from "@/lib/crm/record";
import { arrangeTasks, dueLabel, nyToday, taskState } from "@/lib/crm/tasks";
import { nyDayLabel } from "@/lib/crm/queueView";
import { STALE_DAYS } from "@/lib/crm/board";
import { GATE_STAGES, PRODUCT_LABEL, SOURCE_LABEL, ageLabel, displayPhone, label, money, shortDate } from "@/lib/crm/view";
import { CONSENT_VERSION } from "@/lib/consent";
import { canText } from "@/lib/comms/consent";
import { TIMELINE_TEXT_PREVIEW } from "@/lib/crm/record";
import type { CrmRoute } from "../actions";
import RecordDrawer from "./RecordDrawer";
import {
  ContactField, DealNotes, FollowUp, QuickActions, RetryTextButton, TaskPanel, type TaskView, type TextGateView,
} from "./RecordControls";

/**
 * The record card: one deal, everything about it, over the page you were on.
 *
 * WHERE IT RENDERS. Each page that can open a card (Pipeline, Board, Dashboard)
 * puts this inside its OWN <Suspense> and hands it the page's `searchParams`
 * promise. `searchParams` is request data, and under `cacheComponents: true`
 * reading it outside a boundary fails the production build — see CLAUDE.md,
 * "await params must happen INSIDE the <Suspense> boundary". So it is awaited
 * here, inside, and nowhere else. The page shell stays prerendered.
 *
 * THE PAGE'S ROUTE COMES WITH IT. `from` is the opening page's HERE constant.
 * Every button on the card passes it back to its server action, so an action
 * taken on the card refreshes the page the card is open on and no other — the
 * cross-route refresh that once froze /crm on its loading shell cannot happen
 * from here. guards.regress.ts §8 checks each page passes its own route.
 *
 * PERFORMANCE. The whole card is server-rendered HTML. The browser receives the
 * drawer shell and the handful of buttons in RecordControls.tsx — a few KB, all
 * already shared with the dashboard and the grid (Editable, queueView, lucide).
 * One database round trip feeds every section (lib/crm/record.server.ts).
 * Nothing about a closed card costs anything: with no `?open=` the slot
 * returns null before touching Clerk or the database.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RecordCardSlot({ searchParams, from }: { searchParams: SearchParams; from: CrmRoute }) {
  const params = await searchParams;
  const raw = params.open;
  const id = typeof raw === "string" ? raw.trim() : null;
  if (!id) return null;

  // The page and layout have already refused non-staff; this is the card's own
  // check, and getRecordCard asserts a third time for itself.
  if (!(await isCrmStaff())) return null;

  const card = await getRecordCard(id);
  if (!card) {
    return (
      <RecordDrawer key={id} title="Record not found">
        <div className="px-5 py-6 text-sm text-slate-600">
          <p>There is no deal at this link. It may have been removed, or the link was copied incompletely.</p>
        </div>
      </RecordDrawer>
    );
  }
  return <Card key={card.app.id} card={card} from={from} />;
}

/* ---------------------------------------------------------------- pieces */

function Section({
  title, icon: Icon, children, aside,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="border-b border-slate-100 px-5 py-5 last:border-0">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          <Icon className="h-3.5 w-3.5 text-gold-600" aria-hidden />
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ name, children, wide = false }: { name: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-[11px] font-medium text-slate-500">{name}</dt>
      <dd className="mt-0.5 break-words text-sm text-navy-900">{children}</dd>
    </div>
  );
}

const Dash = () => <span className="text-slate-300">—</span>;

/** Only the fields that have something in them — an empty field is noise on a card. */
function has(v: unknown): boolean {
  return v !== null && v !== undefined && v !== "";
}

const CONSENT_TONE: Record<ConsentTone, string> = {
  ok: "text-emerald-700",
  warn: "text-amber-700",
  none: "text-slate-500",
};

const badge = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset";

/* ------------------------------------------------------------------ card */

function Card({ card, from }: { card: RecordCardData; from: CrmRoute }) {
  const now = new Date();
  const { app, contact } = card;
  const name = contact?.name ?? "(unlinked application)";
  const age = stageAge(app.stage, app.stageEnteredAt, now);
  const purpose = loanPurposeLabel(app.loanPurpose);
  const tel = telHref(contact?.phone);

  const tasks = arrangeTasks(card.tasks, now);
  const view = (t: (typeof card.tasks)[number]): TaskView => ({
    id: t.id,
    title: t.title,
    due: dueLabel(t.dueOn, now),
    state: taskState(t, now),
  });

  const timeline = buildTimeline(
    card.activities,
    card.transitions,
    { totalActivities: card.totalActivities, totalTransitions: card.totalTransitions },
    undefined,
    { outbound: card.outbound, now },
  );

  // For DISPLAY: the executor runs the same gate again, on a fresh read, when
  // Send is pressed. See lib/comms/outbox.server.ts.
  const gate = canText(contact, { currentVersion: CONSENT_VERSION });
  const textGate: TextGateView = gate.ok
    ? { ok: true, detail: `Text consent on file — current wording (${gate.consentVersion}), given ${shortDate(gate.consentAt)}.` }
    : { ok: false, reason: gate.reason };

  const followUpAt = app.nextActionAt ? new Date(app.nextActionAt) : null;
  const followUpPast = followUpAt !== null && followUpAt.getTime() <= now.getTime();

  const badges = (
    <>
      <span
        className={`${badge} ${GATE_STAGES.has(app.stage) ? "bg-gold-400/15 text-gold-400 ring-gold-400/40" : "bg-navy-800 text-slate-100 ring-navy-700"}`}
      >
        {stageLabel(app.stage)}
      </span>
      <span className={`${badge} bg-navy-800 text-white ring-navy-700 tabular-nums`}>
        {has(app.requestedAmount) ? money(app.requestedAmount) : "No amount"}
      </span>
      <span className={`${badge} bg-navy-800 text-slate-200 ring-navy-700`}>
        {label(PRODUCT_LABEL, app.product)}
        {purpose && <span className="font-normal text-slate-400">· {purpose}</span>}
        {app.isPortfolio && <span className="font-normal text-slate-400">· Portfolio</span>}
      </span>
      <span className={`${badge} bg-navy-800 text-slate-200 ring-navy-700`} title="Days in this stage">
        <Clock className="h-3 w-3" aria-hidden />
        {age.days === null ? "—" : ageLabel(age.days)} in stage
      </span>
      {age.stale && (
        <span className={`${badge} bg-amber-400/15 text-amber-200 ring-amber-400/40`}>
          <TriangleAlert className="h-3 w-3" aria-hidden />
          Stale — {STALE_DAYS}+ days
        </span>
      )}
    </>
  );

  const contactLine = contact && (contact.email || contact.phone) ? (
    <span className="flex flex-wrap gap-x-4 gap-y-1">
      {contact.email && (
        <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 hover:text-gold-400 hover:underline underline-offset-2">
          <Mail className="h-3.5 w-3.5" aria-hidden /> {contact.email}
        </a>
      )}
      {contact.phone && (tel ? (
        <a href={tel} className="inline-flex items-center gap-1.5 hover:text-gold-400 hover:underline underline-offset-2">
          <Phone className="h-3.5 w-3.5" aria-hidden /> {displayPhone(contact.phone)}
        </a>
      ) : (
        <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" aria-hidden /> {contact.phone}</span>
      ))}
    </span>
  ) : null;

  const sms = contact ? smsConsent(contact, CONSENT_VERSION) : null;
  const email = contact ? emailConsent(contact.emailSubscribed) : null;
  // The first participant row IS the named contact (same ordering as the
  // query). Everyone after it — including the named contact's second role, if
  // they are the broker on their own deal — is listed under "Also on this deal".
  const others = card.participants.slice(1);

  return (
    <RecordDrawer title={name} badges={badges} contactLine={contactLine}>
      {/* ------------------------------------------------ quick actions */}
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
        <QuickActions applicationId={app.id} name={name} stage={app.stage} tel={tel} textGate={textGate} from={from} />
        <p className="mt-2 text-[11px] text-slate-500">
          Text sends a real message through Quo. Call opens Quo and logs itself when the call ends. Log… records
          something you already did elsewhere — it does not call, email or text anyone.
        </p>
      </div>

      {/* ------------------------------------------------ next follow-up */}
      <Section title="Next follow-up" icon={CalendarClock}>
        {followUpAt ? (
          <p className="mb-2 text-sm text-navy-900">
            <span className={`font-semibold ${followUpPast ? "text-amber-700" : ""}`}>
              {followUpPast ? "Due since " : ""}{nyDayLabel(followUpAt, now)}
            </span>
            {app.nextActionNote && <span className="text-slate-600"> — {app.nextActionNote}</span>}
          </p>
        ) : (
          <p className="mb-2 text-sm text-slate-500">None set. Setting one takes it off the dashboard queue until that day.</p>
        )}
        <FollowUp applicationId={app.id} name={name} hasFollowUp={followUpAt !== null} from={from} />
      </Section>

      {/* ------------------------------------------------ tasks */}
      <Section
        title="Tasks"
        icon={ListTodo}
        aside={
          tasks.overdue > 0 ? (
            <span className="text-[11px] font-semibold text-red-700">{tasks.overdue} overdue</span>
          ) : tasks.open.length > 0 ? (
            <span className="text-[11px] text-slate-500">{tasks.open.length} open</span>
          ) : null
        }
      >
        <TaskPanel
          applicationId={app.id}
          open={tasks.open.map(view)}
          done={tasks.done.map(view)}
          hiddenDone={tasks.hiddenDone}
          today={nyToday(now)}
          from={from}
        />
      </Section>

      {/* ------------------------------------------------ contact */}
      <Section title="Contact" icon={UserRound}>
        {contact ? (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field name="Email">
                {contact.email ? <a href={`mailto:${contact.email}`} className="text-navy-900 underline decoration-slate-300 underline-offset-2 hover:decoration-gold-500">{contact.email}</a> : <Dash />}
              </Field>
              <Field name="Phone">
                {tel ? (
                  <a href={tel} className="text-navy-900 underline decoration-slate-300 underline-offset-2 hover:decoration-gold-500">{displayPhone(contact.phone)}</a>
                ) : contact.phone ?? contact.phoneRaw ?? <Dash />}
              </Field>
              {card.entity && (
                <Field name="Borrowing entity">
                  {card.entity.name}
                  {(card.entity.entityType || card.entity.formationState) && (
                    <span className="text-slate-500"> · {[card.entity.entityType, card.entity.formationState].filter(Boolean).join(", ")}</span>
                  )}
                </Field>
              )}
              <Field name="Source">
                {label(SOURCE_LABEL, app.leadSource)}
                {app.channel && <span className="text-slate-500"> · {app.channel}</span>}
              </Field>
              {card.broker && (
                <Field name="Submitted by broker" wide>
                  {card.broker.name ?? card.broker.email}
                  {card.broker.firmName && <span className="text-slate-500"> · {card.broker.firmName}</span>}
                  <span className="block text-xs text-slate-500">
                    <a href={`mailto:${card.broker.email}`} className="hover:text-gold-700 hover:underline">{card.broker.email}</a>
                    {card.broker.phone && telHref(card.broker.phone) && (
                      <> · <a href={telHref(card.broker.phone)!} className="hover:text-gold-700 hover:underline">{displayPhone(card.broker.phone)}</a></>
                    )}
                  </span>
                </Field>
              )}
              {(has(contact.claimedDeals) || has(contact.verifiedDeals)) && (
                <Field name="Track record">
                  {has(contact.claimedDeals) ? `${contact.claimedDeals} claimed` : "—"}
                  {has(contact.verifiedDeals) && <span className="text-slate-500"> · {contact.verifiedDeals} verified</span>}
                </Field>
              )}
              {contact.state && <Field name="State">{contact.state}</Field>}
              <Field name="Contact permission" wide>
                {/* Read-only: consent is mirrored in from Klaviyo and Quo, never set here. */}
                <span className={`block text-sm ${CONSENT_TONE[sms!.tone]}`}>{sms!.text}</span>
                <span className={`block text-sm ${CONSENT_TONE[email!.tone]}`}>{email!.text}</span>
              </Field>
            </dl>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
              <Field name="Target market">
                <ContactField contactId={contact.id} field="targetMarket" initial={contact.targetMarket} placeholder="Market…" from={from} />
              </Field>
              <Field name="Credit band">
                <ContactField contactId={contact.id} field="creditBand" initial={contact.creditBand} placeholder="e.g. 700–739" from={from} />
              </Field>
              <Field name="Owner">
                <ContactField contactId={contact.id} field="ownerName" initial={contact.ownerName} placeholder="Who works this person" from={from} />
              </Field>
              <Field name="Notes on the person" wide>
                <ContactField contactId={contact.id} field="notes" initial={contact.notes} placeholder="Add a note about them…" multiline from={from} />
              </Field>
            </dl>

            {others.length > 0 && (
              <div className="mt-4">
                <h4 className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                  <Users className="h-3.5 w-3.5" aria-hidden /> Also on this deal
                </h4>
                <ul className="mt-1 space-y-1">
                  {others.map((p) => (
                    <li key={`${p.contactId}:${p.role}`} className="text-sm text-navy-900">
                      {p.name} <span className="text-slate-500">· {ROLE_LABEL[p.role] ?? p.role}</span>
                      {p.email && (
                        <a href={`mailto:${p.email}`} className="ml-2 text-xs text-slate-500 hover:text-gold-700 hover:underline">{p.email}</a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">No contact is attached to this application.</p>
        )}
      </Section>

      {/* ------------------------------------------------ loan */}
      <Section title="Loan" icon={Landmark}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field name="Requested"><span className="font-semibold tabular-nums">{money(app.requestedAmount)}</span></Field>
          <Field name="Program">{label(PRODUCT_LABEL, app.product)}{app.isPortfolio ? " · Portfolio" : ""}</Field>
          {purpose && <Field name="Purpose">{purpose}</Field>}
          {has(app.downPayment) && <Field name="Down payment"><span className="tabular-nums">{money(app.downPayment)}</span></Field>}
          {app.isPortfolio && has(app.propertyCount) && <Field name="Properties">{app.propertyCount}</Field>}
          {(["ltc", "ltarv", "ltv"] as const).map((k) => {
            const r = ratioText(app[k]);
            if (!r) return null;
            return (
              <Field key={k} name={`${k.toUpperCase()}${app.bindingRatio === k ? " (binding)" : ""}`}>
                <span className={r.incomplete ? "text-amber-700" : "tabular-nums"}>{r.text}</span>
              </Field>
            );
          })}
          {app.exitStrategy && <Field name="Exit strategy">{app.exitStrategy}</Field>}
          {app.timeline && <Field name="Timeline">{app.timeline}</Field>}
          <Field name="Received">{shortDate(app.submittedAt ?? app.createdAt)}</Field>
          {app.ownerName && <Field name="Owner">{app.ownerName}</Field>}
          {app.termSheetIssuedAt && <Field name="Term sheet issued">{shortDate(app.termSheetIssuedAt)}</Field>}
          {app.termSheetSignedAt && <Field name="Term sheet signed">{shortDate(app.termSheetSignedAt)}</Field>}
          {app.decisionedAt && <Field name="Decisioned">{shortDate(app.decisionedAt)}</Field>}
          {app.fundedAt && <Field name="Funded">{shortDate(app.fundedAt)}</Field>}
          {app.lostReason && <Field name="Lost because" wide>{app.lostReason}</Field>}
        </dl>

        {card.properties.length > 0 && (
          <ul className="mt-4 space-y-3">
            {card.properties.map((p, i) => <PropertyItem key={p.id} p={p} n={card.properties.length > 1 ? i + 1 : null} />)}
          </ul>
        )}

        {app.borrowerMessage && (
          <figure className="mt-4 rounded-lg border-l-2 border-gold-500 bg-slate-50 px-3 py-2">
            <figcaption className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <Quote className="h-3 w-3" aria-hidden /> In their words
            </figcaption>
            {/* Verbatim, never edited here — the best single predictor of whether the deal is real. */}
            <blockquote className="mt-1 whitespace-pre-line break-words text-sm italic text-slate-700">{app.borrowerMessage}</blockquote>
          </figure>
        )}
      </Section>

      {/* ------------------------------------------------ notes */}
      <Section title="Deal notes" icon={PencilLine}>
        <DealNotes applicationId={app.id} initial={app.notes} from={from} />
        <p className="mt-1 text-[11px] text-slate-500">
          Saved on the deal. To add a dated entry to the timeline instead, use Note at the top.
        </p>
      </Section>

      {/* ------------------------------------------------ documents */}
      {card.documents.length > 0 && (
        <Section title="Documents" icon={FolderOpen} aside={<span className="text-[11px] text-slate-500">Files stay in Drive</span>}>
          <ul className="divide-y divide-slate-100">
            {card.documents.map((d) => {
              const s = docStatus(d, now);
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-navy-900">
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="truncate" title={d.name}>{d.name}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      s === "received" ? "bg-emerald-50 text-emerald-700" : s === "expired" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {DOC_STATUS_LABEL[s]}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* ------------------------------------------------ timeline */}
      <Section
        title="Activity"
        icon={History}
        aside={<span className="text-[11px] text-slate-500">{timeline.items.length === 0 ? "" : "Newest first"}</span>}
      >
        {timeline.items.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing recorded yet — no calls, emails, texts, notes or stage moves.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-slate-200 pl-5">
            {timeline.items.map((item) => <TimelineRow key={item.key} item={item} now={now} from={from} />)}
          </ol>
        )}
        {timeline.older > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            {timeline.older} older {timeline.older === 1 ? "item" : "items"} not shown.
          </p>
        )}
      </Section>
    </RecordDrawer>
  );
}

function PropertyItem({ p, n }: { p: RecordProperty; n: number | null }) {
  const address = addressLine(p);
  const facts: [string, string][] = [];
  if (p.propertyType || p.units) facts.push(["Type", [p.propertyType, p.units ? `${p.units} unit${p.units === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")]);
  if (has(p.purchasePrice)) facts.push(["Purchase price", money(p.purchasePrice)]);
  if (has(p.asIsValue)) facts.push(["As-is value", money(p.asIsValue)]);
  if (has(p.rehabBudget)) facts.push(["Rehab budget", money(p.rehabBudget)]);
  if (has(p.arv)) facts.push(["ARV", `${money(p.arv)}${p.arvSource ? ` (${p.arvSource})` : ""}`]);
  if (has(p.monthlyRent)) facts.push(["Monthly rent", money(p.monthlyRent)]);
  if (has(p.estimatedPayoff)) facts.push(["Est. payoff", money(p.estimatedPayoff)]);
  if (has(p.lienPosition)) facts.push(["Lien position", String(p.lienPosition)]);
  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <p className="flex items-start gap-2 text-sm font-medium text-navy-900">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        <span>
          {n !== null && <span className="text-slate-500">#{n} </span>}
          {address ?? <span className="text-slate-400">No address captured</span>}
        </span>
      </p>
      {facts.length > 0 && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 pl-6">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] text-slate-500">{k}</dt>
              <dd className="text-sm tabular-nums text-navy-900">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

const KIND_ICON: Record<string, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  call: Phone,
  email_in: ArrowDownLeft,
  email_out: ArrowUpRight,
  sms_in: MessageSquare,
  sms_out: MessageSquare,
  note: StickyNote,
  stage_move: ArrowRightLeft,
  stage_change: ArrowRightLeft,
  field_change: PencilLine,
  automation: Bot,
  form_submission: FileText,
};

const STATUS_TONE: Record<string, string> = {
  ok: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-red-700",
  muted: "text-slate-500",
};

function TimelineRow({ item, now, from }: { item: TimelineItem; now: Date; from: CrmRoute }) {
  const Icon = KIND_ICON[item.kind] ?? History;
  const isMove = item.kind === "stage_move";
  const inbound = item.kind === "email_in" || item.kind === "sms_in" || item.title === "Call from them";
  const body = item.body;
  return (
    <li className="relative">
      <span
        className={`absolute -left-[1.95rem] top-0 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white ${
          isMove ? "bg-navy-900 text-gold-400" : inbound ? "bg-gold-400/20 text-gold-700" : "bg-slate-100 text-slate-600"
        }`}
      >
        <Icon className="h-3 w-3" aria-hidden />
      </span>
      <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <span className="font-medium text-navy-900">{item.title}</span>
        <time dateTime={item.at} className="text-[11px] tabular-nums text-slate-500">{whenLabel(item.at, now)}</time>
      </p>
      {item.subject && <p className="break-words text-sm text-slate-700">{item.subject}</p>}
      {body && (item.long ? (
        // Long texts fold, with no JavaScript: <details> does it natively.
        <details className="group text-sm text-slate-600">
          <summary className="cursor-pointer list-none break-words [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              {body.slice(0, TIMELINE_TEXT_PREVIEW).trimEnd()}…{" "}
              <span className="text-xs font-medium text-gold-700 underline underline-offset-2">Show all</span>
            </span>
            <span className="hidden text-xs font-medium text-gold-700 underline underline-offset-2 group-open:inline">Show less</span>
          </summary>
          <p className="whitespace-pre-line break-words">{body}</p>
        </details>
      ) : (
        <p className="whitespace-pre-line break-words text-sm text-slate-600">{body}</p>
      ))}
      {item.status && <p className={`break-words text-xs ${STATUS_TONE[item.status.tone] ?? "text-slate-500"}`}>{item.status.label}</p>}
      {item.retryId && <div className="mt-1"><RetryTextButton outboundId={item.retryId} from={from} /></div>}
      {item.reason && <p className="break-words text-xs text-slate-500">{item.reason}</p>}
    </li>
  );
}
