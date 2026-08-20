# AOLF Connect — Fresh Installation Guide

This README is only for setting up a **new AOLF Connect installation on Vercel**.

AOLF Connect uses:

- **GitHub** for the application source code
- **Vercel** for hosting the website and backend
- **Vercel Blob** for course pamphlet images
- **Google OAuth** for volunteer sign-in
- **Google Sheets** for application data
- **Meta WhatsApp Cloud API** for WhatsApp lead capture

---

## 1. Prerequisites

Before starting, prepare the following accounts:

- GitHub account
- Vercel account
- Google account
- Meta/Facebook account

### Recommended ownership

For an organization or community installation, it is best to use:

- a **dedicated organization email address**
- a **dedicated Meta/Facebook Business setup**
- a **dedicated WhatsApp phone number**

Avoid making the installation depend permanently on one volunteer's personal email, Facebook account, or personal WhatsApp number.

### Dedicated WhatsApp number

A **dedicated WhatsApp number is required** for this setup.

Do not use a volunteer's normal personal WhatsApp number.

The dedicated number should remain under the control of the organization so that the setup can be handed over later if administrators or volunteers change.

Meta's onboarding and verification requirements can change. Follow the requirements shown in your Meta dashboard for the number and account you are connecting.

You do not need to complete extra optional verification simply because this guide mentions WhatsApp. If Meta specifically marks a verification step as required for your account, number, messaging limit, region, or production feature, complete that step.

---

## 2. Architecture

```mermaid
flowchart TD
    U[Volunteer / Website User]
    W[WhatsApp Volunteer]
    V[Vercel<br/>AOLF Connect Website + API]
    G[Google OAuth<br/>Volunteer Sign-in]
    S[Google Sheets<br/>Campaigns / Leads / Members / Courses / CourseTemplates / Config / AllowedUsers]
    M[Meta WhatsApp Cloud API]

    U -->|Open website / Seva workspace| V
    V -->|Sign in| G
    G -->|Verified identity| V
    V <-->|Read / update data| S

    W -->|Send lead message| M
    M -->|Webhook| V
    V -->|Confirmation / reply| M
    M -->|WhatsApp message| W
    V -->|Save confirmed lead| S
```

In simple terms:

**Vercel runs the app, Google signs volunteers in, Google Sheets stores the data, and Meta connects the dedicated WhatsApp number to AOLF Connect.**

---

## 3. Prepare the GitHub repository

Open the AOLF Connect repository:

```text
https://github.com/aolnagawara/aolf.club
```

If this is a new independent installation, use **Fork** in GitHub so the new installation has its own copy of the code.

If you already own and manage the repository, you can continue using it directly.

You do not need to download the source code to your computer.

Vercel will deploy directly from GitHub.

---

## 4. Create the Google Sheet

The easiest setup is to use **one Google spreadsheet** for everything.

In the GitHub repository, locate:

```text
docs/templates/aolf-sheets-template.xlsx
```

Download that Excel template from GitHub.

Then:

1. Open Google Drive.
2. Upload `aolf-sheets-template.xlsx`.
3. Open it using Google Sheets.
4. Save/convert it as a Google Sheet if required.

The spreadsheet should contain these tabs:

- `Campaigns`
- `Leads`
- `Members`
- `Courses`
- `CourseTemplates`
- `Config`
- `AllowedUsers`

### Add the first volunteer

Open the `AllowedUsers` tab.

The header is:

```text
email,name,mobile
```

Add the Google email address of the first volunteer who should be allowed to sign in.

At minimum, enter the volunteer's email address.

### Courses tab

Existing installations need a `Courses` tab and a `CourseTemplates` tab. Run `pnpm run sheets:doctor:fix` or add them by hand.

`Courses` header:

```text
id,courseType,month,title,whatsappTemplate,pamphletFileId,pamphletMimeType,isActive,createdAt,updatedAt,createdBy,updatedBy
```

`CourseTemplates` header:

```text
courseType,template
```

Course Management only stores type, month (`YYYY-MM`), the WhatsApp template, and a pamphlet file. Dates, time, venue, and registration belong in the template. The Happiness Program default template is seeded on `CourseTemplates` and includes `{courseUrl}` so WhatsApp can preview `/course/<id>`.

Pamphlets are uploaded from Course Management (JPEG, PNG, or WebP, max 1.5 MB). They are stored in a **public Vercel Blob** store and WhatsApp reads `og:image` from that Blob URL. `/course/<id>/pamphlet` still works as a same-origin fallback. WhatsApp may cache an older pamphlet after you replace the image.

If you already had a Courses tab with the previous columns, doctor will rewrite the header. Re-add those courses in Course Management.

### Save the Spreadsheet ID

The Google Sheet URL looks similar to:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

Copy the value between `/d/` and `/edit`.

You will later save this in Vercel as:

```text
GOOGLE_SHEETS_DATA_SPREADSHEET_ID
```

---

## 5. Create the Google Cloud project

1. Open Google Cloud Console.
2. Create a new project for AOLF Connect.
3. Open **APIs & Services → Library**.
4. Search for **Google Sheets API**.
5. Enable it.

