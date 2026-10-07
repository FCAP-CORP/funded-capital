/**
 * One-click blog publishing — every rule in lib/marketing/publish.ts.
 * Run: npx tsx lib/marketing/publish.regress.ts
 */

import {
  DEFAULT_BRANCH,
  DEFAULT_REPO,
  commitMessage,
  contentsUrl,
  frontmatterTitle,
  githubProblem,
  postUrl,
  publishTarget,
  readyToPublish,
  samePost,
  withPublishDate,
} from "./publish";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const TOKEN = "github_pat_" + "A1b2C3d4E5".repeat(4);
const ARTICLE = "Investors who plan the exit before they buy close faster and keep more of the spread. ".repeat(12);
const BODY = [
  "---",
  'title: "How to Read a Draw Schedule"',
  'description: "What lenders look for in a construction draw schedule."',
  'date: "2026-10-02"',
  'updated: "2026-10-02"',
  'category: "Ground-Up"',
  'author: "Luis Fajardo"',
  "---",
  "",
  "## Start with the budget",
  "",
  ARTICLE,
  "",
  "date: this line is article text, not frontmatter, and must never change.",
].join("\n");

const ROW = { channel: "blog", status: "drafted", draftUrl: "content/blog/how-to-read-a-draw-schedule.mdx", draftBody: BODY };
const TODAY = "2026-10-07";

console.log("\n=== 1. Settings fail closed ===");
{
  const none = publishTarget({});
  check("no token → refused", !none.ok && /not set/.test(none.error));
  const blank = publishTarget({ GITHUB_PUBLISH_TOKEN: "   " });
  check("blank token → refused", !blank.ok);
  const short = publishTarget({ GITHUB_PUBLISH_TOKEN: "github_pat_short" });
  check("short token → refused", !short.ok);
  const wrong = publishTarget({ GITHUB_PUBLISH_TOKEN: "sk-" + "x".repeat(40) });
  check("not a GitHub token (an API key pasted in the wrong box) → refused", !wrong.ok && /github_pat_/.test(wrong.error));
  const spaced = publishTarget({ GITHUB_PUBLISH_TOKEN: TOKEN + " extra" });
  check("token with a space in it → refused", !spaced.ok);
  const good = publishTarget({ GITHUB_PUBLISH_TOKEN: TOKEN });
  check("a real-looking token → defaults", good.ok && good.value.owner + "/" + good.value.repo === DEFAULT_REPO && good.value.branch === DEFAULT_BRANCH);
  const classic = publishTarget({ GITHUB_PUBLISH_TOKEN: "ghp_" + "a".repeat(36) });
  check("a classic ghp_ token is accepted", classic.ok);
  const other = publishTarget({ GITHUB_PUBLISH_TOKEN: TOKEN, GITHUB_PUBLISH_REPO: "someone/fork", GITHUB_PUBLISH_BRANCH: "preview" });
  check("repo and branch can be overridden from the environment", other.ok && other.value.repo === "fork" && other.value.branch === "preview");
  check("a malformed repo is refused", !publishTarget({ GITHUB_PUBLISH_TOKEN: TOKEN, GITHUB_PUBLISH_REPO: "no-slash" }).ok);
  check("a repo of '..' is refused", !publishTarget({ GITHUB_PUBLISH_TOKEN: TOKEN, GITHUB_PUBLISH_REPO: "a/.." }).ok);
  check("a branch with '..' is refused", !publishTarget({ GITHUB_PUBLISH_TOKEN: TOKEN, GITHUB_PUBLISH_BRANCH: "main/../x" }).ok);
  const err = !none.ok ? none.error : "";
  check("errors never echo a token", !err.includes("github_pat_A") && ![wrong, short].some((r) => !r.ok && r.error.includes("x".repeat(10))));
}

console.log("\n=== 2. URLs ===");
{
  const t = { owner: "FCAP-CORP", repo: "funded-capital" };
  check("contents URL", contentsUrl(t, "content/blog/a-b.mdx") === "https://api.github.com/repos/FCAP-CORP/funded-capital/contents/content/blog/a-b.mdx");
  check("with ref", contentsUrl(t, "content/blog/a-b.mdx", "main").endsWith("/contents/content/blog/a-b.mdx?ref=main"));
  check("segments are encoded, slashes kept", contentsUrl(t, "content/blog/a b.mdx").endsWith("/content/blog/a%20b.mdx"));
  check("post URL is the www site", postUrl("a-b") === "https://www.fundedcapital.com/blog/a-b");
}

