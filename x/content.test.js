const fs = require('fs');
const path = require('path');

// Mock chrome.storage.sync.get
global.chrome = {
  storage: {
    sync: {
      get: jest.fn((defaults, callback) => callback(defaults))
    }
  }
};

// Mock window.location.pathname
delete window.location;
window.location = { pathname: '/home' };

// Load the content script
const contentScriptPath = path.resolve(__dirname, './content.js');

describe('X Tab Switcher - Nuclear Option', () => {
  let tabs;
  let premiumLinks;
  let rightSidebarPremium;

  beforeEach(() => {
    document.body.innerHTML = `
      <nav role="tablist">
        <div role="presentation"><a role="tab" id="tab-foryou" aria-selected="false" href="/home"><span>For you</span></a></div>
        <div role="presentation"><a role="tab" id="tab-following" aria-selected="true" href="/home"><span>Following</span></a></div>
        <div role="presentation"><a role="tab" id="tab-finance" aria-selected="false" href="/i/lists/123"><span>Finance</span></a></div>
      </nav>
      <nav role="navigation">
        <a href="/i/premium_sign_up" aria-label="Premium"><span>Premium</span></a>
        <a href="#"><span>Subscribe</span></a>
      </nav>
      <div data-testid="sidebarColumn">
        <aside aria-label="Subscribe to Premium">
          <h2><span>Subscribe to Premium</span></h2>
          <p>Subscribe to unlock new features and if eligible, receive a share of ads revenue.</p>
        </aside>
      </div>
    `;
    tabs = document.querySelectorAll('[role="tab"]');
    premiumLinks = document.querySelectorAll('nav[role="navigation"] a');
    rightSidebarPremium = document.querySelector('aside[aria-label="Subscribe to Premium"]');

    // Mock the click/dispatchEvent
    tabs[2].click = jest.fn();
    tabs[2].dispatchEvent = jest.fn();

    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should eventually switch to "Finance" if "Following" is active', () => {
    chrome.storage.sync.get.mockImplementation((defaults, callback) =>
      callback({ preferredTab: 'Finance' })
    );

    eval(fs.readFileSync(contentScriptPath, 'utf8'));

    // Fast-forward the setInterval
    jest.advanceTimersByTime(100);

    expect(tabs[2].click).toHaveBeenCalled();
  });

  test('should permanently hide "For you"', () => {
    chrome.storage.sync.get.mockImplementation((defaults, callback) =>
      callback({ preferredTab: 'Finance' })
    );

    eval(fs.readFileSync(contentScriptPath, 'utf8'));

    jest.advanceTimersByTime(100);

    expect(tabs[0].style.display).toBe('none');
  });

  test('should hide Premium and Subscribe links in navigation', () => {
    chrome.storage.sync.get.mockImplementation((defaults, callback) =>
      callback({ preferredTab: 'Finance' })
    );

    eval(fs.readFileSync(contentScriptPath, 'utf8'));

    jest.advanceTimersByTime(100);

    expect(premiumLinks[0].style.display).toBe('none');
    expect(premiumLinks[1].style.display).toBe('none');
  });

  test('should hide the right sidebar Premium box', () => {
    chrome.storage.sync.get.mockImplementation((defaults, callback) =>
      callback({ preferredTab: 'Finance' })
    );

    eval(fs.readFileSync(contentScriptPath, 'utf8'));

    jest.advanceTimersByTime(100);

    expect(rightSidebarPremium.style.display).toBe('none');
  });
});
