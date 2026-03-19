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

  beforeEach(() => {
    document.body.innerHTML = `
      <nav role="tablist">
        <div role="presentation"><a role="tab" id="tab-foryou" aria-selected="false" href="/home"><span>For you</span></a></div>
        <div role="presentation"><a role="tab" id="tab-following" aria-selected="true" href="/home"><span>Following</span></a></div>
        <div role="presentation"><a role="tab" id="tab-finance" aria-selected="false" href="/i/lists/123"><span>Finance</span></a></div>
      </nav>
    `;
    tabs = document.querySelectorAll('[role="tab"]');

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
});
