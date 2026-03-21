/**
 * LinkedIn: Hide Promoted Cards (Merged from linkedin_fix/hide_promoted.js)
 * -------------------------------------------
 * Identifies and removes "Promoted" advertisement cards.
 * Always enabled - no toggle required.
 */

(function () {
  'use strict';

  function hidePromoted() {
    // 1. Target specific "Promoted" links and paragraphs
    const adSelectors = [
      'a[data-testid="header-url"][href*="/ads/start"]',
      'p.text-color-icon.text-xs.font-semibold',
      '.text-color-icon.font-semibold'
    ];

    adSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (el.textContent.trim() === 'Promoted') {
          // Find the outer card container
          // LinkedIn sidebar ads are usually inside an 'aside' or a themed div
          const card =
            el.closest('aside') ||
            el.closest('.artdeco-card') ||
            el.closest('div[data-testid="cellInnerDiv"]') ||
            el.closest('.ad-banner-container');

          if (card && card.style.display !== 'none') {
            card.style.setProperty('display', 'none', 'important');
            console.log('[LinkedIn Fix] Hidden Promoted Card via specific selector');
          }
        }
      });
    });

    // 2. Catch-all for any element containing ONLY the word "Promoted" inside the sidebar
    const sidebar = document.querySelector('.right-rail, [data-testid="sidebarColumn"], aside');
    if (sidebar) {
      const allElements = sidebar.querySelectorAll('span, p, a, div');
      allElements.forEach((el) => {
        if (el.children.length === 0 && el.textContent.trim() === 'Promoted') {
          const card = el.closest('.artdeco-card') || el.closest('aside') || el.closest('div');
          if (card && card !== sidebar) {
            card.style.setProperty('display', 'none', 'important');
          }
        }
      });
    }
  }

  // Use MutationObserver to catch dynamic loads (LinkedIn loads rail content late)
  const observer = new MutationObserver(hidePromoted);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Initial run
  hidePromoted();
})();
