/*************************************************************************
 * WEBSITE LEAD INTAKE — Layer 1 of the website lead engine
 * Funded Capital · added 2026-08-30 · owner: Luis Fajardo
 *
 * The sibling of apps-script-biggerpockets-lead-intake.gs, re-pointed at
 * the Formspree emails that carry fundedcapital.com /apply and /contact
 * submissions.
 *
 * WHAT IT DOES (every minute, automatically, no AI involved)
 *   1. Finds new Formspree submission emails in luis@'s Gmail.
 *   2. Parses the lead (name, email, phone, borrower type, loan type,
 *      property, price, ARV, exit, timeline, experience, credit, notes)
 *      AND the full TCPA consent block — consent text, version, timestamp,
 *      IP and user agent. That block is the legal proof of SMS consent, so
 *      it is written to the Sheet verbatim and never paraphrased.
 *   3. Appends a row to the "Funded Capital — Website Leads" Google Sheet.
 *   4. Sends the lead ONE fixed, pre-approved acknowledgment email from
 *      luis@fundedcapital.com (web-ack-v1, approved by Luis 2026-08-30 —
 *      only first name and goal phrase are merged, nothing else varies).
 *   5. Creates the contact in Quo (optional — needs QUO_API_KEY).
 *   6. Emails (and optionally texts) Luis a "NEW WEBSITE LEAD — call now"
 *      alert with a one-line summary and click-to-call number.
 *   7. Labels the thread "Web/Processed" so it is never handled twice.
 *
 * The hourly Claude task "website-lead-triage" reads the same threads and
 * writes the personalized reply as a Gmail DRAFT. It checks `in:sent` before
 * acknowledging, so once this script is live it will see this script's ack
 * and will not send a second one. No coordination needed.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   - No SMS to the lead, even when sms_consent is YES. A2P 10DLC
 *     registration and counsel sign-off gate that. The consent proof is
 *     captured now so it is ready when they clear.
 *   - No personalized reply. That stays a draft for Luis to approve.
 *
 * HOW TO INSTALL (one time, ~5 minutes)
 *   1. script.google.com → open the SAME project that holds the
 *      BiggerPockets intake script. File → + → Script, name it "Website",
 *      paste ALL of this in.
 *      Every global here is prefixed WEB_ so nothing collides with the
 *      BiggerPockets file, and the email signature is picked up from that
 *      file automatically. In a separate project it still runs — it just
 *      falls back to a plain-text sign-off.
 *   2. Optional — Project Settings → Script Properties (shared with the BP
 *      script, so if you already set these you are done):
 *        QUO_API_KEY  = your Quo/OpenPhone API key (Quo → Settings → API)
 *        LUIS_MOBILE  = +1XXXXXXXXXX  (your cell, for the SMS alert)
 *   3. Pick `installWebsiteLeadTrigger` from the dropdown and press Run.
 *      Approve the permissions prompt. Run it only once.
 *   4. Test: pick `testParseLatestWebLead` and Run → View → Logs. You get
 *      the parsed fields of the most recent website lead. Sends nothing.
 *   5. Live. The first tick only touches leads from the last 2 days that
 *      have not been replied to; anything older is labeled and left alone.
 *
 * TO PAUSE: Triggers (clock icon) → delete the processWebsiteLeads trigger.
 * TO CHANGE THE ACK: edit WEB_ACK_SUBJECT / WEB_ACK_HTML and bump
 * WEB_ACK_VERSION so the Sheet records which wording each lead received.
 * Keep the wording in sync with the website-lead-triage task prompt.
 *************************************************************************/

// ───────────────────────── CONFIG ─────────────────────────
var WEB_SENDER          = 'noreply@formspree.io';
var WEB_LABEL_PROCESSED = 'Web/Processed';
var WEB_LABEL_ERROR     = 'Web/Error';
var WEB_LABEL_ACKED     = 'Web/Acked';    // read by the cloud tasks
var WEB_LABEL_DRAFTED   = 'Web/Drafted';  // written by the cloud tasks
var WEB_BACKFILL_HOURS  = 48;
var WEB_ALERT_TO        = 'luis@fundedcapital.com';
var WEB_INTAKE_FOLDER   = '1ZgW9DF-3IpSRFGdj9CQVbv8coJyiQXvI'; // Broker Portal Intake
var WEB_SHEET_FILE_NAME = 'Funded Capital — Website Leads';
var WEB_SHEET_TAB       = 'Website Leads';
var WEB_QUO_FROM        = '+13058575620';
var WEB_SENDER_NAME     = 'Luis Fajardo';
var WEB_REPLY_TO        = 'luis@fundedcapital.com';
var WEB_CALENDAR_URL    = 'https://calendar.app.google/KE1Lht3niNc2mzd59';
var WEB_DIRECT_LINE     = '305-337-6928';

// States we do not lend in.
var WEB_EXCLUDED_STATES = ['VT', 'UT', 'OR', 'SD', 'ND'];

// Subjects that are Formspree account mail, not leads.
// Kept as whole phrases, not bare words — a lead writing "plan" or "invoice"
// in the subject must not be silently discarded as account mail.
var WEB_NOT_A_LEAD = ['weekly digest', 'monthly digest', 'your plan',
                      'payment failed', 'submission limit'];

// Junk markers — Luis's own test submissions.
var WEB_TEST_MARKERS = ['test-ignore', 'diagnostic', 'testtest', 'asdf'];

/* The signature. If this file lives in the same project as the
 * BiggerPockets script, SIG_HTML is already defined there and is reused, so
 * there is exactly one signature to maintain. Standalone, we fall back to a
 * plain-text sign-off — correct, just not branded.
 * Never inline a data: URI here. Hosted URLs only. See the signature memo. */
