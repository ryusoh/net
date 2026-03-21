const updateBadge = () => {
  if (typeof chrome !== 'undefined' && chrome.action && chrome.storage) {
    chrome.storage.sync.get({ enabled: true, mode: 'selective' }, (prefs) => {
      const isEnabled = prefs.enabled !== false;
      const mode = prefs.mode || 'selective';
      if (!isEnabled) {
        chrome.action.setBadgeText({ text: 'OFF' });
        chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
      } else {
        chrome.action.setBadgeText({ text: mode === 'all' ? 'ON' : 'SEL' });
        chrome.action.setBadgeBackgroundColor({
          color: mode === 'all' ? '#4CAF50' : '#2196F3'
        });
      }
    });
  }
};

let isUpdatingRules = false;
const updateBlockingRules = async (hostnames) => {
  if (isUpdatingRules) {
    return;
  }
  isUpdatingRules = true;
  try {
    const uniqueHosts = Array.from(new Set(hostnames || [])).filter((h) => h && h.trim());
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules.map((r) => r.id);
    const addRules = [];

    if (uniqueHosts.length > 0) {
      uniqueHosts.forEach((host, i) => {
        const baseId = i * 2 + 1;
        addRules.push({
          id: baseId,
          priority: 1,
          action: { type: 'block' },
          condition: { urlFilter: `||${host}/*`, resourceTypes: ['script'] }
        });
        addRules.push({
          id: baseId + 1,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            responseHeaders: [
              {
                header: 'content-security-policy',
                operation: 'set',
                value: "script-src 'none'; object-src 'none';"
              }
            ]
          },
          condition: { urlFilter: `||${host}/*`, resourceTypes: ['main_frame', 'sub_frame'] }
        });
      });
    }

    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  } catch (e) {
    console.error('DNR Update Error:', e);
  } finally {
    isUpdatingRules = false;
  }
};

// Ad network domains to block at the network level
const AD_NETWORK_DOMAINS = [
  'adrecover.com',
  'adpushup.com',
  'publift.com',
  'vdo.ai',
  'primis.tech',
  'undrads.com',
  'fundingchoicesmessages.google.com',
  'adservice.google.com'
];

async function setupAdNetworkBlocking() {
  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    // Use IDs 9000+ to avoid conflicts with jsBlocked rules
    const adRuleIds = existingRules.filter((r) => r.id >= 9000).map((r) => r.id);

    const addRules = AD_NETWORK_DOMAINS.map((domain, i) => ({
      id: 9000 + i,
      priority: 2,
      action: { type: 'block' },
      condition: {
        urlFilter: `||${domain}`,
        resourceTypes: ['script', 'sub_frame', 'xmlhttprequest', 'image', 'other']
      }
    }));

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: adRuleIds,
      addRules
    });
  } catch (e) {
    console.error('Ad network blocking setup failed:', e);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    try {
      chrome.storage.sync.set({
        enabled: true,
        mode: 'selective',
        whitelist: [],
        blacklist: [],
        jsBlocked: ['bild.de'],
        // Feature toggles for new integrated features
        features: {
          cookieBannerBlocker: true,
          socialMediaBlocker: true,
          youtubeAdBlocker: true,
          videoStreamAdBlocker: true,
          twitchAdBlocker: true,
          forumAdBlocker: true
        }
      });
    } catch (e) {
      console.error('Background onInstalled storage set failed:', e);
    }
  }
  setupAdNetworkBlocking();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    try {
      if (changes.enabled || changes.mode) {
        updateBadge();
      }
      if (changes.jsBlocked) {
        updateBlockingRules(changes.jsBlocked.newValue || []);
      }
    } catch (e) {
      console.error('Background storage onChanged handler failed:', e);
    }
  }
});

// Initialize on startup
try {
  chrome.storage.sync.get(['enabled', 'mode', 'jsBlocked'], (prefs) => {
    if (
      typeof chrome === 'undefined' ||
      !chrome.storage ||
      (chrome.runtime && chrome.runtime.lastError)
    ) {
      return;
    }
    updateBadge();
    if (prefs.jsBlocked) {
      updateBlockingRules(prefs.jsBlocked);
    }
  });
  setupAdNetworkBlocking();
} catch (e) {
  console.error('Background startup storage access failed:', e);
}

/**
 * Session Keeper for 1point3acres.com (Discuz!)
 * -----------------------------------------------
 * Two-pronged approach:
 * 1. Extend cookie expiration (client-side) — pushes expiry 30 days out
 * 2. Heartbeat fetch (server-side) — keeps the session alive on the backend
 *
 * Discuz! auth cookies: saltkey, auth, sid, and anything with the cookie prefix.
 * WeChat login sessions expire fast; this keeps them alive.
 */

const SESSION_KEEP_DOMAINS = ['1point3acres.com', '.1point3acres.com'];
const SESSION_KEEP_INTERVAL_MINS = 10;
const COOKIE_EXTEND_DAYS = 30;

// Discuz! auth cookie name patterns
const AUTH_COOKIE_PATTERNS = [
  'saltkey',
  'auth',
  'sid',
  'loginuser',
  'ulastvisit',
  'lastvisit',
  'lastact',
  'home_readfeed',
  'connect_is_bind',
  'discuz_uid',
  'ticket'
];

