import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ArsenalRegistry } from '../registry';
import {
  ContentPackLoader,
  parseSkillFrontmatter,
  resolveContentRoot,
} from '../content-pack-loader';

/** Raíz real de content/ del repo (fixture = los archivos que ya existen). */
const REAL_CONTENT_ROOT = path.resolve(__dirname, '../../../../content');

function getRegistry(): ArsenalRegistry {
  return ArsenalRegistry.getInstance();
}

describe('ContentPackLoader — fixture real del repo', () => {
  it('resuelve la raíz real de content/ desde el cwd del repo', () => {
    const root = resolveContentRoot();
    expect(root).not.toBeNull();
    expect(path.basename(root as string)).toBe('content');
  });

  it('parsea el frontmatter de un skill .md del repo', () => {
    const frontmatter = parseSkillFrontmatter(
      `---
name: ninja-coding-assistant
description: Programar código TypeScript.
---\n\n# Coding Assistant`
    );
    expect(frontmatter.name).toBe('ninja-coding-assistant');
    expect(frontmatter.description).toContain('TypeScript');
  });

  it('carga skills, workflows y templates reales con source content-pack', () => {
    const registry = getRegistry();
    const loader = new ContentPackLoader(registry, { contentRoot: REAL_CONTENT_ROOT });
    const result = loader.load();

    expect(result.loaded).toBeGreaterThanOrEqual(3);
    expect(result.items.length).toBe(8); // 3 skills + 2 workflows + 3 templates

    const contentSkills = result.items.filter((i) => i.kind === 'skill');
    const workflows = result.items.filter((i) => i.kind === 'workflow');
    const templates = result.items.filter((i) => i.kind === 'template');

    expect(contentSkills.map((s) => s.id).sort()).toEqual([
      'ninja-code-reviewer',
      'ninja-coding-assistant',
      'ninja-documentation-writer',
    ]);
    expect(workflows.map((w) => w.id).sort()).toEqual(['build-from-prompt', 'repair-broken-build']);
    expect(templates.map((t) => t.id).sort()).toContain('typescript-package');

    for (const skill of result.items) {
      const registered = registry.getSkill(skill.id);
      expect(registered).not.toBeNull();
      expect(registered?.metadata?.source).toBe('content-pack');
    }
  });

  it('expone el content-pack vía el catálogo de skills (GET /api/arsenal base)', () => {
    const registry = getRegistry();
    const contentSkills = registry
      .listSkills()
      .filter((s) => s.metadata?.source === 'content-pack');
    expect(contentSkills.length).toBeGreaterThanOrEqual(3);
    expect(contentSkills.every((s) => s.metadata?.source === 'content-pack')).toBe(true);
  });

  it('es idempotente: cargar dos veces no duplica ni lanza', () => {
    const registry = getRegistry();
    const loader = new ContentPackLoader(registry, { contentRoot: REAL_CONTENT_ROOT });

    const first = loader.load();
    const second = loader.load();

    // Idempotencia: la segunda carga no registra nada nuevo (loaded = 0),
    // todos los ítems encontrados ya estaban (skipped = total de ítems).
    expect(second.loaded).toBe(0);
    expect(second.skipped).toBe(first.items.length);
    expect(first.items.length).toBe(8);

    const contentCount = registry
      .listSkills()
      .filter((s) => s.metadata?.source === 'content-pack').length;
    expect(contentCount).toBe(8);
    expect(() => loader.load()).not.toThrow();
  });

  it('ruta faltante → warning sin crash', () => {
    const registry = getRegistry();
    const loader = new ContentPackLoader(registry, {
      contentRoot: path.resolve(__dirname, '../../../../no-such-content'),
    });
    const result = loader.load();
    expect(result.loaded).toBe(0);
    expect(result.items.length).toBe(0);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('directorio parcial faltante → warning sin crash y carga el resto', () => {
    // Crea un árbol temporal con solo skills para verificar tolerancia.
    const tmpRoot = path.join(path.resolve(__dirname, '../../../../.tmp-content-pack-test'));
    rmSync(tmpRoot, { recursive: true, force: true });
    mkdirSync(path.join(tmpRoot, 'skills'), { recursive: true });
    writeFileSync(
      path.join(tmpRoot, 'skills', 'test-skill.md'),
      '---\nname: test-skill\ndescription: Skill de prueba\n---\n\n# Test'
    );

    try {
      const registry = getRegistry();
      const loader = new ContentPackLoader(registry, { contentRoot: tmpRoot });
      const result = loader.load();
      expect(result.loaded).toBe(1);
      expect(result.warnings.length).toBeGreaterThanOrEqual(2); // workflows + templates
      expect(registry.getSkill('test-skill')).not.toBeNull();
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
