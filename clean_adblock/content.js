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
    let strongMatch = false;
    KEYWORDS.forEach((kw) => {
      if (text.includes(kw)) {
        matches++;
        // Two adblock-specific keywords together is a strong signal
        if (
          kw === 'adblock' ||
          kw === 'adblocker' ||
          kw === 'ad blocker' ||
          kw === 'ad block' ||
          kw === 'detected adblock' ||
          kw === 'werbeblocker' ||
          kw === 'bloqueur' ||
          kw === 'bloqueador' ||
          kw === '广告拦截' ||
          kw === '広告ブロック'
        ) {
          strongMatch = true;
        }
      }
    });

    if (matches === 0) {
      return 0;
    }

    // Calculate base score — strong adblock keywords get extra weight
    let score = matches * 0.2;
    if (strongMatch && matches >= 2) {
      score += 0.2;
    }

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
      // Only reset position:fixed on body if it was likely set by an overlay script
      // (i.e., body also has overflow:hidden and a negative top offset — classic scroll-lock pattern)
      if (el === document.body && style.position === 'fixed' && style.overflow === 'hidden') {
        el.style.setProperty('position', 'static', 'important');
      }
    });
  }

  /**
   * Restores text selection, copying, and right-click functionality.
   */
  function restoreInteractions() {
    const userSelectCss =
      'user-select: text !important;-webkit-user-select: text !important;-webkit-touch-callout: text !important;';

    // 1. Force CSS selection
    if (!document.getElementById('bypass-copy-fix')) {
      const style = document.createElement('style');
      style.id = 'bypass-copy-fix';
      style.textContent = `* { ${userSelectCss} }`;
      document.documentElement.appendChild(style);
    }

    // 2. Clear restrictive inline event handlers
    const clearEvents = (el) => {
      if (!el) {
        return;
      }
      el.onselectstart = null;
      el.oncopy = null;
      el.oncut = null;
      el.onpaste = null;
      el.oncontextmenu = null;
      el.onmousedown = null;
      el.onmouseup = null;
    };
    clearEvents(document);
    clearEvents(document.body);
    clearEvents(document.documentElement);

    // 3. Hijack event listeners via Capture Phase
    const stopPropagation = (e) => {
      e.stopPropagation();
      if (e.stopImmediatePropagation) {
        e.stopImmediatePropagation();
      }
      return true;
    };

    ['copy', 'cut', 'contextmenu', 'selectstart'].forEach((evt) => {
      document.documentElement.addEventListener(evt, stopPropagation, { capture: true });
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
   * Checks if the extension context is still valid.
   * @returns {boolean}
   */
  function isContextValid() {
    try {
      // Use optional chaining and check for runtime.id which is cleared on invalidation
      return !!(
        typeof chrome !== 'undefined' &&
        chrome?.runtime?.id &&
        chrome?.runtime?.onMessage &&
        chrome?.storage?.sync &&
        chrome?.storage?.local
      );
    } catch {
      return false;
    }
  }

  /**
   * Dismiss Admiral anti-adblock popups.
   * Admiral uses randomized class names, so we detect by:
   * 1. Links to getadmiral.com (branding)
   * 2. "Continue without disabling" dismiss buttons
   */
  // Major SPAs where scanning all links on every mutation is too expensive
  const SKIP_ADMIRAL_DOMAINS = [
    'x.com',
    'twitter.com',
    'facebook.com',
    'instagram.com',
    'reddit.com',
    'youtube.com',
    'linkedin.com',
    'pinterest.com'
  ];
  const currentHost = window.location.hostname;
  const skipAdmiral = SKIP_ADMIRAL_DOMAINS.some(
    (d) => currentHost === d || currentHost.endsWith('.' + d)
  );

  function dismissAdmiral() {
    if (skipAdmiral) {
      return;
    }
    // Admiral URL-encodes their branding links to evade CSS selectors.
    // Scan all <a> elements and decode their href to detect Admiral.
    const allLinks = document.querySelectorAll('a[href]');
    for (const link of allLinks) {
      let decoded = '';
      try {
        decoded = decodeURIComponent(link.getAttribute('href') || '').toLowerCase();
      } catch {
        continue;
      }
      // Only match Admiral anti-adblock service domains, not the word "admiral"
      // in general (e.g. "vanguard-500-index-admiral" on investing.com)
      if (
        !decoded.includes('getadmiral.com') &&
        !decoded.includes('admiral.mgr') &&
        !decoded.includes('admiralcdn.com') &&
        !decoded.includes('admiral-media.com')
      ) {
        continue;
      }

      log('Admiral link found:', decoded);

      // Walk up to the topmost overlay container
      let container = link;
      let best = link;
      for (let i = 0; i < 15 && container.parentElement; i++) {
        container = container.parentElement;
        if (container === document.body || container === document.documentElement) {
          break;
        }
        best = container;
      }

      if (best !== link) {
        log('Hiding Admiral overlay container');
        best.style.setProperty('display', 'none', 'important');
        restoreScrolling();
        return;
      }
    }
  }

  /**
   * Main execution loop.
   */
  function run() {
    if (!isContextValid()) {
      return;
    }
    if (!document.body) {
      return;
    }
    try {
      // Check for sync storage specifically
      const syncStorage = typeof chrome !== 'undefined' ? chrome?.storage?.sync : null;
      if (!syncStorage) {
        return;
      }

      syncStorage.get(['enabled', 'mode', 'whitelist', 'blacklist'], (prefs) => {
        try {
          if (!isContextValid() || chrome?.runtime?.lastError) {
            return;
          }
          if (prefs?.enabled === false) {
            return;
          }

          const host = window.location.hostname;

          // 1. Check Whitelist (highest priority)
          if (prefs?.whitelist && prefs.whitelist.some((s) => host.includes(s))) {
            log('Site is whitelisted, skipping.');
            return;
          }

          // 2. Force Interaction Restoration (skip on SPAs where it breaks layout)
          const SKIP_INTERACTIONS = ['instagram.com', 'facebook.com', 'reddit.com', 'pinterest.com', 'youtube.com', 'x.com', 'twitter.com', 'linkedin.com', 'twitch.tv'];
          if (!SKIP_INTERACTIONS.some((d) => host === d || host.endsWith('.' + d))) {
            restoreInteractions();
          }

          // 3. Check Execution Mode
          if (prefs?.mode === 'selective') {
            const inBlacklist = prefs?.blacklist && prefs.blacklist.some((s) => host.includes(s));
            if (!inBlacklist) {
              log('Selective mode active and site not in blacklist, skipping.');
              return;
            }
          }

          // 4. Site-specific handling
          Object.keys(SITE_MODULES).forEach((m) => {
            if (host.includes(m)) {
              SITE_MODULES[m]();
            }
          });

          // 5. Hide common adblock detection overlays by selector
          const ADBLOCK_POPUP_SELECTORS = [
            '[class*="adblock" i]',
            '[id*="adblock" i]',
            '[class*="ad-block" i]',
            '[id*="ad-block" i]',
            '[class*="adblocker" i]',
            '[id*="adblocker" i]',
            '[class*="adblock-modal"]',
            '[class*="adblock-overlay"]',
            '[class*="adblock-notice"]',
            '[class*="adblock-wall"]',
            '[class*="anti-adblocker"]',
            '[id*="anti-adblocker"]',
            '.fc-consent-root',
            '.fc-dialog-overlay'
          ];

          for (const sel of ADBLOCK_POPUP_SELECTORS) {
            try {
              document.querySelectorAll(sel).forEach((el) => {
                if (el.offsetParent !== null || window.getComputedStyle(el).display !== 'none') {
                  log('Hiding adblock popup by selector:', sel);
                  hideDetector(el);
                }
              });
            } catch {
              /* invalid selector */
            }
          }

          // 5b. Detect Admiral anti-adblock (uses randomized classes, detect by content)
          dismissAdmiral();

          // 6. Apply automatic text-based detection
          scanDOM(document.body, (el) => {
            if (scoreElement(el) > 0.6) {
              hideDetector(el);
            }
          });

          // 5. Apply custom user-defined selectors
          try {
            const localStorage = chrome?.storage?.local;
            if (!localStorage) {
              return;
            }

            localStorage.get(['customSelectors'], (result) => {
              try {
                if (!isContextValid() || chrome?.runtime?.lastError) {
                  return;
                }
                const selectors = result?.customSelectors ? result.customSelectors[host] : null;
                if (selectors && Array.isArray(selectors)) {
                  selectors.forEach((selector) => {
                    try {
                      document.querySelectorAll(selector).forEach((el) => {
                        el.style.setProperty('display', 'none', 'important');
                      });
                    } catch {
                      log('Invalid custom selector:', selector);
                    }
                  });
                }
              } catch (e) {
                log('Local storage callback failed:', e);
              }
            });
          } catch (e) {
            log('Local storage access failed:', e);
          }
        } catch (e) {
          log('Sync storage callback failed:', e);
        }
      });
    } catch (e) {
      log('Sync storage access failed:', e);
    }
  }

  // Initial run
  run();

  // Observe for dynamic changes
  const observer = new MutationObserver((mutations) => {
    if (!isContextValid()) {
      observer.disconnect();
      return;
    }
    let shouldRun = false;
    mutations.forEach((m) => {
      if (m.addedNodes.length > 0) {
        shouldRun = true;
      }
    });
    if (shouldRun) {
      dismissAdmiral();
      // Throttle run() to avoid hammering chrome.storage on dynamic SPAs
      if (!run._throttled) {
        run._throttled = true;
        setTimeout(() => {
          run._throttled = false;
          run();
        }, 500);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Message listener
  if (isContextValid()) {
    chrome?.runtime?.onMessage?.addListener((request, sender, sendResponse) => {
      if (!isContextValid()) {
        return;
      }
      if (request.action === 'scan') {
        log('Manual scan triggered');
        run();
        sendResponse({ success: true });
      }
      return true;
    });
  }
})();
