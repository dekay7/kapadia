/**
 * GET /api/info
 * Returns visitor IP (split into ipv4 / ipv6) and Cloudflare geo data as JSON.
 * Used by the homepage terminal widget.
 *
 * Cloudflare headers used:
 *  CF-Connecting-IP    – the actual connecting address (v4 or v6)
 *  CF-Connecting-IPv6  – set by CF when the client has an IPv6 address,
 *                        even if the edge connection itself was IPv4
 */
export async function onRequestGet(context) {
  const { request } = context;

  const connectingIP = request.headers.get('CF-Connecting-IP') || null;

  // CF sets this header when it knows the client's IPv6 address
  const cfIPv6 = request.headers.get('CF-Connecting-IPv6') || null;

  // Classify the connecting IP
  const isV6 = connectingIP && connectingIP.includes(':');

  let ipv4 = null;
  let ipv6 = null;

  if (isV6) {
    ipv6 = connectingIP;
  } else {
    ipv4 = connectingIP;
    // If CF told us about an IPv6 address separately, surface it
    if (cfIPv6) ipv6 = cfIPv6;
  }

  const cf = request.cf || {};

  const payload = {
    ipv4,
    ipv6,
    country:        cf.country        || null,
    countryName:    cf.countryName    || null,
    city:           cf.city           || null,
    region:         cf.region         || null,
    regionCode:     cf.regionCode     || null,
    postalCode:     cf.postalCode     || null,
    timezone:       cf.timezone       || null,
    latitude:       cf.latitude  ? parseFloat((+cf.latitude).toFixed(4))  : null,
    longitude:      cf.longitude ? parseFloat((+cf.longitude).toFixed(4)) : null,
    asn:            cf.asn            || null,
    asOrganization: cf.asOrganization || null,
    colo:           cf.colo           || null,
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
