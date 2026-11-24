(() => {
  const copyButtons = [...document.querySelectorAll('[data-copy]')];
  const sidebarLinks = [...document.querySelectorAll('.docs-sidebar a[href^="#"]')];
  const sections = sidebarLinks
    .map(link => document.getElementById(link.getAttribute('href').slice(1)))
    .filter(Boolean);

  function announce(message) {
    let live = document.querySelector('[data-docs-live]');
    if (!live) {
      live = document.createElement('div');
      live.dataset.docsLive = 'true';
      live.className = 'visually-hidden';
      live.setAttribute('role', 'status');
      live.setAttribute('aria-live', 'polite');
      document.body.appendChild(live);
    }
    live.textContent = message;
  }

  async function copy(value, button) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement('textarea');
        input.value = value;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        if (!document.execCommand('copy')) throw new Error('Không thể truy cập bộ nhớ tạm.');
        input.remove();
      }
      const original = button.textContent;
      button.textContent = 'Đã chép';
      button.classList.add('copied');
      announce('Đã sao chép nội dung');
      window.setTimeout(() => {
        if (!button.isConnected) return;
        button.textContent = original;
        button.classList.remove('copied');
      }, 1500);
    } catch {
      announce('Không thể sao chép tự động; hãy sao chép thủ công.');
    }
  }

  copyButtons.forEach(button => {
    button.addEventListener('click', () => copy(button.dataset.copy || '', button));
  });

  function setActive(id) {
    sidebarLinks.forEach(link => {
      const active = link.getAttribute('href') === `#${id}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  if ('IntersectionObserver' in window && sections.length) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: '-92px 0px -62% 0px', threshold: [0.1, 0.35, 0.7] });
    sections.forEach(section => observer.observe(section));
  }

  setActive((location.hash || '#overview').slice(1));
})();
