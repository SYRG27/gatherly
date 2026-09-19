// Evite-style party invitation app — Express server.
// JSON API + static pages. Security: helmet, parameterized queries,
// allowlist-validated themes, in-memory RSVP rate limiting, escaped output.
'use strict';

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const db = require('./db');

const PORT = parseInt(process.env.PORT || '3000', 10);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      // Guests may use any http(s) cover image / photo URL (server validates scheme).
      imgSrc: ["'self'", 'https:', 'http:', 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '64kb' }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FONT_PAIRINGS = {
  gala:     { heading: "'Playfair Display', Georgia, serif", body: "'Inter', system-ui, sans-serif" },
  romantic: { heading: "'Cormorant Garamond', Georgia, serif", body: "'Inter', system-ui, sans-serif" },
  modern:   { heading: "'Space Grotesk', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif" },
  festive:  { heading: "'DM Serif Display', Georgia, serif", body: "'Inter', system-ui, sans-serif" },
  playful:  { heading: "'Great Vibes', cursive", body: "'Inter', system-ui, sans-serif" },
  minimal:  { heading: "'Inter', system-ui, sans-serif", body: "'Inter', system-ui, sans-serif" },
};
const BG_STYLES = ['gradient', 'pattern', 'image', 'solid'];
const LAYOUTS = ['centered', 'classic'];

const THEME_PRESETS = {
  'midnight-gala':   { primary: '#0f1035', accent: '#d4af37', background: '#1a1b4b', fontPairing: 'gala',     bgStyle: 'gradient', layout: 'centered' },
  'blush-garden':    { primary: '#b76e79', accent: '#7d8c6f', background: '#fdf3f0', fontPairing: 'romantic', bgStyle: 'pattern',  layout: 'centered' },
  'neon-night':      { primary: '#ff2fb3', accent: '#22d3ee', background: '#0b0b14', fontPairing: 'modern',   bgStyle: 'gradient', layout: 'centered' },
  'golden-hour':     { primary: '#c2410c', accent: '#f59e0b', background: '#fff7ed', fontPairing: 'festive',  bgStyle: 'gradient', layout: 'classic'  },
  'minimal-mono':    { primary: '#111111', accent: '#6b7280', background: '#fafafa', fontPairing: 'minimal',  bgStyle: 'solid',    layout: 'classic'  },
  'vintage-postcard':{ primary: '#9a3412', accent: '#b45309', background: '#faf3e3', fontPairing: 'festive',  bgStyle: 'pattern',  layout: 'classic'  },
};
const DEFAULT_THEME = { preset: 'midnight-gala', ...THEME_PRESETS['midnight-gala'] };

// Validate a theme object against strict allowlists. Unknown/invalid values
// fall back to the default preset so stored themes are always safe to apply.
function sanitizeTheme(input) {
  const t = (input && typeof input === 'object') ? input : {};
  const preset = typeof t.preset === 'string' && THEME_PRESETS[t.preset] ? t.preset : 'midnight-gala';
  const base = THEME_PRESETS[preset];
  const pick = (val, ok, fallback) => (typeof val === 'string' && ok(val) ? val : fallback);
  return {
    preset,
    primary: pick(t.primary, (v) => HEX_COLOR.test(v), base.primary),
    accent: pick(t.accent, (v) => HEX_COLOR.test(v), base.accent),
    background: pick(t.background, (v) => HEX_COLOR.test(v), base.background),
    fontPairing: pick(t.fontPairing, (v) => Object.hasOwn(FONT_PAIRINGS, v), base.fontPairing),
    bgStyle: pick(t.bgStyle, (v) => BG_STYLES.includes(v), base.bgStyle),
    layout: pick(t.layout, (v) => LAYOUTS.includes(v), base.layout),
  };
}

function isHttpUrl(s) {
  if (typeof s !== 'string' || !s) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Validate + normalize event fields shared by POST and PATCH.
function validateEventInput(body) {
  const errors = [];
  const title = str(body.title, 120);
  if (!title) errors.push('title is required');
  const startsAt = str(body.starts_at, 40);
  if (startsAt && Number.isNaN(Date.parse(startsAt))) errors.push('starts_at must be an ISO date-time');
  const cover = str(body.cover_image_url, 2048);
  if (cover && !isHttpUrl(cover)) errors.push('cover_image_url must be an http(s) URL');
  return {
    errors,
    event: {
      title,
      host_name: str(body.host_name, 80),
      event_type: str(body.event_type, 40),
      starts_at: startsAt,
      venue: str(body.venue, 120),
      address: str(body.address, 200),
      description: str(body.description, 2000),
      cover_image_url: cover,
      theme_json: JSON.stringify(sanitizeTheme(body.theme)),
      plus_ones_allowed: body.plus_ones_allowed === false || body.plus_ones_allowed === 0 ? 0 : 1,
    },
  };
}

function newPublicId() {
  // 8 URL-safe chars (~48 bits) — fine for unguessable-ish public links;
  // the manage token is the real secret.
  return crypto.randomBytes(6).toString('base64url');
}
function newManageToken() {
  return crypto.randomBytes(32).toString('hex');
}

const PUBLIC_ID_RE = /^[A-Za-z0-9_-]{8}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;

// In-memory sliding-window rate limiter (per IP). Enough for a single-node app.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, times] of hits) {
      const fresh = times.filter((t) => t > cutoff);
      if (fresh.length) hits.set(ip, fresh); else hits.delete(ip);
    }
  }, windowMs).unref();
  return (req, res, next) => {
    const ip = req.ip;
    const cutoff = Date.now() - windowMs;
    const times = (hits.get(ip) || []).filter((t) => t > cutoff);
    if (times.length >= max) {
      return res.status(429).json({ error: 'Too many requests — please slow down.' });
    }
    times.push(Date.now());
    hits.set(ip, times);
    next();
  };
}
const rsvpLimiter = rateLimit({ windowMs: 60_000, max: 30 });
const createLimiter = rateLimit({ windowMs: 60_000, max: 20 });

