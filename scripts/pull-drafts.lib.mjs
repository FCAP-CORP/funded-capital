/**
 * The logic behind fc-pull-drafts.bat — kept apart from the entry point so it
 * can be tested without a network, a token or Luis's disk.
 *
 * WHAT IT DOES. The daily blog task no longer writes onto this PC (a sleeping
 * laptop at 7am meant no post). It sends the finished MDX to the site's
 * marketing queue instead. This pulls those drafts down into content/blog, so
 * publish-blog.bat can push them live — when Luis decides to, not at 7am.
 *
 * DEFENCE IN DEPTH. The site already refuses a bad path before it is stored
 * (lib/marketing/draft.ts). This script checks again anyway, with the same
 * rules copied rather than imported — this is plain Node, no TypeScript — and
 * `pull-drafts.regress.ts` fails if the copy ever drifts from the original. A
 * path from the network is an instruction to create a file on this machine;
 * it gets checked by the machine that will obey it.
 *
 * IT NEVER OVERWRITES. A file that already exists is reported and left alone,
 * and the write itself uses the exclusive-create flag, so even a file that
 * appears between the check and the write is not replaced. Luis's edits to a
 * draft are never lost to a second pull.
 *
 * THE TOKEN IS NEVER PRINTED. It goes in one header and nowhere else.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

export const SITE = "https://www.fundedcapital.com";
export const DRAFTS_PATH = "/api/crm/content-queue?view=drafts";

/* ---- copied from lib/marketing/draft.ts — keep identical (tested) ------- */

export const MAX_DRAFT_BYTES = 262_144;
export const DRAFT_DIR = "content/blog/";

export function parseDraftPath(input) {
  if (typeof input !== "string" || !input.trim()) {
    return { ok: false, error: "A draft must say where it belongs." };
  }
  const path = input.trim();

  if (path.length > 200) return { ok: false, error: "That path is too long." };
  if (path.includes("\\")) return { ok: false, error: "Use forward slashes." };
  if (path.includes("..")) return { ok: false, error: "A path may not contain '..'." };
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) {
    return { ok: false, error: "A path must be relative to the repository." };
  }
  if (!path.startsWith(DRAFT_DIR)) {
    return { ok: false, error: `A blog draft must live in ${DRAFT_DIR}.` };
  }

  const file = path.slice(DRAFT_DIR.length);
  if (!file.endsWith(".mdx")) return { ok: false, error: "A blog draft must be a .mdx file." };

  const slug = file.slice(0, -".mdx".length);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return {
      ok: false,
      error: "A slug may only contain lowercase letters, numbers and single hyphens.",
    };
  }
  if (slug.length < 3 || slug.length > 120) {
    return { ok: false, error: "A slug must be between 3 and 120 characters." };
  }
  return { ok: true, value: slug };
}

/* ---- this script's own checks ------------------------------------------ */

/**
 * A lighter body check than the site's: enough to refuse something that is
 * plainly not a post (empty, huge, no frontmatter). The site did the full
 * check before storing it.
 */
export function checkDraftBody(input) {
  if (typeof input !== "string" || !input.trim()) return { ok: false, error: "The draft is empty." };
  const body = input.replace(/\r\n/g, "\n");
  if (Buffer.byteLength(body, "utf8") > MAX_DRAFT_BYTES) return { ok: false, error: "The draft is too large." };
  if (!body.startsWith("---\n") || body.indexOf("\n---", 3) === -1) {
    return { ok: false, error: "The draft has no frontmatter." };
  }
  return { ok: true, value: body };
}

/** Write it, or leave what is there. Nothing else is ever an option. */
export function decide(alreadyExists) {
  return alreadyExists ? "skip" : "write";
}

/** The file for a slug, proven to be inside content/blog. Null if it is not. */
export function targetFor(root, slug) {
  const dir = resolve(root, "content", "blog");
  const file = resolve(dir, `${slug}.mdx`);
  return file.startsWith(dir + sep) ? file : null;
}

/** The token file's contents, or why it cannot be used. Never echoes it. */
export function readToken(text) {
  const token = String(text ?? "").trim();
  if (!token) return { ok: false, error: "The .queue-token file is empty." };
  if (token.length < 32) return { ok: false, error: "The .queue-token file is too short to be a real token." };
  if (/\s/.test(token)) return { ok: false, error: "The .queue-token file has more than one line in it." };
  return { ok: true, value: token };
}

/**
 * Where to fetch from. Always the live site, unless a test points it at a
 * local server — and only https or this machine, so a stray environment
 * variable cannot send the token somewhere else in plain text.
 */
export function siteFrom(env) {
  const override = (env?.FC_PULL_SITE ?? "").trim();
  if (!override) return SITE;
  let u;
  try {
    u = new URL(override);
  } catch {
    return SITE;
  }
  const local = u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  return u.protocol === "https:" || local ? u.origin : SITE;
}

