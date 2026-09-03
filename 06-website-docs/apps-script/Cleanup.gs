/*************************************************************************
 * ONE-TIME CLEANUP — the 2026-09-02 form-spam flood
 * Funded Capital · added 2026-09-03
 *
 * Delete this whole file once it has been run. It exists to undo the damage
 * from a single incident and has no ongoing job.
 *
 * WHAT IT CLEANS
 *   1. "Submissions" sheet (broker portal tab) — the blank rows the bot's
 *      leads created while doPost was mis-routing them as applications.
 *   2. "Website Leads" sheet — the bot's lead rows, matched on the exact
 *      addresses it used, so nothing is deleted by guesswork.
 *   3. Quo — the fake contacts created from those leads, by ID.
 *
 * HOW TO RUN
 *   1. Pick `previewSpamCleanup` from the function dropdown and press Run,
 *      then View → Logs. Nothing is deleted. Read what it found.
 *   2. If the counts look right, pick `runSpamCleanup` and press Run.
 *   3. Delete this file.
 *
 * The Drive folders from this incident were already trashed on 2026-09-03.
 *************************************************************************/

/* The addresses the bot submitted. These are REAL people's addresses that it
 * harvested and used as the "from" of its fake leads — which is why they got
 * an acknowledgment email from luis@ they never asked for. Matching on this
 * exact list rather than on a date range means a genuine lead that happened to
 * arrive during the flood can never be deleted by mistake. */
var SPAM_LEAD_EMAILS = [
  'melmel2525@msn.com',
  'ddicarlantonio@exactsciences.com',
  'tk.e.ndei.gh@gmail.com',
  'qu.et.z.a.l.li.g.e.e@gmail.com',
  'pdeladi@aol.com',
  'lberry@mrs-cmc.com',
  'mhicks-kuskie@its4logistics.com',
  'jzinga@att.net',
  'ahtesham.adeel@neo4j.com',
  'james.wong@pfannenbergusa.com',
  'clark@spilighting.com',
  'ramby@web.de',
  'r.oroa.k.s@gmail.com',
  'kin.g.do.mof.w.i.n.d.s2.2@gmail.com',
  'harald.unseld@online.de',
  'najmachoksy@hotmail.co.uk',
  'm.at.t.hewsha.f.fe.r@gmail.com',
  'jyfiggs@yahoo.com',
  'benita.zum_dohme@web.de',
  'ib.i.f.o.x.59@gmail.com',
  'tobias.lamping@gmx.de',
  'la.u.r.e.n.m.a.r.q.u.ez.8.5@gmail.com'
];

/* Quo contact IDs created from those leads, captured 2026-09-03.
 * Vanessa Torres and Marshyionna Felix are REAL leads and are deliberately
 * absent from this list. */
var SPAM_QUO_CONTACT_IDS = [
  '6a98a7de4551a7425b419a25', '6a98a7a4028adddb28a36b02', '6a989a874551a7425b40f548',
  '6a989a84e74de7f10cefd23f', '6a98973f06590f4f48543219', '6a98973b4551a7425b4096e8',
  '6a9896104551a7425b407770', '6a988e5706590f4f4853a5a5', '6a988e5306590f4f4853a56b',
  '6a98874e028adddb28a25358', '6a9884bc06590f4f4852fe2d', '6a9884b97a0a3f40878af5c5',
  '6a98808606590f4f48529c04', '6a9880424551a7425b3ed146', '6a987f1c4551a7425b3ec1fd',
  '6a987f1906590f4f4852821f', '6a98779b4551a7425b3e5e5d', '6a9877974551a7425b3e5e27',
  '6a986aef028adddb28a12dae', '6a985feb4551a7425b3cdb99', '6a985c6906590f4f484f122a',
  '6a98595a4551a7425b3c2913', '6a98577f4551a7425b3c0647', '6a98577b7a0a3f40878a9391',
  '6a98552806590f4f484e5ad3', '6a9855244551a7425b3bd71b', '6a984cf206590f4f484d5420',
  '6a984cb406590f4f484d4e74', '6a98465e6597bd829a35453d', '6a9846234551a7425b3a7847',
  '6a984449028adddb289f29f2', '6a98444506590f4f484c3c89', '6a983761028adddb289e5fa4',
  '6a9823eb028adddb289d38a9', '6a9823af028adddb289d3298'
];

/* Only blank Submissions rows inside the attack window are removed. The window
 * is closed deliberately: blank rows exist from before 2026-09-02 too (earlier
 * website leads that hit the same mis-routing bug, including two REAL leads on
 * 8/31), and those are left alone as a record of what happened. */
var SPAM_WINDOW_START = new Date('2026-09-02T00:00:00Z');
var SPAM_WINDOW_END   = new Date('2026-09-03T04:00:00Z');

// ───────────────────────── ENTRY POINTS ─────────────────────────

