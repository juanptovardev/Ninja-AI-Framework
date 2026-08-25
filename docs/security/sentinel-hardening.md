# Sentinel — Guía de Hardening

## 1. Visión General del Sistema

Sentinel es el sistema de seguridad, auditoría, aprobaciones y supervisión senior del Ninja AI Framework. Opera como un guardián entre los agentes y las acciones sensibles del sistema.

### Componentes

| Componente | Archivo | Rol |
|---|---|---|
| `PolicyEngine` | `policy.ts` | Motor de evaluación de políticas. Decide si una acción es `allow`, `block`, o `require-approval`. |
| `ApprovalManager` | `approval.ts` | Gestor de solicitudes de aprobación con doble confirmación. Timeout, cancelación, eventos. |
| `Guardian` | `guardian.ts` | Orquestador: evalúa acciones contra políticas, reacciona a eventos de salud del sistema. |
| `Auditor` | `auditor.ts` | Observador pasivo: registra eventos `sentinel.action.blocked` y `sentinel.approval.received` en un log en memoria. |

### Flujo de Evaluación

```
Agent → Guardian.evaluateAction()
           ↓
      PolicyEngine.evaluate(actionType, context)
           ↓
    ┌──────┼──────────┐
    │      │          │
   block  require    allow
    │     approval    │
    │      │          │
    ▼      ▼          ▼
  false   false      true
  (event  (no event  (action
   sentinel  emitted   permitted)
   .action   — caller
   .blocked)  must create
              ApprovalRequest)
```

## 2. Catálogo de Políticas por Defecto

| ID | actionType | action | priority | conditions | Riesgo Cubierto |
|---|---|---|---|---|---|
| `shell-execute-require-approval` | `shell.execute` | `require-approval` | 10 | — | Ejecución de comandos shell sin supervisión |
| `agent-spawn-allow-log` | `agent.spawn` | `allow` | 20 | — | Creación de agentes (permitido pero auditado) |
| `fs-write-outside-workspace-require-approval` | `fs.write` | `require-approval` | 15 | `{ requireApprovalOutsideWorkspace: true }` | Escritura fuera del workspace |
| `http-request-allow-audit` | `http.request` | `allow` | 30 | — | Peticiones HTTP (permitido pero auditado) |
| `git-push-main-block` | `git.push` | `block` | 5 | `{ branch: 'main' }` | Push a ramas principales bloqueado |

### Orden de Prioridad (menor = más importante)

1. `git-push-main-block` (priority 5)
2. `shell-execute-require-approval` (priority 10)
3. `fs-write-outside-workspace-require-approval` (priority 15)
4. `agent-spawn-allow-log` (priority 20)
5. `http-request-allow-audit` (priority 30)

## 3. Superficies de Riesgo Cubiertas

| Superficie | Mecanismo | Evento | Mitigación |
|---|---|---|---|
| Shell no autorizada | Policy require-approval → debe ser aprobada por ApprovalManager | `sentinel.approval.requested` | Doble confirmación humana |
| Filesystem outside workspace | Policy require-approval + condición | `sentinel.approval.requested` | Condición de workspace activada por caller |
| Push a main | Policy block | `sentinel.action.blocked` | Bloqueo automático sin posibilidad de bypass |
| Spawn de agentes | Policy allow + auditoría | `sentinel.action.blocked` (si otra policy bloquea) | Auditoría pasiva (Auditor escucha eventos) |
| HTTP requests | Policy allow + auditoría | — | Auditoría pasiva |
| Degradación de salud | Guardian escucha `health.degradation.detected` | `sentinel.intervention` | Intervención: `pause_affected_agents` |

## 4. Mecanismo de Doble Confirmación

El ApprovalManager implementa doble confirmación con dos campos de información:

### Parte 1: technicalDetails
- Resumen técnico estructurado (comando exacto, argumentos, rutas, etc.)
- Para revisión por el operador técnico

### Parte 2: actionSummary
- Resumen amigable/ejecutivo
- Para aprobación por el responsable del run

### Ciclo de Vida

```
createApprovalRequest()          approveRequest() / rejectRequest()
         │                               │
         ▼                               ▼
    ┌──────────┐  timeout (5min)   ┌──────────┐
    │ PENDING  │ ───────────────→  │ CANCELLED│
    │          │                  │ (timeout)│
    │          │  cancelRequest() │          │
    │          │ ───────────────→  └──────────┘
    └────┬─────┘
         │
         ├── approveRequest() → APPROVED  →  resolve(approved: true)
         │
         └── rejectRequest()  → REJECTED  →  resolve(approved: false)
```

### Eventos Emitidos

| Evento | Cuándo | Payload |
|---|---|---|
| `sentinel.approval.requested` | Al crear solicitud | `approvalId`, `runId`, `agentId`, `actionType`, `actionSummary`, `technicalDetails`, `policyId`, `requestedAt` |
| `sentinel.approval.received` | Al aprobar/rechazar | `approvalId`, `runId`, `approved`, `notes`, `respondedAt` |
| `sentinel.approval.cancelled` | Al cancelar (manual o timeout) | `approvalId`, `runId`, `cancelledAt`, `reason` |

