/**
 * GmailSync.gs — teaches the CRM who you have actually spoken to.
 *
 * Lives in the SAME Apps Script project as Website.gs, which already owns the
 * lead pipeline and already runs as Luis. That is the whole reason this design
 * was chosen over a Gmail API integration: no new OAuth client, no service
 * account, no refresh token to store or rotate. It reads mail as the account
 * that owns the mail.
 *
 * It sends headers only — from, to, cc, subject, date, message id. Never a
 * message body. The receiving route drops anything it cannot match to a contact
 * already in the CRM, so personal mail and strangers produce nothing.
 *
 * ---------------------------------------------------------------------------
 * SETUP (once)
 *
 *  1. Paste this file into the Apps Script project alongside Website.gs.
 *  2. Project Settings -> Script Properties, add:
 *       CRM_SYNC_URL     https://www.fundedcapital.com/api/crm/activity
 *       CRM_SYNC_SECRET  (the same value set in Vercel)
 *       CRM_SELF_ADDRESSES  luis@fundedcapital.com,processing@fundedcapital.com,info@fundedcapital.com
 *  3. Run installTrigger() once from the editor and approve the Gmail scope.
 *  4. Run backfill() once to load the existing history.
 *
 * ---------------------------------------------------------------------------
 */

var SYNC_PROP_WATERMARK = 'CRM_SYNC_WATERMARK';

/**
 * How far back each incremental run overlaps.
 *
 * Gmail's `after:` operator has one-second granularity and messages do not
 * always appear in send order, so a watermark advanced exactly to the newest
 * message will eventually skip one. Overlapping costs nothing because every row
 * carries a dedup key and a repeat insert is dropped server-side — so the
 * overlap is generous on purpose.
 */
var OVERLAP_SECONDS = 15 * 60;

/** Apps Script gets killed at six minutes. Stop well before that. */
var MAX_THREADS_PER_RUN = 300;
var BATCH_SIZE = 100;

function prop_(name, required) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  if (required && !v) throw new Error('Missing Script Property: ' + name);
  return v;
}

function selfAddresses_() {
  return prop_('CRM_SELF_ADDRESSES', true)
    .split(',')
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(function (s) { return s.length > 0; });
}

/**
 * The Gmail query.
 *
 * Categories do the heavy lifting on bulk mail: Gmail already sorts marketing
 * into Promotions, Social and Updates far more reliably than any rule about
 * sender names. Excluding them here is much cheaper than fetching raw headers
 * to read List-Unsubscribe, which would mean downloading every message body and
 * would not survive the execution limit. Whatever slips through is caught by
 * the classifier on the server, and anything that slips past THAT still cannot
 * be written unless the address matches a contact.
 */
function buildQuery_(afterEpochSeconds) {
  return '(in:inbox OR in:sent)'
    + ' after:' + afterEpochSeconds
    + ' -category:promotions -category:social -category:updates -category:forums'
    + ' -in:chats -in:draft';
}

function collectMessages_(query) {
  var out = [];
  var start = 0;
  var pageSize = 100;
  var threadsSeen = 0;

  while (threadsSeen < MAX_THREADS_PER_RUN) {
    var threads = GmailApp.search(query, start, pageSize);
    if (threads.length === 0) break;
    threadsSeen += threads.length;
    start += threads.length;

    var byThread = GmailApp.getMessagesForThreads(threads);
    for (var i = 0; i < byThread.length; i++) {
      for (var j = 0; j < byThread[i].length; j++) {
        var m = byThread[i][j];
        out.push({
          messageId: m.getId(),
          threadId: m.getThread().getId(),
          from: m.getFrom(),
          to: m.getTo(),
          cc: m.getCc(),
          subject: m.getSubject(),
          dateMs: m.getDate().getTime()
        });
      }
    }
    if (threads.length < pageSize) break;
  }
  return out;
}

