/**
 * Auto-Close AdBlock Popups - Background Script
 * Watches for tabs opening to specific annoying URLs and immediately closes them.
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
  } catch (e) {
    // Invalid URL
  }
  return false;
}

// Listen for tabs when they are updated (e.g., URL changes or page loads)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || tab.url) {
    if (shouldCloseTab(changeInfo.url || tab.url)) {
      console.log(`Closing tab ${tabId} due to matched URL: ${changeInfo.url || tab.url}`);
      chrome.tabs.remove(tabId).catch((err) => console.error('Failed to close tab:', err));
    }
  }
});

// Also listen for newly created tabs if they have a pendingUrl
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.pendingUrl && shouldCloseTab(tab.pendingUrl)) {
    console.log(`Closing newly created tab ${tab.id} due to matched pendingUrl: ${tab.pendingUrl}`);
    chrome.tabs.remove(tab.id).catch((err) => console.error('Failed to close tab:', err));
  }
});
