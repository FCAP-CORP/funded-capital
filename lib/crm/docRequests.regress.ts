/**
 * Regression suite for document requests (lib/crm/docRequests.ts).
 *
 * What must never happen:
 *   §1  the automatic list asks for the wrong things for the loan type;
 *   §2  an item jumps to a status it cannot reach (accepted before anything
 *       was uploaded, an upload into a waived or removed item);
 *   §3  an upload smuggles a bad name, too many files, or junk data through.
 */
import {
  BROKER_STATUS_LABEL, DOC_STATUSES, MAX_FILE_BYTES, MAX_UPLOAD_BASE64, MAX_UPLOAD_FILES, packUploads, STAFF_STATUS_LABEL, STANDARD_ITEMS,
  canUploadTo, checklistFor, docSummary, parseCustomItem, parseUpload, shouldSeed, staffMove, uploadFolderName,
} from "./docRequests";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};
const keys = (p: string, purpose: string | null = "purchase") => checklistFor(p, purpose).map((i) => i.key).join(",");

console.log("\n=== 1. The automatic list ===");
check("fix and flip purchase", keys("fix_and_flip") === "entity,id,bank,contract,scope,track,insurance", keys("fix_and_flip"));
check("fix and flip refinance asks for the payoff and settlement, not a contract", keys("fix_and_flip", "cash_out_refi") === "entity,id,bank,payoff,settlement,scope,track,insurance", keys("fix_and_flip", "cash_out_refi"));
check("ground-up asks for plans, builder and budget", keys("ground_up") === "entity,id,bank,contract,plans,builder,budget,track,insurance", keys("ground_up"));
check("DSCR asks for leases, not a scope of work", keys("dscr") === "entity,id,bank,contract,leases,insurance", keys("dscr"));
check("bridge asks for operating history and exit", keys("bridge") === "entity,id,bank,contract,operating,exit,track,insurance", keys("bridge"));
check("unknown product gets the common items", keys("unknown") === "entity,id,bank,contract,insurance", keys("unknown"));
check("no purpose recorded → treated as a purchase", keys("dscr", null) === keys("dscr", "purchase"), "");
check("every standard item has a label and a hint", STANDARD_ITEMS.every((i) => i.label.length > 3 && i.hint.length > 10), "");
check("no item quotes a rate, an amount or a guarantee", STANDARD_ITEMS.every((i) => !/\d+(\.\d+)?\s?%|\$\s?\d|guarantee|approved/i.test(`${i.label} ${i.hint}`)), "");
check("no duplicate keys in any list", ["fix_and_flip", "ground_up", "dscr", "bridge", "multifamily", "unknown"].every((p) => new Set(checklistFor(p, "cash_out_refi").map((i) => i.key)).size === checklistFor(p, "cash_out_refi").length), "");
check("the list starts at term sheet", shouldSeed("term_sheet_issued") && shouldSeed("underwriting") && shouldSeed("docs_out"), "");
check("…not for a lead, a funded or a lost deal", !shouldSeed("lead") && !shouldSeed("qualified") && !shouldSeed("funded") && !shouldSeed("closed_lost") && !shouldSeed(null), "");

console.log("\n=== 2. Moves ===");
const mv = (from: string, move: string) => { const r = staffMove(from, move); return r.ok ? r.to : "refused"; };
check("accept a received item", mv("received", "accept") === "accepted", "");
check("cannot accept what was never uploaded", mv("requested", "accept") === "refused", "");
check("needs another copy → back to needed", mv("received", "again") === "requested" && mv("accepted", "again") === "requested", "");
check("cannot ask again for something still needed", mv("requested", "again") === "refused", "");
check("waive a needed item", mv("requested", "waive") === "waived", "");
check("cannot waive an accepted item (remove it instead)", mv("accepted", "waive") === "refused", "");
check("remove from any live status", ["requested", "received", "accepted", "waived"].every((s) => mv(s, "remove") === "removed"), "");
check("reopen a waived or removed item", mv("waived", "reopen") === "requested" && mv("removed", "reopen") === "requested", "");
check("unknown move refused", mv("requested", "delete") === "refused", "");
check("uploads only to needed or under-review items", canUploadTo("requested") && canUploadTo("received") && !canUploadTo("accepted") && !canUploadTo("waived") && !canUploadTo("removed"), "");
check("every status has both labels", DOC_STATUSES.every((s) => STAFF_STATUS_LABEL[s] && BROKER_STATUS_LABEL[s]), "");
const sum = docSummary([{ status: "requested" }, { status: "received" }, { status: "accepted" }, { status: "waived" }, { status: "removed" }]);
check("summary ignores removed items", sum.total === 4 && sum.needed === 1 && sum.review === 1 && sum.done === 2, JSON.stringify(sum));

