/* Paste this onto the END of the live Apps Script file.
 * REQUIRES the Funded Capital menu block to be installed first.
 *
 * 1. Replace WRITE_SECRET below with a long random string of your own
 *    (type it yourself — it must differ from the read secret on line 19).
 * 2. Deploy > Manage deployments > edit the live one >
 *    Version: New version > Deploy.   <- publishes doPost
 * 3. Add the same string to Vercel as PARTICIPANT_WEBAPP_WRITE_SECRET
 *    (Production), then redeploy the site. */

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
