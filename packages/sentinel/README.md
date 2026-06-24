# @ninja/sentinel

Sistema de seguridad, auditoría, aprobaciones y supervisión senior para Ninja AI Framework.

## Uso Básico

### Guardian — Evaluar Acciones con Aprobación

```typescript
import { Guardian, PolicyEngine, ApprovalManager } from '@ninja/sentinel';
import { EventBus } from '@ninja/events';
import { createLogger } from '@ninja/logging';

const eventBus = new EventBus();
const logger = createLogger('my-app');
const policyEngine = new PolicyEngine(logger);
const approvalManager = new ApprovalManager(eventBus, logger, 300000); // 5 min timeout
const guardian = new Guardian(eventBus, logger, approvalManager, policyEngine);

// Evaluar una acción que requiere aprobación
try {
  const allowed = await guardian.evaluateAction(
    'shell.execute',
    'agent-1' as ID,
    'run-1' as ID,
    { cmd: 'ls', args: ['-la'] }
  );
  
  if (allowed) {
    // La acción fue aprobada (o no requería aprobación)
    console.log('Acción permitida');
  } else {
    // La acción fue rechazada o bloqueada
    console.log('Acción denegada');
  }
} catch (error) {
  if (error instanceof ApprovalPendingError) {
    // La acción quedó suspendida esperando aprobación
    console.log(`Aprobación pendiente: ${error.approvalId}`);
  } else {
    throw error;
  }
}
```

### PolicyEngine — Registrar Políticas Personalizadas

```typescript
import { PolicyEngine } from '@ninja/sentinel';

const policyEngine = new PolicyEngine(logger);

// Registrar política que requiere aprobación para fs.write fuera del workspace
policyEngine.registerPolicy({
  id: 'fs-write-require-approval' as ID,
  name: 'Filesystem Write Requires Approval',
  description: 'Escritura de archivos requiere aprobación',
  actionType: 'fs.write',
  action: 'require-approval',
  priority: 15,
  conditions: { requireApprovalOutsideWorkspace: true },
});

// Evaluar acción
const decision = policyEngine.evaluate('fs.write', {
  agentId: 'agent-1' as ID,
  runId: 'run-1' as ID,
  actionDetails: { path: '/tmp/test.txt' },
});

console.log(decision.action); // 'require-approval'
```

### ApprovalManager — Ciclo de Vida de Aprobaciones

```typescript
import { ApprovalManager } from '@ninja/sentinel';

const approvalManager = new ApprovalManager(eventBus, logger);

// Crear solicitud de aprobación
const approvalPromise = approvalManager.createApprovalRequest({
  runId: 'run-1' as ID,
  agentId: 'agent-1' as ID,
  actionType: 'shell.execute',
  actionSummary: 'Ejecutar comando: ls -la',
  technicalDetails: 'Command: ls -la\nCWD: /home\nUser: agent-1',
  policyId: 'shell-execute-require-approval' as ID,
  timeoutMs: 300000, // 5 minutos
});

// Escuchar eventos de aprobación
eventBus.on('sentinel.approval.requested', (event) => {
  console.log('Aprobación solicitada:', event.payload);
  // Mostrar UI de aprobación al usuario
});

eventBus.on('sentinel.approval.received', (event) => {
  console.log('Aprobación recibida:', event.payload);
});

// Resolver la aprobación (desde UI o CLI)
await approvalManager.approveRequest(approvalId, 'Looks good');
// o
await approvalManager.rejectRequest(approvalId, 'Not authorized');

// Esperar resultado
const result = await approvalPromise;
if (result.approved) {
  console.log('Aprobado:', result.notes);
} else {
  console.log('Rechazado:', result.notes);
}
```

## API Reference

### Guardian

#### `evaluateAction(actionType, agentId, runId, context?): Promise<boolean>`

Evalúa una acción contra las políticas de Sentinel.

