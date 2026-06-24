import type { ArsenalSnapshot } from '@ninja/arsenal-registry';
import { exportSkillsForInjection } from '@ninja/arsenal-registry';
import type { NinjaSkill } from './types.js';
import { getDefaultSkills } from './content/index.js';

/**
 * ArsenalBridge - Bridges the Arsenal Registry with the Ninja installer.
 * Converts Arsenal skills into Ninja skills for injection.
 */
export class ArsenalBridge {
  /**
   * Converts Arsenal skills to Ninja skills for injection.
   * If no snapshot is provided, returns default skills.
   * If a snapshot is provided, merges Arsenal skills with defaults.
   */
  static getInjectionSkills(snapshot?: ArsenalSnapshot): NinjaSkill[] {
    // If no snapshot provided, return defaults only
    if (!snapshot) {
      return getDefaultSkills();
    }

    // Ensure we have a Map of skills. If the snapshot has a Map, use it.
    // If it's a plain object (e.g. in tests), convert it to a Map first.
    let skillsMap: Map<string, any>;
    if (snapshot.skills instanceof Map) {
      skillsMap = snapshot.skills;
    } else if (snapshot.skills && typeof snapshot.skills === 'object') {
      skillsMap = new Map(Object.entries(snapshot.skills));
    } else {
      skillsMap = new Map();
    }

    // Export using the unified skill exporter
    const exportedSkills = exportSkillsForInjection(skillsMap) as NinjaSkill[];

    // Start with default skills
    const skills: NinjaSkill[] = [...getDefaultSkills()];
    
    // Merge: Arsenal skills override defaults by id
    for (const exported of exportedSkills) {
      const existingIndex = skills.findIndex(s => s.id === exported.id);
      if (existingIndex !== -1) {
        // Replace existing skill with Arsenal version
        skills[existingIndex] = exported;
      } else {
        // Add new skill from Arsenal
        skills.push(exported);
      }
    }
    
    return skills;
  }
}