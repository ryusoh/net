/**
 * Bypass: AdBlock Detector - Popup Script
 */

document.addEventListener('DOMContentLoaded', () => {
  const enabledToggle = document.getElementById('enabled');
  const modeSelect = document.getElementById('mode');
  const scanBtn = document.getElementById('scan');
  const pickerBtn = document.getElementById('picker');

  // Load current settings
  chrome.storage.sync.get(['enabled', 'mode'], (prefs) => {
    enabledToggle.checked = prefs.enabled !== false;
    modeSelect.value = prefs.mode || 'all';
  });

  // Save settings on change
  enabledToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ enabled: enabledToggle.checked });
  });

  modeSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ mode: modeSelect.value });
  });

  // Site list buttons
  const addWhitelistBtn = document.getElementById('addWhitelist');
  const addBlacklistBtn = document.getElementById('addBlacklist');
  const addJsBlockBtn = document.getElementById('addJsBlock');

  function updateButtonStates() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = new URL(tabs[0].url);
      const host = url.hostname;
      if (!host) return;

      chrome.storage.sync.get(['whitelist', 'blacklist', 'jsBlocked'], (result) => {
        const isWhitelisted = (result.whitelist || []).includes(host);
        const isBlacklisted = (result.blacklist || []).includes(host);
        const isJsBlocked = (result.jsBlocked || []).includes(host);

        addWhitelistBtn.textContent = isWhitelisted ? 'Un-Whitelist' : 'Whitelist';
        addBlacklistBtn.textContent = isBlacklisted ? 'Un-Blacklist' : 'Blacklist';
        addJsBlockBtn.textContent = isJsBlocked ? 'Un-Block JS' : 'Block JS';
      });
    });
  }

  function toggleCurrentIn(listKey) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = new URL(tabs[0].url);
      const host = url.hostname;
      if (!host) return;

      chrome.storage.sync.get([listKey], (result) => {
        let list = result[listKey] || [];
        const index = list.indexOf(host);
        
        if (index > -1) {
          // Remove if exists
          list.splice(index, 1);
          chrome.storage.sync.set({ [listKey]: list }, () => {
            updateButtonStates();
          });
        } else {
          // Add if not exists
          list.push(host);
          chrome.storage.sync.set({ [listKey]: list }, () => {
            updateButtonStates();
          });
        }
      });
    });
  }

  addWhitelistBtn.addEventListener('click', () => toggleCurrentIn('whitelist'));
  addBlacklistBtn.addEventListener('click', () => toggleCurrentIn('blacklist'));
  addJsBlockBtn.addEventListener('click', () => toggleCurrentIn('jsBlocked'));

  // Initial update
  updateButtonStates();

  // Trigger manual scan
  scanBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'scan' }, (response) => {
        if (chrome.runtime.lastError) {
          alert('Error: Could not communicate with page. Please refresh.');
        } else {
          alert('Scan complete!');
        }
      });
    });
  });

  // Start element picker
  pickerBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['picker.js']
      });
      window.close();
    });
  });
});