function webSig_() {
  try { if (typeof SIG_HTML !== 'undefined' && SIG_HTML) return SIG_HTML; } catch (e) {}
  return '<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#1a1a1a;margin:0;">' +
         '<strong>Luis Fajardo</strong><br>Senior Sales Director | Funded Capital, LLC<br>' +
         'Direct ' + WEB_DIRECT_LINE + ' | luis@fundedcapital.com</p>';
}

// ───────────────────────── THE APPROVED ACK ─────────────────────────
var WEB_ACK_VERSION = 'web-ack-v1-2026-08-30';
// {{goal}} reads "your ground-up construction project" (for mid-sentence use);
// {{goalSubject}} is the same phrase with the leading article stripped, so the
// subject line does not come out as "Your your ground-up construction project".
var WEB_ACK_SUBJECT = 'Your {{goalSubject}} — Funded Capital';

function webAckHtml_() {
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a;max-width:680px;">' +
    '<p>Hi {{first}},</p>' +
    '<p>Thanks for reaching out through fundedcapital.com about {{goal}}. ' +
    'You&rsquo;re in the right lane &mdash; we&rsquo;re a direct, asset-based lender for real estate investors. ' +
    'We underwrite the deal, not your tax returns, and we typically close in 5&ndash;10 business days, deal-dependent.</p>' +
    '<p>I&rsquo;ll review your details and come back to you personally within a few business hours ' +
    'with a straight answer on fit and next steps.</p>' +
    '<p>Want to move faster? Reply with the property address, purchase price, rehab or construction budget, ' +
    'ARV, and your exit strategy &mdash; or <a href="' + WEB_CALENDAR_URL + '">grab a time on my calendar</a>.</p>' +
    '<p style="font-size:12px;color:#666">Terms subject to underwriting, appraisal, title, and insurance.</p>' +
    '<p>Talk soon,</p>' + webSig_() + '</div>';
}

// ───────────────────────── ENTRY POINTS ─────────────────────────

/** Run ONCE by hand to create the every-minute trigger. */
function installWebsiteLeadTrigger() {
  var existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'processWebsiteLeads';
  });
  if (existing.length) { Logger.log('Trigger already installed.'); return; }
  ScriptApp.newTrigger('processWebsiteLeads').timeBased().everyMinutes(1).create();
  webLabel_(WEB_LABEL_PROCESSED);
  webLabel_(WEB_LABEL_ERROR);
  webLabel_(WEB_LABEL_ACKED);   // the cloud tasks cannot create labels themselves
  webLabel_(WEB_LABEL_DRAFTED);
  webSpreadsheet_();
  Logger.log('Installed. processWebsiteLeads now runs every minute.');
}

/** The trigger target. Safe to run by hand. */
function processWebsiteLeads() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // a previous tick is still running
  try {
    var query = 'from:' + WEB_SENDER +
                ' -label:' + WEB_LABEL_PROCESSED.replace('/', '-') +
                ' -label:' + WEB_LABEL_ERROR.replace('/', '-') +
                ' newer_than:' + Math.ceil(WEB_BACKFILL_HOURS / 24) + 'd';
    var threads = GmailApp.search(query, 0, 20);
    if (!threads.length) return;

    var processedLabel = webLabel_(WEB_LABEL_PROCESSED);
    var errorLabel     = webLabel_(WEB_LABEL_ERROR);
    var ackedLabel     = webLabel_(WEB_LABEL_ACKED);

    threads.forEach(function (thread) {
      var msgs = thread.getMessages();
      var msg = msgs[msgs.length - 1]; // newest — a resubmission lands in the same thread

      var progress = {
        parsed:     'no',
        ack:        'not reached',
        quo:        'not reached',
        alertEmail: 'not reached',
        alertSms:   'not reached',
        sheetRow:   'NOT WRITTEN'
      };

      try {
        // Formspree account mail is not a lead.
        if (webIsNotALead_(msg.getSubject())) { thread.addLabel(processedLabel); return; }

        var lead = parseWebLead_(msg.getPlainBody());
        progress.parsed = 'yes';
        lead.messageId  = msg.getId();
        lead.receivedAt = msg.getDate();
        lead.subject    = msg.getSubject();
        lead.formSource = webFormSource_(msg.getSubject(), lead.consentPageUrl);

        // Luis's own test submissions never reach a human.
        if (webIsTestSubmission_(lead)) {
          thread.addLabel(processedLabel);
          Logger.log('Skipped test submission: ' + lead.name + ' / ' + lead.email);
          return;
        }

        var ageHours = (new Date() - lead.receivedAt) / 36e5;
        if (ageHours > WEB_BACKFILL_HOURS) { thread.addLabel(processedLabel); return; }

        var result = handleWebLead_(lead, progress);
        thread.addLabel(processedLabel);
        if (String(progress.ack).indexOf('sent') === 0) thread.addLabel(ackedLabel);
        Logger.log('Processed website lead: ' + lead.name + ' → ' + JSON.stringify(result));
      } catch (err) {
        thread.addLabel(errorLabel);
        webReportFailure_(msg, progress, err);
      }
    });
  } finally {
    lock.releaseLock();
  }
}

/** Dry run: parse the latest website lead and log it. Sends nothing. */
function testParseLatestWebLead() {
  var threads = GmailApp.search('from:' + WEB_SENDER, 0, 5);
  for (var i = 0; i < threads.length; i++) {
    var m = threads[i].getMessages()[0];
    if (webIsNotALead_(m.getSubject())) continue;
    var lead = parseWebLead_(m.getPlainBody());
    lead.formSource = webFormSource_(m.getSubject(), lead.consentPageUrl);
    Logger.log('Subject: ' + m.getSubject());
    Logger.log(JSON.stringify(lead, null, 2));
    Logger.log('Would be treated as a test submission: ' + webIsTestSubmission_(lead));
    Logger.log('Ack subject would be: ' + webMerge_(WEB_ACK_SUBJECT, lead));
    Logger.log('Flags: ' + webQuickFlags_(lead).join(' · '));
    return;
  }
  Logger.log('No website lead emails found.');
}

