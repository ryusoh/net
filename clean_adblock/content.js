/**
 * Bypass: AdBlock Detector - Content Script
 * Clean-room implementation of adblock detection and removal.
 */

(function () {
  'use strict';

  const DEBUG = true;
  const log = (...args) => DEBUG && console.log('[Bypass: AdBlock]', ...args);

  // Core keywords used to identify adblock detection messages across languages.
  const KEYWORDS = [
    'adblock',
    'ad blocker',
    'adblocker',
    'ad block',
    'adblocking',
    'ads blocker',
    'content blocker',
    'ad blocking',
    'detected',
    'detection',
    'detected adblock',
    'disable',
    'turn off',
    'remove',
    'whitelist',
    'pause',
    'support us',
    'revenue',
    'free content',
    'funding',
    'premium',
    'upgrade',
    'ad-free',
    // Spanish
    'bloqueador',
    'publicidad',
    'anuncios',
    // German
    'werbeblocker',
    'werbung',
    'erkannt',
    // French
    'bloqueur',
    'publicité',
    // Portuguese
    'bloqueador',
    'anúncios',
    // Russian
    'блокировщик',
    'рекламы',
    // Chinese
    '广告拦截',
    '屏蔽',
    // Japanese
    '広告ブロック',
    'ブロッカー',
    // Italian
    'blocco annunci',
    // Polish
    'blokowanie reklam'
  ];

  /**
   * Recursive scanner that traverses the DOM, including Shadow DOM.
   * @param {Node} root - The starting node for the search.
   * @param {Function} callback - Function called for each element found.
   */
  function scanDOM(root, callback) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      callback(node);
      if (node.shadowRoot) {
        scanDOM(node.shadowRoot, callback);
      }
    }
  }

  /**
   * Scores an element based on its text content and attributes.
   * @param {Element} el - The element to evaluate.
   * @returns {number} - The calculated score (0 to 1).
   */
  function scoreElement(el) {
    const text = el.textContent ? el.textContent.toLowerCase() : '';
    if (text.length < 5 || text.length > 1000) {
      return 0;
    }

    let matches = 0;
    KEYWORDS.forEach((kw) => {
      if (text.includes(kw)) {
        matches++;
      }
    });

    if (matches === 0) {
      return 0;
    }

    // Calculate base score
    let score = matches * 0.2;

    // Contextual bonuses
    const style = window.getComputedStyle(el);
    if (style.position === 'fixed' || style.position === 'absolute') {
      score += 0.3;
    }
    if (parseInt(style.zIndex) > 100) {
      score += 0.2;
    }

    // Dimension check
    const rect = el.getBoundingClientRect();
    if (rect.width > window.innerWidth * 0.5 && rect.height > window.innerHeight * 0.3) {
      score += 0.2;
    }

    return Math.min(score, 1);
  }

  /**
   * Hides an element and its relevant parents if they appear to be overlays.
   * @param {Element} el - The element to hide.
   */
  function hideDetector(el) {
    log('Potential detector found, score:', scoreElement(el));

    // Find the topmost container that is likely the overlay
    let target = el;
    let parent = el.parentElement;

    for (let i = 0; i < 5 && parent && parent !== document.body; i++) {
      const style = window.getComputedStyle(parent);
      if (style.position === 'fixed' || style.position === 'absolute') {
        target = parent;
      }
      parent = parent.parentElement;
    }

    if (target.style.display !== 'none') {
      log('Hiding element:', target);
      target.style.setProperty('display', 'none', 'important');
      restoreScrolling();
    }
  }

  /**
   * Checks for and restores page scrolling if it has been disabled.
   */
  function restoreScrolling() {
    [document.documentElement, document.body].forEach((el) => {
      const style = window.getComputedStyle(el);
      if (style.overflow === 'hidden' || style.overflowY === 'hidden') {
        log('Restoring scroll on:', el.tagName);
        el.style.setProperty('overflow', 'auto', 'important');
        el.style.setProperty('overflow-y', 'auto', 'important');
      }
      if (style.position === 'fixed') {
        el.style.setProperty('position', 'static', 'important');
      }
    });
  }

  /**
   * Site-specific modules for complex platforms.
   */
  const SITE_MODULES = {
    'youtube.com': () => {
      log('Running YouTube module');
      // Placeholder for YT specific dismiss logic
      const dismiss = document.querySelector('ytd-enforcement-message-view-model button');
      if (dismiss) {
        dismiss.click();
      }
    },
    'blobgame.io': () => {
      log('Running BlobGame module');
      // Inject CSS to fix game visibility
      if (!document.getElementById('blobgame-fix')) {
        const style = document.createElement('style');
        style.id = 'blobgame-fix';
        style.textContent = `
          #aw, [id*="aw"], [class*="aw"], [id*="adblock"], [class*="adblock"] { display: none !important; }
          #embed-html { display: block !important; }
        `;
        document.documentElement.appendChild(style);
      }
    }
  };

  /**
   * Main execution loop.
   */
  function run() {
    if (!document.body) {
      return;
    }
    chrome.storage.sync.get(['enabled', 'mode', 'whitelist', 'blacklist'], (prefs) => {
      if (prefs.enabled === false) {
        return;
      }

      const host = window.location.hostname;

      // 1. Check Whitelist (highest priority)
      if (prefs.whitelist && prefs.whitelist.some((s) => host.includes(s))) {
        log('Site is whitelisted, skipping.');
        return;
      }

      // 2. Check Execution Mode
      if (prefs.mode === 'selective') {
        const inBlacklist = prefs.blacklist && prefs.blacklist.some((s) => host.includes(s));
        if (!inBlacklist) {
          log('Selective mode active and site not in blacklist, skipping.');
          return;
        }
      }

      // 3. Site-specific handling
      Object.keys(SITE_MODULES).forEach((m) => {
        if (host.includes(m)) {
          SITE_MODULES[m]();
        }
      });

      // 4. Apply automatic detection
      scanDOM(document.body, (el) => {
        if (scoreElement(el) > 0.6) {
          hideDetector(el);
        }
      });

      // 5. Apply custom user-defined selectors
      chrome.storage.local.get(['customSelectors'], (result) => {
        const selectors = result.customSelectors ? result.customSelectors[host] : null;
        if (selectors && Array.isArray(selectors)) {
          selectors.forEach((selector) => {
            try {
              document.querySelectorAll(selector).forEach((el) => {
                el.style.setProperty('display', 'none', 'important');
              });
            } catch (e) {
              log('Invalid custom selector:', selector);
            }
          });
        }
      });
    });
  }

  // Initial run
  run();

  // Observe for dynamic changes
  const observer = new MutationObserver((mutations) => {
    let shouldRun = false;
    mutations.forEach((m) => {
      if (m.addedNodes.length > 0) {
        shouldRun = true;
      }
    });
    if (shouldRun) {
      run();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Message listener
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scan') {
      log('Manual scan triggered');
      run();
      sendResponse({ success: true });
    }
    return true;
  });
})();
