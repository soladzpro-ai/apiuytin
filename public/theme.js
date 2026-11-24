(() => {
  const STORAGE_KEY = 'apiuytin_theme';

  function readTheme() {
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEY);
      return savedTheme === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  function updateThemeButtons(theme) {
    document.querySelectorAll('.theme-toggle').forEach(button => {
      button.setAttribute('aria-label', theme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối');
      button.setAttribute('title', theme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối');
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeButtons(theme);
  }

  function bindThemeButtons() {
    document.querySelectorAll('.theme-toggle').forEach(button => {
      if (button.dataset.themeToggleBound === 'true') return;
      button.dataset.themeToggleBound = 'true';
      button.addEventListener('click', () => {
        const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
        try { localStorage.setItem(STORAGE_KEY, nextTheme); } catch {}
      });
    });
  }

  try {
    applyTheme(readTheme());
  } catch {
    // Keep the server-rendered dark theme when storage is unavailable.
  }

  const initializeThemeControls = () => {
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    bindThemeButtons();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeThemeControls, { once: true });
  else initializeThemeControls();
})();
