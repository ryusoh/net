/**
 * LinkedIn: Direct Profile Access
 * -------------------------------------------
 * Bypasses 'Premium Upsell' on profile recommendations.
 *
 * Strategy (matching proven linkedin_fix approach):
 * 1. Proactive DOM rewrite: MutationObserver rewrites premium links to search URLs
 * 2. Click interception: kills ALL events on recommendation cards, redirects to search
 * 3. Background failover: stores destination via message + session storage
 * @global
 */

/* global Element */
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

  // Card selectors for "More profiles for you" and similar recommendation sections
  const CARD_SELECTORS = [
    '#browsemap_recommendation',
    '.browsemap-profile',
    '.pv-browsemap-section__member-container',
    'li.artdeco-list__item',
    '.discover-entity-type-card',
    '.mn-discovery-card'
  ].join(', ');

  /**
   * Extract person's name + headline from a card and build a search URL.
   * Does NOT use a[href*="/in/"] — those can match the logged-in user's own profile.
   */
  function getDestinationForCard(card) {
    const nameSelectors = [
      'span[aria-hidden="true"]',
      '.name',
      '.actor-name',
      '.pv-browsemap-section__member-name',
      '.artdeco-entity-lockup__title span',
      '.artdeco-entity-lockup__title'
    ];
    let name = '';
    let headline = '';

    for (const selector of nameSelectors) {
      const el = card.querySelector(selector);
      if (el) {
        const cleaned = cleanLinkedInText(el.innerText || el.textContent);
        if (cleaned.length > 1) {
          // Skip button-like text
          if (/^(connect|follow|message|pending|more|dismiss)$/i.test(cleaned)) {
            continue;
          }
          name = cleaned;
          break;
        }
      }
    }

    const allText = Array.from(
      card.querySelectorAll(
        'span[aria-hidden="true"], .headline, .inline-show-more-text, .artdeco-entity-lockup__subtitle'
      )
    );
    for (const el of allText) {
      const cleaned = cleanLinkedInText(el.innerText || el.textContent);
      if (cleaned.length > 1 && cleaned !== name) {
        if (/^(connect|follow|message|pending|more|dismiss)$/i.test(cleaned)) {
          continue;
        }
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
   * Store destination via both channels for race-condition-free failover:
   * 1. chrome.runtime.sendMessage → background in-memory variable (instant)
   * 2. chrome.storage.session → survives service worker restart
   */
  function storeDestination(url) {
    if (!url) {
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: 'LINKEDIN_PROFILE_HOVER', url });
    } catch {
      /* context invalidated */
    }
    try {
      chrome.storage.session.set({ linkedinPendingProfile: url });
    } catch {
      /* fallback */
    }
  }

  // --- Layer 1: Proactive DOM Rewrite ---

  function proactivelyCleanLinks() {
    const cards = document.querySelectorAll(CARD_SELECTORS);
    cards.forEach((card) => {
      const premiumLinks = card.querySelectorAll('a[href*="premium"]');
      if (premiumLinks.length === 0) {
        return;
      }

      const safeUrl = getDestinationForCard(card);
      if (safeUrl) {
        premiumLinks.forEach((link) => {
          link.href = safeUrl;
          link.setAttribute('data-cleaned', 'true');
          link.removeAttribute('data-tracking-control-name');
          link.removeAttribute('data-tracking-will-navigate');
        });
      }
    });
  }

  const observer = new MutationObserver(proactivelyCleanLinks);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  proactivelyCleanLinks();

  // --- Layer 2: Click Interception (kill event on entire card) ---

  function handleIntercept(e) {
    let target = e.target;
    if (!(target instanceof Element)) {
      target = target.parentElement;
    }
    if (!target) {
      return;
    }
    const card = target.closest(CARD_SELECTORS);
    if (!card) {
      return;
    }

    // Only intercept if this card has a premium link (cleaned or not)
    const hasPremium = card.querySelector('a[href*="premium"]');
    const hasCleaned = card.querySelector('a[data-cleaned="true"]');
    if (!hasPremium && !hasCleaned) {
      return;
    }

    // Kill the event completely
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Only navigate on click (not mousedown/pointerdown)
    if (e.type === 'click') {
      const destUrl = getDestinationForCard(card);
      if (destUrl) {
        storeDestination(destUrl);
        console.log('[LinkedIn Fix] Intercepted click ->', destUrl);
        window.location.assign(destUrl);
      }
    }
  }

  ['mousedown', 'click', 'pointerdown', 'touchstart'].forEach((type) => {
    document.addEventListener(type, handleIntercept, true);
  });

  // --- Layer 3: Hover pre-store for background failover ---

  function onHover(e) {
    let target = e.target;
    if (!(target instanceof Element)) {
      target = target.parentElement;
    }
    if (!target) {
      return;
    }
    const card = target.closest(CARD_SELECTORS);
    if (!card) {
      return;
    }
    const url = getDestinationForCard(card);
    if (url) {
      storeDestination(url);
      console.log('[LinkedIn Fix] Stored on hover:', url);
    }
  }

  document.addEventListener('mouseover', onHover, { capture: true, passive: true });

  console.log('[LinkedIn Fix] 3-Layer Shield Active (DOM rewrite + click kill + hover store)');
})();