- **`actionType`**: Tipo de acción (ej: `shell.execute`, `fs.write`)
- **`agentId`**: ID del agente que intenta la acción
- **`runId`**: ID de la ejecución actual
- **`context`**: Detalles adicionales de la acción

**Retorna:**
- `true`: La acción está permitida
- `false`: La acción fue bloqueada o rechazada

**Lanza:**
- `ApprovalPendingError`: Cuando se crea una solicitud de aprobación (opcional, para catching)

### PolicyEngine

#### `evaluate(actionType, context): PolicyDecision`

Evalúa una acción contra todas las políticas registradas.

#### `registerPolicy(policy): void`

Registra una nueva política en runtime.

### ApprovalManager

#### `createApprovalRequest(options): Promise<ApprovalResult>`

Crea una nueva solicitud de aprobación y suspende la ejecución hasta que el usuario responda.

#### `approveRequest(approvalId, notes?): Promise<void>`

Aprueba una solicitud pendiente.

#### `rejectRequest(approvalId, reason): Promise<void>`

Rechaza una solicitud pendiente.

#### `cancelRequest(approvalId, reason?): Promise<void>`

Cancela una solicitud pendiente.

## Eventos

El módulo emite los siguientes eventos vía EventBus:

- `sentinel.action.blocked`: Cuando una política bloquea una acción
- `sentinel.approval.requested`: Cuando se crea una solicitud de aprobación
- `sentinel.approval.received`: Cuando el usuario responde (aprueba/rechaza)
- `sentinel.approval.cancelled`: Cuando se cancela una solicitud
- `sentinel.intervention`: Cuando Guardian detecta degradación de salud

## Ejemplo Completo

```typescript
import { Guardian, PolicyEngine, ApprovalManager, ApprovalPendingError } from '@ninja/sentinel';
import { EventBus, createEvent } from '@ninja/events';
import { createLogger } from '@ninja/logging';

async function main() {
  const eventBus = new EventBus();
  const logger = createLogger('example');
  
  // Configurar Guardian
  const policyEngine = new PolicyEngine(logger);
  const approvalManager = new ApprovalManager(eventBus, logger);
  const guardian = new Guardian(eventBus, logger, approvalManager, policyEngine);
  
  // Escuchar eventos de aprobación
  eventBus.on('sentinel.approval.requested', async (event) => {
    const { approvalId, actionSummary } = event.payload;
    console.log(`Aprobación solicitada: ${actionSummary}`);
    
    // Simular respuesta del usuario
    const approved = await promptUser(`¿Aprobar: ${actionSummary}? (y/n)`);
    
    if (approved) {
      await approvalManager.approveRequest(approvalId, 'User approved via CLI');
    } else {
      await approvalManager.rejectRequest(approvalId, 'User rejected');
    }
  });
  
  // Intentar acción que requiere aprobación
  try {
    const allowed = await guardian.evaluateAction(
      'shell.execute',
      'agent-1' as ID,
      'run-1' as ID,
      { cmd: 'ls', args: ['-la'] }
    );
    
    if (allowed) {
      console.log('✅ Acción ejecutada');
    } else {
      console.log('❌ Acción denegada');
    }
  } catch (error) {
    if (error instanceof ApprovalPendingError) {
      console.log(`⏳ Esperando aprobación: ${error.approvalId}`);
    } else {
      throw error;
    }
  }
}
```

## Migración v1 → v2 (Breaking Changes)

### `evaluateAction()` ahora es `async`

**Antes (v1):**
```typescript
const allowed = guardian.evaluateAction('shell.execute', agentId, runId);
if (allowed) { /* ... */ }
```

**Después (v2):**
```typescript
const allowed = await guardian.evaluateAction('shell.execute', agentId, runId);
if (allowed) { /* ... */ }
```

**Motivo:** Soporte nativo para suspensión asíncrona cuando se requiere aprobación.

## Licencia

MIT © Ninja AI Framework
