/**
 * LinkedIn: Direct Profile Access - Content Script
 * -------------------------------------------
 * Intercepts clicks on "poisoned" recommendation links and redirects
 * to a LinkedIn search for that person to bypass the Premium gatekeeper.
 */

(function () {
  'use strict';

  /**
   * Cleans text by removing LinkedIn-specific noise (degree connections, comment nodes, etc.)
   */
  function cleanLinkedInText(text) {
    if (!text) {
      return '';
    }
    return text
      .replace(/<!---->/g, '') // Remove comment nodes
      .replace(/·/g, '') // Remove middle dots
      .replace(/\b(1st|2nd|3rd|Third degree connection|degree connection)\b/gi, '') // Remove degree markers
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim();
  }

  function handleIntercept(e) {
    // 1. Find the recommendation card container
    const card =
      e.target.closest('#browsemap_recommendation') ||
      e.target.closest('.pv-profile-card__anchor') ||
      e.target.closest('.browsemap-profile') ||
      e.target.closest('.pv-browsemap-section__member-container') ||
      e.target.closest('li.artdeco-list__item') ||
      e.target.closest('.artdeco-list__item');

    if (!card) {
      return;
    }

    // Kill the event immediately to stop LinkedIn's tracking/popup logic
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // 2. Extract the person's identity
    const nameSelectors = [
      'span[aria-hidden="true"]',
      '.name',
      '.actor-name',
      '.pv-browsemap-section__member-name',
      '[data-field="name"]',
      '.artdeco-entity-lockup__title'
    ];

    let name = '';
    let headline = '';

    // Extract Name
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

    // Extract Headline (specifically avoiding the name element we just found)
    const allTextElements = Array.from(
      card.querySelectorAll('span[aria-hidden="true"], .headline, .inline-show-more-text')
    );
    for (const el of allTextElements) {
      const cleaned = cleanLinkedInText(el.innerText || el.textContent);
      if (cleaned.length > 1 && cleaned !== name) {
        headline = cleaned;
        break;
      }
    }

    if (name) {
      const query = encodeURIComponent(`${name} ${headline}`.trim());
      const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${query}`;

      console.log(`[LinkedIn Fix] Bypassing poisoned link for: ${name}. Searching...`);
      window.location.assign(searchUrl);
    } else {
      console.warn('[LinkedIn Fix] Could not extract identifying text from card.');
    }
  }

  // Triple-event capture shield
  ['mousedown', 'click', 'pointerdown'].forEach((eventType) => {
    document.addEventListener(eventType, handleIntercept, true);
  });

  console.log('[LinkedIn Fix] Cleaned Search-Bypass active.');
})();
