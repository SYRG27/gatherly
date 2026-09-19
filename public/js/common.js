/* Shared helpers: theme presets, theme application, formatting.
   All user content is inserted via textContent — never innerHTML. */
'use strict';

/* Must stay in sync with the server's allowlist (src/server.js). */
const THEME_PRESETS = {
  'midnight-gala':    { label: 'Midnight Gala',    primary: '#0f1035', accent: '#d4af37', background: '#1a1b4b', fontPairing: 'gala',     bgStyle: 'gradient', layout: 'centered',
                        swatch: 'linear-gradient(135deg,#0f1035,#d4af37)', dark: true },
  'blush-garden':     { label: 'Blush Garden',     primary: '#b76e79', accent: '#7d8c6f', background: '#fdf3f0', fontPairing: 'romantic', bgStyle: 'pattern',  layout: 'centered',
                        swatch: 'linear-gradient(135deg,#f9dcc4,#b76e79)', dark: false },
  'neon-night':       { label: 'Neon Night',       primary: '#ff2fb3', accent: '#22d3ee', background: '#0b0b14', fontPairing: 'modern',   bgStyle: 'gradient', layout: 'centered',
                        swatch: 'linear-gradient(135deg,#0b0b14,#ff2fb3)', dark: true },
  'golden-hour':      { label: 'Golden Hour',      primary: '#c2410c', accent: '#f59e0b', background: '#fff7ed', fontPairing: 'festive',  bgStyle: 'gradient', layout: 'classic',
                        swatch: 'linear-gradient(135deg,#fdba74,#c2410c)', dark: false },
  'minimal-mono':     { label: 'Minimal Mono',     primary: '#111111', accent: '#6b7280', background: '#fafafa', fontPairing: 'minimal',  bgStyle: 'solid',    layout: 'classic',
                        swatch: 'linear-gradient(135deg,#fafafa,#d4d4d4)', dark: false },
  'vintage-postcard': { label: 'Vintage Postcard', primary: '#9a3412', accent: '#b45309', background: '#faf3e3', fontPairing: 'festive',  bgStyle: 'pattern',  layout: 'classic',
                        swatch: 'linear-gradient(135deg,#faf3e3,#d6a35c)', dark: false },
};

const FONT_PAIRINGS = {
  gala:     { label: 'Gala — Playfair Display + Inter',        heading: "'Playfair Display','Georgia',serif",      body: "'Inter',system-ui,sans-serif" },
  romantic: { label: 'Romantic — Cormorant + Inter',           heading: "'Cormorant Garamond','Georgia',serif",    body: "'Inter',system-ui,sans-serif" },
  modern:   { label: 'Modern — Space Grotesk + Inter',         heading: "'Space Grotesk',system-ui,sans-serif",    body: "'Inter',system-ui,sans-serif" },
  festive:  { label: 'Festive — DM Serif + Inter',             heading: "'DM Serif Display','Georgia',serif",      body: "'Inter',system-ui,sans-serif" },
  playful:  { label: 'Playful — Great Vibes + Inter',          heading: "'Great Vibes',cursive",                   body: "'Inter',system-ui,sans-serif" },
  minimal:  { label: 'Minimal — Inter throughout',             heading: "'Inter',system-ui,sans-serif",            body: "'Inter',system-ui,sans-serif" },
};

