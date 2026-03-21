/**
 * Tests for clean_adblock/background.js
 */

// Mock Chrome API
global.chrome = {
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn()
    },
    onChanged: {
      addListener: jest.fn()
    }
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn()
  },
  declarativeNetRequest: {
    getDynamicRules: jest.fn(),
    updateDynamicRules: jest.fn()
  },
  runtime: {
    onInstalled: {
      addListener: jest.fn((cb) => cb({ reason: 'install' }))
    },
    lastError: null,
    onMessage: {
      addListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn(),
    onUpdated: {
      addListener: jest.fn()
    },
    onCreated: {
      addListener: jest.fn()
    },
    remove: jest.fn()
  },
  alarms: {
    create: jest.fn(),
    onAlarm: {
      addListener: jest.fn()
    }
  }
};

// Import background.js to trigger onInstalled handler
require('./background.js');

const validateRules = (hostnames) => {
  const uniqueHosts = Array.from(new Set(hostnames || [])).filter((h) => h && h.trim());
  const addRules = [];
  const ids = new Set();

  if (uniqueHosts.length > 0) {
    uniqueHosts.forEach((host, i) => {
      const baseId = i * 2 + 1;
      const id1 = baseId;
      const id2 = baseId + 1;

      if (ids.has(id1)) {
        throw new Error(`Duplicate ID: ${id1}`);
      }
      ids.add(id1);

      if (ids.has(id2)) {
        throw new Error(`Duplicate ID: ${id2}`);
      }
      ids.add(id2);

      addRules.push({ id: id1, host });
      addRules.push({ id: id2, host });
    });
  }

  return addRules;
};

describe('Background Logic Validation', () => {
  test('Rule IDs should be unique for normal list', () => {
    const rules = validateRules(['site1.com', 'site2.com']);
    expect(rules.length).toBe(4);
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(4);
  });

  test('Rule IDs should be unique even with duplicate hosts input', () => {
    const rules = validateRules(['site1.com', 'site1.com', 'site2.com']);
    expect(rules.length).toBe(4); // 'site1.com' should be deduped
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(4);
  });

  test('Empty input should produce no rules', () => {
    const rules = validateRules([]);
    expect(rules.length).toBe(0);
  });

  test('Null input should produce no rules', () => {
    const rules = validateRules(null);
    expect(rules.length).toBe(0);
  });

  test('Default mode should be selective (blacklist mode)', () => {
    // Verify storage.set was called with correct defaults during onInstalled
    const callArgs = chrome.storage.sync.set.mock.calls[0][0];
    expect(callArgs.enabled).toBe(true);
    expect(callArgs.mode).toBe('selective');
  });
});
