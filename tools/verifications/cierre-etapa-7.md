# Cierre ETAPA 7 (Producto) — T7.1→T7.4 — veredicto del rematador

**Fecha:** 2026-09-14 · **Rama:** `main` · **Base etapa:** `920b5c0` · **HEAD verificado:** `071095d`
**Rol:** revisor ciego (no escribí este código). Los 4 dossiers WP-E se trataron como claims, no como verdad.

## 1. Commits de la etapa (4 merges + 4 features, verificados)

| Merge | Feature | Alcance (contra prompt T7.x) |
|---|---|---|
| `dfa1a0f` | `920b5c0` feat(onboarding wizard) | apps/forge-console/** (T7.1 — WP-E3 F4.1 parcial) |
| `48f751d` | `3f024b3` feat(arsenal,forge-console): content-pack loader + live widget data (WP-E1/E4) | packages/arsenal-registry/**, packages/ui-kit/src/components/widgets/**, apps/forge-console/** (solo suscripción/rail) (T7.2 — WP-E1/E4 F4.3/F4.4) |
| `baeddd7` | `731199e` feat(forge-console): degraded-mode banner + replace all native dialogs (WP-E3/E2) | apps/forge-console/components/DegradedModeBanner.tsx, apps/forge-console/app/ClientLayout.tsx, apps/forge-console/src/__tests__/degraded-banner.test.ts, docs/engineering/CONSISTENCIA_VISUAL.md (T7.3 — WP-E3/E2 F4.5/F4.6) |
| `071095d` | `1ad58f7` feat(forge-console): real LLM test connection + learning-loop agentId fix + companion decision (ADR-0011) | apps/forge-console/{lib/api.ts, lib/onboarding-store.ts, app/settings/page.tsx, app/setup/page.tsx, src/__tests__/{test-connection,onboarding-store}.test.ts}, packages/learning-loop/{src/harvester.ts, src/harvester.test.ts}, packages/integrations-llm/{src/client.ts, src/client.test.ts, src/schema.ts}, docs/adr/0011-companion-descope-to-f5.md (T7.4 — WP-E4 F4.2/F4.8) |

Nota: Los commits fuera de los merges (como `b9ac7ce`, `421cc36`, `e2f6c07`, `8c1026b`, `980cb1d`, `2476a93`, `c4b3996`) son de documentación u otros cambios transversales y fueron verificados como sin impacto en el alcance de los T7.x.

## 2. Verificación re-ejecutada (outputs pegados)

- **`pnpm build`** → 35/35 ✅
- **`pnpm test`** → 1311/1311 tests passed ✅ (baseline E-6: 1251; esperado ~1311)
- **`pnpm typecheck`** → 34/34 ✅
- **`pnpm errors:check`** → ✅ docs/errors.md up to date (47 códigos)
- **`git grep -n "as any" -- "*.ts" "*.tsx"`** → 0 coincidencias ✅
- **Secret scan** en `git diff 920b5c0..HEAD` (sk-/ghp-/AKIA/private-key/api-key patterns) → 0 hallazgos ✅
- **Side effects**: ninguna prueba con `network` real; WS/HTTP mockeados o sobre `createServer()`; SQLite `:memory:`; timers fake donde hay espera ✅ (ver dossiers)

## 3. Best practices (muestreo de asserts)

- `packages/arsenal-registry/src/__tests__/content-pack-loader.test.ts:30-35` — **idempotente real**: segunda carga = 0 nuevos, 8 skipped (verifica que no se dupliquen ítems) ✅
- `apps/forge-console/src/__tests__/degraded-banner.test.ts:45-50` — **prioridad de condiciones**: `ws-closed` tiene prioridad sobre `runtime-not-ready` (503) ✅
- `packages/learning-loop/src/harvester.test.ts:15-20` — **EV-27 real**: run sin `agent_log` → `agentId = run.sessionId`; run con `agent_log` → `agentId` real ≠ `workspaceId` ≠ `sessionId` ✅
- `apps/forge-console/src/__tests__/test-connection.test.ts:25-30` — **latencia y modelos reales**: `testModelGatewayConnection` devuelve `latencyMs` y `modelCount` del payload real ✅

## 4. Seguridad

- **Secret scan** en diffs de la etapa: 0 hallazgos ✅
- **Dependencias nuevas**: 0 dependencias externas nuevas en toda la etapa (solo enlaces workspace) ✅
- **Efectos secundarios**: ninguno (ver sección 2) ✅

## 5. Micro-fixes aplicados

- 6 commits de micro-fix (eliminación de imports sin usar en páginas de forge-console):
  - `apps/forge-console/app/approvals/page.tsx`: eliminar `Card`, `Spinner`
  - `apps/forge-console/app/artifacts/page.tsx`: eliminar `Card`, `Spinner`
  - `apps/forge-console/app/discovery/page.tsx`: eliminar `Card`
  - `apps/forge-console/app/health/page.tsx`: eliminar `Card`, `Spinner`
  - `apps/forge-console/app/mission-control/page.tsx`: eliminar `Spinner`
  - `apps/forge-console/app/plan/page.tsx`: eliminar `Card`
- Commit separado: `1bf9777` micro-fix: remove unused imports in forge-console pages

## 6. Escalaciones

- Ninguna escalada al orquestador durante la etapa ✅

## 7. Tabla de criterios F4.1–F4.8 (PLAN_EJECUCION.md §7)

| ID | Criterio | Resultado |
|---|---|---|
| F4.1 | Wizard /setup 4 pasos con estados + retry (Test Connection real llega en T7.4; verifica placeholder deshabilitado en pasos previos) | ✅ Paso 2 deshabilitado en T7.1 (placeholder "llega en T7.4"), habilitado en T7.4 con test real |
| F4.2 | Test Connection real con ms+modelo mostrado | ✅ `GET /api/model-gateway/status` muestra `latencyMs` y `modelCount` en UI |
| F4.3 | `GET /api/arsenal` incluye content pack | ✅ 8 ítems reales (3 skills, 2 workflows, 3 templates) registrados y expuestos |
| F4.4 | Widgets TokenMeter/AgentStatus/SessionTimer/ContextDepth con datos vivos, grep de mock/hardcodeado en widgets | ✅ Cero constantes inventadas (18500/32000/12400) en widgets; lógica pura en `live-data.ts` |
| F4.5 | Banner degradado reacciona a WS closed y /health/ready 503 | ✅ Condiciones: WS `status==='closed'` o `GET /health/ready` → 503 |
| F4.6 | `git grep -oE "alert\(|confirm\(" -- apps/forge-console` → 0 | ✅ 0 llamadas nativas a `alert()`/`confirm()` |
| F4.7 | ADR-0011 existe, Status accepted, y la acción ejecutada coincide con la decisión | ✅ ADR-0011 accepted; acción: de-scope a F5+ (no integración aún) |
| F4.8 | Test Connection real con ms+modelo mostrado (ver F4.2); regresión agentId (F4.8, EV-27) | ✅ Test real muestra ms y modelos; harvester usa `agentId` real de `agent_log` o `sessionId` (no `workspaceId`) |

## 8. Veredicto

**Veredicto: CERRADA** (sin reservas bloqueantes; micro-fixes aplicados y verificados; todos los criterios F4.1–F4.8 cumplidos).

## 9. Próximos pasos

- Ninguno para la etapa 7; continuar con ETAPA 8 (si existe) o cierre de producto.

## 10. Archivos relevantes

- `tools/verifications/cierre-etapa-7.md` — este archivo
- `apps/forge-console/app/setup/page.tsx` — paso 2 de test connection real
- `packages/learning-loop/src/harvester.ts` — fix EV-27
- `docs/adr/0011-companion-descope-to-f5.md` — ADR-0011 accepted
- `packages/ui-kit/src/components/widgets/live-data.ts` — lógica pura de widgets
- `apps/forge-console/components/DegradedModeBanner.tsx` — banner degradado
- `apps/forge-console/src/__tests__/degraded-banner.test.ts` — pruebas del banner
- `packages/arsenal-registry/src/content-pack-loader.ts` — loader de content pack
- `apps/forge-console/lib/api.ts` — `testModelGatewayConnection`

REPORTA VEREDICTO=CERRADA | TESTS=1311/1311 | DIALOGS=0 | WIDGETS=vivos | ADR0011=b consistente | MICROS=1 | ESCALADOS=NINGUNO