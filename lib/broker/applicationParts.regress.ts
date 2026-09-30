/**
 * Regression suite for applications sent in parts (lib/broker/applicationParts.ts).
 *
 * What must never happen:
 *   §1  a follow-up smuggles through a bad id, an impossible part number, a
 *       junk file, or more than one request's worth of data — or its files are
 *       checked differently from a document-request upload;
 *   §2  a follow-up's Drive folder hides what it is, or runs over 120 characters;
 *   §3  a follow-up is accepted for an application submitted hours ago;
 *   §4  the browser sends a request Vercel would refuse, silently drops a file,
 *       or tells the broker nothing about a file it could not send;
 *   §5  the CRM file count is batch 1's instead of the whole application's.
 */
import { MAX_FILE_BYTES, MAX_UPLOAD_BASE64, MAX_UPLOAD_FILES, parseUpload } from "@/lib/crm/docRequests";
import {
  FILES_EMAIL, MAX_APPLICATION_FILES, MAX_PARTS, MAX_REQUEST_CHARS, PART_NOTE, PART_WINDOW_MS,
  applicationFileCount, documentsSummaryLines, heldBackNotice, isTooLarge, missingFiles, overflowNotice,
  parsePart, partFolderName, partSummary, perFileLimit, planUploads, submitLabel, withinPartWindow,
} from "./applicationParts";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const APP = "7f1c2e9a-1b2c-4d5e-8f90-123456789abc";
const pdf = (name: string, data = "JVBERi0xLjQK") => ({ name, mimeType: "application/pdf", data });
const body = (part: Record<string, unknown>, files: unknown = [pdf("bank.pdf")]) => ({ part: { applicationId: APP, index: 2, total: 3, ...part }, files });
const err = (r: ReturnType<typeof parsePart>) => (r.ok ? "ok" : r.error);

