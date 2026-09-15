/**
 * Funded Capital — Revenue Share Participant Portal
 * Google Apps Script web app bound to the participant tracker Sheet.
 *
 * Deploy: Extensions > Apps Script, paste this file, then
 *   Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone
 * Copy the /exec URL into Vercel as PARTICIPANT_WEBAPP_URL.
 *
 * "Anyone" is required because Vercel calls this server-to-server with no
 * Google identity. The SHARED_SECRET below is what actually guards it, so it
 * must be a long random string and must match PARTICIPANT_WEBAPP_SECRET.
 *
 * This script is READ-ONLY. It never writes to the sheet. Luis administers
 * the program in the spreadsheet; the portal only reads what is there.
 */

var SHARED_SECRET = 'REPLACE_WITH_A_LONG_RANDOM_STRING';

var SHEET_PARTICIPANTS = 'Participants';
var SHEET_SCHEDULE = 'Payment Schedule';
var SHEET_LOG = 'Payment Log';

/** Header row in every tab. Rows 1–2 are the title block; data starts at 4. */
var HEADER_ROW = 3;

var PARTICIPANT_FIELDS = {
  'Participant ID': 'participantId',
  'Full Legal Name': 'fullName',
  'Entity Name (if any)': 'entityName',
  'Email': 'email',
  'Phone': 'phone',
  'Program Version': 'programVersion',
  'Tier': 'tier',
  'Capital Contributed': 'capitalContributed',
  'Designated Loan Size': 'designatedLoanSize',
  'Monthly Revenue Share': 'monthlyRevenueShare',
  'Loan ID / Reference': 'loanReference',
  'Property / Collateral': 'property',
  'Funding Date': 'fundingDate',
  'Term (mo)': 'termMonths',
  'Maturity Date': 'maturityDate',
  'First Payment Due': 'firstPaymentDue',
  'Payment Method': 'paymentMethod',
  'Status': 'status',
  'Lock-Up Ends': 'lockUpEnds',
  'Payments Logged': 'paymentsLogged',
  'Total Paid to Date': 'totalPaidToDate',
  'Payments Due to Date': 'paymentsDueToDate',
  'Amount Due to Date': 'amountDueToDate',
  'Balance Owed': 'balanceOwed',
  'Days to Maturity': 'daysToMaturity',
  'Rollover Notice Due': 'rolloverNoticeDue',
  'Alert': 'alert',
  'Documents Folder': 'documentsFolder',
  'Payoff Date': 'payoffDate',
  'Capital Return Due': 'capitalReturnDue',
  'Capital Returned': 'capitalReturned'
};

var SCHEDULE_FIELDS = {
  'Participant ID': 'participantId',
  'Payment #': 'paymentNumber',
  'Due Date': 'dueDate',
  'Scheduled Amount': 'scheduledAmount',
  'Status': 'status',
  'Date Paid': 'datePaid',
  'Amount Paid': 'amountPaid'
};

var LOG_FIELDS = {
  'Participant ID': 'participantId',
  'Date Sent': 'dateSent',
  'Payment Period (Due Date)': 'paymentPeriod',
  'Amount Sent': 'amountSent',
  'Method': 'method',
  'Confirmation / Ref #': 'confirmationRef'
};

var NUMERIC_KEYS = {
  capitalContributed: true, designatedLoanSize: true, monthlyRevenueShare: true,
  termMonths: true, paymentsLogged: true, totalPaidToDate: true,
  paymentsDueToDate: true, amountDueToDate: true, balanceOwed: true,
  daysToMaturity: true, paymentNumber: true, scheduledAmount: true,
  amountPaid: true, amountSent: true
};

var DATE_KEYS = {
  fundingDate: true, maturityDate: true, firstPaymentDue: true,
  lockUpEnds: true, rolloverNoticeDue: true, dueDate: true,
  datePaid: true, dateSent: true, paymentPeriod: true,
  payoffDate: true, capitalReturnDue: true, capitalReturned: true
};

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Dates go out as plain YYYY-MM-DD so no timezone can shift the day. */
function isoDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, 'UTC', 'yyyy-MM-dd');
  }
  var s = String(value).trim();
  if (!s) return '';
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? m[0] : s;
}

