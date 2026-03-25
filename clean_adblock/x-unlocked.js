/**
 * X (Twitter): Custom Default Tab + UI Cleaner
 * -------------------------------------------
 * Hides the 'For you' tab on home and switches to preferred feed.
 * Hides premium prompts, Grok, and other UI clutter via CSS.
 * Default tab: Finance.
 */

(function () {
  'use strict';

  let preferredTab = 'finance';
  let tabSwitched = false;

  const syncStorage = typeof chrome !== 'undefined' ? chrome?.storage?.sync : null;
  if (syncStorage) {
    syncStorage.get({ preferredTab: 'finance' }, (items) => {
      preferredTab = items.preferredTab.toLowerCase();
      init();
    });
  } else {
    init();
  }

  function init() {
    injectCSS();
    // Use MutationObserver instead of setInterval for tab switching
    if (document.body) {
      startObserver();
    } else {
      document.addEventListener('DOMContentLoaded', startObserver);
    }
  }

  function injectCSS() {
    const style = document.createElement('style');
    style.textContent = `
      /* Hide Premium in left sidebar */
      a[aria-label="Premium"],
      a[href="/i/premium_sign_up"] {
        display: none !important;
      }

      /* Hide floating Grok and Messages buttons */
      div[data-testid="msg-drawer"],
      button[aria-label="Grok"],
      a[aria-label="Grok"],
      [data-testid="GrokDrawerHeader"] {
        display: none !important;
      }

      /* Hide Subscribe to Premium / Who to follow / Live on X sidebar cards */
      aside[aria-label="Subscribe to Premium"],
      aside[aria-label="Who to follow"],
      aside[aria-label="Live on X"] {
        display: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // Stop forcing tab after user clicks
  window.addEventListener(
    'click',
    (e) => {
      if (e.isTrusted) {
        tabSwitched = true;
      }
    },
    true
  );

  function tryTabSwitch() {
    const path = window.location.pathname;
    if (path !== '/home' && path !== '/') {
      return;
    }
    if (tabSwitched) {
      return;
    }

    const tabs = document.querySelectorAll('[role="tab"]');
    if (!tabs.length) {
      return;
    }

    let targetTab = null;
    tabs.forEach((tab) => {
      const text = (tab.innerText || '').trim().toLowerCase();
      // Hide "For you" tab on home page only
      if (text.includes('for you') || text.includes('おすすめ')) {
        tab.style.setProperty('display', 'none', 'important');
        if (tab.parentElement && tab.parentElement.getAttribute('role') === 'presentation') {
          tab.parentElement.style.setProperty('display', 'none', 'important');
        }
      }
      if (text.includes(preferredTab)) {
        targetTab = tab;
      }
    });

    if (targetTab && targetTab.getAttribute('aria-selected') !== 'true') {
      targetTab.click();
      tabSwitched = true;
    }
  }

  function startObserver() {
    // Try once immediately
    tryTabSwitch();

    // Then watch for DOM changes (handles SPA navigation)
    const observer = new MutationObserver(() => {
      tryTabSwitch();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
