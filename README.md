# CampusPool

Rides and company for Thapar students. Sign-in is limited to `@thapar.edu` email addresses and confirmed with a one-time code sent to that mailbox.

```
frontend/   Next.js (App Router) + TypeScript + Tailwind CSS v4
backend/    FastAPI + SQLAlchemy 2 + PostgreSQL (psycopg 3)
```

## What it does

- **Accounts:** create an account or sign in with your `@thapar.edu` email and a 6-digit code. Codes expire in 10 minutes, allow 5 attempts, and are rate limited. Sessions use an httpOnly cookie. Profile, photo, settings and account deletion are editable in the app.
- **Rides:** offer a ride, search and filter, request a seat, accept or decline, start, cancel, or complete with the actual fare. The fare is split as actual fare ÷ everyone in the ride (creator included).
- **Payments:** riders get a UPI link. Opening it is not payment. A rider taps "I have paid", and only the ride creator can confirm it. CampusPool never moves or holds money.
- **Activities:** sports, walk, gym, food, movie, study, hangout and other. Request, accept or decline, group plan thread, complete or cancel. No payments.
- **Chat:** one-to-one messages between students connected by a ride or activity request, **end-to-end encrypted** with nothing to type (see "Secure chat"). Photos, animated GIFs, CampusPool's own animated stickers, emoji, reactions (hover a message, or double-click for ❤️), "typing...", read ticks and optional sounds. Delivered live over a WebSocket.
- **Look and feel:** light and dark mode (or match the device), a theme switch in the sidebar and header, and a choice of five chat bubble colours. All under Settings > Appearance, saved per device.
- **Live updates:** new rides, requests, answers and messages appear without refreshing.
- **Expiry:** activities are removed 2 hours after they start. Rides that never completed are removed 12 hours after departure. Completed rides are kept until every share is confirmed (a money record), then removed after 24 hours. Past rides and activities are hidden from search immediately. Notifications older than 30 days are deleted.
- **Reports and admin:** report a ride, an activity or a student (from chat). Administrators (emails in `ADMIN_EMAILS`) get an **Admin** page with an overview (students, open rides, reports, posts per day, popular routes), a reports queue (dismiss, remove the post, or suspend the student) and a student list with suspend and restore. Suspended students are signed out and cannot sign in again.
- **Block:** from "More" next to a student's name (rides, activities, chat) or from Settings. Neither of you can message the other or ask to join the other's rides and activities, open posts are hidden from each other, and pending requests between you are declined. The blocked student is told only that a ride "may have expired".
- **Restrict:** a quiet, one-way limit, and the restricted student is never told. Their join requests and messages still arrive, but with no notifications and no unread badge, and requests are tagged "Restricted". Blocking and restricting are mutually exclusive for a pair; both are listed in Settings, where you can undo them.
- **Report from chat, and message notifications:** a first unread message sends one notification (not for restricted students).
- **Signed-out visitors:** anyone who opens a page without signing in is sent to the login page with a notice ("Please sign in first... New here? Create an account first, then sign in"), and returns to the page they wanted after signing in.

## What "verified" means here

Signing in proves a person can read mail at an `@thapar.edu` address. It does not check student ID numbers or enrolment, and staff addresses use the same domain. The app says "Thapar email confirmed", never "verified student".

## Privacy and encryption

- **What other students see:** name and photo, plus year, branch and hostel only if the student allows it (Settings > Privacy; hostel is off by default). Email and phone are never shown to other students. A UPI ID is shown only to riders who owe that person a share. Names appear with the student's year, for example "Riya Sharma · 2nd year".
- **Chat encryption:** end-to-end. See "Secure chat" below. Everything the server stores for a chat is also sealed at rest with `DATA_ENCRYPTION_KEY` (AES-256-GCM), as a second layer.
- **Chat photos:** shrunk and encrypted in the sender's browser, stored (sealed again) as ciphertext, and decrypted only in the other student's browser.
- **Retention:** chat messages and photos are deleted after 90 days (`MESSAGE_RETENTION_DAYS`), notifications after 30.
- **Student controls:** privacy switches, data download, and account deletion (which also deletes chat photo files).
- **Privacy page:** `/privacy` explains all of this in plain language and is readable without signing in. It should be reviewed by whoever runs the app before a public launch.
- **Admins** can see names, emails, reports and feedback. No admin screen shows chat messages or photos.

