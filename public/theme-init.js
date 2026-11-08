// Applies the saved theme before the first paint, so dark-mode users never see
// a white flash while settings load. Loaded as a classic, render-blocking
// script from the extension package (no inline code, allowed by the CSP).
(function () {
  try {
    var theme = localStorage.getItem('unique-pdf:theme') || 'system';
    var dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch {
    /* storage unavailable: the app applies the theme once settings load */
  }
})();
