# PB-12 enrollment setup guide

This guide configures the `enrollment-application` branch for local development
and Vercel Preview. The public form is at `/enrollment`.

The team's deployment uses the [shared SNCS Vercel project](https://vercel.com/miles-projects-1a6aa47f/sncs-pbl-2026).
The GitHub repository belongs to the group organization; these are separate services.
Teammates can test the shared preview without creating another Vercel project.
GitHub membership does not automatically provide access to this project's Vercel settings.
If someone deploys a separate Vercel project, they must configure its environment
variables and its own Turnstile hostname.

## 1. What you need before starting

- Access to the GitHub repository and the `enrollment-application` branch.
- Access to the existing Supabase project, or help from its owner to obtain the
  server credentials and database connection string through a secure channel.
- Access to the Cloudflare account that manages the enrollment Turnstile widget.
- Access to the Vercel project settings if you will configure or deploy it.
- For local development: Node.js 22.12+ and pnpm as specified in `package.json`.

The team database must already contain `enrollment_periods`,
`enrollment_applications`, and `application_guardians` from the supplied schema.
An existing enrollment period must have `status = 'open'` for the form to accept
applications. Its `school_year` supplies the form's school year. The database
owner manages that row; this setup does not create or open a period automatically.

**No schema migration is required.** Do not rerun `SNCS_Schema_Final.sql` or
earlier PB-12 migration versions against the existing project. The current
implementation uses the existing tables and permissions. Optional document
upload is disabled because the project has no existing storage bucket;
requirements are presented to the Registrar.

## 2. Environment variable checklist

Use these exact names, without a `VITE_` prefix. Vercel's **Secret** type is for
credentials; **Config** is suitable for public configuration. In a local `.env`,
both types are ordinary environment variables.

| Variable | Needed? | Vercel type | Where to get the value / purpose |
| --- | --- | --- | --- |
| `SUPABASE_URL` | Yes | Config | Project URL from Supabase's **Connect** dialog, such as `https://YOUR-PROJECT.supabase.co`. Used by the server to read the enrollment period. |
| `SUPABASE_SECRET_KEY` | Yes, unless using the legacy alternative below | Secret | Supabase **Settings → API Keys**, secret key beginning `sb_secret_`. Server access to the Data API. |
| `SUPABASE_SERVICE_ROLE_KEY` | Alternative to `SUPABASE_SECRET_KEY` | Secret | Existing legacy `service_role` key in Supabase **Settings → API Keys**. Use only when the project already uses this key. |
| `DATABASE_URL` | Yes, for saving applications | Secret | Supabase **Connect → Transaction pooler**, PostgreSQL URI with the existing database password substituted. |
| `DATABASE_SSL_CA` | When needed for certificate verification | Config | Official root CA certificate from Supabase **Database Settings → SSL Configuration → Download Certificate**. Paste the complete PEM text. |
| `TURNSTILE_SITE_KEY` | Yes | Config | Sitekey from the Cloudflare Turnstile widget. The API sends this public value to the browser. |
| `TURNSTILE_SECRET_KEY` | Yes | Secret | Secret key from the same Turnstile widget. Used only by the server to verify CAPTCHA tokens. |
| `TURNSTILE_HOSTNAME` | Yes | Config | Exact hostname of the enrollment website, without `https://`, a port, or a path. |
| `APP_ORIGIN` | Yes | Config | Website origin: scheme + hostname + optional local port, with no trailing slash or `/enrollment`. |
| `IP_HASH_SECRET` | Yes | Secret | Generate a random value as described below. Minimum 32 characters; used to hash client IP addresses for submission rate limits. |

