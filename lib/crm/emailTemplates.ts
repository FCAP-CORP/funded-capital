/**
 * Starting points for email from the record card. Pure; emailTemplates.regress.ts.
 *
 * STARTING POINTS, NOT FORM LETTERS. The card fills the template into the
 * compose box and Luis edits it before sending. Two borrowers should not get
 * the same email word for word — that is both better selling and better
 * deliverability.
 *
 * RULES FOR ANYTHING ADDED HERE (the brand rules, applied to email):
 *   - Real estate investors only. Never homebuyer language.
 *   - No rates, no amounts, no approval language. Rate ranges only, never
 *     guarantees — and a template cannot know the deal, so it quotes nothing.
 *   - Plain text. Subjects take a literal "&" (never "&amp;"), and the tests
 *     refuse any HTML entity in a subject.
 *   - No sign-off name: the Gmail signature is added below every email.
 */

export type EmailTemplate = {
  key: string;
  label: string;
  /** When to use it, shown in the picker. */
  hint: string;
  subject: string;
  body: string;
};

export type TemplateVars = {
  /** The borrower's first name, as written on the record. */
  firstName: string | null;
  /** Street line of the first property, e.g. "358 Cozart Ave SW". */
  street: string | null;
  /** Street + city, e.g. "358 Cozart Ave SW, Concord NC". */
  address: string | null;
  /** Program label, e.g. "Fix & Flip". */
  program: string | null;
  /** The sender's first name, from the signed-in account. */
  senderFirstName: string | null;
};

export const EMAIL_TEMPLATES: readonly EmailTemplate[] = [
  {
    key: "blank",
    label: "Blank email",
    hint: "Start from nothing.",
    subject: "",
    body: "Hi {firstName},\n\n",
  },
  {
    key: "first-reply",
    label: "First reply to a new lead",
    hint: "They just filled in a form or wrote in.",
    subject: "Your {program} loan request",
    body:
      "Hi {firstName},\n\n" +
      "Thanks for reaching out about {theDeal}. I'm {senderFirstName} with Funded Capital. We lend to real estate investors on fix-and-flip, ground-up construction, bridge and DSCR rental deals.\n\n" +
      "To size this properly, could you send me:\n" +
      "1. The purchase price (or current value) and your rehab or construction budget\n" +
      "2. The after-repair value you are underwriting to\n" +
      "3. How many similar projects you have completed in the last three years\n\n" +
      "If a call is easier, reply with a good time and I will call you.\n\n" +
      "Best,",
  },
  {
    key: "follow-up",
    label: "Follow-up — no reply yet",
    hint: "You wrote or called and have not heard back.",
    subject: "Following up on {theDealShort}",
    body:
      "Hi {firstName},\n\n" +
      "Following up on your request for {theDeal}. Are you still moving forward with it?\n\n" +
      "If the timing has changed or you are looking at a different property, just reply and let me know. Happy to run the numbers on whatever is next.\n\n" +
      "Best,",
  },
  {
    key: "documents",
    label: "Request documents",
    hint: "The deal fits and you need the file to move it forward.",
    subject: "Next step on {theDealShort}: a few documents",
    body:
      "Hi {firstName},\n\n" +
      "To move {theDeal} forward, please send:\n" +
      "- The purchase contract (or proof of ownership)\n" +
      "- Your scope of work and budget\n" +
      "- Recent bank statements showing funds for the down payment and reserves\n" +
      "- A list of completed projects (address, purchase price, sale or refinance)\n\n" +
      "Reply with whatever you have and I will let you know if anything else is needed.\n\n" +
      "Best,",
  },
  {
    key: "term-sheet",
    label: "Term sheet follow-up",
    hint: "A term sheet is out and waiting on them.",
    subject: "Your term sheet for {theDealShort}",
    body:
      "Hi {firstName},\n\n" +
      "Checking in on the term sheet for {theDeal}. Any questions on the terms? I am glad to walk through them on a quick call.\n\n" +
      "If everything looks right, reply and I will send over the next steps.\n\n" +
      "Best,",
  },
  /*
   * The term-sheet follow-up series (28 Sep 2026). Lending OS queues these on
   * the dashboard when a term sheet is out and the borrower has gone quiet;
   * Luis reads each one and presses Send. Timing and stop rules live in
   * lib/crm/termSheetFollowups.ts. The keys are what the rules count, so a
   * series step is only "done" when it was sent with its own key.
   */
  {
    key: "ts-1",
    label: "Term sheet follow-up 1 of 4 — did it arrive?",
    hint: "Two days after the term sheet, no word back.",
    subject: "Your term sheet for {theDealShort}",
    body:
      "Hi {firstName},\n\n" +
      "Making sure the term sheet for {theDeal} reached you. Any questions on the terms? Happy to walk through them on a quick call.\n\n" +
      "If it looks right, reply and I'll send over the next steps.\n\n" +
      "Best,",
  },
  {
    key: "ts-2",
    label: "Term sheet follow-up 2 of 4 — anything to adjust?",
    hint: "About five days in.",
    subject: "Questions on the terms for {theDealShort}?",
    body:
      "Hi {firstName},\n\n" +
      "Following up on the term sheet for {theDeal}. If something in it doesn't fit the deal (leverage, term or timing), tell me what you need and I'll see what we can do. A quick call usually sorts it out.\n\n" +
      "Best,",
  },
  {
    key: "ts-3",
    label: "Term sheet follow-up 3 of 4 — still moving forward?",
    hint: "About ten days in.",
    subject: "Still moving forward on {theDealShort}?",
    body:
      "Hi {firstName},\n\n" +
      "Is {theDeal} still moving forward? If you're weighing other offers, I'm glad to talk through how ours compares. If the deal has changed, send me the new numbers and I'll take another look.\n\n" +
      "Best,",
  },
  {
    key: "ts-4",
    label: "Term sheet follow-up 4 of 4 — closing the loop",
    hint: "About seventeen days in. The last one.",
    subject: "Should I close out the term sheet for {theDealShort}?",
    body:
      "Hi {firstName},\n\n" +
      "I haven't heard back on {theDeal}, so I'll assume the timing isn't right and close out the term sheet on my end. If you still want to go ahead, just reply and I can reissue it.\n\n" +
      "And if you have another deal coming up, send it my way.\n\n" +
      "Best,",
  },
  {
    // One email for a term sheet older than 30 days (lib/crm/termSheetFollowups.ts
    // SERIES_WINDOW_DAYS). That deal has almost certainly closed elsewhere or
    // died, so it asks how it went and invites the NEXT deal — it never
    // pretends the term sheet just went out.
    key: "ts-checkin",
    label: "Old term sheet — check in",
    hint: "A term sheet more than 30 days old with no reply. One email, then nothing.",
    subject: "How did {theDealShort} turn out?",
    body:
      "Hi {firstName},\n\n" +
      "It's been a while since we sent terms on {theDeal}. I'm guessing that one either closed or moved on. How did it turn out?\n\n" +
      "If you're working on something new, send it over and I'll get you numbers quickly.\n\n" +
      "Best,",
  },
];

