/**
 * LinkedIn Fix - Background Script Test
 */

const fs = require('fs');
const path = require('path');

const backgroundScriptPath = path.resolve(__dirname, './background.js');

// Mock Chrome API
global.chrome = {
  tabs: {
    onUpdated: { addListener: jest.fn() },
    onCreated: { addListener: jest.fn() },
    query: jest.fn(),
    remove: jest.fn().mockReturnValue(Promise.resolve()),
    update: jest.fn()
  },
  windows: {
    get: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn((keys, cb) => cb({})),
      set: jest.fn(),
      remove: jest.fn()
    }
  }
};

describe('LinkedIn Background Safeguards', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const code = fs.readFileSync(backgroundScriptPath, 'utf8');
    const wrappedCode =
      code +
      `; 
      global.safeRemoveTab = safeRemoveTab; 
      global.isPremiumSurvey = isPremiumSurvey;
    `;
    eval(wrappedCode);
  });

  test('should NOT remove the tab if it is the ONLY LinkedIn tab open', () => {
    // Mock only 1 tab exists
    chrome.tabs.query.mockImplementation((query, callback) => {
      callback([{ id: 123 }]);
    });

    global.safeRemoveTab(123);

    expect(chrome.tabs.remove).not.toHaveBeenCalled();
    expect(chrome.tabs.update).toHaveBeenCalledWith(
      123,
      expect.objectContaining({
        url: expect.any(String)
      })
    );
  });

  test('should safely remove the tab if OTHER LinkedIn tabs are open', () => {
    // Mock 2 tabs exist
    chrome.tabs.query.mockImplementation((query, callback) => {
      callback([{ id: 123 }, { id: 456 }]);
    });

    global.safeRemoveTab(123);

    expect(chrome.tabs.remove).toHaveBeenCalledWith(123);
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });
});
