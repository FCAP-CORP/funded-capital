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


/* ==================================================================
 * FUNDED CAPITAL — OPERATIONS MENU
 * ==================================================================
 * THIS IS THE LAST THING THAT EVER NEEDS PASTING.
 *
 * Everything below turns the monthly work into menu items inside the
 * tracker itself. After this is in, reload the spreadsheet once and a
 * "Funded Capital" menu appears next to Help. Logging a payment run,
 * flagging one as initiated, marking a payoff and recording a capital
 * return are all clicks from there. The Apps Script editor is never
 * needed again for routine work.
 *
 * Nothing here is hardcoded to a month. Every function works out the
 * period, the participations and the amounts from the sheet, so it is
 * as correct in March as it is today.
 *
 * SAFETY. These functions move money records, so each one:
 *   - derives amounts from the Payment Schedule, never from a constant
 *   - excludes paid-off participations automatically
 *   - shows exactly what it will write and waits for confirmation
 *   - refuses to write a duplicate, so re-running is always safe
 * No function ever logs a payment on its own. A payment is recorded
 * because you confirmed it happened, never because a date arrived.
 * ================================================================== */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Funded Capital')
    .addItem('Log a payment run…', 'menu_logPaymentRun')
    .addSeparator()
    .addItem('Mark a run initiated…', 'menu_markInitiated')
    .addItem('Clear the initiated flag', 'menu_clearInitiated')
    .addSeparator()
    .addItem('Mark a loan paid off…', 'menu_markPaidOff')
    .addItem('Record capital returned…', 'menu_capitalReturned')
    .addSeparator()
    .addItem('What needs attention?', 'menu_attention')
    .addItem('Email me that now', 'menu_emailAttention')
    .addSeparator()
    .addItem('Turn the weekly email ON', 'menu_installWeekly')
    .addItem('Turn the weekly email OFF', 'menu_removeWeekly')
    .addToUi();
}

/* ---------------- small shared helpers ---------------- */

function ops_ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function ops_tz_() { return ops_ss_().getSpreadsheetTimeZone(); }

