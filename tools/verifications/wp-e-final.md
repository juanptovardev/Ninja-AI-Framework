# Dossier WP-E4 — T7.4: Test Connection real + agentId fix (EV-27) + ADR-0011 companion

**Rama:** `feat/wp-e-final` · **Fecha:** 2026-09-14 · **Obrero:** sesión 3ª retoma (partes 1-2 de
sesiones anteriores parcialmente vivas; esta sesión completó UI + ADR + dossier + commit).

## Parte 1 — Test Connection real (forge-console)

**Trampa conocida y decisión:** `LLMClient` de `@ninja/integrations-llm` **NO es browser-safe**
(grafo con `@ninja/logging`/`@ninja/events` y dependencias node). La UI NO lo importa. Se usó la
opción (b/c) del encargo: **endpoint existente del runtime vía `lib/api.ts`** con `fetch` nativo
(browser-safe) + `AbortController` timeout 5s, mostrando **ms + modelos** en el resultado.

- `apps/forge-console/lib/api.ts` — nuevo `testModelGatewayConnection(timeoutMs = 5000)`:
  `GET /api/model-gateway/status` (endpoint existente en
  `apps/kage-runtime/src/routes/model-gateway.routes.ts:25`), devuelve
  `ProviderTestResult { reachable, latencyMs, modelCount, error }`. Incluye `X-Ninja-Key`
  (`authHeaders()`, ADR-0008). Nunca lanza: los fallos viajan como valor.
- `apps/forge-console/app/settings/page.tsx` — `handleTestProvider` ya no es el fake
  (`setTimeout(1000)` + toast siempre-success): ahora ejecuta el test real y muestra
  `{provider}: connection OK — {ms}ms · {n} models in gateway catalog` o el error.
- `apps/forge-console/lib/onboarding-store.ts` — paso `test-connection` **habilitado**
  (`enabled: true`), nueva acción `runTestConnection` (loading→success/error) y estado persistente
  `connectionResult { latencyMs, modelCount }` en el store (limpiada por `reset`);
  `retryStep` despacha `test-connection`.
- `apps/forge-console/app/setup/page.tsx` — placeholder "Próximamente (T7.4)" del paso 2
  reemplazado por el mecanismo real apuntando **a lo mismo** (`runTestConnection`): auto-run al
  entrar en idle, skeleton en loading, `ErrorPanel` + retry en error, badges success con
  `{ms}ms · {n} modelos`.

**Limitación documentada (opición c del encargo):** el runtime no expone hoy un endpoint de ping
por-proveedor contra el LLM real (`/models` del proveedor). El endpoint más cercano existente es
`/api/model-gateway/status` (catálogo del gateway), que valida runtime + Model Gateway con
latencia real. Crear un endpoint nuevo en `kage-runtime` está **fuera de alcance** (no se tocó
`apps/kage-runtime`). En el lado servidor, la sesión anterior dejó `LLMClient.ping()`
(GET `{baseUrl}/models`, timeout `AbortSignal.timeout(5000)`, `LLMError` 504/502 retryable)
listo y testado — queda como el mecanismo al que podrá delegar un futuro endpoint
`POST /api/settings/providers/:id/test`.

**Evidencia live:** runtime arrancado (`pnpm ninja`, bootstrap ok en :3141);
`GET /api/model-gateway/status` sin key → **401 con `durationMs: 0.79`** en el log de acceso del
propio runtime — endpoint operativo y auth ADR-0008 enforzado (la UI añade la key).

**Dead code (LISTA, no borrada):** rama `!enabled` de `StepBadge` en `setup/page.tsx` (hoy todos
los pasos están habilitados; se conserva porque `WIZARD_STEPS.enabled` sigue siendo datos reales
del tipo `StepView`) y la variante de botón "Continuar (sin probar)" (ruta alcanzable solo si un
paso futuro se deshabilita).

## Parte 2 — EV-27: agentId real del candidato (learning-loop)

Parcial vivo de la sesión anterior, verificado y verde en esta:

