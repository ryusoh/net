/**
 * Bypass: AdBlock Detector - Background Service
 */

/**
 * Updates declarativeNetRequest rules to block JavaScript on specific sites.
 * @param {string[]} hostnames - List of hostnames to block JS on.
 */
async function updateBlockingRules(hostnames) {
  // 1. Get existing dynamic rules
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const ruleIdsToRemove = existingRules.map(r => r.id);

  // 2. Prepare new rules
  const newRules = [];
  let ruleId = 1;

  hostnames.forEach(host => {
    // Block script resources
    newRules.push({
      id: ruleId++,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: `||${host}/*`,
        resourceTypes: ['script']
      }
    });

    // Modify CSP headers to block inline scripts
    newRules.push({
      id: ruleId++,
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
      condition: {
        urlFilter: `||${host}/*`,
        resourceTypes: ['main_frame', 'sub_frame']
      }
    });
  });

  // 3. Apply changes
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: ruleIdsToRemove,
    addRules: newRules
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    const defaultBlocked = ['bild.de'];
    chrome.storage.sync.set({
      enabled: true,
      mode: 'all',
      whitelist: [],
      blacklist: [],
      jsBlocked: defaultBlocked
    });
    updateBlockingRules(defaultBlocked);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && (changes.enabled || changes.mode)) {
    updateBadge();
  }
  if (area === 'sync' && changes.jsBlocked) {
    updateBlockingRules(changes.jsBlocked.newValue || []);
  }
});

updateBadge();
