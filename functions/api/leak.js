/**
 * GET /api/leak
 * Dumps HTTP request headers and Cloudflare TLS connection properties.
 */
export async function onRequestGet(context) {
  const { request } = context;

  const HIDDEN = new Set([
    'cf-access-jwt-assertion', 'cf-access-token',
    'authorization', 'cookie',
  ]);
  const headers = {};
  for (const [key, value] of request.headers.entries()) {
    if (!HIDDEN.has(key)) headers[key] = value;
  }

  const cf = request.cf || {};

  const payload = {
    httpProtocol: cf.httpProtocol || 'HTTP/1.1',
    tlsCipher: cf.tlsCipher || null,
    tlsVersion: cf.tlsVersion || null,
    clientTcpRtt: cf.clientTcpRtt || null,
    headers: headers,
    ip: request.headers.get('cf-connecting-ip') || null,
    colo: cf.colo || null,
  };

  return Response.json(payload, {
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': 'https://kapadia.org',
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  'https://kapadia.org',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age':       '86400',
    },
  });
}
