# Deploy CampusPool for free (₹0, no credit card)

You will use four free services. None of them asks for a card.

| What | Service | Free limits that matter |
|---|---|---|
| Code | GitHub | Private repositories are free |
| Database | Neon (PostgreSQL) | 0.5 GB storage, 100 compute-hours a month, sleeps after 5 idle minutes |
| Sign-in emails | Brevo | 300 emails a day |
| The app itself | Render | One web service, 750 hours a month, sleeps after 15 idle minutes |

Your app gets an address like `https://campuspool-ab12.onrender.com`. The website, the API and live chat all run behind that one address, so you do not need to buy a domain.

## What "free" means here

- **It can sleep.** After 15 minutes with no visitors, Render pauses the app, and the next visitor waits about a minute. Step 7 shows how to keep it awake for free.
- **Photos live in the database** (Render's free disk is wiped on every restart). 0.5 GB holds a few thousand chat photos and profile pictures.
- **300 sign-in emails a day.** Each sign-in is one email.

---

## Step 1. Put the code on GitHub

1. Make a free account at https://github.com.
2. Click **New repository**, name it `campuspool`, choose **Private**, and create it. Leave the "add README" boxes unticked.
3. In Terminal, from the project folder (the one that contains `Dockerfile` and `render.yaml`):

   ```bash
   cd ~/Downloads/campuspool8
   git init
   git add .
   git commit -m "CampusPool"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/campuspool.git
   git push -u origin main
   ```

   When asked for a password, GitHub wants a **personal access token**, not your password: GitHub > Settings > Developer settings > Personal access tokens > Tokens (classic) > Generate, tick `repo`. (Or install GitHub Desktop and use "Add existing repository" instead of these commands.)

4. Check on GitHub that `backend/.env` is **not** in the list of files. The `.gitignore` keeps it out; it holds your local secrets.

## Step 2. Create the database on Neon

1. Sign up at https://neon.com (you can sign in with GitHub).
2. Create a project. Name: `campuspool`. Region: **AWS Asia Pacific (Singapore)**, the closest to India. Postgres version: the default.
3. Open **Connect** on the project dashboard and copy the **connection string**. It looks like:

   ```
   postgresql://neondb_owner:AbC123...@ep-something-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

   Keep it private. You paste it into Render in Step 5 exactly as shown; CampusPool adjusts the start of it by itself.

The tables are created automatically the first time the app starts.

## Step 3. Make your two secret keys

In Terminal, from the project folder:

```bash
python3 backend/scripts/make_keys.py
```

It prints `SECRET_KEY=...` and `DATA_ENCRYPTION_KEY=...`. You only need the **DATA_ENCRYPTION_KEY** value (Render makes the other one for you).

**Save DATA_ENCRYPTION_KEY somewhere safe** (a password manager, or a private note). If it is lost or changed, stored messages and photos can never be read again.

## Step 4. Set up sign-in emails on Brevo

Render's free plan blocks normal email (SMTP), so CampusPool sends codes through Brevo's web API instead.

1. Sign up at https://www.brevo.com and choose the **Free** plan. Fill in the short profile it asks for.
2. Add a sender: open **Senders, Domains & Dedicated IPs** (in the account menu, top right) > **Senders** > **Add a sender**. Use a name like `CampusPool` and an email address you can open, such as your Gmail. Brevo emails you a link; click it to verify the sender.
3. Create an API key: account menu > **SMTP & API** > **API Keys** > **Generate a new API key**. Copy it (it starts with `xkeysib-`). You see it only once.

Brevo sometimes reviews new accounts before they can send. If codes do not arrive later, check your Brevo inbox and dashboard for an activation message.

## Step 5. Deploy on Render

1. Sign up at https://render.com with your GitHub account.
2. Click **New** > **Blueprint**, connect your GitHub, and pick the `campuspool` repository. Render reads `render.yaml` and shows one free web service called `campuspool`.
3. Fill in the values it asks for:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | The Neon connection string from Step 2 |
   | `DATA_ENCRYPTION_KEY` | The value from Step 3 |
   | `BREVO_API_KEY` | The `xkeysib-...` key from Step 4 |
   | `MAIL_FROM_EMAIL` | The sender address you verified in Step 4 |
   | `ADMIN_EMAILS` | Your own `@thapar.edu` address (gives you the Admin page) |
   | `NEXT_PUBLIC_GIPHY_API_KEY` | Leave empty for now (optional GIF search, see below) |

4. Click **Apply** / **Deploy**. The first build takes about 8 to 12 minutes. Watch it under the service's **Logs**.
5. When it says **Live**, open the address at the top of the service page (`https://campuspool-....onrender.com`).

## Step 6. Try it

1. Sign up with your `@thapar.edu` email. The code arrives from your Brevo sender; **check Spam** the first time and mark it "not spam".
2. Ask a friend to sign up on their phone, offer a ride, and chat. Their browser makes its chat keys automatically.
3. On your phone, sign in to your own account: it shows a code; type it on your laptop to open your chats there.
4. In **Settings > Secure chat**, create a recovery key and keep it safe.

---

## Step 7 (optional). Keep it awake, still free

Render only pauses the app when nothing reaches it for 15 minutes, so a free service that visits it every 10 minutes keeps it awake.

1. Make a free account at https://cron-job.org.
2. **Create cronjob**: title `CampusPool awake`, URL `https://YOUR-APP.onrender.com/api/health`, schedule **every 10 minutes**. Save.

Why this stays free:

- **Render:** a month is at most 744 hours and the free plan gives 750, so one service can run all month. Keep it your **only** free web service on Render; a second one would share the same 750 hours.
- **Neon:** `/api/health` does not touch the database. When nobody but the ping is visiting, CampusPool's housekeeping (removing old rides, sending reminders) runs only every 30 minutes (`CLEANUP_IDLE_SECONDS=1800`), so the database sleeps in between. That uses roughly 30 of the 100 free compute-hours a month, leaving the rest for real use. In Neon, keep the compute size at the smallest setting (0.25) so the hours stretch furthest: Branches > main > Computes > Edit.
- **Reminders** stay on time while people are using the app. During long quiet spells they can arrive up to 30 minutes later than chosen.

It still restarts now and then (after each deploy, or when Render moves it), which takes about a minute. Render could change its free-plan rules at any time; if it stops allowing this, the app simply goes back to sleeping when idle.

## Making changes later

Change the code on your Mac, test it locally, then:

```bash
git add .
git commit -m "What you changed"
git push
```

Render rebuilds and redeploys by itself in about 10 minutes. Students keep their accounts, chats and photos.

If you change the database models, create a migration before pushing (see "Database migrations" in README.md). It is applied automatically when the app starts.

Render's free plan includes a limited number of build minutes a month, so push finished changes rather than every small edit.

## Optional: GIF search

1. Get a free key at https://developers.giphy.com: **Create an App** > **API**.
2. In Render: your service > **Environment** > set `NEXT_PUBLIC_GIPHY_API_KEY`, save, then **Manual Deploy** > **Deploy latest commit** (the key is built into the website, so it needs a rebuild).

If GIF search still says it is off after the rebuild, put the key in the line `ARG NEXT_PUBLIC_GIPHY_API_KEY=""` in the root `Dockerfile` instead (between the quotes) and push. It is a public key, so that is safe.

## If something goes wrong

Open your service on Render > **Logs**. The last lines usually say what is wrong.

| What you see | What to do |
|---|---|
| Deploy fails with `DATA_ENCRYPTION_KEY must be 32 random bytes` | Paste the value from Step 3 again, with nothing before or after it. |
| Deploy fails mentioning the database or `connection` | Check `DATABASE_URL` is the full Neon string, including `?sslmode=require`. |
| "Email delivery is not configured on this server" | `BREVO_API_KEY` or `MAIL_FROM_EMAIL` is missing. |
| "Could not send the email" | In Logs look for `Brevo delivery failed`. Usually the sender is not verified yet, or the key was copied wrongly. |
| The site takes a minute to load | It was asleep, or it just redeployed. Set up Step 7 to keep it awake. |
| Neon says compute hours are nearly used up | Check the ping URL is `/api/health` (not `/api/health/db`), and that `CLEANUP_IDLE_SECONDS` is `1800`. |
| Signed in, but chats say "This device cannot open your chats yet" | Normal on a new browser: approve it from another device, or use your recovery key. |

## Where to go after free

If the app gets real use, the cheapest upgrades are a paid Render instance (no sleeping) and a domain of your own. Nothing in the code needs to change: the same setup keeps working.