function luminance(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function shade(hex, amt) {
  // amt: -1..1 — darken/lighten a hex color.
  const c = hex.replace('#', '');
  const f = (i) => {
    const v = parseInt(c.slice(i, i + 2), 16);
    const n = Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
    return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(2)}${f(4)}`;
}

function safeHttpUrl(s) {
  if (typeof s !== 'string' || !s) return '';
  try {
    const u = new URL(s);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
  } catch { return ''; }
}

/* Apply a (server-validated) theme to a page/card element via CSS vars. */
function applyTheme(el, theme, coverUrl) {
  const t = { ...THEME_PRESETS['midnight-gala'], ...(theme || {}) };
  const fonts = FONT_PAIRINGS[t.fontPairing] || FONT_PAIRINGS.gala;
  const dark = luminance(t.background) < 0.45;
  const ink = dark ? '#ffffff' : '#1c1a22';
  const inkSoft = dark ? 'rgba(255,255,255,0.72)' : '#55525e';

  let cardBg = t.background;
  if (t.bgStyle === 'gradient') {
    cardBg = `linear-gradient(155deg, ${shade(t.background, dark ? 0.12 : -0.04)} 0%, ${t.background} 55%, ${shade(t.primary, dark ? 0.25 : -0.25)} 130%)`;
  } else if (t.bgStyle === 'pattern') {
    const dot = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)';
    cardBg = `${t.background}`;
    el.style.setProperty('--t-pattern',
      `radial-gradient(circle at 1px 1px, ${dot} 1.6px, transparent 1.7px)`);
    el.style.setProperty('--t-pattern-size', '26px 26px');
  } else if (t.bgStyle === 'image' && safeHttpUrl(coverUrl)) {
    cardBg = `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url("${safeHttpUrl(coverUrl)}") center/cover`;
  }
  if (t.bgStyle === 'pattern') {
    el.style.backgroundImage = 'var(--t-pattern)';
    el.style.backgroundSize = 'var(--t-pattern-size)';
    el.style.backgroundColor = t.background;
  } else {
    el.style.backgroundImage = '';
    el.style.backgroundSize = '';
    el.style.backgroundColor = '';
    el.style.background = cardBg;
  }

  el.style.setProperty('--t-primary', t.primary);
  el.style.setProperty('--t-accent', t.accent);
  el.style.setProperty('--t-bg', t.background);
  el.style.setProperty('--t-card-bg', cardBg);
  el.style.setProperty('--t-ink', ink);
  el.style.setProperty('--t-ink-soft', inkSoft);
  el.style.setProperty('--t-heading-font', fonts.heading);
  el.style.setProperty('--t-body-font', fonts.body);
  el.style.setProperty('--t-align', t.layout === 'classic' ? 'left' : 'center');
  el.classList.toggle('layout-classic', t.layout === 'classic');
}

/* Build the invite card DOM (title, meta, description, countdown shell).
   Returns the card element; caller fills in countdown separately. */
function buildInviteCard(event) {
  const card = document.createElement('article');
  card.className = 'invite-card';

  const coverUrl = safeHttpUrl(event.cover_image_url);
  const useImageBg = event.theme && event.theme.bgStyle === 'image' && coverUrl;

  if (coverUrl && !useImageBg) {
    const cover = document.createElement('div');
    cover.className = 'invite-cover';
    const img = document.createElement('img');
    img.src = coverUrl;
    img.alt = '';
    img.loading = 'lazy';
    const shadeEl = document.createElement('div');
    shadeEl.className = 'cover-shade';
    cover.append(img, shadeEl);
    if (event.event_type) {
      const cap = document.createElement('div');
      cap.className = 'cover-caption';
      cap.textContent = event.event_type;
      cover.append(cap);
    }
    card.append(cover);
  }

  const body = document.createElement('div');
  body.className = 'invite-body';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'invite-eyebrow';
  const bits = [];
  if (event.event_type) bits.push(event.event_type);
  if (event.host_name) bits.push(event.host_name + "'s celebration");
  eyebrow.textContent = bits.join('  ·  ') || 'You are invited';
  body.append(eyebrow);

  const title = document.createElement('h1');
  title.className = 'invite-title';
  title.textContent = event.title || 'Untitled party';
  body.append(title);

  const meta = document.createElement('div');
  meta.className = 'invite-meta';
  const addLine = (icon, text) => {
    if (!text) return;
    const line = document.createElement('div');
    line.className = 'meta-line';
    const ic = document.createElement('span');
    ic.className = 'm-icon';
    ic.textContent = icon;
    const tx = document.createElement('span');
    tx.textContent = text;
    line.append(ic, tx);
    meta.append(line);
  };
  if (event.starts_at && !Number.isNaN(Date.parse(event.starts_at))) {
    addLine('📅', fmtDateTime(event.starts_at));
  }
  if (event.venue) addLine('📍', event.venue + (event.address ? ' — ' + event.address : ''));
  else if (event.address) addLine('📍', event.address);
  body.append(meta);

  if (event.description) {
    const desc = document.createElement('p');
    desc.className = 'invite-desc';
    desc.textContent = event.description;
    body.append(desc);
  }

  card.append(body);
  applyTheme(card, event.theme, event.cover_image_url);
  return card;
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

function gcalUrl(event) {
  const start = new Date(event.starts_at);
  if (Number.isNaN(start.getTime())) return '';
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  const f = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title || 'Party',
    dates: `${f(start)}/${f(end)}`,
    details: `RSVP: ${location.origin}/e/${event.public_id}`,
    location: [event.venue, event.address].filter(Boolean).join(', '),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

let toastTimer;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// Expose to page scripts (plain scripts, no modules — keep CSP simple).
window.Evite = {
  THEME_PRESETS, FONT_PAIRINGS, applyTheme, buildInviteCard,
  fmtDateTime, gcalUrl, safeHttpUrl, api, copyText, toast,
};
