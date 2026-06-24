import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createLogger } from '@ninja/logging';

const log = createLogger('installer:self-updater');

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/ninja-ai-framework/latest';
const TIMEOUT_MS = 30000;

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
}

export interface UpdateResult {
  success: boolean;
  from: string;
  to: string;
}

/**
 * SelfUpdater — checks for and applies updates to the Ninja AI Framework.
 * Works by reading the local package.json version and comparing it against
 * the npm registry. Supports npm and pnpm package managers.
 */
export class SelfUpdater {
  private readonly npmRegistryUrl: string;
  private readonly timeoutMs: number;

  constructor(options?: { npmRegistryUrl?: string; timeoutMs?: number }) {
    this.npmRegistryUrl = options?.npmRegistryUrl ?? NPM_REGISTRY_URL;
    this.timeoutMs = options?.timeoutMs ?? TIMEOUT_MS;
  }

  /**
   * Reads the current version from the nearest package.json.
   * Walks up from the module's directory to find a package.json with name matching ninja-*
   * or returns dojo-cli's constant version as fallback.
   */
  getCurrentVersion(): string {
    try {
      const modulePath = this.findPackageJson();
      if (modulePath) {
        const pkg = JSON.parse(fs.readFileSync(modulePath, 'utf8'));
        if (pkg.version) return pkg.version;
      }
    } catch (err) {
      log.warn('Could not read local version from package.json', err);
    }
    return '0.0.0';
  }

  /**
   * Checks the npm registry for the latest version of the package.
   */
  async checkForUpdates(): Promise<UpdateCheckResult> {
    const currentVersion = this.getCurrentVersion();

    let latestVersion = currentVersion;
    try {
      const response = await fetch(this.npmRegistryUrl, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        log.warn(`Registry returned status ${response.status}`);
        return { hasUpdate: false, currentVersion, latestVersion };
      }

      const data = await response.json() as any;
      latestVersion = data.version ?? currentVersion;
    } catch (err) {
      log.warn('Failed to fetch latest version from registry', err);
      return { hasUpdate: false, currentVersion, latestVersion };
    }

    const hasUpdate = this.compareVersions(latestVersion, currentVersion) > 0;

    return { hasUpdate, currentVersion, latestVersion };
  }

  /**
   * Applies the update by running the appropriate package manager command.
   */
  async update(): Promise<UpdateResult> {
    const check = await this.checkForUpdates();

    if (!check.hasUpdate) {
      return {
        success: true,
        from: check.currentVersion,
        to: check.latestVersion,
      };
    }

    const pm = this.detectPackageManager();

    return new Promise((resolve) => {
      const cmd = pm === 'pnpm'
        ? `pnpm add -g ninja-ai-framework@latest`
        : `npm install -g ninja-ai-framework@latest`;

      log.info(`Updating via: ${pm} — ${cmd}`);

      const child = spawn(cmd, [], {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({
          success: false,
          from: check.currentVersion,
          to: check.latestVersion,
        });
      }, 120000);

      child.on('close', (code) => {
        clearTimeout(timeout);

        if (code === 0) {
          log.info(`Update successful: ${check.currentVersion} → ${check.latestVersion}`);
          resolve({
            success: true,
            from: check.currentVersion,
            to: check.latestVersion,
          });
        } else {
          log.error(`Update failed (exit code ${code}): ${stderr}`);
          resolve({
            success: false,
            from: check.currentVersion,
            to: check.latestVersion,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        log.error(`Update process error: ${err.message}`);
        resolve({
          success: false,
          from: check.currentVersion,
          to: check.latestVersion,
        });
      });
    });
  }

  /**
   * Compares two SemVer strings.
   * Returns > 0 if a > b, < 0 if a < b, 0 if equal.
   */
  private compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] ?? 0;
      const numB = partsB[i] ?? 0;
      if (numA > numB) return 1;
      if (numA < numB) return -1;
    }
    return 0;
  }

  /**
   * Detects the preferred package manager: pnpm (if available) or npm.
   */
  private detectPackageManager(): 'pnpm' | 'npm' {
    try {
      execSync('pnpm --version', { stdio: 'ignore' });
      return 'pnpm';
    } catch {
      return 'npm';
    }
  }

  /**
   * Walks up from the current module's directory to find the first package.json.
   */
  private findPackageJson(): string | null {
    const currentFile = fileURLToPath(import.meta.url);
    let dir = path.dirname(currentFile);
    const root = path.parse(dir).root;

    while (dir !== root) {
      const candidate = path.join(dir, 'package.json');
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      dir = path.dirname(dir);
    }

    return null;
  }
}