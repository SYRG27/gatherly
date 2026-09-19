# 🎉 Gatherly — beautiful party invitations with RSVP tracking

Create a gorgeous, fully customizable party invitation in a minute — no account
needed. Share one link with guests; they RSVP in seconds. You get a secret
manage link with live yes/no/maybe counts, headcount totals, the guest list,
and one-click CSV export.

**Stack:** Node.js 20+, Express 4, libSQL (`@libsql/client`), helmet. No frontend
build step — plain HTML/CSS/vanilla JS in `public/`. Google Fonts via CDN.

The database is **Turso Cloud** (SQLite-compatible, generous free tier) in
production, and a plain local SQLite file for development — same code, the
`TURSO_DATABASE_URL` env var decides.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000

## Environment variables

| Variable            | Default               | What it does                                     |
|---------------------|-----------------------|--------------------------------------------------|
| `PORT`              | `3000`                | Port the server listens on                       |
| `TURSO_DATABASE_URL`| (local file)          | `libsql://…` URL of your Turso database (prod)   |
| `TURSO_AUTH_TOKEN`  | —                     | Auth token for the Turso database (prod)         |
| `DATA_DIR`          | `./data` (repo-local) | Local SQLite file location when Turso isn't set  |
| `BASE_URL` | `http://localhost:PORT` | Used to build absolute invite/manage share links  |

No secrets live in the repo. The manage tokens are random per event and stored
only in the database.

## API overview

| Method | Route                              | Notes                                              |
|--------|------------------------------------|----------------------------------------------------|
| POST   | `/api/events`                      | Create event → `{public_id, manage_token, invite_url, manage_url}` |
| GET    | `/api/events/:publicId`            | Public event + counts (no RSVP rows, no token)     |
| GET    | `/api/manage/:token`               | Full event + RSVPs + stats                         |
| PATCH  | `/api/manage/:token`               | Update event fields                                |
| POST   | `/api/events/:publicId/rsvp`       | Upsert RSVP (rate-limited: 30/min per IP)          |
| DELETE | `/api/manage/:token/rsvps/:id`     | Remove one RSVP                                    |
| GET    | `/api/manage/:token/export.csv`    | CSV download of the guest list                     |

Pages: `/` (landing) · `/create` (editor, `?preset=` or `?manage=` supported) ·
`/e/:publicId` (invite) · `/manage/:token` (dashboard).

---

## Deploy — free tier ⭐

The app is built for **$0 hosting**: the web service runs on Render's free
plan, and the database lives on **Turso Cloud** (SQLite-compatible, free tier,
no credit card). No persistent disk needed anywhere.

### 1. Create the free Turso database

1. Sign up at [turso.tech](https://turso.tech) (GitHub login works).
2. Install the CLI: `curl -sSfL https://get.tur.so/install.sh | bash`
   (or use the web dashboard), then:
   ```bash
   turso auth login
   turso db create gatherly
   turso db show gatherly --url        # → libsql://gatherly-….turso.io  (TURSO_DATABASE_URL)
   turso db tokens create gatherly     # → long token                    (TURSO_AUTH_TOKEN)
   ```

### 2. Deploy the web service on Render

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, select the repo. `render.yaml` creates a
   **free** web service (no disk needed — data lives on Turso).
3. After the first deploy, open the service → **Environment** and set:
   - `TURSO_DATABASE_URL` → the `libsql://…` URL from step 1
   - `TURSO_AUTH_TOKEN` → the token from step 1
   - `BASE_URL` → your real URL, e.g. `https://gatherly.onrender.com`
     (share links are built from it)
4. Save — Render redeploys automatically.

> Render's free plan sleeps after ~15 min idle; the first visit after a nap
> takes ~30 s to wake. Fine for party invites.

### Other hosts (Docker)

Any host that runs the Dockerfile works — just provide the three env vars
above instead of a volume:

```bash
docker build -t gatherly .
docker run -d --restart unless-stopped \
  -p 3000:3000 \
  -e TURSO_DATABASE_URL='libsql://…' \
  -e TURSO_AUTH_TOKEN='…' \
  -e BASE_URL=https://invites.yourdomain.com \
  --name gatherly gatherly
```

Put Caddy/Nginx in front for HTTPS, e.g. with Caddy it's a two-line
reverse proxy: `invites.yourdomain.com { reverse_proxy localhost:3000 }`.

---

## Troubleshooting

**App starts but events/RSVPs fail** with a database error: check
`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`. Without them the app uses a local
SQLite file — fine for development, but on free hosting the file is ephemeral,
so production needs Turso set.

**Cold starts on Render free:** the service sleeps after ~15 min idle. The
first request wakes it (~30 s). This is normal on the free plan.

## Security notes

- `helmet` with a strict CSP (scripts/styles self-only; Google Fonts allow-listed).
- All SQL is parameterized; theme values are allow-list validated server-side.
- All user content is rendered via `textContent` — never `innerHTML`.
- Manage links are 256-bit random tokens; RSVP posting is rate-limited.
- Back up your data: on Turso use `turso db shell`/dashboard exports; locally
  it's the `DATA_DIR/evite.db` file.
