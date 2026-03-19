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
    `;
    document.head.appendChild(style);
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
      // 1. Check if we should be running
      const path = window.location.pathname;
      if (path !== '/home' && path !== '/') {
        return;
      }
      if (manualLock) {
        return;
      }

      // 2. Find all tabs
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

      // 3. Force the Switch
      if (targetTab) {
        const isSelected = targetTab.getAttribute('aria-selected') === 'true';

        if (!isSelected) {
          // If it's an anchor with a link, we can fallback to navigation if clicks fail,
          // but first we hammer it with clicks.

          // Native click on the tab
          targetTab.click();

          // Native click on its inner elements (React sometimes binds to the span)
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

          // If X is completely ignoring synthetic events, and this is an <a> tag,
          // we can force a location change as a last resort.
          // Note: We only do this if it has an href that isn't just /home
          if (
            targetTab.tagName.toLowerCase() === 'a' &&
            targetTab.href &&
            !targetTab.href.endsWith('/home')
          ) {
            window.location.href = targetTab.href;
            manualLock = true; // Lock so we don't loop redirect
          }
        }
      }
      // 4. Hide "Subscribe to Premium" in the left sidebar
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

      // 5. Hide "Subscribe to Premium" box in the right sidebar
      // Usually it's an aside element with an aria-label
      const rightSidebarPremium = document.querySelectorAll(
        'aside[aria-label="Subscribe to Premium"]'
      );
      rightSidebarPremium.forEach((el) => {
        el.style.setProperty('display', 'none', 'important');
      });

      // Text-based fallback for the right sidebar premium box
      const spans = document.querySelectorAll('[data-testid="sidebarColumn"] span');
      spans.forEach((span) => {
        const text = (span.innerText || span.textContent || '').trim().toLowerCase();
        if (text === 'subscribe to premium') {
          // We need to hide the container card, which is usually a few levels up
          // It's typically an 'aside' or a div with padding and border
          let container = span.closest('aside');
          if (!container) {
            let parent = span.parentElement;
            // Go up to 8 levels looking for the section container
            for (let i = 0; i < 8; i++) {
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
    }, 50);
  }
})();
