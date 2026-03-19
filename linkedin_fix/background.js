/**
 * LinkedIn Fix - Background Script
 * Automatically closes annoying premium survey tabs.
 */

function isPremiumSurvey(url) {
  if (!url) {
    return false;
  }
  return url.includes('linkedin.com/premium/survey');
}

/**
 * Robustly removes a tab only if it's not the last LinkedIn tab.
 */
function safeRemoveTab(tabId) {
  // Query all LinkedIn tabs
  chrome.tabs.query({ url: '*://*.linkedin.com/*' }, (tabs) => {
    if (tabs && tabs.length > 1) {
      console.log('[LinkedIn Fix] Safe to remove tab. Count:', tabs.length);
      chrome.tabs.remove(tabId).catch(() => {});
    } else {
      console.warn(
        '[LinkedIn Fix] Last LinkedIn tab detected. Redirecting to feed instead of closing.'
      );
      chrome.tabs.update(tabId, { url: 'https://www.linkedin.com/feed/' });
    }
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && isPremiumSurvey(changeInfo.url)) {
    chrome.windows.get(tab.windowId, (win) => {
      // If it's a popup/panel or has an opener, it's likely a distinct survey window
      if (win.type === 'popup' || win.type === 'panel' || tab.openerTabId) {
        safeRemoveTab(tabId);
      } else {
        console.warn('[LinkedIn Fix] Survey detected in main window. Blocking navigation.');
        chrome.tabs.update(tabId, { url: 'https://www.linkedin.com/feed/' });
      }
    });
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  const url = tab.pendingUrl || tab.url;
  if (isPremiumSurvey(url) && tab.openerTabId) {
    safeRemoveTab(tab.id);
  }
});
