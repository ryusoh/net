/**
 * Forum Ad Blocker (Cleanroom Implementation)
 * -------------------------------------------
 * Blocks ads on forum websites, with deep support for 1point3acres.com.
 * Targets:
 * - 1point3acres ad placements (1p3a-ad-*)
 * - AdRecover anti-adblock circumvention
 * - AdPushup / Publift / VDO.AI / Primis / Undrads
 * - Google Funding Choices (ad blocker detection)
 * - OneSignal push notification prompts
 * - Generic forum ad patterns
 * @global
 */

/* global HTMLScriptElement */
(function () {
  'use strict';

  // --- Phase 1: Early CSS injection (runs at document_start) ---
  // Hide ad elements BEFORE they render to prevent layout shift / flash

  const HIDE_CSS = `
    /* 1point3acres.com ad placements */
    [id^="1p3a-ad-"],
    [id^="1p3a_ad_"],
    [class*="1p3a-ad"],
    div[id*="adpushup"],
    div[class*="adpushup"],
    div[data-adpushup-id],

    /* AdRecover containers */
    [id*="adrecover"],
    [class*="adrecover"],
    iframe[src*="adrecover.com"],

    /* Publift / FuseAds */
    [id*="publift"],
    [class*="publift"],
    div[data-fuse],
    [id*="fuse-"],

    /* VDO.AI / Primis video ads */
    [id*="vdo_ai"],
    [class*="vdo-ai"],
    [id*="primis"],
    div[class*="primis"],

    /* Undrads */
    [id*="undrads"],
    [class*="undrads"],

    /* Google Funding Choices (ad blocker detection popup) */
    .fc-consent-root,
    .fc-dialog-overlay,
    .fc-dialog-container,
    #fc-dialog-overlay,
    div[class^="fc-"],

    /* OneSignal push notification prompts */
    #onesignal-slidedown-dialog,
    .onesignal-slidedown-dialog,
    #onesignal-popover-container,
    .onesignal-customlink-container,
    #onesignal-container,
    .onesignal-reset,

    /* 1point3acres portal ad blocks */
    #portal_block_479,

    /* Generic forum ad selectors */
    .deal-card,
    #iframe-ad-container,
    [class*="ad-container"],
    [class*="sponsor"],
    [class*="promotion"],
    iframe[id*="google_ads"],
    iframe[src*="doubleclick.net"],
    iframe[src*="googlesyndication"],
    .ad-unit,
    .ad-slot,
    .sidebar-ad,
    .header-ad,
    .footer-ad,
    .in-feed-ad,
    [class*="banner-ad"],
    [id*="banner-ad"],
    div[id*="div-gpt-ad"],
    ins.adsbygoogle,

    /* Sticky/floating ads */
    [id*="sticky-ad"],
    [class*="sticky-ad"],
    [id*="ad-sticky"],
    [class*="ad-sticky"] {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      overflow: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* Prevent body scroll lock from ad overlays */
    body.fc-overflow-hidden,
    html.fc-overflow-hidden {
      overflow: auto !important;
      position: static !important;
    }
  `;

  const style = document.createElement('style');
  style.id = 'clean-adblock-forum';
  style.textContent = HIDE_CSS;
  (document.head || document.documentElement).appendChild(style);

  // --- Phase 2: Script blocking ---
  // Intercept and neutralize ad scripts before they execute

  const BLOCKED_SCRIPT_PATTERNS = [
    'adrecover.com',
    'adpushup.com',
    'publift.com',
    'vdo.ai',
    'primis.tech',
    'undrads.com',
    'fundingchoicesmessages.google.com',
    'googlesyndication.com/pagead',
    'securepubads.g.doubleclick.net',
    'adservice.google.com',
    'pagead2.googlesyndication.com'
  ];

  // Block script injection via DOM
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = function (tagName, options) {
    const el = originalCreateElement(tagName, options);
    if (tagName.toLowerCase() === 'script') {
      const origSetAttribute = el.setAttribute.bind(el);
      el.setAttribute = function (name, value) {
        if (name === 'src' && shouldBlockScript(value)) {
          return;
        }
        return origSetAttribute(name, value);
      };

      // Also intercept .src property
      const descriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
      if (descriptor) {
        Object.defineProperty(el, 'src', {
          set(value) {
            if (shouldBlockScript(value)) {
              return;
            }
            descriptor.set.call(this, value);
          },
          get() {
            return descriptor.get.call(this);
          },
          configurable: true
        });
      }
    }
    return el;
  };

  function shouldBlockScript(src) {
    if (!src) {
      return false;
    }
    const lower = src.toLowerCase();
    return BLOCKED_SCRIPT_PATTERNS.some((p) => lower.includes(p));
  }

  // --- Phase 3: Neutralize ad config objects ---

  function neutralizeAdConfig() {
    // Kill window.adTagConfig used by 1point3acres
    try {
      Object.defineProperty(window, 'adTagConfig', {
        get: () => ({ placements: {}, enabled: false }),
        set: () => {},
        configurable: false
      });
    } catch {
      /* already defined */
    }

    // Kill AdPushup
    try {
      Object.defineProperty(window, 'adpushup', {
        get: () => ({ que: [], triggerAd: () => {} }),
        set: () => {},
        configurable: false
      });
    } catch {
      /* already defined */
    }

    // Kill Google Funding Choices
    try {
      Object.defineProperty(window, 'googlefc', {
        get: () => ({
          callbackQueue: [],
          showRevocationMessage: () => {},
          getConsentStatus: () => 1,
          getConsentedProviderIds: () => []
        }),
        set: () => {},
        configurable: false
      });
    } catch {
      /* already defined */
    }
  }

  neutralizeAdConfig();

  // --- Phase 4: DOM cleanup (runs when DOM is ready) ---

  const FORUM_AD_SELECTORS = [
    // 1point3acres specific
    '[id^="1p3a-ad-"]',
    '[id^="1p3a_ad_"]',
    '[class*="1p3a-ad"]',
    '.deal-card',
    '#portal_block_479',
    '#iframe-ad-container',
    'iframe[src*="adrecover.com"]',

    // Ad network containers
    'div[data-adpushup-id]',
    'div[id*="adpushup"]',
    'div[id*="publift"]',
    'div[data-fuse]',
    'div[id*="vdo_ai"]',
    'div[id*="primis"]',
    'div[id*="undrads"]',
    'ins.adsbygoogle',
    'div[id*="div-gpt-ad"]',

    // Google Funding Choices overlay
    '.fc-consent-root',
    '.fc-dialog-overlay',
    '.fc-dialog-container',

    // OneSignal
    '#onesignal-slidedown-dialog',
    '#onesignal-popover-container',
    '#onesignal-container',

    // Generic
    '[class*="ad-container"]',
    '[class*="sponsor"]',
    '[class*="promotion"]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication"]',
    '.ad-unit',
    '.ad-slot',
    '.sidebar-ad',
    '.header-ad',
    '.footer-ad',
    '.in-feed-ad',
    '[class*="banner-ad"]',
    '[id*="banner-ad"]',
    '[id*="sticky-ad"]',
    '[class*="sticky-ad"]'
  ];

  const processedElements = new WeakSet();

  function hideAd(element) {
    if (processedElements.has(element)) {
      return false;
    }
    element.style.setProperty('display', 'none', 'important');
    element.setAttribute('data-blocked-by-clean-adblock', 'true');
    processedElements.add(element);
    return true;
  }

  function removeAdScripts() {
    document.querySelectorAll('script[src]').forEach((script) => {
      if (shouldBlockScript(script.src)) {
        script.remove();
      }
    });
  }

  function removeAdIframes() {
    document.querySelectorAll('iframe').forEach((iframe) => {
      const src = iframe.src || iframe.getAttribute('data-src') || '';
      if (BLOCKED_SCRIPT_PATTERNS.some((p) => src.includes(p))) {
        hideAd(iframe);
      }
    });
  }

  function blockForumAds() {
    for (const selector of FORUM_AD_SELECTORS) {
      try {
        document.querySelectorAll(selector).forEach((el) => hideAd(el));
      } catch {
        /* invalid selector */
      }
    }
    removeAdScripts();
    removeAdIframes();

    // Restore scroll if ad overlay locked it
    if (document.body) {
      document.body.classList.remove('fc-overflow-hidden');
      document.documentElement.classList.remove('fc-overflow-hidden');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', blockForumAds);
  } else {
    blockForumAds();
  }

  // --- Phase 5: MutationObserver for dynamic ads ---

  function onMutation(mutations) {
    let needsFullScan = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) {
          continue;
        }

        // Check if the added node itself is an ad
        for (const selector of FORUM_AD_SELECTORS) {
          try {
            if (node.matches && node.matches(selector)) {
              hideAd(node);
            }
          } catch {
            /* invalid selector */
          }
        }

        // Check if it's an ad script
        if (node.tagName === 'SCRIPT' && node.src && shouldBlockScript(node.src)) {
          node.remove();
          continue;
        }

        // Check for ad elements inside the added node
        if (node.querySelectorAll) {
          needsFullScan = true;
        }
      }
    }
    if (needsFullScan) {
      blockForumAds();
    }
  }

  const startObserver = () => {
    if (!document.body) {
      requestAnimationFrame(startObserver);
      return;
    }
    const observer = new MutationObserver(onMutation);
    observer.observe(document.body, { childList: true, subtree: true });
  };
  startObserver();

  // Also re-scan periodically for the first 10 seconds (catches late-loading ads)
  let scanCount = 0;
  const periodicScan = setInterval(() => {
    blockForumAds();
    scanCount++;
    if (scanCount >= 20) {
      clearInterval(periodicScan);
    }
  }, 500);

  // Export for testing
  if (typeof window !== 'undefined') {
    window.ForumAdBlocker = { blockForumAds, hideAd };
  }
})();
