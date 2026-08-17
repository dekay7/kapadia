/**
 * functions/_middleware.js - Cloudflare Pages Function
 *
 * Runs on every HTTPS request to your Pages site. Detects curl/wget
 * clients hitting the root path and returns their IP as plain text.
 * All other requests pass through to your normal static site.
 *
 * Place this file at: functions/_middleware.js
 *
 * Source: https://kapadia.org/docs/#curl-ip-selfhost
 */

/** Classify a raw IP string as 'v4', 'v6', or null. */
function ipVersion(ip) {
  if (!ip || ip === 'unknown') return null;
  return ip.includes(':') ? 'v6' : 'v4';
}

/** Pull the real connecting IP from Cloudflare headers. */
function getConnectingIP(request) {
  return request.headers.get('CF-Connecting-IP') || null;
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const ua = (request.headers.get('User-Agent') || '').toLowerCase();

  // Detect CLI HTTP clients
  const isCli =
    ua.startsWith('curl/') ||
    ua.startsWith('wget/') ||
    ua.startsWith('httpie/') ||
    ua === 'httpie' ||
    ua.includes('windowspowershell/') ||
    ua.includes(' powershell/');

  // Match / and /index.html on the apex domain
  const isRoot =
    url.pathname === '/' ||
    url.pathname === '' ||
    url.pathname === '/index.html';

  if (isCli && isRoot) {
    const ip = getConnectingIP(request);

    if (!ip) {
      return new Response('unknown\n', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    const ver = ipVersion(ip);

    return new Response(ip + '\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-IP-Version': ver || 'unknown',
      },
    });
  }

  return next();
}