/** Safe. Reports what would be deleted and deletes nothing. */
function previewSpamCleanup() {
  spamCleanup_(true);
}

/** Deletes. Run previewSpamCleanup first. */
function runSpamCleanup() {
  spamCleanup_(false);
}

// ───────────────────────── THE WORK ─────────────────────────

function spamCleanup_(dryRun) {
  var mode = dryRun ? 'PREVIEW (nothing will be deleted)' : 'LIVE — DELETING';
  Logger.log('=== Spam cleanup · ' + mode + ' ===');

  cleanSubmissionsSheet_(dryRun);
  cleanWebsiteLeadsSheet_(dryRun);
  cleanQuoContacts_(dryRun);

  Logger.log('=== Done. ' + (dryRun
    ? 'Run runSpamCleanup to apply.'
    : 'Delete this file now that it has run.') + ' ===');
}

/** 1. Blank broker-Submissions rows created by mis-routed website leads. */
function cleanSubmissionsSheet_(dryRun) {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sh) { Logger.log('Submissions: sheet not found — skipped.'); return; }

  var last = sh.getLastRow();
  if (last < 2) { Logger.log('Submissions: empty.'); return; }

  var rows = sh.getRange(2, 1, last - 1, 9).getValues();
  var doomed = [];

  for (var i = 0; i < rows.length; i++) {
    var when = rows[i][0];
    if (!(when instanceof Date)) continue;
    if (when < SPAM_WINDOW_START || when > SPAM_WINDOW_END) continue;

    // A real broker submission always carries at least a broker email or a
    // borrower name. All five identifying fields blank means the row came from
    // a website lead that doPost threw away.
    var identifying = [rows[i][1], rows[i][2], rows[i][3], rows[i][4], rows[i][5]];
    var allBlank = identifying.every(function (v) { return String(v || '').trim() === ''; });
    if (allBlank) doomed.push(i + 2); // +2: data starts at row 2
  }

  Logger.log('Submissions: ' + doomed.length + ' blank rows in the attack window.');
  if (dryRun || !doomed.length) return;

  // Delete bottom-up so earlier indexes stay valid.
  for (var d = doomed.length - 1; d >= 0; d--) sh.deleteRow(doomed[d]);
  Logger.log('Submissions: deleted ' + doomed.length + ' rows.');
}

/** 2. The bot's rows in the website leads sheet, matched by exact address. */
function cleanWebsiteLeadsSheet_(dryRun) {
  var ss = webSpreadsheet_();
  var sh = ss.getSheetByName(WEB_SHEET_TAB);
  if (!sh) { Logger.log('Website Leads: sheet not found — skipped.'); return; }

  var last = sh.getLastRow();
  if (last < 2) { Logger.log('Website Leads: empty.'); return; }

  var spam = {};
  SPAM_LEAD_EMAILS.forEach(function (e) { spam[e.toLowerCase()] = true; });

  var rows = sh.getRange(2, 1, last - 1, 8).getValues(); // A..H, H = Email
  var doomed = [];
  for (var i = 0; i < rows.length; i++) {
    var addr = String(rows[i][7] || '').trim().toLowerCase();
    if (addr && spam[addr]) doomed.push(i + 2);
  }

  Logger.log('Website Leads: ' + doomed.length + ' bot rows matched.');
  if (dryRun || !doomed.length) return;

  for (var d = doomed.length - 1; d >= 0; d--) sh.deleteRow(doomed[d]);
  Logger.log('Website Leads: deleted ' + doomed.length + ' rows.');
}

/** 3. The fake Quo contacts. */
function cleanQuoContacts_(dryRun) {
  var key = PropertiesService.getScriptProperties().getProperty('QUO_API_KEY');
  if (!key) {
    Logger.log('Quo: no QUO_API_KEY set — delete the ' +
               SPAM_QUO_CONTACT_IDS.length + ' contacts by hand in the Quo UI.');
    return;
  }

  Logger.log('Quo: ' + SPAM_QUO_CONTACT_IDS.length + ' fake contacts to remove.');
  if (dryRun) return;

  var ok = 0, failed = [];
  for (var i = 0; i < SPAM_QUO_CONTACT_IDS.length; i++) {
    var id = SPAM_QUO_CONTACT_IDS[i];
    try {
      var res = UrlFetchApp.fetch('https://api.openphone.com/v1/contacts/' + id, {
        method: 'delete',
        headers: { Authorization: key },
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      // 404 means it is already gone, which is the outcome we wanted anyway.
      if ((code >= 200 && code < 300) || code === 404) ok++;
      else failed.push(id + ' (HTTP ' + code + ')');
    } catch (e) {
      failed.push(id + ' (' + e + ')');
    }
    Utilities.sleep(120); // stay well under the API rate limit
  }

  Logger.log('Quo: removed ' + ok + '/' + SPAM_QUO_CONTACT_IDS.length + '.');
  if (failed.length) Logger.log('Quo: could not remove — ' + failed.join(', '));
}
