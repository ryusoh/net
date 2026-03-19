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
        <aside aria-label="Who to follow">
          <h2><span>Who to follow</span></h2>
          <div>Suggested accounts...</div>
        </aside>
        <aside aria-label="Live on X">
          <h2><span>Live on X</span></h2>
          <div>Live video content...</div>
        </aside>
      </div>
      <div id="layers">
        <div>
          <div class="floating-wrapper">
             <button aria-label="Grok">
                <div class="logo">Grok Logo</div>
             </button>
          </div>
        </div>
        <div>
          <div class="floating-wrapper">
             <div data-testid="msg-drawer">
                Messages
             </div>
          </div>
        </div>
        <div>
          <div class="floating-wrapper">
             <button aria-label="New Post Floating">
                <div class="logo">Compose</div>
             </button>
          </div>
        </div>
        <div>
          <div class="floating-wrapper">
             <div data-testid="GrokDrawerHeader">
                <button role="button">Grok Header Button</button>
             </div>
          </div>
        </div>
      </div>
    `;
    tabs = document.querySelectorAll('[role="tab"]');
    premiumLinks = document.querySelectorAll('nav[role="navigation"] a');
    rightSidebarPremium = document.querySelector('aside[aria-label="Subscribe to Premium"]');

    // We can't perfectly mock getBoundingClientRect in JSDOM out of the box for the generic bottom-right test,
    // but we can ensure the specific selectors work.

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

  test('should hide the right sidebar Premium, Who to follow, and Live on X boxes', () => {
    chrome.storage.sync.get.mockImplementation((defaults, callback) =>
      callback({ preferredTab: 'Finance' })
    );

    eval(fs.readFileSync(contentScriptPath, 'utf8'));

    jest.advanceTimersByTime(100);

    const whoToFollow = document.querySelector('aside[aria-label="Who to follow"]');
    const liveOnX = document.querySelector('aside[aria-label="Live on X"]');
    expect(rightSidebarPremium.style.display).toBe('none');
    expect(whoToFollow.style.display).toBe('none');
    expect(liveOnX.style.display).toBe('none');
  });

  test('should hide floating Grok and Messages buttons in bottom right', () => {
    chrome.storage.sync.get.mockImplementation((defaults, callback) =>
      callback({ preferredTab: 'Finance' })
    );

    eval(fs.readFileSync(contentScriptPath, 'utf8'));

    jest.advanceTimersByTime(100);

    const grokBtn = document.querySelector('button[aria-label="Grok"]');
    const msgDrawer = document.querySelector('[data-testid="msg-drawer"]');
    const grokHeader = document.querySelector('[data-testid="GrokDrawerHeader"]');

    // We expect the wrappers or the elements themselves to be hidden
    // The test will fail if neither the element nor its parents are hidden.
    const isHidden = (el) => {
      let current = el;
      while (current && current !== document.body) {
        if (current.style.display === 'none') {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    };

    expect(isHidden(grokBtn)).toBe(true);
    expect(isHidden(msgDrawer)).toBe(true);
    expect(isHidden(grokHeader)).toBe(true);
  });
});