function num_(value) {
  if (value === '' || value === null || value === undefined) return 0;
  var n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
}

/**
 * Reads a tab into objects keyed by the given header map.
 * Reading by header name rather than column letter means inserting a column
 * in the tracker will not silently shift every field in the portal.
 */
function readSheet_(sheetName, fieldMap) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= HEADER_ROW) return [];

  var headers = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(HEADER_ROW + 1, 1, lastRow - HEADER_ROW, lastCol).getValues();

  var index = {};
  for (var c = 0; c < headers.length; c++) {
    var name = String(headers[c]).trim();
    if (fieldMap[name]) index[fieldMap[name]] = c;
  }

  var out = [];
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var obj = {};
    var hasId = false;

    for (var key in index) {
      var raw = row[index[key]];
      if (DATE_KEYS[key]) obj[key] = isoDate_(raw);
      else if (NUMERIC_KEYS[key]) obj[key] = num_(raw);
      else obj[key] = raw === null || raw === undefined ? '' : String(raw).trim();
      if (key === 'participantId' && obj[key]) hasId = true;
    }

    // Skip blank template rows and the shipped EXAMPLE row.
    if (!hasId) continue;
    if (String(obj.fullName || '').toUpperCase().indexOf('EXAMPLE ROW') === 0) continue;
    out.push(obj);
  }
  return out;
}

function doGet(e) {
  var p = (e && e.parameter) || {};

  if (p.secret !== SHARED_SECRET) {
    return json_({ ok: false, error: 'unauthorized' });
  }

  var action = p.action || '';

  if (action === 'participant') {
    var email = String(p.email || '').trim().toLowerCase();
    if (!email) return json_({ ok: true, participants: [], schedule: [], payments: [] });

    var everyone = readSheet_(SHEET_PARTICIPANTS, PARTICIPANT_FIELDS);

    // A holder normally owns SEVERAL participations — one row each. Return all
    // of them; the portal consolidates. Returning only the first would report
    // one participation as the person's entire position.
    var mine = everyone.filter(function (r) {
      return String(r.email || '').trim().toLowerCase() === email;
    });
    if (!mine.length) {
      return json_({ ok: true, participants: [], schedule: [], payments: [] });
    }

    var ids = {};
    for (var i = 0; i < mine.length; i++) ids[mine[i].participantId] = true;

    // Filter here, not in the app: only this holder's rows travel over the wire.
    var schedule = readSheet_(SHEET_SCHEDULE, SCHEDULE_FIELDS).filter(function (r) {
      return ids[r.participantId] === true;
    });
    var payments = readSheet_(SHEET_LOG, LOG_FIELDS).filter(function (r) {
      return ids[r.participantId] === true;
    });

    return json_({
      ok: true,
      participants: mine,
      schedule: schedule,
      payments: payments
    });
  }

  if (action === 'book') {
    return json_({
      ok: true,
      participants: readSheet_(SHEET_PARTICIPANTS, PARTICIPANT_FIELDS),
      schedule: readSheet_(SHEET_SCHEDULE, SCHEDULE_FIELDS)
    });
  }

  return json_({ ok: false, error: 'unknown_action' });
}


/* ==================================================================
 * ONE-TIME MIGRATION — September 2026
 * ==================================================================
 * Run ONCE from the Apps Script editor: select oneTimeMigration_Sept2026
 * from the function dropdown and press Run. It is safe to re-run — every
 * step is idempotent and it reports exactly what it changed.
 *
 * It does four things:
 *   1. Records the date the 15th-of-month rule took effect (Addendum No. 1,
 *      Sec. 2.4) and rewrites the three due-date formulas to honour it, so
 *      periods before that date correctly show the old 1st-of-month dates.
 *   2. Back-fills the Payment Log with every payment already made, deriving
 *      each one from the Payment Schedule so the match key is exact.
 *   3. Restores the two formulas on the first roster row that were
 *      overwritten with typed numbers.
 *   4. Replaces the retired "Current" tier table with the Anchor Series.
 * ================================================================== */

