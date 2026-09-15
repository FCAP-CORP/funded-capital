/* Paste this onto the END of the live Apps Script file.
 * No redeploy needed - it runs in the editor only.
 * Then: Run > paymentsInitiated_Sept2026 */

/* ==================================================================
 * PAYMENT INITIATED + the "behind on its own due date" fix
 * ==================================================================
 * Run ONCE from the Apps Script editor: pick
 * paymentsInitiated_Sept2026 and press Run. Safe to re-run.
 *
 * NO REDEPLOY NEEDED. This rides on the Payment Schedule's existing
 * Status column, which the web app already sends. Nothing about the
 * data the portal receives changes shape.
 *
 * TWO CHANGES, and they must happen in this order, which is the only
 * reason this is a script rather than four cells:
 *
 * 1. A payment stops counting as late on its own due date.
 *    "Payments Due to Date" counted the current month the moment the
 *    due date arrived, so on the 15th every unpaid row read PAYMENT
 *    BEHIND before the day was out. One character: the comparison
 *    becomes "on or before", so a period counts from the day AFTER
 *    it falls due. The portal never had this bug - it already showed
 *    these as "Due this month", which is why the Program Book
 *    disagreed with itself today.
 *
 * 2. "Payment initiated" - money sent, not yet logged as received.
 *    Set globally on Program Terms ("Payments initiated through"),
 *    or per payment in a new Initiated column on the Payment
 *    Schedule when one wire moves differently from the rest.
 *    Participants see "Payment initiated" on that row.
 *
 * The order matters: adding the Program Terms row shifts the holiday
 * table down, and the due-date formula points at it by row number.
 * Doing 1 before 2 by hand would leave it pointing at the wrong range.
 * ================================================================== */

var INITIATED_LABEL = 'Payments initiated through';
var INITIATED_COLUMN = 'Initiated';

