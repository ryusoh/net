/**
 * LinkedIn Fix - Background Script
 * Automatically closes annoying premium survey tabs and handles failover.
 */

function isPremiumSurvey(url) {
  if (!url) {return false;}
  return url.includes('linkedin.com/premium/survey');
}

/**
 * Robustly removes a tab only if it's not the last LinkedIn tab.
 * If it's the last tab, redirects to the pending profile or feed.
 */
function safeRemoveTab(tabId) {
  chrome.tabs.query({ url: '*://*.linkedin.com/*' }, (tabs) => {
    if (tabs && tabs.length > 1) {
      chrome.tabs.remove(tabId).catch(() => {});
    } else {
      // LAST TAB STANDING: Teleport to intended profile
      chrome.storage.local.get(['lastPendingProfile'], (result) => {
        const fallback = result.lastPendingProfile || 'https://www.linkedin.com/feed/';
        chrome.tabs.update(tabId, { url: fallback });
        // Clear memory after use
        chrome.storage.local.remove(['lastPendingProfile']);
      });
    }
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && isPremiumSurvey(changeInfo.url)) {
    chrome.windows.get(tab.windowId, (win) => {
      if (win.type === 'popup' || win.type === 'panel' || tab.openerTabId) {
        safeRemoveTab(tabId);
      } else {
        // MAIN WINDOW FAILOVER: Teleport to intended profile
        chrome.storage.local.get(['lastPendingProfile'], (result) => {
          const fallback = result.lastPendingProfile || 'https://www.linkedin.com/feed/';
          chrome.tabs.update(tabId, { url: fallback });
          chrome.storage.local.remove(['lastPendingProfile']);
        });
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
