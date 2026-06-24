import chalk from 'chalk';
import figlet from 'figlet';
import { CLI_NAME, CLI_VERSION, CLI_TAGLINE } from './constants.js';

export function printBanner(): void {
  console.clear();
  console.log('');

  // Generate ASCII art banner
  const asciiBanner = figlet.textSync('Ninja', {
    font: 'Standard',
    horizontalLayout: 'default',
    verticalLayout: 'default',
  });

  console.log(chalk.cyan.bold(asciiBanner));
  console.log('');
  console.log(chalk.white.bold(`  ${CLI_NAME} v${CLI_VERSION}`));
  console.log(chalk.gray(`  ${CLI_TAGLINE}`));
  console.log('');
  console.log(chalk.gray('  ─────────────────────────────────────────'));
  console.log('');
}

export function printSuccess(message: string): void {
  console.log(chalk.green('  ✔ ') + chalk.white(message));
}

export function printError(message: string): void {
  console.log(chalk.red('  ✘ ') + chalk.white(message));
}

export function printInfo(message: string): void {
  console.log(chalk.cyan('  ℹ ') + chalk.gray(message));
}

export function printWarning(message: string): void {
  console.log(chalk.yellow('  ⚠ ') + chalk.white(message));
}

export function printDivider(): void {
  console.log(chalk.gray('  ─────────────────────────────────────────'));
}

export function printLog(source: string, message: string): void {
  const ts = new Date().toLocaleTimeString();
  console.log(chalk.gray(`  [${ts}]`) + chalk.cyan(` [${source}]`) + chalk.white(` ${message}`));
}
