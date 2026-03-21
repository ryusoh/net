/**
 * Video Streaming Ad Blocker (Cleanroom Implementation)
 * -----------------------------------------------------
 * Blocks ads on video streaming sites by intercepting VAST/VPAID requests
 * and hiding ad containers. Works on most HTML5 video players.
 * @global
 */

/* global Response, XMLHttpRequest */
(function () {
  'use strict';

  // Common video ad server domains
  const AD_SERVER_DOMAINS = [
    'doubleclick.net',
    'googleadservices.com',
    'googlesyndication.com',
    'adservice.google.com',
    'pagead2.googlesyndication.com',
    'tpc.googlesyndication.com',
    'ads.youtube.com',
    's.youtube.com',
    'adnxs.com',
    'adsrvr.org',
    'casalemedia.com',
    'pubmatic.com',
    'rubiconproject.com',
    'openx.net',
    'criteo.com',
    'amazon-adsystem.com',
    'spotxchange.com',
    'free-wheel.tv',
    'v.fwmrm.net',
    'adrecover.com',
    'delivery.adrecover.com'
  ];

  // VAST/VPAID XML patterns
  const VAST_PATTERNS = [/vast/i, /vpaid/i, /adbreak/i, /preroll/i, /midroll/i, /postroll/i];

  // Common ad container selectors
  const AD_CONTAINER_SELECTORS = [
    '[class*="ad-container"]',
    '[class*="video-ad"]',
    '[class*="ad-overlay"]',
    '[id*="ad-container"]',
    '[id*="video-ad"]',
    '.ad-marker',
    '.ad-progress',
    '[class*="sponsor"]'
  ];

  const blockedRequests = new Set();
  let adContainersHidden = 0;

  function isAdDomain(url) {
    try {
      const hostname = new URL(url).hostname;
      return AD_SERVER_DOMAINS.some((domain) => hostname.includes(domain));
    } catch {
      return false;
    }
  }

  function isAdRequest(url) {
    if (isAdDomain(url)) {
      return true;
    }

    for (const pattern of VAST_PATTERNS) {
      if (pattern.test(url)) {
        return true;
      }
    }

    return false;
  }

  function blockAdRequest(url) {
    if (blockedRequests.has(url)) {
      return false;
    }
    blockedRequests.add(url);
    console.log('[Clean Adblock] Blocked ad request:', url);
    return true;
  }

  function hideAdContainers() {
    for (const selector of AD_CONTAINER_SELECTORS) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (el.offsetParent !== null) {
            el.style.display = 'none';
            el.setAttribute('data-blocked-by-clean-adblock', 'true');
            adContainersHidden++;
          }
        }
      } catch {
        // Invalid selector
      }
    }
  }

  function removeAdFromVideo(video) {
    if (!video) {
      return;
    }

    // Remove any ad-related tracks
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (track.label && track.label.toLowerCase().includes('ad')) {
        track.mode = 'hidden';
      }
    }

    // Remove ad overlays
    const overlays = video.parentElement?.querySelectorAll('.ad-overlay, .video-ad-overlay');
    if (overlays) {
      for (const overlay of overlays) {
        overlay.style.display = 'none';
      }
    }
  }

  function interceptFetch() {
    if (!window.fetch) {
      return;
    }

    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;

      if (url && isAdRequest(url)) {
        blockAdRequest(url);
        // Return empty response for ad requests
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
      if (this._url && isAdRequest(this._url)) {
        blockAdRequest(this._url);
        // Abort ad request
        this.abort();
        return;
      }
      return originalSend.apply(this, args);
    };
  }

  function monitorVideoAds() {
    const videos = document.querySelectorAll('video');
    for (const video of videos) {
      removeAdFromVideo(video);

      // Monitor for ad playback
      video.addEventListener('play', () => {
        // Check if currently in ad break
        const adContainer = video.parentElement?.closest('.ad-showing, .video-ads');
        if (adContainer) {
          video.muted = true;
          video.pause();
        }
      });
    }
  }

  function init() {
    // Intercept network requests
    interceptFetch();
    interceptXHR();

    // Hide existing ad containers
    hideAdContainers();

    // Monitor video elements
    monitorVideoAds();
  }

  // Run immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Watch for new ad containers
  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldCheck = true;
      }
    }
    if (shouldCheck) {
      hideAdContainers();
      monitorVideoAds();
    }
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Export for testing
  if (typeof window !== 'undefined') {
    window.VideoStreamAdBlocker = {
      isAdRequest,
      blockAdRequest,
      hideAdContainers,
      blockedRequests,
      adContainersHidden
    };
  }
})();
