/**
 * X: Twitter Bird Replacer
 * -------------------------------------------
 * Restores the classic Twitter bird logo and favicon.
 */

(function () {
  'use strict';

  function replaceFavicon() {
    // Replace all icon-related link tags
    const iconLinks = document.querySelectorAll(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
    );
    let replaced = false;

    iconLinks.forEach((link) => {
      if (!link.href.includes('twitter.png')) {
        link.href = chrome.runtime.getURL('assets/twitter.png');
        replaced = true;
      }
    });

    // If no existing icon links are found, create one
    if (!replaced && iconLinks.length === 0) {
      const target = document.head || document.documentElement;
      if (target) {
        const link = document.createElement('link');
        link.rel = 'shortcut icon';
        link.href = chrome.runtime.getURL('assets/twitter.png');
        target.appendChild(link);
      }
    }
  }

  function replaceLogos() {
    // Array of known X logo SVG paths
    const xPaths = [
      'M21.742 21.75l-7.563-11.179 7.056-8.321h-2.456l-5.691 6.714-4.54-6.714H2.359l7.29 10.776L2.25 21.75h2.456l6.035-7.118 4.818 7.118h6.191-.008zM7.739 3.818L18.81 20.182h-2.447L5.29 3.818h2.447z', // New default logo
      'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' // Old logo just in case
    ];

    xPaths.forEach((xPath) => {
      const paths = document.querySelectorAll(`path[d="${xPath}"]`);
      paths.forEach((p) => {
        const svg = p.closest('svg');
        if (svg) {
          // Always enforce hidden state on the SVG
          svg.style.setProperty('display', 'none', 'important');

          // Check if our replacement image is still right next to it
          const sibling = svg.nextElementSibling;
          if (!sibling || !sibling.classList.contains('twitter-bird-replacement')) {
            const img = document.createElement('img');
            img.src = chrome.runtime.getURL('assets/twitter.png');

            // Copy the SVG's classes so it inherits the exact layout/centering (crucial for the loading screen)
            const svgClasses = svg.getAttribute('class') || '';
            img.className = 'twitter-bird-replacement ' + svgClasses;

            // Base sizing fallback in case classes don't define it
            const rect = svg.getBoundingClientRect();
            if (rect.width > 0) {
              img.style.width = rect.width + 'px';
            }
            if (rect.height > 0) {
              img.style.height = rect.height + 'px';
            }
            if (rect.width === 0 && rect.height === 0 && !svgClasses.includes('r-')) {
              // Only hardcode 24px if it has no width and doesn't seem to have React Native Web classes
              img.style.width = '24px';
              img.style.height = '24px';
            }
            img.style.maxWidth = '100%';
            img.style.objectFit = 'contain';

            // Insert the bird right next to the hidden SVG
            svg.parentNode.insertBefore(img, svg.nextSibling);
          }
        }
      });
    });

    // Replace the title
    if (document.title === 'X') {
      document.title = 'Twitter';
    } else if (document.title.endsWith(' / X')) {
      document.title = document.title.replace(/ \/ X$/, ' / Twitter');
    }
  }

  function loop() {
    replaceFavicon();
    replaceLogos();
  }

  // Run frequently to catch React DOM updates and the initial loading screen
  setInterval(loop, 50);
  loop();
})();
