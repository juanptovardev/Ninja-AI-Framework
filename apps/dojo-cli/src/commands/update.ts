import { SelfUpdater } from '@ninja/installer';
import { printBanner, printInfo, printSuccess, printError, printWarning, printDivider } from '../display.js';
import { CLI_NAME } from '../constants.js';
import { createLogger } from '@ninja/logging';

const log = createLogger('dojo-cli:update');

/**
 * ninja update [--check]
 *
 * Checks for and applies updates to the Ninja AI Framework.
 *
 * Examples:
 *   ninja update           → check for updates and install if available
 *   ninja update --check   → only check, do not install
 */
export async function updateCommand(args: string[]): Promise<void> {
  printBanner();
  printInfo(`${CLI_NAME} — Self-Update`);
  printDivider();

  const onlyCheck = args.includes('--check') || args.includes('-c');
  const selfUpdater = new SelfUpdater();

  printInfo('Checking for updates...\n');

  try {
    const check = await selfUpdater.checkForUpdates();

    if (!check.hasUpdate) {
      console.log(`  ✅  You're on the latest version: ${check.currentVersion}\n`);
      printDivider();
      console.log('');
      printInfo('No update needed.');
      console.log('');
      return;
    }

    console.log(`  Current version:  ${check.currentVersion}`);
    console.log(`  Latest version:   ${check.latestVersion}`);
    console.log('');

    if (onlyCheck) {
      printWarning('Update available! Run "ninja update" to install it.');
      console.log('');
      return;
    }

    printInfo(`Downloading Ninja v${check.latestVersion}...\n`);

    const result = await selfUpdater.update();

    if (result.success) {
      console.log('');
      printSuccess(`Ninja updated successfully: ${result.from} → ${result.to}`);
      console.log('');
      printInfo('Restart your terminal or run "ninja" to use the new version.');
      console.log('');
    } else {
      printError(`Update failed: ${result.from} → ${result.to}`);
      console.log('');
      printInfo('Try running manually: npm install -g ninja-ai-framework@latest');
      console.log('');
    }
  } catch (err: any) {
    log.error('Update command failed', err);
    printError(`Update failed: ${err.message || String(err)}`);
    console.log('');
    printInfo('Check your internet connection and try again.');
    console.log('');
  }
}