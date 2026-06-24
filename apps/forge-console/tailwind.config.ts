import { ninjaTailwindPreset } from '@ninja/ui-kit';
import type { Config } from 'tailwindcss';

const config: Config = {
  presets: [ninjaTailwindPreset],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui-kit/src/**/*.{js,ts,jsx,tsx}',
    '../../packages/app-shell/src/**/*.{js,ts,jsx,tsx}',
  ],
};

export default config;
