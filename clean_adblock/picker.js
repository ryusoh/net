/**
 * Bypass: AdBlock Detector - Element Picker
 */

(function () {
  if (window.__bypassPickerActive) {
    return;
  }
  window.__bypassPickerActive = true;

  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    z-index: 2147483647;
    cursor: crosshair;
    background: rgba(0, 100, 255, 0.1);
    pointer-events: none;
  `;
  document.documentElement.appendChild(overlay);

  const highlight = document.createElement('div');
  highlight.style.cssText = `
    position: absolute;
    background: rgba(255, 0, 0, 0.3);
    border: 2px solid red;
    pointer-events: none;
    z-index: 2147483647;
    transition: all 0.1s ease;
  `;
  document.documentElement.appendChild(highlight);

  function handleMouseMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay || el === highlight) {
      return;
    }

    const rect = el.getBoundingClientRect();
    highlight.style.top = rect.top + window.scrollY + 'px';
    highlight.style.left = rect.left + window.scrollX + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
  }

  function handleClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay || el === highlight) {
      return;
    }

    const selector = generateSelector(el);
    if (confirm(`Hide this element permanently?\nSelector: ${selector}`)) {
      saveCustomSelector(selector);
      el.style.display = 'none';
    }
    cleanup();
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      cleanup();
    }
  }

  function generateSelector(el) {
    if (el.id) {
      return `#${CSS.escape(el.id)}`;
    }
    if (el.className && typeof el.className === 'string') {
      const cls = el.className.split(/\s+/)[0];
      if (cls) {
        return `.${CSS.escape(cls)}`;
      }
    }
    return el.tagName.toLowerCase();
  }

  function saveCustomSelector(selector) {
    const host = window.location.hostname;
    chrome.storage.local.get(['customSelectors'], (result) => {
      const selectors = result.customSelectors || {};
      if (!selectors[host]) {
        selectors[host] = [];
      }
      if (!selectors[host].includes(selector)) {
        selectors[host].push(selector);
        chrome.storage.local.set({ customSelectors: selectors });
      }
    });
  }

  function cleanup() {
    window.__bypassPickerActive = false;
    overlay.remove();
    highlight.remove();
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeydown);
  }

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeydown);

  alert('Element Picker active. Click an element to hide it, or press ESC to cancel.');
})();
