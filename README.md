# AOLF Connect

AOLF Connect provides a public local-chapter website at `/` and a private volunteer workspace at `/seva`. It runs on Vite, TypeScript, Alpine.js, and Tailwind CSS with pnpm-managed dependencies.

## What is migrated now

- Public chapter website implemented in `src/index.html`.
- Authenticated Seva workspace implemented in `src/seva.html`.
- Core dependencies moved from CDN to npm and bundled by Vite.
- Frontend no longer depends on `google.script.run` directly.
- Bootstrap and lead-save behavior now go through runtime -> service -> repository boundaries.
- Mock mode implemented for local development without Google OAuth/Sheets.
- Manual volunteer email entry replaced by authenticated identity flow entry point.
- Vercel API routes implemented for auth/session/bootstrap/lead update.
- Google OAuth callback now validates ID token server-side before creating session cookie.

## Project structure

- `src/main.ts`: Alpine and Lucide initialization, runtime wiring.
- `src/features/seva/`: private workspace state and UI behavior.
- `src/services/`: API client, auth service, lead service, runtime facade.
- `src/repositories/contracts.ts`: repository and auth interfaces.
- `src/repositories/mock/`: mock auth and mock lead repository.
- `src/repositories/http/`: HTTP repositories for `/api` endpoints.
- `api/_lib/`: backend implementation grouped by auth, sheets, storage, WhatsApp, HTTP, and configuration domains.
- `shared/contracts/`: contracts shared by the frontend, API, and operational scripts.
- `tests/api/`: API and backend domain tests.
- `tests/contracts/`: shared contract validation tests.
- `tests/frontend/`: public/private page presentation tests.
- `docs/templates/`: generated and importable spreadsheet templates.

## Modes

Set mode using `.env`:

- `VITE_APP_MODE=mock`: uses in-memory mock auth and repository.
- `VITE_APP_MODE=api`: uses HTTP endpoints for auth/bootstrap/update.

Optional base URL:

- `VITE_API_BASE_URL=` (empty means same origin)

Backend mode:

- `APP_DATA_MODE=mock` (current implemented data mode)
- `APP_DATA_MODE=sheets` (Google Sheets API via backend Service Account)

## Implemented API endpoints in `api` mode

- `GET /api/auth/session`
- `GET /api/auth/signin`
- `GET /api/auth/callback`
- `GET /api/bootstrap?campaignId=<optional>`
- `PUT /api/leads/:id`
- `GET /api/health/sheets` (authenticated, allowlisted runtime diagnostics)
- `GET /api/whatsapp/webhook` (Meta webhook verification)
- `POST /api/whatsapp/webhook` (WhatsApp lead capture events)

Frontend routes:

- `GET /` (public chapter website)
- `GET /seva` (Google sign-in or authenticated volunteer workspace)

Runtime request and response contracts are defined in `shared/contracts/appContracts.ts`.

## OAuth/session environment variables

