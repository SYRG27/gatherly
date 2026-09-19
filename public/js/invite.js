'use strict';
/* Public invite page: render event, countdown, RSVP form, share actions. */
(function () {
  const { buildInviteCard, api, copyText, toast, gcalUrl, fmtDateTime } = window.Evite;
  const publicId = location.pathname.split('/e/')[1]?.split('/')[0] || '';
  const page = document.getElementById('invite-page');
  const inner = document.getElementById('invite-inner');

  let event = null;
  let myStatus = null; // segmented control selection

  function startCountdown(targetIso, hostEl) {
    const target = new Date(targetIso).getTime();
    if (Number.isNaN(target)) return;
    const wrap = document.createElement('div');
    wrap.className = 'countdown';
    const cells = [['Days', 'd'], ['Hours', 'h'], ['Mins', 'm'], ['Secs', 's']]
      .map(([label]) => {
        const cell = document.createElement('div');
        cell.className = 'cd-cell';
        const b = document.createElement('b');
        b.textContent = '0';
        const s = document.createElement('span');
        s.textContent = label;
        cell.append(b, s);
        wrap.append(cell);
        return b;
      });
    const tick = () => {
      let diff = Math.max(0, target - Date.now());
      const d = Math.floor(diff / 86400000);
      const h = Math.floor(diff / 3600000) % 24;
      const m = Math.floor(diff / 60000) % 60;
      const s = Math.floor(diff / 1000) % 60;
      [d, h, m, s].forEach((v, i) => { cells[i].textContent = String(v).padStart(2, '0'); });
    };
    tick();
    const timer = setInterval(tick, 1000);
    hostEl.append(wrap);
    return () => clearInterval(timer);
  }

  function renderPage() {
    inner.replaceChildren();
    const card = buildInviteCard(event);
    inner.append(card);

    // countdown inside the card body (after description)
    if (event.starts_at && !Number.isNaN(Date.parse(event.starts_at))) {
      const body = card.querySelector('.invite-body');
      startCountdown(event.starts_at, body);
    }

    // "add to calendar" + headcount pill under the card
    const actions = document.createElement('div');
    actions.className = 'invite-actions';
    const cal = gcalUrl(event);
    if (cal) {
      const a = document.createElement('a');
      a.className = 'gcal-link';
      a.href = cal;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = '📅 Add to Google Calendar';
      actions.append(a);
    }
    inner.append(actions);

    renderRsvp();
    renderShare();

    const note = document.createElement('div');
    note.className = 'invite-footer-note';
    const made = document.createElement('span');
    made.textContent = 'Made with ';
    const link = document.createElement('a');
    link.href = '/';
    link.textContent = 'Gatherly';
    note.append(made, link);
    inner.append(note);
  }

  // ---------------- RSVP ----------------
  function renderRsvp(confirmData) {
    let wrap = document.getElementById('rsvp-wrap');
    if (wrap) wrap.remove();
    wrap = document.createElement('div');
    wrap.className = 'rsvp-wrap';
    wrap.id = 'rsvp-wrap';

    if (confirmData) {
      const c = document.createElement('div');
      c.className = 'rsvp-confirm';
      const emoji = document.createElement('div');
      emoji.className = 'big-emoji';
      emoji.textContent = confirmData.status === 'yes' ? '🎉' : confirmData.status === 'maybe' ? '🤔' : '💌';
      const h = document.createElement('h2');
      h.textContent = confirmData.status === 'yes' ? "You're in!" : confirmData.status === 'maybe' ? "You're a maybe!" : 'Thanks for letting us know!';
      const p = document.createElement('p');
      p.textContent = `RSVP recorded for ${confirmData.name}` +
        (confirmData.status === 'yes' && confirmData.guests > 1 ? ` (party of ${confirmData.guests})` : '') +
        '. Changed your mind? Update below.';
      const btn = document.createElement('button');
      btn.className = 'btn btn-soft';
      btn.textContent = 'Update my RSVP';
      btn.addEventListener('click', () => renderRsvp());
      c.append(emoji, h, p, btn);
      wrap.append(c);
    } else {
      wrap.append(buildRsvpForm());
    }
    inner.append(wrap);
  }

  function buildRsvpForm() {
    const card = document.createElement('div');
    card.className = 'rsvp-card';
    const h = document.createElement('h2');
    h.textContent = 'RSVP';
    const sub = document.createElement('p');
    sub.className = 'rsvp-sub';
    sub.textContent = 'Let the host know if you can make it.';
    card.append(h, sub);

    const form = document.createElement('form');
    form.noValidate = true;

    // name
    const nameField = document.createElement('div');
    nameField.className = 'field';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Your name *';
    nameLabel.htmlFor = 'rsvp-name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'rsvp-name';
    nameInput.maxLength = 80;
    nameInput.autocomplete = 'name';
    nameInput.placeholder = 'Jane Doe';
    nameField.append(nameLabel, nameInput);

    // contact
    const contactField = document.createElement('div');
    contactField.className = 'field';
    const contactLabel = document.createElement('label');
    contactLabel.textContent = 'Contact (optional)';
    contactLabel.htmlFor = 'rsvp-contact';
    const contactInput = document.createElement('input');
    contactInput.type = 'text';
    contactInput.id = 'rsvp-contact';
    contactInput.maxLength = 120;
    contactInput.placeholder = 'Phone or email — helps the host reach you';
    contactField.append(contactLabel, contactInput);

    // segmented status
    const segLabel = document.createElement('div');
    segLabel.className = 'field';
    const segTitle = document.createElement('label');
    segTitle.textContent = 'Can you make it? *';
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'RSVP response');
    const opts = [
      ['yes', '🎉', 'Joyfully accepts'],
      ['maybe', '🤔', 'Maybe'],
      ['no', '💌', 'Regretfully declines'],
    ];
    myStatus = null;
    const segBtns = opts.map(([val, emoji, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `seg-${val}`;
      b.setAttribute('aria-pressed', 'false');
      const e = document.createElement('span');
      e.className = 'emoji';
      e.textContent = emoji;
      const t = document.createElement('span');
      t.textContent = label;
      t.style.fontSize = '0.8rem';
      b.append(e, t);
      b.addEventListener('click', () => {
        myStatus = val;
        segBtns.forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
      });
      seg.append(b);
      return b;
    });
    segLabel.append(segTitle, seg);

    // party size stepper
    const guestField = document.createElement('div');
    guestField.className = 'field';
    let guests = 1;
    if (event.plus_ones_allowed) {
      const gLabel = document.createElement('label');
      gLabel.textContent = 'Party size (including you)';
      const stepper = document.createElement('div');
      stepper.className = 'stepper';
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.textContent = '−';
      minus.setAttribute('aria-label', 'Fewer guests');
      const out = document.createElement('output');
      out.textContent = '1';
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.textContent = '+';
      plus.setAttribute('aria-label', 'More guests');
      minus.addEventListener('click', () => { guests = Math.max(1, guests - 1); out.textContent = guests; });
      plus.addEventListener('click', () => { guests = Math.min(20, guests + 1); out.textContent = guests; });
      stepper.append(minus, out, plus);
      guestField.append(gLabel, stepper);
    }

    // message
    const msgField = document.createElement('div');
    msgField.className = 'field';
    const msgLabel = document.createElement('label');
    msgLabel.textContent = 'Message for the host (optional)';
    msgLabel.htmlFor = 'rsvp-msg';
    const msgInput = document.createElement('textarea');
    msgInput.id = 'rsvp-msg';
    msgInput.maxLength = 500;
    msgInput.placeholder = 'Song requests, dietary needs, or just some love…';
    msgField.append(msgLabel, msgInput);

    const err = document.createElement('p');
    err.className = 'form-error';

    const submit = document.createElement('button');
    submit.className = 'btn btn-primary';
    submit.type = 'submit';
    submit.style.width = '100%';
    submit.textContent = 'Send RSVP';

    form.append(nameField, contactField, segLabel);
    if (event.plus_ones_allowed) form.append(guestField);
    form.append(msgField, err, submit);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const name = nameInput.value.trim();
      if (!name) { err.textContent = 'Please tell us your name.'; nameInput.focus(); return; }
      if (!myStatus) { err.textContent = 'Please pick Yes, Maybe or No.'; return; }
      submit.disabled = true;
      try {
        const res = await api(`/api/events/${encodeURIComponent(publicId)}/rsvp`, {
          method: 'POST',
          body: JSON.stringify({
            name,
            contact: contactInput.value.trim(),
            status: myStatus,
            guests,
            message: msgInput.value.trim(),
          }),
        });
        renderRsvp(res.rsvp);
        toast('RSVP sent! 🎉');
      } catch (ex) {
        err.textContent = ex.message || 'Could not send RSVP.';
      } finally {
        submit.disabled = false;
      }
    });

    card.append(form);
    return card;
  }

  // ---------------- share ----------------
  function renderShare() {
    const box = document.createElement('div');
    box.className = 'invite-actions';
    const copy = document.createElement('button');
    copy.className = 'btn btn-ghost btn-sm';
    copy.textContent = '🔗 Copy invite link';
    copy.addEventListener('click', async () => {
      const ok = await copyText(location.href);
      toast(ok ? 'Link copied — send it to your crew!' : 'Copy failed — long-press the URL to copy');
    });
    const wa = document.createElement('button');
    wa.className = 'btn btn-ghost btn-sm';
    wa.textContent = '💬 Share on WhatsApp';
    wa.addEventListener('click', () => {
      const text = encodeURIComponent(`You're invited! 🎉 ${location.href}`);
      window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
    });
    box.append(copy, wa);
    inner.append(box);
  }

  // ---------------- boot ----------------
  (async function init() {
    try {
      const data = await api(`/api/events/${encodeURIComponent(publicId)}`);
      event = data.event;
      document.title = `${event.title} — You're invited!`;
      renderPage();
    } catch (err) {
      inner.replaceChildren();
      const p = document.createElement('p');
      p.style.cssText = 'text-align:center;padding:4rem 1rem;color:#fff';
      p.textContent = "Hmm, we couldn't find that invitation. The link may be wrong or the event was removed.";
      const a = document.createElement('a');
      a.href = '/';
      a.className = 'btn btn-ghost';
      a.textContent = 'Make your own invite';
      const c = document.createElement('div');
      c.style.textAlign = 'center';
      c.append(a);
      inner.append(p, c);
    }
  })();
})();