/**
 * "JOHN" → "John", "mary-ann" → "Mary-Ann", "McKay" stays "McKay". Only
 * all-caps or all-lowercase names are re-cased; a name someone typed in mixed
 * case is theirs.
 */
export function greetingName(raw: string | null | undefined): string | null {
  const first = (raw ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || first === "(no" || !/[A-Za-z]/.test(first)) return null;
  if (first !== first.toUpperCase() && first !== first.toLowerCase()) return first;
  return first.toLowerCase().replace(/(^|[-'])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}

/**
 * Fill a template. Anything unknown falls back to wording that still reads
 * naturally ("there", "your project") rather than leaving a gap or a
 * placeholder in a borrower's inbox.
 */
export function fillTemplate(t: EmailTemplate, v: TemplateVars): { subject: string; body: string } {
  const theDeal = v.address ? `the property at ${v.address}` : v.program ? `your ${v.program} project` : "your project";
  const theDealShort = v.street ?? (v.program ? `your ${v.program} project` : "your project");
  const map: Record<string, string> = {
    firstName: v.firstName ?? "there",
    program: v.program ?? "",
    theDeal,
    theDealShort,
    senderFirstName: v.senderFirstName ?? "Luis",
  };
  const fill = (s: string) =>
    s.replace(/\{(\w+)\}/g, (m, k: string) => (k in map ? map[k] : m)).replace(/ {2,}/g, " ").replace(/^ | $/gm, "");
  return { subject: fill(t.subject), body: fill(t.body) };
}

export function templateByKey(key: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find((t) => t.key === key);
}
