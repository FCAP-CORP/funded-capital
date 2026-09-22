/* Paste this onto the END of the live Apps Script file.
 * No redeploy needed - it runs in the editor only.
 * Then: Run > logSeptember2026Payments
 * ==================================================================
 * LOG THE SEPTEMBER 2026 PAYMENT RUN
 * ==================================================================
 * Writes one Payment Log entry per participation for the 09/15/2026
 * period, then clears the "Payments initiated through" flag because the
 * log has caught up and the flag has done its job.
 *
 * WHAT IT DECIDES FOR ITSELF, so nothing is typed twice or guessed:
 *   - WHICH participations: every one with a scheduled payment due
 *     09/15/2026 that is not Paid Off. Paid-off participations stopped
 *     at payoff and must never receive a September entry.
 *   - HOW MUCH: the Scheduled Amount on that participation's own
 *     schedule row. Never hardcoded, so a Silver row sends 1,250 and a
 *     Gold row 2,500 without this script knowing either number.
 *
 * WHAT IS FIXED, from what Luis reported:
 *   - Date Sent 09/15/2026 (disbursed that day, after the wire cut-off)
 *   - Payment Period 09/15/2026
 *   - Method "Wire"
 *   - Confirmation / Ref # left BLANK, matching all 21 existing entries
 *
 * SAFE TO RE-RUN. Before writing anything it checks the log for an
 * existing entry on the same participation and period, and skips it.
 * Running twice cannot double anyone's Paid to Date.
 * ================================================================== */

var SEPT_RUN = { y: 2026, m: 9, d: 15, method: 'Wire' };

