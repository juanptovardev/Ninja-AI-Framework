import { describe, it, expect } from 'vitest';
import { commonUtils } from './index.js';

describe('commonUtils', () => {
  it('exports a module placeholder string', () => {
    expect(commonUtils).toBeDefined();
    expect(typeof commonUtils).toBe('string');
  });

  it('exports the expected scaffolding value', () => {
    expect(commonUtils).toBe('Minimal scaffolding for @ninja/common-utils');
  });

  it('imports resolve correctly from the package entry point', () => {
    expect(commonUtils.length).toBeGreaterThan(0);
  });
});