## 5. Riesgos Residuales y Gaps Identificados

### 🔴 GAP-1: Guardian no delega al ApprovalManager en `require-approval`
**Severidad: Alta**
- `Guardian.evaluateAction()` retorna `false` cuando la política es `require-approval`, pero **no crea la solicitud de aprobación**.
- El `ApprovalManager` está inyectado en el constructor de Guardian pero no se usa en `evaluateAction`.
- **Impacto:** Quien invoca a Guardian debe recordar llamar manualmente a `ApprovalManager.createApprovalRequest()`. No hay un mecanismo automático que garantice que una acción `require-approval` realmente pase por aprobación.
- **Recomendación:** Guardian debería crear automáticamente la solicitud de aprobación y retornar el `ApprovalResult` en lugar de un booleano.

### 🔴 GAP-2: Sin autenticación del approver
**Severidad: Alta**
- `approveRequest()` y `rejectRequest()` no verifican la identidad de quien aprueba/rechaza.
- Cualquier componente que conozca el `approvalId` puede responder.
- **Impacto:** Un agente malicioso podría aprobar sus propias solicitudes si descubre el ID.
- **Recomendación:** Agregar un parámetro `approvedBy: ID` y un mecanismo de verificación (token, firma, o validación contra un identity provider).

### 🟡 GAP-3: `matchesConditions` usa comparación `!==` estricta
**Severidad: Media**
- La función `matchesConditions` itera sobre `policy.conditions` y compara cada valor con `actionDetails[key]` usando `!==`.
- No soporta: comparaciones parciales, regex, rangos numéricos, operadores lógicos.
- Si el tipo del valor en `actionDetails` difiere del tipo en `conditions` (ej. string vs number), la comparación falla silenciosamente.
- **Recomendación:** Implementar un evaluador de condiciones extensible con operadores (`eq`, `neq`, `gt`, `lt`, `regex`, `in`).

### 🟡 GAP-4: IDs duplicados en `registerPolicy`
**Severidad: Media**
- `registerPolicy` no verifica si ya existe una política con el mismo ID.
- Dos políticas con el mismo ID coexisten, causando comportamiento impredecible.
- **Recomendación:** Lanzar error si ya existe una política con el mismo ID, o sobrescribir la existente.

### 🟡 GAP-5: Sin rate limiting en solicitudes de aprobación
**Severidad: Media**
- Un agente malicioso puede hacer flooding de solicitudes de aprobación.
- ApprovalManager no tiene límite de solicitudes por agente, run o intervalo de tiempo.
- **Recomendación:** Implementar rate limiting configurable (max N approvals/min por agente/run).

### 🟢 GAP-6: `as any` en payloads de eventos
**Severidad: Baja**
- `guardian.ts` (líneas 23, 39) y `auditor.ts` (líneas 19, 34) castean `event.payload as any`.
- Se pierde la seguridad de tipos en tiempo de compilación.
- **Recomendación:** Definir interfaces de payload para `health.degradation.detected` y `health.context.inefficient`, o usar type guards.

### 🟢 GAP-7: Cleanup de approvals expiradas es manual
**Severidad: Baja**
- `cleanupExpiredApprovals()` debe ser llamado externamente; no hay timer automático.
- Si no se llama, approvals huérfanas se acumulan en memoria.
- **Recomendación:** Agregar un timer interno opcional en `ApprovalManager` o integrar con Pulse Center para cleanup periódico.

### 🟢 GAP-8: Doble reject silencioso en timeout + cancelRequest
**Severidad: Baja**
- `createApprovalRequest` configura `setTimeout` que hace `pending.reject(timeoutError)`.
- `handleTimeout` (llamado dentro del mismo timeout) llama a `cancelRequest`, que intenta hacer otro `reject`.
- El segundo reject no tiene efecto (la promesa ya está resuelta), pero indica un flujo confuso.
- **Recomendación:** Refactorizar: el timeout debería delegar a `handleTimeout` que llama `cancelRequest`, y `cancelRequest` es quien hace el reject. El `setTimeout` directo en `createApprovalRequest` con `reject` es redundante.

### 🟢 GAP-9: Auditoría solo en memoria
**Severidad: Baja**
- `Auditor.auditLog` es un array en memoria. Los registros se pierden al reiniciar el proceso.
- **Recomendación:** Persistir en Trace Ledger o base de datos externa.

### 🟢 GAP-10: Sin política de network egress
**Severidad: Baja**
- No hay una política que restrinja destinos HTTP (ej. bloquear IPs privadas, dominios no autorizados).
- `http.request` tiene política `allow` con auditoría, pero no hay control de destinos.
- **Recomendación:** Agregar políticas de egress con condiciones sobre URL/host.

### 🟢 GAP-11: `EvaluationContext.permissions` no utilizado
**Severidad: Baja**
- El campo `permissions: Set<string>` en `EvaluationContext` está definido en `schema.ts` pero nunca es evaluado por `PolicyEngine`.
- **Recomendación:** Implementar evaluación basada en permisos del agente como condición adicional.

