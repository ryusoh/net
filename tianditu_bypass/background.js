/**
 * Tianditu Hybrid Accelerator
 * Automatically switches between "Fast-Path" (Spoofing) and "Safe-Path" (Proxy).
 * Multi-source fetch for higher reliability.
 */

const SOURCES = [
  {
    name: 'freeproxy.world',
    url: 'https://www.freeproxy.world/?type=&anonymity=&country=CN&speed=1500',
    type: 'freeproxyworld'
  },
  {
    name: 'databay.com',
    url: 'https://databay.com/free-proxy-list/china',
    type: 'databay'
  }
];

const ROTATION_INTERVAL_MINS = 15;

let proxyList = [];
let currentProxyIndex = 0;
const failedHosts = new Set();
let currentProxyServer = '';
let forceProxyMode = false;

/**
 * Clears cookies and session data for Tianditu to un-stick WAF blocks.
 */
async function clearSessionState() {
  console.log('[Tianditu] Clearing session state to reset WAF reputation...');
  const domains = ['tianditu.gov.cn', 'tianditu.cn'];

  for (const domain of domains) {
    // Clear cookies
    const cookies = await chrome.cookies.getAll({ domain });
    for (const cookie of cookies) {
      const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
      await chrome.cookies.remove({ url, name: cookie.name });
    }
  }

  // Clear cache for these origins
  await chrome.browsingData.remove(
    {
      origins: domains.map((d) => `https://map.${d}`)
    },
    { cache: true }
  );
}

/**
 * Updates the PAC script.
 */
function updateProxySettings(server) {
  currentProxyServer = server;
  const failedHostsList = Array.from(failedHosts)
    .map((h) => `"${h}"`)
    .join(',');

  const config = {
    mode: 'pac_script',
    pacScript: {
      data: `
        const failedHosts = [${failedHostsList}];
        const forceProxy = ${forceProxyMode};
        function FindProxyForURL(url, host) {
          if (shExpMatch(host, "*.tianditu.gov.cn") || shExpMatch(host, "*.tianditu.cn") || host === "tianditu.gov.cn" || host === "tianditu.cn") {
            // If we are in force mode or if this specific host failed before
            if (forceProxy || failedHosts.indexOf(host) !== -1) {
              return "${server}";
            }
            // Try DIRECT first (Fast-Path headers injected by DNR)
            return "DIRECT";
          }
          return "DIRECT";
        }
      `
    }
  };

  chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
    const mode = forceProxyMode ? 'FORCE PROXY' : 'HYBRID';
    console.log(`[Tianditu] ${mode} config updated. Proxy: ${server}. Failed: ${failedHosts.size}`);
    chrome.action.setBadgeText({ text: forceProxyMode ? 'PRX' : 'ACC' });
    chrome.action.setBadgeBackgroundColor({ color: forceProxyMode ? '#F44336' : '#4CAF50' });
  });
}

// Listen for 418 (WAF Block) or Connection Reset to trigger failover
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.statusCode === 418) {
      const host = new URL(details.url).hostname;
      console.warn(`[Tianditu] 418 Block detected for ${host}.`);

      if (!failedHosts.has(host)) {
        failedHosts.add(host);
        // If the main frame is blocked, we switch to force proxy mode for the session
        if (details.type === 'main_frame') {
          forceProxyMode = true;
          clearSessionState();
        }
        updateProxySettings(currentProxyServer);
      }
    }
  },
  { urls: ['*://*.tianditu.gov.cn/*', '*://*.tianditu.cn/*'] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    const host = new URL(details.url).hostname;
    if (!failedHosts.has(host)) {
      console.warn(`[Tianditu] Connection failure (${details.error}) for ${host}.`);
      failedHosts.add(host);
      updateProxySettings(currentProxyServer);
    }
  },
  { urls: ['*://*.tianditu.gov.cn/*', '*://*.tianditu.cn/*'] }
);

// Manual reset/toggle via extension icon click
chrome.action.onClicked.addListener(() => {
  forceProxyMode = !forceProxyMode;
  if (forceProxyMode) {
    clearSessionState();
  } else {
    failedHosts.clear();
  }
  updateProxySettings(currentProxyServer);
});

chrome.proxy.onProxyError.addListener((details) => {
  if (details.fatal) {
    console.warn('[Tianditu] Fatal proxy error, rotating...');
    tryNextProxy();
  }
});

function tryNextProxy() {
  currentProxyIndex++;
  if (currentProxyIndex < proxyList.length) {
    const p = proxyList[currentProxyIndex];
    updateProxySettings(`${p.scheme} ${p.ip}:${p.port}`);
  } else {
    refreshProxy();
  }
}

let offscreenLock = null;

async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) {
    return;
  }
  if (offscreenLock) {
    return offscreenLock;
  }

  offscreenLock = (async () => {
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
  })();

  try {
    await offscreenLock;
  } finally {
    offscreenLock = null;
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
    const start = Date.now();
    await ensureOffscreenDocument();
    const fetchResult = await sendMessageToOffscreen({ type: 'FETCH_HTML', url: source.url });
    if (!fetchResult || fetchResult.error) {
      return [];
    }

    const html = fetchResult.html;
    const fetchTime = Date.now() - start;
    const result = await sendMessageToOffscreen({
      type: 'PARSE_PROXIES_MULTI',
      html: html,
      sourceType: source.type
    });

    if (result && result.proxies && result.proxies.length > 0) {
      const avg = Math.round(
        result.proxies.reduce((a, b) => a + b.speed, 0) / result.proxies.length
      );
      const min = Math.min(...result.proxies.map((p) => p.speed));
      console.log(
        `[BENCHMARK] ${source.name}: Found ${result.proxies.length} proxies in ${fetchTime}ms. Avg: ${avg}ms. Fastest: ${min}ms.`
      );
    }
    return result.proxies || [];
  } catch (e) {
    console.error(`[BENCHMARK] ${source.name} failed: ${e.message}`);
    return [];
  }
}

async function refreshProxy() {
  console.log('[Tianditu] Refreshing proxy list...');
  try {
    await ensureOffscreenDocument();
    const results = await Promise.all(SOURCES.map((s) => fetchFromSource(s)));
    const allProxies = results.flat();

    if (allProxies.length > 0) {
      proxyList = allProxies.sort((a, b) => a.speed - b.speed);
      currentProxyIndex = 0;
      updateProxySettings(`${proxyList[0].scheme} ${proxyList[0].ip}:${proxyList[0].port}`);
    }
  } catch (e) {
    console.error('[Tianditu] Failed to refresh proxies:', e);
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