/** A Date as YYYY-MM-DD in the spreadsheet's own frame. '' for anything else. */
function ops_iso_(v) {
  if (!(v instanceof Date) || isNaN(v.getTime())) return '';
  return Utilities.formatDate(v, ops_tz_(), 'yyyy-MM-dd');
}
function ops_us_(iso) {
  if (!iso) return '';
  var p = iso.split('-');
  return p[1] + '/' + p[2] + '/' + p[0];
}
/** Accepts MM/DD/YYYY or YYYY-MM-DD. Returns YYYY-MM-DD, or '' if unparseable. */
function ops_parseDate_(s) {
  s = String(s || '').trim();
  if (!s) return '';
  var m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
  if (m) {
    return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  }
  return '';
}
/** A DATE() formula, so the date is built inside the spreadsheet's own frame. */
function ops_dateFormula_(iso) {
  var p = iso.split('-');
  return '=DATE(' + Number(p[0]) + ',' + Number(p[1]) + ',' + Number(p[2]) + ')';
}
function ops_today_() {
  return Utilities.formatDate(new Date(), ops_tz_(), 'yyyy-MM-dd');
}
function ops_money_(n) {
  return '$' + (Number(n) || 0).toLocaleString('en-US');
}
function ops_alert_(title, body) {
  var ui = SpreadsheetApp.getUi();
  ui.alert(title, body, ui.ButtonSet.OK);
}
function ops_confirm_(title, body) {
  var ui = SpreadsheetApp.getUi();
  return ui.alert(title, body, ui.ButtonSet.OK_CANCEL) === ui.Button.OK;
}
function ops_prompt_(title, body, fallback) {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(title, body, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return null;
  var text = res.getResponseText().trim();
  return text === '' ? fallback : text;
}

/* ---------------- the roster, read once ---------------- */

/**
 * Every participation with the facts these operations need.
 * Paid-off is true when the Status says so OR a payoff date is present —
 * so a half-marked row still behaves correctly.
 */
function ops_roster_() {
  var parts = ops_ss_().getSheetByName(SHEET_PARTICIPANTS);
  var first = HEADER_ROW + 1;
  var n = parts.getLastRow() - HEADER_ROW;
  if (n <= 0) return [];

  var col = {
    id: headerCol_(parts, 'Participant ID'),
    name: headerCol_(parts, 'Full Legal Name'),
    email: headerCol_(parts, 'Email'),
    loan: headerCol_(parts, 'Loan ID / Reference'),
    capital: headerCol_(parts, 'Capital Contributed'),
    status: headerCol_(parts, 'Status'),
    alert: headerCol_(parts, 'Alert'),
    owed: headerCol_(parts, 'Balance Owed'),
    payoff: headerCol_(parts, 'Payoff Date'),
    due: headerCol_(parts, 'Capital Return Due'),
    back: headerCol_(parts, 'Capital Returned')
  };

  var width = parts.getLastColumn();
  var values = parts.getRange(first, 1, n, width).getValues();
  var out = [];
  for (var i = 0; i < n; i++) {
    var row = values[i];
    function at(c) { return c ? row[c - 1] : ''; }
    var id = String(at(col.id)).trim();
    if (!id) continue;
    var payoff = ops_iso_(at(col.payoff));
    out.push({
      row: first + i,
      id: id,
      name: String(at(col.name)).trim(),
      email: String(at(col.email)).trim(),
      loan: String(at(col.loan)).trim().replace(/\.0+$/, ''),
      capital: Number(at(col.capital)) || 0,
      status: String(at(col.status)).trim(),
      alert: String(at(col.alert)).trim(),
      owed: Number(at(col.owed)) || 0,
      payoff: payoff,
      returnDue: ops_iso_(at(col.due)),
      returned: ops_iso_(at(col.back)),
      paidOff: String(at(col.status)).trim() === PAID_OFF_STATUS || !!payoff,
      col: col
    });
  }
  return out;
}

/** Scheduled payments, as {id, due, amount}. */
function ops_schedule_() {
  var sched = ops_ss_().getSheetByName(SHEET_SCHEDULE);
  var first = HEADER_ROW + 1;
  var n = sched.getLastRow() - HEADER_ROW;
  if (n <= 0) return [];
  var cId = headerCol_(sched, 'Participant ID');
  var cDue = headerCol_(sched, 'Due Date');
  var cAmt = headerCol_(sched, 'Scheduled Amount');
  var width = sched.getLastColumn();
  var values = sched.getRange(first, 1, n, width).getValues();
  var out = [];
  for (var i = 0; i < n; i++) {
    var id = String(values[i][cId - 1]).trim();
    var due = ops_iso_(values[i][cDue - 1]);
    if (!id || !due) continue;
    out.push({ id: id, due: due, amount: Number(values[i][cAmt - 1]) || 0 });
  }
  return out;
}

/** Which (participation, period) pairs already sit in the Payment Log. */
function ops_logged_() {
  var log = ops_ss_().getSheetByName(SHEET_LOG);
  var first = HEADER_ROW + 1;
  var last = log.getLastRow();
  var n = Math.max(0, last - HEADER_ROW);
  var seen = {}, maxSeq = 0, nextRow = first;
  if (n > 0) {
    var values = log.getRange(first, 1, n, 5).getValues();
    for (var i = 0; i < n; i++) {
      var id = String(values[i][1]).trim();
      if (!id) continue;
      nextRow = first + i + 1;
      var seq = Number(values[i][0]);
      if (isFinite(seq) && seq > maxSeq) maxSeq = seq;
      seen[id + '|' + ops_iso_(values[i][3])] = true;
    }
  }
  return { seen: seen, nextSeq: maxSeq + 1, nextRow: nextRow };
}

/**
 * Payments that are due, not paid off, and not yet logged, grouped by period.
 * Sorted oldest first so catching up happens in order.
 */
function ops_outstanding_() {
  var roster = ops_roster_();
  var byId = {};
  for (var i = 0; i < roster.length; i++) byId[roster[i].id] = roster[i];
  var logged = ops_logged_().seen;
  var today = ops_today_();

  var periods = {};
  var sched = ops_schedule_();
  for (var j = 0; j < sched.length; j++) {
    var s = sched[j];
    var p = byId[s.id];
    if (!p || p.paidOff) continue;
    if (p.payoff && s.due > p.payoff) continue;
    if (s.due > today) continue;
    if (logged[s.id + '|' + s.due]) continue;
    if (!s.amount) continue;
    if (!periods[s.due]) periods[s.due] = [];
    periods[s.due].push({ id: s.id, name: p.name, amount: s.amount });
  }
  var out = [];
  for (var due in periods) {
    var rows = periods[due];
    var total = 0;
    for (var k = 0; k < rows.length; k++) total += rows[k].amount;
    out.push({ due: due, rows: rows, total: total });
  }
  out.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
  return out;
}

/* ================= MENU: log a payment run ================= */

function menu_logPaymentRun() {
  var outstanding = ops_outstanding_();
  if (!outstanding.length) {
    ops_alert_('Nothing to log',
      'Every payment that has come due is already in the Payment Log.\n\n' +
      'Paid-off participations are excluded automatically — their payments stopped.');
    return;
  }

  var suggested = outstanding[0];
  var lines = [];
  for (var i = 0; i < outstanding.length; i++) {
    lines.push('  ' + ops_us_(outstanding[i].due) + ' — ' +
               outstanding[i].rows.length + ' payment' + (outstanding[i].rows.length === 1 ? '' : 's') +
               ', ' + ops_money_(outstanding[i].total));
  }

  var period = ops_prompt_('Log a payment run',
    'Periods with payments not yet logged:\n\n' + lines.join('\n') +
    '\n\nWhich period? Press OK to take the oldest (' + ops_us_(suggested.due) + '), ' +
    'or type another date as MM/DD/YYYY.',
    ops_us_(suggested.due));
  if (period === null) return;

  var periodIso = ops_parseDate_(period);
  if (!periodIso) { ops_alert_('Not a date', 'Could not read "' + period + '". Use MM/DD/YYYY.'); return; }

  var chosen = null;
  for (var c = 0; c < outstanding.length; c++) if (outstanding[c].due === periodIso) chosen = outstanding[c];
  if (!chosen) {
    ops_alert_('Nothing outstanding for that period',
      'No unlogged payments are due on ' + ops_us_(periodIso) + '.\n\n' +
      'Either it is already logged, or nothing was scheduled then.');
    return;
  }

  var sent = ops_prompt_('Date sent',
    'What date did the money go out?\n\n' +
    'Press OK to use the due date (' + ops_us_(periodIso) + '), or type another as MM/DD/YYYY.',
    ops_us_(periodIso));
  if (sent === null) return;
  var sentIso = ops_parseDate_(sent);
  if (!sentIso) { ops_alert_('Not a date', 'Could not read "' + sent + '". Use MM/DD/YYYY.'); return; }

  var detail = [];
  for (var d = 0; d < chosen.rows.length; d++) {
    detail.push('  ' + chosen.rows[d].id + '  ' + chosen.rows[d].name +
                '  ' + ops_money_(chosen.rows[d].amount));
  }
  if (!ops_confirm_('Confirm — this records money as PAID',
      'Period ' + ops_us_(periodIso) + ', sent ' + ops_us_(sentIso) + ', by wire.\n\n' +
      detail.join('\n') + '\n\n' +
      chosen.rows.length + ' entries, ' + ops_money_(chosen.total) + ' total.\n\n' +
      'Participants see this as Paid within 30 minutes. Only confirm if the money has gone.')) {
    return;
  }

  var written = ops_writeRun_(periodIso, sentIso, chosen.rows);
  ops_alert_('Payment run logged', written);
}

/** The write itself, separated so the confirmation above stays readable. */
function ops_writeRun_(periodIso, sentIso, rows) {
  var log = ops_ss_().getSheetByName(SHEET_LOG);
  var state = ops_logged_();
  var seq = state.nextSeq, at = state.nextRow, total = 0, done = [];

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (state.seen[r.id + '|' + periodIso]) continue;  // belt and braces
    log.getRange(at, 1).setValue(seq);
    log.getRange(at, 2).setValue(r.id);
    log.getRange(at, 3).setFormula(ops_dateFormula_(sentIso)).setNumberFormat('mm/dd/yyyy');
    log.getRange(at, 4).setFormula(ops_dateFormula_(periodIso)).setNumberFormat('mm/dd/yyyy');
    log.getRange(at, 5).setValue(r.amount);
    log.getRange(at, 6).setValue('Wire');
    // Column G (Confirmation / Ref #) stays blank; H and I fill themselves.
    done.push('  ' + r.id + '  ' + ops_money_(r.amount) + '  row ' + at);
    total += r.amount;
    seq++; at++;
  }

  // The initiated flag has done its job once the log covers the period.
  var terms = ops_ss_().getSheetByName('Program Terms');
  var initRow = findRow_(terms, INITIATED_LABEL);
  var cleared = '';
  if (initRow) {
    var had = terms.getRange(initRow, 2).getValue();
    if (had && ops_iso_(had) <= periodIso) {
      terms.getRange(initRow, 2).clearContent();
      cleared = '\nCleared the initiated flag (was ' + ops_us_(ops_iso_(had)) + ').';
    }
  }

  SpreadsheetApp.flush();
  return done.length + ' entries written, ' + ops_money_(total) + '.\n\n' +
         done.join('\n') + '\n' + cleared +
         '\n\nConfirmation / Ref # left blank — fill column G when you have the references.';
}