// Express 4 doesn't catch errors thrown from async handlers — wrap them
// so DB failures reach the error middleware instead of hanging.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

app.post('/api/events', createLimiter, ah(async (req, res) => {
  const { errors, event } = validateEventInput(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  let publicId = newPublicId();
  // Collisions are ~impossible, but retry rather than erroring.
  for (let i = 0; i < 5 && await db.getEventByPublicId(publicId); i++) publicId = newPublicId();
  const manageToken = newManageToken();
  await db.createEvent({ ...event, public_id: publicId, manage_token: manageToken });
  res.status(201).json({
    public_id: publicId,
    manage_token: manageToken,
    invite_url: `${BASE_URL}/e/${publicId}`,
    manage_url: `${BASE_URL}/manage/${manageToken}`,
  });
}));

// Public event payload: counts included, but no RSVP rows and no manage token.
app.get('/api/events/:publicId', ah(async (req, res) => {
  if (!PUBLIC_ID_RE.test(req.params.publicId)) return res.status(404).json({ error: 'Event not found' });
  const event = await db.getEventByPublicId(req.params.publicId);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json({ event, counts: await db.getStats(event.id) });
}));

const loadManaged = ah(async (req, res, next) => {
  if (!TOKEN_RE.test(req.params.token)) return res.status(404).json({ error: 'Not found' });
  const found = await db.getEventByToken(req.params.token);
  if (!found) return res.status(404).json({ error: 'Not found' });
  req.managed = found; // { dbRow, event }
  next();
});

app.get('/api/manage/:token', loadManaged, ah(async (req, res) => {
  const { event, dbRow } = req.managed;
  res.json({
    event,
    rsvps: await db.getRsvps(dbRow.id),
    stats: await db.getStats(dbRow.id),
    invite_url: `${BASE_URL}/e/${event.public_id}`,
  });
}));

app.patch('/api/manage/:token', loadManaged, ah(async (req, res) => {
  const { errors, event } = validateEventInput(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  await db.updateEvent(req.managed.dbRow.id, event);
  res.json({ event: await db.getEventByPublicId(req.managed.event.public_id) });
}));

app.post('/api/events/:publicId/rsvp', rsvpLimiter, ah(async (req, res) => {
  if (!PUBLIC_ID_RE.test(req.params.publicId)) return res.status(404).json({ error: 'Event not found' });
  const event = await db.getEventByPublicId(req.params.publicId);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const body = req.body || {};
  const name = str(body.name, 80);
  const status = str(body.status, 10);
  const errors = [];
  if (!name) errors.push('name is required');
  if (!['yes', 'no', 'maybe'].includes(status)) errors.push("status must be 'yes', 'no' or 'maybe'");
  let guests = parseInt(body.guests, 10);
  if (Number.isNaN(guests)) guests = 1;
  if (!Number.isInteger(guests) || guests < 1 || guests > 20) errors.push('guests must be between 1 and 20');
  if (!event.plus_ones_allowed) guests = 1; // host disabled plus-ones
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  const rsvp = await db.upsertRsvp({
    event_id: event.id,
    name,
    contact: str(body.contact, 120),
    status,
    guests,
    message: str(body.message, 500),
  });
  res.status(201).json({ rsvp, counts: await db.getStats(event.id) });
}));

app.delete('/api/manage/:token/rsvps/:id', loadManaged, ah(async (req, res) => {
  const rsvpId = parseInt(req.params.id, 10);
  if (!Number.isInteger(rsvpId)) return res.status(400).json({ error: 'Invalid RSVP id' });
  if (!await db.deleteRsvp(req.managed.dbRow.id, rsvpId)) {
    return res.status(404).json({ error: 'RSVP not found' });
  }
  res.status(204).end();
}));

function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

app.get('/api/manage/:token/export.csv', loadManaged, ah(async (req, res) => {
  const { event, dbRow } = req.managed;
  const rows = await db.getRsvps(dbRow.id);
  const lines = ['Name,Contact,Status,Guests,Message,Responded at'];
  for (const r of rows) {
    lines.push([r.name, r.contact, r.status, r.guests, r.message, r.created_at].map(csvCell).join(','));
  }
  const filename = `${event.public_id}-rsvps.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + lines.join('\r\n'));
}));

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const sendPage = (res, file, status = 200) =>
  res.status(status).sendFile(path.join(PUBLIC_DIR, file));

app.get('/', (req, res) => sendPage(res, 'index.html'));
app.get('/create', (req, res) => sendPage(res, 'create.html'));

// Validate the id/token server-side before serving the shell page,
// so unknown links get a real 404 instead of a broken app shell.
app.get('/e/:publicId', ah(async (req, res) => {
  if (!PUBLIC_ID_RE.test(req.params.publicId) || !await db.getEventByPublicId(req.params.publicId)) {
    return sendPage(res, '404.html', 404);
  }
  sendPage(res, 'invite.html');
}));

app.get('/manage/:token', ah(async (req, res) => {
  if (!TOKEN_RE.test(req.params.token) || !await db.getEventByToken(req.params.token)) {
    return sendPage(res, '404.html', 404);
  }
  sendPage(res, 'manage.html');
}));

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// JSON 404 for unknown API routes; pretty page otherwise.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  sendPage(res, '404.html', 404);
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Something went wrong' });
  res.status(500).send('Something went wrong');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🎉 Party invites running at ${BASE_URL}`);
  });
}

module.exports = app;
