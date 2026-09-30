import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { bearerFrom, tokenOk } from "@/lib/marketing/token";
import {
  SYSTEM_RULES,
  buildBrief,
  checkOutput,
  decideRun,
  newYorkDate,
  parseModelOutput,
  repairRequest,
  slugsFromSitemap,
  type CheckedDraft,
  type ModelOutput,
  type QueueItem,
} from "@/lib/marketing/dailyBlog";
import { callModel, withoutThinking, type Message as ModelMessage } from "@/lib/marketing/modelCall";

/**
 * The 7am daily blog, run by Vercel Cron (vercel.json).
 *
 * Replaces the scheduled Claude task that was blocked on 25 Sep 2026 for
 * carrying the queue token out of a Drive file. Nothing here handles a secret
 * that did not come from this server's own environment. See
 * lib/marketing/dailyBlog.ts for the full reasoning.
 *
 * THE ORDER IS THE SAFETY:
 *   1. CRON_SECRET is checked before anything else. Fails closed.
 *   2. Nothing is claimed until the configuration is known to be complete, so a
 *      missing key leaves the queue exactly as it was.
 *   2b. Nothing is claimed while another run is still writing (a claim younger
 *      than CLAIM_FRESH_MINUTES), even with ?force=1, and nothing is claimed
 *      once today's draft has landed unless ?force=1. See decideRun.
 *   3. Once claimed, the request NEVER stays in_progress: every failure below
 *      marks it failed with a sentence Luis can act on, and /crm/marketing
 *      shows it.
 *   4. The draft goes through POST /api/crm/content-queue, the same door the
 *      task used, so draft.ts and the transition rules still decide what lands.
 *      This route cannot publish. Publishing is still publish-blog.bat.
 *
 * PERFORMANCE: runs once a day, off the request path of every visitor. It
 * shares nothing with a page and adds nothing to any bundle.
 */

/**
 * Opus researches and writes more slowly than Sonnet. 800 s is the Pro plan's
 * ceiling with fluid compute (confirmed Pro, 25 Sep 2026). On Hobby this would
 * have to go back to 300 and BUDGET_MS to 270_000.
 */
export const maxDuration = 800;

const SITE = "https://www.fundedcapital.com";
const QUEUE = `${SITE}/api/crm/content-queue`;
const BY = "daily-blog-cron";

/** Stop starting new model work this long before Vercel would kill the function. */
const BUDGET_MS = 760_000;
/**
 * Opus since 25 Sep 2026: the first Sonnet draft passed every check but
 * repeated a sentence and mixed up two sources. BLOG_MODEL in Vercel overrides.
 */
const MODEL_DEFAULT = "claude-opus-5-5";

/* ------------------------------------------------------------ plumbing */

class Stop extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

type Json = Record<string, unknown>;

async function queue(token: string, init?: { body: Json }): Promise<{ status: number; json: Json }> {
  const res = await fetch(QUEUE, {
    method: init ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init ? { "Content-Type": "application/json" } : {}),
    },
    body: init ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  let json: Json = {};
  try {
    json = (await res.json()) as Json;
  } catch {
    /* a non-JSON answer is reported by status alone */
  }
  return { status: res.status, json };
}

type Message = ModelMessage;

/**
 * One conversation turn with the model, following `pause_turn` (a long web
 * search pausing mid-turn) until it finishes or the deadline arrives.
 * Returns the final text and the full message list, so a repair round can
 * continue the same conversation.
 *
 * The API call itself is lib/marketing/modelCall.ts, which handles the thinking
 * block binding that stopped every post from 26 Sep 2026. `plain` carries its
 * fallback through the rest of the conversation once it has been needed.
 */
async function converse(opts: {
  key: string;
  model: string;
  system: string;
  messages: Message[];
  search: boolean;
  deadline: number;
  plain?: boolean;
}): Promise<{ text: string; messages: Message[]; plain: boolean }> {
  const messages = [...opts.messages];
  let plain = opts.plain === true;
  for (let hop = 0; hop < 6; hop++) {
    const left = opts.deadline - Date.now();
    if (left < 15_000) throw new Stop("Ran out of time while the post was being written. Retry it from the Marketing page.");
    const r = await callModel({
      key: opts.key,
      model: opts.model,
      system: opts.system,
      messages,
      search: opts.search,
      maxTokens: 16_000,
      timeoutMs: left,
      plain,
    });
    if (!r.ok) {
      if (r.status === 401) throw new Stop("The Anthropic API key in Vercel was rejected. Replace ANTHROPIC_API_KEY.");
      throw new Stop(`The writing model refused the request: ${r.message.slice(0, 300)}`);
    }
    if (r.retriedWithoutThinking && !plain) {
      plain = true;
      // The history the model saw no longer has thinking blocks; keep it that way.
      messages.splice(0, messages.length, ...withoutThinking(messages));
    }
    const content = r.reply.content ?? [];
    messages.push({ role: "assistant", content });
    if (r.reply.stop_reason === "pause_turn") continue;
    if (r.reply.stop_reason === "max_tokens") throw new Stop("The post ran past the length limit before it was finished.");
    const text = content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    return { text, messages, plain };
  }
  throw new Stop("The research step did not finish.");
}

