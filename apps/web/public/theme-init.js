(function () {
  try {
    var t = localStorage.getItem('phoenix_theme');
    var resolved;
    if (t === 'dark') { resolved = 'dark'; }
    else if (t === 'light') { resolved = 'light'; }
    else { resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
    document.documentElement.setAttribute('data-theme', resolved);
    var logo = localStorage.getItem('phoenix_logo');
    if (logo) {
      var link = document.createElement('link');
      link.rel = 'icon';
      link.href = logo;
      document.head.appendChild(link);
    }
  } catch (e) {}
})();