## 6. Matriz de Eventos de Seguridad

| Evento | Source | Payload | Escuchado por |
|---|---|---|---|
| `sentinel.action.blocked` | Guardian | `SentinelBlockedPayload` | Auditor, logs |
| `sentinel.approval.requested` | ApprovalManager | `ApprovalRequestedPayload` | UI/CLI, notificaciones |
| `sentinel.approval.received` | ApprovalManager | `ApprovalReceivedPayload` | Auditor, caller |
| `sentinel.approval.cancelled` | ApprovalManager | `ApprovalCancelledPayload` | Caller, cleanup |
| `sentinel.intervention` | Guardian | `{ reason, action }` | Runtime, agent scheduler |
| `health.degradation.detected` | Pulse Center | `{ providerId, severity }` | Guardian (input) |
| `health.context.inefficient` | Pulse Center | `{ agentId, contextUtilization }` | Guardian (input, solo log) |

## 7. Configuración de Timeouts y Recomendaciones

| Parámetro | Default | Recomendado | Razón |
|---|---|---|---|
| `defaultTimeoutMs` | 300000 (5 min) | 300000 (5 min) | Tiempo razonable para revisión humana |
| `timeoutMs` por solicitud | — | 300000 (5 min) | Configurable por tipo de acción |
| Cleanup periódico | Manual | Cada 60s | Balance entre memoria y latency |

### Timeouts Recomendados por Tipo de Acción

| Tipo de Acción | Timeout Recomendado | Justificación |
|---|---|---|
| `shell.execute` | 5 min | Requiere revisión cuidadosa del comando |
| `fs.write` fuera de workspace | 2 min | Operación menos crítica |
| `git.push` (si se permite via policy custom) | 1 min | Operación rápida |

## 8. Recomendaciones de Hardening Prioritarias

### Prioridad Alta (implementar inmediatamente)

| # | Recomendación | Componente | Esfuerzo |
|---|---|---|---|
| R1 | Guardian debe crear ApprovalRequest automáticamente en `require-approval` | `Guardian.evaluateAction()` | 2h |
| R2 | Agregar `approvedBy` a `ApprovalResult` y verificar identidad | `ApprovalManager` | 4h |
| R3 | Validar unicidad de policy IDs en `registerPolicy` | `PolicyEngine.registerPolicy()` | 1h |
| R4 | Evaluador de condiciones extensible | `PolicyEngine.matchesConditions()` | 4h |

### Prioridad Media (siguiente iteración)

| # | Recomendación | Componente | Esfuerzo |
|---|---|---|---|
| R5 | Rate limiting en `createApprovalRequest` | `ApprovalManager` | 3h |
| R6 | Auto-cleanup timer para approvals expiradas | `ApprovalManager` | 2h |
| R7 | Type guards en Guardian y Auditor (eliminar `as any`) | `Guardian`, `Auditor` | 2h |

### Prioridad Baja (backlog técnico)

| # | Recomendación | Componente | Esfuerzo |
|---|---|---|---|
| R8 | Persistir auditoría en Trace Ledger | `Auditor` | 4h |
| R9 | Política de network egress | `PolicyEngine` + schema | 3h |
| R10 | Evaluación basada en `EvaluationContext.permissions` | `PolicyEngine` | 2h |
| R11 | Refactor timeout flow para eliminar doble reject | `ApprovalManager` | 1h |

## 9. Escenarios de Ataque y Mitigaciones

| Escenario | Vector | Mitigación Actual | Gap |
|---|---|---|---|
| Agente ejecuta `rm -rf /` via shell | `shell.execute` sin approval | Policy require-approval | GAP-1: Guardian no crea solicitud |
| Agente escribe malware fuera del workspace | `fs.write` sin condición de workspace | Policy require-approval con condición | GAP-1 |
| Push forzado a main con cambios maliciosos | `git.push` branch=main | Policy block automático | ✅ Cubierto |
| Flood de solicitudes de aprobación para DoS | Múltiples `createApprovalRequest` | Ninguna | GAP-5: Sin rate limiting |
| Aprobación fraudulenta de acción propia | `approveRequest()` con ID conocido | Ninguna | GAP-2: Sin autenticación |
| Degradación de proveedor LLM → agente falla | `health.degradation.detected` | Intervention event emitido | ✅ Cubierto |

## 10. Pruebas de Seguridad Aplicadas

| Archivo de Test | Casos | Cobertura |
|---|---|---|
| `policy.test.ts` | 23 | Default policies, block/allow/require-approval, wildcard, register/remove, condiciones, helpers |
| `approval.test.ts` | 24 | Ciclo de vida completo, timeout, cancelación, validación de estado, queries, cleanup, doble confirmación |
| `guardian.test.ts` | 13 | Block/allow/require, sin PolicyEngine, health degradation, degradación controlada |
| **Total** | **60** | Cobertura completa de componentes + edge cases |