Set these server-side variables in Vercel:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (or rely on `VERCEL_URL` fallback)
- `SESSION_SECRET` (minimum 32 chars)
- `SESSION_COOKIE_NAME` (optional, defaults to `aolf_session`)
- `GOOGLE_SHEETS_DATA_SPREADSHEET_ID` (required when `APP_DATA_MODE=sheets`)
- `GOOGLE_SHEETS_ACCESS_SPREADSHEET_ID` (optional; for single-file setup, keep empty)
- `GOOGLE_SHEETS_LAYOUT_JSON` (optional tab/range map override)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` (required when `APP_DATA_MODE=sheets`)
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (required when `APP_DATA_MODE=sheets`)
- `META_VERIFY_TOKEN` (required for WhatsApp webhook verification)
- `META_ACCESS_TOKEN` (required for WhatsApp message replies)
- `META_PHONE_NUMBER_ID` (required for WhatsApp Cloud API send endpoint)
- `META_APP_SECRET` (required for `X-Hub-Signature-256` verification)

Optional:

- `META_API_VERSION` (default `v21.0`)
- `WHATSAPP_PENDING_TTL_SECONDS` (default `300` for 5-minute pending confirmation)

### Single spreadsheet vs separate spreadsheets

With Service Account mode, it is safe to use a single spreadsheet file for all tabs (`Campaigns`, `Leads`, `Members`, `Config`, `AllowedUsers`).

- If using one spreadsheet file: set only `GOOGLE_SHEETS_DATA_SPREADSHEET_ID`.
- Leave `GOOGLE_SHEETS_ACCESS_SPREADSHEET_ID` unset. The backend automatically falls back to `GOOGLE_SHEETS_DATA_SPREADSHEET_ID`.
- If you later split files, set `GOOGLE_SHEETS_ACCESS_SPREADSHEET_ID` to the file containing `AllowedUsers`.

### How to get Service Account key values

1. Open Google Cloud Console and select your project.
2. Enable Google Sheets API for that project.
3. Go to IAM & Admin -> Service Accounts.
4. Create a service account (or use an existing one).
5. Open the service account -> Keys -> Add Key -> Create new key -> JSON.
6. Download the JSON key file securely.

From the downloaded JSON:

- `client_email` -> use as `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` -> use as `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

Important formatting for `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`:

- In Vercel UI env var, paste the full key including BEGIN/END lines.
- Keep newline escapes as `\n` if your environment collapses line breaks.
- Never commit the JSON file or private key into the repository.

Example key format (redacted):

```text
-----BEGIN PRIVATE KEY-----\nMIIE...\n...\n-----END PRIVATE KEY-----\n
```

### Spreadsheet sharing

Share your spreadsheet with `GOOGLE_SERVICE_ACCOUNT_EMAIL`:

- Editor: required for `Leads`/`Members` updates.
- Viewer is sufficient only for read-only access.

If you use one spreadsheet for everything, grant Editor once on that file.

## Multi-select handling

- Google Sheets stores multi-select values as comma-separated strings.
- On UI load, multi-select fields are normalized to arrays.
- On save, arrays are normalized back to comma-separated strings.
- Whitespace is trimmed and empty values are ignored in both directions.

Current multi-select fields:

- `wishlistPrograms`
- `donePrograms`

Example `GOOGLE_SHEETS_LAYOUT_JSON` value:

```json
{
  "campaignsRange": "Campaigns!A:F",
  "leadsRange": "Leads!A:Z",
  "membersRange": "Members!A:Z",
  "configRange": "Config!A:B",
  "allowedUsersRange": "AllowedUsers!A:Z"
}
```

## Google OAuth and Google Sheets notes

- Frontend now expects volunteer identity from authenticated session.
- Do not trust volunteer email from browser payload.
- Keep OAuth and Google Sheets credentials server-side in Vercel env vars.
- Use documented sheet-column mapping + Zod validation strategy to handle schema drift.
- Sheets access uses backend Service Account credentials, not end-user OAuth tokens.
- User OAuth remains identity-only (`openid`, `email`, `profile`).
- `AllowedUsers` validation is applied after OAuth callback; login is denied if email is not allowed.
- Share both spreadsheet files with the Service Account email.

## Testing Checklist

### 1) Prepare sheet tabs and headers

Create these tabs in your spreadsheet:

- `Campaigns`
- `Leads`
- `Members`
- `Config`
- `AllowedUsers`

Set header rows:

- `Campaigns` header:
  - `id,name,type,message,showDonePrograms`
- `Leads` and `Members` headers:
  - `id,name,quality,followUp,lastUpdated,status,notes,campaignId,campaignType,assignedVolunteerEmail,wishlistPrograms,donePrograms,mobile`
- `AllowedUsers` header:
  - `email,name,mobile`
- `Config` key/value rows:
  - Column A = key
  - Column B = value

Minimum `Config` keys for first run:

- `id` -> 21-character Nano ID
- `campaignId` -> 21-character Nano ID matching one campaign
- `programs` -> JSON array
- `programDisplayOrder` -> JSON array

