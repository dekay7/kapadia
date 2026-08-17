/**
 * http-handler.js - Cloudflare Worker
 *
 * Intercepts plain HTTP requests (http://) BEFORE Cloudflare's built-in
 * HTTP->HTTPS redirect fires. This lets curl/wget users get their IP even
 * when hitting the plain HTTP URL.
 *
 * Behaviour:
 *   curl / wget hitting /        ->  plain IP, no redirect
 *   Everything else on HTTP      ->  301 redirect to HTTPS
 *
 * Deploy with: wrangler deploy --config wrangler-http.toml
 *
 * Source: https://kapadia.org/docs/#curl-ip-selfhost
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const ua  = (request.headers.get('User-Agent') || '').toLowerCase();

    const isCli  = ua.startsWith('curl/') || ua.startsWith('wget/') || ua.startsWith('httpie/');
    const isRoot = url.pathname === '/' || url.pathname === '' || url.pathname === '/index.html';

    // Helper: classify IP as 'v4' or 'v6'
    function ipVersion(ip) {
      if (!ip || ip === 'unknown') return null;
      return ip.includes(':') ? 'v6' : 'v4';
    }

    // Helper: pull connecting IP from Cloudflare headers
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