/** What an HTTP failure means, in words Luis can act on. */
export function httpProblem(status) {
  if (status === 401) {
    return [
      "The website did not accept this PC's token.",
      "The token in .queue-token does not match CONTENT_QUEUE_TOKEN in Vercel.",
      "Run fc-queue-token.bat and follow its steps, then try again.",
    ];
  }
  if (status === 503) {
    return [
      "The website has no working CONTENT_QUEUE_TOKEN.",
      "It is missing in Vercel, or shorter than 32 characters.",
      "Run fc-queue-token.bat, add the token in Vercel, redeploy, then try again.",
    ];
  }
  if (status === 404) {
    return [
      "The website does not have the drafts feature yet.",
      "The new code has not been deployed. Deploy it first, then try again.",
    ];
  }
  if (status === 429 || status >= 500) {
    return [`The website had a problem answering (error ${status}).`, "Wait a few minutes and try again."];
  }
  return [`The website refused the request (error ${status}).`, "Nothing was written. Send this message to Claude."];
}

/**
 * The whole job, with everything that touches the outside world injected.
 * Returns an exit code; prints through `log`.
 */
export async function pullDrafts({ root, env = {}, fetchImpl = fetch, log = console.log, timeoutMs = 30_000 }) {
  const blogDir = join(root, "content", "blog");
  if (!existsSync(blogDir) || !statSync(blogDir).isDirectory()) {
    log("  This does not look like the website folder - there is no content\\blog here.");
    log("  Nothing was written.");
    return 1;
  }

  const tokenFile = join(root, ".queue-token");
  if (!existsSync(tokenFile)) {
    log("  There is no .queue-token on this PC yet.");
    log("  Run fc-queue-token.bat first, then try again. Nothing was written.");
    return 1;
  }
  const token = readToken(readFileSync(tokenFile, "utf8"));
  if (!token.ok) {
    log(`  ${token.error}`);
    log("  Run fc-queue-token.bat to make a new one. Nothing was written.");
    return 1;
  }

  const site = siteFrom(env);
  log(`  Asking ${site} for finished blog drafts...`);

  let res;
  try {
    res = await fetchImpl(site + DRAFTS_PATH, {
      headers: { Authorization: `Bearer ${token.value}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const code = err?.cause?.code ?? err?.name ?? "unknown";
    log("");
    log("  Could not reach the website.");
    log(`  Check this PC is online, then try again. (Reason: ${code})`);
    log("  Nothing was written.");
    return 1;
  }

  if (!res.ok) {
    log("");
    for (const line of httpProblem(res.status)) log(`  ${line}`);
    log("  Nothing was written.");
    return 1;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    log("");
    log("  The website answered with something that is not a list of drafts.");
    log("  Nothing was written. Send this message to Claude.");
    return 1;
  }

  // An older deployment ignores ?view=drafts and returns the queue instead.
  // That list has no bodies, so writing from it would be writing nothing.
  if (!data || data.ok !== true || data.view !== "drafts" || !Array.isArray(data.items)) {
    log("");
    log("  The website is running older code that does not hand out drafts yet.");
    log("  Deploy the new code first, then try again. Nothing was written.");
    return 1;
  }

  if (data.items.length === 0) {
    log("");
    log("  No finished blog drafts are waiting. Nothing to do.");
    return 0;
  }

  const wrote = [];
  const skipped = [];
  const refused = [];

  for (const item of data.items) {
    const topic = typeof item?.topic === "string" ? item.topic.slice(0, 90) : "(no topic)";
    const path = parseDraftPath(item?.draftUrl);
    if (!path.ok) {
      refused.push(`${topic} - ${path.error}`);
      continue;
    }
    const body = checkDraftBody(item?.draftBody);
    if (!body.ok) {
      refused.push(`${topic} - ${body.error}`);
      continue;
    }
    const file = targetFor(root, path.value);
    if (!file) {
      refused.push(`${topic} - the path would land outside content\\blog.`);
      continue;
    }
    const shown = `content\\blog\\${path.value}.mdx`;

    if (decide(existsSync(file)) === "skip") {
      skipped.push(shown);
      continue;
    }
    try {
      writeFileSync(file, body.value, { encoding: "utf8", flag: "wx" });
      wrote.push(shown);
    } catch (err) {
      if (err?.code === "EEXIST") skipped.push(shown);
      else refused.push(`${topic} - could not write ${shown} (${err?.code ?? "error"}).`);
    }
  }

  log("");
  for (const f of wrote) log(`  WROTE    ${f}`);
  for (const f of skipped) log(`  already exists, skipped   ${f}`);
  for (const r of refused) log(`  REFUSED  ${r}`);

  log("");
  if (wrote.length) {
    log(`  ${wrote.length} new draft${wrote.length === 1 ? "" : "s"} written to content\\blog.`);
    log("  Read them first. When you are happy, run publish-blog.bat to put them live.");
    log("  Do not want one? Delete its file AND cancel it on the Marketing page,");
    log("  or it will come back the next time you run this.");
  } else {
    log("  Nothing new was written, so there is nothing new to publish.");
  }
  if (refused.length) {
    log("");
    log("  Some drafts were refused and NOT written. Send the REFUSED lines to Claude.");
  }
  return refused.length ? 2 : 0;
}
