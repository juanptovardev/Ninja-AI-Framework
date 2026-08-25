# WP-B5 · Verification Dossier — Guardian deny-by-default
**Branch**: `fix/epic-b-foundations`
**Date**: 2026-06-24

---

## Resumen

- `guardian.ts:54-57`: default sin PolicyEngine flipped de `allow` a `deny`
- `server.ts:~318`: `policyEngine` pasado al constructor de `Guardian`
- 18 tests de guardian verdes (incluyendo 4 nuevos de WP-B5)

---

## Antes / Después

### packages/sentinel/src/guardian.ts
```ts
// ANTES
if (!this.policyEngine) {
  this.logger.warn('Guardian has no PolicyEngine, allowing action by default');
  return true;
}

// DESPUÉS
if (!this.policyEngine) {
  this.logger.error(
    'Guardian sin PolicyEngine — deny-by-default (WP-B5)',
    { actionType: action.actionType }
  );
  return false;
}
```

### apps/kage-runtime/src/server.ts:~318
```ts
// ANTES
const guardian = new Guardian(eventBus, log, approvalManager);

// DESPUÉS
const guardian = new Guardian(eventBus, log, approvalManager, policyEngine);
```

---

## Conteos

| Métrica | Antes | Después |
|---|---|---|
| Guardian default sin engine | `allow` (bug) | **`deny`** ✅ |
| `policyEngine` wired en Guardian (server.ts) | No | **Sí** |
| Tests guardian | 14 | **18** (+4 WP-B5) |
| Políticas registradas en server.ts | 2 custom + 5 defaults | 2 custom + 5 defaults (cubren shell.execute, git.commit, git.push, fs.write, http.request, agent.spawn) |
| Typecheck @ninja/sentinel | ✅ | ✅ |
| Typecheck @ninja/kage-runtime | ✅ | ✅ |

---

## Gates verificados

| Check | Estado |
|---|---|
| Sin PolicyEngine → `false` | ✅ |
| Con PolicyEngine + `allow` policy → `true` | ✅ |
| Con PolicyEngine + `deny` policy → `false` | ✅ |
| Con PolicyEngine + `require-approval` → delega a ApprovalManager | ✅ |
| `server.ts` pasa policyEngine al Guardian | ✅ |
| ActionTypes usados en app cubiertos por políticas | ✅ |
| `pnpm --filter @ninja/sentinel typecheck` | ✅ |
| `pnpm --filter @ninja/kage-runtime typecheck` | ✅ |

---

## Impacto en seguridad

Antes de WP-B5, cualquier agente o herramienta podía ejecutar acciones sensibles si Guardian se construía sin PolicyEngine (e.g. en tests de integración, entornos nuevos). Ahora el default seguro es **denegar**, obligando a un wiring explícito de políticas.