function paymentsInitiated_Sept2026() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var terms = ss.getSheetByName('Program Terms');
  var parts = ss.getSheetByName(SHEET_PARTICIPANTS);
  var sched = ss.getSheetByName(SHEET_SCHEDULE);
  if (!terms || !parts || !sched) throw new Error('A required tab is missing.');

  var report = [];

  /* ---- 1. the global "initiated through" constant ---- */
  var initRow = findRow_(terms, INITIATED_LABEL);
  if (initRow) {
    report.push('Program Terms: "' + INITIATED_LABEL + '" already at B' + initRow + '.');
  } else {
    var anchor = findRow_(terms, '15th payment rule effective from');
    if (!anchor) throw new Error('Could not find the payment-rule constants on Program Terms.');
    initRow = anchor + 1;
    if (String(terms.getRange(initRow, 1).getValue()).trim() !== '') {
      terms.insertRowsAfter(anchor, 1);
    }
    terms.getRange(initRow, 1).setValue(INITIATED_LABEL);
    terms.getRange(initRow, 2).setNumberFormat('mm/dd/yyyy');
    terms.getRange(initRow, 3).setValue('date');
    terms.getRange(initRow, 4).setValue(
      'Any unpaid payment due on or before this date is shown to participants as ' +
      '"Payment initiated". Set it when a payment run goes out; clear it when the ' +
      'Payment Log has caught up. Leave blank to use only the per-payment column.');
    terms.getRange(initRow, 2).setNote(
      'Type the date the payment run was sent. Every unpaid scheduled payment due on ' +
      'or before it reads as "Payment initiated" in the portal until the Payment Log ' +
      'records it as received.');
    report.push('Program Terms: added "' + INITIATED_LABEL + '" at B' + initRow + ' (left blank).');
  }
  SpreadsheetApp.flush();

  /* ---- 2. the due-date fix, read back AFTER any row insert so the
            holiday range reference is whatever Sheets rewrote it to ---- */
  var cDue = headerCol_(parts, 'Payments Due to Date');
  if (!cDue) throw new Error('No "Payments Due to Date" column on the Participants tab.');
  var firstRow = HEADER_ROW + 1;
  var nParts = parts.getLastRow() - HEADER_ROW;
  var f = parts.getRange(firstRow, cDue).getFormula();

  if (!f) {
    report.push('WARNING: Payments Due to Date row ' + firstRow +
                ' is a typed value, not a formula. Not changed.');
  } else if (f.indexOf('TODAY()<=WORKDAY(') !== -1) {
    report.push('Due-date fix already applied.');
  } else if (f.indexOf('TODAY()<WORKDAY(') === -1) {
    report.push('WARNING: could not find the comparison to change in Payments Due to Date. ' +
                'Not changed - tell Claude what the formula looks like.');
  } else {
    parts.getRange(firstRow, cDue, nParts, 1)
         .setFormula(f.replace('TODAY()<WORKDAY(', 'TODAY()<=WORKDAY('));
    report.push('Payments Due to Date: a period now counts from the day AFTER it falls due (' +
                nParts + ' rows).');
  }
  SpreadsheetApp.flush();

  /* ---- 3. the per-payment Initiated column ---- */
  var cInit = headerCol_(sched, INITIATED_COLUMN);
  if (cInit) {
    report.push('Payment Schedule: "' + INITIATED_COLUMN + '" already at ' + colLetter_(cInit) + '.');
  } else {
    cInit = lastHeaderCol_(sched) + 1;
    if (cInit > sched.getMaxColumns()) sched.insertColumnsAfter(sched.getMaxColumns(), 1);
    sched.getRange(HEADER_ROW, cInit).setValue(INITIATED_COLUMN);
    report.push('Payment Schedule: added "' + INITIATED_COLUMN + '" at ' + colLetter_(cInit) + '.');
  }
  var nSched = sched.getLastRow() - HEADER_ROW;
  sched.getRange(HEADER_ROW + 1, cInit, nSched, 1).setNumberFormat('mm/dd/yyyy');
  sched.setColumnWidth(cInit, 110);
  sched.getRange(HEADER_ROW, cInit).setNote(
    'Optional. The date THIS payment was sent, when it moves differently from the rest ' +
    'of the run. Overrides the global "' + INITIATED_LABEL + '" on Program Terms. ' +
    'Leave blank for the normal case.');

  /* ---- 4. the Status formula gains an INITIATED branch ---- */
  var cStatus = headerCol_(sched, 'Status');
  var cDueDate = headerCol_(sched, 'Due Date');
  if (!cStatus || !cDueDate) throw new Error('Payment Schedule is missing Status or Due Date.');

  var g = sched.getRange(HEADER_ROW + 1, cStatus).getFormula();
  if (g.indexOf('"INITIATED"') !== -1) {
    report.push('Payment Schedule Status already has the INITIATED branch.');
  } else if (g.indexOf('"PAID",') === -1) {
    report.push('WARNING: the Status formula is not the shape expected. Not changed.');
  } else {
    var E = '$' + colLetter_(cDueDate) + (HEADER_ROW + 1);
    var L = '$' + colLetter_(cInit) + (HEADER_ROW + 1);
    var INIT = "'Program Terms'!$B$" + initRow;
    // Slotted in immediately after PAID: a logged payment always wins, and an
    // initiated one is checked before any date rule so it cannot read OVERDUE.
    var branch = 'IF(OR(' + L + '<>"",AND(' + INIT + '<>"",' + E + '<=' + INIT + ')),"INITIATED",';
    var at = g.indexOf('"PAID",') + '"PAID",'.length;
    var patched = g.slice(0, at) + branch + g.slice(at, g.length - 1) + ')' + g.slice(g.length - 1);
    sched.getRange(HEADER_ROW + 1, cStatus, nSched, 1).setFormula(patched);
    report.push('Payment Schedule Status: INITIATED branch added (' + nSched + ' rows).');
  }

  SpreadsheetApp.flush();

  /* ---- 5. read it all back ---- */
  var cAlert = headerCol_(parts, 'Alert');
  var cOwed = headerCol_(parts, 'Balance Owed');
  var alerts = parts.getRange(firstRow, cAlert, nParts, 1).getValues();
  var oweds = parts.getRange(firstRow, cOwed, nParts, 1).getValues();
  var behind = 0, owed = 0;
  for (var i = 0; i < nParts; i++) {
    if (String(alerts[i][0]).trim() === 'PAYMENT BEHIND') behind++;
    owed += Number(oweds[i][0]) || 0;
  }

  var statuses = sched.getRange(HEADER_ROW + 1, cStatus, nSched, 1).getValues();
  var tally = {};
  for (var j = 0; j < nSched; j++) {
    var v = String(statuses[j][0]).trim();
    if (!v) continue;
    tally[v] = (tally[v] || 0) + 1;
  }
  var tallyLines = [];
  for (var key in tally) tallyLines.push('  ' + key + ': ' + tally[key]);

  var msg = 'PAYMENT INITIATED SETUP COMPLETE\n\n' + report.join('\n') + '\n\n' +
    'Participants tab now reads:\n' +
    '  PAYMENT BEHIND: ' + behind + '\n' +
    '  Total balance owed: $' + owed.toLocaleString() + '\n\n' +
    'Payment Schedule statuses:\n' + tallyLines.join('\n') + '\n\n' +
    'TO MARK A PAYMENT RUN AS INITIATED\n' +
    '  Type the send date in Program Terms B' + initRow + '.\n' +
    '  Every unpaid payment due on or before it shows the participant\n' +
    '  "Payment initiated" until the Payment Log records it.\n' +
    '  For a single payment that moves on its own, put its date in the\n' +
    '  Initiated column (' + colLetter_(cInit) + ') on the Payment Schedule instead.\n\n' +
    'Participants see this within 30 minutes. No redeploy needed.';

  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}
