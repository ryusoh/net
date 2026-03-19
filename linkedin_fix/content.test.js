const fs = require('fs');
const path = require('path');

const contentScriptPath = path.resolve(__dirname, './content.js');

describe('LinkedIn Interceptor: Proactive Defense', () => {
  beforeEach(() => {
    // Mock chrome.storage
    global.chrome = {
      storage: {
        local: {
          set: jest.fn(),
          get: jest.fn((keys, cb) => cb({}))
        }
      }
    };

    delete window.location;
    window.location = {
      href: 'https://www.linkedin.com/feed/',
      assign: jest.fn((url) => {
        window.location.href = url;
      })
    };

    document.body.innerHTML = `
      <div id="browsemap_recommendation">
        <span class="actor-name">Proactive Test</span>
        <a href="https://linkedin.com/premium/poisoned-link">View</a>
      </div>
    `;

    jest.resetModules();
    const code = fs.readFileSync(contentScriptPath, 'utf8');
    eval(code);
  });

  afterEach(() => {
    // Attempt to stop any observers that were created during eval
    // In a real browser this happens on page unload, but in JSDOM we must be clean.
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  test('should proactively rewrite poisoned links in the DOM', () => {
    const link = document.querySelector('#browsemap_recommendation a');

    // The link should be rewritten automatically on script load
    const expectedUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent('Proactive Test')}`;
    expect(link.href).toBe(expectedUrl);
    expect(link.getAttribute('data-cleaned')).toBe('true');
  });

  test('should intercept clicks and store pending profile in storage', () => {
    const link = document.querySelector('#browsemap_recommendation a');

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    const expectedUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent('Proactive Test')}`;
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ lastPendingProfile: expectedUrl });
    expect(window.location.assign).toHaveBeenCalledWith(expectedUrl);
  });
});