function main() {
  console.log("\n=== 1. Parsing a follow-up ===");
  const good = parsePart(body({ firstFolder: "https://drive.google.com/drive/folders/abc123" }));
  check("a well-formed follow-up parses", good.ok && good.value.applicationId === APP && good.value.index === 2 && good.value.total === 3 && good.value.files.length === 1, err(good));
  check("...and keeps a Drive folder link", good.ok && good.value.firstFolder === "https://drive.google.com/drive/folders/abc123", "");
  check("not an object → refused", err(parsePart(null)) === "not_found" && err(parsePart("x")) === "not_found" && err(parsePart([body({})])) === "not_found", "");
  check("no part → refused", err(parsePart({ files: [pdf("a.pdf")] })) === "not_found", "");
  check("application id must be a uuid", err(parsePart(body({ applicationId: "1; DROP TABLE applications" }))) === "not_found" && err(parsePart(body({ applicationId: 42 }))) === "not_found", "");
  check("index 1 is the application itself, never a follow-up", err(parsePart(body({ index: 1 }))) === "bad_request", "");
  check("index 0 and negatives refused", err(parsePart(body({ index: 0 }))) === "bad_request" && err(parsePart(body({ index: -2 }))) === "bad_request", "");
  check("index beyond total refused", err(parsePart(body({ index: 4, total: 3 }))) === "bad_request", "");
  check("index = total accepted", parsePart(body({ index: 3, total: 3 })).ok, "");
  check(`total up to ${MAX_PARTS} accepted`, parsePart(body({ index: MAX_PARTS, total: MAX_PARTS })).ok, "");
  check(`total over ${MAX_PARTS} refused`, err(parsePart(body({ index: 2, total: MAX_PARTS + 1 }))) === "bad_request", "");
  check("fractions and strings refused", err(parsePart(body({ index: 2.5 }))) === "bad_request" && err(parsePart(body({ index: "2" }))) === "bad_request" && err(parsePart(body({ total: "3" }))) === "bad_request" && err(parsePart(body({ total: NaN }))) === "bad_request", "");
  const named = parsePart(body({}, [pdf('../../etc/pass:wd<1>.pdf')]));
  check("file names are cleaned", named.ok && named.value.files[0].name === "..-..-etc-pass-wd-1-.pdf", named.ok ? named.value.files[0].name : err(named));
  const mime = parsePart(body({}, [{ name: "a.pdf", mimeType: "text/html; charset=<x>", data: "QUJD" }]));
  check("a strange mime type becomes octet-stream", mime.ok && mime.value.files[0].mimeType === "application/octet-stream", "");
  check("non-base64 data refused", err(parsePart(body({}, [pdf("a.pdf", "<script>alert(1)</script>")]))) === "bad_file", "");
  check("no files refused", err(parsePart(body({}, []))) === "no_files" && err(parsePart(body({}, "nope"))) === "no_files", "");
  check(`more than ${MAX_UPLOAD_FILES} files refused`, err(parsePart(body({}, Array.from({ length: MAX_UPLOAD_FILES + 1 }, (_, i) => pdf(`f${i}.pdf`))))) === "too_many_files", "");
  const big = "A".repeat(MAX_UPLOAD_BASE64 / 2 + 4);
  check("more than one request's worth of data refused", err(parsePart(body({}, [pdf("a.pdf", big), pdf("b.pdf", big)]))) === "files_too_large", "");
  check("exactly the limit accepted", parsePart(body({}, [pdf("a.pdf", "A".repeat(MAX_UPLOAD_BASE64))])).ok, "");
  // Same files through both paths: identical outcome, identical cleaned files.
  const samples: unknown[] = [
    [pdf("a/b.pdf")], [pdf("x.pdf", "!!")], [], [pdf("a.pdf", big), pdf("b.pdf", big)],
    [{ name: "", mimeType: "image/png", data: "QUJD" }], [{ name: "n.pdf", data: "" }, pdf("ok.pdf")],
  ];
  const same = samples.every((files) => {
    const a = parsePart({ part: { applicationId: APP, index: 2, total: 2 }, files });
    const b = parseUpload({ applicationId: APP, requestId: APP, files });
    return JSON.stringify(a.ok ? a.value.files : a.error) === JSON.stringify(b.ok ? b.files : b.error);
  });
  check("files are validated exactly as a document-request upload is", same, `${samples.length} samples`);
  check("a folder link that is not Google Drive is dropped", ["http://drive.google.com/x", "https://evil.example/drive.google.com", "javascript:alert(1)", "https://drive.google.com/x\" onload=1", 42]
    .every((f) => { const r = parsePart(body({ firstFolder: f })); return r.ok && r.value.firstFolder === null; }), "");

  console.log("\n=== 2. The follow-up's Drive folder ===");
  const first = "Tony Esposito - 358 Cozart Ave SW - 9-30-2026";
  check("the application's name plus files N of M", partFolderName(first, 2, 3) === `${first} - files 2 of 3`, partFolderName(first, 2, 3));
  check("reserved and path characters are replaced", partFolderName('A/B\\C:D*E?F"G<H>I|J', 2, 2) === "A-B-C-D-E-F-G-H-I-J - files 2 of 2", partFolderName('A/B\\C:D*E?F"G<H>I|J', 2, 2));
  check("control characters and runs of spaces are tidied", partFolderName("Tony\n\t   Esposito", 2, 2) === "Tony-- Esposito - files 2 of 2", partFolderName("Tony\n\t   Esposito", 2, 2));
  const long = partFolderName("X".repeat(300), 12, 20);
  check("never over 120 characters", long.length <= 120, `${long.length}`);
  check("...and the long NAME is cut, never the part number", long.endsWith(" - files 12 of 20"), long.slice(-20));
  check("no name recorded → a plain fallback", partFolderName(null, 2, 3) === "Broker application - files 2 of 3" && partFolderName("  ", 2, 3) === "Broker application - files 2 of 3", "");
  const summary = partSummary({ firstName: first, index: 2, total: 3, names: ["a.pdf", "b.pdf"], applicationId: APP });
  check("the summary opens by saying it is NOT a new application", summary.startsWith(PART_NOTE) && /not a new application/.test(PART_NOTE), summary.split("\n")[0]);
  check("...and names the application, the part and every file", summary.includes(first) && summary.includes("Part 2 of 3") && summary.includes("a.pdf, b.pdf"), "");

  console.log("\n=== 3. The two-hour window ===");
  const now = new Date("2026-09-30T15:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  check("a minute after submitting", withinPartWindow(ago(60_000), now), "");
  check("one hour 59 after", withinPartWindow(ago(PART_WINDOW_MS - 60_000), now), "");
  check("exactly two hours after", withinPartWindow(ago(PART_WINDOW_MS), now), "");
  check("two hours and a second after → refused", !withinPartWindow(ago(PART_WINDOW_MS + 1000), now), "");
  check("yesterday's application → refused", !withinPartWindow(ago(24 * 3600_000), now), "");
  check("a timestamp string from the database works", withinPartWindow("2026-09-30T14:30:00.000Z", now) && !withinPartWindow("2026-09-30 12:00:00+00", now), "");
  check("no timestamp, or junk → refused", !withinPartWindow(null, now) && !withinPartWindow(undefined, now) && !withinPartWindow("yesterday-ish", now), "");
  check("a minute in the future (clock skew) is fine", withinPartWindow(ago(-60_000), now), "");
  check("an hour in the future is not", !withinPartWindow(ago(-3600_000), now), "");

  console.log("\n=== 4. The browser's plan ===");
  const f = (name: string, mb: number) => ({ name, size: Math.round(mb * 1_000_000) });
  const small = planUploads([f("a.pdf", 0.2), f("b.pdf", 0.3)]);
  check("a small application is ONE request, exactly as before", small.batches.length === 1 && small.sending === 2 && small.heldBack.length === 0, `${small.batches.length} request(s)`);
  check("no files → no batches", planUploads([]).batches.length === 0 && planUploads([]).sending === 0, "");
  const three = planUploads([f("a.pdf", 2), f("b.pdf", 2), f("c.pdf", 2)]);
  check("three 2 MB scans → three requests", three.batches.length === 3 && three.batches.map((b) => b[0].name).join() === "a.pdf,b.pdf,c.pdf", three.batches.map((b) => b.map((x) => x.name).join("+")).join(" | "));
  const b64 = (n: number) => Math.ceil(n / 3) * 4;
  const every = planUploads(Array.from({ length: 25 }, (_, i) => f(`s${i}.pdf`, 0.1 + (i % 7) * 0.45)));
  check("every request fits under the upload limit", every.batches.every((b) => b.reduce((n, x) => n + b64(x.size), 0) <= MAX_UPLOAD_BASE64 && b.length <= MAX_UPLOAD_FILES), `${every.batches.length} requests`);
  check("...and under what the route accepts, with room for the JSON", MAX_REQUEST_CHARS > MAX_UPLOAD_BASE64 && MAX_REQUEST_CHARS < 4_500_000, `${MAX_REQUEST_CHARS}`);
  check("...and no file is lost or duplicated", every.batches.flat().length + every.heldBack.length + every.overflow.length === 25 && new Set(every.batches.flat().map((x) => x.name)).size === every.sending, "");
  const eleven = planUploads(Array.from({ length: 11 }, (_, i) => f(`t${i}.pdf`, 0.01)));
  check(`${MAX_UPLOAD_FILES} files per request at most`, eleven.batches.length === 2 && eleven.batches[0].length === MAX_UPLOAD_FILES, "");
  const withBig = planUploads([f("a.pdf", 0.5), f("huge-scan.pdf", 12), f("b.pdf", 0.5)]);
  check("a file too big on its own is held back", withBig.heldBack.map((x) => x.name).join() === "huge-scan.pdf", "");
  check("...and the rest still go", withBig.sending === 2 && withBig.batches.flat().map((x) => x.name).join() === "a.pdf,b.pdf", "");
  check("the per-file boundary is docRequests' own", isTooLarge(MAX_FILE_BYTES + 1) && !isTooLarge(MAX_FILE_BYTES) && planUploads([{ name: "x", size: MAX_FILE_BYTES }]).sending === 1, perFileLimit);
  const many = planUploads(Array.from({ length: 25 }, (_, i) => f(`p${i}.pdf`, 3)));
  check(`never more than ${MAX_PARTS} requests`, many.batches.length === MAX_PARTS && many.overflow.length === 5 && many.sending === MAX_PARTS, `${many.batches.length} requests, ${many.overflow.length} over`);
  check("...and the ones over are named, never dropped silently", many.overflow.map((x) => x.name).join() === "p20.pdf,p21.pdf,p22.pdf,p23.pdf,p24.pdf", "");

  check("button: one request says Submitting", submitLabel(1, 1) === "Submitting…" && submitLabel(1, 0) === "Submitting…", submitLabel(1, 1));
  check("button: request 1 of several", submitLabel(1, 3) === "Submitting (files 1 of 3)…", submitLabel(1, 3));
  check("button: a follow-up", submitLabel(2, 3) === "Uploading files 2 of 3…" && submitLabel(3, 3) === "Uploading files 3 of 3…", submitLabel(2, 3));

  const held = heldBackNotice(["huge-scan.pdf"]);
  check("held-back notice: names the file and the way round it", held.includes("huge-scan.pdf") && /Split or compress it/.test(held) && held.includes(FILES_EMAIL) && /borrower's name in the subject/.test(held) && /still submit/.test(held), held);
  check("held-back notice: plural reads right", /a\.pdf and b\.pdf are too large/.test(heldBackNotice(["a.pdf", "b.pdf"])) && /compress them/.test(heldBackNotice(["a.pdf", "b.pdf"])), "");
  check("held-back notice: nothing held back → nothing said", heldBackNotice([]) === "" && overflowNotice([]) === "", "");
  check("overflow notice names the files and where to send them", /2 files \(x\.pdf and y\.pdf\)/.test(overflowNotice(["x.pdf", "y.pdf"])) && overflowNotice(["x.pdf"]).includes(FILES_EMAIL), overflowNotice(["x.pdf", "y.pdf"]));
  check("the email address is the real one", FILES_EMAIL === "info@fundedcapital.com", "");

  const mplan = planUploads([f("a.pdf", 2), f("b.pdf", 2), f("huge.pdf", 9), f("c.pdf", 2)]);
  const names = (xs: { name: string }[]) => xs.map((x) => x.name).join();
  check("all parts arrive → only the held-back file is missing", names(missingFiles(mplan, [true, true, true])) === "huge.pdf", names(missingFiles(mplan, [true, true, true])));
  check("part 2 failed → its files are listed", names(missingFiles(mplan, [true, false, true])) === "b.pdf,huge.pdf", names(missingFiles(mplan, [true, false, true])));
  check("never attempted (no application id) → every follow-up's files listed", names(missingFiles(mplan, [true])) === "b.pdf,c.pdf,huge.pdf", "");
  const lines = documentsSummaryLines(mplan);
  check("Luis's summary: count, parts, and what the broker must email", lines[0] === "Documents attached: 3 (arriving in 3 parts; this folder holds part 1)" && lines[1] === "Not uploaded (broker asked to email them): huge.pdf", lines.join(" / "));
  check("...and a one-request application reads as before", documentsSummaryLines(small).join() === "Documents attached: 2", documentsSummaryLines(small).join());

  console.log("\n=== 5. The CRM file count ===");
  check("the whole application's count is used", applicationFileCount(12, 4) === 12, "");
  check("never less than what arrived", applicationFileCount(2, 4) === 4, "");
  check(`never more than the form allows (${MAX_APPLICATION_FILES})`, applicationFileCount(500, 4) === 4 && applicationFileCount(MAX_APPLICATION_FILES, 4) === MAX_APPLICATION_FILES, "");
  check("junk → what arrived", applicationFileCount("12", 4) === 4 && applicationFileCount(4.5, 4) === 4 && applicationFileCount(undefined, 3) === 3 && applicationFileCount(NaN, 0) === 0, "");

  console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
