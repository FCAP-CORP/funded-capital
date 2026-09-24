/**
 * BiggerPocketsToLendingOS.gs — puts every BiggerPockets lead into the CRM.
 *
 * WHAT THIS FIXES
 *   The BiggerPockets script already does five things for every lead within a
 *   minute: sheet row, acknowledgement email, Quo contact, "call now" alert,
 *   Gmail label. It never put the lead in Lending OS (/crm). The 14 Sep 2026
 *   migration loaded the 96 leads up to that day by hand; every lead since is
 *   missing from the CRM. This file adds the sixth step, and a one-time
 *   catch-up for the gap.
 *
 * WHAT IT CAN NEVER DO
 *   - It never throws. Every function here catches its own errors, so it cannot
 *     make the BiggerPockets script label a lead BP/Error or send a false
 *     "intake error" email.
 *   - It never delays or blocks the acknowledgement or the alert: it runs AFTER
 *     both have been sent and after the sheet row is written. If the CRM is
 *     down, the lead is already safe in the sheet; re-running the catch-up
 *     later puts it in the CRM.
 *   - It never creates a lead twice. The CRM keys every lead on its Gmail
 *     message id, so running the catch-up twice, or a lead being sent by the
 *     trigger AND the catch-up, writes it once.
 *   - It sends the borrower nothing. It only talks to fundedcapital.com.
 *
 * ---------------------------------------------------------------------------
 * SETUP — about five minutes, all in the Apps Script editor, no terminal
 * ---------------------------------------------------------------------------
 *
 *  IMPORTANT: do NOT click "Deploy" at any point, and do not touch
 *  Deploy -> Manage deployments. The website form (Website.gs) runs from a
 *  saved web-app deployment, and that deployment keeps running exactly the
 *  version it was deployed with — saving files here does not change it. The
 *  BiggerPockets trigger is a TIME trigger, and time triggers always run the
 *  latest SAVED code. So "Save" is the whole deployment for this change.
 *
 *  1. Open script.google.com and open the project that contains the
 *     BiggerPockets script (the file with processBiggerPocketsLeads in it —
 *     normally the same project as Website.gs and GmailSync.gs).
 *
 *  2. Add this file FIRST: click the + next to "Files" -> Script, name it
 *     BiggerPocketsToLendingOS, delete the placeholder text, paste ALL of this
 *     file in, and click Save (the disk icon).
 *
 *  3. Check the connection: choose checkLendingOsConnection in the function
 *     dropdown at the top and press Run. Then open "Execution log".
 *       - "CONNECTED" -> go on to step 4.
 *       - "NOT CONFIGURED" -> Project Settings (gear icon) -> Script
 *         Properties. This uses the SAME secret the Gmail sync already uses:
 *         CRM_SYNC_SECRET. If that property is missing from this project,
 *         add it with the same value that is in Vercel. Nothing else is
 *         needed; the web address is worked out from CRM_SYNC_URL, or
 *         defaults to https://www.fundedcapital.com/api/crm/lead-intake.
 *       - "REJECTED (401)" -> the CRM_SYNC_SECRET here does not match Vercel's.
 *       - "NOT FOUND (404)" -> the website change is not live yet; wait for
 *         the deploy and run it again.
 *     The check sends no lead and writes nothing.
 *
 *  4. Add ONE line to the BiggerPockets script. Open the BiggerPockets file
 *     and find the function handleLead_. Near its end it reads, exactly:
 *
 *         BEFORE
 *         ------------------------------------------------------------------
 *             lead.messageId,
 *             'https://mail.google.com/mail/u/0/#inbox/' + lead.messageId,
 *             JSON.stringify(lead)
 *           ]);
 *
 *           return { ack: ackStatus, quo: quoStatus, alert: alertStatus };
 *         }
 *         ------------------------------------------------------------------
 *
 *     Put the new line between "]);" and the blank line, so it reads:
 *
 *         AFTER
 *         ------------------------------------------------------------------
 *             lead.messageId,
 *             'https://mail.google.com/mail/u/0/#inbox/' + lead.messageId,
 *             JSON.stringify(lead)
 *           ]);
 *           if (typeof postBpLeadToLendingOs_ === 'function') postBpLeadToLendingOs_(lead, lead.messageId, lead.receivedAt);
 *
 *           return { ack: ackStatus, quo: quoStatus, alert: alertStatus };
 *         }
 *         ------------------------------------------------------------------
 *
 *     Click Save. That is the only change to the BiggerPockets script. The
 *     "typeof" guard means that even if this file were ever deleted, the line
 *     would simply do nothing instead of breaking lead intake.
 *
 *  5. Load the gap: choose backfillBpLeadsToLendingOs in the dropdown and
 *     press Run. It reads the "Funded Capital — BiggerPockets Leads" sheet,
 *     sends every lead received on or after 14 Sep 2026, 25 at a time, and
 *     finishes with a line like:
 *        BACKFILL DONE — 38 rows sent: 37 created, 1 duplicate, 0 error
 *     "duplicate" is normal: it means the CRM already had that lead (the
 *     14 Sep migration, or an earlier run). Running it again is safe and
 *     should report everything as duplicate.
 *
 *  6. Confirm on the live site: open /crm and look for the newest
 *     BiggerPockets names. The next real BiggerPockets lead should appear in
 *     /crm within a minute of its alert email.
 *
 *  TO UNDO: delete the one line from step 4 (or this whole file). Nothing
 *  else in the BiggerPockets script changes.
 * ---------------------------------------------------------------------------
 */

