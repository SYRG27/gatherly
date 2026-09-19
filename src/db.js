// Database layer: libSQL via @libsql/client.
// - Production (free hosting): Turso Cloud — set TURSO_DATABASE_URL and
//   TURSO_AUTH_TOKEN. SQLite-compatible, generous free tier, no local disk needed.
// - Local dev / tests: falls back to a local SQLite file (DATA_DIR/evite.db).
// All queries are parameterized — never string interpolation.
'use strict';

const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

let url;
let authToken;
if (TURSO_URL) {
  url = TURSO_URL;
  authToken = TURSO_TOKEN;
} else {
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  url = 'file:' + path.join(DATA_DIR, 'evite.db');
}

const client = createClient({ url, authToken });

const SCHEMA = `
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvp_identity
  ON rsvps (event_id, lower(name), lower(contact));
CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps (event_id);
CREATE INDEX IF NOT EXISTS idx_events_public ON events (public_id);
CREATE INDEX IF NOT EXISTS idx_events_token ON events (manage_token);
`;

let ready = null;
function ensureReady() {
  if (!ready) {
    ready = client.executeMultiple(SCHEMA).catch((err) => {
      ready = null; // let the next call retry
      throw err;
    });
  }
  return ready;
}

async function exec(sql, args) {
  await ensureReady();
  return client.execute({ sql, args });
}

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

const SQL_GET_BY_PUBLIC = 'SELECT * FROM events WHERE public_id = :public_id';
const SQL_GET_BY_TOKEN = 'SELECT * FROM events WHERE manage_token = :manage_token';
const SQL_INSERT_EVENT = `
  INSERT INTO events (public_id, manage_token, title, host_name, event_type, starts_at,
    venue, address, description, cover_image_url, theme_json, plus_ones_allowed,
    created_at, updated_at)
  VALUES (:public_id, :manage_token, :title, :host_name, :event_type, :starts_at,
    :venue, :address, :description, :cover_image_url, :theme_json, :plus_ones_allowed,
    :created_at, :updated_at)
`;
const SQL_UPDATE_EVENT = `
  UPDATE events SET title=:title, host_name=:host_name, event_type=:event_type,
    starts_at=:starts_at, venue=:venue, address=:address, description=:description,
    cover_image_url=:cover_image_url, theme_json=:theme_json,
    plus_ones_allowed=:plus_ones_allowed, updated_at=:updated_at
  WHERE id=:id
`;
const SQL_RSVPS_FOR_EVENT = `
  SELECT id, name, contact, status, guests, message, created_at, updated_at
  FROM rsvps WHERE event_id = :event_id ORDER BY created_at ASC
`;
const SQL_UPSERT_RSVP = `
  INSERT INTO rsvps (event_id, name, contact, status, guests, message, created_at, updated_at)
  VALUES (:event_id, :name, :contact, :status, :guests, :message, :created_at, :updated_at)
  ON CONFLICT (event_id, lower(name), lower(contact))
  DO UPDATE SET status=excluded.status, guests=excluded.guests,
    message=excluded.message, updated_at=excluded.updated_at
`;
const SQL_GET_RSVP = `
  SELECT id, name, contact, status, guests, message FROM rsvps
  WHERE event_id = :event_id AND lower(name) = lower(:name) AND lower(contact) = lower(:contact)
`;
const SQL_DELETE_RSVP = 'DELETE FROM rsvps WHERE id = :id AND event_id = :event_id';
const SQL_STATS = `
  SELECT
    SUM(CASE WHEN status='yes'   THEN 1 ELSE 0 END) AS yes,
    SUM(CASE WHEN status='no'    THEN 1 ELSE 0 END) AS no,
    SUM(CASE WHEN status='maybe' THEN 1 ELSE 0 END) AS maybe,
    COALESCE(SUM(CASE WHEN status='yes' THEN guests ELSE 0 END), 0) AS total_guests,
    COUNT(*) AS total_rsvps
  FROM rsvps WHERE event_id = :event_id
`;

module.exports = {
  getEventByPublicId: async (publicId) => {
    const r = await exec(SQL_GET_BY_PUBLIC, { public_id: publicId });
    return rowToEvent(r.rows[0]);
  },
  getEventByToken: async (token) => {
    const r = await exec(SQL_GET_BY_TOKEN, { manage_token: token });
    const row = r.rows[0];
    return row ? { dbRow: row, event: rowToEvent(row) } : null;
  },
  createEvent: async (e) => {
    const r = await exec(SQL_INSERT_EVENT, { ...e, created_at: now(), updated_at: now() });
    return Number(r.lastInsertRowid);
  },
  updateEvent: async (id, e) => {
    await exec(SQL_UPDATE_EVENT, { ...e, id, updated_at: now() });
  },
  getRsvps: async (eventId) => {
    const r = await exec(SQL_RSVPS_FOR_EVENT, { event_id: eventId });
    return r.rows;
  },
  upsertRsvp: async (r) => {
    const ts = now();
    await exec(SQL_UPSERT_RSVP, { ...r, created_at: ts, updated_at: ts });
    const got = await exec(SQL_GET_RSVP, {
      event_id: r.event_id, name: r.name, contact: r.contact,
    });
    return got.rows[0];
  },
  deleteRsvp: async (eventId, rsvpId) => {
    const r = await exec(SQL_DELETE_RSVP, { id: rsvpId, event_id: eventId });
    return r.rowsAffected > 0;
  },
  getStats: async (eventId) => {
    const r = await exec(SQL_STATS, { event_id: eventId });
    const s = r.rows[0] || {};
    return {
      yes: s.yes || 0,
      no: s.no || 0,
      maybe: s.maybe || 0,
      total_guests: s.total_guests || 0,
      total_rsvps: s.total_rsvps || 0,
    };
  },
};