It is recommended that the Google Cloud project is owned by the dedicated organization Google account rather than a volunteer's personal account.

---

## 6. Create the Google Service Account

The Service Account allows the AOLF Connect backend on Vercel to read and update Google Sheets.

1. In Google Cloud Console, open **IAM & Admin → Service Accounts**.
2. Click **Create Service Account**.
3. Give it a recognizable name such as:

```text
aolf-connect
```

4. Open the newly created Service Account.
5. Open **Keys**.
6. Choose **Add Key → Create new key**.
7. Select **JSON**.
8. Download the JSON file and keep it private.

Inside the JSON file you need two values:

```text
client_email
private_key
```

They will become:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
```

> Never upload this JSON file or the private key to GitHub.

### Share the Google Sheet

Return to the Google Sheet.

1. Click **Share**.
2. Paste the Service Account `client_email`.
3. Give it **Editor** access.

Without this sharing permission, Vercel will not be able to read or update the Sheet.

---

## 7. Configure Google sign-in

Google OAuth is used to identify the volunteer signing in to the private `/volunteer` workspace.

AOLF Connect only needs basic identity information such as:

- name
- email
- Google profile identity

### Create the OAuth client

1. In the same Google Cloud project, open **Google Auth Platform**.
2. Configure the app information.
3. Configure the audience appropriate for your users.
4. Create an **OAuth Client ID**.
5. Choose **Web application**.
6. Add your production callback URL:

```text
https://YOUR-DOMAIN/api/auth/callback
```

For example:

```text
https://aolf.club/api/auth/callback
```

Save these two values:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

You will add them to Vercel later.

### Important: OAuth branding

**OAuth brand verification is not a must just to set up and test the application with a limited group of users.**

Do not add unnecessary Google API permissions.

AOLF Connect should use only the basic identity permissions it needs.

If you later make the OAuth application broadly public, Google's current production or brand-verification requirements may apply.

Keep the following information accurate:

- application name
- support email
- homepage
- privacy policy
- terms
- authorized domain

---

## 8. Create the Meta / WhatsApp setup

Use the **dedicated WhatsApp number** prepared earlier.

It is also best to use a dedicated organization-owned Meta/Facebook Business setup.

### Create the Meta app

1. Open Meta for Developers.
2. Create a new app suitable for WhatsApp.
3. Add or configure the **WhatsApp** product.
4. Follow Meta's current WhatsApp Cloud API onboarding.
5. Connect the dedicated WhatsApp phone number.

Record these values:

```text
META_ACCESS_TOKEN
META_PHONE_NUMBER_ID
META_APP_SECRET
```

Create your own long random verification value for:

```text
META_VERIFY_TOKEN
```

Keep all of these values private.

### Meta business verification note

Do not assume that every optional Meta Business verification step must be completed before starting.

Set up the app, WhatsApp Cloud API, and dedicated number first.

Meta may require additional verification depending on:

- account type
- production use
- messaging limits
- region
- number
- features enabled

If Meta specifically marks a verification step as required for your setup, complete that step.

---

## 9. Create the Vercel project

1. Sign in to Vercel.
2. Click **Add New → Project**.
3. Connect GitHub if it is not already connected.
4. Select the AOLF Connect repository or your fork.
5. Import the project.

Vercel should detect the project from the repository.

Do not deploy permanently until the environment variables below are added.

---

## 10. Add the Vercel environment variables

In Vercel:

1. Open the AOLF Connect project.
2. Open **Settings → Environment Variables**.
3. Add the following values.

### Application mode

```text
VITE_APP_MODE=api
APP_DATA_MODE=sheets
```

### Google OAuth

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://YOUR-DOMAIN/api/auth/callback
```

### Session

Create a long random value of at least 32 characters for `SESSION_SECRET`.

```text
SESSION_SECRET=
SESSION_COOKIE_NAME=aolf_session
```

Do not reuse your Google, Meta, Facebook, or email password.

### Google Sheets

```text
GOOGLE_SHEETS_DATA_SPREADSHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
```

For the recommended single-spreadsheet installation, leave this unset:

```text
GOOGLE_SHEETS_ACCESS_SPREADSHEET_ID
```

### Vercel Blob (course pamphlets)

In the Vercel project:

1. Open **Storage**.
2. Create a **Blob** store.
3. Set access to **Public** (WhatsApp must be able to fetch `og:image`).
4. Connect the store to **Production** (and Preview if you use it).
5. Confirm this environment variable was added:

```text
BLOB_READ_WRITE_TOKEN=
```

If you create a course without a pamphlet, Blob is not used. Uploading a pamphlet requires this token.

### WhatsApp / Meta

```text
META_VERIFY_TOKEN=
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=
META_APP_SECRET=
```

Optional:

```text
META_API_VERSION=
WHATSAPP_PENDING_TTL_SECONDS=300
```

### Service Account private key

Paste the complete Google Service Account private key.

It begins and ends similar to:

```text
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
```

If the environment-variable screen stores it as one line, preserve the line breaks using `\n`.