var BPLOS_DEFAULT_URL = 'https://www.fundedcapital.com/api/crm/lead-intake';
var BPLOS_SHEET_TAB = 'BiggerPockets Leads';
/** The day the migration's export was taken. The CRM recognises that day's overlap. */
var BPLOS_BACKFILL_SINCE = new Date('2026-09-14T00:00:00-04:00');
var BPLOS_BATCH = 25;
/** Stop well before Apps Script's six-minute kill. Re-running is safe. */
var BPLOS_BUDGET_MS = 4.5 * 60 * 1000;
/** At most one "not reaching the CRM" email per this many hours. */
var BPLOS_ALERT_EVERY_HOURS = 6;

/** Every field parseBpLead_ produces, plus what processBiggerPocketsLeads adds. */
var BPLOS_FIELDS = [
  'name', 'profile', 'email', 'phone', 'preferredContact', 'market', 'strategy',
  'ownerOccupied', 'goal', 'loanType', 'timeline', 'creditScore', 'downPayment',
  'propertyAddress', 'maxPrice', 'minPrice', 'numInvestments', 'uniqueSituations',
  'specificProperty', 'amountNeeded', 'targetPrice', 'preApproval', 'marketZip',
  'source', 'comments', 'profileUrl', 'firstName', 'lastName', 'phoneE164', 'subject'
];

/** Sheet header (from ensureHeader_ in the BiggerPockets script) -> lead field. */
var BPLOS_COLUMNS = {
  'Name': 'name', 'First': 'firstName', 'Last': 'lastName', 'Email': 'email',
  'Phone': 'phone', 'BP Profile': 'profile', 'Profile URL': 'profileUrl',
  'Market': 'market', 'Goal': 'goal', 'Loan Type': 'loanType', 'Strategy': 'strategy',
  'Timeline': 'timeline', 'Credit': 'creditScore', 'Down Payment': 'downPayment',
  'Target Price': 'targetPrice', 'Max Price': 'maxPrice', 'Min Price': 'minPrice',
  'Amount Needed': 'amountNeeded', 'Property Address': 'propertyAddress',
  'Specific Property': 'specificProperty', 'Owner Occupied': 'ownerOccupied',
  '# Investments': 'numInvestments', 'Unique Situations': 'uniqueSituations',
  'Pre-Approval': 'preApproval', 'Comments': 'comments',
  'Preferred Contact': 'preferredContact', 'BP Source': 'source'
};

/* ------------------------------------------------------------ live path */

/**
 * Send ONE lead to the CRM. Called by the one line added to handleLead_.
 * NEVER throws. Returns a short status string for the log.
 */
function postBpLeadToLendingOs_(lead, gmailMessageId, receivedAt) {
  try {
    var cfg = bpLosConfig_();
    if (!cfg) {
      Logger.log('Lending OS: NOT CONFIGURED (no CRM_SYNC_SECRET) — lead is in the sheet only. Run checkLendingOsConnection.');
      return 'skipped — not configured';
    }
    var payload = bpLosPayload_(lead, gmailMessageId, receivedAt);
    var res = bpLosPost_(cfg, [payload], 'live');
    if (!res.ok) {
      bpLosFailed_('HTTP ' + res.code + ' ' + res.text, lead);
      return 'failed HTTP ' + res.code;
    }
    var r = (res.json.results || [])[0] || {};
    Logger.log('Lending OS: ' + (lead && lead.name) + ' -> ' + r.status
      + (r.applicationId ? ' (application ' + r.applicationId + ')' : '')
      + (r.note ? ' — ' + r.note : '') + (r.error ? ' — ' + r.error : ''));
    if (r.status === 'error') bpLosFailed_(r.error || 'rejected', lead);
    return r.status || 'unknown';
  } catch (e) {
    try { bpLosFailed_(String(e), lead); } catch (ignored) {}
    return 'failed: ' + e;
  }
}

/* ------------------------------------------------------- one-time catch-up */

/**
 * Run ONCE by hand: sends every sheet row received on/after 14 Sep 2026.
 * Safe to run again — the CRM answers "duplicate" for anything it already has.
 */
