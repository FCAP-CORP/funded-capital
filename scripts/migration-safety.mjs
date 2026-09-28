/**
 * Which migration statements are too dangerous to run against production.
 * Used by scripts/apply-migration-prod.mjs; pinned by migration-safety.regress.ts.
 *
 * Deliberately blunt: it refuses rather than tries to judge intent, because the
 * cost of a wrong judgement here is borrower records.
 *
 * ONE NARROW EXCEPTION (26 Sep 2026): replacing a CHECK constraint.
 * Postgres cannot widen a CHECK in place — the only way to allow a new value
 * (a fifth nurture programme, say) is to drop the constraint and add it back
 * with the longer list. Dropping a CHECK cannot delete a row, a column or a
 * table; it only relaxes a rule for the instant before the new one lands. So a
 * `DROP CONSTRAINT IF EXISTS "<x>_check"` is allowed ONLY when the SAME
 * migration file also runs `ADD CONSTRAINT "<x>_check" CHECK (...)` for the
 * same table. Every other DROP is still refused, including a CHECK dropped and
 * not re-added, and any constraint whose name does not end in `_check`
 * (foreign keys, unique constraints and primary keys all do real work).
 */

export const FORBIDDEN = [
  [/\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA|DATABASE|CONSTRAINT|INDEX)\b/i, "DROP"],
  [/\bTRUNCATE\b/i, "TRUNCATE"],
  [/\bDELETE\s+FROM\b/i, "DELETE"],
  [/\bRENAME\s+(TO|COLUMN)\b/i, "RENAME"],
  [/\bALTER\s+COLUMN\b[\s\S]*?\bSET\s+NOT\s+NULL\b/i, "SET NOT NULL on an existing column"],
];

const DROP_CHECK = /^ALTER\s+TABLE\s+"?(\w+)"?\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+"?(\w+_check)"?$/i;

/** True when `stmt` drops a CHECK constraint that `fileStatements` re-adds on the same table. */
export function isCheckReplacement(stmt, fileStatements) {
  const m = DROP_CHECK.exec(stmt.trim());
  if (!m) return false;
  const [, table, name] = m;
  const readd = new RegExp(
    `^ALTER\\s+TABLE\\s+"?${table}"?\\s+ADD\\s+CONSTRAINT\\s+"?${name}"?\\s+CHECK\\s*\\(`,
    "i",
  );
  return fileStatements.some((s) => s !== stmt && readd.test(s.trim()));
}

/** Every refused statement in one file, as { name, snippet }. */
export function offencesIn(fileStatements) {
  const out = [];
  for (const s of fileStatements) {
    if (isCheckReplacement(s, fileStatements)) continue;
    for (const [re, name] of FORBIDDEN) {
      if (re.test(s)) out.push({ name, snippet: s.replace(/\s+/g, " ").slice(0, 100) });
    }
  }
  return out;
}
