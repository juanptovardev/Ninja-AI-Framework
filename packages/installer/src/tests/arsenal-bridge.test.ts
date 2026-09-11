import { describe, it, expect } from 'vitest';
import { ArsenalBridge } from '../arsenal-bridge.js';
import { getDefaultSkills } from '../content/index.js';
import type { ArsenalSnapshot } from '@ninja/arsenal-registry';

// Mock snapshot data
const mockSnapshot: ArsenalSnapshot = {
  timestamp: '2026-06-04T10:00:00.000Z',
  tools: new Map(),
  skills: new Map([
    [
      'debug-assistant',
      {
        id: 'debug-assistant',
        name: 'Debug Assistant',
        description: 'Helps with debugging code issues',
        tools: ['fs.read'],
        agentRole: 'worker',
      },
    ],
    [
      'code-review',
      {
        id: 'code-review',
        name: 'Code Review',
        description: 'Reviews code quality and style',
        tools: ['fs.read', 'git.status'],
        agentRole: 'sentinel',
      },
    ],
  ]),
};

describe('ArsenalBridge', () => {
  describe('getInjectionSkills', () => {
    it('should return default skills when no arsenal snapshot is provided', () => {
      const skills = ArsenalBridge.getInjectionSkills();
      const defaultSkills = getDefaultSkills();

      expect(skills).toEqual(defaultSkills);
    });

    it('should merge arsenal skills with defaults correctly', () => {
      const skills = ArsenalBridge.getInjectionSkills(mockSnapshot);
      const defaultSkills = getDefaultSkills();

      // Should have at least the default skills
      expect(skills.length).toBeGreaterThanOrEqual(defaultSkills.length);

      // Check that we have the arsenal skills in the result
      const hasArsenalSkill = skills.some((skill) => skill.id === 'debug-assistant');
      expect(hasArsenalSkill).toBe(true);

      // Check that we have the default skills
      const hasDefaultSkill = skills.some((skill) => skill.id === 'ninja-sdd-orchestrator');
      expect(hasDefaultSkill).toBe(true);
    });
  });
});
