/**
 * Tianditu Proxy Accelerator - V2.0
 * Optimized with smart failover and direct-fallback.
 */

const NAS_IP = '10.0.0.169';

const SOURCES = [
  { name: 'Home NAS Proxy', url: `http://${NAS_IP}:8080`, type: 'nas' },
  {
    name: 'NAS Scraped Proxies',
    url: `http://${NAS_IP}:8000/proxies.html`,
    type: 'freeproxyworld'
  },
  {
    name: 'freeproxy.world',
    url: 'https://www.freeproxy.world/?type=&anonymity=&country=CN&speed=1500',
    type: 'freeproxyworld'
  },
  { name: 'databay.com', url: 'https://databay.com/free-proxy-list/china', type: 'databay' }
];

const ROTATION_INTERVAL_MINS = 15;

let proxyList = [];
let currentProxyIndex = 0;
let nasFailureCount = 0;
const MAX_NAS_FAILURES = 2;

/**
 * Updates the PAC script.
 */
function updateProxySettings(server, fallbackServer = null) {
  const config = {
    mode: 'pac_script',
    pacScript: {
      data: `
        function FindProxyForURL(url, host) {
          if (shExpMatch(host, "*.tianditu.gov.cn") || shExpMatch(host, "*.tianditu.cn") || host === "tianditu.gov.cn" || host === "tianditu.cn") {
            // Check for tile requests (usually end in image extensions) to use local cache
            if (shExpMatch(url, "*.[png|jpg|jpeg|webp]*")) {
               var cacheUrl = "${NAS_IP}:8082";
               return "PROXY " + cacheUrl + "; DIRECT";
            }
            // For JSON/Styles, we prioritize the fallback if available
            if (url.indexOf(".json") !== -1 && "${fallbackServer}" !== "null") {
               return "${fallbackServer}; DIRECT";
            }
            // For all else, try primary then fallback then direct
            var chain = "${server}";
            if ("${fallbackServer}" !== "null") chain += "; ${fallbackServer}";
            return chain + "; DIRECT";
          }
          return "DIRECT";
        }
      `
    }
  };

  chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
    console.log(`[Tianditu] Active Chain: ${server} -> Fallback: ${fallbackServer} -> DIRECT`);
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  });
}

/**
 * Notifies the Home NAS of the top discovered Chinese proxies.
 */
async function notifyNAS(proxies) {
  try {
    await fetch(`http://${NAS_IP}:8081`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxies })
    });
  } catch (e) {
    console.warn('[Tianditu] NAS update failed.', e.message);
  }
}

chrome.proxy.onProxyError.addListener((details) => {
  console.warn('[Tianditu] Proxy error:', details.error);
  if (details.fatal) {
    const currentProxy = proxyList[currentProxyIndex];
    if (currentProxy && (currentProxy.ip === NAS_IP || currentProxy.name === 'Home NAS')) {
      nasFailureCount++;
    }
    tryNextProxy();
  }
});

function tryNextProxy() {
  currentProxyIndex++;
  if (currentProxyIndex < proxyList.length) {
    const p = proxyList[currentProxyIndex];

    if ((p.ip === NAS_IP || p.name === 'Home NAS') && nasFailureCount >= MAX_NAS_FAILURES) {
      return tryNextProxy();
    }

    const serverString = `${p.scheme} ${p.ip}:${p.port}`;
    const fallback = proxyList.find(
      (item, idx) => item.type !== 'nas' && idx !== currentProxyIndex
    );
    const fallbackString = fallback ? `${fallback.scheme} ${fallback.ip}:${fallback.port}` : 'null';

    updateProxySettings(serverString, fallbackString);
  } else {
    refreshProxy();
  }
}

// Reuse the existing discovery logic (fetchFromSource, sendMessageToOffscreen, etc.)
// ... (omitted same discovery functions for brevity)

async function refreshProxy() {
  console.log('[Tianditu] Refreshing proxy list...');
  nasFailureCount = 0;
  try {
    await ensureOffscreenDocument();
    const results = await Promise.all(
      SOURCES.filter((s) => s.type !== 'nas').map((s) => fetchFromSource(s))
    );
    const fetchedProxies = results.flat();

    const nasProxy = {
      ip: NAS_IP,
      port: '8080',
      scheme: 'PROXY',
      speed: 10,
      name: 'Home NAS',
      type: 'nas'
    };

    if (fetchedProxies.length > 0) {
      const sorted = fetchedProxies.sort((a, b) => a.speed - b.speed);
      proxyList = [nasProxy, ...sorted];
      notifyNAS(sorted.slice(0, 3));
    } else {
      proxyList = [nasProxy];
    }

    currentProxyIndex = 0;
    const serverString = `${proxyList[0].scheme} ${proxyList[0].ip}:${proxyList[0].port}`;
    const fallback = proxyList.find((item) => item.type !== 'nas');
    const fallbackString = fallback ? `${fallback.scheme} ${fallback.ip}:${fallback.port}` : 'null';

    updateProxySettings(serverString, fallbackString);
  } catch (e) {
    console.error('[Tianditu] Failed to refresh proxies:', e);
  }
}

// ... Same helper functions below
async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) {
    return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Fetch and parse proxies'
    });
  } catch (e) {
    if (!e.message.includes('Only a single offscreen document')) {
      throw e;
    }
  }
}

async function sendMessageToOffscreen(message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await chrome.runtime.sendMessage(message);
      if (response) {
        return response;
      }
    } catch (e) {
      if (i === maxRetries - 1) {
        throw e;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

async function fetchFromSource(source) {
  try {
    await ensureOffscreenDocument();
    const fetchResult = await sendMessageToOffscreen({ type: 'FETCH_HTML', url: source.url });
    if (!fetchResult || fetchResult.error) {
      return [];
    }

    const result = await sendMessageToOffscreen({
      type: 'PARSE_PROXIES_MULTI',
      html: fetchResult.html,
      sourceType: source.type
    });
    return result.proxies || [];
  } catch (e) {
    console.error(`[BENCHMARK] ${source.name} failed: ${e.message}`);
    return [];
  }
}

chrome.alarms.create('refreshProxy', { periodInMinutes: ROTATION_INTERVAL_MINS });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'refreshProxy') {
    refreshProxy();
  }
});
chrome.runtime.onInstalled.addListener(refreshProxy);
chrome.runtime.onStartup.addListener(refreshProxy);
