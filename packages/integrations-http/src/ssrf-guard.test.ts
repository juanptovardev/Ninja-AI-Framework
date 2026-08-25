import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ssrfGuard } from './ssrf-guard.js';
import { SSRFError } from '@ninja/contracts';

// Mock dns/promises to control hostname → IP resolution
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

import { lookup } from 'node:dns/promises';
const mockLookup = vi.mocked(lookup);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ssrfGuard (WP-B14)', () => {
  it('bloquea 10.0.0.1 (dirección IP privada clase A)', async () => {
    mockLookup.mockResolvedValue({ address: '10.0.0.1', family: 4 });
    await expect(ssrfGuard(new URL('http://10.0.0.1'))).rejects.toThrow(SSRFError);
  });

  it('bloquea 172.16.5.10 (dirección IP privada clase B)', async () => {
    mockLookup.mockResolvedValue({ address: '172.16.5.10', family: 4 });
    await expect(ssrfGuard(new URL('http://internal.corp'))).rejects.toThrow(SSRFError);
  });

  it('bloquea 192.168.1.1 (dirección IP privada clase C)', async () => {
    mockLookup.mockResolvedValue({ address: '192.168.1.1', family: 4 });
    await expect(ssrfGuard(new URL('http://192.168.1.1'))).rejects.toThrow(SSRFError);
  });

  it('bloquea 127.0.0.1 (localhost)', async () => {
    mockLookup.mockResolvedValue({ address: '127.0.0.1', family: 4 });
    await expect(ssrfGuard(new URL('http://localhost'))).rejects.toThrow(SSRFError);
  });

  it('bloquea 169.254.169.254 (AWS/GCP/Azure metadata)', async () => {
    await expect(ssrfGuard(new URL('http://169.254.169.254'))).rejects.toThrow(SSRFError);
  });

  it('bloquea metadata.google.internal por hostname explícito', async () => {
    mockLookup.mockResolvedValue({ address: '169.254.169.254', family: 4 });
    await expect(ssrfGuard(new URL('http://metadata.google.internal'))).rejects.toThrow(SSRFError);
  });

  it('bloquea ::1 (IPv6 loopback)', async () => {
    await expect(ssrfGuard(new URL('http://[::1]'))).rejects.toThrow(SSRFError);
  });

  it('bloquea fd00:: (IPv6 ULA — rango privado unicast local)', async () => {
    await expect(ssrfGuard(new URL('http://[fd00::1]'))).rejects.toThrow(SSRFError);
  });

  it('permite api.github.com (dominio público)', async () => {
    mockLookup.mockResolvedValue({ address: '140.82.112.4', family: 4 });
    await expect(ssrfGuard(new URL('https://api.github.com'))).resolves.toBeUndefined();
  });

  it('permite IP pública 8.8.8.8 (Google DNS)', async () => {
    await expect(ssrfGuard(new URL('http://8.8.8.8'))).resolves.toBeUndefined();
  });

  it('con allowlist [github.com] → bloquea api.bitbucket.org', async () => {
    mockLookup.mockResolvedValue({ address: '104.192.141.1', family: 4 });
    await expect(
      ssrfGuard(new URL('https://api.bitbucket.org'), { allowedDomains: ['github.com'] })
    ).rejects.toThrow(SSRFError);
  });

  it('con allowlist [github.com] → permite api.github.com', async () => {
    mockLookup.mockResolvedValue({ address: '140.82.112.4', family: 4 });
    await expect(
      ssrfGuard(new URL('https://api.github.com'), { allowedDomains: ['github.com'] })
    ).resolves.toBeUndefined();
  });

  // ── IPv4-mapped IPv6 bypass (WP-B14 follow-up) ──────────────────────────
  // Known OWASP SSRF bypass: encode private IPv4 addresses in IPv6 notation
  // (::ffff:X) so they pass the IPv4-only regex checks.

  it('bloquea ::ffff:127.0.0.1 (IPv4-mapped IPv6 loopback)', async () => {
    await expect(ssrfGuard(new URL('http://[::ffff:127.0.0.1]/'))).rejects.toThrow(SSRFError);
  });

  it('bloquea ::ffff:10.0.0.1 (IPv4-mapped private 10/8)', async () => {
    await expect(ssrfGuard(new URL('http://[::ffff:10.0.0.1]/'))).rejects.toThrow(SSRFError);
  });

  it('bloquea ::ffff:169.254.169.254 (IPv4-mapped AWS metadata)', async () => {
    await expect(ssrfGuard(new URL('http://[::ffff:169.254.169.254]/'))).rejects.toThrow(SSRFError);
  });

  it('bloquea ::ffff:192.168.1.1 (IPv4-mapped private 192.168/16)', async () => {
    await expect(ssrfGuard(new URL('http://[::ffff:192.168.1.1]/'))).rejects.toThrow(SSRFError);
  });

  it('bloquea ::FFFF:127.0.0.1 (mayúsculas — normalización lowercase)', async () => {
    await expect(ssrfGuard(new URL('http://[::FFFF:127.0.0.1]/'))).rejects.toThrow(SSRFError);
  });
});
