'use strict';
/* Creator editor: form state, live preview, publish / save. */
(function () {
  const { THEME_PRESETS, FONT_PAIRINGS, buildInviteCard, api, copyText, toast, safeHttpUrl } = window.Evite;

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const manageToken = params.get('manage');
  const presetParam = params.get('preset');

  // ---- theme state ----
  const startPreset = (presetParam && THEME_PRESETS[presetParam]) ? presetParam : 'midnight-gala';
  let theme = { preset: startPreset, ...THEME_PRESETS[startPreset] };
  // strip label/swatch/dark (client-only keys) so the payload stays clean
  const cleanTheme = (t) => ({
    preset: t.preset, primary: t.primary, accent: t.accent, background: t.background,
    fontPairing: t.fontPairing, bgStyle: t.bgStyle, layout: t.layout,
  });

  // ---- build preset picker ----
  const presetGrid = $('preset-grid');
  const presetBtns = {};
  Object.entries(THEME_PRESETS).forEach(([key, t]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    b.setAttribute('aria-pressed', key === theme.preset ? 'true' : 'false');
    const sw = document.createElement('div');
    sw.className = 'preset-swatch';
    sw.style.background = t.swatch;
    const nm = document.createElement('span');
    nm.className = 'preset-name';
    nm.textContent = t.label;
    b.append(sw, nm);
    b.addEventListener('click', () => {
      theme = { preset: key, ...THEME_PRESETS[key] };
      syncThemeControls();
      renderPreview();
    });
    presetGrid.append(b);
    presetBtns[key] = b;
  });

  // ---- font pairing select ----
  const fontSel = $('f-fonts');
  Object.entries(FONT_PAIRINGS).forEach(([key, f]) => {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = f.label;
    fontSel.append(o);
  });

  function syncThemeControls() {
    Object.entries(presetBtns).forEach(([key, b]) =>
      b.setAttribute('aria-pressed', key === theme.preset ? 'true' : 'false'));
    $('c-primary').value = theme.primary;
    $('c-accent').value = theme.accent;
    $('c-bg').value = theme.background;
    fontSel.value = theme.fontPairing;
    $('f-bgstyle').value = theme.bgStyle;
    $('f-layout').value = theme.layout;
  }

  // Any custom tweak detaches from the preset (becomes "custom").
  const markCustom = () => {
    theme.preset = 'custom';
    Object.entries(presetBtns).forEach(([, b]) => b.setAttribute('aria-pressed', 'false'));
  };
  $('c-primary').addEventListener('input', (e) => { theme.primary = e.target.value; markCustom(); renderPreview(); });
  $('c-accent').addEventListener('input', (e) => { theme.accent = e.target.value; markCustom(); renderPreview(); });
  $('c-bg').addEventListener('input', (e) => { theme.background = e.target.value; markCustom(); renderPreview(); });
  fontSel.addEventListener('change', (e) => { theme.fontPairing = e.target.value; markCustom(); renderPreview(); });
  $('f-bgstyle').addEventListener('change', (e) => { theme.bgStyle = e.target.value; markCustom(); renderPreview(); });
  $('f-layout').addEventListener('change', (e) => { theme.layout = e.target.value; markCustom(); renderPreview(); });

  // ---- gather form data ----
  function collect() {
    return {
      title: $('f-title').value.trim(),
      host_name: $('f-host').value.trim(),
      event_type: $('f-type').value,
      starts_at: $('f-when').value ? new Date($('f-when').value).toISOString() : '',
      venue: $('f-venue').value.trim(),
      address: $('f-address').value.trim(),
      description: $('f-desc').value.trim(),
      cover_image_url: safeHttpUrl($('f-cover').value.trim()),
      theme: cleanTheme(theme),
      plus_ones_allowed: $('f-plusones').checked,
    };
  }

  // ---- live preview ----
  const slot = $('preview-slot');
  function renderPreview() {
    const data = collect();
    slot.replaceChildren();
    const card = buildInviteCard(data);
    const inner = document.createElement('div');
    inner.className = 'invite-inner';
    inner.append(card);
    slot.append(inner);
  }
  ['f-title', 'f-host', 'f-type', 'f-when', 'f-venue', 'f-address', 'f-desc', 'f-cover']
    .forEach((id) => $(id).addEventListener('input', renderPreview));

  // ---- manage mode: prefill from existing event ----
  async function loadForEdit() {
    try {
      const { event } = await api(`/api/manage/${manageToken}`);
      $('editor-title').textContent = 'Edit your invitation';
      $('f-title').value = event.title || '';
      $('f-host').value = event.host_name || '';
      $('f-type').value = event.event_type || '';
      if (event.starts_at) {
        const d = new Date(event.starts_at);
        const pad = (n) => String(n).padStart(2, '0');
        $('f-when').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
      $('f-venue').value = event.venue || '';
      $('f-address').value = event.address || '';
      $('f-desc').value = event.description || '';
      $('f-cover').value = event.cover_image_url || '';
      $('f-plusones').checked = !!event.plus_ones_allowed;
      if (event.theme && event.theme.primary) {
        theme = { preset: 'custom', ...event.theme };
      }
      $('publish-btn').textContent = '💾 Save changes';
      syncThemeControls();
      renderPreview();
    } catch (err) {
      toast('Could not load this event — the manage link may be invalid.');
    }
  }

  // ---- publish / save ----
  $('publish-btn').addEventListener('click', async () => {
    const data = collect();
    if (!data.title) {
      toast('Give your party a title first ✨');
      $('f-title').focus();
      return;
    }
    const btn = $('publish-btn');
    btn.disabled = true;
    try {
      if (manageToken) {
        await api(`/api/manage/${manageToken}`, { method: 'PATCH', body: JSON.stringify(data) });
        $('save-state').textContent = 'Saved ✓';
        toast('Changes saved!');
        setTimeout(() => { location.href = `/manage/${manageToken}`; }, 700);
      } else {
        const res = await api('/api/events', { method: 'POST', body: JSON.stringify(data) });
        showSuccess(res);
      }
    } catch (err) {
      toast(err.message || 'Something went wrong');
    } finally {
      btn.disabled = false;
    }
  });

  function showSuccess(res) {
    $('editor-grid').hidden = true;
    $('publish-bar').hidden = true;
    const view = $('success-view');
    view.hidden = false;
    $('invite-link').textContent = res.invite_url;
    $('manage-link').textContent = res.manage_url;
    $('open-manage').href = res.manage_url;
    $('view-invite').href = res.invite_url;
    $('wa-share').addEventListener('click', () => {
      const text = encodeURIComponent(`You're invited! 🎉 ${res.invite_url}`);
      window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
    });
    view.scrollIntoView({ behavior: 'smooth' });
  }

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await copyText($(btn.dataset.copy).textContent);
      toast(ok ? 'Copied to clipboard!' : 'Copy failed — long-press to copy');
    });
  });

  // ---- init ----
  syncThemeControls();
  renderPreview();
  if (manageToken) loadForEdit();
})();