function isAuthCookie(name) {
  const lower = name.toLowerCase();
  return AUTH_COOKIE_PATTERNS.some((p) => lower.includes(p));
}

async function extendCookies() {
  const futureDate = Date.now() / 1000 + COOKIE_EXTEND_DAYS * 24 * 3600;

  for (const domain of SESSION_KEEP_DOMAINS) {
    try {
      const cookies = await chrome.cookies.getAll({ domain });
      for (const cookie of cookies) {
        if (!isAuthCookie(cookie.name)) {
          continue;
        }
        if (cookie.session) {
          continue;
        } // session cookies can't have expiry set

        try {
          await chrome.cookies.set({
            url: `https://www.1point3acres.com${cookie.path}`,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            sameSite: cookie.sameSite || 'unspecified',
            expirationDate: futureDate
          });
        } catch {
          // httpOnly cookies may fail — that's OK
        }
      }
    } catch {
      // Domain might have no cookies yet
    }
  }
}

async function heartbeat() {
  try {
    // Lightweight request to keep server-side session alive
    // home.php?mod=space is a small page that refreshes the session
    const resp = await fetch('https://www.1point3acres.com/bbs/home.php?mod=space', {
      method: 'GET',
      credentials: 'include',
      redirect: 'follow',
      cache: 'no-store'
    });
    console.log(`[SessionKeeper] 1p3a heartbeat: HTTP ${resp.status}`);
  } catch (e) {
    console.warn('[SessionKeeper] 1p3a heartbeat failed:', e.message);
  }
}

async function sessionKeepAlive() {
  // Only run if there are auth cookies (user is logged in)
  try {
    const cookies = await chrome.cookies.getAll({ domain: '1point3acres.com' });
    const hasAuth = cookies.some((c) => isAuthCookie(c.name) && c.value);
    if (!hasAuth) {
      return;
    }

    await extendCookies();
    await heartbeat();
    console.log('[SessionKeeper] 1p3a session refreshed');
  } catch (e) {
    console.warn('[SessionKeeper] Error:', e.message);
  }
}

// Set up alarm for periodic session keepalive
chrome.alarms.create('sessionKeepAlive', { periodInMinutes: SESSION_KEEP_INTERVAL_MINS });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sessionKeepAlive') {
    sessionKeepAlive();
  }
});

// Also run on startup
sessionKeepAlive();

/**
 * Tab Management: Auto-Close Annoying Update Pages
 */
function shouldCloseTab(url) {
  if (!url) {
    return false;
  }
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('getadblock.com')) {
      if (urlObj.pathname.includes('/update/') || urlObj.pathname.includes('/installed/')) {
        return true;
      }
    }
  } catch {
    /* Invalid URL */
  }
  return false;
}

/**
 * LinkedIn: Premium Upsell Redirect (Race-Condition-Proof)
 * ---------------------------------------------------------
 * Content script sends profile URL via chrome.runtime.sendMessage on hover.
 * Stored IN MEMORY here (instant, no async chrome.storage latency).
 * When premium navigation detected, redirect immediately using in-memory URL.
 */

let linkedinPendingProfile = null;

// Receive profile URL from content script — instant, synchronous delivery
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'LINKEDIN_PROFILE_HOVER' && msg.url) {
    linkedinPendingProfile = msg.url;
    console.log('[LinkedIn Fix] BG received profile URL:', msg.url);
  }
});

function isLinkedInPremium(url) {
  if (!url) {
    return false;
  }
  return url.includes('linkedin.com/premium');
}

function redirectFromPremium(tabId) {
  const dest = linkedinPendingProfile;
  if (dest) {
    console.log('[LinkedIn Fix] Redirect (memory): premium ->', dest);
    chrome.tabs.update(tabId, { url: dest });
    linkedinPendingProfile = null;
    return;
  }
  // Fallback: session storage survives service worker restart
  chrome.storage.session.get(['linkedinPendingProfile'], (result) => {
    if (chrome.runtime.lastError) {
      return;
    }
    const url = result.linkedinPendingProfile;
    if (url) {
      console.log('[LinkedIn Fix] Redirect (session): premium ->', url);
      chrome.tabs.update(tabId, { url });
      chrome.storage.session.remove('linkedinPendingProfile');
    } else {
      console.log('[LinkedIn Fix] No profile URL stored, going to feed');
      chrome.tabs.update(tabId, { url: 'https://www.linkedin.com/feed/' });
    }
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url;

  if (url && shouldCloseTab(url)) {
    chrome.tabs.remove(tabId).catch(() => {});
    return;
  }

  if (changeInfo.url && isLinkedInPremium(changeInfo.url)) {
    console.log(
      '[LinkedIn Fix] Premium URL detected:',
      changeInfo.url,
      'in-memory:',
      linkedinPendingProfile
    );
    redirectFromPremium(tabId);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  const url = tab.pendingUrl || tab.url;
  if (url && shouldCloseTab(url)) {
    chrome.tabs.remove(tab.id).catch(() => {});
    return;
  }
  if (url && isLinkedInPremium(url)) {
    console.log('[LinkedIn Fix] Premium URL in new tab:', url);
    redirectFromPremium(tab.id);
  }
});
