/**
 * GET /api/dns?domain=example.com
 * Fetches common DNS records using Cloudflare's DoH API.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://kapadia.org',
};

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const rawDomain = url.searchParams.get('domain');

  if (!rawDomain) {
    return Response.json({ error: 'Missing domain parameter' }, {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  // Normalise: strip protocol and path (tolerant of user pasting a full URL)
  const domain = rawDomain.replace(/^https?:\/\//, '').split('/')[0].toLowerCase().trim();

  // Validate: must look like a real domain (matches the guard in /api/osint)
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/.test(domain)) {
    return Response.json({ error: 'Invalid domain format' }, {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  // Common record types we want to fetch
  const types = ['A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS', 'SOA'];
  
  const results = {};

  try {
    // Fetch all types in parallel
    const promises = types.map(async (type) => {
      const fetchUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`;
      const res = await fetch(fetchUrl, {
        headers: { 'Accept': 'application/dns-json' },
        signal: AbortSignal.timeout(4000),
      });
      
      if (!res.ok) {
        return { type, records: [] };
      }
      
      const data = await res.json();
      
      // dns-json returns Answer array if records exist
      if (data.Answer) {
        return {
          type,
          records: data.Answer.map(ans => ({
            name: ans.name,
            ttl: ans.TTL,
            data: ans.data
          }))
        };
      }
      
      return { type, records: [] };
    });

    const responses = await Promise.all(promises);

    // Group by type
    responses.forEach(r => {
      results[r.type] = r.records;
    });

    return Response.json(results, {
      headers: {
        'Cache-Control': 'no-store',
        ...CORS_HEADERS,
      },
    });

  } catch (err) {
    return Response.json({ error: 'Failed to lookup DNS records' }, {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age':       '86400',
    },
  });
}