/* ================= MENU: the initiated flag ================= */

function menu_markInitiated() {
  var terms = ops_ss_().getSheetByName('Program Terms');
  var initRow = findRow_(terms, INITIATED_LABEL);
  if (!initRow) { ops_alert_('Not set up', 'Program Terms has no "' + INITIATED_LABEL + '" row.'); return; }

  var when = ops_prompt_('Mark a run initiated',
    'Participants will see "Payment initiated" on every unpaid payment due on or ' +
    'before this date.\n\nPress OK for today (' + ops_us_(ops_today_()) + '), or type MM/DD/YYYY.',
    ops_us_(ops_today_()));
  if (when === null) return;
  var iso = ops_parseDate_(when);
  if (!iso) { ops_alert_('Not a date', 'Could not read "' + when + '". Use MM/DD/YYYY.'); return; }

  terms.getRange(initRow, 2).setFormula(ops_dateFormula_(iso)).setNumberFormat('mm/dd/yyyy');
  SpreadsheetApp.flush();
  ops_alert_('Marked initiated',
    'Set to ' + ops_us_(iso) + '.\n\n' +
    'Log the run once the money lands — that clears this flag by itself. ' +
    'A flag left standing over an unlogged payment is how a failed wire stays invisible.');
}

function menu_clearInitiated() {
  var terms = ops_ss_().getSheetByName('Program Terms');
  var initRow = findRow_(terms, INITIATED_LABEL);
  if (!initRow) return;
  var had = terms.getRange(initRow, 2).getValue();
  terms.getRange(initRow, 2).clearContent();
  SpreadsheetApp.flush();
  ops_alert_('Cleared', had ? 'Was ' + ops_us_(ops_iso_(had)) + '. Now blank.' : 'It was already blank.');
}