---

## 11. Connect the domain in Vercel

1. Open the Vercel project.
2. Open **Settings → Domains**.
3. Add your domain.
4. Follow the DNS instructions shown by Vercel.
5. Wait until Vercel confirms that the domain is correctly configured.

Once the final domain works, update/check:

### Google callback

```text
https://YOUR-DOMAIN/api/auth/callback
```

This exact URL must be configured in:

- Google Cloud OAuth Client
- `GOOGLE_REDIRECT_URI` in Vercel

### WhatsApp webhook

Your Meta webhook will be:

```text
https://YOUR-DOMAIN/api/whatsapp/webhook
```

---

## 12. Configure the WhatsApp webhook

After the Vercel production deployment is available:

1. Open the WhatsApp configuration in Meta.
2. Enter:

```text
https://YOUR-DOMAIN/api/whatsapp/webhook
```

as the webhook/callback URL.

3. Enter the same value you stored in Vercel as:

```text
META_VERIFY_TOKEN
```

4. Complete Meta's webhook verification.
5. Subscribe to the WhatsApp message events required by the app.

The app also uses `META_APP_SECRET` to verify that incoming webhook requests really came from Meta.

---

## 13. Deploy on Vercel

After all environment variables are configured:

1. Open **Deployments** in Vercel.
2. Redeploy the latest version.
3. Wait until the production deployment shows:

```text
Ready
```

No local build or local testing is required.

If Vercel reports a deployment error, open that deployment and read the build/function logs.

If the log says **No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan**, this repo stays at or below 12 API entry files by combining course update/delete and pamphlet serving into existing routes. Redeploy this revision. Do not add a new file under `api/` (outside `_lib`) without folding it into an existing handler.

---

## 14. Test the live installation

All testing should be done on the Vercel production URL.

### Test 1 — Public website

Open:

```text
https://YOUR-DOMAIN/
```

The public website should load normally.

### Test 2 — Volunteer sign-in

Open:

```text
https://YOUR-DOMAIN/volunteer
```

1. Click **Continue with Google**.
2. Sign in with an email already present in `AllowedUsers`.
3. Confirm that the Seva workspace opens.

Then test with a Google email that is not in `AllowedUsers`.

It should not receive volunteer access.

### Test 3 — Google Sheets

From the live Seva workspace:

1. Open a campaign.
2. Edit a test lead.
3. Save it.
4. Open Google Sheets.
5. Confirm that the corresponding row changed.

### Test 4 — WhatsApp

Using an allowed volunteer phone number:

1. Send a test lead message to the dedicated AOLF Connect WhatsApp number.
2. Confirm that AOLF Connect responds.
3. Confirm/save the lead.
4. Open Google Sheets.
5. Confirm that the lead was added or updated correctly.

---

## 15. Troubleshooting from Vercel

No local debugging is required.

If something does not work, start with **Vercel → Project → Deployments / Logs**.

### Google Sheets not loading

Check:

- `GOOGLE_SHEETS_DATA_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- that the Google Sheet is shared with the Service Account as **Editor**

### Google sign-in not working

Check:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- the Authorized Redirect URI in Google Cloud

The URLs must match exactly.

### WhatsApp not working

Check:

- `META_ACCESS_TOKEN`
- `META_PHONE_NUMBER_ID`
- `META_APP_SECRET`
- `META_VERIFY_TOKEN`
- Meta webhook URL
- webhook subscription in Meta

### Course pamphlet upload fails

Check:

- a **public** Vercel Blob store exists on the project
- `BLOB_READ_WRITE_TOKEN` is set for Production
- the store access is **Public**, not Private

Then redeploy and try the upload again.

### Environment variable changed but app still behaves the old way

Redeploy the application in Vercel after changing environment variables.

---

## 16. Final installation checklist

- [ ] Dedicated organization email/account prepared
- [ ] Dedicated Meta/Facebook Business setup prepared
- [ ] Dedicated WhatsApp number prepared and controlled by the organization
- [ ] GitHub repository or fork prepared
- [ ] Google Sheet created from the supplied template
- [ ] First volunteer added to `AllowedUsers`
- [ ] Google Sheets API enabled
- [ ] Google Service Account created
- [ ] Google Sheet shared with the Service Account as Editor
- [ ] Google OAuth client created
- [ ] OAuth production callback URL configured
- [ ] Meta app created
- [ ] WhatsApp Cloud API configured
- [ ] Dedicated WhatsApp number connected
- [ ] Vercel project created from GitHub
- [ ] Public Vercel Blob store created and `BLOB_READ_WRITE_TOKEN` added
- [ ] All required Vercel environment variables added
- [ ] Domain connected to Vercel
- [ ] Latest Vercel production deployment shows **Ready**
- [ ] WhatsApp webhook verified in Meta
- [ ] Google sign-in tested with an allowed user
- [ ] Non-allowed Google user denied access
- [ ] Google Sheet read/write tested from the live app
- [ ] WhatsApp lead capture tested from the live app

Once all items above pass, the fresh AOLF Connect installation is ready for use.
