const fs = require('fs');
const path = require('path');

const contentScriptPath = path.resolve(__dirname, './content.js');

describe('LinkedIn Search-Bypass Interceptor', () => {
  beforeEach(() => {
    delete window.location;
    window.location = {
      href: 'https://www.linkedin.com/feed/',
      assign: jest.fn((url) => {
        window.location.href = url;
      })
    };

    document.body.innerHTML = `
      <ul class="recommendations-list">
        <li class="browsemap-profile">
          <span class="actor-name">Alice Smith</span>
          <span class="headline">VP of Engineering</span>
          <a href="https://linkedin.com/premium/poisoned-link-1">View Alice</a>
        </li>
        <li class="browsemap-profile">
          <span class="actor-name">Bob Jones</span>
          <span class="headline">Data Scientist</span>
          <a href="https://linkedin.com/premium/poisoned-link-2">View Bob</a>
        </li>
      </ul>
    `;

    jest.resetModules();
    const code = fs.readFileSync(contentScriptPath, 'utf8');
    eval(code);
  });

  test('should identify the SPECIFIC person clicked and search for them', () => {
    // Click on Bob Jones specifically
    const bobCard = document.querySelectorAll('.browsemap-profile')[1];
    const bobName = bobCard.querySelector('.actor-name');

    const event = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true
    });

    bobName.dispatchEvent(event);

    // Verify it searched for Bob, not Alice
    const expectedUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent('Bob Jones Data Scientist')}`;
    expect(window.location.assign).toHaveBeenCalledWith(expectedUrl);
    expect(window.location.href).toBe(expectedUrl);
  });

  test('should fallback to name-only search if headline is missing', () => {
    const aliceCard = document.querySelectorAll('.browsemap-profile')[0];
    aliceCard.querySelector('.headline').remove(); // Hide headline
    const aliceName = aliceCard.querySelector('.actor-name');

    const event = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true
    });

    aliceName.dispatchEvent(event);

    const expectedUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent('Alice Smith')}`;
    expect(window.location.assign).toHaveBeenCalledWith(expectedUrl);
  });
});
