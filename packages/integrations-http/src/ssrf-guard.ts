import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { SSRFError } from '@ninja/contracts';

const PRIVATE_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^::1$/,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

const BLOCKED_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.azure.com',
  '169.254.169.254',
]);

export interface SSRFGuardOptions {
  allowedDomains?: string[];
}

export async function ssrfGuard(url: URL, opts: SSRFGuardOptions = {}): Promise<void> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTS.has(hostname.toLowerCase())) {
    throw new SSRFError(`SSRF: blocked hostname ${hostname}`);
  }

  if (opts.allowedDomains && opts.allowedDomains.length > 0) {
    const matches = opts.allowedDomains.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`)
    );
    if (!matches) {
      throw new SSRFError(`SSRF: ${hostname} not in allowlist`);
    }
  }

  const ip = isIP(hostname) ? hostname : (await lookup(hostname)).address;

  // WP-B14 follow-up: normalize IPv4-mapped IPv6 to dotted-quad IPv4 so the
  // PRIVATE_RANGES regexes (anchored to IPv4 format) catch them. Without this,
  // attackers bypass the guard with notations like:
  //   http://[::ffff:127.0.0.1]/        (dotted-quad — what most exploits use)
  //   http://[::ffff:7f00:1]/           (hex — what Node's URL parser may emit)
  // Both must be rejected. Known OWASP SSRF bypass.
  const mappedIPv4 = extractMappedIPv4(ip);
  const normalized = mappedIPv4 ?? ip.toLowerCase();

  for (const range of PRIVATE_RANGES) {
    if (range.test(normalized)) {
      throw new SSRFError(`SSRF: private/reserved IP ${ip}`);
    }
  }
}

/**
 * If `ipv6` is an IPv4-mapped IPv6 address (`::ffff:X`), return X as dotted-quad.
 * Otherwise return null. Handles both notations Node produces:
 *   - `::ffff:127.0.0.1` (literal IPv4 suffix)
 *   - `::ffff:7f00:1` (16-bit hex pair suffix, after URL parser normalization)
 */
function extractMappedIPv4(ipv6: string): string | null {
  const lower = ipv6.toLowerCase();
  const dotted = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return dotted[1];
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}
