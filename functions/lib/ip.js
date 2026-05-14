/**
 * Shared IP address utilities used by both link.js and osint.js.
 */

/**
 * Parse a dotted-decimal IPv4 string and validate each octet is 0–255.
 * Returns an array of 4 numbers, or null if invalid.
 */
export function parseIPv4(str) {
  const parts = str.trim().split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some(n => isNaN(n) || n < 0 || n > 255 || !Number.isInteger(n))) return null;
  return nums;
}

export function isPrivateIPv4(o) {
  const [a, b] = o;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 0 ||
    a >= 240
  );
}

export function isPrivateIPv6(raw) {
  const s = raw.toLowerCase().replace(/^\[|\]$/g, '');
  if (s === '::1' || s === '::') return true;
  if (s.startsWith('fc') || s.startsWith('fd')) return true;
  if (/^fe[89ab]/i.test(s)) return true;
  if (s.startsWith('::ffff:')) {
    const o = parseIPv4(s.slice(7));
    if (o) return isPrivateIPv4(o);
  }
  return false;
}

export function isPrivateAddress(ip) {
  const o = parseIPv4(ip);
  return o ? isPrivateIPv4(o) : isPrivateIPv6(ip);
}
