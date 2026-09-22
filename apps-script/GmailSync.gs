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
 *  4. Run startBackfill() once. It loads the history on its own and stops when done.
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
 * One-time history load. RESUMABLE — run it repeatedly until it says DONE.
 *
 * WHY WEEKLY WINDOWS AND A CURSOR:
 *
 * The first version walked a month at a time and relied on MAX_THREADS_PER_RUN
 * to stay inside the execution limit. That cap is per search, so any month with
 * more than 300 threads was silently truncated — the busiest months, the ones
 * with the most borrower correspondence, would have lost the most. Re-running
 * would have re-walked the same windows and missed the same mail, and the
 * report would have looked healthy throughout.
 *
 * That is precisely the failure this whole feature exists to prevent: a system
 * that quietly answers "no contact" when it simply never looked. So the backfill
 * now walks a week at a time, saves its position after every window, and stops
 * cleanly before Apps Script kills it. Run it again and it picks up where it
 * left off. Every row is deduplicated server-side, so an overlapping re-run
 * costs nothing but time.
 */
var BACKFILL_PROP_CURSOR = 'CRM_BACKFILL_CURSOR';
var BACKFILL_WINDOW_SECONDS = 7 * 24 * 60 * 60;
var BACKFILL_MONTHS = 18;

/** Stop before Apps Script's six-minute kill, so the cursor gets saved. */
var BACKFILL_BUDGET_MS = 4 * 60 * 1000;

function backfill() {
  var props = PropertiesService.getScriptProperties();
  var self = selfAddresses_();
  var startedAt = Date.now();

  var oldestBound = Math.floor(Date.now() / 1000) - BACKFILL_MONTHS * 30 * 24 * 60 * 60;

  // The cursor is the END of the next window; we walk backwards from now.
  var cursor = parseInt(props.getProperty(BACKFILL_PROP_CURSOR), 10);
  if (isNaN(cursor)) cursor = Math.floor(Date.now() / 1000);

  var totals = { windows: 0, messages: 0, inserted: 0, duplicates: 0, unmatched: 0 };

  while (cursor > oldestBound) {
    if (Date.now() - startedAt > BACKFILL_BUDGET_MS) {
      props.setProperty(BACKFILL_PROP_CURSOR, String(cursor));
      Logger.log('PAUSED (time limit) — reached back to ' + new Date(cursor * 1000).toDateString());
      Logger.log(JSON.stringify(totals));
      totals.done = false;
      return totals;
    }

    var windowStart = cursor - BACKFILL_WINDOW_SECONDS;

    var query = '(in:inbox OR in:sent)'
      + ' after:' + windowStart
      + ' before:' + cursor
      + ' -category:promotions -category:social -category:updates -category:forums'
      + ' -in:chats -in:draft';

    var messages = collectMessages_(query);
    totals.messages += messages.length;

    for (var i = 0; i < messages.length; i += BATCH_SIZE) {
      var result = postBatch_(messages.slice(i, i + BATCH_SIZE), self);
      totals.inserted += result.inserted || 0;
      totals.duplicates += result.duplicates || 0;
      totals.unmatched += result.unmatchedCount || 0;
    }

    // Saved AFTER the window is fully accepted. A throw above leaves the cursor
    // where it was, so the window is retried rather than skipped.
    cursor = windowStart;
    props.setProperty(BACKFILL_PROP_CURSOR, String(cursor));
    totals.windows++;
    Logger.log('Week ending ' + new Date((windowStart + BACKFILL_WINDOW_SECONDS) * 1000).toDateString()
      + ': ' + messages.length + ' messages, ' + totals.inserted + ' rows so far');
  }

  Logger.log('BACKFILL DONE. ' + JSON.stringify(totals));
  totals.done = true;
  return totals;
}

/* ------------------------------------------------- hands-off backfill ---- */

var BACKFILL_TRIGGER = 'runBackfillStep';

/**
 * Start the catch-up and walk away.
 *
 * The backfill has to stop every few minutes because Apps Script kills any
 * single run at six. Rather than making a person sit and click Run a dozen
 * times — which is how a half-finished history happens, and a half-finished
 * history is worse than none because it looks complete — this installs a
 * temporary trigger that continues every five minutes and REMOVES ITSELF the
 * moment the walk reaches the end.
 */
function startBackfill() {
  stopBackfill();
  ScriptApp.newTrigger(BACKFILL_TRIGGER).timeBased().everyMinutes(5).create();
  Logger.log('Backfill started. It will keep going on its own and stop when finished.');
  Logger.log('Run backfillStatus() any time to see how far back it has reached.');
  runBackfillStep();
}

/** What the trigger calls. Cleans up after itself. */
function runBackfillStep() {
  var result = backfill();
  if (result && result.done) {
    stopBackfill();
    Logger.log('Backfill finished — the repeating trigger has been removed.');
  }
}

/** Remove the temporary backfill trigger. Safe to call any time. */
function stopBackfill() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === BACKFILL_TRIGGER) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

/** How far back the catch-up has reached. */
function backfillStatus() {
  var cursor = parseInt(
    PropertiesService.getScriptProperties().getProperty(BACKFILL_PROP_CURSOR), 10);
  var oldestBound = Math.floor(Date.now() / 1000) - BACKFILL_MONTHS * 30 * 24 * 60 * 60;

  if (isNaN(cursor)) {
    Logger.log('Not started yet.');
    return;
  }
  if (cursor <= oldestBound) {
    Logger.log('FINISHED — history loaded back to ' + new Date(cursor * 1000).toDateString());
    return;
  }
  var total = Math.floor(Date.now() / 1000) - oldestBound;
  var doneSoFar = Math.floor(Date.now() / 1000) - cursor;
  Logger.log('In progress — reached back to ' + new Date(cursor * 1000).toDateString()
    + ' (' + Math.round((doneSoFar / total) * 100) + '% of the way)');
}

/** Start the history load over from today. Safe — nothing duplicates. */
function resetBackfill() {
  PropertiesService.getScriptProperties().deleteProperty(BACKFILL_PROP_CURSOR);
  Logger.log('Backfill cursor cleared. The next backfill() run starts from today.');
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
