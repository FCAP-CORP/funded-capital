/**
 * WEBHOOK LEAD INTAKE — closes the last gap in the lead pipeline
 * Funded Capital · 2026-08-30
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 * apps-script-website-lead-intake.gs works, and it is good — but it reads
 * leads out of GMAIL. That means the whole engine sits DOWNSTREAM of
 * Formspree:
 *
 *     visitor → /api/lead → Formspree → email → Gmail → intake script
 *                              ▲
 *                    if this drops the submission,
 *                    nothing after it ever runs
 *
 * And Formspree does drop submissions. It accepts them (HTTP 200) and then
 * spam-bins them silently — confirmed in the 2026-08-03 weekly digest, which
 * shows an /apply submission from megomike1972@gmail.com blocked as spam on
 * Jul 28. No email means no Gmail thread, no Sheet row, no acknowledgment,
 * no alert. The lead simply never existed as far as we are concerned.
 *
 * app/api/lead/route.ts ALREADY posts every lead straight here, to the Drive
 * web app, with action:"lead" — a path that never touches Formspree. But
 * doPost has no branch for it, so it falls through to the broker-portal
 * upload handler, which creates an empty "Submission <timestamp>" folder in
 * Broker Portal Intake and nothing else. Four of those exist right now,
 * including one for Katrina Lane on Aug 29.
 *
 * This patch adds that branch. After it, Formspree is a notifier rather than
 * a dependency, and a spam-binned submission still lands in the Sheet, still
 * gets acknowledged, and still raises the call-now alert.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW TO INSTALL (about 3 minutes, one time)
 * ─────────────────────────────────────────────────────────────────────────
 *  1. script.google.com → open the project that holds the BROKER PORTAL
 *     upload script (the one DRIVE_WEBAPP_URL points at). It must be the
 *     same project that holds apps-script-website-lead-intake.gs, because
 *     this file calls that file's handleWebLead_() and parse helpers.
 *  2. File → + → Script, name it "WebhookLead", paste ALL of this in.
 *  3. Open the file that defines doPost and add ONE line as the FIRST thing
 *     inside doPost, before any other handling:
 *
 *         function doPost(e) {
 *           var lead = maybeHandleLeadWebhook_(e);   // ←  add this line
 *           if (lead) return lead;                   // ←  and this one
 *           ...everything that is already there, unchanged...
 *         }
 *
 *  4. Deploy → Manage deployments → edit the existing deployment → Version:
 *     New version → Deploy. (Editing the existing deployment keeps the same
 *     URL, so DRIVE_WEBAPP_URL does not change.)
 *  5. Test: run testLeadWebhook_ from the dropdown → View → Logs. It builds
 *     a fake payload and runs the whole path WITHOUT sending anything.
 *
 * Then submit a real test from /apply with "DIAGNOSTIC" in the notes — the
 * intake script's own test filter will keep it out of the ack path, but you
 * should see the row appear in the Website Leads Sheet within seconds
 * instead of an empty Submission folder appearing in Drive.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DOUBLE-COUNTING
 * ─────────────────────────────────────────────────────────────────────────
 * Both paths now reach the Sheet for a healthy lead: this webhook (instant)
 * and the Gmail poller (within a minute). That is deliberate belt-and-braces
 * — but it must not produce two rows or two acknowledgment emails.
 *
 * It does not, for two reasons:
 *   1. handleWebLead_() already carries a duplicate guard — the same email
 *      address seen in the last 30 days is recorded but not acknowledged a
 *      second time (webFindRecentLeadByEmail_).
 *   2. This patch writes a marker into ScriptProperties keyed on email +
 *      minute. The Gmail poller checks it via leadAlreadyCapturedByWebhook_
 *      and labels the thread processed without re-handling it.
 *
 * To wire up guard 2, add these two lines to processWebsiteLeads() in
 * apps-script-website-lead-intake.gs, immediately after the parse:
 *
 *         if (leadAlreadyCapturedByWebhook_(lead)) {
 *           thread.addLabel(processedLabel); return;
 *         }
 *
 * If you skip that step nothing breaks — guard 1 still prevents a second
 * acknowledgment — you would just get a second, harmless row in the Sheet.
 */

// ───────────────────────────── CONFIG ─────────────────────────────
// Must match DRIVE_WEBAPP_SECRET in Vercel → Settings → Environment Variables.
// Read from Script Properties so the secret is never in source.
var LEAD_WEBHOOK_SECRET_PROP = 'DRIVE_WEBAPP_SECRET';

/** How long a webhook capture suppresses the Gmail poller for the same lead. */
var LEAD_WEBHOOK_DEDUPE_MINUTES = 90;

// ─────────────────────────── ENTRY POINT ───────────────────────────

/**
 * Returns a TextOutput when this request was a lead webhook, or null when it
 * was anything else (so doPost carries on to the broker-portal upload path
 * exactly as before). Never throws — a thrown error here would take the
 * broker portal's document upload down with it.
 */
