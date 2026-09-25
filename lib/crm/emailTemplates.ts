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
