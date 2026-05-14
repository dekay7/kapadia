/**
 * kapadia-http Worker
 *
 * Runs on http://kapadia.org/* ONLY.
 * HTTPS traffic is handled by Pages + _middleware.js as normal.
 *
 * This Worker sits in front of Pages' own HTTP→HTTPS redirect,
 * which fires before any Pages Function can run. By binding a Worker
 * route to http://, we intercept first.
 *
 * Behaviour:
 *   curl / wget hitting /  →  plain IP, no redirect
 *   Anything else on HTTP  →  301 to HTTPS (same path)
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const ua  = (request.headers.get('User-Agent') || '').toLowerCase();

    const isCli  = ua.startsWith('curl/') || ua.startsWith('wget/') || ua.startsWith('httpie/');
    const isRoot = url.pathname === '/' || url.pathname === '' || url.pathname === '/index.html';

    // NOTE: ipVersion and getConnectingIP are intentionally copied from
    // functions/_middleware.js. Pages Functions and standalone Workers cannot
    // share module files, so any changes here must be mirrored there.
    // Helper: classify IP as 'v4' or 'v6'
    function ipVersion(ip) {
      if (!ip || ip === 'unknown') return null;
      return ip.includes(':') ? 'v6' : 'v4';
    }

    // Helper: pull connecting IP with same fallback as _middleware.js
    function getConnectingIP(request) {
      return request.headers.get('CF-Connecting-IP') || null;
    }

    if (isCli && isRoot) {
      const ip = getConnectingIP(request) || 'unknown';

      return new Response(ip + '\n', {
        status: 200,
        headers: {
          'Content-Type':  'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-IP-Version':  ipVersion(ip) || (ip.includes(':') ? 'v6' : 'v4'),
        },
      });
    }

    // Everything else: send to HTTPS
    const httpsUrl = 'https://' + url.host + url.pathname + url.search;
    return Response.redirect(httpsUrl, 301);
  },
};