function maybeHandleLeadWebhook_(e) {
  var data;
  try {
    if (!e || !e.postData || !e.postData.contents) return null;
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return null; // not JSON — not ours
  }
  if (!data || data.action !== 'lead') return null;

  // From here on it IS ours, so every exit returns a response.
  try {
    var expected = PropertiesService.getScriptProperties()
      .getProperty(LEAD_WEBHOOK_SECRET_PROP);
    if (!expected || String(data.secret) !== String(expected)) {
      return leadJson_({ ok: false, error: 'unauthorized' });
    }

    var lead = leadFromWebhookPayload_(data);

    // handleWebLead_ lives in apps-script-website-lead-intake.gs. It writes
    // the Sheet row, sends the approved acknowledgment, creates the Quo
    // contact and raises the call-now alert — the identical treatment a
    // Gmail-sourced lead gets, so there is one code path and one behaviour.
    if (typeof handleWebLead_ !== 'function') {
      // The intake script is not in this project. Do not lose the lead:
      // record it where it will be found.
      leadEmergencyLog_(lead, 'handleWebLead_ not found in this project');
      return leadJson_({ ok: false, error: 'intake_script_missing' });
    }

    var progress = {
      parsed: 'yes', ack: 'not reached', quo: 'not reached',
      alertEmail: 'not reached', alertSms: 'not reached',
      sheetRow: 'NOT WRITTEN'
    };
    var result = handleWebLead_(lead, progress);
    markLeadCapturedByWebhook_(lead);

    return leadJson_({ ok: true, source: 'webhook', result: result });
  } catch (err) {
    // A lead reached us and we failed to process it. That is exactly the
    // scenario this whole file exists to prevent, so shout about it.
    try { leadEmergencyLog_(data, String(err) + '\n' + (err.stack || '')); } catch (e2) {}
    return leadJson_({ ok: false, error: String(err) });
  }
}

// ──────────────────────────── MAPPING ────────────────────────────

/**
 * Turns the /api/lead payload into the same shape the Gmail parser produces,
 * so handleWebLead_ cannot tell the two sources apart.
 *
 * The route sends consent fields in snake_case (sms_consent, consent_text,
 * consent_ip …) because that is how they are stored on the Formspree record;
 * the parser hands back camelCase. This is where the two meet.
 */
function leadFromWebhookPayload_(data) {
  var p = data.lead || {};
  var g = function (k) {
    var v = p[k];
    return (v === undefined || v === null || v === '') ? 'N/A' : String(v);
  };

  var lead = {
    firstName: g('firstName'),
    lastName: g('lastName'),
    email: String(p.email || '').trim().toLowerCase(),
    phone: g('phone'),
    borrowerType: g('borrowerType'),
    loanType: g('loanType'),
    propertyAddress: g('propertyAddress'),
    propertyType: g('propertyType'),
    purchasePrice: g('purchasePrice'),
    loanAmount: g('loanAmount'),
    arv: g('arv'),
    exitStrategy: g('exitStrategy'),
    timeline: g('timeline'),
    experience: g('experience'),
    creditScore: g('creditScore'),
    additionalInfo: g('additionalInfo'),
    // Contact-form-only field; harmless on an apply lead.
    subject: g('subject'),
    message: g('message'),
    // ── TCPA consent proof — copied verbatim, never re-derived ──
    consent: g('consent'),
    smsConsent: g('sms_consent'),
    consentText: g('consent_text'),
    consentVersion: g('consent_version'),
    consentTimestampUtc: g('consent_timestamp_utc'),
    consentIp: g('consent_ip'),
    consentUserAgent: g('consent_user_agent'),
    consentPageUrl: g('consent_page_url')
  };

  // The contact form has no additionalInfo field — its free text is `message`.
  // Fold it in so the Sheet column and the alert are never blank for a
  // contact lead that actually said something.
  if (lead.additionalInfo === 'N/A' && lead.message !== 'N/A') {
    lead.additionalInfo = lead.message;
  }

  // Derived fields the intake script's helpers normally add.
  var fn = lead.firstName === 'N/A' ? '' : lead.firstName;
  var ln = lead.lastName === 'N/A' ? '' : lead.lastName;
  lead.name =
    (typeof webCap_ === 'function'
      ? (webCap_(fn) + ' ' + webCap_(ln)).trim()
      : (fn + ' ' + ln).trim()) || lead.email || 'Unknown';

  lead.phoneE164 = (typeof webE164_ === 'function')
    ? webE164_(lead.phone)
    : leadE164Fallback_(lead.phone);

  if (typeof webGoalPhrase_ === 'function') {
    lead.goal = webGoalPhrase_(lead);
    lead.goalSubject = lead.goal.replace(/^(your|a|an)\s+/i, '');
  } else {
    lead.goal = 'your financing';
    lead.goalSubject = 'financing';
  }

  lead.receivedAt = new Date();
  lead.formSource = leadFormSource_(data.formType, lead.consentPageUrl);
  lead.subjectLine = 'Webhook — ' + lead.formSource;

  // There is no Gmail message for a webhook lead. The Sheet's Gmail columns
  // are filled with an honest marker rather than a broken link, so nobody
  // clicks through to a 404 wondering where the email went.
  lead.messageId = 'webhook-' + Utilities.formatDate(
    lead.receivedAt, Session.getScriptTimeZone(), "yyyyMMdd'T'HHmmss"
  );

  return lead;
}

