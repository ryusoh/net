/**
 * X: Custom Default Tab Extension - NUCLEAR OPTION
 * -------------------------------------------
 * This version uses a high-frequency polling loop and aggressive event
 * saturation to absolutely force the preferred tab.
 */

(function () {
  let preferredTab = 'finance';
  let manualLock = false;

  const syncStorage = typeof chrome !== 'undefined' ? chrome?.storage?.sync : null;
  if (!syncStorage) {
    return;
  }
  syncStorage.get({ preferredTab: 'finance' }, (items) => {
    preferredTab = items.preferredTab.toLowerCase();
    injectCSS();
    startNuclearLoop();
  });

  function injectCSS() {
    const style = document.createElement('style');
    // Hide 'For you' via CSS immediately. We target the first child
    // of the scroll list and the tablist.
    style.textContent = `
      nav[role="tablist"] > div:nth-child(1),
      nav[role="tablist"] [role="tab"]:nth-child(1),
      [data-testid="ScrollSnap-List"] > div:nth-child(1) {
        display: none !important;
        visibility: hidden !important;
        width: 0 !important;
        height: 0 !important;
        pointer-events: none !important;
      }

      /* Hide floating Grok and Messages buttons in bottom right */
      #layers > div > div:nth-child(1) > div > div > div > div > button,
      #layers > div > div:nth-child(2) > div > div > div > div > div.absolute.inset-0.w-full.h-full.select-none.flex.items-center.justify-center.cursor-pointer,
      div[data-testid="msg-drawer"] {
        display: none !important;
        visibility: hidden !important;
      }
    `;
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(style);
    }
  }

  // If a real human clicks anywhere on the page, we stop forcing the tab.
  window.addEventListener(
    'click',
    (e) => {
      if (e.isTrusted) {
        manualLock = true;
      }
    },
    true
  );

  function startNuclearLoop() {
    // Run every 50ms. Extremely aggressive.
    setInterval(() => {
      // --- UI TWEAKS (Run Everywhere) ---

      // 1. Hide "Subscribe to Premium" in the left sidebar
      const premiumElements = document.querySelectorAll(
        'a[aria-label="Premium"], a[href="/i/premium_sign_up"]'
      );
      premiumElements.forEach((el) => {
        el.style.setProperty('display', 'none', 'important');
      });

      // Fallback: Check for elements with text "Subscribe" or "Premium" in the nav
      const navItems = document.querySelectorAll('nav[role="navigation"] a');
      navItems.forEach((item) => {
        const text = (item.innerText || item.textContent || '').trim().toLowerCase();
        if (text === 'premium' || text === 'subscribe') {
          item.style.setProperty('display', 'none', 'important');
        }
      });

      // 2. Hide "Subscribe to Premium", "Who to follow", and "Live on X" boxes in the right sidebar
      const rightSidebarCards = document.querySelectorAll(
        'aside[aria-label="Subscribe to Premium"], aside[aria-label="Who to follow"], aside[aria-label="Live on X"]'
      );
      rightSidebarCards.forEach((el) => {
        // X sometimes wraps the aside in another div that holds the border
        let container = el;
        if (el.parentElement && el.parentElement.getAttribute('data-testid') !== 'sidebarColumn') {
          // If the parent isn't the main sidebar column, it's likely a border wrapper
          container = el.parentElement;
          // Check one more level up just in case
          if (
            container.parentElement &&
            container.parentElement.getAttribute('data-testid') !== 'sidebarColumn' &&
            !container.parentElement.hasAttribute('role')
          ) {
            container = container.parentElement;
          }
        }
        container.style.setProperty('display', 'none', 'important');
      });

      const spans = document.querySelectorAll(
        '[data-testid="sidebarColumn"] span, [data-testid="sidebarColumn"] h2'
      );
      spans.forEach((span) => {
        const text = (span.innerText || span.textContent || '').trim().toLowerCase();
        if (text === 'subscribe to premium' || text === 'who to follow' || text === 'live on x') {
          let container = span.closest('aside');
          if (container) {
            // Same wrapper climbing logic
            if (
              container.parentElement &&
              container.parentElement.getAttribute('data-testid') !== 'sidebarColumn'
            ) {
              container = container.parentElement;
              if (
                container.parentElement &&
                container.parentElement.getAttribute('data-testid') !== 'sidebarColumn' &&
                !container.parentElement.hasAttribute('role')
              ) {
                container = container.parentElement;
              }
            }
          } else {
            let parent = span.parentElement;
            for (let i = 0; i < 10; i++) {
              // Increased traversal depth slightly
              if (!parent || parent.getAttribute('data-testid') === 'sidebarColumn') {
                break;
              }
              container = parent;
              parent = parent.parentElement;
            }
          }
          if (container) {
            container.style.setProperty('display', 'none', 'important');
          }
        }
      });

      // 3. Hide all floating buttons/drawers in bottom right
      // The DOM structure of X places these inside #layers > div > div
      const layerContainers = document.querySelectorAll('#layers > div > div');
      layerContainers.forEach((container) => {
        // Check for Messages drawer
        if (container.querySelector('[data-testid="msg-drawer"]')) {
          container.style.setProperty('display', 'none', 'important');
        }
        // Check for Grok button
        if (container.querySelector('button[aria-label="Grok"], a[aria-label="Grok"]')) {
          container.style.setProperty('display', 'none', 'important');
        }
        // Check for the specific secondary floating button (often new Messages UI or Grok secondary)
        if (
          container.querySelector(
            '.absolute.inset-0.w-full.h-full.select-none.flex.items-center.justify-center.cursor-pointer'
          )
        ) {
          container.style.setProperty('display', 'none', 'important');
        }
        // Check for Grok drawer header specifically
        if (container.querySelector('[data-testid="GrokDrawerHeader"]')) {
          container.style.setProperty('display', 'none', 'important');
        }
        // Check for Compose post floating button (mobile/small screen)
        if (container.querySelector('a[href="/compose/post"]')) {
          container.style.setProperty('display', 'none', 'important');
        }

        // Aggressive fallback: Hide ANY layer container positioned in the bottom right corner
        // (This catches "Return to top", new mystery buttons, etc.)
        const hasButtons = container.querySelector('button, a, [role="button"]');
        if (hasButtons) {
          const rect = container.getBoundingClientRect();
          // If the element is visible, has layout, and its center is in the bottom right quadrant
          if (rect.width > 0 && rect.height > 0) {
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            if (centerX > window.innerWidth * 0.75 && centerY > window.innerHeight * 0.75) {
              // Make sure it's not a generic overlay taking up the whole screen
              if (rect.width < window.innerWidth * 0.5 && rect.height < window.innerHeight * 0.5) {
                container.style.setProperty('display', 'none', 'important');
              }
            }
          }
        }
      });

      // --- TAB SWITCHER (Run only on home) ---
      const path = window.location.pathname;
      if (path !== '/home' && path !== '/') {
        return;
      }
      if (manualLock) {
        return;
      }

      // 4. Find all tabs
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      if (!tabs.length) {
        return;
      }

      let targetTab = null;

      tabs.forEach((tab) => {
        const text = (tab.innerText || tab.textContent || '').trim().toLowerCase();

        // JS Fallback Hiding for "For you"
        if (text.includes('for you')) {
          tab.style.setProperty('display', 'none', 'important');
          if (tab.parentElement && tab.parentElement.getAttribute('role') === 'presentation') {
            tab.parentElement.style.setProperty('display', 'none', 'important');
          }
        }

        // Identify the target
        if (text.includes(preferredTab)) {
          targetTab = tab;
        }
      });

      // 5. Force the Switch
      if (targetTab) {
        const isSelected = targetTab.getAttribute('aria-selected') === 'true';

        if (!isSelected) {
          // Native click on the tab
          targetTab.click();

          // Native click on its inner elements
          const children = targetTab.querySelectorAll('*');
          children.forEach((child) => child.click());

          // Synthetic Event Barrage
          const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
          events.forEach((type) => {
            const ev = new MouseEvent(type, {
              view: window,
              bubbles: true,
              cancelable: true
            });
            targetTab.dispatchEvent(ev);
            if (children.length) {
              children[0].dispatchEvent(ev);
            }
          });

          if (
            targetTab.tagName.toLowerCase() === 'a' &&
            targetTab.href &&
            !targetTab.href.endsWith('/home')
          ) {
            window.location.href = targetTab.href;
            manualLock = true;
          }
        }
      }
    }, 50);
  }
})();
