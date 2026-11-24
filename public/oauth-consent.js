(() => {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return;

  const getFocusable = () => [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])')]
    .filter(element => element.getAttribute('aria-hidden') !== 'true' && element.offsetParent !== null);

  const focusFirst = () => getFocusable()[0]?.focus();
  window.requestAnimationFrame(focusFirst);

  const form = dialog.querySelector('form.consent-form');
  form?.addEventListener('submit', event => {
    const submitter = event.submitter || dialog.querySelector('button[name="intent"][value="continue"]');
    if (!submitter || submitter.value !== 'continue') return;
    if (form.dataset.submitting === 'true') {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    form.dataset.submitting = 'true';
    const intentField = document.createElement('input');
    intentField.type = 'hidden';
    intentField.name = 'intent';
    intentField.value = 'continue';
    form.appendChild(intentField);
    dialog.querySelectorAll('button').forEach(button => {
      button.disabled = true;
    });
    submitter.setAttribute('aria-busy', 'true');
    submitter.setAttribute('aria-disabled', 'true');
    submitter.textContent = 'Đang xử lý…';
    HTMLFormElement.prototype.submit.call(form);
  });

  document.addEventListener('keydown', event => {
    const focusable = getFocusable();
    if (event.key === 'Escape') {
      event.preventDefault();
      dialog.querySelector('button[name="intent"][value="cancel"]')?.click();
      return;
    }
    if (event.key !== 'Tab' || focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();
