/* Paste everything below onto the END of the live Apps Script file.
 * Do not change anything above it — line 19 holds the shared secret.
 * Then: Deploy > Manage deployments > edit the live one > Version: New
 * version > Deploy. Then Run > addPaidOffColumns_Sept2026. */

/* ==================================================================
 * PAID OFF — September 2026
 * ==================================================================
 * Run ONCE from the Apps Script editor: pick addPaidOffColumns_Sept2026
 * from the function dropdown and press Run. Safe to re-run — every step
 * checks before it writes and the report says exactly what changed.
 *
 * WHY THIS EXISTS
 * A borrower who repays before maturity ends that participation's payment
 * stream early and triggers the return of the capital contribution within
 * ten business days. "Matured" is the wrong word for that — a matured loan
 * ran its full term. So the tracker gains a real Paid Off status and three
 * columns that carry the facts the portal needs:
 *
 *   Payoff Date          typed by hand, the day the borrower repaid
 *   Capital Return Due   a formula: ten business days later, holidays skipped
 *   Capital Returned     typed by hand once the wire goes out
 *
 * The columns are APPENDED at the right-hand end. Nothing shifts, so no
 * existing formula, named range or column letter changes meaning.
 *
 * It also guards two existing formulas so a paid-off row stops accruing a
 * debt that no longer exists: Payments Due to Date freezes at the number of
 * payments actually logged (making Balance Owed zero), and Alert reads
 * "Paid off" instead of ageing into "PAYMENT BEHIND".
 * ================================================================== */

/*
 * SELF-INSTALLING FIELD MAP.
 *
 * These four lines are why this whole block can be pasted onto the END of the
 * live script without touching a single existing line — which matters, because
 * line 19 of the live copy holds the shared secret and the copy in the repo
 * does not. They run at load, before doGet, so the web app returns the three
 * new columns whether or not the maps further up have been edited. Assigning a
 * key that is already there changes nothing, so this is safe every time.
 */
PARTICIPANT_FIELDS['Payoff Date'] = 'payoffDate';
PARTICIPANT_FIELDS['Capital Return Due'] = 'capitalReturnDue';
PARTICIPANT_FIELDS['Capital Returned'] = 'capitalReturned';
DATE_KEYS.payoffDate = true;
DATE_KEYS.capitalReturnDue = true;
DATE_KEYS.capitalReturned = true;

var PAID_OFF_STATUS = 'Paid Off';
var CAPITAL_RETURN_BUSINESS_DAYS = 10;

var PAID_OFF_COLUMNS = ['Payoff Date', 'Capital Return Due', 'Capital Returned'];

/** 1 -> A, 27 -> AA. */
function colLetter_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = (n - m - 1) / 26;
  }
  return s;
}

/** Column number of a header on the header row, or 0 if it is not there. */
function headerCol_(sheet, name) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
  for (var c = 0; c < headers.length; c++) {
    if (String(headers[c]).trim() === name) return c + 1;
  }
  return 0;
}

/** The right-most column that actually has a header. getLastColumn() can overshoot. */
function lastHeaderCol_(sheet) {
  var headers = sheet.getRange(HEADER_ROW, 1, 1, sheet.getMaxColumns()).getValues()[0];
  for (var c = headers.length - 1; c >= 0; c--) {
    if (String(headers[c]).trim() !== '') return c + 1;
  }
  return 0;
}

