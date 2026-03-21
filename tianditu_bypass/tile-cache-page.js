/**
 * Tile Cache - Page-side interceptor (runs in MAIN world)
 * Patches fetch() to route tile requests through the content script bridge.
 */

/* global atob, Response */
(function () {
  const MSG_PREFIX = '__tilecache_';
  const TILE_PATTERNS = [
    /* Any tianditu subdomain serving tiles, images, or WMTS */
    /^https?:\/\/t\d+\.tianditu\.(gov\.)?cn\//i,
    /^https?:\/\/tile\d*\.tianditu\.(gov\.)?cn\//i,
    /^https?:\/\/[^/]*tianditu\.(gov\.)?cn\/.*wmts\?/i,
    /^https?:\/\/[^/]*tianditu\.(gov\.)?cn\/.*vts\?/i,
    /^https?:\/\/[^/]*tianditu\.(gov\.)?cn\/.*\/tile/i,
    /^https?:\/\/[^/]*tianditu\.(gov\.)?cn\/.*\.(png|jpg|jpeg|webp|pbf)(\?|$)/i
  ];
  const pendingRequests = {};
  let reqCounter = 0;

  function isTileUrl(url) {
    return TILE_PATTERNS.some(function (re) {
      return re.test(url);
    });
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window) {
      return;
    }
    if (!event.data || event.data.type !== MSG_PREFIX + 'response') {
      return;
    }
    const pending = pendingRequests[event.data.id];
    if (pending) {
      delete pendingRequests[event.data.id];
      pending(event.data);
    }
  });

  function requestFromCache(url) {
    return new Promise(function (resolve) {
      const id = ++reqCounter;
      const timer = setTimeout(function () {
        delete pendingRequests[id];
        resolve({ hit: false });
      }, 6000);
      pendingRequests[id] = function (data) {
        clearTimeout(timer);
        resolve(data);
      };
      window.postMessage({ type: MSG_PREFIX + 'request', id: id, url: url }, '*');
    });
  }

  function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)[1];
    const raw = atob(parts[1]);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      arr[i] = raw.charCodeAt(i);
    }
    return new Blob([arr], { type: mime });
  }

  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!isTileUrl(url)) {
      return originalFetch.call(this, input, init);
    }
    return requestFromCache(url).then(function (result) {
      if (result.hit) {
        const blob = dataUrlToBlob(result.data);
        return new Response(blob, {
          status: 200,
          headers: { 'Content-Type': result.contentType }
        });
      }
      return originalFetch.call(window, input, init);
    });
  };

  console.log('[TileCache] Fetch interceptor active');
})();