console.log("\n=== 3. Only a finished blog draft publishes ===");
{
  const ok = readyToPublish(ROW, TODAY);
  check("a good draft is ready", ok.ok, ok.ok ? ok.value.path : (ok as { error: string }).error);
  if (ok.ok) {
    check("...at content/blog/<slug>.mdx", ok.value.path === "content/blog/how-to-read-a-draw-schedule.mdx" && ok.value.slug === "how-to-read-a-draw-schedule");
    check("...dated the day it goes live", ok.value.body.includes(`date: "${TODAY}"`) && !ok.value.body.includes('date: "2026-10-02"'));
    check("...with its title", ok.value.title === "How to Read a Draw Schedule");
  }
  check("LinkedIn is refused", !readyToPublish({ ...ROW, channel: "linkedin" }, TODAY).ok);
  const pub = readyToPublish({ ...ROW, status: "published" }, TODAY);
  check("already published is refused, and says so", !pub.ok && /already published/.test(pub.error));
  for (const s of ["requested", "in_progress", "failed", "cancelled"]) {
    check(`status ${s} is refused`, !readyToPublish({ ...ROW, status: s }, TODAY).ok);
  }
  for (const p of ["../x.mdx", "content/blog/../../app/page.mdx", "content/blog/x.tsx", "/content/blog/x.mdx", "content/blog/Bad_Slug.mdx", null]) {
    check(`path ${JSON.stringify(p)} is refused`, !readyToPublish({ ...ROW, draftUrl: p }, TODAY).ok);
  }
  const noBody = readyToPublish({ ...ROW, draftBody: null }, TODAY);
  check("no stored text → refused, pointing at the old route", !noBody.ok && /fc-pull-drafts/.test(noBody.error));
  check("no frontmatter → refused", !readyToPublish({ ...ROW, draftBody: ARTICLE }, TODAY).ok);
  for (const bad of ["44 states", "As little as 5 days", "85% LTC", "680 floor"]) {
    const r = readyToPublish({ ...ROW, draftBody: BODY.replace("## Start with the budget", `## We lend in ${bad}`) }, TODAY);
    check(`forbidden figure "${bad}" (any case) is refused`, !r.ok && /forbid/.test(r.error));
  }
  check("a bad date is refused", !readyToPublish(ROW, "10/07/2026").ok);
  const crlf = readyToPublish({ ...ROW, draftBody: BODY.replace(/\n/g, "\r\n") }, TODAY);
  check("CRLF drafts are committed with LF endings", crlf.ok && !crlf.value.body.includes("\r"));
}

console.log("\n=== 4. The publish date ===");
{
  const out = withPublishDate(BODY, TODAY);
  check("date: line replaced", out.includes(`date: "${TODAY}"`));
  check("an older updated: moves with it", out.includes(`updated: "${TODAY}"`));
  const later = withPublishDate(BODY.replace('updated: "2026-10-02"', 'updated: "2026-12-01"'), TODAY);
  check("a later updated: is kept", later.includes('updated: "2026-12-01"'));
  check("a 'date:' line in the ARTICLE is never touched", out.includes("date: this line is article text"));
  check("nothing else changes", out.replace(/^(date|updated):.*$/gm, "") === BODY.replace(/^(date|updated):.*$/gm, ""));
  const unquoted = withPublishDate(BODY.replace('date: "2026-10-02"', "date: 2026-10-02"), TODAY);
  check("an unquoted date is replaced too", unquoted.includes(`date: "${TODAY}"`));
  check("no frontmatter → unchanged", withPublishDate(ARTICLE, TODAY) === ARTICLE);
}

console.log("\n=== 5. Title and commit message ===");
{
  check("double-quoted title", frontmatterTitle(BODY) === "How to Read a Draw Schedule");
  check("single-quoted title", frontmatterTitle(BODY.replace('title: "How to Read a Draw Schedule"', "title: 'Single'")) === "Single");
  check("missing title → null", frontmatterTitle(BODY.replace(/^title:.*$/m, "")) === null);
  const msg = commitMessage({ slug: "a-b", title: "x".repeat(100) }, "luis@fundedcapital.com\nInjected: header");
  const subject = msg.split("\n")[0];
  check("subject capped", subject.length <= 80, `${subject.length} chars`);
  check("who pressed it is recorded on one line", msg.includes("by luis@fundedcapital.comInjected: header") && msg.split("\n").length === 3);
  check("no publisher → still a message", commitMessage({ slug: "a-b", title: "T" }, null).startsWith("Publish blog post: T"));
}

console.log("\n=== 6. A second click is recognised ===");
{
  const committed = withPublishDate(BODY, TODAY);
  check("same post → same", samePost(committed, withPublishDate(BODY, TODAY)));
  check("same post published after midnight → still same", samePost(committed, withPublishDate(BODY, "2026-10-08")));
  check("same post with CRLF → same", samePost(committed.replace(/\n/g, "\r\n"), committed));
  check("a different article → different", !samePost(committed, committed.replace("Start with the budget", "Start with the land")));
  check("a different title → different", !samePost(committed, committed.replace("Draw Schedule", "Draw Sheet")));
}

console.log("\n=== 7. GitHub's answers, in words ===");
{
  check("401 → expired/revoked", /expired|revoked/.test(githubProblem(401, "create")));
  check("403 → needs write access", /Contents/.test(githubProblem(403, "create")));
  check("404 → token access", /access/.test(githubProblem(404, "check")));
  check("422 → press again", /again/.test(githubProblem(422, "create")));
  check("500 → wait", /Wait/.test(githubProblem(502, "create")));
  check("every failure says nothing was published, or to retry", [401, 403, 404, 418, 500].every((s) => /Nothing was published|again/.test(githubProblem(s, "create"))));
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