### 2) Add at least one allowed user

In `AllowedUsers` tab, add your login email in the `email` column.

Each lead/member record must include `assignedVolunteerEmail` matching the signed-in volunteer email. `id` is the stable record identity; `mobile` is the contact number used for search, calling, WhatsApp, and campaign-scoped duplicate detection. Legacy rows that stored a phone number in `id` remain readable, but new WhatsApp-created rows use a Nano ID plus the dedicated `mobile` field.
Only records assigned to the signed-in volunteer and selected campaign are returned by `/api/bootstrap`. Updates are matched by campaign plus normalized record ID/mobile before assignment is verified. Campaign details live in the `Campaigns` sheet, while `Config` keeps only sheet-level runtime settings.

### 3) Configure env vars locally (example)

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Then edit `.env`:

```bash
VITE_APP_MODE=api
APP_DATA_MODE=sheets
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/callback
SESSION_SECRET=replace-with-a-long-random-secret
SESSION_COOKIE_NAME=aolf_session
GOOGLE_SHEETS_DATA_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

Optional only if access list is in a different file:

```bash
GOOGLE_SHEETS_ACCESS_SPREADSHEET_ID=another_spreadsheet_id
```

### 3.1) Validate env quickly

```bash
pnpm run env:check
```

This reports missing required variables and basic diagnostics.

### 4) Run validation commands

```bash
pnpm run typecheck
pnpm run build
pnpm run sheets:template
pnpm run dev
```

`pnpm run sheets:template` generates an importable Excel file at `docs/templates/aolf-sheets-template.xlsx`.

### 5) Functional test flow

1. Open app and click sign-in.
2. Complete Google login with an allowed email.
3. Confirm `/api/bootstrap` returns data and UI loads leads/members.
4. Update a lead and confirm corresponding row changes in the sheet.
5. Test with a non-allowed email and confirm login is denied (`403 FORBIDDEN`).

### 6) Vercel deployment test

1. Add all server env vars in Vercel Project Settings.
2. Redeploy.
3. Verify sign-in + bootstrap + lead update in production.
4. Check Vercel function logs if any `UPSTREAM_ERROR` appears (usually share/permission or key formatting issues).

## Google Cloud and Service Account setup

### 1) Create/select a Google Cloud project

1. Open Google Cloud Console.
2. Select project `aolfclub` (or your target project).

### 2) Enable required API

1. Open APIs & Services -> Library.
2. Enable `Google Sheets API`.

### 3) Configure OAuth consent and client

1. Open APIs & Services -> OAuth consent screen.
2. Configure app information and test users.
3. Create OAuth client credentials (`Web application`).
4. Add redirect URI:
   - Local: `http://localhost:5173/api/auth/callback`
   - Production: `https://<your-domain>/api/auth/callback`

### 4) Create Service Account

1. Open IAM & Admin -> Service Accounts.
2. Create account (example: `aolf-club@aolfclub.iam.gserviceaccount.com`).
3. Open the service account -> Keys -> Add key -> Create new key -> JSON.
4. Download and store the JSON key securely.

Map JSON fields to env vars:

- `client_email` -> `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` -> `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

### 5) Share spreadsheet with Service Account

1. Open the target Google Sheet.
2. Share with `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
3. Grant Editor for write access (required for lead/member updates).

## Automation and diagnostics

## WhatsApp Lead Capture (Phase I)

Phase I uses a deterministic rule-based parser (no AI/LLM) to parse volunteer WhatsApp text messages and show interactive confirmation buttons before saving.

Flow:

1. Volunteer sends message.
2. Server parses: mobile, name, course, quality, month, notes.
3. Server sends interactive buttons:
   - `confirm_save`
   - `edit_lead`
4. Save/update in Google Sheets on `confirm_save`, or automatically when the
   confirmation timeout expires without an explicit Confirm/Edit response.

Rules implemented:

