import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { scanDirectory, getFileTree, readFile } from '@ninja/integrations-fs';
import { executeCommand } from '@ninja/integrations-shell';
import { eventBus } from '@ninja/events';
import type { NinjaEvent, FsScanCompletedPayload } from '@ninja/contracts';
import { createLogger } from '@ninja/logging';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { GitClient, getStatus, getBranch } from '@ninja/integrations-git';

const log = createLogger('test:integrations-pipeline');

const FIXTURE_PATH = join(__dirname, '../fixtures/sample-workspace');

describe('Integrations Pipeline', () => {
  beforeAll(() => {
    log.info(`Testing integrations in ${FIXTURE_PATH}`);
  });

  afterAll(() => {
    eventBus.clear();
  });

it('shell execute → resultado capturado correctamente', async () => {
  const testString = `ninja-test-${randomUUID().slice(0, 8).replace(/d/g, 'x')}`;
  const result = await executeCommand({
    cmd: 'echo',
    args: [testString],
    cwd: FIXTURE_PATH,
    timeout: 5000,
  });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(testString);
    expect(result.stderr).toBe('');
    expect(result.duration).toBeGreaterThan(0);
    expect(result.duration).toBeLessThan(5000);

    log.info(`Shell execute test passed: exitCode=${result.exitCode}, duration=${result.duration}ms`);
  });

it('shell execute → soporta múltiples comandos en secuencia', async () => {
  const testId = randomUUID().slice(0, 8).replace(/d/g, 'x');
  const commands = [
    { cmd: 'echo', args: [`first-${testId}`] },
    { cmd: 'echo', args: [`second-${testId}`] },
    { cmd: 'echo', args: [`third-${testId}`] },
  ];

  const results = [];
  for (const command of commands) {
    const result = await executeCommand({
      cmd: command.cmd,
      args: command.args,
      cwd: FIXTURE_PATH,
    });
    results.push(result);
  }

  expect(results).toHaveLength(3);
  expect(results[0].exitCode).toBe(0);
  expect(results[1].exitCode).toBe(0);
  expect(results[2].exitCode).toBe(0);

  log.info(`Multiple commands test passed: ${results.length} commands executed`);
});

  it('fs scan → devuelve estructura real del fixture workspace', async () => {
    const files = await scanDirectory(FIXTURE_PATH);

    expect(files).toBeDefined();
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);

    const filePaths = files.map((f) => f.path.toLowerCase());
    const hasPackageJson = filePaths.some(path => path.includes('package.json'));
    const hasReadme = filePaths.some(path => path.includes('README.md'));
    
    expect(hasPackageJson || hasReadme).toBe(true);

    const packageJsonFile = files.find((f) => f.path.toLowerCase().includes('package.json'));
    if (packageJsonFile) {
      expect(packageJsonFile.isDirectory).toBe(false);
      expect(packageJsonFile.size).toBeGreaterThan(0);
    }

    log.info(`FS scan test passed: found ${files.length} files/directories`);
  });

  it('fs scan → emite evento fs.scan.completed al bus', async () => {
    const fsEvents: NinjaEvent<FsScanCompletedPayload>[] = [];
    
    const subscription = eventBus.on('fs.scan.completed', (event: NinjaEvent<FsScanCompletedPayload>) => {
      fsEvents.push(event);
    });

    try {
      await scanDirectory(FIXTURE_PATH);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(fsEvents).toHaveLength(1);
      const fsEvent = fsEvents[0];
      expect(fsEvent.type).toBe('fs.scan.completed');
      expect(fsEvent.source).toBe('fs');
      expect(fsEvent.payload.path).toBe(FIXTURE_PATH);
      expect(fsEvent.payload.fileCount).toBeGreaterThan(0);

      log.info(`FS scan event test passed: path=${fsEvent.payload.path}, fileCount=${fsEvent.payload.fileCount}`);
    } finally {
      subscription.unsubscribe();
    }
  });

  it('fs getFileTree → devuelve árbol de archivos del fixture', async () => {
    const tree = await getFileTree(FIXTURE_PATH);

    expect(tree).toBeDefined();
    expect(tree.name).toBe('sample-workspace');
    expect(tree.path).toBe(FIXTURE_PATH);
    
    if (tree.children) {
      const childNames = tree.children.map((c) => c.name);
      expect(childNames).toContain('package.json');
      expect(childNames).toContain('README.md');
      expect(childNames).toContain('src');
    }

    log.info(`FS getFileTree test passed: tree has ${tree.children?.length} root children`);
  });

  it('fs readFile → lee contenido de archivo real', async () => {
    const packageJsonPath = join(FIXTURE_PATH, 'package.json');
    const content = await readFile(packageJsonPath);

    expect(content).toBeDefined();
    expect(typeof content).toBe('string');
    expect(content).toContain('test-workspace');

    const packageData = JSON.parse(content);
    expect(packageData.name).toBe('test-workspace');

    log.info(`FS readFile test passed: package.json name=${packageData.name}`);
  });

  it('git status → devuelve branch info del fixture workspace', async () => {
    const client = new GitClient(FIXTURE_PATH);
    
    const isGitAvailable = await client.isGitAvailable().catch(() => false);
    if (!isGitAvailable) {
      log.warn('Git not available, skipping git status test');
      return;
    }

    const isRepo = await client.isGitRepo();
    if (!isRepo) {
      log.warn('Fixture is not a git repo, skipping git status test');
      return;
    }

    const status = await getStatus(client);

    expect(status).toBeDefined();
    expect(status.branch).toBeDefined();
    expect(Array.isArray(status.staged)).toBe(true);
    expect(Array.isArray(status.unstaged)).toBe(true);
    expect(Array.isArray(status.untracked)).toBe(true);

    log.info(`Git status test passed: branch=${status.branch}`);
  }, 15000);

  it('git getBranch → devuelve nombre de rama correcto', async () => {
    const client = new GitClient(FIXTURE_PATH);
    
    const isGitAvailable = await client.isGitAvailable().catch(() => false);
    if (!isGitAvailable) {
      log.warn('Git not available, skipping git branch test');
      return;
    }

    const isRepo = await client.isGitRepo();
    if (!isRepo) {
      log.warn('Fixture is not a git repo, skipping git branch test');
      return;
    }

    const branch = await getBranch(client);

    expect(branch).toBeDefined();
    expect(typeof branch).toBe('string');

    log.info(`Git branch test passed: branch=${branch}`);
  }, 15000);

  it('git log → devuelve historial de commits', async () => {
    const client = new GitClient(FIXTURE_PATH);
    
    const isGitAvailable = await client.isGitAvailable().catch(() => false);
    if (!isGitAvailable) {
      log.warn('Git not available, skipping git log test');
      return;
    }

    const isRepo = await client.isGitRepo();
    if (!isRepo) {
      log.warn('Fixture is not a git repo, skipping git log test');
      return;
    }

    const { getLog } = await import('@ninja/integrations-git');
    const commits = await getLog(client, 5);

    expect(Array.isArray(commits)).toBe(true);
    
    if (commits.length > 0) {
      const firstCommit = commits[0];
      expect(firstCommit.hash).toBeDefined();
      expect(firstCommit.message).toBeDefined();
    }

    log.info(`Git log test passed: ${commits.length} commits retrieved`);
  }, 15000);

  it('pipeline completo → shell → fs → git en secuencia', async () => {
    const testId = randomUUID().slice(0, 8).replace(/d/g, 'x');
    const tempDir = join(FIXTURE_PATH, `temp-${testId}`);
    
    try {
      const mkdirResult = await executeCommand({
        cmd: 'mkdir',
        args: [tempDir],
        cwd: FIXTURE_PATH,
      });
      expect(mkdirResult.exitCode).toBe(0);

      const files = await scanDirectory(tempDir);
      expect(files.length).toBeGreaterThanOrEqual(0);

      const client = new GitClient(FIXTURE_PATH);
      const isGitAvailable = await client.isGitAvailable().catch(() => false);
      
      if (isGitAvailable && await client.isGitRepo()) {
        const status = await getStatus(client);
        expect(status.branch).toBeDefined();
      }

      log.info(`Pipeline test passed`);
    } finally {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        log.warn(`Failed to clean up temp dir: ${tempDir}`, error);
      }
    }
  });
});
