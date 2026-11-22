# Academic Coordinator scheduling setup

The existing `/login` flow sends verified `academic_coordinator` accounts to
`/academic-coordinator`. That dashboard now embeds the existing scheduling
workspace. Teachers, Registrars and Admins cannot use its coordinator data API.
The existing Supabase staff-role migrations and a real coordinator account must
already be present; this change does not grant roles or create accounts.

## Local startup

1. Install Node dependencies with `pnpm install --frozen-lockfile`.
2. Install Python dependencies with `python -m pip install -r services/scheduler/requirements.txt`.
3. Copy `.env.example` to ignored `.env.local` and fill the public Supabase URL
   and publishable key for the same project used by the staff portal. Never use
   a secret/service-role key in a `VITE_` variable.
4. Generate a random `SCHEDULER_INTERNAL_SECRET` with at least 32 characters.
   Set `SCHEDULER_URL=http://127.0.0.1:8766`, `SCHEDULER_AUTOSTART=true`, and
   `APP_ORIGIN=http://localhost:5173`.
5. Run `pnpm dev:server` and `pnpm dev` in separate terminals. The backend launcher
   starts the protected Python service and Express; Vite proxies `/api` to Express.
6. Open `http://localhost:5173/login` and sign in with an Academic Coordinator
   account. Its scheduling dashboard opens automatically.

The backend loads `.env` and then `.env.local`. Already-set process variables take
priority. Restart it after environment changes. `SCHEDULER_PYTHON` optionally names
a Python executable; a scheduler `.venv` is used when present. `SCHEDULER_DB` is
relative to the repository root, or may be an absolute path. Keep the local
database and all client inputs out of Git.

The scheduling gateway uses the public Supabase key plus the user's current
bearer token. It verifies `auth.getUser` and `get_staff_portal_role` on each request,
including reads and downloads. A revoked session, inactive account, pending
password change or other role does not grant scheduling access. Only the empty
HTML/CSS/JS shell is available without sign-in; school data is not embedded in it.

The parent dashboard sends the current access token only to its own same-origin
frame, in memory. Refresh updates the token; access loss removes the frame.
Tokens are not placed in URLs, exports or localStorage by the scheduler bridge.
The server sends only the internal gateway secret to Python, never the browser's
bearer token or cookies. Python in `--gateway` mode rejects direct unauthenticated
requests, including health requests. The standalone `python app.py serve` remains
a separate, loopback-only development preview.

## Backend readiness and independent services

`GET /api/health` reports backend startup and whether scheduling/enrollment are
configured. An authenticated scheduling health request checks the real Python
service. Missing enrollment secrets no longer crash the entire backend: enrollment
returns 503 while staff sign-in and scheduling can operate. This does not replace
the missing enrollment configuration with test credentials or bypass CAPTCHA.

In this checkout, the existing project's public Supabase settings were restored
locally and a new internal gateway secret was generated. Scheduling startup,
guarded health and real Supabase invalid-session rejection were verified.
Enrollment still needs its genuine `SUPABASE_SECRET_KEY` (or service-role key),
`DATABASE_URL` and matching Turnstile site/secret keys. The local hostname/origin
and generated `IP_HASH_SECRET` are prepared. The missing provider/database
credentials were not available locally and were not invented.

## Hosted deployment boundary

The Vercel Node adapter is `api/scheduler.ts`; it includes the workbench assets.
Set its server-side `SCHEDULER_URL` and `SCHEDULER_INTERNAL_SECRET`, alongside the
same public Supabase settings and exact `APP_ORIGIN`. Do not use a browser-visible
URL or a `VITE_` variable for the internal secret.

Vercel does not start or host this persistent OR-Tools/SQLite service automatically.
Run Python with `--gateway` on a persistent host, behind a private connection or
HTTPS reverse proxy that forwards to its loopback listener with the correct Host.
Share the internal secret only between Express/Vercel and that service. Use one
persistent database owner; do not put SQLite in an ephemeral Vercel function.
Long solves must fit the deployment plan's execution window (the adapter is set
to 300 seconds). Queueing/durable execution and Supabase scheduling persistence
remain production integration work. No deployment or production env changes were
performed for this local setup.

## Verification

`pnpm test` covers the role gateway, session frame, dashboard expiry and backend
startup alongside existing website tests. `pnpm test:scheduler` requires Python
and checks constraints, internal-secret enforcement and the portal bridge.
`pnpm test:scheduler-gateway` additionally starts a temporary real Python service,
uses a synthetic coordinator Auth fixture, saves and generates a timetable through
Express, reopens the immutable version, and downloads its CSV. It is separate
from website-only CI because OR-Tools must be installed first.

Browser verification confirmed the configured sign-in page and signed-out
coordinator redirect. A real coordinator credential was not available to the
agent, so a real successful staff sign-in was not claimed; the successful flow
was exercised with automated session fixtures and the real Python service.
