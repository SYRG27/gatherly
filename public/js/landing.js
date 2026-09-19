'use strict';
/* Landing page: render the theme preset cards. */
(function () {
  const grid = document.getElementById('theme-grid');
  const { THEME_PRESETS } = window.Evite;
  Object.entries(THEME_PRESETS).forEach(([key, t]) => {
    const a = document.createElement('a');
    a.className = 'theme-card';
    a.href = `/create?preset=${encodeURIComponent(key)}`;

    const sw = document.createElement('div');
    sw.className = 'theme-swatch';
    sw.style.background = t.swatch;
    const st = document.createElement('div');
    st.className = 'swatch-title';
    st.textContent = t.label;
    st.style.color = t.dark ? '#fff' : '#1c1a22';
    sw.append(st);

    const meta = document.createElement('div');
    meta.className = 'theme-meta';
    const name = document.createElement('strong');
    name.textContent = t.label;
    const go = document.createElement('span');
    go.textContent = 'Use this theme →';
    meta.append(name, go);

    a.append(sw, meta);
    grid.append(a);
  });
})();
