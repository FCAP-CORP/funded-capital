/* Paste this onto the END of the live Apps Script file, below the
 * block you pasted earlier. No redeploy needed - this one runs in the
 * editor only. Then: Run > markPaidOff_Sept2026 */

/* ==================================================================
 * MARK PAID OFF — the September 14 2026 payoffs
 * ==================================================================
 * Run ONCE from the Apps Script editor: pick markPaidOff_Sept2026
 * from the function dropdown and press Run. Safe to re-run.
 *
 * Doing this as a script rather than by hand is deliberate. Each
 * change is matched to a Participant ID and checked against the loan
 * ID before anything is written, and the whole thing reports what it
 * did by reading the cells back afterwards.
 *
 * It also scans for OTHER rows carrying the same loan, because one
 * loan can back several participations — sometimes for different
 * people — and half-marking a loan would leave one holder still being
 * promised payments that are not coming.
 * ================================================================== */

var PAYOFFS_SEPT2026 = [
  { id: 'FC-015', loan: '127895', y: 2026, m: 9, d: 14 },
  { id: 'FC-004', loan: '128399', y: 2026, m: 9, d: 14 }
];

function markPaidOff_Sept2026() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var parts = ss.getSheetByName(SHEET_PARTICIPANTS);
  if (!parts) throw new Error('No "' + SHEET_PARTICIPANTS + '" tab.');

  var cId     = headerCol_(parts, 'Participant ID');
  var cName   = headerCol_(parts, 'Full Legal Name');
  var cLoan   = headerCol_(parts, 'Loan ID / Reference');
  var cCap    = headerCol_(parts, 'Capital Contributed');
  var cStatus = headerCol_(parts, 'Status');
  var cPayoff = headerCol_(parts, 'Payoff Date');
  var cDue    = headerCol_(parts, 'Capital Return Due');
  var cBack   = headerCol_(parts, 'Capital Returned');

  if (!cPayoff || !cDue || !cBack) {
    throw new Error('The Paid Off columns are not there yet. ' +
                    'Run addPaidOffColumns_Sept2026 first.');
  }

  var firstRow = HEADER_ROW + 1;
  var lastRow = parts.getLastRow();
  var nRows = lastRow - HEADER_ROW;

  var ids = parts.getRange(firstRow, cId, nRows, 1).getValues();
  var loans = parts.getRange(firstRow, cLoan, nRows, 1).getValues();

  function rowOf(id) {
    for (var i = 0; i < nRows; i++) {
      if (String(ids[i][0]).trim() === id) return firstRow + i;
    }
    return 0;
  }
  function loanAt(row) {
    return String(loans[row - firstRow][0]).trim().replace(/\.0+$/, '');
  }

  var report = [];
  var touched = {};

  for (var k = 0; k < PAYOFFS_SEPT2026.length; k++) {
    var p = PAYOFFS_SEPT2026[k];
    var row = rowOf(p.id);
    if (!row) { report.push('SKIPPED ' + p.id + ' — no such Participant ID.'); continue; }

    // Guard: the row must be the loan we think it is. A mismatch means the
    // roster moved under us, and writing a payoff onto the wrong participation
    // would tell the wrong person their money is coming back.
    var actual = loanAt(row);
    if (actual !== String(p.loan)) {
      report.push('SKIPPED ' + p.id + ' at row ' + row + ' — expected loan ' + p.loan +
                  ' but the row says ' + (actual || '(blank)') + '. Nothing written.');
      continue;
    }

    var was = String(parts.getRange(row, cStatus).getValue()).trim();
    parts.getRange(row, cStatus).setValue(PAID_OFF_STATUS);
    // A DATE() formula rather than a JS Date: the date is then built inside the
    // spreadsheet's own timezone and cannot land a day early or late.
    parts.getRange(row, cPayoff)
         .setFormula('=DATE(' + p.y + ',' + p.m + ',' + p.d + ')')
         .setNumberFormat('mm/dd/yyyy');
    touched[p.id] = true;
    report.push('MARKED  ' + p.id + ' row ' + row + ' — loan ' + actual +
                ' — status ' + (was || '(blank)') + ' -> ' + PAID_OFF_STATUS + '.');
  }

  SpreadsheetApp.flush();

  /* ---- sibling check: same loan, not marked ---- */
  var warnings = [];
  for (var k2 = 0; k2 < PAYOFFS_SEPT2026.length; k2++) {
    var want = String(PAYOFFS_SEPT2026[k2].loan);
    for (var i = 0; i < nRows; i++) {
      var r = firstRow + i;
      var thisId = String(ids[i][0]).trim();
      if (!thisId || touched[thisId]) continue;
      if (loanAt(r) !== want) continue;
      warnings.push('  ' + thisId + ' (row ' + r + ') also carries loan ' + want +
                    ' and was NOT marked. Check whether it should be.');
    }
  }

  /* ---- read everything back ---- */
  var tz = ss.getSpreadsheetTimeZone();
  function fmt(v) {
    if (v instanceof Date) return Utilities.formatDate(v, tz, 'MM/dd/yyyy');
    return String(v === null || v === undefined ? '' : v);
  }

  var lines = [];
  var owed = 0;
  for (var i2 = 0; i2 < nRows; i2++) {
    var r2 = firstRow + i2;
    var st = String(parts.getRange(r2, cStatus).getValue()).trim();
    var po = parts.getRange(r2, cPayoff).getValue();
    if (st !== PAID_OFF_STATUS && !po) continue;
    var back = parts.getRange(r2, cBack).getValue();
    var cap = Number(parts.getRange(r2, cCap).getValue()) || 0;
    if (!back) owed += cap;
    lines.push('  ' + String(parts.getRange(r2, cId).getValue()).trim() +
               '  ' + String(parts.getRange(r2, cName).getValue()).trim() +
               '\n      loan ' + loanAt(r2) +
               '  ·  capital $' + cap.toLocaleString() +
               '\n      payoff ' + fmt(po) +
               '  ·  capital due back ' + fmt(parts.getRange(r2, cDue).getValue()) +
               '  ·  returned ' + (back ? fmt(back) : '(not yet)'));
  }

  var msg = 'MARK PAID OFF COMPLETE\n\n' + report.join('\n') + '\n\n' +
    (warnings.length
      ? 'CHECK THESE:\n' + warnings.join('\n') + '\n\n'
      : 'Sibling check: no other row carries either loan. Nothing left half-marked.\n\n') +
    'Paid off on the roster now:\n' + (lines.length ? lines.join('\n') : '  (none)') + '\n\n' +
    'CAPITAL STILL TO RETURN: $' + owed.toLocaleString() + '\n\n' +
    'When each wire goes out, type the date in the Capital Returned column and\n' +
    'the portal switches from "is being returned" to "was returned on ...".';

  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}
