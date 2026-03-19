/**
 * Cloudflare Worker Script for Tianditu Acceleration
 *
 * Instructions:
 * 1. Go to dash.cloudflare.com -> Workers & Pages
 * 2. Create an application -> Create Worker
 * 3. Paste this code into the editor and Deploy.
 * 4. Copy your Worker URL (e.g., https://tianditu.your-username.workers.dev)
 * 5. Update rules.json in the extension with your URL.
 */

/* global Response, Request, fetch */

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Extract the target URL from the path
    // Example: https://my-worker.workers.dev/https://t0.tianditu.gov.cn/img_w/wmts...
    let targetUrlStr = url.pathname.substring(1) + url.search;

    // Cloudflare normalizes URLs and collapses double slashes (e.g. /https:// becomes /https:/)
    // We need to restore the double slash for the target URL
    targetUrlStr = targetUrlStr.replace(/^(https?):\/+/, '$1://');

    if (!targetUrlStr.startsWith('http://') && !targetUrlStr.startsWith('https://')) {
      return new Response('Invalid target URL. Usage: /https://target.url', { status: 400 });
    }

    // Security: Only allow proxying to tianditu domains
    if (!targetUrlStr.includes('.tianditu.gov.cn') && !targetUrlStr.includes('.tianditu.cn')) {
      return new Response('Forbidden: Only Tianditu domains are allowed.', { status: 403 });
    }

    // Reconstruct the request
    const newRequest = new Request(targetUrlStr, request);

    // Strip Cloudflare trace headers that might trigger the WAF
    newRequest.headers.delete('cf-connecting-ip');
    newRequest.headers.delete('cf-ipcountry');
    newRequest.headers.delete('cf-ray');
    newRequest.headers.delete('cf-visitor');

    // Inject spoofed IP headers to maximize WAF bypass chance at the Cloudflare edge
    newRequest.headers.set('X-Forwarded-For', '114.114.114.114');
    newRequest.headers.set('X-Real-IP', '114.114.114.114');
    newRequest.headers.set('Client-IP', '114.114.114.114');
    newRequest.headers.set('True-Client-IP', '114.114.114.114');

    // Add a standard User-Agent and Referer just in case the WAF requires it
    newRequest.headers.set(
      'User-Agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    newRequest.headers.set('Referer', 'https://map.tianditu.gov.cn/');

    try {
      const response = await fetch(newRequest);
      const newResponse = new Response(response.body, response);

      // Ensure CORS so the browser doesn't block the redirected request
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

      return newResponse;
    } catch (e) {
      return new Response(e.message, { status: 500 });
    }
  }
};
