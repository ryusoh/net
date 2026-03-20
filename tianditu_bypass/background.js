/**
 * Tianditu Proxy Accelerator
 * Optimized for use with a dedicated NAS or VPS proxy.
 * Routes all tianditu traffic through the designated proxy server.
 */

const SOURCES = [
  {
    name: 'Home NAS Proxy',
    url: 'http://10.0.0.169:8080',
    type: 'nas'
  },
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

/**
 * Updates the PAC script.
 */
function updateProxySettings(server) {
  const config = {
    mode: 'pac_script',
    pacScript: {
      data: `
        function FindProxyForURL(url, host) {
          if (shExpMatch(host, "*.tianditu.gov.cn") || shExpMatch(host, "*.tianditu.cn") || host === "tianditu.gov.cn" || host === "tianditu.cn") {
            return "${server}";
          }
          return "DIRECT";
        }
      `
    }
  };

  chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
    console.log(`[Tianditu] Proxy active: ${server}`);
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  });
}

/**
 * Notifies the Home NAS of the top discovered Chinese proxies.
 */
async function notifyNAS(proxies) {
  console.log(`[Tianditu] Notifying NAS of ${proxies.length} top exit nodes.`);
  try {
    await fetch('http://10.0.0.169:8081', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxies })
    });
  } catch (e) {
    console.warn('[Tianditu] Failed to notify NAS. Is updater.py running?', e.message);
  }
}

chrome.proxy.onProxyError.addListener((details) => {
  if (details.fatal) {
    console.warn('[Tianditu] Proxy error, rotating...');
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
  if (await chrome.offscreen.hasDocument()) return;
  if (offscreenLock) return offscreenLock;

  offscreenLock = (async () => {
    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['DOM_PARSER'],
        justification: 'Fetch and parse proxies'
      });
    } catch (e) {
      if (!e.message.includes('Only a single offscreen document')) throw e;
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
      if (response) return response;
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}

async function fetchFromSource(source) {
  try {
    const start = Date.now();
    await ensureOffscreenDocument();
    const fetchResult = await sendMessageToOffscreen({ type: 'FETCH_HTML', url: source.url });
    if (!fetchResult || fetchResult.error) return [];

    const html = fetchResult.html;
    const fetchTime = Date.now() - start;
    const result = await sendMessageToOffscreen({ type: 'PARSE_PROXIES_MULTI', html: html, sourceType: source.type });

    if (result && result.proxies && result.proxies.length > 0) {
      const avg = Math.round(result.proxies.reduce((a, b) => a + b.speed, 0) / result.proxies.length);
      const min = Math.min(...result.proxies.map((p) => p.speed));
      console.log(`[BENCHMARK] ${source.name}: Found ${result.proxies.length} proxies in ${fetchTime}ms. Avg: ${avg}ms. Fastest: ${min}ms.`);
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
    const results = await Promise.all(
      SOURCES.filter((s) => s.type !== 'nas').map((s) => fetchFromSource(s))
    );
    const fetchedProxies = results.flat();

    const nasProxy = {
      ip: '10.0.0.169',
      port: '8080',
      scheme: 'PROXY',
      speed: 10,
      name: 'Home NAS'
    };

    if (fetchedProxies.length > 0) {
      const sorted = fetchedProxies.sort((a, b) => a.speed - b.speed);
      proxyList = [nasProxy, ...sorted];
      notifyNAS(sorted.slice(0, 3));
    } else {
      proxyList = [nasProxy];
    }

    currentProxyIndex = 0;
    updateProxySettings(`${proxyList[0].scheme} ${proxyList[0].ip}:${proxyList[0].port}`);
  } catch (e) {
    console.error('[Tianditu] Failed to refresh proxies:', e);
  }
}

chrome.alarms.create('refreshProxy', { periodInMinutes: ROTATION_INTERVAL_MINS });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'refreshProxy') refreshProxy(); });
chrome.runtime.onInstalled.addListener(refreshProxy);
chrome.runtime.onStartup.addListener(refreshProxy);