## Secure chat (end-to-end encryption)

Nobody types a passphrase or key to read messages.

- **Keys are made automatically.** The first time a student opens CampusPool, their browser makes an ECDH P-256 key pair. The **public key** goes to the server. The **private key** stays in that browser (IndexedDB) and is kept after sign-out, so signing back in needs nothing.
- **New devices are approved from an old one.** A new browser shows an 8-character code ("Approve from my other device"). Every device where chat already works shows a prompt; the student types the code there, and the private key is sealed to the new device's one-time key and passed through the server, which cannot open it. If a server swapped the one-time key, the codes would not match and the approval is refused. "That was not me" offers to sign out every other browser.
- **Recovery key (optional).** Settings > Secure chat > Create a recovery key shows 24 characters once. A copy of the private key sealed with it is stored on the server, so a student who loses every device can get back in. Without a device or this key, old messages cannot be recovered by anyone.
- **Starting fresh** makes new keys; old messages stop opening and partners see the security code change.
- **Shared computers:** Settings > Secure chat > "Sign out and remove chat keys".
- **Students from the passphrase version** enter their old passphrase once (on a new device, or in Settings on an old one). After that it is never needed again and the server copy is deleted.
- Each conversation derives its own AES-256-GCM key (ECDH + HKDF). Every message has a fresh random IV and is bound to its conversation and sender. Photos, GIFs from the device, stickers, GIF links and reactions are all inside the encrypted envelope. Chat-list previews are opened in the browser.
- A **security code** (safety number) in each chat lets two people confirm no one is in the middle. If a partner's key changes, a warning appears.
- **What the server still sees:** who talks to whom, when, message sizes, that a photo was sent, and that someone is typing. Everything it stores for a chat is also sealed at rest with `DATA_ENCRYPTION_KEY` as a second layer.
- **GIF search** uses GIPHY (Google closed the Tenor API on 30 June 2026) and is off until you set `NEXT_PUBLIC_GIPHY_API_KEY` in `frontend/.env.local` (free key at developers.giphy.com). Search words go to GIPHY, and viewers load the GIF from GIPHY. Only GIPHY image addresses are shown, so a message cannot load a tracking image from elsewhere. GIFs sent from the device never touch GIPHY.
- Browsers keep keys per address: `localhost:3000` and `127.0.0.1:3000` count as different devices. Pick one.
- Check the crypto with `npm run test:e2ee` (Node 20+, 30 real checks including tampering, swapped keys, wrong codes and recovery).
- Limits to know: whoever controls the website's code could ship code that leaks keys (the usual limit of browser-based encryption), and someone with an unlocked browser that holds the key can read that student's chats.

## Maps and route preview

- Offer a ride: pick known places (with approximate positions) or click the map to place pickup and destination pins, drag them to adjust. Map points are optional.
- Ride pages show the route; the Ride Pool has a **List / Map** switch with a pin per ride at its destination.
- Tiles come from OpenStreetMap, and road distance/time from the public OSRM demo server. Both are called from the student's browser. For anything beyond a demo, run your own routing and set `NEXT_PUBLIC_OSRM_URL` (set it to an empty string to turn road routing off; a straight-line distance is shown instead).

## Repeating rides

Choose **Every week** or **Every weekday** and the number of rides (2 to 12, within 60 days). Each date becomes its own ride with its own seats and requests. The creator can cancel one ride, or "this and all later rides in the series".

## Ratings

After a completed ride, riders rate the creator and the creator rates each rider (1 to 5 stars, optional comment, once per person per ride). Others see only an average and a count. Comments are visible only to the person rated, without the rater's name. Ratings stay after the ride is removed.

## Reminders