Set **one** Supabase server API key. If both are populated, the code prefers
`SUPABASE_SECRET_KEY`. A publishable/`anon` key does not replace either server
key. `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are not used by this
PB-12 implementation. Never put server credentials in variables prefixed
`VITE_`, in source code, or in a committed `.env` file.
[Supabase API key reference](https://supabase.com/docs/guides/getting-started/api-keys)

### Database password and connection URI

The database password is different from a Supabase API key and your Supabase
account password. Obtain the current database password from the project owner.
Do not reset a shared project's password just to configure this preview.

Copy the **Transaction pooler** URI from Connect. Replace `[YOUR-PASSWORD]` with
the database password, percent-encoding reserved characters in the password
(for example, `@` becomes `%40`, `#` becomes `%23`, and `%` becomes `%25`). Encode
the password once, not the whole URI. Keep the full dashboard-provided username,
hostname, port, and database name. The shared transaction pooler normally uses
port `6543` and username `postgres.PROJECT-REF`.
[Supabase connection instructions](https://supabase.com/docs/guides/database/connecting-to-postgres)

All Supabase values must refer to the same team project. The existing database
role must have the access required by the supplied schema to read/lock the
period and insert applications and guardians. Do not add grants or change RLS
as part of this setup.

### Database certificate

The server always verifies the database's TLS certificate. If the connection
requires the project's root CA, open Supabase **Database Settings → SSL
Configuration**, download the certificate, and open it in a text editor. Set
`DATABASE_SSL_CA` to its complete contents, including:

```text
-----BEGIN CERTIFICATE-----
...the actual certificate contents...
-----END CERTIFICATE-----
```

In Vercel, paste actual line breaks. The value is the certificate text, not the
downloaded file path. Downloading the file alone does not configure the app.
Do not disable certificate verification to work around a TLS error.
[Supabase SSL configuration](https://supabase.com/docs/guides/platform/ssl-enforcement)

### Generate `IP_HASH_SECRET`

Run this on your own computer after installing Node.js:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the generated 64-character value into `IP_HASH_SECRET`. Generate it once
for a deployment environment, keep it private, and keep the same value across
redeployments and API instances so the IP hashes remain consistent. It is not
a Supabase or Cloudflare key.

## 3. Configure Cloudflare Turnstile

1. Open the Cloudflare dashboard → **Turnstile**.
2. Select the existing enrollment widget, or choose **Add widget** for a separate
   deployment.
3. Use a descriptive name, such as `SNCS Enrollment Preview`, and **Managed** mode.
   PB-12 uses token verification; pre-clearance is not required.
4. Add the website hostname under **Hostname Management**, then save.
5. Copy the widget's sitekey to `TURNSTILE_SITE_KEY` and its matching secret to
   `TURNSTILE_SECRET_KEY`.

Both keys must come from the same widget. The form and server verification are
already implemented; no extra CAPTCHA package or script needs to be added.
[Cloudflare widget setup](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/)

For the shared project's current branch preview, add this hostname:

```text
sncs-pbl-2026-git-enrollment-app-9dff5c-miles-projects-1a6aa47f.vercel.app
```

Enter only the hostname: no scheme, path, port, trailing slash, or `*` wildcard.
Register the specific preview hostname rather than the shared `vercel.app`
parent domain. A separate teammate deployment needs its own actual hostname.
[Cloudflare hostname rules](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/)

The matching application settings for this preview are:

```dotenv
TURNSTILE_HOSTNAME=sncs-pbl-2026-git-enrollment-app-9dff5c-miles-projects-1a6aa47f.vercel.app
APP_ORIGIN=https://sncs-pbl-2026-git-enrollment-app-9dff5c-miles-projects-1a6aa47f.vercel.app
```

PB-12 accepts one configured origin and verifies the exact CAPTCHA hostname and
action `enrollment`. Adding another hostname in Cloudflare alone does not make
that second URL an accepted application origin.

## 4. Configure Vercel Preview

### Project and build settings

For the existing personal project, use its current Git connection. For a new
project, import the organizational GitHub repository into the intended Vercel
account. The GitHub organization may need to approve Vercel's repository
integration. If it is not listed, have the organization owner check integration
access; do not make the repository public as a workaround.
[Vercel GitHub integration](https://vercel.com/docs/git/vercel-for-github)

Use the repository root, containing both `package.json` and `api/`:

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Root directory | Repository root; not `src` or `dist` |
| Build command | `pnpm build` |
| Output directory | `dist` |
| Install command | Default pnpm detection, or `pnpm install --frozen-lockfile` |
| Node.js version | 22.x |
| Production branch | Keep the team's existing production branch, normally `main` |
| Feature branch to test | `enrollment-application` |

The committed `vercel.json` defines the API functions and page rewrites. Deploy
the whole repository so `/api/enrollment/config` and
`/api/enrollment/applications` are available alongside the Vue frontend.

### Add the variables

1. In the Vercel project, open **Settings → Environment Variables**.
2. Add the checklist values, choosing Secret or Config as shown above.
3. Select **Preview**, scoped to Git branch **`enrollment-application`**.
4. Save each variable. Keep production entries separate if production also needs
   them; do not move or remove the group's production credentials.
5. Redeploy the latest `enrollment-application` deployment after changing values.

Production-only variables do not apply to a Preview deployment. Branch-specific
entries override general Preview entries of the same name. A new Vercel project
does not inherit another project's settings.
[Vercel environment scopes](https://vercel.com/docs/environment-variables)

Environment changes apply to **new deployments**. Saving a setting does not
update an already deployed version; redeploy to apply it.
[Vercel variable management](https://vercel.com/docs/environment-variables/managing-environment-variables)

### Open and share the branch preview

With Git integration connected, pushes to `enrollment-application` create Preview
deployments while `main` remains the production branch. In Deployments, verify
the branch and wait for **Ready**. Open the stable Git branch URL, then append
`/enrollment`. No merge into `main` is needed.
[Vercel deployment environments](https://vercel.com/docs/deployments/environments)

Current shared preview:

[Open enrollment Preview](https://sncs-pbl-2026-git-enrollment-app-9dff5c-miles-projects-1a6aa47f.vercel.app/enrollment)

Vercel also generates a unique URL for each individual deployment. The **Git
branch URL** stays the same across new branch deployments, so use it for testing
and Turnstile configuration. Copy the actual URL from Vercel rather than trying
to construct it, since long names may be shortened.
[Vercel generated URLs](https://vercel.com/docs/deployments/generated-urls)

Teammates only need the preview link to view the UI, subject to the project's
deployment protection. The Vercel owner manages any required preview access.
They do not need the environment secrets or their own deployment just to test.

## 5. Run locally

For a fresh checkout of just the feature branch:

```powershell
git clone --branch enrollment-application --single-branch https://github.com/sncs-management-system/SNCS-PBL-2026.git
cd SNCS-PBL-2026
pnpm install
Copy-Item .env.example .env.local
```

Edit `.env.local` with the checklist values. The file is ignored by Git. The backend
launcher reads legacy `.env`, then `.env.local`; process/deployment variables take
priority. Configuring Preview in Vercel does not populate local files automatically.
Use a separate development Turnstile widget with `localhost` registered and its
real sitekey/secret pair for this implementation's hostname/action checks.
[Cloudflare local hostname guidance](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)

Local configuration template (replace every placeholder before starting):

```dotenv
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_API_KEY
# Alternative: leave SUPABASE_SECRET_KEY blank and fill this legacy key.
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=YOUR_COMPLETE_TRANSACTION_POOLER_URI
DATABASE_SSL_CA=
TURNSTILE_SITE_KEY=YOUR_LOCAL_WIDGET_SITEKEY
TURNSTILE_SECRET_KEY=YOUR_LOCAL_WIDGET_SECRET
TURNSTILE_HOSTNAME=localhost
APP_ORIGIN=http://localhost:5173
IP_HASH_SECRET=YOUR_GENERATED_64_CHARACTER_VALUE
PORT=3001
HOST=127.0.0.1
TRUSTED_PROXIES=
```

If a CA is required, use a quoted multiline value in `.env` with real newlines:

```dotenv
DATABASE_SSL_CA="-----BEGIN CERTIFICATE-----
...the actual certificate contents...
-----END CERTIFICATE-----"
```

Start the API in one terminal:

```powershell
pnpm dev:server
```

Start the frontend in a second terminal in the same repository:

```powershell
pnpm dev -- --host localhost --port 5173 --strictPort
```

Open [local enrollment](http://localhost:5173/enrollment). Vite forwards `/api`
requests to the Express server at `127.0.0.1:3001`. Both terminals must remain
running. Restart the API after editing `.env.local`. If you change the frontend port,
update `APP_ORIGIN` too; changing the API port also requires updating the Vite
proxy target.

`PORT` and `HOST` are for the standalone local server, not Vercel functions.
`TRUSTED_PROXIES` is optional for a separately hosted Express server behind known
proxies; leave it blank locally. Vercel uses its platform-specific client-IP
handling, so these three variables are not required in Vercel Preview.

## 6. Verify setup

1. Open `/enrollment` on the configured origin. Confirm the form displays the
   school year and all four school levels.
2. In browser Network tools, confirm `GET /api/enrollment/config` succeeds.
   This checks form configuration, not the PostgreSQL write connection.
3. Fill a clearly fictional application. Contacts must be exactly 11 digits
   starting with `09`; optional contacts may be blank.
4. Review the details, confirm the consent boxes, complete Turnstile, and submit.
5. Confirm the success page displays a reference number and `Pending` status.
   The initial POST should return `201`; an identical saved retry can return `200`.
6. Have an authorized team member confirm the corresponding application and
   guardian records in the existing Supabase tables.

A successful CAPTCHA alone does not prove saving works. Preview and local
submissions use whichever database `DATABASE_URL` points to; when that is the
team database, dummy submissions insert real test records there. Coordinate
test data with the team and use no real student information.

Repository checks, when needed after code changes:

```powershell
pnpm lint
pnpm test
pnpm test:runtime
pnpm build
```

## 7. Troubleshooting

For a failed request, open **Vercel → Project → Logs** and inspect the matching
time and endpoint. Build errors are in the deployment's build logs. PB-12 runtime
logs report the stage/component and a safe provider code without applicant data
or credentials.

| Symptom / log | What to check |
| --- | --- |
| `503` on `/api/enrollment/config` | Required runtime variables, Preview branch scope, Supabase server key, project URL, and the runtime log. An open period must already exist to show the form. |
| `404` on `/enrollment` or `/api/enrollment/...` | Correct feature-branch deployment, repository root, committed `vercel.json`, and deployed API files. |
| `stage: save`, `component: database_connection`, `DBURL` | `DATABASE_URL` is missing. Add it to the correct Preview branch and redeploy. |
| `stage: save`, `component: database_connection`, `28P01` | Database login rejected. Check the current database password, percent-encoding, full pooler username, and project. API keys do not replace the database password. |
| `SELF_SIGNED_CERT_IN_CHAIN` or another TLS verification error | Configure the project's official PEM root CA in `DATABASE_SSL_CA` and redeploy. Preserve certificate verification. |
| `component: database_transaction`, `42501` | The existing database role lacks needed access. Ask the database owner to verify the intended connection role; do not change the schema or permissions blindly. |
| Turnstile `110200` | Current hostname is not authorized on the widget whose sitekey is configured. Check the stable branch hostname in Cloudflare. |
| Turnstile `300010` / challenge failure | Retry the security check and compare in a fresh supported browser. Check extensions, network restrictions, and widget configuration; this code alone does not identify the exact cause. |
| `422` on submission | Check field errors and CAPTCHA verification. A token must match the configured hostname/action and may need a fresh challenge. |
| `403` on submission | Check enrollment-period changes, closed status, or whether the request came from the configured `APP_ORIGIN`. |
| `429` on submission | Five saved applications from the same connection in the rolling past hour; wait before more tests. |

[PostgreSQL error meanings](https://www.postgresql.org/docs/current/errcodes-appendix.html)
and [Cloudflare error meanings](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/)
support the provider-code checks above. A `503` alone does not identify the cause;
read the corresponding server log before changing settings or code.

If submission fails, keep the filled review page open and retry after correcting
the deployment, completing a fresh security check. Avoid posting passwords,
complete connection URIs, API secrets, or applicant details in screenshots,
issues, or chat.

## 8. Deploying later to another account or production

Use the same code and variable names in the destination Vercel project. Obtain
the approved credentials from the team, register the destination hostname in
Cloudflare, and set that environment's `TURNSTILE_HOSTNAME` and `APP_ORIGIN` to
its actual URL. Configure Production variables separately when the team chooses
to release PB-12; Preview settings do not automatically become Production settings.

See [PB-12 implementation and field mapping](pb12-enrollment.md) for validation,
database mapping, transaction behavior, and upload limitations.