// ───────────────────────── CORE ─────────────────────────

function handleWebLead_(lead, progress, opts) {
  progress = progress || {};
  opts = opts || {};

  /* Quiet mode — added 2026-09-03 with the direct webhook.
   * The website's /api/lead screens for spam before it posts here. A
   * submission it flags as SUSPECTED (not certain) arrives with quiet:true:
   * we still write the row, so a false positive is recoverable and auditable,
   * but we send the lead nothing, create no Quo contact, and do not page Luis.
   * The 2026-09-02 bot is exactly why: 22 acknowledgment emails went out from
   * luis@ to strangers whose addresses the bot had harvested, and 35 fake
   * contacts landed in the dialer. Never again from this path. */
  var quiet = opts.quiet === true;

  var ss = webSpreadsheet_();
  var sheet = ss.getSheetByName(WEB_SHEET_TAB) || ss.insertSheet(WEB_SHEET_TAB);
  webEnsureHeader_(sheet);

  // Duplicate guard: same email already acknowledged in the last 30 days.
  var dupe = webFindRecentLeadByEmail_(sheet, lead.email, 30);

  var ackStatus;
  if (quiet) {
    ackStatus = 'NOT SENT — ' + (lead.spamFlag || 'held as suspected spam');
  } else if (!dupe && webIsEmail_(lead.email)) {
    try {
      webSendAck_(lead);
      ackStatus = 'sent ' + WEB_ACK_VERSION;
    } catch (eAck) {
      Utilities.sleep(3000);   // "try again later" usually means exactly that
      try {
        webSendAck_(lead);
        ackStatus = 'sent on retry ' + WEB_ACK_VERSION;
      } catch (eAck2) {
        ackStatus = '⚠️ ACK FAILED — EMAIL THIS LEAD BY HAND: ' + eAck2;
      }
    }
  } else if (dupe) {
    ackStatus = 'skipped — repeat inquiry (' + dupe + ')';
  } else {
    ackStatus = 'skipped — no valid email';
  }
  progress.ack = ackStatus;

  var quoStatus = quiet ? 'NOT CREATED — held as suspected spam' : createWebQuoContact_(lead);
  progress.quo = quoStatus;

  // The alert must never be able to kill the run before the row is written
  // — that is the BP intake bug from 2026-08-26. Guarded, and the row is
  // written whatever happens.
  var alertStatus;
  if (quiet) {
    alertStatus = 'NOT SENT — held as suspected spam';
    progress.alertEmail = alertStatus;
    progress.alertSms = alertStatus;
  } else {
    try {
      alertStatus = sendWebInternalAlert_(lead, ackStatus, quoStatus, dupe, progress);
    } catch (eAlert) {
      alertStatus = '⚠️ alert failed: ' + eAlert;
      progress.alertEmail = alertStatus;
    }
  }

  var now = new Date();
  sheet.appendRow([
    lead.receivedAt,                                  // A  Received
    now,                                              // B  Processed
    Math.round((now - lead.receivedAt) / 600) / 100,  // C  Minutes to ack
    lead.formSource,                                  // D  apply / contact
    lead.name, lead.firstName, lead.lastName,
    lead.email, lead.phoneE164 || lead.phone,
    lead.borrowerType, lead.loanType, lead.propertyType,
    lead.propertyAddress, lead.purchasePrice, lead.loanAmount, lead.arv,
    lead.exitStrategy, lead.timeline, lead.experience, lead.creditScore,
    lead.additionalInfo,
    // ── TCPA consent proof — verbatim, never paraphrased ──
    lead.smsConsent, lead.consent, lead.consentVersion, lead.consentTimestampUtc,
    lead.consentIp, lead.consentUserAgent, lead.consentPageUrl, lead.consentText,
    // ── processing ──
    webQuickFlags_(lead).join(' · '),
    ackStatus, quoStatus, alertStatus,
    '', '', '',                                       // Fit · Draft ready · Sequence step (cloud tasks)
    lead.messageId || '',
    lead.messageId ? ('https://mail.google.com/mail/u/0/#inbox/' + lead.messageId) : '(direct webhook — no email)',
    JSON.stringify(lead)
  ]);
  progress.sheetRow = 'written';

  return { ack: ackStatus, quo: quoStatus, alert: alertStatus };
}

function webSendAck_(lead) {
  var html = webMerge_(webAckHtml_(), lead);
  GmailApp.sendEmail(lead.email, webMerge_(WEB_ACK_SUBJECT, lead), webHtmlToText_(html), {
    htmlBody: html,
    name: WEB_SENDER_NAME,
    replyTo: WEB_REPLY_TO
  });
}

