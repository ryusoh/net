/**
 * YouTube Ad Blocker (Cleanroom Implementation)
 * ---------------------------------------------
 * Blocks ads on YouTube including:
 * - Video ads (pre-roll, mid-roll, post-roll)
 * - Banner ads
 * - Overlay ads
 * - Sponsored cards
 */

(function () {
  'use strict';

  const AD_SELECTORS = [
    // Video ad containers
    '.ad-showing',
    '.video-ads',
    'ytd-ad-slot-renderer',
    'ytd-promoted-video-renderer',
    'ytd-compact-promoted-video-renderer',
    '.ytd-promoted-sparkles-web-renderer',

    // Banner ads
    '#masthead-ad',
    '#player-ads',
    'ytd-statement-banner-renderer',

    // Overlay ads
    '.ytp-ad-overlay-container',
    '.ytp-ad-image-overlay',
    '.ytp-ad-text-overlay',

    // Sponsored content in feed
    'ytd-ad-slot-renderer',
    '[class*="promoted"]'
  ];

  const AD_ATTRIBUTE_PATTERNS = [
    'data-ad-impressions',
    'data-ad-url',
    'data-visiting',
    'data-renderer-type="ad"'
  ];

  const processedElements = new WeakSet();
  let adBlockedCount = 0;

  function isAdElement(element) {
    // Check class names
    const className = element.className || '';
    if (className.includes('ad-showing') || className.includes('video-ads')) {
      return true;
    }

    // Check data attributes
    for (const pattern of AD_ATTRIBUTE_PATTERNS) {
      if (element.hasAttribute(pattern.split('=')[0])) {
        return true;
      }
    }

    // Check if element matches ad selectors
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

  function hideAd(element) {
    if (processedElements.has(element)) {
      return false;
    }

    element.style.display = 'none';
    element.setAttribute('data-blocked-by-clean-adblock', 'true');
    processedElements.add(element);
    adBlockedCount++;

    // Also remove parent ad containers if they exist
    const parentAd = element.closest('.ad-showing, .video-ads');
    if (parentAd && !processedElements.has(parentAd)) {
      parentAd.style.display = 'none';
      processedElements.add(parentAd);
    }

    return true;
  }

  function skipAdIfPlaying() {
    // Try to click the skip ad button
    const skipButton = document.querySelector(
      '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, button.ytp-ad-skip-button'
    );
    if (skipButton && skipButton.offsetParent !== null) {
      skipButton.click();
      return true;
    }
    return false;
  }

  function muteAdIfPlaying() {
    // Mute ad if skip is not available
    const video = document.querySelector('video');
    if (video && document.querySelector('.ad-showing')) {
      video.muted = true;
      return true;
    }
    return false;
  }

  function blockYouTubeAds() {
    // Check if we're on YouTube
    if (!window.location.hostname.includes('youtube.com')) {
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

    // Try to skip any playing ads
    skipAdIfPlaying();

    // Check for ad-showing class on video container
    const adContainer = document.querySelector('.ad-showing');
    if (adContainer) {
      muteAdIfPlaying();
    }
  }

  // Run immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', blockYouTubeAds);
  } else {
    blockYouTubeAds();
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
      blockYouTubeAds();
    }
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Watch for ad-showing class changes
  const classObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        if (target.classList.contains('ad-showing')) {
          muteAdIfPlaying();
          skipAdIfPlaying();
        }
      }
    }
  });

  // Observe video element for class changes
  const video = document.querySelector('video');
  if (video && video.parentElement) {
    classObserver.observe(video.parentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  // Export for testing
  if (typeof window !== 'undefined') {
    window.YouTubeAdBlocker = {
      blockYouTubeAds,
      skipAdIfPlaying,
      muteAdIfPlaying,
      adBlockedCount
    };
  }
})();
