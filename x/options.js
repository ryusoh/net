/**
 * Logic for the Options UI to save/load user choice.
 */

// Saves options to chrome.storage
function save_options() {
  const defaultTab = document.querySelector('input[name="defaultTab"]:checked').value;

  chrome.storage.sync.set(
    {
      preferredTab: defaultTab
    },
    function () {
      const status = document.getElementById('status');
      status.textContent = 'Settings saved. Refresh your X tab to apply.';
      setTimeout(function () {
        status.textContent = '';
      }, 3000);
    }
  );
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
  // Use capitalized default 'Finance'
  chrome.storage.sync.get(
    {
      preferredTab: 'Finance'
    },
    function (items) {
      const radio = document.getElementById(items.preferredTab);
      if (radio) {
        radio.checked = true;
      } else if (items.preferredTab === 'finance') {
        // Handle legacy 'finance' (lowercase) value
        document.getElementById('Finance').checked = true;
      }
    }
  );
}

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click', save_options);
