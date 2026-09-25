/**
 * Regression suite for encrypting the Gmail refresh token at rest.
 * A refresh token is a standing key to send mail as Luis; these pin that it is
 * never readable without GMAIL_TOKEN_KEY and that tampering is detected.
 */
import { randomBytes } from "node:crypto";
import { decryptToken, encryptToken, parseTokenKey } from "./tokenCrypto";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail: string) => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "**FAIL**"}  ${name}  ${detail}`);
};

const KEY_B64 = randomBytes(32).toString("base64");
const key = parseTokenKey(KEY_B64)!;
const other = parseTokenKey(randomBytes(32).toString("base64"))!;
const TOKEN = "1//0gFakeRefreshToken-abc_DEF.123";

console.log("\n=== 1. The key: exactly 32 bytes or nothing ===");
check("a 32-byte base64 key parses", key?.length === 32, "32 bytes");
check("unset → null (fail closed)", parseTokenKey(undefined) === null && parseTokenKey("") === null, "null");
check("16 bytes → null", parseTokenKey(randomBytes(16).toString("base64")) === null, "null");
check("48 bytes → null", parseTokenKey(randomBytes(48).toString("base64")) === null, "null");
check("not base64 → null", parseTokenKey("this is not a key at all!!!!!!!!!!!!!") === null, "null");
check("surrounding whitespace is tolerated", parseTokenKey(`  ${KEY_B64}\n`)?.equals(key) === true, "trimmed");

console.log("\n=== 2. Round trip, and nothing readable without the key ===");
const enc = encryptToken(TOKEN, key);
check("decrypts to the original", decryptToken(enc, key) === TOKEN, "round trip");
check("stored form is versioned v1:iv:tag:ct", /^v1:[^:]+:[^:]+:[^:]+$/.test(enc), enc.slice(0, 12) + "…");
check("the token does not appear in the stored form", !enc.includes(TOKEN) && !enc.includes(Buffer.from(TOKEN).toString("base64")), "opaque");
check("two encryptions differ (fresh IV)", encryptToken(TOKEN, key) !== enc, "random IV");
check("the wrong key → null, no throw", decryptToken(enc, other) === null, "null");

console.log("\n=== 3. Tampering is detected ===");
const parts = enc.split(":");
const flip = (b64: string) => { const b = Buffer.from(b64, "base64"); b[0] ^= 1; return b.toString("base64"); };
check("changed ciphertext → null", decryptToken([parts[0], parts[1], parts[2], flip(parts[3])].join(":"), key) === null, "GCM tag");
check("changed tag → null", decryptToken([parts[0], parts[1], flip(parts[2]), parts[3]].join(":"), key) === null, "GCM tag");
check("changed IV → null", decryptToken([parts[0], flip(parts[1]), parts[2], parts[3]].join(":"), key) === null, "GCM tag");
check("wrong version → null", decryptToken(["v2", ...parts.slice(1)].join(":"), key) === null, "null");
check("garbage → null", decryptToken("hello", key) === null && decryptToken("", key) === null, "null");
let threw = false;
try { encryptToken(TOKEN, Buffer.alloc(16)); } catch { threw = true; }
check("encrypting with a short key throws", threw, "refused");

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail > 0 ? 1 : 0);
