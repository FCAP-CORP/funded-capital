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
  'Documents Folder': 'documentsFolder'
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
  datePaid: true, dateSent: true, paymentPeriod: true
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
    if (!email) return json_({ ok: true, participant: null, schedule: [], payments: [] });

    var everyone = readSheet_(SHEET_PARTICIPANTS, PARTICIPANT_FIELDS);
    var mine = everyone.filter(function (r) {
      return String(r.email || '').trim().toLowerCase() === email;
    });
    if (!mine.length) {
      return json_({ ok: true, participant: null, matchCount: 0, schedule: [], payments: [] });
    }

    // A participant can hold more than one participation — a rollover into a
    // second loan, for example. Return the active one by preference and report
    // the count so the portal can say so rather than quietly showing one row.
    var me = mine[0];
    for (var i = 0; i < mine.length; i++) {
      if (String(mine[i].status || '').trim().toLowerCase() === 'active') {
        me = mine[i];
        break;
      }
    }

    // Filter here, not in the app: one participant's rows are all that should
    // ever travel over the wire for a participant request.
    var id = me.participantId;
    var schedule = readSheet_(SHEET_SCHEDULE, SCHEDULE_FIELDS).filter(function (r) {
      return r.participantId === id;
    });
    var payments = readSheet_(SHEET_LOG, LOG_FIELDS).filter(function (r) {
      return r.participantId === id;
    });

    return json_({
      ok: true,
      participant: me,
      matchCount: mine.length,
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