console.log("\n=== 3. Custom items and uploads ===");
check("custom item: name required", !parseCustomItem("", null).ok && !parseCustomItem("x", null).ok, "");
check("custom item: trimmed and collapsed", (() => { const r = parseCustomItem("  HOA   estoppel letter ", "  from the association "); return r.ok && r.label === "HOA estoppel letter" && r.note === "from the association"; })(), "");
check("custom item: overlong name refused", !parseCustomItem("x".repeat(121), null).ok, "");
const A = "7f1c2e9a-1b2c-4d5e-8f90-123456789abc", R = "8a1c2e9a-1b2c-4d5e-8f90-123456789abc";
const good = parseUpload({ applicationId: A, requestId: R, files: [{ name: "bank/../statement:1.pdf", mimeType: "application/pdf", data: "JVBERi0xLjQK" }] });
check("upload: names are cleaned of path and reserved characters", good.ok && good.files[0].name === "bank-..-statement-1.pdf", good.ok ? good.files[0].name : "");
check("upload: ids must be uuids", !parseUpload({ applicationId: "1 OR 1=1", requestId: R, files: [{ name: "a", data: "QQ==" }] }).ok, "");
check("upload: no files refused", (() => { const r = parseUpload({ applicationId: A, requestId: R, files: [] }); return !r.ok && r.error === "no_files"; })(), "");
check(`upload: more than ${MAX_UPLOAD_FILES} files refused`, (() => { const r = parseUpload({ applicationId: A, requestId: R, files: Array.from({ length: 11 }, () => ({ name: "a.pdf", data: "QQ==" })) }); return !r.ok && r.error === "too_many_files"; })(), "");
check("upload: too large refused", (() => { const r = parseUpload({ applicationId: A, requestId: R, files: [{ name: "a.pdf", data: "Q".repeat(30_000_001) }] }); return !r.ok && r.error === "files_too_large"; })(), "");
check("upload: non-base64 data refused", (() => { const r = parseUpload({ applicationId: A, requestId: R, files: [{ name: "a.pdf", data: "<script>" }] }); return !r.ok && r.error === "bad_file"; })(), "");
check("upload: an odd mime type becomes octet-stream", (() => { const r = parseUpload({ applicationId: A, requestId: R, files: [{ name: "a", mimeType: "text/html; evil", data: "QQ==" }] }); return r.ok && r.files[0].mimeType === "application/octet-stream"; })(), "");
const folder = uploadFolderName({ borrower: "Tony Esposito", property: "358 Cozart Ave SW", item: "Bank statements, last 2 months", day: "2026-09-29" });
check("folder name says it is more documents for an existing deal", folder === "Documents for Tony Esposito - 358 Cozart Ave SW - Bank statements, last 2 months - 2026-09-29", folder);
check("folder name is capped and safe", uploadFolderName({ borrower: "A/B:C".repeat(40), property: null, item: "x", day: "d" }).length <= 120 && !/[\\/:]/.test(uploadFolderName({ borrower: "A/B:C", property: null, item: "x", day: "d" })), "");

const MB = 1_000_000;
const packed = packUploads([{ size: 1 * MB }, { size: 1 * MB }, { size: 1.5 * MB }, { size: 9 * MB }, { size: 0.2 * MB }]);
check("upload packing: files fill requests in order under the limit", packed.batches.length === 2 && packed.batches[0].length === 2 && packed.batches[1].length === 2, JSON.stringify(packed.batches.map((b) => b.map((f) => f.size))));
check("upload packing: a file too big for any request is held back", packed.tooBig.length === 1 && packed.tooBig[0].size === 9 * MB, "");
check("upload packing: every request fits Vercel's 4.5 MB body limit", MAX_UPLOAD_BASE64 + 16_000 < 4_500_000 && Math.ceil(MAX_FILE_BYTES / 3) * 4 <= MAX_UPLOAD_BASE64, `${MAX_UPLOAD_BASE64}`);
check(`upload packing: never more than ${MAX_UPLOAD_FILES} files a request`, packUploads(Array.from({ length: 25 }, () => ({ size: 1000 }))).batches.every((b) => b.length <= MAX_UPLOAD_FILES), "");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
