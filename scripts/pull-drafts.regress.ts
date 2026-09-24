/**
 * Regression suite for scripts/pull-drafts.lib.mjs — the script that writes
 * blog drafts from the website onto Luis's disk.
 *
 * Three things matter and each has a section:
 *   - its path check is the SAME as the site's (section 1): the copy in the
 *     .mjs is compared against lib/marketing/draft.ts on every hostile shape;
 *   - it never overwrites and never writes outside content/blog (sections 2, 6);
 *   - it never prints the token, whatever goes wrong (sections 6 and 7 — the
 *     last one runs the real script against a local server).
 */

import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { parseDraftPath as siteParse } from "../lib/marketing/draft";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const TOKEN = "Zt5yQ1wE8rT3uI6oP9aS2dF4gH7jK0lZx-XcVbNm_qWeRtYu"; // fixture, 48 chars
const REPO_TOKEN_FILE = ".queue-token";

const FRONT = `---\ntitle: "T"\ndescription: "D"\ndate: "2026-09-24"\ncategory: "C"\nauthor: "Luis Fajardo"\n---\n`;
const BODY = FRONT + "\n" + "Real estate investors read this. ".repeat(40);

type Log = string[];
type Json = Record<string, unknown>;

function fakeFetch(status: number, json: unknown, seen: { url?: string; auth?: string } = {}): typeof fetch {
  return (async (url: string, init?: { headers?: Record<string, string> }) => {
    seen.url = url;
    seen.auth = init?.headers?.Authorization;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (json === "not-json") throw new SyntaxError("bad");
        return json;
      },
    };
  }) as unknown as typeof fetch;
}

function repo(opts: { token?: string | null; blog?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "fc-pull-"));
  if (opts.blog !== false) mkdirSync(join(root, "content", "blog"), { recursive: true });
  if (opts.token !== null) writeFileSync(join(root, REPO_TOKEN_FILE), opts.token ?? TOKEN);
  return root;
}

const item = (slug: string, body = BODY, topic = `Topic ${slug}`): Json => ({
  id: `id-${slug}`,
  topic,
  draftUrl: `content/blog/${slug}.mdx`,
  draftBody: body,
  draftedAt: "2026-09-24T11:05:00.000Z",
});

