/**
 * LinkedIn: Direct Profile Access - Content Script
 * -------------------------------------------
 * 1. Proactively cleans poisoned links via MutationObserver.
 * 2. Intercepts clicks as a second layer of defense.
 * 3. Stores the intended destination for background-level failover.
 */

(function () {
  'use strict';

  function cleanLinkedInText(text) {
    if (!text) {
      return '';
    }
    return text
      .replace(/<!---->/g, '')
      .replace(/·/g, '')
      .replace(/\b(1st|2nd|3rd|Third degree connection|degree connection)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Identifies a person in a card and constructs their search URL.
   */
  function getDestinationForCard(card) {
    const nameSelectors = [
      'span[aria-hidden="true"]',
      '.name',
      '.actor-name',
      '.pv-browsemap-section__member-name'
    ];
    let name = '';
    let headline = '';

    for (const selector of nameSelectors) {
      const el = card.querySelector(selector);
      if (el) {
        const cleaned = cleanLinkedInText(el.innerText || el.textContent);
        if (cleaned.length > 1) {
          name = cleaned;
          break;
        }
      }
    }

    const allText = Array.from(
      card.querySelectorAll('span[aria-hidden="true"], .headline, .inline-show-more-text')
    );
    for (const el of allText) {
      const cleaned = cleanLinkedInText(el.innerText || el.textContent);
      if (cleaned.length > 1 && cleaned !== name) {
        headline = cleaned;
        break;
      }
    }

    if (name) {
      const query = encodeURIComponent(`${name} ${headline}`.trim());
      return `https://www.linkedin.com/search/results/people/?keywords=${query}`;
    }
    return null;
  }

  /**
   * Physically rewrites poisoned links in the DOM to be safe.
   */
  function proactivelyCleanLinks() {
    const cards = document.querySelectorAll(
      '#browsemap_recommendation, .browsemap-profile, .pv-browsemap-section__member-container, li.artdeco-list__item'
    );
    cards.forEach((card) => {
      const links = card.querySelectorAll('a[href*="premium/"]');
      if (links.length > 0) {
        const safeUrl = getDestinationForCard(card);
        if (safeUrl) {
          links.forEach((link) => {
            link.href = safeUrl;
            link.setAttribute('data-cleaned', 'true');
          });
        }
      }
    });
  }

  function handleIntercept(e) {
    const card = e.target.closest(
      '#browsemap_recommendation, .browsemap-profile, .pv-browsemap-section__member-container, li.artdeco-list__item'
    );
    if (!card) {
      return;
    }

    // Always kill the event first
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const destUrl = getDestinationForCard(card);
    if (destUrl) {
      console.log('[LinkedIn Fix] Redirecting to safe destination:', destUrl);
      // Store intended destination for background script failover
      chrome.storage.local.set({ lastPendingProfile: destUrl });
      window.location.assign(destUrl);
    }
  }

  // Layer 1: Proactive Cleaning (DOM-level rewrite)
  const observer = new MutationObserver(proactivelyCleanLinks);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  proactivelyCleanLinks();

  // Layer 2: Click Shield (Event-level interception)
  ['mousedown', 'click', 'pointerdown', 'touchstart'].forEach((type) => {
    document.addEventListener(type, handleIntercept, true);
  });

  console.log('[LinkedIn Fix] Dual-Layer Shield (Observer + Shield) Active.');
})();
