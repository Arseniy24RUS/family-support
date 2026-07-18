let toastTimer;

export function refreshIcons() {
  if (!globalThis.lucide?.createIcons) return;
  globalThis.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
}

export function icon(name, className = '') {
  const element = document.createElement('i');
  element.dataset.lucide = name;
  element.setAttribute('aria-hidden', 'true');
  if (className) element.className = className;
  return element;
}

export function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  globalThis.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = globalThis.setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }
}

export function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function initModuleShell(page) {
  const year = document.querySelector('#current-year');
  if (year) year.textContent = String(new Date().getFullYear());

  for (const link of document.querySelectorAll('[data-platform-page]')) {
    const active = link.dataset.platformPage === page;
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  const header = document.querySelector('#site-header');
  globalThis.addEventListener('scroll', () => {
    header?.classList.toggle('is-scrolled', globalThis.scrollY > 8);
  }, { passive: true });

  refreshIcons();
}
