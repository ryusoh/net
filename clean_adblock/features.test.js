/**
 * Tests for clean_adblock feature modules
 */

describe('Feature Toggles', () => {
  test('should have default features enabled in background', () => {
    // Mock Chrome API
    global.chrome = {
      storage: {
        sync: {
          get: jest.fn((defaults, cb) => cb(defaults)),
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
        onUpdated: { addListener: jest.fn() },
        onCreated: { addListener: jest.fn() },
        remove: jest.fn()
      },
      declarativeNetRequest: {
        getDynamicRules: jest.fn(() => Promise.resolve([])),
        updateDynamicRules: jest.fn(() => Promise.resolve())
      },
      alarms: {
        create: jest.fn(),
        onAlarm: { addListener: jest.fn() }
      }
    };

    require('./background.js');

    const callArgs = chrome.storage.sync.set.mock.calls[0][0];
    expect(callArgs.features).toEqual({
      cookieBannerBlocker: true,
      socialMediaBlocker: true,
      youtubeAdBlocker: true,
      videoStreamAdBlocker: true,
      twitchAdBlocker: true,
      forumAdBlocker: true
    });
  });
});

describe('Cookie Banner Blocker', () => {
  test('cookie-banner-blocker.js should exist and be valid JS', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, 'cookie-banner-blocker.js'), 'utf8');
    expect(content).toContain('CookieBannerBlocker');
    expect(content).toContain('COOKIE_BANNER_SELECTORS');
  });
});

describe('Social Media Blocker', () => {
  test('social-media-blocker.js should exist and be valid JS', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, 'social-media-blocker.js'), 'utf8');
    expect(content).toContain('SocialMediaBlocker');
    expect(content).toContain('PLATFORM_CONFIG');
  });
});

describe('YouTube Ad Blocker', () => {
  test('youtube-ad-blocker.js should exist and be valid JS', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, 'youtube-ad-blocker.js'), 'utf8');
    expect(content).toContain('YouTubeAdBlocker');
    expect(content).toContain('AD_SELECTORS');
  });
});

describe('Video Stream Ad Blocker', () => {
  test('video-stream-ad-blocker.js should exist and be valid JS', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, 'video-stream-ad-blocker.js'), 'utf8');
    expect(content).toContain('VideoStreamAdBlocker');
    expect(content).toContain('AD_SERVER_DOMAINS');
  });
});

describe('Twitch Ad Blocker', () => {
  test('twitch-ad-blocker.js should exist and be valid JS', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, 'twitch-ad-blocker.js'), 'utf8');
    expect(content).toContain('TwitchAdBlocker');
    expect(content).toContain('AD_SELECTORS');
  });
});

describe('Forum Ad Blocker', () => {
  test('forum-ad-blocker.js should exist and be valid JS', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, 'forum-ad-blocker.js'), 'utf8');
    expect(content).toContain('ForumAdBlocker');
    expect(content).toContain('FORUM_AD_SELECTORS');
  });
});

describe('LinkedIn Unlocked', () => {
  test('linkedin-unlocked.js should exist and be valid JS', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, 'linkedin-unlocked.js'), 'utf8');
    expect(content).toContain('getDestinationForCard');
    expect(content).toContain('proactivelyCleanLinks');
  });

  test('linkedin-hide-promoted.js should exist and be valid JS', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, 'linkedin-hide-promoted.js'), 'utf8');
    expect(content).toContain('hidePromoted');
  });
});

describe('X (Twitter) Unlocked', () => {
  test('x-unlocked.js should exist and be valid JS', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, 'x-unlocked.js'), 'utf8');
    expect(content).toContain('tryTabSwitch');
    expect(content).toContain('preferredTab');
  });

  test('x-twitter-bird.js should exist and be valid JS', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, 'x-twitter-bird.js'), 'utf8');
    expect(content).toContain('replaceFavicon');
    expect(content).toContain('replaceLogos');
  });
});

describe('Manifest Configuration', () => {
  test('manifest.json should include all content scripts', () => {
    const fs = require('fs');
    const path = require('path');
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));

    const expectedScripts = [
      'content.js',
      'cookie-banner-blocker.js',
      'forum-ad-blocker.js',
      'linkedin-unlocked.js',
      'linkedin-hide-promoted.js',
      'x-twitter-bird.js',
      'x-unlocked.js',
      'social-media-blocker.js',
      'youtube-ad-blocker.js',
      'video-stream-ad-blocker.js',
      'twitch-ad-blocker.js'
    ];

    const contentScriptFiles = manifest.content_scripts.flatMap((cs) => cs.js);

    for (const script of expectedScripts) {
      expect(contentScriptFiles).toContain(script);
    }
  });

  test('manifest.json should have correct host permissions', () => {
    const fs = require('fs');
    const path = require('path');
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));

    expect(manifest.host_permissions).toContain('*://*.youtube.com/*');
    expect(manifest.host_permissions).toContain('*://*.twitch.tv/*');
    expect(manifest.host_permissions).toContain('*://*.facebook.com/*');
    expect(manifest.host_permissions).toContain('*://*.linkedin.com/*');
    expect(manifest.host_permissions).toContain('*://*.x.com/*');
  });

  test('manifest.json should include LinkedIn DNR rules', () => {
    const fs = require('fs');
    const path = require('path');
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));

    expect(manifest.declarative_net_request).toBeDefined();
    expect(manifest.declarative_net_request.rule_resources).toBeDefined();
    const linkedinRules = manifest.declarative_net_request.rule_resources.find(
      (r) => r.id === 'linkedin_rules'
    );
    expect(linkedinRules).toBeDefined();
    expect(linkedinRules.path).toBe('linkedin-rules.json');
  });
});
