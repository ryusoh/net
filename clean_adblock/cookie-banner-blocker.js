/**
 * Cookie Banner Blocker (Cleanroom Implementation)
 * ------------------------------------------------
 * Automatically detects and handles cookie consent banners.
 * Features:
 * - Auto-dismiss cookie banners by clicking accept/reject buttons
 * - Hide common cookie banner elements
 * - Support for major CMP (Consent Management Platform) providers
 */

(function () {
  'use strict';

  // Skip complex SPAs where broad selectors cause breakage
  const EXCLUDED_DOMAINS = [
    'x.com',
    'twitter.com',
    'facebook.com',
    'instagram.com',
    'reddit.com',
    'youtube.com',
    'linkedin.com'
  ];
  const host = window.location.hostname;
  if (EXCLUDED_DOMAINS.some((d) => host === d || host.endsWith('.' + d))) {
    return;
  }

  // Common cookie banner selectors (cleanroom - based on common patterns)
  const COOKIE_BANNER_SELECTORS = [
    // Generic selectors
    '[class*="cookie"]',
    '[class*="consent"]',
    '[class*="gdpr"]',
    '[class*="banner"]',
    '[id*="cookie"]',
    '[id*="consent"]',
    '[id*="gdpr"]',

    // Common CMP providers
    '.onetrust-banner-container',
    '#onetrust-banner-sdk',
    '.cmp-app-banner',
    '#usercentrics-root',
    '.didomi-popup',
    '#didomi-popup',
    '.quantcast-choice',
    '#quantcast-choice',
    '.eu-cookie-compliance-banner',
    '.cookie-notice',
    '.cookie-notification',
    '.cookie-policy-banner',
    '[aria-label*="cookie"]',
    '[aria-label*="consent"]',

    // Push notification prompts (OneSignal)
    '#onesignal-slidedown-dialog',
    '.onesignal-slidedown-dialog',
    '#onesignal-popover-container',
    '.onesignal-customlink-container',
    '#onesignal-container',

    // 1point3acres.com specific elements
    '.deal-card',
    'iframe[src*="adrecover.com"]',
    '#iframe-ad-container'
  ];

  // Button selectors for auto-dismiss
  const ACCEPT_BUTTONS = [
    '[class*="accept"]',
    '[class*="agree"]',
    '[class*="allow"]',
    '[class*="ok"]',
    '[class*="confirm"]',
    '[id*="accept"]',
    '[id*="agree"]',
    '[id*="allow"]',
    'button[aria-label*="accept"]',
    'button[aria-label*="agree"]',
    '[data-action*="accept"]',
    '[data-action*="agree"]'
  ];

  const REJECT_BUTTONS = [
    '[class*="reject"]',
    '[class*="decline"]',
    '[class*="deny"]',
    '[id*="reject"]',
    '[id*="decline"]',
    '[id*="deny"]',
    'button[aria-label*="reject"]',
    'button[aria-label*="decline"]',
    '[data-action*="reject"]',
    '[data-action*="deny"]'
  ];

  const processedBanners = new Set();

  function findCookieBanner() {
    for (const selector of COOKIE_BANNER_SELECTORS) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (isCookieBanner(el)) {
            return el;
          }
        }
      } catch {
        // Invalid selector, skip
      }
    }
    return null;
  }

  function isCookieBanner(element) {
    const text = element.textContent.toLowerCase();
    const keywords = [
      'cookie',
      'consent',
      'gdpr',
      'privacy',
      'tracking',
      'analytics',
      'personalize',
      'accept',
      'decline'
    ];

    const matchCount = keywords.filter((k) => text.includes(k)).length;
    return matchCount >= 2 && element.offsetHeight > 100;
  }

  function findButton(container, buttonSelectors) {
    for (const selector of buttonSelectors) {
      try {
        const buttons = container.querySelectorAll(selector);
        for (const btn of buttons) {
          if (isVisible(btn)) {
            return btn;
          }
        }
      } catch {
        // Invalid selector, skip
      }
    }
    return null;
  }

  function isVisible(element) {
    if (!element) {
      return false;
    }
    const style = window.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      element.offsetWidth > 0 &&
      element.offsetHeight > 0
    );
  }

  function dismissBanner(banner) {
    const bannerId = banner.id || banner.className || 'unknown';
    if (processedBanners.has(bannerId)) {
      return;
    }

    // Try to click accept button first, then reject, then just hide
    const acceptBtn = findButton(banner, ACCEPT_BUTTONS);
    const rejectBtn = findButton(banner, REJECT_BUTTONS);

    if (acceptBtn) {
      acceptBtn.click();
      processedBanners.add(bannerId);
      return true;
    }

    if (rejectBtn) {
      rejectBtn.click();
      processedBanners.add(bannerId);
      return true;
    }

    // If no button found, hide the banner
    banner.style.display = 'none';
    processedBanners.add(bannerId);
    return true;
  }

  function blockCookieBanner() {
    const banner = findCookieBanner();
    if (banner) {
      dismissBanner(banner);
    }
  }

  // Run immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', blockCookieBanner);
  } else {
    blockCookieBanner();
  }

  // Watch for dynamically added banners
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        blockCookieBanner();
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Export for testing
  if (typeof window !== 'undefined') {
    window.CookieBannerBlocker = {
      findCookieBanner,
      dismissBanner,
      processedBanners
    };
  }
})();
