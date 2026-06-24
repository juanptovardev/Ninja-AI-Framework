/**
 * @ninja/contracts — integrations.ts
 * Tipos compartidos para los packages de integraciones de la Fase 8.
 * Usados por integrations-shell, integrations-git, forge-lab y consumidores del sistema.
 */

import type { ID, Timestamp } from './common.js';

// ---------------------------------------------------------------------------
// Shell Integration Types
// ---------------------------------------------------------------------------

/**
 * Resultado de ejecutar un comando de shell.
 * Retornado por integrations-shell y consumido por otros packages.
 */
export interface ShellCommandResult {
  /** Código de salida del proceso (0 = éxito) */
  readonly exitCode: number;
  /** Salida estándar completa del comando */
  readonly stdout: string;
  /** Salida de error del comando */
  readonly stderr: string;
  /** Duración de ejecución en milisegundos */
  readonly duration: number;
}

// ---------------------------------------------------------------------------
// Git Integration Types
// ---------------------------------------------------------------------------

/**
 * Estado simplificado de un repositorio Git.
 * Versión agregada para uso transversal (no incluye detalles de archivos).
 */
export interface GitRepoStatus {
  /** Nombre de la rama actual */
  readonly branch: string;
  /** Si el working directory está limpio (sin cambios) */
  readonly isClean: boolean;
  /** Número total de archivos modificados (staged + unstaged + untracked) */
  readonly changedFiles: number;
}

// ---------------------------------------------------------------------------
// Forge Lab Types
// ---------------------------------------------------------------------------

/**
 * Tipos de assets de conocimiento gestionados por Forge Lab.
 * Clasificación de contenido externo normalizado.
 */
export type KnowledgeAssetType = 'skill' | 'workflow' | 'template' | 'pattern';

/**
 * Tipos de eventos emitidos por Forge Lab.
 */
export type ForgeLabEventType =
  | 'forgelab.repo.analyzed'
  | 'forgelab.content.extracted'
  | 'forgelab.content.normalized'
  | 'forgelab.content.scored'
  | 'forgelab.content.promoted'
  | 'forgelab.content.rejected';

/**
 * Payload para forgelab.repo.analyzed
 */
export interface ForgeLabRepoAnalyzedPayload {
  /** URL del repositorio analizado */
  readonly repoUrl: string;
  /** Nombre del repositorio */
  readonly repoName: string;
  /** Número de archivos encontrados */
  readonly fileCount: number;
  /** Lenguaje principal detectado */
  readonly mainLanguage: string;
}

/**
 * Payload para forgelab.content.extracted
 */
export interface ForgeLabContentExtractedPayload {
  /** URL del repositorio fuente */
  readonly repoUrl: string;
  /** Tipo de contenido extraído */
  readonly assetType: KnowledgeAssetType;
  /** Path del archivo extraído */
  readonly sourcePath: string;
}

/**
 * Payload para forgelab.content.promoted
 */
export interface ForgeLabContentPromotedPayload {
  /** ID del asset promovido */
  readonly assetId: ID;
  /** Tipo de asset */
  readonly assetType: KnowledgeAssetType;
  /** URL del repositorio original */
  readonly originUrl: string;
  /** Score de calidad asignado */
  readonly qualityScore: number;
}

/**
 * Payload para forgelab.content.rejected
 */
export interface ForgeLabContentRejectedPayload {
  /** URL del repositorio fuente */
  readonly repoUrl: string;
  /** Motivo del rechazo */
  readonly reason: string;
}

/**
 * Payload para forgelab.content.scored
 */
export interface ForgeLabContentScoredPayload {
  /** Path del archivo evaluado */
  readonly sourcePath: string;
  /** Score de calidad (0-100) */
  readonly score: number;
  /** Indicadores de calidad detectados */
  readonly signals: readonly string[];
}
