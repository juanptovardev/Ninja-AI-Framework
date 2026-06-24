import { createLogger } from '@ninja/logging';
import { eventBus, createEvent } from '@ninja/events';
import { httpRequest, type HttpResponse, type HttpRequest } from '@ninja/integrations-http';
import { ensureDirectory, writeFile, deleteFile } from '@ninja/integrations-fs';
import { RepoAnalysis, ExtractedContent, ExtractionOptions, ContentTarget } from './schema.js';
import { RepoAnalyzer } from './repo-analyzer.js';

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export class ContentExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentExtractionError';
  }
}

// ---------------------------------------------------------------------------
// Content Extractor Implementation
// ---------------------------------------------------------------------------

const logger = createLogger('forge-lab');

export class ContentExtractor {
  constructor(private readonly httpClient: typeof httpRequest) {}

  /**
   * Extract relevant files from a repository analysis
   * @param analysis Repository analysis results
   * @param options Extraction options
   * @returns Array of extracted content
   */
  async extractRelevantFiles(
    analysis: RepoAnalysis,
    options: ExtractionOptions
  ): Promise<ExtractedContent[]> {
    logger.info('Extracting relevant files', {
      url: analysis.repo.url,
      targetTypes: options.targetTypes,
      maxFiles: options.maxFiles,
    });

    try {
      // Create temporary directory for extracted content
      const tempDir = await this.createTempDirectory();

      const extractedContent: ExtractedContent[] = [];
      let fileCount = 0;
      const maxFiles = options.maxFiles || 20;

      // Parse GitHub URL to get owner/repo
      const repoInfo = this.parseGitHubUrl(analysis.repo.url);
      if (!repoInfo) {
        throw new ContentExtractionError(`Invalid GitHub URL: ${analysis.repo.url}`);
      }

      // Extract files based on target types
      const filesToExtract = await this.getFilesForExtraction(
        repoInfo.owner,
        repoInfo.repo,
        options
      );

      // Download and process each file
      for (const file of filesToExtract) {
        if (fileCount >= maxFiles) break;

        try {
          const content = await this.extractFileContent(
            repoInfo.owner,
            repoInfo.repo,
            file.path,
            tempDir
          );

          if (content) {
            extractedContent.push(content);
            fileCount++;
          }
        } catch (error) {
          logger.warn('Failed to extract file', {
            path: file.path,
            error: (error as Error).message,
          });
        }
      }

      // Emit extraction event
      eventBus.emit(
        createEvent('forgelab.content.extracted', 'forge-lab', {
          url: analysis.repo.url,
          extractedCount: extractedContent.length,
        })
      );

      // Clean up temporary directory
      await this.cleanupTempDirectory(tempDir);

      return extractedContent;
    } catch (error) {
      logger.error('Content extraction failed', { error });
      throw error;
    }
  }

  /**
   * Parse GitHub URL to extract owner and repository name
   */
  private parseGitHubUrl(url: string): { owner: string; repo: string } | null {
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
   * Create temporary directory for file extraction
   */
  private async createTempDirectory(): Promise<string> {
    const tempDir = `/tmp/forgelab-${Date.now()}`;
    await ensureDirectory(tempDir);
    return tempDir;
  }

  /**
   * Clean up temporary directory
   */
  private async cleanupTempDirectory(tempDir: string): Promise<void> {
    try {
      // Note: In a real implementation, we would delete the temp directory
      // For now, we'll just log that cleanup is needed
      logger.info('Temporary directory cleanup needed', { tempDir });
    } catch (error) {
      logger.warn('Failed to clean up temporary directory', { error });
    }
  }

  /**
   * Get list of files to extract based on options
   */
  private async getFilesForExtraction(
    owner: string,
    repo: string,
    options: ExtractionOptions
  ): Promise<Array<{ path: string; type: ContentTarget }>> {
    // This would typically involve GitHub API calls to get repository contents
    // For now, we'll return a mock list
    const files: Array<{ path: string; type: ContentTarget }> = [];

    // Add mock files for demonstration
    for (const targetType of options.targetTypes) {
      files.push({
        path: `src/example-${targetType}.ts`,
        type: targetType,
      });
    }

    return files;
  }

  /**
   * Extract content from a specific file
   */
  private async extractFileContent(
    owner: string,
    repo: string,
    path: string,
    tempDir: string
  ): Promise<ExtractedContent | null> {
    try {
      // Get raw content URL
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${path}`;

      // Download file content
      const request: HttpRequest = {
        url: rawUrl,
        method: 'GET',
      };
      const response = await this.httpClient(request);

      if (response.status !== 200) {
        logger.warn('Failed to fetch file content', {
          url: rawUrl,
          status: response.status,
        });
        return null;
      }

      // Save to temporary file
      const tempFilePath = `${tempDir}/${path.replace(/\//g, '_')}`;
      await writeFile(tempFilePath, response.data as unknown as string);

      // Create extracted content object
      const content: ExtractedContent = {
        sourcePath: path,
        targetType: this.determineTargetType(path),
        rawContent: response.data as unknown as string,
        metadata: {
          origin: `https://github.com/${owner}/${repo}`,
          originUrl: rawUrl,
          extractedAt: new Date(),
          language: this.detectLanguage(path),
        },
      };

      return content;
    } catch (error) {
      logger.error('Failed to extract file content', {
        path,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Determine target type based on file path
   */
  private determineTargetType(path: string): ContentTarget {
    if (path.includes('/workflow/') || path.includes('.workflow.')) {
      return 'workflow';
    }

    if (path.includes('/template/') || path.includes('.template.')) {
      return 'template';
    }

    if (path.includes('/pattern/') || path.includes('.pattern.')) {
      return 'pattern';
    }

    return 'skill';
  }

  /**
   * Detect programming language from file extension
   */
  private detectLanguage(path: string): string {
    if (path.endsWith('.ts')) return 'typescript';
    if (path.endsWith('.js')) return 'javascript';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.md')) return 'markdown';
    if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml';
    return 'unknown';
  }
}
