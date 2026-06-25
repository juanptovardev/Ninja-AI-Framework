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

  for (const range of PRIVATE_RANGES) {
    if (range.test(ip)) {
      throw new SSRFError(`SSRF: private/reserved IP ${ip}`);
    }
  }
}
