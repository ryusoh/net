const updateBadge = () => {
  if (typeof chrome !== 'undefined' && chrome.action && chrome.storage) {
    chrome.storage.sync.get({ enabled: true, mode: 'all' }, (prefs) => {
      const isEnabled = prefs.enabled !== false;
      const mode = prefs.mode || 'all';
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

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    try {
      chrome.storage.sync.set({
        enabled: true,
        mode: 'all',
        whitelist: [],
        blacklist: [],
        jsBlocked: ['bild.de']
      });
    } catch (e) {
      console.error('Background onInstalled storage set failed:', e);
    }
  }
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
} catch (e) {
  console.error('Background startup storage access failed:', e);
}

/**
 * Tab Management: Auto-Close Annoying Update Pages
 */
function shouldCloseTab(url) {
  if (!url) {return false;}
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('getadblock.com')) {
      if (urlObj.pathname.includes('/update/') || urlObj.pathname.includes('/installed/')) {
        return true;
      }
    }
  } catch (e) {
    /* Invalid URL */
  }
  return false;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if ((changeInfo.url || tab.url) && shouldCloseTab(changeInfo.url || tab.url)) {
    chrome.tabs.remove(tabId).catch(() => {});
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.pendingUrl && shouldCloseTab(tab.pendingUrl)) {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
});
