/**
 * @ninja/arsenal-registry — content-pack-loader.ts
 * ContentPackLoader: inventario de `content/` del repo (skills, workflows, templates)
 * registrado en el catálogo con source: 'content-pack' (WP-E1).
 *
 * Lee rutas reales del repo: `content/{skills/*.md, workflows/*.json, templates/*.json}`.
 * Si una ruta no existe → warning sin crash. Idempotente: re-cargar no duplica.
 */
import fs from 'node:fs';
import path from 'node:path';
import { safeJsonParse } from '@ninja/common-utils';
import type { Logger } from '@ninja/logging';
import { createLogger } from '@ninja/logging';
import type { ArsenalRegistry } from './registry.js';
import type { SkillDefinition } from './schema.js';

export type ContentPackKind = 'skill' | 'workflow' | 'template';

export interface ContentPackItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: ContentPackKind;
  readonly path: string;
}

export interface ContentPackLoadResult {
  readonly loaded: number;
  readonly skipped: number;
  readonly warnings: string[];
  readonly items: ContentPackItem[];
}

export interface ContentPackLoaderOptions {
  /** Raíz de content/ (por defecto: sube desde process.cwd() hasta hallarla). */
  contentRoot?: string;
  logger?: Logger;
}

/** Estructura mínima de un skill en content/skills/*.md (frontmatter). */
interface SkillFrontmatter {
  readonly name?: string;
  readonly description?: string;
}

/** Estructura mínima de un JSON de content/ (workflows y templates). */
interface ContentJsonShape {
  readonly name?: string;
  readonly description?: string;
}

/**
 * Parsea el frontmatter `---\nname: ...\ndescription: ...\n---` de un skill .md.
 * Devuelve vacío si no hay frontmatter válido (no lanza).
 */
export function parseSkillFrontmatter(raw: string): SkillFrontmatter {
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!match) {
    return {};
  }
  const block = match[1];
  const name = /^\s*name:\s*(.+?)\s*$/m.exec(block)?.[1];
  const description = /^\s*description:\s*(.+?)\s*$/m.exec(block)?.[1];
  return {
    name: name?.trim(),
    description: description?.trim(),
  };
}

/**
 * Resuelve la raíz de content/ subiendo desde `startDir` buscando un dir `content`
 * que contenga `skills`. Devuelve null si no la encuentra.
 */
export function resolveContentRoot(startDir: string = process.cwd()): string | null {
  let dir = startDir;
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(dir, 'content');
    if (fs.existsSync(path.join(candidate, 'skills'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

/**
 * ContentPackLoader — registra el inventario real de content/ en el ArsenalRegistry.
 */
export class ContentPackLoader {
  private readonly registry: ArsenalRegistry;
  private readonly contentRoot: string | null;
  private readonly logger: Logger;

  constructor(registry: ArsenalRegistry, options: ContentPackLoaderOptions = {}) {
    this.registry = registry;
    this.logger = options.logger ?? createLogger('ContentPackLoader');
    this.contentRoot =
      options.contentRoot !== undefined
        ? options.contentRoot
        : resolveContentRoot(options.contentRoot ?? process.cwd());
  }

  /**
   * Carga skills/workflows/templates desde content/ y los registra en el catálogo.
   * Rutas faltantes → warning (no lanza). Idempotente: ítems ya registrados → skipped.
   */
  load(): ContentPackLoadResult {
    const warnings: string[] = [];
    const items: ContentPackItem[] = [];
    let loaded = 0;
    let skipped = 0;

    if (this.contentRoot === null || !fs.existsSync(this.contentRoot)) {
      warnings.push(`content/ no encontrado desde ${process.cwd()} — content-pack omitido`);
      this.logger.warn(`content/ no encontrado desde ${process.cwd()} — content-pack omitido`);
      return { loaded, skipped, warnings, items };
    }

    const dirs: Record<ContentPackKind, string> = {
      skill: path.join(this.contentRoot, 'skills'),
      workflow: path.join(this.contentRoot, 'workflows'),
      template: path.join(this.contentRoot, 'templates'),
    };

    for (const kind of Object.keys(dirs) as ContentPackKind[]) {
      const dir = dirs[kind];
      if (!fs.existsSync(dir)) {
        warnings.push(`Directorio ${kind}s no existe: ${dir}`);
        this.logger.warn(`Directorio ${kind}s no existe: ${dir}`);
        continue;
      }

      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(kind === 'skill' ? '.md' : '.json'));
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const item = this.parseItem(kind, file, fullPath);
        if (item === null) {
          warnings.push(`Archivo inválido en content/${kind}s: ${file}`);
          this.logger.warn(`Archivo inválido en content/${kind}s: ${file}`);
          continue;
        }
        items.push(item);

        if (this.registry.getSkill(item.id) !== null) {
          skipped += 1;
          continue;
        }
        this.registry.registerSkill(this.toSkillDefinition(item));
        loaded += 1;
      }
    }

    this.logger.info(
      `ContentPack cargado: ${loaded} registrados, ${skipped} omitidos, ${items.length} ítems`
    );
    return { loaded, skipped, warnings, items };
  }

  /** Lee y parsea un archivo de content/ a ContentPackItem; null si inválido. */
  private parseItem(
    kind: ContentPackKind,
    fileName: string,
    fullPath: string
  ): ContentPackItem | null {
    const raw = fs.readFileSync(fullPath, 'utf8');
    const baseId = fileName.replace(/\.(md|json)$/, '');

    if (kind === 'skill') {
      const frontmatter = parseSkillFrontmatter(raw);
      const id = frontmatter.name ?? baseId;
      return {
        id,
        name: frontmatter.name ?? baseId,
        description: frontmatter.description ?? '',
        kind,
        path: fullPath,
      };
    }

    const parsed = safeJsonParse<ContentJsonShape>(raw);
    if (!parsed.ok) {
      return null;
    }
    const json = parsed.value;
    const name = typeof json?.name === 'string' ? json.name : baseId;
    return {
      id: name,
      name,
      description: typeof json?.description === 'string' ? json.description : '',
      kind,
      path: fullPath,
    };
  }

  /** Convierte un ítem de content/ a SkillDefinition con source: 'content-pack'. */
  private toSkillDefinition(item: ContentPackItem): SkillDefinition {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      tools: [],
      agentRole: item.kind === 'workflow' ? 'workflow' : 'developer',
      workflowId: item.kind === 'workflow' ? item.id : undefined,
      metadata: {
        source: 'content-pack',
        kind: item.kind,
        path: item.path,
      },
    };
  }
}

/** Conveniencia: instancia el loader con el registry y lo corre. */
export function loadContentPack(
  registry: ArsenalRegistry,
  options: ContentPackLoaderOptions = {}
): ContentPackLoadResult {
  return new ContentPackLoader(registry, options).load();
}