function addPaidOffColumns_Sept2026() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var parts = ss.getSheetByName(SHEET_PARTICIPANTS);
  var terms = ss.getSheetByName('Program Terms');
  if (!parts) throw new Error('No "' + SHEET_PARTICIPANTS + '" tab.');
  if (!terms) throw new Error('No "Program Terms" tab.');

  var report = [];
  var lastRow = parts.getLastRow();
  if (lastRow <= HEADER_ROW) throw new Error('No participant rows to work on.');
  var nRows = lastRow - HEADER_ROW;

  /* ---- 1. the three columns, appended at the end ---- */
  var col = {};
  for (var i = 0; i < PAID_OFF_COLUMNS.length; i++) {
    var name = PAID_OFF_COLUMNS[i];
    var at = headerCol_(parts, name);
    if (at) {
      report.push('Column "' + name + '" already at ' + colLetter_(at) + '. Left alone.');
    } else {
      at = lastHeaderCol_(parts) + 1;
      if (at > parts.getMaxColumns()) parts.insertColumnsAfter(parts.getMaxColumns(), 1);
      parts.getRange(HEADER_ROW, at).setValue(name);
      report.push('Added "' + name + '" at ' + colLetter_(at) + '.');
    }
    col[name] = at;
  }

  // Match the header styling of the column to their left so the new ones do
  // not look bolted on. Copying format only — never values.
  var modelCol = col['Payoff Date'] - 1;
  if (modelCol >= 1) {
    parts.getRange(HEADER_ROW, modelCol).copyTo(
      parts.getRange(HEADER_ROW, col['Payoff Date'], 1, PAID_OFF_COLUMNS.length),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    // copyTo with PASTE_FORMAT keeps the header text we just wrote.
  }

  var payoffL = colLetter_(col['Payoff Date']);
  var dueL = colLetter_(col['Capital Return Due']);
  var backL = colLetter_(col['Capital Returned']);

  parts.getRange(HEADER_ROW + 1, col['Payoff Date'], nRows, 1).setNumberFormat('mm/dd/yyyy');
  parts.getRange(HEADER_ROW + 1, col['Capital Return Due'], nRows, 1).setNumberFormat('mm/dd/yyyy');
  parts.getRange(HEADER_ROW + 1, col['Capital Returned'], nRows, 1).setNumberFormat('mm/dd/yyyy');

  parts.setColumnWidth(col['Payoff Date'], 110);
  parts.setColumnWidth(col['Capital Return Due'], 130);
  parts.setColumnWidth(col['Capital Returned'], 120);

  parts.getRange(HEADER_ROW, col['Payoff Date']).setNote(
    'The date the borrower repaid the designated loan, if it was repaid before maturity.\n' +
    'Type it as a date. Leave blank on every loan running to term.\n' +
    'Entering it is what tells the portal the payments have stopped.');
  parts.getRange(HEADER_ROW, col['Capital Return Due']).setNote(
    'FORMULA — do not type over it.\n' +
    CAPITAL_RETURN_BUSINESS_DAYS + ' business days after the payoff date, US federal holidays skipped.\n' +
    'This is the date the participant is told to expect their capital back.');
  parts.getRange(HEADER_ROW, col['Capital Returned']).setNote(
    'The date the capital contribution actually went back to the participant.\n' +
    'While this is blank the portal says the capital "is being returned, expected by <due date>".\n' +
    'Once it holds a date the portal says "returned on <that date>".');

  /* ---- 2. Capital Return Due formula ---- */
  var holHeader = findRowStarting_(terms, 'US FEDERAL HOLIDAYS');
  if (!holHeader) throw new Error('Could not find the US FEDERAL HOLIDAYS block on Program Terms.');
  var holStart = holHeader + 2;
  if (!(terms.getRange(holStart, 1).getValue() instanceof Date)) {
    throw new Error('Expected holiday dates at Program Terms A' + holStart + '.');
  }
  var holEnd = holStart;
  while (terms.getRange(holEnd + 1, 1).getValue() instanceof Date) holEnd++;
  var HOL = "'Program Terms'!$A$" + holStart + ':$A$' + holEnd;

  var firstDataRow = HEADER_ROW + 1;
  parts.getRange(firstDataRow, col['Capital Return Due'], nRows, 1).setFormula(
    '=IF($' + payoffL + firstDataRow + '="","",WORKDAY($' + payoffL + firstDataRow + ',' +
    CAPITAL_RETURN_BUSINESS_DAYS + ',' + HOL + '))');
  report.push('Capital Return Due = WORKDAY(payoff, ' + CAPITAL_RETURN_BUSINESS_DAYS +
              ', ' + HOL + ') on ' + nRows + ' rows.');

  /* ---- 3. "Paid Off" in the Status dropdown ---- */
  var statusCol = headerCol_(parts, 'Status');
  if (!statusCol) throw new Error('No "Status" column on the Participants tab.');
  var statusRange = parts.getRange(firstDataRow, statusCol, nRows, 1);
  var rule = parts.getRange(firstDataRow, statusCol).getDataValidation();
  if (!rule) {
    report.push('WARNING: Status has no dropdown to extend. Type "' + PAID_OFF_STATUS +
                '" exactly, capital P and capital O.');
  } else if (rule.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    report.push('WARNING: the Status dropdown is driven by a range, not a typed list. ' +
                'Add "' + PAID_OFF_STATUS + '" to that range by hand.');
  } else {
    var values = rule.getCriteriaValues()[0].slice();
    var has = false;
    for (var v = 0; v < values.length; v++) {
      if (String(values[v]).trim().toLowerCase() === PAID_OFF_STATUS.toLowerCase()) has = true;
    }
    if (has) {
      report.push('Status dropdown already offers "' + PAID_OFF_STATUS + '".');
    } else {
      values.push(PAID_OFF_STATUS);
      statusRange.setDataValidation(
        SpreadsheetApp.newDataValidation()
          .requireValueInList(values, true)
          .setAllowInvalid(rule.getAllowInvalid())
          .build());
      report.push('Status dropdown now offers: ' + values.join(', '));
    }
  }
  var statusL = colLetter_(statusCol);

  /* ---- 4. stop a paid-off row accruing a debt it does not owe ---- */
  // Both formulas are wrapped rather than rewritten: whatever is in the cell
  // today keeps running for every row that has not paid off. Wrapping also
  // makes this safe to re-run — a wrapped formula is detected and skipped.
  var guard = '=IF($' + statusL + firstDataRow + '="' + PAID_OFF_STATUS + '",';

  function wrap_(headerName, paidOffValue) {
    var c = headerCol_(parts, headerName);
    if (!c) { report.push('WARNING: no "' + headerName + '" column — not guarded.'); return; }
    var f = parts.getRange(firstDataRow, c).getFormula();
    if (!f) {
      report.push('WARNING: "' + headerName + '" row ' + firstDataRow +
                  ' holds a typed value, not a formula — not guarded.');
      return;
    }
    if (f.indexOf(guard) === 0) {
      report.push('"' + headerName + '" already guarded.');
      return;
    }
    parts.getRange(firstDataRow, c, nRows, 1)
      .setFormula(guard + paidOffValue + ',' + f.substring(1) + ')');
    report.push('"' + headerName + '" guarded — paid-off rows read ' + paidOffValue + '.');
  }

  var loggedCol = headerCol_(parts, 'Payments Logged');
  if (!loggedCol) throw new Error('No "Payments Logged" column on the Participants tab.');
  // Freezing payments-due at payments-logged is what drives Balance Owed to
  // zero. It is the honest number too: once the loan repaid, the payments that
  // were due are exactly the ones that were made.
  wrap_('Payments Due to Date', '$' + colLetter_(loggedCol) + firstDataRow);
  wrap_('Alert', '"Paid off"');

  SpreadsheetApp.flush();

  /* ---- 5. read back what is actually there now ---- */
  var tz = ss.getSpreadsheetTimeZone();
  function fmt(v) {
    if (v instanceof Date) return Utilities.formatDate(v, tz, 'MM/dd/yyyy');
    return String(v === null || v === undefined ? '' : v);
  }

  var ids = parts.getRange(firstDataRow, 1, nRows, 1).getValues();
  var statuses = parts.getRange(firstDataRow, statusCol, nRows, 1).getValues();
  var payoffs = parts.getRange(firstDataRow, col['Payoff Date'], nRows, 1).getValues();
  var dues = parts.getRange(firstDataRow, col['Capital Return Due'], nRows, 1).getValues();
  var backs = parts.getRange(firstDataRow, col['Capital Returned'], nRows, 1).getValues();

  var lines = [];
  for (var r = 0; r < nRows; r++) {
    var st = String(statuses[r][0]).trim();
    var po = payoffs[r][0];
    if (st !== PAID_OFF_STATUS && !po) continue;
    lines.push('  ' + ids[r][0] + '  ' + st +
               '  payoff ' + (po ? fmt(po) : '(blank)') +
               '  due back ' + (dues[r][0] ? fmt(dues[r][0]) : '(blank)') +
               '  returned ' + (backs[r][0] ? fmt(backs[r][0]) : '(not yet)'));
  }

  var msg = 'PAID OFF SETUP COMPLETE\n\n' + report.join('\n') +
    '\n\nColumns: Payoff Date ' + payoffL +
    ', Capital Return Due ' + dueL +
    ', Capital Returned ' + backL + '\n\n' +
    'Rows marked paid off right now:\n' +
    (lines.length ? lines.join('\n') : '  (none yet)') + '\n\n' +
    'TO MARK A LOAN PAID OFF\n' +
    '  1. Set Status to "' + PAID_OFF_STATUS + '" on every row carrying that loan ID.\n' +
    '     A loan can back more than one participation, sometimes for different\n' +
    '     people — check the Loan ID / Reference column, not just the name.\n' +
    '  2. Type the payoff date in ' + payoffL + '. Capital Return Due fills itself.\n' +
    '  3. When the capital goes back, type that date in ' + backL + '.\n' +
    '  The portal follows within 30 minutes; the Program Book is immediate.';

  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}