- `packages/learning-loop/src/harvester.ts` — el candidato ya **no** usa
  `session?.workspaceId` como `agentId` (bug EV-27: un id de workspace disfrazado de agente).
  Nuevo dep inyectado `agentLogLookup?: (runId) => readonly Pick<AgentLogEntry,'agentId'>[]`
  (composición, sin acceso directo a DB desde el harvester): `agentId = agentLogLookup?.(run.id)?.[0]?.agentId ?? run.sessionId`.
- `packages/integrations-llm/src/client.ts` + `schema.ts` — `ping()` + tipo `LLMPingResult`
  (preparado para el futuro endpoint de test por-proveedor).

**Tests de regresión:** `harvester.test.ts` — (1) run sin `agent_log` → `agentId = run.sessionId`
≠ `ws-1`; (2) run con `agent_log` (`ninja-coder`) → `agentId` real ≠ `workspaceId` ≠ `sessionId`.

## Parte 3 — ADR-0011: companion extension (decisión: b · de-scope)

`docs/adr/0011-companion-descope-to-f5.md` — **Status: accepted**. Criterio del encargo (opción
menos riesgosa para cerrar v1.0): el scaffolding de `apps/companion-extension` **no es trivial de
aprovechar** — `extension.ts` es una simulación (WS a puerto duro 7780, output mock de tareas,
`err: any`, sin auth ADR-0008); el MVP (a) habría sido una reescritura total con superficie de
credenciales. Acción ejecutada: el README raíz **no contiene claims funcionales del companion**
(verificado: `Select-String README.md -Pattern "companion"` → 0 matches), no hay texto que
corregir; la decisión y el plan F5+ quedan en el ADR. El `pending WP-E4` de ADR-0008 se resuelve
en el sentido "no se integra aún".

## Evidencia re-ejecutable

```powershell
pnpm vitest run packages/learning-loop packages/integrations-llm apps/forge-console
# → Test Files 13 passed (13) · Tests 114 passed (114)   [2026-09-14]
pnpm build                       # → Tasks: 35 successful, 35 total
pnpm --filter @ninja/forge-console typecheck   # → 0 errores (tras pnpm build; TS2307 pre-build es el patrón conocido)
pnpm errors:check                # → ✅ docs/errors.md up to date (47 codes)
```

Test-connection cubierto con vitest en node (patrón del repo, sin jsdom): éxito con `catalogSize`
y latencia, payload sin catalogSize → 0, HTTP 500/503 → error, red caída → ECONNREFUSED,
timeout por AbortController (fake timers, `Timeout tras {ms}`), y `X-Ninja-Key` con
`NEXT_PUBLIC_RUNTIME_API_KEY`. Store: runTestConnection loading→success persiste
`connectionResult`, error → `connectionResult` null + mensaje, retryStep despacha, reset limpia.

**E2E mockeado:** no se añadió spec Playwright — `test:e2e` auto-levanta runtime sin
`NEXT_PUBLIC_RUNTIME_API_KEY` en browser env; la cubierta real queda en las 6 pruebas unitarias
con fetch stub + la verificación live del endpoint (401/0.79ms). Documentado aquí según
permiso del encargo ("E2E mockeado si fixtures lo permiten; si no, dossier lo documenta").

## Alcance tocado

`apps/forge-console/{lib/api.ts, lib/onboarding-store.ts, app/settings/page.tsx, app/setup/page.tsx, src/__tests__/{test-connection,onboarding-store}.test.ts}` ·
`packages/learning-loop/{src/harvester.ts, src/harvester.test.ts}` (parcial vivo) ·
`packages/integrations-llm/{src/client.ts, src/client.test.ts, src/schema.ts}` (parcial vivo) ·
`docs/adr/0011-companion-descope-to-f5.md` · este dossier. **Cero cambios en `apps/kage-runtime`.**

## Tests actualizados (no "arreglados")

`onboarding-store.test.ts` asaba el estado transitorio de T7.1 ("test-connection es el único
deshabilitado", retryStep no-op). T7.4 **cambia el comportamiento a propósito** (el paso se
habilita al existir el mecanismo): las aserciones se actualizaron al nuevo contrato (todos los
pasos enabled, `runTestConnection` despachado por retryStep). Ninguna prueba de código existente
de otra fecha fue modificada para pasar.
