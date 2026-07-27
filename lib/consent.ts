/**
 * Single source of truth for the SMS/call consent language.
 *
 * WHY THIS LIVES IN ONE PLACE:
 * For TCPA compliance and A2P 10DLC registration, the consent record we store
 * must be the EXACT text the visitor saw. Defining it here means the words the
 * form renders and the words we log can never drift apart — the form renders
 * SMS_CONSENT_TEXT (with the two document names turned into links) and the
 * server logs the same constant verbatim as the proof-of-consent record.
 *
 * If you ever change the wording, bump CONSENT_VERSION so older lead records
 * remain attributable to the exact language shown at the time they opted in.
 */

export const CONSENT_VERSION = "2026-07-27";

/**
 * The exact consent language displayed beside the SMS/call opt-in checkbox.
 * The form renders this with "Privacy Policy" and "Terms & Conditions" as
 * links; the plain-text words are otherwise identical to what is shown.
 */
export const SMS_CONSENT_TEXT =
  "I agree to receive calls and text messages, including automated ones, from " +
  "Funded Capital at the number provided about my inquiry and loan options. " +
  "Consent is not a condition of any loan or service. Message and data rates " +
  "may apply; message frequency varies. Reply STOP to opt out or HELP for help. " +
  "See our Privacy Policy and Terms & Conditions.";