/** apply / apply (broker) / contact — same vocabulary the Sheet already uses. */
function leadFormSource_(formType, pageUrl) {
  var u = String(pageUrl || '').toLowerCase();
  if (String(formType) === 'apply' || u.indexOf('/apply') > -1) {
    return u.indexOf('type=broker') > -1 ? 'apply (broker)' : 'apply';
  }
  return 'contact';
}

/** Only used if webE164_ is not in the project. US numbers only. */
function leadE164Fallback_(phone) {
  var d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d.charAt(0) === '1') return '+' + d;
  return '';
}

// ─────────────────────────── DEDUPE ───────────────────────────

function leadWebhookKey_(lead) {
  return 'weblead:' + String(lead.email || '').toLowerCase();
}

function markLeadCapturedByWebhook_(lead) {
  try {
    PropertiesService.getScriptProperties()
      .setProperty(leadWebhookKey_(lead), String(new Date().getTime()));
  } catch (e) { /* dedupe is an optimisation, not a requirement */ }
}

/**
 * Call this from processWebsiteLeads() right after parsing, so the Gmail
 * poller does not re-handle a lead the webhook already captured.
 */
function leadAlreadyCapturedByWebhook_(lead) {
  try {
    var raw = PropertiesService.getScriptProperties()
      .getProperty(leadWebhookKey_(lead));
    if (!raw) return false;
    var age = (new Date().getTime() - Number(raw)) / 60000;
    return age >= 0 && age < LEAD_WEBHOOK_DEDUPE_MINUTES;
  } catch (e) {
    return false; // on doubt, process it — a duplicate row beats a lost lead
  }
}

// ──────────────────────── LAST-RESORT LOGGING ────────────────────────

/**
 * If we cannot process a lead, we must still be able to recover the person's
 * details by hand. Email beats a log line nobody reads.
 */
function leadEmergencyLog_(payload, reason) {
  var body =
    'A website lead reached the Drive webhook and could NOT be processed.\n' +
    'Recover this person by hand — they are not in the Sheet.\n\n' +
    'Reason: ' + reason + '\n\n' +
    JSON.stringify(payload, null, 2);
  Logger.log(body);
  try {
    MailApp.sendEmail({
      to: (typeof WEB_ALERT_TO !== 'undefined') ? WEB_ALERT_TO : 'luis@fundedcapital.com',
      subject: '⚠️ Website lead NOT captured — recover by hand',
      body: body
    });
  } catch (e) { /* nothing left to try */ }
}

function leadJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────────── TEST ─────────────────────────────

/**
 * Dry run. Builds the payload /api/lead actually sends, maps it, and logs the
 * result. Writes nothing and sends nothing — the mapping is what we are
 * checking, so it stops before handleWebLead_.
 */
function testLeadWebhook_() {
  var payload = {
    action: 'lead',
    formType: 'apply',
    notify: false,
    lead: {
      firstName: 'Katrina', lastName: 'Lane',
      email: 'example@example.com', phone: '6782789511',
      borrowerType: 'broker', loanType: 'construction',
      propertyType: 'multifamily', propertyAddress: '',
      purchasePrice: '', loanAmount: '', arv: '',
      exitStrategy: 'hold', timeline: 'flexible',
      experience: '10+', creditScore: '700-739',
      additionalInfo: 'Student housing in Greensboro NC, 24 units.',
      consent: 'on',
      sms_consent: 'YES — opted in to calls/texts',
      consent_text: 'I agree to receive calls and text messages...',
      consent_version: '2026-07-27',
      consent_timestamp_utc: '2026-08-29T17:22:56.767Z',
      consent_ip: '172.59.219.5',
      consent_user_agent: 'Mozilla/5.0',
      consent_page_url: 'https://www.fundedcapital.com/apply?type=broker'
    }
  };

  var lead = leadFromWebhookPayload_(payload);
  Logger.log('Mapped lead:\n' + JSON.stringify(lead, null, 2));
  Logger.log('Form source: ' + lead.formSource);
  Logger.log('Phone E.164: ' + lead.phoneE164);
  Logger.log('Ack subject would be: ' +
    (typeof webMerge_ === 'function' && typeof WEB_ACK_SUBJECT !== 'undefined'
      ? webMerge_(WEB_ACK_SUBJECT, lead)
      : '(intake script not in this project)'));
  Logger.log('Flags: ' +
    (typeof webQuickFlags_ === 'function' ? webQuickFlags_(lead).join(' · ') : 'n/a'));
  Logger.log('handleWebLead_ available: ' + (typeof handleWebLead_ === 'function'));
  Logger.log('\nNothing was written and nothing was sent.');
}
