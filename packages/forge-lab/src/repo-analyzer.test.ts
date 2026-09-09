import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RepoAnalyzer, ForgeLabError, GitHubApiError, RateLimitError } from './repo-analyzer.js';
import { SMALL_REPO_METADATA, SMALL_REPO_CONTENTS_PAYLOAD } from './__fixtures__/small-repo.js';

const mockHttp = vi.hoisted(() => vi.fn());

vi.mock('@ninja/integrations-http', () => ({
  httpRequest: mockHttp,
}));

type HttpFn = ConstructorParameters<typeof RepoAnalyzer>[0];

function jsonResponse(status: number, payload: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    data: JSON.stringify(payload),
    headers,
    ok: status >= 200 && status < 300,
    url: 'https://api.github.com/repos/acme/tiny-skill',
    duration: 1,
  };
}

describe('RepoAnalyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produce el shape RepoAnalysis esperado sobre el fixture pequeno', async () => {
    mockHttp
      .mockResolvedValueOnce(jsonResponse(200, SMALL_REPO_METADATA))
      .mockResolvedValueOnce(jsonResponse(200, SMALL_REPO_CONTENTS_PAYLOAD));

    const analyzer = new RepoAnalyzer(mockHttp as unknown as HttpFn);
    const analysis = await analyzer.analyzeGitHubRepo('https://github.com/acme/tiny-skill');

    expect(analysis.repo.owner).toBe('acme');
    expect(analysis.repo.name).toBe('tiny-skill');
    expect(analysis.repo.stars).toBe(42);
    expect(analysis.mainLanguage).toBe('TypeScript');
    expect(analysis.fileCount).toBe(SMALL_REPO_CONTENTS_PAYLOAD.length);
    expect(analysis.structure).toContain('README.md');
    expect(analysis.hasReadme).toBe(true);
    expect(analysis.hasTests).toBe(true);
    expect(analysis.qualitySignals.hasTypes).toBe(true);
    expect(analysis.qualitySignals.licenseType).toBe('detected');
    expect(analysis.qualitySignals.isModernPackage).toBe(true);
    expect(analysis.analyzedAt).toBeInstanceOf(Date);
  });

  it('rechaza URLs que no son de GitHub', async () => {
    const analyzer = new RepoAnalyzer(mockHttp as unknown as HttpFn);
    await expect(analyzer.analyzeGitHubRepo('https://gitlab.com/acme/repo')).rejects.toThrow(
      ForgeLabError
    );
    expect(mockHttp).not.toHaveBeenCalled();
  });

  it('lanza GitHubApiError con el status cuando metadata falla', async () => {
    mockHttp.mockResolvedValueOnce(jsonResponse(404, { message: 'Not Found' }));
    const analyzer = new RepoAnalyzer(mockHttp as unknown as HttpFn);
    const err = await analyzer
      .analyzeGitHubRepo('https://github.com/acme/missing')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GitHubApiError);
    expect((err as GitHubApiError).status).toBe(404);
  });

  it('lanza RateLimitError cuando el header indica cuota agotada', async () => {
    mockHttp.mockResolvedValueOnce(
      jsonResponse(403, { message: 'limit' }, { 'x-ratelimit-remaining': '0' })
    );
    const analyzer = new RepoAnalyzer(mockHttp as unknown as HttpFn);
    await expect(analyzer.analyzeGitHubRepo('https://github.com/acme/tiny-skill')).rejects.toThrow(
      RateLimitError
    );
  });

  it('tolera un structure fetch fallido y devuelve structure vacia', async () => {
    mockHttp
      .mockResolvedValueOnce(jsonResponse(200, SMALL_REPO_METADATA))
      .mockResolvedValueOnce(jsonResponse(500, { message: 'boom' }));
    const analyzer = new RepoAnalyzer(mockHttp as unknown as HttpFn);
    const analysis = await analyzer.analyzeGitHubRepo('https://github.com/acme/tiny-skill');
    expect(analysis.structure).toEqual([]);
    expect(analysis.fileCount).toBe(0);
    expect(analysis.hasReadme).toBe(false);
  });

  it('detecta calidad cero en un repo sin senales', async () => {
    mockHttp
      .mockResolvedValueOnce(jsonResponse(200, { ...SMALL_REPO_METADATA, language: null }))
      .mockResolvedValueOnce(jsonResponse(200, [{ name: 'index.js' }]));
    const analyzer = new RepoAnalyzer(mockHttp as unknown as HttpFn);
    const analysis = await analyzer.analyzeGitHubRepo('https://github.com/acme/plain');
    expect(analysis.mainLanguage).toBe('unknown');
    expect(analysis.qualitySignals.hasTests).toBe(false);
    expect(analysis.qualitySignals.hasCI).toBe(false);
    expect(analysis.qualitySignals.hasLinting).toBe(false);
  });
});