async function readVoiceGuide(): Promise<string> {
  try {
    return await readFile(join(process.cwd(), "lib", "marketing", "brand-voice.md"), "utf8");
  } catch {
    // outputFileTracingIncludes ships it; if it is ever missing, write from the rules alone.
    console.warn("[cron/daily-blog] brand-voice.md not found; writing from the built-in rules only");
    return "";
  }
}

/* -------------------------------------------------------------- handler */

export async function GET(request: Request) {
  // 1. Only Vercel's cron (or someone holding CRON_SECRET) gets past this line.
  if (!tokenOk(bearerFrom(request.headers.get("authorization")), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  const started = Date.now();
  const deadline = started + BUDGET_MS;
  const now = new Date();
  const today = newYorkDate(now); // the one "today": the post's date and the already-drafted check
  const force = new URL(request.url).searchParams.get("force") === "1";

  // 2. Configuration, before anything is claimed.
  const queueToken = (process.env.CONTENT_QUEUE_TOKEN ?? "").trim();
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  const model = (process.env.BLOG_MODEL ?? "").trim() || MODEL_DEFAULT;
  const missing = [!queueToken && "CONTENT_QUEUE_TOKEN", !apiKey && "ANTHROPIC_API_KEY"].filter(Boolean);
  if (missing.length) {
    console.error(`[cron/daily-blog] not configured: ${missing.join(", ")}`);
    return NextResponse.json({ ok: false, error: `Missing in Vercel: ${missing.join(", ")}.` }, { status: 503 });
  }

  // 3. Read the queue. Nothing claimed yet, so any failure here changes nothing.
  const read = await queue(queueToken).catch(() => null);
  if (!read || read.status !== 200) {
    const why = read ? `HTTP ${read.status}` : "unreachable";
    console.error(`[cron/daily-blog] queue read failed: ${why}`);
    return NextResponse.json({ ok: false, error: `The content queue could not be read (${why}).` }, { status: 502 });
  }
  // A run is writing already, nothing is waiting, or today's post has landed:
  // decideRun (dailyBlog.ts) says which, in words fc-run-daily-blog.bat prints.
  // The drafts are read only when they can change the answer (force skips them).
  let drafts: { draftedAt: string | null }[] = [];
  if (!force) {
    const res = await fetch(`${QUEUE}?view=drafts`, {
      headers: { Authorization: `Bearer ${queueToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    const listed = res && res.ok ? ((await res.json().catch(() => ({}))) as Json).items : null;
    drafts = Array.isArray(listed) ? (listed as { draftedAt: string | null }[]) : [];
  }
  const decision = decideRun({ items: (read.json.items as QueueItem[]) ?? [], drafts, now, force });
  if (!decision.run) {
    // 200, not an error: for a repeated cron delivery this IS the right outcome.
    console.log(`[cron/daily-blog] not writing (${decision.kind}): ${decision.message}`);
    return NextResponse.json({ ok: true, drafted: false, skipped: decision.message });
  }
  const item = decision.item;

  // 4. Claim. From here on the request must never be left in_progress.
  const claim = await queue(queueToken, { body: { id: item.id, status: "in_progress", by: BY } }).catch(() => null);
  if (claim?.status === 409) {
    // Two runs started in the same moment and picked the same topic; the queue's
    // conditional UPDATE let only the other one have it. Nothing was written twice.
    console.log(`[cron/daily-blog] lost the claim race: ${String(claim.json.error ?? "")}`);
    return NextResponse.json({
      ok: true,
      drafted: false,
      skipped:
        "Not started: another run picked up the same topic a moment ago, so this one stopped and nothing will be written twice. Open /crm/marketing in about 15 minutes to read the draft. No need to run this again or send it to Claude.",
    });
  }
  if (!claim || claim.status !== 200 || claim.json.to !== "in_progress") {
    const why = claim ? `HTTP ${claim.status} ${String(claim.json.error ?? "")}` : "unreachable";
    console.error(`[cron/daily-blog] claim failed: ${why}`);
    return NextResponse.json({ ok: false, error: `Could not claim the request (${why}).` }, { status: 409 });
  }

  const report: Json = { id: item.id, topic: item.topic, model };
  try {
    const [voice, sitemap] = await Promise.all([
      readVoiceGuide(),
      fetch(`${SITE}/sitemap.xml`, { cache: "no-store", signal: AbortSignal.timeout(15_000) })
        .then((r) => (r.ok ? r.text() : ""))
        .catch(() => ""),
    ]);
    const liveSlugs = slugsFromSitemap(sitemap);
    if (liveSlugs.length < 10) throw new Stop("The sitemap could not be read, so internal links could not be checked.");

    const system = voice ? `${SYSTEM_RULES}\n\nTHE BRAND VOICE GUIDE (follow it; where it marks a figure UNVERIFIED, do not use that figure):\n\n${voice}` : SYSTEM_RULES;

    // 5. Research and write.
    let convo = await converse({
      key: apiKey,
      model,
      system,
      messages: [{ role: "user", content: buildBrief(item, today, liveSlugs) }],
      search: true,
      deadline,
    });

    // 6. Check in code; one repair round if anything fails.
    let out: ModelOutput | null = null;
    let checked: CheckedDraft | null = null;
    let problems: string[] = [];
    for (let round = 0; round < 2; round++) {
      const parsed = parseModelOutput(convo.text);
      if (parsed.ok) {
        out = parsed.value;
        const result = checkOutput(out, today, liveSlugs);
        if (result.ok) {
          checked = result.value;
          break;
        }
        problems = result.problems;
      } else {
        problems = [parsed.error];
      }
      if (round === 1 || deadline - Date.now() < 120_000) break;
      console.log(`[cron/daily-blog] repair round for: ${problems.join(" | ")}`);
      convo = await converse({
        key: apiKey,
        model,
        system,
        messages: [...convo.messages, { role: "user", content: repairRequest(problems) }],
        search: false,
        deadline,
        plain: convo.plain,
      });
    }
    if (!checked || !out) {
      throw new Stop(`The draft failed its checks: ${problems.slice(0, 6).join("; ")}`);
    }
    report.slug = checked.slug;
    report.words = checked.words;

    // 7. Deliver the draft. Accepted only on 200 + ok + to: drafted.
    const sent = await queue(queueToken, {
      body: {
        id: item.id,
        status: "drafted",
        draftUrl: checked.draftUrl,
        draftSummary: out.summary,
        draftBody: checked.mdx,
        by: BY,
      },
    });
    if (sent.status !== 200 || sent.json.to !== "drafted") {
      throw new Stop(`The queue refused the draft: ${String(sent.json.error ?? `HTTP ${sent.status}`)}`);
    }
    report.drafted = true;

    // 8. Carousel and LinkedIn caption. Never undoes the draft.
    let carousel = checked.carousel;
    if (!carousel && checked.carouselError && deadline - Date.now() > 40_000) {
      try {
        const fix = await converse({
          key: apiKey,
          model,
          system,
          messages: [
            ...convo.messages,
            { role: "user", content: `The carousel was refused: ${checked.carouselError} Reply with only a corrected <carousel>{...}</carousel> block.` },
          ],
          search: false,
          deadline,
          plain: convo.plain,
        });
        const reparsed = parseModelOutput(
          `<slug>${out.slug}</slug><summary>x</summary><mdx>${out.mdx}</mdx>${fix.text}<linkedin>${out.linkedin}</linkedin>`,
        );
        const again = reparsed.ok ? checkOutput(reparsed.value, today, liveSlugs) : null;
        if (again?.ok && again.value.carousel) carousel = again.value.carousel;
      } catch {
        /* the draft already landed; a missing carousel is reported, not fatal */
      }
    }
    const attach = await queue(queueToken, {
      body: {
        id: item.id,
        ...(carousel ? { carouselSpec: carousel } : {}),
        linkedinCaption: out.linkedin,
        by: BY,
      },
    }).catch(() => null);
    report.carousel = !!carousel && attach?.json.carousel === true;
    report.linkedin = attach?.json.linkedin === true;
    if (!attach || attach.status !== 200) report.attachError = String(attach?.json.error ?? "unreachable");

    report.seconds = Math.round((Date.now() - started) / 1000);
    console.log(`[cron/daily-blog] drafted ${checked.slug} (${checked.words} words) in ${report.seconds}s`);
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    const reason =
      err instanceof Stop
        ? err.message
        : err instanceof Error && err.name === "TimeoutError"
          ? "A step timed out. Retry it from the Marketing page."
          : "Something unexpected went wrong while writing the post.";
    if (!(err instanceof Stop)) console.error("[cron/daily-blog]", err);

    // 9. Never leave it in_progress. If the draft already landed, there is nothing to undo.
    if (!report.drafted) {
      await queue(queueToken, { body: { id: item.id, status: "failed", error: reason, by: BY } }).catch(() => null);
    }
    console.error(`[cron/daily-blog] failed: ${reason}`);
    return NextResponse.json({ ok: false, error: reason, ...report }, { status: 500 });
  }
}
