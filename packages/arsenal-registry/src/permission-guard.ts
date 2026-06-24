import type { ToolDefinition, ToolContext } from './schema';

/**
 * Resultado de verificación de permisos
 */
export interface PermissionResult {
  readonly allowed: boolean;
  readonly requiresConfirmation: boolean;
  readonly reason: string;
  readonly suggestedAction?: string; // Para UI de confirmación
}

/**
 * Verifica si una herramienta puede ser ejecutada en el contexto actual
 */
export function checkPermission(tool: ToolDefinition, context: ToolContext): PermissionResult {
  // Verificar si el contexto tiene los permisos necesarios
  const hasPermission = context.permissions.has(tool.permission);

  switch (tool.permission) {
    case 'safe':
      return {
        allowed: hasPermission,
        requiresConfirmation: false,
        reason: hasPermission ? 'Permiso automático concedido' : 'Sin permiso de ejecución',
      };

    case 'confirm':
      return {
        allowed: hasPermission,
        requiresConfirmation: !hasPermission,
        reason: hasPermission
          ? 'Usuario tiene permiso de confirmación'
          : 'Requiere confirmación del usuario',
        suggestedAction: 'Solicitar confirmación al usuario',
      };

    case 'restricted':
      return {
        allowed: hasPermission,
        requiresConfirmation: !hasPermission,
        reason: hasPermission ? 'Usuario tiene permiso restringido' : 'Requiere permisos elevados',
        suggestedAction: 'Solicitar permisos elevados a Sentinel',
      };

    case 'blocked':
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: 'Herramienta bloqueada por política de seguridad',
        suggestedAction: 'Contactar administrador del sistema',
      };

    default:
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: 'Nivel de permiso desconocido',
      };
  }
}

/**
 * Middleware de verificación de permisos para integración con Sentinel
 */
export async function validateAndExecute(
  tool: ToolDefinition,
  input: unknown,
  context: ToolContext
): Promise<unknown> {
  const permissionResult = checkPermission(tool, context);

  if (!permissionResult.allowed && !permissionResult.requiresConfirmation) {
    throw new Error(`Acceso denegado: ${permissionResult.reason}`);
  }

  // Aquí iría la integración con Sentinel para confirmaciones

  // Ejecutar la herramienta
  return tool.handler(input, context);
}
