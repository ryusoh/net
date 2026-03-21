/**
 * Tianditu Tile Cache Interceptor (content script - ISOLATED world)
 * ------------------------------------------------------------------
 * 1. Injects tile-cache-page.js into MAIN world via <script src> (CSP-safe)
 * 2. Bridges page <-> background service worker <-> NAS cache
 *    (background fetch avoids both CORS and mixed content restrictions)
 */

(function () {
  'use strict';

  const MSG_PREFIX = '__tilecache_';

  /* --- Bridge: page -> content script -> background -> NAS cache --- */

  window.addEventListener('message', async function (event) {
    if (event.source !== window) {
      return;
    }
    if (!event.data || event.data.type !== MSG_PREFIX + 'request') {
      return;
    }

    const { id, url } = event.data;

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'TILE_CACHE_FETCH',
        url: url
      });

      if (result && result.hit) {
        window.postMessage(
          {
            type: MSG_PREFIX + 'response',
            id: id,
            hit: true,
            data: result.data,
            contentType: result.contentType
          },
          '*'
        );
        return;
      }
    } catch {
      /* Background unavailable */
    }

    window.postMessage(
      {
        type: MSG_PREFIX + 'response',
        id: id,
        hit: false
      },
      '*'
    );
  });

  /* --- Inject page-side script via <script src> (CSP-safe) --- */

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('tile-cache-page.js');
  (document.head || document.documentElement).appendChild(script);
  script.onload = function () {
    script.remove();
  };

  console.log('[TileCache] Content script ready');
})();