function backfillBpLeadsToLendingOs() {
  var started = Date.now();
  var cfg = bpLosConfig_();
  if (!cfg) { Logger.log('NOT CONFIGURED — add the CRM_SYNC_SECRET script property first (see step 3 at the top).'); return; }

  var sheetId = PropertiesService.getScriptProperties().getProperty('BP_LEADS_SHEET_ID');
  if (!sheetId) { Logger.log('Cannot find the BiggerPockets sheet: script property BP_LEADS_SHEET_ID is not set in this project. Is this the project with the BiggerPockets script?'); return; }
  var sheet = SpreadsheetApp.openById(sheetId).getSheetByName(BPLOS_SHEET_TAB);
  if (!sheet) { Logger.log('The sheet has no "' + BPLOS_SHEET_TAB + '" tab.'); return; }

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) { Logger.log('The sheet has no lead rows.'); return; }
  var header = values[0].map(function (h) { return String(h).trim(); });
  var at = function (name) { return header.indexOf(name); };
  var cReceived = at('Received'), cMsg = at('Gmail Message ID'), cRaw = at('Raw JSON');
  if (cReceived < 0) { Logger.log('No "Received" column — the sheet header has changed; stopping.'); return; }

  var items = [];
  var skippedOld = 0, noId = 0;
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var received = bpLosDate_(row[cReceived]);
    if (!received) continue;                               // blank line
    if (received < BPLOS_BACKFILL_SINCE) { skippedOld++; continue; }
    var lead = bpLosLeadFromRow_(row, header, cRaw);
    var msgId = cMsg >= 0 ? String(row[cMsg] || '').trim() : '';
    if (!msgId && lead.messageId) msgId = String(lead.messageId);
    if (!msgId) noId++;                                    // the CRM keys it on email + time instead
    items.push({ rowNumber: i + 1, payload: bpLosPayload_(lead, msgId, received) });
  }

  Logger.log('Rows on/after 14 Sep 2026: ' + items.length + ' (older rows skipped: ' + skippedOld
    + (noId ? ', rows with no Gmail id: ' + noId : '') + ')');

  var totals = { created: 0, duplicate: 0, error: 0, notSent: 0 };
  for (var b = 0; b < items.length; b += BPLOS_BATCH) {
    if (Date.now() - started > BPLOS_BUDGET_MS) {
      totals.notSent = items.length - b;
      Logger.log('Stopping before the time limit. Run backfillBpLeadsToLendingOs again to finish — nothing will be duplicated.');
      break;
    }
    var chunk = items.slice(b, b + BPLOS_BATCH);
    var res = bpLosPost_(cfg, chunk.map(function (x) { return x.payload; }), 'backfill');
    if (!res.ok) {
      totals.error += chunk.length;
      Logger.log('Batch starting at sheet row ' + chunk[0].rowNumber + ' FAILED: HTTP ' + res.code + ' ' + res.text);
      continue;
    }
    var results = res.json.results || [];
    for (var j = 0; j < chunk.length; j++) {
      var r = results[j] || { status: 'error', error: 'no result returned' };
      totals[r.status] = (totals[r.status] || 0) + 1;
      if (r.status === 'error') {
        Logger.log('  row ' + chunk[j].rowNumber + ' (' + (chunk[j].payload.name || '?') + '): ERROR — ' + r.error);
      }
    }
    Logger.log('Sent rows ' + chunk[0].rowNumber + '–' + chunk[chunk.length - 1].rowNumber
      + ': ' + (res.json.created || 0) + ' created, ' + (res.json.duplicate || 0) + ' duplicate, ' + (res.json.error || 0) + ' error');
  }

  Logger.log('BACKFILL ' + (totals.notSent ? 'PAUSED' : 'DONE') + ' — ' + items.length + ' rows: '
    + totals.created + ' created, ' + totals.duplicate + ' duplicate, ' + totals.error + ' error'
    + (totals.notSent ? ', ' + totals.notSent + ' not sent yet' : ''));
  return totals;
}

/** Safe check: proves the address and the secret work. Sends no lead, writes nothing. */
function checkLendingOsConnection() {
  var cfg = bpLosConfig_();
  if (!cfg) { Logger.log('NOT CONFIGURED — no CRM_SYNC_SECRET script property in this project. See step 3 at the top.'); return; }
  var res = bpLosPost_(cfg, [], 'live');
  if (res.ok) Logger.log('CONNECTED to ' + cfg.url);
  else if (res.code === 401) Logger.log('REJECTED (401) — CRM_SYNC_SECRET here does not match the one in Vercel.');
  else if (res.code === 404) Logger.log('NOT FOUND (404) at ' + cfg.url + ' — the website change is not deployed yet.');
  else Logger.log('PROBLEM: HTTP ' + res.code + ' ' + res.text);
}

