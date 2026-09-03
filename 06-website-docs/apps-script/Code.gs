const FOLDER_ID = '1ZgW9DF-3IpSRFGdj9CQVbv8coJyiQXvI';
const SECRET = 'fc_9x74Qk2mBv8ZpL3wRt6Yn1Hs0Ed5Ua';
const NOTIFY_EMAIL = 'luis@fundedcapital.com';
const SHEET_ID = '1NslgiltOf8gYgg15G0Ibr3HNSDhematS3gUyK355eBQ';
const SHEET_NAME = 'Submissions';

function sheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Timestamp', 'Broker', 'Borrower', 'Program', 'Property', 'Loan Amount', 'Status', 'Drive Folder', 'Notes']);
  }
  return sh;
}

/**
 * The one web-app entry point, for two very different callers.
 *
 * FIXED 2026-09-03. Until today this function ignored `body.action` and
 * treated EVERY post as a broker portal submission. Website leads
 * ({action:"lead"}) were therefore handled as applications: a document folder
 * was created for a lead that has no documents, a nearly-blank row was written
 * to the broker Submissions sheet, and the notification went out under the
 * subject "New broker application". Worst of all, `body.lead` was never read
 * at all — the name, email, phone and consent proof were silently discarded.
 *
 * That was invisible for as long as Formspree was the primary path, because
 * the real lead engine (Website.gs) fed off the Formspree notification emails
 * in Gmail and this path was only ever a redundant backup. When the bot flood
 * of 2026-09-02 exhausted the Formspree allowance, this became the ONLY path,
 * and it was throwing the lead data away.
 *
 * Now the action is honoured:
 *   action:"lead"   → handleDirectWebLead_ in Website.gs. Same lead object,
 *                     same Sheet, same acknowledgment as the Gmail poller
 *                     produces. No folder, no broker row, correct subject.
 *   anything else   → the broker portal submission, unchanged.
 *
 * The default deliberately stays "broker submission": that was the only caller
 * before today, and an unrecognised action must never silently drop a
 * submission that carries a borrower's documents.
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return json({ ok: false, error: 'unauthorized' });

    if (body.action === 'lead') {
      return json(handleDirectWebLead_(body));
    }

    return json(handleBrokerSubmission_(body));
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/**
 * Broker portal submission: documents into a Drive folder, a row in the
 * Submissions sheet, and an email to the team. Unchanged behaviour — only
 * lifted out of doPost so the routing above reads clearly.
 */
function handleBrokerSubmission_(body) {
  const app = body.application || {};
  const parent = DriveApp.getFolderById(FOLDER_ID);
  const sub = parent.createFolder(body.submissionName || ('Submission ' + new Date().toISOString()));
  (body.files || []).forEach(function (f) {
    const bytes = Utilities.base64Decode(f.data);
    const blob = Utilities.newBlob(bytes, f.mimeType || 'application/octet-stream', f.name);
    sub.createFile(blob);
  });
  sheet_().appendRow([
    new Date(), body.brokerEmail || '', app.borrower || '', app.program || '',
    app.propertyAddress || '', app.loanAmount || '', 'Submitted', sub.getUrl(), app.notes || ''
  ]);
  try {
    if (NOTIFY_EMAIL) {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: 'New broker application: ' + (body.submissionName || 'Submission'),
        body: (body.summary || 'New application received.') + '\n\nDocuments folder: ' + sub.getUrl()
      });
    }
  } catch (mailErr) {}
  return { ok: true, folder: sub.getUrl() };
}

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.secret !== SECRET) return json({ ok: false, error: 'unauthorized' });
    const rows = sheet_().getDataRange().getValues().slice(1);
    const broker = String(p.broker || '').toLowerCase();
    const out = rows
      .filter(function (r) { return !broker || String(r[1]).toLowerCase() === broker; })
      .map(function (r) {
        return { date: r[0], broker: r[1], borrower: r[2], program: r[3], property: r[4], loanAmount: r[5], status: r[6], folder: r[7] };
      })
      .reverse();
    return json({ ok: true, submissions: out });
  } catch (err) {
    return json({ ok: false, error: String(err), submissions: [] });
  }
}

function authorize() {
  sheet_();
  MailApp.sendEmail(NOTIFY_EMAIL, 'Portal test', 'Authorization successful.');
}

/**
 * Dry run for the direct webhook. Builds a lead exactly as /api/lead would
 * post it and logs the parsed object. Sends nothing, writes nothing.
 */
function testDirectWebLead() {
  const lead = webLeadFromPayload_({
    firstName: 'Test', lastName: 'DIAGNOSTIC',
    email: 'luis@fundedcapital.com', phone: '3058575620',
    loanType: 'fix-flip', propertyAddress: '123 Main St, Miami, FL 33101',
    loanAmount: '$350,000', message: 'Dry run of the direct webhook.',
    sms_consent: 'NO — not opted in'
  }, 'contact');
  Logger.log(JSON.stringify(lead, null, 2));
  Logger.log('Would be treated as a test submission: ' + webIsTestSubmission_(lead));
  Logger.log('Ack subject would be: ' + webMerge_(WEB_ACK_SUBJECT, lead));
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
