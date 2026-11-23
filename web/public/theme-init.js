(function () {
  try {
    var pref = localStorage.getItem('paris-subway-theme-pref') || 'system';
    var prefersDark =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = pref === 'light' || pref === 'dark' ? pref : prefersDark ? 'dark' : 'light';
    document.documentElement.dataset.theme = resolved;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  } catch {
    // ignore storage failure in restricted environments
  }

  function suppressNetlifyElements() {
    var sel =
      'script[src*="netlify/scripts/hud"], [data-netlify-site-id], [data-nf-variant], netlify-drawer, #netlify-drawer, .netlify-drawer, iframe[src*="netlify"]';
    document.querySelectorAll(sel).forEach(function (el) {
      el.remove();
    });
  }
  window.addEventListener('DOMContentLoaded', suppressNetlifyElements, { once: true });
  window.addEventListener('load', suppressNetlifyElements, { once: true });
})();