/** When the last live post failed, if ever. */
function lendingOsStatus() {
  var p = PropertiesService.getScriptProperties();
  Logger.log('Last failure: ' + (p.getProperty('BPLOS_LAST_FAILURE') || 'none recorded'));
}

/* ---------------------------------------------------------------- helpers */

function bpLosConfig_() {
  var p = PropertiesService.getScriptProperties();
  var secret = p.getProperty('CRM_SYNC_SECRET');
  if (!secret) return null;
  var url = p.getProperty('CRM_LEAD_INTAKE_URL');
  if (!url) {
    var sync = p.getProperty('CRM_SYNC_URL') || '';
    url = /\/api\/crm\/activity\/?$/.test(sync) ? sync.replace(/\/api\/crm\/activity\/?$/, '/api/crm/lead-intake') : BPLOS_DEFAULT_URL;
  }
  return { url: url, secret: secret };
}

/** One lead as the CRM expects it. Strings only, Dates as ISO. */
function bpLosPayload_(lead, gmailMessageId, receivedAt) {
  var out = {};
  lead = lead || {};
  for (var i = 0; i < BPLOS_FIELDS.length; i++) {
    var f = BPLOS_FIELDS[i];
    var v = lead[f];
    if (v === null || v === undefined) continue;
    out[f] = (v instanceof Date) ? v.toISOString() : String(v);
  }
  if (gmailMessageId) out.gmailMessageId = String(gmailMessageId);
  var when = bpLosDate_(receivedAt) || bpLosDate_(lead.receivedAt);
  if (when) out.receivedAt = when.toISOString();
  return out;
}

/** Rebuild a lead from a sheet row: the Raw JSON column first, the named columns as a fallback. */
function bpLosLeadFromRow_(row, header, cRaw) {
  if (cRaw >= 0 && row[cRaw]) {
    try {
      var parsed = JSON.parse(String(row[cRaw]));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (e) { /* fall through to the columns */ }
  }
  var lead = {};
  for (var name in BPLOS_COLUMNS) {
    var c = header.indexOf(name);
    if (c < 0) continue;
    var v = row[c];
    if (v === '' || v === null || v === undefined) continue;
    lead[BPLOS_COLUMNS[name]] = (v instanceof Date) ? v.toISOString() : String(v);
  }
  return lead;
}

function bpLosDate_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' && v) { var d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  return null;
}

/** POST and never throw. */
function bpLosPost_(cfg, leads, via) {
  try {
    var res = UrlFetchApp.fetch(cfg.url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ secret: cfg.secret, source: 'biggerpockets', via: via, leads: leads }),
      muteHttpExceptions: true,
      followRedirects: true
    });
    var code = res.getResponseCode();
    var text = res.getContentText();
    var json = null;
    try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { ok: code === 200 && !!json, code: code, text: text.slice(0, 300), json: json || {} };
  } catch (e) {
    return { ok: false, code: 0, text: String(e), json: {} };
  }
}

/**
 * A live post failed. Logged, remembered, and — at most once every few hours —
 * emailed, so a CRM outage is seen by a person instead of sitting in a log.
 * The lead itself is safe in the sheet; the catch-up puts it in the CRM later.
 */
function bpLosFailed_(why, lead) {
  var p = PropertiesService.getScriptProperties();
  var now = new Date();
  var who = (lead && lead.name) ? lead.name : 'a lead';
  Logger.log('Lending OS: FAILED for ' + who + ' — ' + why + ' (the lead is safe in the sheet)');
  p.setProperty('BPLOS_LAST_FAILURE', now.toISOString() + ' — ' + who + ' — ' + String(why).slice(0, 200));
  var last = Number(p.getProperty('BPLOS_LAST_ALERT_MS') || 0);
  if (now.getTime() - last < BPLOS_ALERT_EVERY_HOURS * 3600 * 1000) return;
  p.setProperty('BPLOS_LAST_ALERT_MS', String(now.getTime()));
  try {
    MailApp.sendEmail({
      to: 'luis@fundedcapital.com',
      subject: 'BiggerPockets lead did not reach the CRM — ' + who,
      body: 'The BiggerPockets lead was handled normally (sheet row, acknowledgement, Quo, alert),\n'
        + 'but it could not be written into Lending OS (/crm).\n\n'
        + 'Reason: ' + why + '\n\n'
        + 'Nothing is lost. When the site is healthy, open the Apps Script project and run\n'
        + 'backfillBpLeadsToLendingOs — it adds anything missing and skips what is already there.\n\n'
        + '(At most one of these emails every ' + BPLOS_ALERT_EVERY_HOURS + ' hours.)'
    });
  } catch (e) { /* the log line above is still there */ }
}