function sendWebInternalAlert_(lead, ackStatus, quoStatus, dupe, progress) {
  progress = progress || {};

  var tel = lead.phoneE164 || '';
  var line = [
    lead.name,
    lead.borrowerType !== 'N/A' ? lead.borrowerType : '',
    lead.loanType !== 'N/A' ? lead.loanType : '',
    lead.propertyType !== 'N/A' ? lead.propertyType : '',
    lead.propertyAddress !== 'N/A' ? lead.propertyAddress : '',
    lead.loanAmount !== 'N/A' ? 'needs ' + lead.loanAmount : '',
    lead.creditScore !== 'N/A' ? 'credit ' + lead.creditScore : '',
    lead.experience !== 'N/A' ? lead.experience + ' deals' : ''
  ].filter(function (s) { return s && s !== 'N/A'; }).join(' · ');

  var flags = webQuickFlags_(lead);

  var html =
    '<p style="font:16px/1.4 -apple-system,Segoe UI,Arial"><strong>🔔 NEW WEBSITE LEAD' +
      (dupe ? ' (REPEAT)' : '') + ' — call now</strong></p>' +
    '<p style="font:14px/1.5 -apple-system,Segoe UI,Arial">' + webEsc_(line) + '</p>' +
    (flags.length
      ? '<p style="font:13px/1.5 -apple-system,Segoe UI,Arial;color:#B00020"><strong>Check:</strong> ' +
        webEsc_(flags.join(' · ')) + '</p>'
      : '') +
    '<p style="font:14px/1.6 -apple-system,Segoe UI,Arial">' +
      (tel ? '📞 <a href="tel:' + webEsc_(tel) + '">' + webEsc_(lead.phone) + '</a><br>' : '') +
      '✉️ <a href="mailto:' + webEsc_(lead.email) + '">' + webEsc_(lead.email) + '</a><br>' +
      '📝 Form: ' + webEsc_(lead.formSource) +
      ' · SMS consent: <strong>' + webEsc_(lead.smsConsent) + '</strong>' +
    '</p>' +
    (lead.additionalInfo && lead.additionalInfo !== 'N/A'
      ? '<p style="font:13px/1.5 -apple-system,Segoe UI,Arial;background:#F5F6F8;padding:10px;border-left:3px solid #B88E3E">' +
        webEsc_(lead.additionalInfo) + '</p>'
      : '') +
    '<p style="font:13px/1.5 -apple-system,Segoe UI,Arial;color:#555">' +
      'Ack: ' + webEsc_(ackStatus) + '<br>Quo: ' + webEsc_(quoStatus) + '<br>' +
      (lead.messageId
        ? '<a href="https://mail.google.com/mail/u/0/#inbox/' + lead.messageId + '">Open the submission</a>'
        : 'Arrived by direct webhook from the website.') +
    '</p>' +
    '<p style="font:12px/1.5 -apple-system,Segoe UI,Arial;color:#777">' +
      'The hourly <em>website-lead-triage</em> task will put a personalized reply in your Drafts.</p>';

  MailApp.sendEmail({
    to: WEB_ALERT_TO,
    subject: '🔔 New website lead' + (dupe ? ' (repeat)' : '') + ' — ' + lead.name +
             (lead.propertyAddress !== 'N/A' ? ' · ' + lead.propertyAddress : ''),
    htmlBody: html,
    body: webHtmlToText_(html)
  });
  progress.alertEmail = 'sent';

  var mobile = PropertiesService.getScriptProperties().getProperty('LUIS_MOBILE');
  if (mobile) {
    try {
      webQuoSend_(mobile, 'NEW WEB LEAD: ' + line + (tel ? ' · ' + tel : ''));
      progress.alertSms = 'sent';
    } catch (eSms) {
      progress.alertSms = 'failed: ' + eSms;
    }
  } else {
    progress.alertSms = 'skipped — no LUIS_MOBILE';
  }

  return 'sent';
}

/** Creates the lead as a Quo contact. Needs QUO_API_KEY script property. */
function createWebQuoContact_(lead) {
  var key = PropertiesService.getScriptProperties().getProperty('QUO_API_KEY');
  if (!key) return 'skipped — no QUO_API_KEY';
  if (!lead.phoneE164) return 'skipped — no usable phone';
  try {
    var res = UrlFetchApp.fetch('https://api.openphone.com/v1/contacts', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: key },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        defaultFields: {
          firstName: lead.firstName,
          lastName: lead.lastName,
          company: lead.borrowerType === 'broker' ? 'Broker' : '',
          emails: [{ name: 'Email', value: lead.email }],
          phoneNumbers: [{ name: 'Mobile', value: lead.phoneE164 }]
        },
        source: 'Website (' + lead.formSource + ')'
      })
    });
    var code = res.getResponseCode();
    return (code >= 200 && code < 300) ? 'created' : 'failed (' + code + ')';
  } catch (e) {
    return 'failed: ' + e;
  }
}

function webQuoSend_(to, text) {
  var key = PropertiesService.getScriptProperties().getProperty('QUO_API_KEY');
  if (!key) throw new Error('no QUO_API_KEY');
  UrlFetchApp.fetch('https://api.openphone.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: key },
    muteHttpExceptions: true,
    payload: JSON.stringify({ from: WEB_QUO_FROM, to: [to], content: text })
  });
}

// ───────────────────────── THE PARSER ─────────────────────────

/* Formspree renders the submission as a flat list:
 *
 *     firstName:
 *     Katrina
 *
 *     lastName:
 *     Lane
 *
 *     propertyAddress:
 *
 *     additionalInfo:
 *     I am a mortgage broker and I have an
 *     experienced builder who needs financing...
 *
 * So: a line that is exactly "someKey:" opens a field, and everything up to
 * the next such line is its value. Blank values are normal — most leads
 * leave half the form empty. Every field defaults to 'N/A'.
 */