/* ================= MENU: payoff and capital return ================= */

function menu_markPaidOff() {
  var roster = ops_roster_();
  var answer = ops_prompt_('Mark a loan paid off',
    'Type the loan ID, or a participation ID.\n\n' +
    'A loan can back several participations — sometimes for different people — ' +
    'and entering the LOAN id catches all of them at once.', null);
  if (answer === null) return;
  var key = String(answer).trim().replace(/\.0+$/, '');

  var hits = [];
  for (var i = 0; i < roster.length; i++) {
    if (roster[i].loan === key || roster[i].id.toUpperCase() === key.toUpperCase()) hits.push(roster[i]);
  }
  if (!hits.length) { ops_alert_('Not found', 'Nothing on the roster matches "' + key + '".'); return; }

  var when = ops_prompt_('Payoff date',
    'What date did the borrower repay?\n\nMM/DD/YYYY.', null);
  if (when === null) return;
  var iso = ops_parseDate_(when);
  if (!iso) { ops_alert_('Not a date', 'Could not read "' + when + '". Use MM/DD/YYYY.'); return; }

  // Anything sharing the loan but not in the list is the dangerous case.
  var siblings = [];
  for (var s = 0; s < roster.length; s++) {
    if (hits.indexOf(roster[s]) !== -1) continue;
    for (var h = 0; h < hits.length; h++) {
      if (hits[h].loan && roster[s].loan === hits[h].loan) siblings.push(roster[s]);
    }
  }

  var lines = [];
  for (var k = 0; k < hits.length; k++) {
    lines.push('  ' + hits[k].id + '  ' + hits[k].name + '  loan ' + hits[k].loan +
               '  capital ' + ops_money_(hits[k].capital));
  }
  var warn = siblings.length
    ? '\n\nALSO ON THIS LOAN, and NOT being marked:\n' +
      siblings.map(function (x) { return '  ' + x.id + '  ' + x.name; }).join('\n') +
      '\nRun this again with their participation id if they should be.'
    : '';

  if (!ops_confirm_('Confirm payoff',
      'Repaid ' + ops_us_(iso) + '. Payments stop; capital returns within ten business days.\n\n' +
      lines.join('\n') + warn +
      '\n\nRemaining scheduled payments will show as "Not due — loan repaid".')) return;

  var parts = ops_ss_().getSheetByName(SHEET_PARTICIPANTS);
  for (var w = 0; w < hits.length; w++) {
    parts.getRange(hits[w].row, hits[w].col.status).setValue(PAID_OFF_STATUS);
    parts.getRange(hits[w].row, hits[w].col.payoff)
         .setFormula(ops_dateFormula_(iso)).setNumberFormat('mm/dd/yyyy');
  }
  SpreadsheetApp.flush();

  var after = ops_roster_();
  var report = [];
  for (var a = 0; a < after.length; a++) {
    for (var b = 0; b < hits.length; b++) {
      if (after[a].id === hits[b].id) {
        report.push('  ' + after[a].id + '  capital ' + ops_money_(after[a].capital) +
                    '  due back ' + (after[a].returnDue ? ops_us_(after[a].returnDue) : '(pending)'));
      }
    }
  }
  ops_alert_('Marked paid off', report.join('\n') +
    '\n\nRecord the date in Capital Returned once each wire goes out.');
}

