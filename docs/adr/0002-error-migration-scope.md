# ADR-0002: Error migration scope (WP-B1)

## Status

`accepted`

## Context

Existen 74 `throw new Error(string)` en el proyecto. Migrarlos todos en un solo commit es
un blast radius innecesario y dificulta el review y rollback. Hay que priorizar los archivos
en el camino crítico del runtime: LLM, motor de orquestación, política de seguridad y registro.

## Decision

WP-B1 migra **exactamente estos 5 archivos** (≈23 throws):

| Archivo | Throws | Subclase |
|---------|--------|----------|
| `packages/integrations-llm/src/client.ts` | 3 | `LLMError` |
| `packages/sentinel/src/approval.ts` | 6 | `SentinelError` |
| `packages/kage-engine/src/intake.ts` | 3 | `EngineError` |
| `packages/kage-engine/src/coordinator.ts` | 3 | `EngineError` |
| `packages/roster/src/roster.ts` | 8 | `RosterError` |

Los **51 throws restantes** se migran cuando su WP correspondiente toque ese archivo.
Ejemplo: WP-B3 toca `executor.ts` → migra sus 4 throws entonces.

## Consequences

- PR de B1 tiene blast radius controlado (5 archivos de producción + sus tests).
- El catálogo de `ErrorCodes` puede crecer increméntalmente con cada WP.
- No hay inconsistencia: paquetes no migrados siguen usando `Error` nativo —
  el error handler global (WP-C1) captura ambos mediante `isNinjaError` para ramificar.

## Alternatives considered

- **Migrar todo en B1**: mayor cobertura inmediata, pero PR de ~500 líneas de diff con alto riesgo
  de introducir regresiones en paths no críticos.
- **Migrar solo contracts + 1 archivo**: demasiado conservador; el motor LLM es la falla más frecuente
  y debe ser el primer beneficiario.
