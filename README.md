# 🎉 Gatherly — beautiful party invitations with RSVP tracking

Create a gorgeous, fully customizable party invitation in a minute — no account
needed. Share one link with guests; they RSVP in seconds. You get a secret
manage link with live yes/no/maybe counts, headcount totals, the guest list,
and one-click CSV export.

**Stack:** Node.js 20+, Express 4, better-sqlite3, helmet. No frontend build
step — plain HTML/CSS/vanilla JS in `public/`. Google Fonts via CDN.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000

> **Note:** `better-sqlite3` compiles a native module at install time. You need
> Python 3, `make` and a C++ compiler (`build-essential` on Debian/Ubuntu,
> Xcode tools on macOS). If `npm install` fails inside a sandbox, pre-seed the
> Node headers cache first — see "Troubleshooting" below.

## Environment variables

| Variable   | Default                 | What it does                                      |
|------------|-------------------------|---------------------------------------------------|
| `PORT`     | `3000`                  | Port the server listens on                        |
| `DATA_DIR` | `./data` (repo-local)   | Directory holding `evite.db` (SQLite, WAL mode)   |
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

## Deploy

### Option A — Render (recommended) ⭐

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, select the repo. `render.yaml` creates the
   web service **plus a 1 GB persistent disk** mounted at `/data` (that's where
   the SQLite database lives so RSVPs survive restarts/redeploys).
3. After the first deploy, set the `BASE_URL` env var to your real URL, e.g.
   `https://gatherly.onrender.com` (share links are built from it).
4. ⚠️ Render's **free** plan has no persistent disks — use the **Starter**
   plan (≈ $7/mo) or the database will reset on every deploy.

### Option B — Fly.io

```bash
# one-time setup
fly launch --no-deploy        # accept the defaults; it detects the Dockerfile
fly volumes create gatherly_data --region iad --size 1

# deploy
fly deploy
```

Then set the secrets so share links use your public hostname:

```bash
fly secrets set BASE_URL=https://<your-app>.fly.dev DATA_DIR=/data
```

Make sure `fly.toml` mounts the volume at `/data`:

```toml
[mounts]
  source = "gatherly_data"
  destination = "/data"
```

(`fly launch` generates `fly.toml` for you — just add the `[mounts]` section.)

### Option C — Railway

1. **New Project → Deploy from GitHub**, select the repo.
2. Railway builds the Dockerfile automatically.
3. Add a **Volume** and mount it at `/data`.
4. Set variables: `DATA_DIR=/data`, `BASE_URL=https://<your-domain>.up.railway.app`.
5. Railway sets `PORT` automatically — the app respects it.

### Option D — any Docker VPS (Hetzner, DigitalOcean, …)

```bash
# on the server
docker build -t gatherly .
docker run -d --restart unless-stopped \
  -p 3000:3000 \
  -v gatherly-data:/data \
  -e BASE_URL=https://invites.yourdomain.com \
  -e DATA_DIR=/data \
  --name gatherly gatherly
```

Put Caddy/Nginx in front for HTTPS, e.g. with Caddy it's a two-line
reverse proxy: `invites.yourdomain.com { reverse_proxy localhost:3000 }`.

---

## Troubleshooting

**`npm install` fails building better-sqlite3** with
`TAR_ENTRY_ERROR EPERM … fchown` while node-gyp downloads headers: the sandbox
blocks `chown` during tar extraction. Workaround — seed the header cache first:

```bash
mkdir -p ~/.cache/node-gyp/$(node -p process.version.slice(1))
curl -sL -o /tmp/hdrs.tar.gz \
  https://nodejs.org/dist/$(node -p process.version)/node-$(node -p process.version)-headers.tar.gz
tar --no-same-owner -xzf /tmp/hdrs.tar.gz \
  -C ~/.cache/node-gyp/$(node -p process.version.slice(1)) --strip-components=1
echo 11 > ~/.cache/node-gyp/$(node -p process.version.slice(1))/installVersion
npm install
```

(The `installVersion` file just has to be ≥ the bundled node-gyp's version.)

## Security notes

- `helmet` with a strict CSP (scripts/styles self-only; Google Fonts allow-listed).
- All SQL is parameterized; theme values are allow-list validated server-side.
- All user content is rendered via `textContent` — never `innerHTML`.
- Manage links are 256-bit random tokens; RSVP posting is rate-limited.
- Back up `DATA_DIR/evite.db` — it holds everything.
