/**
 * Tianditu: Auto-select 影像 (Satellite Imagery) mode
 * Clicks the imagery layer button once the map UI loads.
 */
(function () {
  'use strict';

  let attempts = 0;
  const MAX_ATTEMPTS = 30; /* 30 * 500ms = 15 seconds max wait */

  function selectImagery() {
    /* The layer switcher buttons contain text like 影像, 地图, 地形 */
    const buttons = document.querySelectorAll(
      '.mapTypeCard span, .maptype-item, .map-type-item, [class*="mapType"] span, .tdtBaseItem'
    );

    for (const btn of buttons) {
      const text = (btn.textContent || btn.innerText || '').trim();
      if (text === '影像') {
        btn.click();
        console.log('[Tianditu] Switched to 影像 (Satellite) mode');
        return true;
      }
    }

    /* Fallback: look for any clickable element containing 影像 */
    const allEls = document.querySelectorAll('span, div, a, button, li');
    for (const el of allEls) {
      if (el.children.length === 0 && (el.textContent || '').trim() === '影像') {
        el.click();
        console.log('[Tianditu] Switched to 影像 (Satellite) mode (fallback)');
        return true;
      }
    }

    return false;
  }

  function trySelect() {
    if (selectImagery()) {
      return;
    }
    attempts++;
    if (attempts < MAX_ATTEMPTS) {
      setTimeout(trySelect, 500);
    }
  }

  /* Wait for DOM to be ready, then start trying */
  if (document.readyState === 'complete') {
    setTimeout(trySelect, 1000);
  } else {
    window.addEventListener('load', () => setTimeout(trySelect, 1000));
  }
})();
