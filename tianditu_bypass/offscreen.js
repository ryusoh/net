/**
 * Tianditu Auto-Proxy - Offscreen Parser
 * Parses the proxy list from multiple sources.
 */

function parseFreeproxyworld(doc) {
  let rows = Array.from(doc.querySelectorAll('table.layui-table tbody tr'));
  if (rows.length === 0) {
    rows = Array.from(doc.querySelectorAll('table tbody tr'));
  }
  if (rows.length === 0) {
    rows = Array.from(doc.querySelectorAll('tr')).slice(1);
  }

  return rows
    .map((row) => {
      const cols = row.querySelectorAll('td');
      if (cols.length < 6) {return null;}

      const ip = cols[0].textContent.trim();
      const port = cols[1].textContent.trim();
      const typeText = cols[5].textContent.trim().toUpperCase();
      const speedText = cols[4].textContent.trim();
      const speed = parseInt(speedText.replace(/[^0-9]/g, '')) || 9999;

      let scheme = 'PROXY';
      if (typeText.includes('SOCKS5')) {scheme = 'SOCKS5';} else if (typeText.includes('SOCKS4')) {scheme = 'SOCKS4';} else if (typeText.includes('HTTPS')) {scheme = 'HTTPS';}

      return { ip, port, scheme, speed };
    })
    .filter((p) => p && p.ip && p.port && p.ip.includes('.') && !isNaN(parseInt(p.port)));
}

function parseDatabay(doc) {
  // Databay uses a more modern Tailwind table structure.
  // Looking for rows inside the main table.
  const rows = Array.from(doc.querySelectorAll('table tr')).slice(1);

  return rows
    .map((row) => {
      const cols = row.querySelectorAll('td');
      if (cols.length < 4) {return null;}

      const ip = cols[0].textContent.trim();
      const port = cols[1].textContent.trim();
      const typeText = cols[2].textContent.trim().toUpperCase();
      const speedText = cols[3].textContent.trim();
      const speed = parseInt(speedText.replace(/[^0-9]/g, '')) || 9999;

      let scheme = 'PROXY';
      if (typeText.includes('SOCKS5')) {scheme = 'SOCKS5';} else if (typeText.includes('SOCKS4')) {scheme = 'SOCKS4';} else if (typeText.includes('HTTPS')) {scheme = 'HTTPS';}

      return { ip, port, scheme, speed };
    })
    .filter((p) => p && p.ip && p.port && p.ip.includes('.') && !isNaN(parseInt(p.port)));
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "FETCH_HTML") {
    console.log(`[OFFSCREEN] Fetching ${request.url}...`);
    fetch(request.url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': request.url
      }
    })

    .then(r => {
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      }
      return r.text();
    })
    .then(html => sendResponse({ html }))
    .catch(e => {
      console.error(`[OFFSCREEN] Fetch error for ${request.url}:`, e);
      sendResponse({ error: e.toString() });
    });
    return true;
  }

  if (request.type === 'PARSE_PROXIES_MULTI') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(request.html, 'text/html');

      let proxies = [];
      if (request.sourceType === 'freeproxyworld') {
        proxies = parseFreeproxyworld(doc);
      } else if (request.sourceType === 'databay') {
        proxies = parseDatabay(doc);
      }

      sendResponse({ proxies: proxies });
    } catch (e) {
      console.error('[OFFSCREEN] Parsing error:', e);
      sendResponse({ error: e.toString(), proxies: [] });
    }
    return true;
  }
});