function menu_capitalReturned() {
  var roster = ops_roster_();
  var owing = roster.filter(function (r) { return r.paidOff && !r.returned; });
  if (!owing.length) { ops_alert_('Nothing outstanding', 'No paid-off participation is waiting on its capital.'); return; }

  var list = owing.map(function (r) {
    return '  ' + r.id + '  ' + r.name + '  ' + ops_money_(r.capital) +
           '  due ' + (r.returnDue ? ops_us_(r.returnDue) : '(pending)');
  }).join('\n');

  var answer = ops_prompt_('Record capital returned',
    'Waiting on capital:\n\n' + list + '\n\nType the participation id.', null);
  if (answer === null) return;
  var pick = null;
  for (var i = 0; i < owing.length; i++) {
    if (owing[i].id.toUpperCase() === String(answer).trim().toUpperCase()) pick = owing[i];
  }
  if (!pick) { ops_alert_('Not found', '"' + answer + '" is not on that list.'); return; }

  var when = ops_prompt_('Date returned',
    'When did the capital go back to ' + pick.name + '?\n\n' +
    'Press OK for today (' + ops_us_(ops_today_()) + '), or type MM/DD/YYYY.',
    ops_us_(ops_today_()));
  if (when === null) return;
  var iso = ops_parseDate_(when);
  if (!iso) { ops_alert_('Not a date', 'Could not read "' + when + '". Use MM/DD/YYYY.'); return; }

  if (!ops_confirm_('Confirm',
      pick.id + ' — ' + ops_money_(pick.capital) + ' returned ' + ops_us_(iso) + '.\n\n' +
      'Their portal will read "was returned on ' + ops_us_(iso) + '".')) return;

  ops_ss_().getSheetByName(SHEET_PARTICIPANTS)
    .getRange(pick.row, pick.col.back)
    .setFormula(ops_dateFormula_(iso)).setNumberFormat('mm/dd/yyyy');
  SpreadsheetApp.flush();
  ops_alert_('Recorded', pick.id + ' — capital returned ' + ops_us_(iso) + '.');
}

/* ================= what needs attention ================= */

/**
 * Everything that is waiting on Luis, in one place.
 *
 * Reads the Alert column rather than recomputing maturity and rollover
 * rules, so this can never drift from what the tracker itself says.
 * Returns [] when there is genuinely nothing to do.
 */
