# ADR-0011: Companion extension — de-scope a F5+ para cerrar v1.0

## Status

`accepted`

## Context

WP-E4 (T7.4) incluía la decisión F4.7 sobre `apps/companion-extension`: puente VS
Code/Cursor/Codex con el runtime. Las opciones eran (a) MVP mínimo viable (leer
`~/.ninja/runtime.key`, status bar de conexión a :3141, notificación de approvals
pendientes vía polling `/api/approvals`) o (b) de-scope explícito hasta F5+.

El estado real del scaffolding empujó la balanza: `src/extension.ts` es una
**simulación**, no una base reutilizable —

- se conecta por WebSocket a un puerto duro **7780** (client-adapters), no al runtime :3141;
- `execute_task` responde con **output mock** ("[Ninja VSIX Simulation] …completed
  successfully") en lugar de delegar al IDE;
- usa `err: any` (prohibido por las convenciones no negociables del repo) y `console.log`
  directo en vez de `@ninja/logging`;
- no lee `runtime.key` ni se autentica (ADR-0008 exige `X-Ninja-Key` en todo cliente), y
  el command registrado (`ninja.loadProfile`) apunta a un endpoint de vault que no forma
  parte de un flujo de approvals.

Convertirlo en el MVP (a) habría significado reescribir el 100 % de su lógica, añadir
lectura de credenciales del filesystem del usuario y un ciclo de polling — trabajo de
producto real con superficie de seguridad (API key en memoria del IDE), no un remate de
scaffolding. El criterio de decisión de la orden (OPCIÓN MENOS RIESGOSA PARA CERRAR v1.0)
apunta a (b).

## Decision

**De-scope del companion extension a F5+** para el corte v1.0:

1. La decisión queda documentada aquí; `apps/companion-extension` no recibe features en
   ETAPA 7. El package sigue existiendo como placeholder de arquitectura (nivel L4 del
   Quality Manual §capa) con su descripción de `package.json` sin reclamos de features
   concretas, y el README raíz no contiene claims funcionales del companion — no hay
   texto que corregir (verificado por grep: cero menciones en `README.md`).
2. El `pending WP-E4` que ADR-0008 asignaba al companion (misma clave/auth que CLI y
   Console) se resuelve en el sentido contrario: **no se le integra aún**; cuando se
   implemente en F5+, deberá aplicar el patrón `127.0.0.1:3141` + `X-Ninja-Key` de ADR-0008
   sin excepciones.
3. La integración real con IDEs queda cubierta por la vía ya operativa: `client-adapters`
   + `roster` + `delegation-router` (puentes a agentes externos) y el companion-extension
   se retoma como feature de producto con su propio WP en F5+.

## Consequences

- **Positivo:** v1.0 cierra sin código de vitrina simulando capacidades de IDE; se evita
  shippear un VSIX que responde `success` a tareas que nunca ejecuta (riesgo operativo
  directo si un usuario confiara en él).
- **Negativo / deuda:** el nombre "Companion" sigue apareciendo en el layout de paquetes
  (L4) como scaffolding inerte; el registro de deuda debe llevarlo a F5+ con alcance
  explícito: auth ADR-0008, estado real en status bar, approvals vía `/api/approvals`,
  cero `any`, logging nativo y tests del ciclo activate/deactivate.
- **Neutro:** la decisión es reversible — el scaffolding no se borra; solo se le niega
  el estatus de feature hasta F5+.

## Alternatives considered

- **(a) MVP mínimo (status bar + key + polling approvals):** descartado por la sección
  Context: el código existente no es scaffolding reutilizable sino una simulación con
  puerto y contratos distintos; construirlo "de verdad" excede el presupuesto de un cierre
  de etapa y añade superficie de manejo de credenciales sin auditar.
- **(c) Borrar el package:** descartado — `PLAN_EJECUCION.md` y el Quality Manual lo
  listan como parte del layout L4; borrarlo sería scope creep destructivo y perdería el
  punto de anclaje para F5+.
