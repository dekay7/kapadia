/**
 * Cloudflare Pages Middleware
 *
 * - curl/wget hitting / or /index.html on any host variant → plain IP text
 *   • Connecting via IPv4  → returns IPv4 address  (curl  kapadia.org)
 *   • Connecting via IPv6  → returns IPv6 address  (curl -6 kapadia.org)
 * - All other requests pass through normally.
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

/** Return true if the User-Agent belongs to a CLI HTTP client. */
function isCliClient(ua) {
  return (
    ua.startsWith('curl/') ||
    ua.startsWith('wget/') ||
    ua.startsWith('httpie/') ||
    ua === 'httpie' ||
    ua.includes('windowspowershell/') ||
    ua.includes(' powershell/')
  );
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const ua = (request.headers.get('User-Agent') || '').toLowerCase();

  const isCli = isCliClient(ua);

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

    // Return the connecting IP as plain text.
    // curl uses IPv4 by default → returns IPv4.
    // curl -6 forces IPv6 → returns IPv6.
    return new Response(ip + '\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        // Hint to the client which version they got
        'X-IP-Version': ver || 'unknown',
      },
    });
  }

  return next();
}