function ops_attention_() {
  var items = [];
  var today = ops_today_();

  // 1. payment runs that have come due and are not in the log
  var outstanding = ops_outstanding_();
  for (var i = 0; i < outstanding.length; i++) {
    var o = outstanding[i];
    var age = Math.round(
      (new Date(today + 'T00:00:00Z') - new Date(o.due + 'T00:00:00Z')) / 86400000);
    items.push({
      urgent: age > 2,
      title: 'Payment run not logged — ' + ops_us_(o.due),
      body: o.rows.length + ' payment' + (o.rows.length === 1 ? '' : 's') + ', ' +
            ops_money_(o.total) + ', due ' + age + ' day' + (age === 1 ? '' : 's') + ' ago.' +
            '\n    Funded Capital menu > Log a payment run.'
    });
  }

  // 2. an initiated flag still standing over an unlogged period
  var terms = ops_ss_().getSheetByName('Program Terms');
  var initRow = findRow_(terms, INITIATED_LABEL);
  if (initRow) {
    var flag = ops_iso_(terms.getRange(initRow, 2).getValue());
    if (flag) {
      var flagAge = Math.round(
        (new Date(today + 'T00:00:00Z') - new Date(flag + 'T00:00:00Z')) / 86400000);
      if (flagAge > 5 && outstanding.length) {
        items.push({
          urgent: true,
          title: 'Initiated flag is ' + flagAge + ' days old',
          body: 'Set to ' + ops_us_(flag) + ', and payments it covers are still unlogged.' +
                '\n    Participants are being told money is on its way. If a wire failed,' +
                '\n    this is what is hiding it. Log the run, or clear the flag.'
        });
      }
    }
  }

  // 3. capital owed back on early payoffs
  var roster = ops_roster_();
  for (var r = 0; r < roster.length; r++) {
    var p = roster[r];
    if (!p.paidOff || p.returned) continue;
    var due = p.returnDue;
    if (!due) continue;
    var days = Math.round(
      (new Date(due + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
    if (days > 5) continue;
    items.push({
      urgent: days < 0,
      title: (days < 0 ? 'Capital return OVERDUE — ' : 'Capital return due — ') + p.id,
      body: ops_money_(p.capital) + ' to ' + p.name + ', due ' + ops_us_(due) +
            (days < 0 ? ' (' + Math.abs(days) + ' days ago)' : ' (in ' + days + ' days)') + '.' +
            '\n    Funded Capital menu > Record capital returned, once sent.'
    });
  }

  // 4. whatever the tracker's own Alert column is flagging
  var alerts = {};
  for (var a = 0; a < roster.length; a++) {
    var al = roster[a].alert;
    if (!al || al === 'On track' || al === 'Paid off') continue;
    if (!alerts[al]) alerts[al] = [];
    alerts[al].push(roster[a].id + ' (' + roster[a].name + ')');
  }
  for (var key in alerts) {
    items.push({
      urgent: key === 'PAYMENT BEHIND' || key === 'PAST MATURITY',
      title: key + ' — ' + alerts[key].length + ' participation' + (alerts[key].length === 1 ? '' : 's'),
      body: '    ' + alerts[key].join('\n    ')
    });
  }

  items.sort(function (x, y) { return (y.urgent ? 1 : 0) - (x.urgent ? 1 : 0); });
  return items;
}

function ops_attentionText_() {
  var items = ops_attention_();
  if (!items.length) {
    return 'Nothing needs attention.\n\n' +
           'Every payment that has come due is logged, no capital return is near, ' +
           'and no participation is flagged.';
  }
  var lines = [];
  for (var i = 0; i < items.length; i++) {
    lines.push((items[i].urgent ? '!! ' : '   ') + items[i].title + '\n    ' + items[i].body);
  }
  return lines.join('\n\n');
}

function menu_attention() {
  ops_alert_('Revenue Share — what needs attention', ops_attentionText_());
}

function menu_emailAttention() {
  var sent = ops_sendAttention_(true);
  ops_alert_('Sent', sent ? 'Emailed to ' + Session.getEffectiveUser().getEmail() + '.'
                          : 'Nothing to send — everything is clear.');
}

/**
 * The weekly trigger.
 *
 * Notifies. Never writes. A script must not log a payment because a date
 * arrived — only Luis knows whether money actually moved — so the most this
 * can ever do is tell him what is waiting.
 *
 * Stays quiet when there is nothing to say, so an email from it always means
 * something real.
 */
function weeklyAttentionCheck() {
  ops_sendAttention_(false);
}

function ops_sendAttention_(force) {
  var items = ops_attention_();
  if (!items.length && !force) return false;
  if (!items.length) return false;

  var urgent = 0;
  for (var i = 0; i < items.length; i++) if (items[i].urgent) urgent++;

  var to = Session.getEffectiveUser().getEmail();
  // Literal characters only in the subject — no HTML entities.
  var subject = 'Revenue Share: ' + items.length + ' item' + (items.length === 1 ? '' : 's') +
                ' need' + (items.length === 1 ? 's' : '') + ' attention' +
                (urgent ? ' (' + urgent + ' urgent)' : '');

  var body =
    'Revenue Share Participation — weekly check\n' +
    ops_us_(ops_today_()) + '\n\n' +
    ops_attentionText_() + '\n\n' +
    '---\n' +
    'Everything here is handled from the Funded Capital menu in the tracker:\n' +
    ops_ss_().getUrl() + '\n\n' +
    'Participant portal: https://www.fundedcapital.com/participant-portal\n\n' +
    'This check only ever reports. It never records a payment — that stays a ' +
    'decision you make after confirming the money moved.';

  MailApp.sendEmail(to, subject, body);
  return true;
}

function menu_installWeekly() {
  ops_removeWeeklyTriggers_();
  ScriptApp.newTrigger('weeklyAttentionCheck')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();
  ops_alert_('Weekly email on',
    'Every Monday around 8am you will get an email at ' +
    Session.getEffectiveUser().getEmail() + ' — but only when something actually ' +
    'needs attention.\n\nA quiet Monday means nothing is waiting.');
}

function menu_removeWeekly() {
  var n = ops_removeWeeklyTriggers_();
  ops_alert_('Weekly email off', n ? 'Removed.' : 'It was not on.');
}

function ops_removeWeeklyTriggers_() {
  var all = ScriptApp.getProjectTriggers(), n = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === 'weeklyAttentionCheck') {
      ScriptApp.deleteTrigger(all[i]);
      n++;
    }
  }
  return n;
}


/* ==================================================================
 * WRITE ENDPOINT — lets the Program Book act on the sheet
 * ==================================================================
 * Paste onto the END of the live Apps Script, then Deploy > Manage
 * deployments > edit the live one > Version: New version > Deploy.
 * The redeploy is what publishes doPost; without it the portal's
 * buttons will get an HTML page back instead of an answer.
 *
 * REQUIRES the "Funded Capital menu" block to be installed already —
 * this reuses its ops_ functions rather than reimplementing them, so
 * a payment logged from the portal and one logged from the menu go
 * through exactly the same code.
 *
 * SECURITY, and why this is a bigger deal than the read path.
 * Until now a leaked secret exposed data. This one can change your
 * ledger. Four things stand between that and a mistake:
 *
 *   1. Its own secret, separate from the read secret. Leaking one
 *      does not leak the other, and either can be rotated alone.
 *   2. The secret travels in the POST body, never the URL, so it
 *      cannot end up in a server log or a browser history.
 *   3. The portal calls this only from the server, only after
 *      isPortalAdmin() has passed. The browser never sees it.
 *   4. Nothing here accepts an amount. Amounts are read from the
 *      Payment Schedule, so a malformed or hostile request cannot
 *      invent a payment — the worst it can do is log a run that was
 *      genuinely scheduled, which is also what the button does.
 * ================================================================== */

var WRITE_SECRET = 'REPLACE_WITH_A_SECOND_LONG_RANDOM_STRING';

function doPost(e) {
  var out = { ok: false, error: 'bad_request' };
  try {
    if (!e || !e.postData || !e.postData.contents) return ops_json_(out);

    var body;
    try { body = JSON.parse(e.postData.contents); }
    catch (parseErr) { return ops_json_({ ok: false, error: 'bad_json' }); }

    if (!body || body.secret !== WRITE_SECRET) {
      return ops_json_({ ok: false, error: 'unauthorized' });
    }

    // A lock, because two clicks in quick succession must not both
    // append to the Payment Log and leave a duplicate behind.
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) {
      return ops_json_({ ok: false, error: 'busy', detail: 'Another change is in progress. Try again.' });
    }

    try {
      out = ops_dispatch_(String(body.action || ''), body);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    out = { ok: false, error: 'exception', detail: String(err && err.message || err) };
  }
  return ops_json_(out);
}

function ops_json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ops_dispatch_(action, body) {
  if (action === 'state') return ops_state_();
  if (action === 'log_run') return ops_action_logRun_(body);
  if (action === 'mark_initiated') return ops_action_markInitiated_(body);
  if (action === 'clear_initiated') return ops_action_clearInitiated_();
  if (action === 'mark_paid_off') return ops_action_markPaidOff_(body);
  if (action === 'capital_returned') return ops_action_capitalReturned_(body);
  return { ok: false, error: 'unknown_action', detail: action };
}

/** Everything the panel needs to render, in one round trip. */
function ops_state_() {
  var outstanding = ops_outstanding_();
  var roster = ops_roster_();
  var terms = ops_ss_().getSheetByName('Program Terms');
  var initRow = findRow_(terms, INITIATED_LABEL);

  var awaitingCapital = [];
  for (var i = 0; i < roster.length; i++) {
    var p = roster[i];
    if (!p.paidOff || p.returned) continue;
    awaitingCapital.push({
      id: p.id, name: p.name, capital: p.capital,
      payoff: p.payoff, returnDue: p.returnDue
    });
  }

  return {
    ok: true,
    today: ops_today_(),
    initiatedThrough: initRow ? ops_iso_(terms.getRange(initRow, 2).getValue()) : '',
    outstanding: outstanding,
    awaitingCapital: awaitingCapital
  };
}

function ops_action_logRun_(body) {
  var period = ops_parseDate_(body.period);
  if (!period) return { ok: false, error: 'bad_period' };
  var sent = ops_parseDate_(body.sent) || period;

  var outstanding = ops_outstanding_();
  var chosen = null;
  for (var i = 0; i < outstanding.length; i++) {
    if (outstanding[i].due === period) chosen = outstanding[i];
  }
  if (!chosen) {
    return { ok: false, error: 'nothing_outstanding',
             detail: 'No unlogged payments are due on ' + ops_us_(period) + '.' };
  }

  var summary = ops_writeRun_(period, sent, chosen.rows);
  return {
    ok: true,
    message: summary,
    count: chosen.rows.length,
    total: chosen.total,
    period: period
  };
}

function ops_action_markInitiated_(body) {
  var iso = ops_parseDate_(body.date);
  if (!iso) return { ok: false, error: 'bad_date' };
  var terms = ops_ss_().getSheetByName('Program Terms');
  var row = findRow_(terms, INITIATED_LABEL);
  if (!row) return { ok: false, error: 'not_configured' };
  terms.getRange(row, 2).setFormula(ops_dateFormula_(iso)).setNumberFormat('mm/dd/yyyy');
  SpreadsheetApp.flush();
  return { ok: true, message: 'Marked initiated through ' + ops_us_(iso) + '.' };
}

function ops_action_clearInitiated_() {
  var terms = ops_ss_().getSheetByName('Program Terms');
  var row = findRow_(terms, INITIATED_LABEL);
  if (!row) return { ok: false, error: 'not_configured' };
  var had = terms.getRange(row, 2).getValue();
  terms.getRange(row, 2).clearContent();
  SpreadsheetApp.flush();
  return { ok: true, message: had ? 'Cleared (was ' + ops_us_(ops_iso_(had)) + ').' : 'Already blank.' };
}

function ops_action_markPaidOff_(body) {
  var key = String(body.key || '').trim().replace(/\.0+$/, '');
  var iso = ops_parseDate_(body.date);
  if (!key) return { ok: false, error: 'bad_key' };
  if (!iso) return { ok: false, error: 'bad_date' };

  var roster = ops_roster_();
  var hits = [];
  for (var i = 0; i < roster.length; i++) {
    if (roster[i].loan === key || roster[i].id.toUpperCase() === key.toUpperCase()) hits.push(roster[i]);
  }
  if (!hits.length) return { ok: false, error: 'not_found', detail: 'Nothing matches "' + key + '".' };

  var parts = ops_ss_().getSheetByName(SHEET_PARTICIPANTS);
  var marked = [];
  for (var h = 0; h < hits.length; h++) {
    parts.getRange(hits[h].row, hits[h].col.status).setValue(PAID_OFF_STATUS);
    parts.getRange(hits[h].row, hits[h].col.payoff)
         .setFormula(ops_dateFormula_(iso)).setNumberFormat('mm/dd/yyyy');
    marked.push(hits[h].id);
  }

  // Anything else on the same loan that was NOT marked is the dangerous
  // case — one holder left being promised payments that stopped.
  var siblings = [];
  for (var s = 0; s < roster.length; s++) {
    if (marked.indexOf(roster[s].id) !== -1) continue;
    for (var k = 0; k < hits.length; k++) {
      if (hits[k].loan && roster[s].loan === hits[k].loan) {
        siblings.push(roster[s].id + ' (' + roster[s].name + ')');
      }
    }
  }

  SpreadsheetApp.flush();
  var after = ops_roster_();
  var due = '';
  for (var a = 0; a < after.length; a++) {
    if (after[a].id === marked[0]) due = after[a].returnDue;
  }

  return {
    ok: true,
    marked: marked,
    siblings: siblings,
    capitalReturnDue: due,
    message: 'Marked paid off: ' + marked.join(', ') + '. Repaid ' + ops_us_(iso) +
             (due ? '. Capital due back ' + ops_us_(due) + '.' : '.') +
             (siblings.length ? ' ALSO ON THIS LOAN and not marked: ' + siblings.join(', ') + '.' : '')
  };
}

function ops_action_capitalReturned_(body) {
  var id = String(body.id || '').trim();
  var iso = ops_parseDate_(body.date);
  if (!id) return { ok: false, error: 'bad_id' };
  if (!iso) return { ok: false, error: 'bad_date' };

  var roster = ops_roster_();
  var pick = null;
  for (var i = 0; i < roster.length; i++) {
    if (roster[i].id.toUpperCase() === id.toUpperCase()) pick = roster[i];
  }
  if (!pick) return { ok: false, error: 'not_found' };
  if (!pick.paidOff) return { ok: false, error: 'not_paid_off',
                              detail: id + ' has not been marked paid off.' };
  if (pick.returned) return { ok: true, message: id + ' was already recorded as returned on ' +
                              ops_us_(pick.returned) + '. Nothing changed.' };

  ops_ss_().getSheetByName(SHEET_PARTICIPANTS)
    .getRange(pick.row, pick.col.back)
    .setFormula(ops_dateFormula_(iso)).setNumberFormat('mm/dd/yyyy');
  SpreadsheetApp.flush();

  return { ok: true, message: id + ' — ' + ops_money_(pick.capital) +
           ' recorded as returned on ' + ops_us_(iso) + '.' };
}
