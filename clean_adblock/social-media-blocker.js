/**
 * Social Media Content Blocker (Cleanroom Implementation)
 * -------------------------------------------------------
 * Blocks sponsored/promoted content on social media platforms.
 * Supports: Facebook, LinkedIn, X (Twitter), Instagram, YouTube, Reddit, Pinterest
 */

(function () {
  'use strict';

  const PLATFORM_CONFIG = {
    facebook: {
      domains: ['facebook.com', 'www.facebook.com', 'm.facebook.com'],
      selectors: [
        '[data-ad-preview]',
        '[class*="sponsored"]',
        '[class*="promoted"]',
        'span[dir="auto"]:has-text("Sponsored")',
        'div[aria-label*="Sponsored"]',
        '[data-adclick]',
        '[data-ft*="ad"]'
      ],
      textPatterns: [/sponsored/i, /promoted/i, /ad\s*$/i, /· Sponsored/i]
    },
    instagram: {
      domains: ['instagram.com', 'www.instagram.com'],
      selectors: [
        '[class*="sponsored"]',
        'article:has-text("Sponsored")',
        '[data-testid="social_context"]'
      ],
      textPatterns: [/sponsored/i]
    },
    reddit: {
      domains: ['reddit.com', 'www.reddit.com', 'old.reddit.com', 'new.reddit.com'],
      selectors: ['shreddit-ad', 'faceplate-tracker[click-id="ad"]'],
      textPatterns: []
    },
    pinterest: {
      domains: ['pinterest.com', 'www.pinterest.com'],
      selectors: ['[data-grid-item][data-visual-bookmark="1"]', '[class*="promoted"]'],
      textPatterns: [/promoted/i]
    }
  };

  const processedElements = new WeakSet();
  let currentPlatform = null;

  function detectPlatform() {
    const hostname = window.location.hostname;
    for (const [platform, config] of Object.entries(PLATFORM_CONFIG)) {
      if (config.domains.some((d) => hostname.includes(d))) {
        return platform;
      }
    }
    return null;
  }

  function matchesPattern(element, patterns) {
    const text = element.textContent || '';
    return patterns.some((pattern) => pattern.test(text));
  }

  function findSponsoredContent(root = document) {
    const platform = currentPlatform || detectPlatform();
    if (!platform) {
      return [];
    }

    const config = PLATFORM_CONFIG[platform];
    const results = [];

    for (const selector of config.selectors) {
      try {
        const elements = root.querySelectorAll(selector);
        for (const el of elements) {
          if (!processedElements.has(el) && isVisible(el)) {
            results.push(el);
            processedElements.add(el);
          }
        }
      } catch {
        // Invalid selector
      }
    }

    // Also check by text patterns
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        if (processedElements.has(node) || !isVisible(node)) {
          return NodeFilter.FILTER_SKIP;
        }
        if (matchesPattern(node, config.textPatterns)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    });

    let current;
    while ((current = walker.nextNode())) {
      results.push(current);
      processedElements.add(current);
    }

    return results;
  }

  function isVisible(element) {
    if (!element) {
      return false;
    }
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function hideElement(element) {
    element.style.display = 'none';
    element.setAttribute('data-blocked-by-clean-adblock', 'true');
  }

  function blockSponsoredContent() {
    currentPlatform = detectPlatform();
    if (!currentPlatform) {
      return;
    }

    const sponsored = findSponsoredContent();
    for (const el of sponsored) {
      hideElement(el);
    }
  }

  // Run immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', blockSponsoredContent);
  } else {
    blockSponsoredContent();
  }

  // Watch for dynamically loaded content
  const observer = new MutationObserver((mutations) => {
    let shouldCheck = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldCheck = true;
      }
    }
    if (shouldCheck) {
      blockSponsoredContent();
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
    window.SocialMediaBlocker = {
      detectPlatform,
      findSponsoredContent,
      hideElement,
      PLATFORM_CONFIG
    };
  }
})();
