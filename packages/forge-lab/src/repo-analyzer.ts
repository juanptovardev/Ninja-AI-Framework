import { createLogger } from '@ninja/logging';
import { eventBus, createEvent } from '@ninja/events';
import { httpRequest, type HttpResponse, type HttpRequest } from '@ninja/integrations-http';
import { SourceRepo, RepoAnalysis, QualitySignals } from './schema.js';
import { ID } from '@ninja/contracts';

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export class ForgeLabError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForgeLabError';
  }
}

export class GitHubApiError extends ForgeLabError {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export class RateLimitError extends ForgeLabError {
  constructor() {
    super('GitHub API rate limit exceeded');
    this.name = 'RateLimitError';
  }
}

// ---------------------------------------------------------------------------
// Repo Analyzer Implementation
// ---------------------------------------------------------------------------

const logger = createLogger('forge-lab');

export class RepoAnalyzer {
  constructor(private readonly httpClient: typeof httpRequest) {}

  /**
   * Analyze a GitHub repository and extract metadata
   * @param url GitHub repository URL
   * @returns Repository analysis results
   */
  async analyzeGitHubRepo(url: string): Promise<RepoAnalysis> {
    logger.info('Analyzing GitHub repository', { url });

    try {
      // Parse GitHub URL
      const repoInfo = this.parseGitHubUrl(url);
      if (!repoInfo) {
        throw new ForgeLabError(`Invalid GitHub URL: ${url}`);
      }

      // Get repository metadata from GitHub API
      const repoData = await this.getRepoMetadata(repoInfo.owner, repoInfo.repo);

      // Get repository structure
      const structure = await this.getRepoStructure(repoInfo.owner, repoInfo.repo);

      // Detect quality signals
      const qualitySignals = await this.detectQualitySignals(
        repoInfo.owner,
        repoInfo.repo,
        structure
      );

      const analysis: RepoAnalysis = {
        repo: {
          url,
          name: repoData.name,
          owner: repoInfo.owner,
          description: repoData.description,
          stars: repoData.stargazers_count,
          language: repoData.language,
          id: crypto.randomUUID() as ID,
        },
        structure,
        fileCount: structure.length,
        mainLanguage: repoData.language || 'unknown',
        hasReadme: qualitySignals.hasReadme,
        hasTests: qualitySignals.hasTests,
        qualitySignals,
        analyzedAt: new Date(),
      };

      // Emit analysis event
      eventBus.emit(
        createEvent('forgelab.repo.analyzed', 'forge-lab', {
          url,
          fileCount: structure.length,
          qualityScore: this.calculateQualityScore(qualitySignals),
        })
      );

      return analysis;
    } catch (error) {
      if (error instanceof RateLimitError) {
        logger.warn('Rate limit reached during repository analysis', { url });
        eventBus.emit(createEvent('forgelab.rate.limited', 'forge-lab', { url }));
      }

      throw error;
    }
  }

  /**
   * Parse GitHub URL to extract owner and repository name
   */
  private parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    // GitHub URL patterns:
    // https://github.com/owner/repo
    // https://github.com/owner/repo.git
    // github.com/owner/repo

    // eslint-disable-next-line no-useless-escape -- \/ es OBLIGATORIO en regex literal (sin escapar termina el literal); falso positivo de la regla
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/]+)\/([^\/\.]+)/i);
    if (!match) {
      return null;
    }

    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, ''),
    };
  }

  /**
   * Get repository metadata from GitHub API
   */
  private async getRepoMetadata(owner: string, repo: string): Promise<any> {
    const response = await this.makeGitHubApiRequest(
      `https://api.github.com/repos/${owner}/${repo}`
    );

    if (response.status === 403 && response.headers['x-ratelimit-remaining'] === '0') {
      throw new RateLimitError();
    }

    if (response.status !== 200) {
      throw new GitHubApiError(
        `Failed to fetch repository metadata: ${response.status}`,
        response.status
      );
    }

    return JSON.parse(response.data as unknown as string);
  }

  /**
   * Get repository structure from GitHub API
   */
  private async getRepoStructure(owner: string, repo: string): Promise<string[]> {
    try {
      const response = await this.makeGitHubApiRequest(
        `https://api.github.com/repos/${owner}/${repo}/contents`
      );

      if (response.status === 403 && response.headers['x-ratelimit-remaining'] === '0') {
        throw new RateLimitError();
      }

      if (response.status !== 200) {
        logger.warn('Failed to fetch repository structure', {
          status: response.status,
          statusText: 'Unknown error',
        });
        return [];
      }

      const contents = JSON.parse(response.data as unknown as string);
      return Array.isArray(contents) ? contents.map((item) => item.name) : [];
    } catch (error) {
      logger.error('Error fetching repository structure', { error });
      return [];
    }
  }

  /**
   * Detect quality signals in repository
   */
  private async detectQualitySignals(
    owner: string,
    repo: string,
    structure: string[]
  ): Promise<QualitySignals> {
    // Check for common quality indicators
    const hasTypes = structure.some(
      (file) => file === 'tsconfig.json' || (file === 'package.json' && structure.includes('src'))
    );

    const hasLinting = structure.some(
      (file) =>
        file === '.eslintrc' ||
        file === '.eslintrc.js' ||
        file === '.eslintrc.json' ||
        file === '.prettierrc'
    );

    const hasCI = structure.some(
      (file) => file === '.github' || file === '.gitlab-ci.yml' || file === 'jenkinsfile'
    );

    const hasTests = structure.some(
      (file) =>
        file === 'test' ||
        file === 'tests' ||
        file === '__tests__' ||
        file.includes('.test.') ||
        file.includes('.spec.')
    );

    const hasReadme = structure.some(
      (file) =>
        file.toLowerCase() === 'readme.md' ||
        file.toLowerCase() === 'readme' ||
        file.toLowerCase() === 'readme.txt'
    );

    // Check for modern package indicators
    const isModernPackage = structure.some(
      (file) => file === 'pnpm-lock.yaml' || file === 'yarn.lock' || file === 'package-lock.json'
    );

    // Try to get license info
    let licenseType: string | undefined;
    try {
      const licenseFiles = structure.filter(
        (file) => file.toLowerCase().includes('license') || file.toLowerCase().includes('licence')
      );

      if (licenseFiles.length > 0) {
        licenseType = 'detected';
      }
    } catch (error) {
      logger.debug('Could not detect license type', { error });
    }

    return {
      hasTypes,
      hasLinting,
      hasCI,
      hasTests,
      hasReadme,
      licenseType,
      isModernPackage,
    };
  }

  /**
   * Make a request to GitHub API with proper error handling
   */
  private async makeGitHubApiRequest(url: string): Promise<HttpResponse<string>> {
    const options: HttpRequest = {
      url,
      method: 'GET',
      headers: {
        'User-Agent': 'ForgeLab/1.0',
        Accept: 'application/vnd.github.v3+json',
      },
    };

    return await httpRequest<string>(options);
  }

  /**
   * Calculate quality score based on signals
   */
  private calculateQualityScore(signals: QualitySignals): number {
    let score = 0;
    if (signals.hasTypes) score += 2;
    if (signals.hasLinting) score += 2;
    if (signals.hasCI) score += 3;
    if (signals.hasTests) score += 3;
    if (signals.hasReadme) score += 1;
    if (signals.licenseType) score += 1;
    if (signals.isModernPackage) score += 1;
    return score;
  }
}