- Supported mobile formats: `9876543210`, `+91 98765 43210`, `91XXXXXXXXXX`.
- Mobile is normalized to 10 digits.
- Month supports short and long forms (for example `Aug` / `August`).
- Multiple course codes are supported with spaces or commas (for example `HP DSN` or `HP,DSN`) and are normalized to a comma-separated value.
- If quality is missing, it defaults to `Hot`; if month is missing, it defaults to the current month. Both defaults are shown in the confirmation and editable draft.
- Confirmation responses show only extracted fields; the original inbound message is not repeated.
- Duplicate detection is month-scoped by mobile and updates existing row in place.
- Notes are appended when updating duplicates.
- Non-allowed volunteer numbers are ignored.
- Unsupported WhatsApp payload types are ignored.
- Selecting Edit sends an instruction followed by a copyable draft containing only `Name Mobile Courses Quality Month Notes`. The preview is discarded after both messages are delivered, and the edited reply is parsed as a fresh lead that may use a different mobile number.
- Pending confirmations and message de-duplication state are kept only in application memory; no WhatsApp message or transaction history is written to Google Sheets.
- Pending confirmations automatically save when `WHATSAPP_PENDING_TTL_SECONDS` expires. Their timers and processed-message de-duplication are instance-local and disappear on a restart or cold start; they are not shared across concurrent server instances.
- The webhook waits for lead Sheet writes and outbound Meta work before returning success. There is no durable queue or outbox.

### Check environment

```bash
pnpm run env:check
```

### Validate Sheets connectivity and structure

```bash
pnpm run sheets:doctor
```

Optional runtime endpoint check (requires an authenticated session cookie):

```bash
curl http://localhost:5173/api/health/sheets
```

This checks:

- required environment variables
- Google Sheets connectivity via Service Account
- required tabs existence (`Campaigns`, `Leads`, `Members`, `Config`, `AllowedUsers`)
- required headers
- required base config keys

Row counts are bounded probes (up to 200 rows per tab); the response includes `truncated` flags instead of making the health endpoint scan unbounded columns.

### Auto-fix missing sheets/headers/config keys

```bash
pnpm run sheets:doctor:fix
```

This can automatically:

- create missing sheets
- write missing header rows
- append missing config keys with blank values

Run this once before deploying the updated code. It appends the backward-compatible `mobile` header; legacy headerless `Config` data is preserved by inserting its header above the existing rows.

### Generate sample Google Sheets template

```bash
pnpm run sheets:template
```

Then import `docs/templates/aolf-sheets-template.xlsx` into Google Sheets.

### Config sheet shape

Keep `Config` as simple key/value rows for runtime settings. Campaign definitions live in the separate `Campaigns` sheet.

- `id`: 21-character Nano ID for the config record
- `campaignId`: default campaign Nano ID
- `programs`, `programDisplayOrder`: JSON arrays
- `allowedUsers`: JSON string array of emails (fallback if `AllowedUsers` tab has no rows)

### Leads/Members sheet shape

Header-first sheets with at least:

- `id` (stable Nano ID / record key)
- `mobile` (contact number; legacy rows may temporarily fall back to a phone stored in `id`)
- `name`
- `quality`
- `followUp`
- `lastUpdated`
- `status`
- `notes`
- `campaignId`
- `campaignType`
- `assignedVolunteerEmail`
- `wishlistPrograms`
- `donePrograms`

## Scripts

- `npm run dev` - start local development server.
- `npm run typecheck` - strict TypeScript check.
- `npm run env:check` - validate required env vars and diagnostics.
- `npm run sheets:doctor` - validate Sheets access and structure.
- `npm run sheets:doctor:fix` - auto-create/fix missing sheets and base structure.
- `npm run sheets:template` - generate importable `.xlsx` template for Google Sheets.
- `npm run lint` - lint checks.
- `npm run test` - Vitest tests.
- `npm run build` - production build.
- `npm run preview` - preview production build.

## Next implementation steps

- Add scheduled backup/export for sheet-based records.
- Consider audit columns (`updatedBy`, `updatedAt`) for lead/member updates.
