// Database layer: SQLite via better-sqlite3, WAL mode for safe concurrent reads.
// All queries use prepared statements (parameterized) — never string interpolation.
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'evite.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id        TEXT NOT NULL UNIQUE,
  manage_token     TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  host_name        TEXT NOT NULL DEFAULT '',
  event_type       TEXT NOT NULL DEFAULT '',
  starts_at        TEXT NOT NULL DEFAULT '',
  venue            TEXT NOT NULL DEFAULT '',
  address          TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  cover_image_url  TEXT NOT NULL DEFAULT '',
  theme_json       TEXT NOT NULL DEFAULT '{}',
  plus_ones_allowed INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rsvps (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  contact    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL CHECK (status IN ('yes','no','maybe')),
  guests     INTEGER NOT NULL DEFAULT 1 CHECK (guests BETWEEN 1 AND 20),
  message    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

// SQLite has no functional unique index on expressions inline above via
// column list, so create it explicitly for case-insensitive upsert matching.
db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvp_identity
  ON rsvps (event_id, lower(name), lower(contact));
CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps (event_id);
CREATE INDEX IF NOT EXISTS idx_events_public ON events (public_id);
CREATE INDEX IF NOT EXISTS idx_events_token ON events (manage_token);
`);

const now = () => new Date().toISOString();

function rowToEvent(row) {
  if (!row) return null;
  let theme = {};
  try { theme = JSON.parse(row.theme_json || '{}'); } catch { theme = {}; }
  return {
    id: row.id,
    public_id: row.public_id,
    title: row.title,
    host_name: row.host_name,
    event_type: row.event_type,
    starts_at: row.starts_at,
    venue: row.venue,
    address: row.address,
    description: row.description,
    cover_image_url: row.cover_image_url,
    theme,
    plus_ones_allowed: !!row.plus_ones_allowed,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const stmtGetByPublicId = db.prepare('SELECT * FROM events WHERE public_id = ?');
const stmtGetByToken = db.prepare('SELECT * FROM events WHERE manage_token = ?');
const stmtInsertEvent = db.prepare(`
  INSERT INTO events (public_id, manage_token, title, host_name, event_type, starts_at,
    venue, address, description, cover_image_url, theme_json, plus_ones_allowed,
    created_at, updated_at)
  VALUES (@public_id, @manage_token, @title, @host_name, @event_type, @starts_at,
    @venue, @address, @description, @cover_image_url, @theme_json, @plus_ones_allowed,
    @created_at, @updated_at)
`);
const stmtUpdateEvent = db.prepare(`
  UPDATE events SET title=@title, host_name=@host_name, event_type=@event_type,
    starts_at=@starts_at, venue=@venue, address=@address, description=@description,
    cover_image_url=@cover_image_url, theme_json=@theme_json,
    plus_ones_allowed=@plus_ones_allowed, updated_at=@updated_at
  WHERE id=@id
`);
const stmtRsvpsForEvent = db.prepare(
  'SELECT id, name, contact, status, guests, message, created_at, updated_at FROM rsvps WHERE event_id = ? ORDER BY created_at ASC'
);
const stmtUpsertRsvp = db.prepare(`
  INSERT INTO rsvps (event_id, name, contact, status, guests, message, created_at, updated_at)
  VALUES (@event_id, @name, @contact, @status, @guests, @message, @created_at, @updated_at)
  ON CONFLICT (event_id, lower(name), lower(contact))
  DO UPDATE SET status=excluded.status, guests=excluded.guests,
    message=excluded.message, updated_at=excluded.updated_at
`);
const stmtGetRsvp = db.prepare(
  'SELECT id, name, contact, status, guests, message FROM rsvps WHERE event_id = ? AND lower(name) = lower(?) AND lower(contact) = lower(?)'
);
const stmtDeleteRsvp = db.prepare('DELETE FROM rsvps WHERE id = ? AND event_id = ?');
const stmtStats = db.prepare(`
  SELECT
    SUM(CASE WHEN status='yes'   THEN 1 ELSE 0 END) AS yes,
    SUM(CASE WHEN status='no'    THEN 1 ELSE 0 END) AS no,
    SUM(CASE WHEN status='maybe' THEN 1 ELSE 0 END) AS maybe,
    COALESCE(SUM(CASE WHEN status='yes' THEN guests ELSE 0 END), 0) AS total_guests,
    COUNT(*) AS total_rsvps
  FROM rsvps WHERE event_id = ?
`);

module.exports = {
  getEventByPublicId: (publicId) => rowToEvent(stmtGetByPublicId.get(publicId)),
  getEventByToken: (token) => {
    const row = stmtGetByToken.get(token);
    return row ? { dbRow: row, event: rowToEvent(row) } : null;
  },
  createEvent: (e) => {
    const info = stmtInsertEvent.run({ ...e, created_at: now(), updated_at: now() });
    return info.lastInsertRowid;
  },
  updateEvent: (id, e) => stmtUpdateEvent.run({ ...e, id, updated_at: now() }),
  getRsvps: (eventId) => stmtRsvpsForEvent.all(eventId),
  upsertRsvp: (r) => {
    stmtUpsertRsvp.run({ ...r, created_at: now(), updated_at: now() });
    return stmtGetRsvp.get(r.event_id, r.name, r.contact);
  },
  deleteRsvp: (eventId, rsvpId) => stmtDeleteRsvp.run(rsvpId, eventId).changes > 0,
  getStats: (eventId) => {
    const s = stmtStats.get(eventId);
    return {
      yes: s.yes || 0,
      no: s.no || 0,
      maybe: s.maybe || 0,
      total_guests: s.total_guests || 0,
      total_rsvps: s.total_rsvps || 0,
    };
  },
};