A reminder (15 minutes to 2 hours before, chosen in Settings) is added to Notifications for the creator and accepted riders of a ride, and for hosts and accepted participants of an activity. Students can also opt in to an email reminder (uses the same SMTP settings as sign-in codes; without SMTP it is printed in the backend console in development). Desktop notifications appear while CampusPool is open in a background tab.
**Not included:** push notifications to a phone while the site is closed. That needs a service worker and Web Push keys (and, on iPhone, installing the site to the home screen).

## Finished rides and activities

- A creator can remove a finished ride once every rider's share is confirmed (or it was cancelled). Riders and hosts can also remove a finished ride or activity from **their own** lists; others still see it.
- Anything left alone is removed automatically: activities about 2 hours after they start, unfinished rides 12 hours after departure, settled rides about a day after the last payment is confirmed.

## Feedback

Any student can send feedback (a problem, idea, praise or other, with an optional 1 to 5 rating) from **Feedback** in the sidebar. Administrators read it in Admin > Feedback and mark it as read.

## Safeguards

- Sign-up refuses `+` aliases (`name+1@thapar.edu` is the same mailbox as `name@thapar.edu`).
- Requesting a sign-in code gives the same reply whether or not an account exists, so the form cannot be used to find out who has joined.
- Per-IP limits on code requests and code checks; per-user limits on posting, messaging and reporting. They are kept in memory per process; put a gateway limiter in front for a public launch.
- Profile photos can only be fetched by signed-in students.
- `EMAIL_PATTERN` (optional) can restrict sign-up further if student addresses follow a pattern.

## Run it locally

### Option A: Docker (easiest)

Needs Docker Desktop. From the `campuspool7` folder:

```bash
docker compose up --build
```

Open http://localhost:3000. Sign-in codes are printed in the backend logs: `docker compose logs -f backend`. Postgres data and uploaded files live in Docker volumes. Your `backend/.env` is used if present (for `ADMIN_EMAILS`, SMTP and so on), with the database address set by Compose. For GIF search, put `NEXT_PUBLIC_GIPHY_API_KEY=...` in a `.env` file next to `docker-compose.yml` before building.

### Option B: by hand

Needs Node.js 20+, Python 3.11+ and PostgreSQL 14+.

**1. Database**

```bash
createdb campuspool
# or with a dedicated user:
psql -c "CREATE USER campuspool WITH PASSWORD 'choose-a-password';"
psql -c "CREATE DATABASE campuspool OWNER campuspool;"
```

Tables are created automatically when the backend starts in development.

**2. Backend**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env               # skip if you already have backend/.env
uvicorn app.main:app --reload --port 8000
```

In `backend/.env` set `DATABASE_URL`, a `SECRET_KEY` (`python3 -c "import secrets; print(secrets.token_urlsafe(48))"`) and, if you want real emails, the SMTP settings below. Check http://localhost:8000/health/db says `ok`. API docs: http://localhost:8000/docs. Tests: `pytest` (in-memory SQLite, no PostgreSQL needed). Put your email in `ADMIN_EMAILS` to get the Admin page.

**3. Frontend**

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Fonts are bundled, so no internet is needed to build. Checks: `npm run typecheck`, `npm run lint`, `npm run test:e2ee`, `npm run build`.

### Sending the one-time codes

Codes are sent by SMTP. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM` in `backend/.env` with any mail account you control (for example a Gmail account with an app password, or a transactional email service such as Brevo or Resend). Mail from free accounts may land in spam.

Development shortcut: with `ENVIRONMENT=development` and `SMTP_HOST` empty, the code is printed in the backend terminal instead of emailed. This is refused when `ENVIRONMENT=production`.

## Testing on a phone

Both servers must listen on your network, and the phone must be on the same Wi-Fi:

```bash
uvicorn app.main:app --reload --port 8000 --host 0.0.0.0     # backend
npm run dev -- -H 0.0.0.0                                    # frontend
```

Open `http://<your-computer-address>:3000` on the phone. In development the frontend finds the API on the same address and the backend accepts local network origins. Leave `NEXT_PUBLIC_API_URL` unset (or delete it from `frontend/.env.local`).

## Database migrations