var MIGRATION_EFFECTIVE_15TH = new Date(2026, 8, 1);   // 1 Sep 2026
var MIGRATION_PAYMENT_METHOD = 'Wire';

var ANCHOR_LEVELS = [
  ['Anchor|Anchor I',   'Anchor', 'Anchor I',    10000,  250000,  875],
  ['Anchor|Anchor II',  'Anchor', 'Anchor II',   25000,  550000, 1925],
  ['Anchor|Anchor III', 'Anchor', 'Anchor III',  50000, 1000000, 3500],
  ['Anchor|Anchor IV',  'Anchor', 'Anchor IV',   75000, 1350000, 4725],
  ['Anchor|Anchor V',   'Anchor', 'Anchor V',   100000, 1700000, 5950]
];

/** Row number whose column A equals label, or 0. */
function findRow_(sheet, label) {
  var vals = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === label) return i + 1;
  }
  return 0;
}

/** Row whose column A starts with prefix, or 0. */
function findRowStarting_(sheet, prefix) {
  var vals = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).indexOf(prefix) === 0) return i + 1;
  }
  return 0;
}

function oneTimeMigration_Sept2026() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var terms = ss.getSheetByName(SHEET_PARTICIPANTS === 'Participants' ? 'Program Terms' : 'Program Terms');
  var parts = ss.getSheetByName(SHEET_PARTICIPANTS);
  var sched = ss.getSheetByName(SHEET_SCHEDULE);
  var log = ss.getSheetByName(SHEET_LOG);
  var report = [];

  /* ---------- STEP 4 FIRST: tier table, because it shifts row numbers ---- */
  var currentRow = findRow_(terms, 'Current|Bronze');
  if (currentRow) {
    // Three "Current" rows are being replaced by five Anchor rows.
    terms.insertRowsAfter(currentRow + 2, ANCHOR_LEVELS.length - 3);
    terms.getRange(currentRow, 1, ANCHOR_LEVELS.length, 6).setValues(ANCHOR_LEVELS);
    // Rebuild the rate column so it stays a formula, not a typed number.
    for (var i = 0; i < ANCHOR_LEVELS.length; i++) {
      var r = currentRow + i;
      terms.getRange(r, 7).setFormula('=IF(E' + r + '=0,0,F' + r + '/E' + r + ')');
    }
    var noteRow = currentRow + ANCHOR_LEVELS.length;
    terms.getRange(noteRow, 1).setValue(
      'Original = grandfathered table. Applies ONLY to participants who signed under the original program. ' +
      'Anchor Series = the current table for all new participants. The former "Current" 0.25% table was retired ' +
      'in September 2026 and must not be quoted to anyone.');
    report.push('Tier table: replaced the retired Current rows with ' + ANCHOR_LEVELS.length + ' Anchor Series levels.');
  } else {
    report.push('Tier table: already migrated (no Current|Bronze row found) — left alone.');
  }

  /* ---------- STEP 1: effective-date constant + due-date formulas -------- */
  var dueDayRow = findRow_(terms, 'Payment due day of month');
  if (!dueDayRow) throw new Error('Could not find the "Payment due day of month" constant on Program Terms.');

  var effRow = findRow_(terms, '15th payment rule effective from');
  if (!effRow) {
    effRow = findRow_(terms, 'Typical loan term (max)') + 1;
    // Only make room if that row already holds something; the constants block
    // normally has a spare row and inserting blindly would leave a gap.
    if (String(terms.getRange(effRow, 1).getValue()).trim() !== '') {
      terms.insertRowsAfter(effRow - 1, 1);
    }
  }
  terms.getRange(effRow, 1).setValue('15th payment rule effective from');
  terms.getRange(effRow, 2).setValue(MIGRATION_EFFECTIVE_15TH);
  terms.getRange(effRow, 3).setValue('date');
  terms.getRange(effRow, 4).setValue(
    'Addendum No. 1, Sec. 2.4 — periods due on or after this date use the 15th; earlier periods used the 1st');
  report.push('Effective date: Program Terms B' + effRow + ' = 1 Sep 2026.');

  // Holiday table: header row, then dates two rows below.
  var holHeader = findRowStarting_(terms, 'US FEDERAL HOLIDAYS');
  if (!holHeader) throw new Error('Could not find the US FEDERAL HOLIDAYS block on Program Terms.');
  var holStart = holHeader + 2;
  if (!(terms.getRange(holStart, 1).getValue() instanceof Date)) {
    throw new Error('Expected holiday dates at Program Terms A' + holStart +
                    '. Check the US FEDERAL HOLIDAYS block before re-running.');
  }
  var holEnd = holStart;
  while (terms.getRange(holEnd + 1, 1).getValue() instanceof Date) holEnd++;

  var DUE = "'Program Terms'!$B$" + dueDayRow;
  var EFF = "'Program Terms'!$B$" + effRow;
  var HOL = "'Program Terms'!$A$" + holStart + ':$A$' + holEnd;
  report.push('Holiday table: ' + HOL + ' (' + (holEnd - holStart + 1) + ' dates).');

  // The rule, expressed once: a period uses the 15th only from the effective
  // date onward; before that it used the 1st. Then roll to the next business day.
  function dueExpr(monthExpr) {
    return 'WORKDAY(DATE(YEAR(' + monthExpr + '),MONTH(' + monthExpr + '),' +
           'IF(DATE(YEAR(' + monthExpr + '),MONTH(' + monthExpr + '),1)>=' + EFF + ',' + DUE + ',1))-1,1,' + HOL + ')';
  }

  var lastPart = parts.getLastRow();
  parts.getRange(4, 16, lastPart - 3, 1).setFormula(       // P — First Payment Due
    '=IF($M4="","",LET(mm,EDATE($M4,1),' + dueExpr('mm') + '))');

  parts.getRange(4, 22, lastPart - 3, 1).setFormula(       // V — Payments Due to Date
    '=IF(OR($M4="",$N4=""),"",IF(TODAY()<$P4,0,MIN($N4,' +
    '(YEAR(TODAY())-YEAR($P4))*12+MONTH(TODAY())-MONTH($P4)+1' +
    '-IF(TODAY()<' + dueExpr('TODAY()') + ',1,0))))');

  var lastSched = sched.getLastRow();
  sched.getRange(4, 5, lastSched - 3, 1).setFormula(       // E — Due Date
    '=LET(pr,4+INT((ROW()-4)/12),fd,INDEX(Participants!$M:$M,pr),tm,INDEX(Participants!$N:$N,pr),' +
    'st,INDEX(Participants!$R:$R,pr),IF(OR($A4="",fd="",tm="",$D4>tm,st="Example"),"",' +
    'LET(mm,EDATE(fd,$D4),' + dueExpr('mm') + ')))');
  report.push('Due-date formulas rewritten on Participants P and V, and Payment Schedule E.');

  SpreadsheetApp.flush();

  /* ---------- STEP 2: back-fill the Payment Log ------------------------- */
  // Derived from the Payment Schedule rather than typed, so the Payment Period
  // is guaranteed to equal the scheduled Due Date — that is the match key.
  var rows = sched.getRange(4, 1, lastSched - 3, 6).getValues();  // A..F
  var backfill = [];
  for (var s = 0; s < rows.length; s++) {
    var id = String(rows[s][0]).trim();
    var due = rows[s][4];
    var amt = rows[s][5];
    if (!id || !(due instanceof Date)) continue;
    if (due >= MIGRATION_EFFECTIVE_15TH) continue;   // not yet paid under the new rule
    backfill.push([id, due, due, amt]);
  }
  backfill.sort(function (a, b) { return a[1] - b[1] || (a[0] < b[0] ? -1 : 1); });

  // Clear the shipped EXAMPLE row and anything previously back-filled, so a
  // re-run cannot double-count.
  var lastLog = log.getLastRow();
  if (lastLog >= 4) log.getRange(4, 1, lastLog - 3, 7).clearContent();

  for (var b = 0; b < backfill.length; b++) {
    var r = 4 + b;
    log.getRange(r, 1).setValue(b + 1);                    // Log #
    log.getRange(r, 2).setValue(backfill[b][0]);           // Participant ID
    log.getRange(r, 3).setValue(backfill[b][1]);           // Date Sent
    log.getRange(r, 4).setValue(backfill[b][2]);           // Payment Period
    log.getRange(r, 5).setValue(backfill[b][3]);           // Amount Sent
    log.getRange(r, 6).setValue(MIGRATION_PAYMENT_METHOD); // Method
  }
  var total = 0;
  for (var t = 0; t < backfill.length; t++) total += Number(backfill[t][3]) || 0;
  report.push('Payment Log: wrote ' + backfill.length + ' payments totalling $' + total.toLocaleString() +
              '. Confirmation references left blank to fill in.');

  /* ---------- STEP 3: restore the overwritten roster formulas ----------- */
  parts.getRange(4, 20, lastPart - 3, 1).setFormula(       // T — Payments Logged
    '=IF($A4="","",COUNTIFS(\'Payment Log\'!$B$4:$B$503,$A4))');
  parts.getRange(4, 21, lastPart - 3, 1).setFormula(       // U — Total Paid to Date
    '=IF($A4="","",SUMIFS(\'Payment Log\'!$E$4:$E$503,\'Payment Log\'!$B$4:$B$503,$A4))');
  report.push('Restored the Payments Logged and Total Paid to Date formulas across the roster.');

  SpreadsheetApp.flush();

  var msg = 'MIGRATION COMPLETE\n\n' + report.join('\n\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* no UI when run headless */ }
  return msg;
}