function parseWebLead_(body) {
  var text = String(body || '').replace(/\r\n/g, '\n');

  // Drop the Formspree footer so its prose never lands in a field.
  var cut = text.search(/\nSubmitted [^\n]*\n-{3,}\n/);
  if (cut === -1) cut = text.search(/\n-{3,}\n\s*You are receiving this because/);
  if (cut > -1) text = text.slice(0, cut);

  var lines = text.split('\n');
  var raw = {};
  var key = null;
  var buf = [];
  var flush = function () {
    if (key) raw[key] = buf.join('\n').trim();
    buf = [];
  };

  for (var i = 0; i < lines.length; i++) {
    var m = /^([A-Za-z_][A-Za-z0-9_]{0,40}):\s*$/.exec(lines[i]);
    if (m) { flush(); key = m[1]; }
    else if (key) { buf.push(lines[i]); }
  }
  flush();

  var g = function (k) {
    var v = raw[k];
    return (v === undefined || v === '') ? 'N/A' : v;
  };

  var lead = {
    firstName:        g('firstName'),
    lastName:         g('lastName'),
    email:            (raw.email || '').trim().toLowerCase(),
    phone:            g('phone'),
    borrowerType:     g('borrowerType'),
    loanType:         g('loanType'),
    propertyAddress:  g('propertyAddress'),
    propertyType:     g('propertyType'),
    purchasePrice:    g('purchasePrice'),
    loanAmount:       g('loanAmount'),
    arv:              g('arv'),
    exitStrategy:     g('exitStrategy'),
    timeline:         g('timeline'),
    experience:       g('experience'),
    creditScore:      g('creditScore'),
    additionalInfo:   g('additionalInfo'),
    // TCPA consent block — verbatim
    consent:             g('consent'),
    smsConsent:          g('sms_consent'),
    consentText:         g('consent_text'),
    consentVersion:      g('consent_version'),
    consentTimestampUtc: g('consent_timestamp_utc'),
    consentIp:           g('consent_ip'),
    consentUserAgent:    g('consent_user_agent'),
    consentPageUrl:      g('consent_page_url')
  };

  var fn = lead.firstName === 'N/A' ? '' : lead.firstName;
  var ln = lead.lastName === 'N/A' ? '' : lead.lastName;
  lead.name = (webCap_(fn) + ' ' + webCap_(ln)).trim() || (lead.email || 'Unknown');
  lead.phoneE164 = webE164_(lead.phone);
  lead.goal = webGoalPhrase_(lead);
  lead.goalSubject = lead.goal.replace(/^(your|a|an)\s+/i, '');

  return lead;
}

/** Which form it came from — the subject is set per-form, the URL confirms. */
function webFormSource_(subject, pageUrl) {
  var s = String(subject || '').toLowerCase();
  var u = String(pageUrl || '').toLowerCase();
  if (u.indexOf('/apply') > -1 || s.indexOf('apply') > -1) {
    return u.indexOf('type=broker') > -1 ? 'apply (broker)' : 'apply';
  }
  if (s.indexOf('loan-inquiry') > -1) return 'contact (loan inquiry)';
  return 'contact';
}

/* Formspree's own account mail is always branded "Formspree - ...".
 * Lead subjects are set per-form and never contain the word: "New apply lead",
 * "New apply lead — SMS/Call opt-in ✓", "loan-inquiry", "other". Keying on
 * that one word avoids false-positives on a lead whose subject happens to
 * contain "plan" or "invoice". The marker list is a second net for any
 * account mail that is not branded. */
function webIsNotALead_(subject) {
  var s = String(subject || '').toLowerCase();
  if (s.indexOf('formspree') > -1) return true;
  for (var i = 0; i < WEB_NOT_A_LEAD.length; i++) {
    if (s.indexOf(WEB_NOT_A_LEAD[i]) > -1) return true;
  }
  return false;
}

/**
 * Luis testing his own form is not a lead.
 *
 * NARROWED 2026-09-03. This used to scan `additionalInfo` — the free-text
 * message box — for the marker words. That put a real borrower one sentence
 * away from being silently discarded: "just testing the waters on a duplex"
 * contains no marker, but "we ran a diagnostic on the roof" does, and so would
 * any number of ordinary sentences. Markers are now matched against the NAME
 * fields only, where a real person has no reason to type them.
 */
function webIsTestSubmission_(lead) {
  var blob = [lead.firstName, lead.lastName].join(' ').toLowerCase();
  for (var i = 0; i < WEB_TEST_MARKERS.length; i++) {
    if (blob.indexOf(WEB_TEST_MARKERS[i]) > -1) return true;
  }
  if (/\bfundedcapital\.com$/i.test(lead.email)) return true;
  if (!webIsEmail_(lead.email)) return true;
  return false;
}

/** Cheap, deterministic pre-flags for the alert. The cloud task does the real triage. */
function webQuickFlags_(lead) {
  var flags = [];
  var blob = [lead.propertyAddress, lead.additionalInfo].join(' ');

  for (var i = 0; i < WEB_EXCLUDED_STATES.length; i++) {
    var st = WEB_EXCLUDED_STATES[i];
    if (new RegExp('(,|\\s)' + st + '(\\s|,|$)').test(blob)) {
      flags.push('possible ' + st + ' — outside footprint');
    }
  }

  // Unit counts. The cap is 4 PER PARCEL, so a big number is a question, not a no.
  var units = /(\d{1,4})\s*[- ]?\s*unit/i.exec(blob);
  if (units && parseInt(units[1], 10) > 4) {
    flags.push(units[1] + ' units — confirm units per parcel (cap is 4/parcel)');
  }

  var amt = webMoney_(lead.loanAmount);
  if (amt !== null && amt > 0 && amt < 75000)  flags.push('below $75K minimum');
  if (amt !== null && amt > 5000000)           flags.push('above $5M maximum');

  if (/^(5[0-9]{2}|6[0-3][0-9])\b/.test(String(lead.creditScore))) {
    flags.push('credit below 640 band');
  }
  if (/owner.?occup|primary residence|live in|my home/i.test(blob)) {
    flags.push('possible owner-occupied — investors only');
  }
  if (String(lead.borrowerType).toLowerCase() === 'broker') {
    flags.push('BROKER — route to the broker channel');
  }
  if (String(lead.smsConsent).toUpperCase().indexOf('YES') > -1) {
    flags.push('SMS consent on file');
  }
  return flags;
}

