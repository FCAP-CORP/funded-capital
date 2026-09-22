/* Paste this onto the END of the live Apps Script file.
 * Then RELOAD the spreadsheet — a "Funded Capital" menu appears next to Help.
 * No redeploy needed. This is the last paste; everything after is a menu click. */

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
