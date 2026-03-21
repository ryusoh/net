/**
 * Twitch Ad Blocker (Cleanroom Implementation)
 * --------------------------------------------
 * Blocks ads on Twitch.tv including:
 * - Pre-roll ads
 * - Mid-roll ads
 * - Banner ads
 * - Overlay ads
 * @global
 */

/* global Response, XMLHttpRequest */
(function () {
  'use strict';

  const AD_SELECTORS = [
    // Ad containers
    '[data-a-target="video-ad-overlay"]',
    '[data-a-target="video-ad-card"]',
    '[data-a-target="video-ad-countdown"]',
    '[class*="AdBanner"]',
    '[class*="ad-banner"]',
    '[data-test-id="ad-banner"]',

    // Overlay ads
    '[class*="overlay-ad"]',
    '[class*="ad-overlay"]',

    // Player ads
    '.video-player__ad-overlay',
    '[data-a-target="player-ad-overlay"]',

    // Sidebar ads
    '[data-a-target="recommended-channel-card"][href*="/ads/"]',
    '[class*="sponsor"]'
  ];

  const AD_URL_PATTERNS = [
    /twitch\.tv\/ads/,
    /ads\.twitch\.tv/,
    /amazon-adsystem\.com/,
    /doubleclick\.net/,
    /vast\.twitch\.tv/
  ];

  const processedElements = new WeakSet();
  let adsBlocked = 0;

  function isAdElement(element) {
    for (const selector of AD_SELECTORS) {
      try {
        if (element.matches(selector) || element.closest(selector)) {
          return true;
        }
      } catch {
        // Invalid selector
      }
    }
    return false;
  }

  function isAdUrl(url) {
    return AD_URL_PATTERNS.some((pattern) => pattern.test(url));
  }

  function hideAd(element) {
    if (processedElements.has(element)) {
      return false;
    }

    element.style.display = 'none';
    element.setAttribute('data-blocked-by-clean-adblock', 'true');
    processedElements.add(element);
    adsBlocked++;
    return true;
  }

  function muteAdIfPlaying() {
    const video = document.querySelector('video');
    if (!video) {
      return false;
    }

    const adOverlay = document.querySelector(
      '[data-a-target="video-ad-overlay"], [data-a-target="video-ad-card"]'
    );
    if (adOverlay && adOverlay.offsetParent !== null) {
      video.muted = true;
      return true;
    }
    return false;
  }

  function trySkipAd() {
    // Try to click the "Skip Ad" button if available
    const skipButton = document.querySelector(
      '[data-a-target="video-ad-skip-button"], button[class*="ad-skip"]'
    );
    if (skipButton && skipButton.offsetParent !== null) {
      skipButton.click();
      return true;
    }
    return false;
  }

  function blockTwitchAds() {
    // Check if we're on Twitch
    if (!window.location.hostname.includes('twitch.tv')) {
      return;
    }

    // Find and hide ad elements
    for (const selector of AD_SELECTORS) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          hideAd(el);
        }
      } catch {
        // Invalid selector
      }
    }

    // Try to skip ads
    trySkipAd();

    // Mute if ad is playing
    muteAdIfPlaying();
  }

  function interceptFetch() {
    if (!window.fetch) {
      return;
    }

    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;

      if (url && isAdUrl(url)) {
        adsBlocked++;
        console.log('[Clean Adblock] Blocked Twitch ad request:', url);
        return Promise.resolve(
          new Response('', {
            status: 200,
            statusText: 'Blocked by Clean Adblock'
          })
        );
      }

      return originalFetch.apply(this, args);
    };
  }

  function interceptXHR() {
    if (!window.XMLHttpRequest) {
      return;
    }

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._url = url;
      return originalOpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (...args) {
      if (this._url && isAdUrl(this._url)) {
        adsBlocked++;
        this.abort();
        return;
      }
      return originalSend.apply(this, args);
    };
  }

  function init() {
    // Intercept network requests
    interceptFetch();
    interceptXHR();

    // Block existing ads
    blockTwitchAds();
  }

  // Run immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Watch for dynamically loaded ads
  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && isAdElement(node)) {
            hideAd(node);
          }
        }
        shouldCheck = true;
      }
    }
    if (shouldCheck) {
      blockTwitchAds();
    }
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Watch for ad state changes
  const adObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const target = mutation.target;
        if (target.classList?.contains('ad-playing') || target.classList?.contains('ad-showing')) {
          muteAdIfPlaying();
          trySkipAd();
        }
      }
    }
  });

  // Observe video player for ad state changes
  const player = document.querySelector('[data-a-target="video-player"]');
  if (player) {
    adObserver.observe(player, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  // Export for testing
  if (typeof window !== 'undefined') {
    window.TwitchAdBlocker = {
      blockTwitchAds,
      trySkipAd,
      muteAdIfPlaying,
      adsBlocked
    };
  }
})();