// ───────────────────────── SHEET ─────────────────────────

function webSpreadsheet_() {
  var folder = DriveApp.getFolderById(WEB_INTAKE_FOLDER);
  var it = folder.getFilesByName(WEB_SHEET_FILE_NAME);
  if (it.hasNext()) return SpreadsheetApp.open(it.next());
  var ss = SpreadsheetApp.create(WEB_SHEET_FILE_NAME);
  var file = DriveApp.getFileById(ss.getId());
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  var sheet = ss.getSheets()[0];
  sheet.setName(WEB_SHEET_TAB);
  webEnsureHeader_(sheet);
  return ss;
}

function webEnsureHeader_(sheet) {
  if (sheet.getLastRow() > 0) return;
  sheet.appendRow([
    'Received', 'Processed', 'Minutes to Ack', 'Form',
    'Name', 'First', 'Last', 'Email', 'Phone',
    'Borrower Type', 'Loan Type', 'Property Type',
    'Property Address', 'Purchase Price', 'Loan Amount', 'ARV',
    'Exit', 'Timeline', 'Experience', 'Credit Score', 'Additional Info',
    'SMS Consent', 'Consent', 'Consent Version', 'Consent Timestamp UTC',
    'Consent IP', 'Consent User Agent', 'Consent Page URL', 'Consent Text',
    'Flags', 'Ack Status', 'Quo Status', 'Alert Status',
    'Fit', 'Draft Ready', 'Sequence Step',
    'Gmail Message ID', 'Gmail Link', 'Raw JSON'
  ]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
}

function webFindRecentLeadByEmail_(sheet, email, days) {
  if (!webIsEmail_(email)) return null;
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var n = Math.min(400, last - 1);
  var rows = sheet.getRange(last - n + 1, 1, n, 8).getValues(); // A..H, H = Email
  var cutoff = new Date().getTime() - days * 864e5;
  for (var i = rows.length - 1; i >= 0; i--) {
    var when = rows[i][0];
    var addr = String(rows[i][7] || '').toLowerCase();
    if (addr === email && when && new Date(when).getTime() >= cutoff) {
      return Utilities.formatDate(new Date(when), Session.getScriptTimeZone(), 'MMM d');
    }
  }
  return null;
}

// ───────────────────────── FAILURE REPORTING ─────────────────────────

function webReportFailure_(msg, progress, err) {
  var lostRow = (progress.sheetRow === 'NOT WRITTEN');
  try {
    MailApp.sendEmail({
      to: WEB_ALERT_TO,
      subject: (lostRow ? '⚠️ Website lead NOT LOGGED — ' : '⚠️ Website lead intake error — ') + msg.getSubject(),
      body:
        'The website intake script hit an error on this email.\n' +
        'The thread is labeled Web/Error in Gmail.\n\n' +
        '── WHAT GOT DONE ───────────────────────────────\n' +
        '  Lead details parsed ....... ' + progress.parsed + '\n' +
        '  Acknowledgment to lead .... ' + progress.ack + '\n' +
        '  Quo contact ............... ' + progress.quo + '\n' +
        '  Alert email to you ........ ' + progress.alertEmail + '\n' +
        '  Text alert to you ......... ' + progress.alertSms + '\n' +
        '  Row in the leads Sheet .... ' + progress.sheetRow + '\n' +
        '────────────────────────────────────────────────\n\n' +
        (lostRow
          ? 'WHAT TO DO\n' +
            'This lead is NOT in the leads Sheet, and the script will not retry\n' +
            'it (the intake query skips anything tagged Web/Error).\n' +
            'To recover it, open the script and run:\n\n' +
            "    backfillWebLeadByMessageId_('" + msg.getId() + "')\n\n" +
            'That writes the row and re-tags the thread. It sends nothing.\n\n'
          : 'The lead IS logged in the Sheet. Review the failed step above.\n\n') +
        (String(progress.ack).indexOf('FAIL') >= 0
          ? '⚠️ The lead was never acknowledged. Email them by hand now.\n\n'
          : '') +
        'Technical detail:\n' + err + '\n' + (err.stack || '')
    });
  } catch (e) {
    Logger.log('Could not send the failure alert: ' + e);
  }
}

/** Recovery: log a lead the script failed on. Writes the row, sends nothing. */
function backfillWebLeadByMessageId_(messageId) {
  var msg = GmailApp.getMessageById(messageId);
  var lead = parseWebLead_(msg.getPlainBody());
  lead.messageId  = msg.getId();
  lead.receivedAt = msg.getDate();
  lead.subject    = msg.getSubject();
  lead.formSource = webFormSource_(msg.getSubject(), lead.consentPageUrl);

  var ss = webSpreadsheet_();
  var sheet = ss.getSheetByName(WEB_SHEET_TAB) || ss.insertSheet(WEB_SHEET_TAB);
  webEnsureHeader_(sheet);

  var now = new Date();
  sheet.appendRow([
    lead.receivedAt, now, Math.round((now - lead.receivedAt) / 600) / 100, lead.formSource,
    lead.name, lead.firstName, lead.lastName, lead.email, lead.phoneE164 || lead.phone,
    lead.borrowerType, lead.loanType, lead.propertyType,
    lead.propertyAddress, lead.purchasePrice, lead.loanAmount, lead.arv,
    lead.exitStrategy, lead.timeline, lead.experience, lead.creditScore, lead.additionalInfo,
    lead.smsConsent, lead.consent, lead.consentVersion, lead.consentTimestampUtc,
    lead.consentIp, lead.consentUserAgent, lead.consentPageUrl, lead.consentText,
    webQuickFlags_(lead).join(' · '),
    'BACKFILL — not acknowledged', 'BACKFILL — skipped', 'BACKFILL — skipped',
    '', '', '',
    lead.messageId,
    'https://mail.google.com/mail/u/0/#inbox/' + lead.messageId,
    JSON.stringify(lead)
  ]);

  var t = msg.getThread();
  t.removeLabel(webLabel_(WEB_LABEL_ERROR));
  t.addLabel(webLabel_(WEB_LABEL_PROCESSED));
  Logger.log('Backfilled ' + lead.name + '. Nothing was sent — acknowledge by hand if needed.');
}

// ───────────────────────── HELPERS ─────────────────────────

function webLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function webIsEmail_(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');
}

function webCap_(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function webEsc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function webMerge_(tpl, lead) {
  return String(tpl)
    .replace(/\{\{first\}\}/g,       webEsc_(lead.firstName === 'N/A' ? 'there' : webCap_(lead.firstName)))
    .replace(/\{\{goalSubject\}\}/g, webEsc_(lead.goalSubject || lead.goal))
    .replace(/\{\{goal\}\}/g,        webEsc_(lead.goal));
}

/** US numbers only — anything else is left alone rather than mangled. */
function webE164_(phone) {
  var d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d.charAt(0) === '1') return '+' + d;
  return '';
}

function webMoney_(s) {
  var d = String(s || '').replace(/[^0-9.]/g, '');
  if (!d) return null;
  var n = parseFloat(d);
  return isNaN(n) ? null : n;
}

/** The goal phrase merged into the ack. Deliberately vague where the form was. */
function webGoalPhrase_(lead) {
  var lt = String(lead.loanType || '').toLowerCase();
  var pt = String(lead.propertyType || '').toLowerCase();
  if (lt.indexOf('construction') > -1 || lt.indexOf('ground') > -1) return 'your ground-up construction project';
  if (lt.indexOf('fix') > -1 || lt.indexOf('flip') > -1)             return 'your fix and flip';
  if (lt.indexOf('dscr') > -1 || lt.indexOf('rental') > -1)          return 'a DSCR rental loan';
  if (lt.indexOf('portfolio') > -1 || lt.indexOf('blanket') > -1)    return 'your rental portfolio';
  if (lt.indexOf('bridge') > -1)                                     return 'your bridge financing';
  if (lt.indexOf('multifamily') > -1 || pt.indexOf('multifamily') > -1) return 'your multifamily deal';
  return 'your financing';
}

function webHtmlToText_(h) {
  return String(h)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&rsquo;/g, "'").replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ═════════════════════ DIRECT WEBHOOK (added 2026-09-03) ═════════════════════
/*
 * Until now this engine only ever saw leads second-hand: the website posted to
 * Formspree, Formspree emailed luis@, and processWebsiteLeads polled Gmail for
 * that email. That made a metered third-party service a load-bearing part of
 * the lead pipeline, and on 2026-09-02 it broke exactly as you would expect —
 * a bot spent the 50/month allowance, Formspree stopped emailing, and with it
 * the acks, the Quo contacts, the leads Sheet and the "call now" alerts all
 * stopped, silently, for real leads.
 *
 * These two functions let /api/lead post the lead straight in. Same lead
 * object, same handleWebLead_, same Sheet, same ack — just without the round
 * trip through a third party's inbox. Formspree stays wired on the website as
 * an emergency backstop, and if it ever fires, the Gmail poller still picks
 * that up, so the two paths cover each other and neither double-processes
 * (the poller only ever sees mail that the direct path failed to handle).
 */

/** Entry point for {action:"lead"} posts from the website's /api/lead route. */
function handleDirectWebLead_(body) {
  var lead = webLeadFromPayload_(body.lead || {}, body.formType);

  var progress = {
    parsed: 'yes', ack: 'not reached', quo: 'not reached',
    alertEmail: 'not reached', alertSms: 'not reached', sheetRow: 'NOT WRITTEN'
  };

  // notify:false is how /api/lead marks a submission its spam filter flagged
  // as suspected — record it, contact nobody.
  var quiet = body.notify === false;

  /* An internal test is held back, NOT thrown away.
   *
   * This used to `return` here with no row, no email and no log line — and on
   * 2026-09-03 that produced a submission that vanished completely while still
   * showing the visitor a thank-you page. Four separate checks came back empty
   * with nothing to debug from. Now a test is just another quiet submission:
   * the row is always written, flagged with the reason, and nothing is sent.
   * If the classifier is ever wrong, the lead is sitting in the Sheet. */
  var testReason = webDirectTestReason_(lead);
  if (testReason) {
    quiet = true;
    lead.spamFlag = 'INTERNAL TEST — ' + testReason + ' — nothing was sent';
    Logger.log('Direct lead held as internal test (' + testReason + '): ' +
               lead.name + ' / ' + lead.email);
  }

  try {
    var result = handleWebLead_(lead, progress, { quiet: quiet });
    Logger.log('Direct website lead: ' + lead.name + ' → ' + JSON.stringify(result));
    return { ok: true, quiet: quiet, ack: result.ack, quo: result.quo };
  } catch (err) {
    // The row is the thing that must never be lost. If handleWebLead_ died
    // before writing it, say so loudly and hand over the full payload — there
    // is no Gmail thread to recover this one from.
    webReportDirectFailure_(lead, progress, err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Builds the same lead object parseWebLead_ produces, but from the JSON the
 * website posts instead of from Formspree's plain-text email body.
 *
 * Keep the shape identical to parseWebLead_ — handleWebLead_, the Sheet
 * columns, webQuickFlags_ and the ack merge all depend on it, including the
 * 'N/A' convention for empty fields.
 */
function webLeadFromPayload_(p, formType) {
  var g = function (k) {
    var v = p[k];
    return (v === undefined || v === null || String(v).trim() === '') ? 'N/A' : String(v).trim();
  };

  var lead = {
    firstName:       g('firstName'),
    lastName:        g('lastName'),
    email:           String(p.email || '').trim().toLowerCase(),
    phone:           g('phone'),
    borrowerType:    g('borrowerType'),
    loanType:        g('loanType'),
    propertyAddress: g('propertyAddress'),
    propertyType:    g('propertyType'),
    purchasePrice:   g('purchasePrice'),
    loanAmount:      g('loanAmount'),
    arv:             g('arv'),
    exitStrategy:    g('exitStrategy'),
    timeline:        g('timeline'),
    experience:      g('experience'),
    // The contact form calls this field "message"; the apply form calls it
    // "additionalInfo". Both are the same thing to everyone downstream.
    additionalInfo:  (p.additionalInfo && String(p.additionalInfo).trim())
                       ? String(p.additionalInfo).trim()
                       : g('message'),
    creditScore:     g('creditScore'),
    // TCPA consent block — verbatim, never paraphrased.
    consent:             g('consent'),
    smsConsent:          g('sms_consent'),
    consentText:         g('consent_text'),
    consentVersion:      g('consent_version'),
    consentTimestampUtc: g('consent_timestamp_utc'),
    consentIp:           g('consent_ip'),
    consentUserAgent:    g('consent_user_agent'),
    consentPageUrl:      g('consent_page_url')
  };

  var fn = lead.firstName === 'N/A' ? '' : lead.firstName;
  var ln = lead.lastName === 'N/A' ? '' : lead.lastName;
  lead.name = (webCap_(fn) + ' ' + webCap_(ln)).trim() || (lead.email || 'Unknown');
  lead.phoneE164 = webE164_(lead.phone);
  lead.goal = webGoalPhrase_(lead);
  lead.goalSubject = lead.goal.replace(/^(your|a|an)\s+/i, '');

  // No Gmail message behind a direct post.
  lead.messageId  = '';
  lead.receivedAt = new Date();
  lead.subject    = p._subject || ('New ' + (formType || 'website') + ' lead');
  lead.formSource = webFormSource_(lead.subject, lead.consentPageUrl) ||
                    (formType === 'contact' ? 'contact' : 'apply');

  // Carried through from the website's spam filter so the Sheet row explains
  // itself and the flag survives into the Raw JSON column.
  if (p.spam_flag)    lead.spamFlag    = String(p.spam_flag);
  if (p.spam_score)   lead.spamScore   = String(p.spam_score);
  if (p.spam_reasons) lead.spamReasons = String(p.spam_reasons);

  return lead;
}

/** A direct lead has no Gmail thread to recover from, so the alert carries it. */
function webReportDirectFailure_(lead, progress, err) {
  try {
    MailApp.sendEmail({
      to: WEB_ALERT_TO,
      subject: (progress.sheetRow === 'NOT WRITTEN'
                 ? '⚠️ Website lead NOT LOGGED — '
                 : '⚠️ Website lead intake error — ') + (lead.name || 'unknown lead'),
      body:
        'A lead posted directly from the website hit an error.\n' +
        'There is NO Gmail thread for this one — the details below are the\n' +
        'only copy outside the Vercel logs. Work it by hand.\n\n' +
        '── THE LEAD ────────────────────────────────────\n' +
        '  Name .... ' + lead.name + '\n' +
        '  Email ... ' + lead.email + '\n' +
        '  Phone ... ' + (lead.phoneE164 || lead.phone) + '\n' +
        '  Form .... ' + lead.formSource + '\n\n' +
        '── WHAT GOT DONE ───────────────────────────────\n' +
        '  Acknowledgment to lead .... ' + progress.ack + '\n' +
        '  Quo contact ............... ' + progress.quo + '\n' +
        '  Alert email to you ........ ' + progress.alertEmail + '\n' +
        '  Row in the leads Sheet .... ' + progress.sheetRow + '\n' +
        '────────────────────────────────────────────────\n\n' +
        'Full payload:\n' + JSON.stringify(lead, null, 2) + '\n\n' +
        'Technical detail:\n' + err + '\n' + (err.stack || '')
    });
  } catch (e) {
    Logger.log('Could not send the direct-lead failure alert: ' + e);
  }
}

/**
 * Why a directly-posted lead should be held back as an internal test, or ''
 * if it is a real lead. The reason string is written into the Sheet row, so
 * every held submission explains itself without anyone reading code.
 *
 * Deliberately narrower than the Gmail poller's webIsTestSubmission_. That one
 * has to identify Luis's own submissions from a Formspree email with no other
 * signal, so it leans on marker words. Here the website tells us who submitted
 * and from where, so we can rely on facts instead of guesswork:
 *
 *   - a fundedcapital.com address is unambiguously our own
 *   - "test-ignore" in a NAME is a deliberate sentinel, not something a real
 *     person types
 *   - an unusable email means there is nobody to acknowledge, whether or not
 *     the submission is genuine — so record it and flag it for a human rather
 *     than firing an ack into the void
 *
 * Everything else is treated as a real lead. A borrower who writes "just
 * testing the waters" or "we ran diagnostics on the HVAC" gets the full
 * treatment, which is the whole point of this function existing separately.
 */
function webDirectTestReason_(lead) {
  if (/@fundedcapital\.com$/i.test(lead.email)) {
    return 'submitted from a fundedcapital.com address';
  }
  var name = (lead.firstName + ' ' + lead.lastName).toLowerCase();
  if (name.indexOf('test-ignore') > -1) {
    return 'the name carries the test-ignore marker';
  }
  if (!webIsEmail_(lead.email)) {
    return 'no valid email address to reply to — REVIEW THIS ONE BY HAND';
  }
  return '';
}
