# Participant Portal — Setup Runbook

**Owner:** Luis Fajardo · **Built:** 2026-09-07
**Route:** `/participant-portal` · **Repo:** `github.com/FCAP-CORP/funded-capital`

The portal reads the Revenue Share participant tracker through a Google Apps
Script web app. It is **read-only** — the spreadsheet stays the system of
record and stays where you administer the program. Nothing in the portal can
change a participant record.

Setup is four steps and runs about fifteen minutes. Do them in order.

---

## Step 1 — Convert the tracker to a Google Sheet

The portal cannot read an `.xlsx` file; it needs a native Google Sheet.

1. Open Drive and go to `08-data/`.
2. Right-click **FundedCapital_RevenueShare_Participant_Tracker.xlsx** → **Open with** → **Google Sheets**.
3. In the sheet that opens: **File → Save as Google Sheets**.
4. Rename the new file **FundedCapital_RevenueShare_Participant_Tracker** (no extension) and leave it in `08-data/`.

**From this point the Google Sheet is the live one.** Keep the `.xlsx` as an
archive, but do your daily work in the Sheet — the portal only sees the Sheet.

> Check the **Program Terms**, **Payment Schedule** and **Withdrawal Calculator**
> tabs after conversion. Google rewrites `EDATE`, `EOMONTH` and `COUNTIFS`
> faithfully, but confirm the Dashboard tab still shows the same totals it did
> in Excel before you rely on it.

### Optional — one column that unlocks document links

Add a column headed exactly **`Documents Folder`** to the **Participants** tab
(anywhere; the script reads by header name, not position). Put each
participant's Drive folder link in their row and their agreement and deposit
form become a link on their Documents page. Leave it out and the page shows a
"request a copy" message instead. Everything else works either way.

---

## Step 2 — Deploy the Apps Script

1. In the Google Sheet: **Extensions → Apps Script**.
2. Delete whatever is in `Code.gs` and paste the entire contents of
   `06-website-docs/participant-portal-apps-script.gs` from the website repo.
3. Near the top, replace `REPLACE_WITH_A_LONG_RANDOM_STRING` with a long random
   string. Generate one however you like — 40+ characters, letters and digits.
   **Keep it. You need the exact same string in Step 3.**
4. Save (disk icon).
5. **Deploy → New deployment** → gear icon → **Web app**.
   - Description: `Participant portal read`
   - **Execute as: Me**
   - **Who has access: Anyone**
6. **Deploy**, then authorise when Google asks. You will see a warning screen —
   click **Advanced → Go to (project name)** and allow.
7. Copy the **Web app URL**. It ends in `/exec`.

> **"Anyone" is correct and is not a hole.** Vercel calls this server-to-server
> with no Google login, so the door has to be open to the internet; the shared
> secret from step 3 is the lock. Anyone hitting that URL without the secret
> gets `{"ok":false,"error":"unauthorized"}` and nothing else. This is the same
> arrangement the broker portal already runs on.

---

## Step 3 — Set four environment variables in Vercel

Vercel → the `funded-capital` project → **Settings → Environment Variables**.
Add all four to **Production, Preview and Development**.

| Name | Value |
|---|---|
| `PARTICIPANT_WEBAPP_URL` | the `/exec` URL from step 2 |
| `PARTICIPANT_WEBAPP_SECRET` | the exact random string you set in the script |
| `PARTICIPANT_ADMIN_EMAILS` | `luis@fundedcapital.com` |
| *(no fourth variable — Clerk is already configured)* | |

`PARTICIPANT_ADMIN_EMAILS` accepts a comma-separated list if you ever want to
add someone. Only addresses on that list can reach **Program Book**; everyone
else gets a 404, so the page does not advertise that it exists.

Redeploy after saving — environment variables only take effect on a new build.

---

## Step 4 — Invite your first participant

Access is invite-only through Clerk, exactly like the broker portal.

1. Clerk dashboard → your application → **Users → Create user** (or **Invitations**).
2. Use **the same email address that is in the participant's row** on the
   Participants tab. This is the whole matching mechanism — the portal looks up
   the signed-in email against the Email column. A typo means they sign in
   successfully and see "No participation found."
3. Send them to `https://fundedcapital.com/participant-portal`.

**Test it on yourself first.** Put your own email in a test participant row,
sign in, confirm the numbers match the sheet, then delete the test row.

---

## What each page shows

| Page | Contents |
|---|---|
| **Overview** | Capital contributed, monthly revenue share, paid to date, next payment, designated loan reference and property, funding and maturity dates, term progress, withdrawal terms |
| **Payments** | Every payment sent with date, amount, method and confirmation reference; the full forward schedule through maturity with paid / due / scheduled / overdue status |
| **Documents** | Link to their document folder (if you added the column), plus a printable year-to-date statement on Funded Capital letterhead |
| **Program Book** | *You only.* Capital deployed, monthly obligation, due this month, overdue, maturities inside 90 days, and the full roster sorted by urgency |

---

## Compliance decisions built into the code

These are enforced in the code, not left to whoever edits it next.

- **Participants never see a rate, a percentage, or a tier.** Dollars and dates
  only. `toParticipantView()` in `lib/revenueShare.ts` is the single function
  every participant-facing page draws from, and it lists permitted fields
  explicitly. A new column in the tracker cannot reach a participant's browser
  unless someone adds it to that function on purpose.
- **Program version and tier never leave the server.** They exist only in the
  internal record type and on the admin page. This is what keeps the three
  rate tables from ever being visible to a participant.
- **Borrower identity is never sent.** The designated loan shows the loan
  reference and property address only, per the two-year confidentiality clause.
- **Language.** Every participant-facing string says *participant*, *capital
  contribution* and *revenue share*. The words *investment*, *investor*,
  *fund*, *equity*, *shares*, *returns* and *yield* appear nowhere. The
  not-a-securities-offering disclaimer is on every participant page.
- **The portal is unlisted.** Every page is `noindex, nofollow, nocache`, and
  nothing on the public site links to it.

---

## Before you invite anyone outside the existing circle

The program brief gates public launch on securities-attorney review, and the
Anchor Series raises that ceiling to $100,000 per participant. **This portal
does not change that gate.** It is safe to use with the nine participants who
are already in the program. Treat inviting anyone new as part of the launch
decision that is waiting on counsel.

---

## Known limitation

**One participation per email is the assumption.** If someone holds two — a
rollover into a second loan, say — the Overview page shows the active one and
displays a banner telling them others exist and to contact you, rather than
quietly presenting partial totals as complete. If multiple participations
become normal, the portal needs a participation switcher. Worth about half a
day when you need it.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| "Portal not yet connected" | `PARTICIPANT_WEBAPP_URL` or `PARTICIPANT_WEBAPP_SECRET` missing in Vercel, or the project has not been redeployed since you added them |
| "Program records are temporarily unavailable" | The Apps Script deployment was deleted, or the secret in Vercel no longer matches the one in the script |
| "No participation found for this sign-in" | The Clerk sign-in email does not match the Email column for any row in the Participants tab |
| Numbers are stale | You edited the `.xlsx` instead of the Google Sheet |
| A figure is blank | The corresponding cell is blank in the sheet — the portal never invents a value |

**When you change the script**, you must redeploy it: **Deploy → Manage
deployments → edit (pencil) → Version: New version → Deploy.** Saving alone
does not update the live URL. This is the single most common way an Apps Script
change appears not to work.