function logSeptember2026Payments() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var parts = ss.getSheetByName(SHEET_PARTICIPANTS);
  var sched = ss.getSheetByName(SHEET_SCHEDULE);
  var log = ss.getSheetByName(SHEET_LOG);
  var terms = ss.getSheetByName('Program Terms');
  if (!parts || !sched || !log || !terms) throw new Error('A required tab is missing.');

  var tz = ss.getSpreadsheetTimeZone();
  function ymd(v) {
    if (!(v instanceof Date)) return '';
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  var TARGET = SEPT_RUN.y + '-' +
               ('0' + SEPT_RUN.m).slice(-2) + '-' +
               ('0' + SEPT_RUN.d).slice(-2);
  var TARGET_US = ('0' + SEPT_RUN.m).slice(-2) + '/' +
                  ('0' + SEPT_RUN.d).slice(-2) + '/' + SEPT_RUN.y;

  /* ---- 1. who is eligible ---- */
  var pFirst = HEADER_ROW + 1;
  var pN = parts.getLastRow() - HEADER_ROW;
  var cId = headerCol_(parts, 'Participant ID');
  var cName = headerCol_(parts, 'Full Legal Name');
  var cStatus = headerCol_(parts, 'Status');
  var cPayoff = headerCol_(parts, 'Payoff Date');

  var status = {}, name = {};
  var pIds = parts.getRange(pFirst, cId, pN, 1).getValues();
  var pSt = parts.getRange(pFirst, cStatus, pN, 1).getValues();
  var pNm = parts.getRange(pFirst, cName, pN, 1).getValues();
  var pPo = cPayoff ? parts.getRange(pFirst, cPayoff, pN, 1).getValues() : null;
  for (var i = 0; i < pN; i++) {
    var id = String(pIds[i][0]).trim();
    if (!id) continue;
    status[id] = String(pSt[i][0]).trim();
    name[id] = String(pNm[i][0]).trim();
    // A payoff date alone disqualifies, even if the dropdown was not changed.
    if (pPo && pPo[i][0]) status[id] = PAID_OFF_STATUS;
  }

  /* ---- 2. what was scheduled for this period ---- */
  var sFirst = HEADER_ROW + 1;
  var sN = sched.getLastRow() - HEADER_ROW;
  var sId = headerCol_(sched, 'Participant ID');
  var sDue = headerCol_(sched, 'Due Date');
  var sAmt = headerCol_(sched, 'Scheduled Amount');
  var sIds = sched.getRange(sFirst, sId, sN, 1).getValues();
  var sDues = sched.getRange(sFirst, sDue, sN, 1).getValues();
  var sAmts = sched.getRange(sFirst, sAmt, sN, 1).getValues();

  var due = [];
  for (var j = 0; j < sN; j++) {
    if (ymd(sDues[j][0]) !== TARGET) continue;
    var sid = String(sIds[j][0]).trim();
    if (!sid) continue;
    due.push({ id: sid, amount: Number(sAmts[j][0]) || 0 });
  }

  /* ---- 3. what is already logged for this period ---- */
  var lFirst = HEADER_ROW + 1;
  var lLast = log.getLastRow();
  var lN = Math.max(0, lLast - HEADER_ROW);
  var lSeq = 1, already = {}, nextRow = lFirst;
  if (lN > 0) {
    var lVals = log.getRange(lFirst, 1, lN, 5).getValues();
    for (var k = 0; k < lN; k++) {
      var lid = String(lVals[k][1]).trim();
      if (!lid) continue;
      nextRow = lFirst + k + 1;
      var n = Number(lVals[k][0]);
      if (isFinite(n) && n >= lSeq) lSeq = n + 1;
      if (ymd(lVals[k][3]) === TARGET) already[lid] = true;
    }
  }

  /* ---- 4. write ---- */
  var wrote = [], skipped = [], total = 0;
  for (var q = 0; q < due.length; q++) {
    var row = due[q];
    if (status[row.id] === PAID_OFF_STATUS) {
      skipped.push('  ' + row.id + ' — paid off, payments stopped. No entry.');
      continue;
    }
    if (already[row.id]) {
      skipped.push('  ' + row.id + ' — already logged for ' + TARGET_US + '. Left alone.');
      continue;
    }
    if (!row.amount) {
      skipped.push('  ' + row.id + ' — scheduled amount is blank. Nothing written.');
      continue;
    }

    log.getRange(nextRow, 1).setValue(lSeq);
    log.getRange(nextRow, 2).setValue(row.id);
    // DATE() rather than a JS Date: built inside the spreadsheet's own frame,
    // so it cannot land a day early or late whatever the script timezone is.
    var dateFormula = '=DATE(' + SEPT_RUN.y + ',' + SEPT_RUN.m + ',' + SEPT_RUN.d + ')';
    log.getRange(nextRow, 3).setFormula(dateFormula).setNumberFormat('mm/dd/yyyy');
    log.getRange(nextRow, 4).setFormula(dateFormula).setNumberFormat('mm/dd/yyyy');
    log.getRange(nextRow, 5).setValue(row.amount);
    log.getRange(nextRow, 6).setValue(SEPT_RUN.method);
    // Column G (Confirmation / Ref #) is deliberately left blank, and H and I
    // are left untouched — they fill themselves from the participation.

    wrote.push('  ' + row.id + '  ' + (name[row.id] || '') +
               '  $' + row.amount.toLocaleString() + '  row ' + nextRow);
    total += row.amount;
    lSeq++;
    nextRow++;
  }

  /* ---- 5. the initiated flag has done its job ---- */
  var initRow = findRow_(terms, INITIATED_LABEL);
  var clearedNote = '';
  if (initRow) {
    var had = terms.getRange(initRow, 2).getValue();
    if (had) {
      terms.getRange(initRow, 2).clearContent();
      clearedNote = 'Cleared "' + INITIATED_LABEL + '" (was ' + ymd(had) + ').';
    } else {
      clearedNote = '"' + INITIATED_LABEL + '" was already blank.';
    }
  }

  SpreadsheetApp.flush();

  /* ---- 6. read the results back ---- */
  var cAlert = headerCol_(parts, 'Alert');
  var cOwed = headerCol_(parts, 'Balance Owed');
  var cPaid = headerCol_(parts, 'Total Paid to Date');
  var alerts = parts.getRange(pFirst, cAlert, pN, 1).getValues();
  var oweds = parts.getRange(pFirst, cOwed, pN, 1).getValues();
  var paids = parts.getRange(pFirst, cPaid, pN, 1).getValues();
  var behind = 0, owed = 0, paidAll = 0;
  for (var z = 0; z < pN; z++) {
    if (String(alerts[z][0]).trim() === 'PAYMENT BEHIND') behind++;
    owed += Number(oweds[z][0]) || 0;
    paidAll += Number(paids[z][0]) || 0;
  }

  var statuses = sched.getRange(sFirst, headerCol_(sched, 'Status'), sN, 1).getValues();
  var tally = {};
  for (var t = 0; t < sN; t++) {
    var v = String(statuses[t][0]).trim();
    if (v) tally[v] = (tally[v] || 0) + 1;
  }
  var tallyLines = [];
  for (var key in tally) tallyLines.push('  ' + key + ': ' + tally[key]);

  var msg = 'SEPTEMBER 2026 PAYMENT RUN LOGGED\n\n' +
    'Written (' + wrote.length + ' entries, $' + total.toLocaleString() + '):\n' +
    (wrote.length ? wrote.join('\n') : '  (nothing)') + '\n\n' +
    (skipped.length ? 'Skipped:\n' + skipped.join('\n') + '\n\n' : '') +
    clearedNote + '\n\n' +
    'Participants tab now reads:\n' +
    '  PAYMENT BEHIND: ' + behind + '\n' +
    '  Total balance owed: $' + owed.toLocaleString() + '\n' +
    '  Total paid to date: $' + paidAll.toLocaleString() + '\n\n' +
    'Payment Schedule statuses:\n' + tallyLines.join('\n') + '\n\n' +
    'Participants see this within 30 minutes. Confirmation / Ref # was left\n' +
    'blank on every entry — fill column G when you have the wire references.';

  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}