function postBatch_(messages, self) {
  var url = prop_('CRM_SYNC_URL', true);
  var secret = prop_('CRM_SYNC_SECRET', true);

  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ secret: secret, selfAddresses: self, messages: messages }),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code !== 200) {
    // Thrown, not swallowed: a failed batch must NOT advance the watermark, or
    // that window of mail is lost silently — the exact failure mode that lost
    // 33 BiggerPockets leads in August.
    throw new Error('CRM sync HTTP ' + code + ': ' + text.slice(0, 300));
  }
  return JSON.parse(text);
}

/** The incremental run. This is what the trigger calls. */
function syncGmailToCrm() {
  var props = PropertiesService.getScriptProperties();
  var self = selfAddresses_();

  var stored = parseInt(props.getProperty(SYNC_PROP_WATERMARK), 10);
  var nowSeconds = Math.floor(Date.now() / 1000);
  // First run with no watermark looks back a day rather than at everything;
  // the whole history is backfill()'s job.
  var after = isNaN(stored) ? nowSeconds - 24 * 60 * 60 : stored - OVERLAP_SECONDS;

  var messages = collectMessages_(buildQuery_(after));
  Logger.log('Collected ' + messages.length + ' messages since ' + new Date(after * 1000));

  var totals = { received: 0, inserted: 0, duplicates: 0, unmatched: 0 };
  for (var i = 0; i < messages.length; i += BATCH_SIZE) {
    var result = postBatch_(messages.slice(i, i + BATCH_SIZE), self);
    totals.received += result.received || 0;
    totals.inserted += result.inserted || 0;
    totals.duplicates += result.duplicates || 0;
    totals.unmatched += result.unmatchedCount || 0;
  }

  // Only now, after every batch has been accepted.
  props.setProperty(SYNC_PROP_WATERMARK, String(nowSeconds));
  Logger.log('Sync complete: ' + JSON.stringify(totals));
  return totals;
}

/**
 * One-time history load.
 *
 * Walks backwards a month at a time so no single run approaches the execution
 * limit. Re-running is free — every row is deduplicated server-side — so if it
 * times out, just run it again.
 */
function backfill() {
  var self = selfAddresses_();
  var monthsBack = 18;
  var totals = { inserted: 0, duplicates: 0, unmatched: 0 };

  for (var month = 0; month < monthsBack; month++) {
    var end = new Date();
    end.setMonth(end.getMonth() - month);
    var start = new Date(end);
    start.setMonth(start.getMonth() - 1);

    var query = '(in:inbox OR in:sent)'
      + ' after:' + Math.floor(start.getTime() / 1000)
      + ' before:' + Math.floor(end.getTime() / 1000)
      + ' -category:promotions -category:social -category:updates -category:forums'
      + ' -in:chats -in:draft';

    var messages = collectMessages_(query);
    Logger.log('Month -' + month + ': ' + messages.length + ' messages');

    for (var i = 0; i < messages.length; i += BATCH_SIZE) {
      var result = postBatch_(messages.slice(i, i + BATCH_SIZE), self);
      totals.inserted += result.inserted || 0;
      totals.duplicates += result.duplicates || 0;
      totals.unmatched += result.unmatchedCount || 0;
    }
  }

  Logger.log('Backfill complete: ' + JSON.stringify(totals));
  return totals;
}

/** Run once from the editor. Safe to re-run; it replaces any existing trigger. */
function installTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'syncGmailToCrm') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('syncGmailToCrm').timeBased().everyMinutes(15).create();
  Logger.log('Trigger installed: syncGmailToCrm every 15 minutes');
}

/**
 * Dry run — classifies and reports without the watermark moving.
 *
 * Run this first. It shows exactly what the last day would write, including
 * which addresses you corresponded with that are NOT in the CRM, which is a
 * useful report in its own right.
 */
function previewSync() {
  var self = selfAddresses_();
  var after = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  var messages = collectMessages_(buildQuery_(after));
  var result = postBatch_(messages.slice(0, BATCH_SIZE), self);
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