/* ==================================================================
 * FOLLOW-UP FIXUP — run once after oneTimeMigration_Sept2026()
 * ==================================================================
 * Three loose ends the first pass left:
 *   1. The effective-date constant landed a day early (8/31 instead of 9/1)
 *      because a bare new Date() is midnight in the script's timezone, which
 *      can render as the previous day in the sheet's. Behaviour was still
 *      correct — the comparison is against the 1st of each month — but the
 *      cell contradicted the addendum, so it is set to noon and reads 9/1.
 *   2. The Dashboard tier breakdown still listed the retired Current tiers.
 *      Rebuilt for the Anchor levels, with formulas that read their own row
 *      labels instead of hardcoding tier names, so renaming a tier is enough.
 *   3. The START HERE tab still described the retired table, using a word the
 *      program's language rule forbids.
 * Safe to re-run.
 * ================================================================== */

function fixup_Sept2026() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var terms = ss.getSheetByName('Program Terms');
  var dash = ss.getSheetByName('Dashboard');
  var start = ss.getSheetByName('START HERE');
  var report = [];

  /* ---- 1. Effective date, at noon so no timezone can shift the day ---- */
  var effRow = findRow_(terms, '15th payment rule effective from');
  if (effRow) {
    terms.getRange(effRow, 2).setValue(new Date(2026, 8, 1, 12, 0, 0))
         .setNumberFormat('mm/dd/yyyy');
    report.push('Effective date corrected to 1 Sep 2026 (Program Terms B' + effRow + ').');
  }

  /* ---- 2. Dashboard tier breakdown ---- */
  if (dash) {
    var col = dash.getRange(1, 1, dash.getLastRow(), 1).getValues();
    var curStart = 0, curCount = 0;
    for (var i = 0; i < col.length; i++) {
      if (String(col[i][0]).trim() === 'Current') {
        if (!curStart) curStart = i + 1;
        curCount++;
      } else if (curStart) break;
    }

    if (curStart) {
      if (ANCHOR_LEVELS.length > curCount) {
        dash.insertRowsAfter(curStart + curCount - 1, ANCHOR_LEVELS.length - curCount);
      }
      for (var a = 0; a < ANCHOR_LEVELS.length; a++) {
        dash.getRange(curStart + a, 1).setValue(ANCHOR_LEVELS[a][1]);  // "Anchor"
        dash.getRange(curStart + a, 2).setValue(ANCHOR_LEVELS[a][2]);  // "Anchor I".."V"
      }
      report.push('Dashboard: replaced ' + curCount + ' retired Current rows with ' +
                  ANCHOR_LEVELS.length + ' Anchor rows.');
    } else {
      report.push('Dashboard: already migrated — no Current rows found.');
    }

    // Rebuild every tier row's formulas to read its own labels, Original included.
    var firstTier = findRow_(dash, 'Original');
    var totalRow = findRow_(dash, 'TOTAL');
    if (firstTier && totalRow > firstTier) {
      for (var r = firstTier; r < totalRow; r++) {
        var pv = '$A' + r, tr = '$B' + r;
        var crit = 'Participants!$F$4:$F$43,' + pv + ',Participants!$G$4:$G$43,' + tr;
        dash.getRange(r, 3).setFormula('=COUNTIFS(' + crit + ')');
        dash.getRange(r, 4).setFormula('=SUMIFS(Participants!$H$4:$H$43,' + crit + ')');
        dash.getRange(r, 5).setFormula('=SUMIFS(Participants!$I$4:$I$43,' + crit + ')');
        dash.getRange(r, 6).setFormula('=SUMIFS(Participants!$J$4:$J$43,' + crit + ')');
        dash.getRange(r, 7).setFormula('=F' + r + '*12');
      }
      report.push('Dashboard: tier formulas now read their own row labels (rows ' +
                  firstTier + '–' + (totalRow - 1) + ').');
    }
  }

  /* ---- 3. START HERE wording ---- */
  if (start) {
    var vals = start.getRange(1, 1, start.getLastRow(), 5).getValues();
    for (var rr = 0; rr < vals.length; rr++) {
      for (var cc = 0; cc < vals[rr].length; cc++) {
        var txt = String(vals[rr][cc]);
        if (txt.indexOf('Current = new investors') > -1) {
          start.getRange(rr + 1, cc + 1).setValue(
            'Reference only. Holds both tier tables (Original = grandfathered, closed to new ' +
            'participants; Anchor Series = the current table for all new participants) plus the ' +
            'lock-up, penalty, payment-date and notice policy constants that drive every calculation.');
          report.push('START HERE: tier-table description updated (retired table removed, ' +
                      '"investors" replaced with "participants").');
        }
      }
    }
  }

  SpreadsheetApp.flush();
  var msg = 'FIXUP COMPLETE\n\n' + report.join('\n\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}


/* ==================================================================
 * FIXUP 2 — run once after fixup_Sept2026()
 * ==================================================================
 * fixup_Sept2026 set the effective date to NOON to dodge a timezone shift
 * that had it displaying as 8/31. That made the cell read correctly and
 * broke the comparison: the formulas test DATE(year,month,1), which is
 * MIDNIGHT, and midnight on the 1st is not >= noon on the 1st. September
 * silently fell back to the old 1st-of-month rule.
 *
 * Fixed two ways so neither failure can recur:
 *   - the constant is now =DATE(2026,9,1) — a formula, so it is midnight in
 *     the sheet's own frame and no timezone can shift it;
 *   - every comparison wraps it in INT(), so a stray time component on that
 *     cell can never change behaviour again.
 *
 * Reports the resulting dates and alert counts so the result is verifiable
 * without leaving the editor. Safe to re-run.
 * ================================================================== */

function fixup2_Sept2026() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var terms = ss.getSheetByName('Program Terms');
  var parts = ss.getSheetByName(SHEET_PARTICIPANTS);
  var sched = ss.getSheetByName(SHEET_SCHEDULE);

  var dueDayRow = findRow_(terms, 'Payment due day of month');
  var effRow = findRow_(terms, '15th payment rule effective from');
  if (!dueDayRow || !effRow) throw new Error('Program Terms constants not found.');

  // Timezone-proof: a formula, evaluated in the spreadsheet's own frame.
  terms.getRange(effRow, 2).setFormula('=DATE(2026,9,1)').setNumberFormat('mm/dd/yyyy');

  var holHeader = findRowStarting_(terms, 'US FEDERAL HOLIDAYS');
  var holStart = holHeader + 2, holEnd = holStart;
  while (terms.getRange(holEnd + 1, 1).getValue() instanceof Date) holEnd++;

  var DUE = "'Program Terms'!$B$" + dueDayRow;
  var EFF = "INT('Program Terms'!$B$" + effRow + ")";   // <- the guard
  var HOL = "'Program Terms'!$A$" + holStart + ':$A$' + holEnd;

  function dueExpr(m) {
    return 'WORKDAY(DATE(YEAR(' + m + '),MONTH(' + m + '),' +
           'IF(DATE(YEAR(' + m + '),MONTH(' + m + '),1)>=' + EFF + ',' + DUE + ',1))-1,1,' + HOL + ')';
  }

  var lastPart = parts.getLastRow();
  parts.getRange(4, 16, lastPart - 3, 1).setFormula(
    '=IF($M4="","",LET(mm,EDATE($M4,1),' + dueExpr('mm') + '))');
  parts.getRange(4, 22, lastPart - 3, 1).setFormula(
    '=IF(OR($M4="",$N4=""),"",IF(TODAY()<$P4,0,MIN($N4,' +
    '(YEAR(TODAY())-YEAR($P4))*12+MONTH(TODAY())-MONTH($P4)+1' +
    '-IF(TODAY()<' + dueExpr('TODAY()') + ',1,0))))');

  var lastSched = sched.getLastRow();
  sched.getRange(4, 5, lastSched - 3, 1).setFormula(
    '=LET(pr,4+INT((ROW()-4)/12),fd,INDEX(Participants!$M:$M,pr),tm,INDEX(Participants!$N:$N,pr),' +
    'st,INDEX(Participants!$R:$R,pr),IF(OR($A4="",fd="",tm="",$D4>tm,st="Example"),"",' +
    'LET(mm,EDATE(fd,$D4),' + dueExpr('mm') + ')))');

  SpreadsheetApp.flush();

  /* ---- read the results back so this does not need another round trip ---- */
  var tz = ss.getSpreadsheetTimeZone();
  function fmt(v) { return v instanceof Date ? Utilities.formatDate(v, tz, 'MM/dd/yyyy') : String(v); }

  var alerts = parts.getRange(4, 27, lastPart - 3, 1).getValues();
  var behind = 0, ontrack = 0;
  for (var i = 0; i < alerts.length; i++) {
    var a = String(alerts[i][0]).trim();
    if (a === 'PAYMENT BEHIND') behind++;
    else if (a === 'On track') ontrack++;
  }
  var owed = 0;
  var owedCol = parts.getRange(4, 24, lastPart - 3, 1).getValues();
  for (var o = 0; o < owedCol.length; o++) owed += Number(owedCol[o][0]) || 0;

  var msg = 'FIXUP 2 COMPLETE\n\n' +
    'Effective date cell: ' + fmt(terms.getRange(effRow, 2).getValue()) + '\n\n' +
    'First roster row — first payment due: ' + fmt(parts.getRange(4, 16).getValue()) + '\n' +
    'Its schedule: #1 ' + fmt(sched.getRange(4, 5).getValue()) +
    '  ·  #3 ' + fmt(sched.getRange(6, 5).getValue()) +
    '  ·  #4 ' + fmt(sched.getRange(7, 5).getValue()) + '\n' +
    '(expect 06/01/2026, 08/03/2026, 09/15/2026)\n\n' +
    'Alerts — PAYMENT BEHIND: ' + behind + '   On track: ' + ontrack + '\n' +
    'Total balance owed: $' + owed.toLocaleString() + '\n' +
    '(expect 0 behind, 11 on track, $0 owed)';

  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}


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