(async () => {
  const lib = await import("./pull-drafts.lib.mjs");

  console.log("\n=== 1. The script's path check is the site's path check ===");
  const corpus: unknown[] = [
    "content/blog/hard-money-loan-rates.mdx", "content/blog/70-percent-rule.mdx", "  content/blog/brrrr-guide.mdx  ",
    "content/blog/../../../etc/passwd", "content/blog/..%2f..%2fetc.mdx", "../secrets.mdx", "/etc/cron.d/evil.mdx",
    "C:/Users/luis/evil.mdx", "C:\\Users\\luis\\evil.mdx", "content\\blog\\post.mdx", "app/crm/actions.mdx",
    "package.json", "content/blog/2026/post.mdx", "content/blog/.env.mdx", "content/blog/post", "content/blog/post.ts",
    "content/blog/post.mdx.bat", "content/blog/Post.mdx", "content/blog/my post.mdx", "content/blog/my_post.mdx",
    "content/blog/post-.mdx", "content/blog/-post.mdx", "content/blog/a--b.mdx", "content/blog/ab.mdx",
    "content/blog/" + "a".repeat(120) + ".mdx", "content/blog/" + "a".repeat(121) + ".mdx", "content/blog/" + "a".repeat(190) + ".mdx",
    "content/blog/.mdx", "content/blog/", "", "   ", null, undefined, 42, {}, ["content/blog/x-y.mdx"],
    "content/blogger/post.mdx", "content/blog/post.MDX", "content/blog/post.mdx\n", "content/blog/pöst.mdx",
    "d:content/blog/post.mdx", "content/blog/post.mdx/../x.mdx",
  ];
  let same = 0;
  const differ: string[] = [];
  for (const input of corpus) {
    const a = siteParse(input);
    const b = lib.parseDraftPath(input);
    if (JSON.stringify(a) === JSON.stringify(b)) same++;
    else differ.push(JSON.stringify(input));
  }
  check(`identical verdict and message on all ${corpus.length} inputs`, differ.length === 0, differ.length ? `DIFFER: ${differ.join(", ")}` : `${same} identical`);
  check("...and the corpus includes refusals, so this is not vacuous", corpus.filter((c) => !siteParse(c).ok).length > 25, `${corpus.filter((c) => !siteParse(c).ok).length} refused`);
  check("MAX_DRAFT_BYTES matches the site", lib.MAX_DRAFT_BYTES === (await import("../lib/marketing/draft")).MAX_DRAFT_BYTES, String(lib.MAX_DRAFT_BYTES));

  console.log("\n=== 2. Write or skip — never overwrite ===");
  check("missing file → write", lib.decide(false) === "write", lib.decide(false));
  check("existing file → skip", lib.decide(true) === "skip", lib.decide(true));
  const r0 = repo();
  const t = lib.targetFor(r0, "hard-money-loan-rates");
  check("target is inside content/blog", t === resolve(r0, "content", "blog", "hard-money-loan-rates.mdx"), String(t));
  check("a slug that escapes is refused by targetFor too", lib.targetFor(r0, "../../evil") === null, "null");
  rmSync(r0, { recursive: true, force: true });

  console.log("\n=== 3. Body, token, site ===");
  check("good body passes", lib.checkDraftBody(BODY).ok, "ok");
  check("CRLF body normalised", lib.checkDraftBody(BODY.replace(/\n/g, "\r\n")).value === BODY, "LF");
  for (const [label, b] of [["empty", ""], ["not a string", 7], ["no frontmatter", "hello ".repeat(200)], ["unclosed", "---\ntitle: x\n" + "y ".repeat(300)], ["too big", FRONT + "a".repeat(262_144)]] as const) {
    check(`  body ${label} refused`, !lib.checkDraftBody(b).ok, lib.checkDraftBody(b).error ?? "");
  }
  check("token accepted (trailing newline trimmed)", lib.readToken(TOKEN + "\r\n").ok, "ok");
  check("short token refused", !lib.readToken("abc").ok, lib.readToken("abc").error ?? "");
  check("empty token refused", !lib.readToken("  ").ok, "refused");
  check("two lines refused", !lib.readToken(TOKEN + "\n" + TOKEN).ok, "refused");
  check("no token error message contains the token", [lib.readToken("x".repeat(20)), lib.readToken(TOKEN + " " + TOKEN)].every((v) => !JSON.stringify(v).includes("x".repeat(20)) && !JSON.stringify(v).includes(TOKEN)), "clean");
  check("default site is the live site", lib.siteFrom({}) === "https://www.fundedcapital.com", lib.siteFrom({}));
  check("http to localhost allowed for tests", lib.siteFrom({ FC_PULL_SITE: "http://127.0.0.1:9999" }) === "http://127.0.0.1:9999", lib.siteFrom({ FC_PULL_SITE: "http://127.0.0.1:9999" }));
  check("plain http elsewhere is ignored", lib.siteFrom({ FC_PULL_SITE: "http://evil.example" }) === lib.SITE, lib.siteFrom({ FC_PULL_SITE: "http://evil.example" }));
  check("garbage override is ignored", lib.siteFrom({ FC_PULL_SITE: "not a url" }) === lib.SITE, "live site");
  for (const s of [401, 503, 404, 500, 400]) {
    const msg = lib.httpProblem(s).join(" ");
    check(`  ${s} has a plain-English message`, msg.length > 30 && !msg.includes(TOKEN), msg.slice(0, 70));
  }
  check("401 points at fc-queue-token.bat", lib.httpProblem(401).join(" ").includes("fc-queue-token.bat"), "yes");

  console.log("\n=== 4. The happy path, and the no-overwrite rule on a real folder ===");
  {
    const root = repo();
    const existing = join(root, "content", "blog", "already-here.mdx");
    writeFileSync(existing, "LUIS EDITED THIS");
    const log: Log = [];
    const seen: { url?: string; auth?: string } = {};
    const code = await lib.pullDrafts({
      root, log: (s: string) => log.push(s),
      fetchImpl: fakeFetch(200, { ok: true, view: "drafts", count: 3, items: [item("new-post-one"), item("already-here"), item("new-post-one", BODY + "\nsecond copy")] }, seen),
    });
    const out = log.join("\n");
    check("exit 0", code === 0, String(code));
    check("asked the drafts view with a bearer header", seen.url === "https://www.fundedcapital.com/api/crm/content-queue?view=drafts" && seen.auth === `Bearer ${TOKEN}`, String(seen.url));
    check("wrote the new file with the exact body", readFileSync(join(root, "content", "blog", "new-post-one.mdx"), "utf8") === BODY, "same bytes");
    check("did NOT touch the existing file", readFileSync(existing, "utf8") === "LUIS EDITED THIS", "untouched");
    check("a duplicate slug in one response is skipped, first one kept", !readFileSync(join(root, "content", "blog", "new-post-one.mdx"), "utf8").includes("second copy"), "first kept");
    check("prints exactly what it wrote", out.includes("WROTE    content\\blog\\new-post-one.mdx") && (out.match(/WROTE/g) ?? []).length === 1, (out.match(/WROTE.*$/m) ?? [""])[0]);
    check("says 'already exists, skipped'", out.includes("already exists, skipped   content\\blog\\already-here.mdx"), "yes");
    check("ends by pointing at publish-blog.bat", out.includes("run publish-blog.bat"), "yes");
    check("never prints the token", !out.includes(TOKEN), "clean");
    check("only the expected files exist", JSON.stringify(readdirSync(join(root, "content", "blog")).sort()) === JSON.stringify(["already-here.mdx", "new-post-one.mdx"]), readdirSync(join(root, "content", "blog")).join(","));
    rmSync(root, { recursive: true, force: true });
  }

  console.log("\n=== 5. A compromised or confused server cannot write outside content/blog ===");
  {
    const root = repo();
    const hostile = [
      { ...item("x"), draftUrl: "content/blog/../../evil.mdx", topic: "traversal" },
      { ...item("x"), draftUrl: "C:/Users/luis/Desktop/evil.mdx", topic: "absolute" },
      { ...item("x"), draftUrl: "content\\blog\\..\\..\\evil.mdx", topic: "backslash" },
      { ...item("x"), draftUrl: "fc-pull-drafts.bat", topic: "a script" },
      { ...item("ok-slug"), draftBody: "no frontmatter at all ".repeat(50), topic: "bad body" },
      { ...item("ok-slug-2"), draftBody: 12345, topic: "number body" },
      null,
      "a string item",
    ];
    const log: Log = [];
    const code = await lib.pullDrafts({ root, log: (s: string) => log.push(s), fetchImpl: fakeFetch(200, { ok: true, view: "drafts", items: hostile }) });
    const out = log.join("\n");
    check("exit 2 when anything is refused", code === 2, String(code));
    check("nothing written anywhere in the repo", readdirSync(join(root, "content", "blog")).length === 0 && !existsSync(join(root, "evil.mdx")) && !existsSync(resolve(root, "..", "evil.mdx")), readdirSync(join(root, "content", "blog")).join(",") || "empty");
    check("every hostile item reported as REFUSED", (out.match(/^  REFUSED  /gm) ?? []).length === hostile.length, `${(out.match(/^  REFUSED  /gm) ?? []).length} of ${hostile.length}`);
    check("tells Luis to send the REFUSED lines to Claude", out.includes("Send the REFUSED lines to Claude"), "yes");
    rmSync(root, { recursive: true, force: true });
  }

  console.log("\n=== 6. Every failure is plain English, writes nothing, and never shows the token ===");
  type Case = { fetchImpl: typeof fetch; tokenFile?: string | null; blog?: boolean };
  const throwing = (make: () => Error): typeof fetch => (async () => { throw make(); }) as unknown as typeof fetch;
  const failures: [string, Case, RegExp, number][] = [
    ["401", { fetchImpl: fakeFetch(401, { ok: false, error: "Not authorised." }) }, /did not accept this PC's token/, 1],
    ["503", { fetchImpl: fakeFetch(503, { ok: false }) }, /no working CONTENT_QUEUE_TOKEN/, 1],
    ["404", { fetchImpl: fakeFetch(404, {}) }, /does not have the drafts feature yet/, 1],
    ["500", { fetchImpl: fakeFetch(500, {}) }, /had a problem answering \(error 500\)/, 1],
    ["network down", { fetchImpl: throwing(() => { const e = new TypeError("fetch failed") as TypeError & { cause?: unknown }; e.cause = { code: "ENOTFOUND" }; return e; }) }, /Could not reach the website[\s\S]*ENOTFOUND/, 1],
    ["timeout", { fetchImpl: throwing(() => { const e = new Error("t"); e.name = "TimeoutError"; return e; }) }, /Could not reach the website[\s\S]*TimeoutError/, 1],
    ["not JSON", { fetchImpl: fakeFetch(200, "not-json") }, /not a list of drafts/, 1],
    ["older deployment returns the queue", { fetchImpl: fakeFetch(200, { ok: true, count: 2, items: [{ id: "q" }] }) }, /older code/, 1],
    ["nothing waiting", { fetchImpl: fakeFetch(200, { ok: true, view: "drafts", count: 0, items: [] }) }, /No finished blog drafts are waiting/, 0],
    ["no token file", { tokenFile: null, fetchImpl: fakeFetch(200, {}) }, /no \.queue-token on this PC[\s\S]*fc-queue-token\.bat/, 1],
    ["short token file", { tokenFile: "abcSHORTtok", fetchImpl: fakeFetch(200, {}) }, /too short/, 1],
    ["wrong folder", { blog: false, fetchImpl: fakeFetch(200, {}) }, /does not look like the website folder/, 1],
  ];
  for (const [label, opts, re, want] of failures) {
    const root = repo({ token: opts.tokenFile === undefined ? TOKEN : opts.tokenFile, blog: opts.blog });
    const log: Log = [];
    let called = false;
    const f = opts.fetchImpl;
    const spy = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => { called = true; return f(input, init); }) as typeof fetch;
    const code = await lib.pullDrafts({ root, log: (s: string) => log.push(s), fetchImpl: spy });
    const out = log.join("\n");
    const blog = join(root, "content", "blog");
    const wrote = existsSync(blog) ? readdirSync(blog).length : 0;
    check(`  ${label}: message`, re.test(out), out.split("\n").filter(Boolean).slice(-2).join(" | ").slice(0, 110));
    check(`  ${label}: exit ${want}, nothing written, token not shown`, code === want && wrote === 0 && !out.includes(TOKEN) && !out.includes("abcSHORTtok"), `exit ${code}`);
    if (label === "no token file" || label === "wrong folder" || label === "short token file") check(`  ${label}: never called the network`, !called, String(called));
    rmSync(root, { recursive: true, force: true });
  }

  console.log("\n=== 7. The real script, end to end, against a local server ===");
  {
    const root = repo();
    writeFileSync(join(root, "content", "blog", "kept.mdx"), "MINE");
    let authSeen = "";
    const server = createServer((req, res) => {
      authSeen = String(req.headers.authorization ?? "");
      if (authSeen !== `Bearer ${TOKEN}`) { res.writeHead(401).end(JSON.stringify({ ok: false })); return; }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, view: "drafts", count: 2, items: [item("from-the-server"), item("kept")] }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as { port: number }).port;
    const run = (cwd: string) => new Promise<{ code: number | null; out: string }>((done) => {
      const p = spawn(process.execPath, [join(__dirname, "pull-drafts.mjs")], { cwd, env: { ...process.env, FC_PULL_SITE: `http://127.0.0.1:${port}` } });
      let out = "";
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (out += d));
      p.on("close", (code) => done({ code, out }));
    });
    const a = await run(root);
    check("exit 0", a.code === 0, `${a.code} ${a.out.slice(0, 200)}`);
    check("sent the token in the header", authSeen === `Bearer ${TOKEN}`, authSeen ? "Bearer (hidden)" : "none");
    check("wrote the new draft", readFileSync(join(root, "content", "blog", "from-the-server.mdx"), "utf8") === BODY, "yes");
    check("kept Luis's file", readFileSync(join(root, "content", "blog", "kept.mdx"), "utf8") === "MINE", "MINE");
    check("output never contains the token", !a.out.includes(TOKEN) && !a.out.includes(TOKEN.slice(0, 12)), "clean");
    const b = await run(root);
    check("second run writes nothing and says so", b.code === 0 && !b.out.includes("WROTE") && (b.out.match(/already exists, skipped/g) ?? []).length === 2, (b.out.match(/Nothing new.*$/m) ?? [""])[0]);
    writeFileSync(join(root, REPO_TOKEN_FILE), "W".repeat(48));
    const c = await run(root);
    check("wrong token: 401 message, exit 1, token not shown", c.code === 1 && /did not accept/.test(c.out) && !c.out.includes("W".repeat(12)), `exit ${c.code}`);
    server.close();
    rmSync(root, { recursive: true, force: true });
  }

  console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