The initial migration is committed (`backend/alembic/versions/0001_initial_schema.py`). Production runs `alembic upgrade head` automatically when the backend container starts (see `backend/Dockerfile`).

- **New production database:** nothing to do; the first start creates every table.
- **A database first made in development** (tables created automatically): run `alembic stamp head` once, then use migrations from then on.
- **After changing models:** `alembic revision --autogenerate -m "describe change"`, check the file, then `alembic upgrade head`.

## Deploying

**For free (₹0, no card):** follow [DEPLOY_FREE.md](DEPLOY_FREE.md). It runs the whole app as one Render web service (root `Dockerfile` and `render.yaml`) with a free Neon database and Brevo for sign-in emails, at a free `onrender.com` address. Photos are stored in the database there (`STORAGE_BACKEND=database`) because the free disk is wiped on restart.

**On your own domain** (paid or self-hosted), read on.

The session cookie only travels when the web app and the API share a registrable domain, for example `campuspool.example.com` and `api.campuspool.example.com`. Two free hosts on different domains (say `*.vercel.app` and `*.onrender.com`) will **not** keep students signed in. Get a domain (often a few hundred rupees a year) and point two subdomains at your hosting.

**Production settings (backend environment):**

```
ENVIRONMENT=production
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/campuspool
SECRET_KEY=<python3 -c "import secrets; print(secrets.token_urlsafe(48))">
DATA_ENCRYPTION_KEY=<python3 -c "import base64, secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())">
CORS_ORIGINS=https://campuspool.example.com
COOKIE_SECURE=true
TRUST_PROXY=true
SMTP_HOST=...  SMTP_PORT=587  SMTP_USER=...  SMTP_PASSWORD=...  SMTP_FROM=CampusPool <no-reply@example.com>
# or, where SMTP ports are blocked: BREVO_API_KEY=...  MAIL_FROM_EMAIL=you@example.com
# optional: STORAGE_BACKEND=database (photos in PostgreSQL instead of a disk)
ADMIN_EMAILS=you@thapar.edu
```

Back up `DATA_ENCRYPTION_KEY`: without it stored messages and photos cannot be read again. Do not reuse the development `SECRET_KEY`.

**Frontend build settings:** `NEXT_PUBLIC_API_URL=https://api.campuspool.example.com`, and optionally `NEXT_PUBLIC_GIPHY_API_KEY`. These are baked in at build time, so rebuild after changing them.

**Option 1: one small server (VPS) with Docker.** Install Docker, copy the project, build both images with the settings above (for example with a `docker-compose.prod.yml` that drops the dev overrides and sets `ENVIRONMENT=production`), and put a reverse proxy such as Caddy in front for automatic HTTPS:

```
campuspool.example.com {
  reverse_proxy frontend:3000
}
api.campuspool.example.com {
  reverse_proxy backend:8000
}
```

**Option 2: managed hosts.** Frontend on Vercel (root directory `frontend`), backend on Render or Railway using `backend/Dockerfile` with a managed PostgreSQL, each on its own subdomain of your domain. Give the backend a persistent disk mounted at `/app/uploads` for photos.

Either way: serve both over HTTPS, keep a single backend worker (live updates use an in-process hub; add Redis pub/sub before scaling out), and back up the database and the uploads folder.

## Known limits

- Staff and students share the thapar.edu domain; use `EMAIL_PATTERN` if student addresses can be told apart.
- Profile photos and encrypted chat photos live on the server disk; there is no object-storage option yet. Chat has no email or push notifications.
- Live updates use one process. Rate limits are per process.
- Push notifications to a phone while the site is closed are not included.
- Message reactions count as messages for the unread badge.

## What has been checked

`pytest` (36 tests), `npm run test:e2ee` (30 crypto checks), `npm run typecheck`, `npm run lint` and `npm run build` all pass. The full stack was also run on PostgreSQL 16 and driven in real browsers: two students chatting, typing, stickers, emoji, reactions, a GIF from the device, the database holding no readable text, sign out and back in with nothing to type, approving a second laptop and a phone by code, and restoring from a recovery key.
