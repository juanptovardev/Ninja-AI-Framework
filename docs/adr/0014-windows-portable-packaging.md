# ADR-0014: Empaquetado Windows para distribución local-first (WP-F4)

## Status

`accepted` (2026-09-14, obrero T8.1; decisión ejecutada en `scripts/build-installer.mjs`)

## Context

Ninja AI Framework es un producto **comercial, privado, local-first para Windows**. Para
publicar v1.0.0 (F5.6) el producto debe poder instalarse en una máquina Windows y arrancar
el runtime (`kage-runtime`) que expone `/health` en `:3141`, sirviendo además la consola web
(`forge-console`) y el CLI (`dojo-cli`).

Restricciones del Plan Maestro / Directiva que acotan la decisión:

- **Sin Electron.** Las dependencias prohibidas incluyen el stack Electron; el empaquetado no
  puede introducirlo.
- **Build sin descargas pesadas.** El pipeline no debe bajar cientos de MB / GB de binarios
  (Android Studio-style). Criterio explícito del prompt T8.1.
- **Reutilizar el stack existente.** Node ≥22 <25, pnpm 9 workspaces, Turbo, Fastify. No añadir
  un bundler/empquetador ajeno sin justificación (§5.3 Directiva).
- **Gestión de `~/.ninja`.** Debe crearse en primera ejecución (runtime key + SQLite). Ya lo
  hace el propio runtime (`apps/kage-runtime/src/auth-key.ts` crea `~/.ninja/runtime.key` con
  `mkdirSync(recursive)`, y `@ninja/storage` inicializa `~/.ninja/engram.db`) → verificado en
  smoke. El instalador NO debe crearlo; es responsabilidad de la app en primer arranque.
- **Desinstalación limpia** y **`/health` responde tras instalar**.

Durante la investigación se descubrió una restricción técnica de fondo que invalida el
empaquetado "ingenuo" del `dist` de cada paquete:

> **Los mapas `exports` de los packages workspace están rotos para Node "pelado".** Al ejecutar
> `node dist/index.js` de `kage-runtime` construido por turbo, el bundler `tsup` deja los
> `@ninja/*` como *externals* y cada paquete se resuelve por su `package.json#exports`. Pero
> paquetes con `"type": "module"` (p. ej. `@ninja/contracts`) publican
> `exports.import → ./dist/index.mjs`, un fichero **stale** de 290 B que no exporta
> `ErrorCodes`, mientras que el ESM real que emite tsup es `./dist/index.js`. Resultado:
> `SyntaxError: The requested module '@ninja/contracts' does not provide an export named
> 'ErrorCodes'` al arrancar el despliegue. El repo **nunca** ejercita este camino porque dev y
> los tests corren bajo `tsx` (que resuelve por `src` vía los alias de `tsconfig.base.json`), y
> `pnpm build` solo transpila, nunca ejecuta el `dist`. T8.1 es la primera vez que se intenta
> correr el `dist` compilado con Node real, y destapa la grieta. Arreglar los `exports` de ~34
> packages está **fuera del alcance** de T8.1 (sería un rediseño de publicación, candidato a ADR
> propio en F5).

Opciones evaluadas para el empaquetado final:

1. **NSIS** (`electron-builder` standalone / `makensis` directo): genera un `.exe` con
   Add/Remove Programs y asistente. Requiere descargar los binarios NSIS + `winCodeSign`
   (decenas de MB) en build → viola "sin descargas pesadas"; además `electron-builder` arrastra
   la sombra del stack Electron, y sin firma de código Windows muestra SmartScreen agresivo.
2. **MSIX** (`msix-packaging` / `MakeAppx`): sandbox + tienda. Requiere Windows SDK y, para
   instalar fuera de tienda, un certificado de confianza que el usuario debe instalar →
   fricción alta, nada "mínimo viable" para un producto local-first privado.
3. **Portable ZIP + scripts** (extract → `start.bat` con Node): cero binarios descargados en
   build, 100 % reproducible offline. La "instalación" es extraer y ejecutar.

## Decision

Se adopta **Portable ZIP gestionado** como formato de distribución de `WP-F4` (ADR-0014),
construido por `scripts/build-installer.mjs` con esta receta, validada end-to-end en la rama:

1. **Build turbo** (`pnpm build`, 35/35) o validación de que ya está construido.
2. **Bundle autocontenido del runtime**: `tsup` con una config de empaquetado temporal
   (`noExternal: [/^@ninja\//]`, `external: ['better-sqlite3']`) que **inlinea todos los
   `@ninja/*`** en un único `runtime/server.bundle.cjs`. Esto esquiva por completo el mapa `exports` roto
   (no queda ningún `require("@ninja/...")` en el artefacto final), sin tocar los 34 packages.
   `better-sqlite3` se mantiene *external* (módulo nativo).
3. **`node_modules` de producción plano y offline**: `pnpm --filter @ninja/kage-runtime deploy
   --prod --node-linker=hoisted --ignore-scripts` produce un directorio con dependencias **reales
   y hoisted** (sin symlinks), resuelto desde el store local de pnpm → **sin red**. El layout
   `hoisted` es deliberado: el virtual store `.pnpm/` de pnpm deja *junctions* de directorios que
   forman ciclos mutuos entre paquetes, y `bsdtar` los recorre recursando al infinito (ZIP de
   gigas observado en desarrollo). Hoisted evita el ciclo. `--ignore-scripts` porque en pnpm 9 el
   deploy *hoisted* re-resuelve los rangos sin consultar el lockfile y `better-sqlite3` (única
   dep nativa) flotaría a una versión sin binding compilado en esta máquina (ni toolchain ni
   descargas permitidas): el pipeline alinea después el paquete con la versión EXACTA del
   lockfile ya compilada en el store `.pnpm` del repo y autochequea el binding con
   `require` + `SELECT 1` en memoria.
4. **Payload**: bundle del runtime (paso 2) sobre el `node_modules` del deploy (paso 3) +
   `apps/dojo-cli/dist` (CLI) + assets `content/` + `.env.example` + `start.bat` + una nota
   `forge-console/README.txt`. La consola **no** se empaqueta servible en el minimal (ver
   Consequences): requiere `output: 'standalone'` en `next.config.ts`, cambio de `forge-console`
   fuera del alcance que autoriza T8.1; el gate duro de aceptación es el runtime. Marcador para
   T8.2/F5.
5. **Node del sistema** en `start.bat` (`node runtime\server.bundle.cjs`), **no** `node.exe`
   embebido. El instalador **verifica** que hay Node compatible (≥22 <25) y, si falta, lo indica
   con el comando de instalación — ver Consequences por el trade-off.
6. **Artefacto**: `dist-installer/ninja-ai-framework-<version>-win-x64-portable.zip` generado con
   **`tar.exe` (bsdtar, nativo de Windows 10+)** — se eligió sobre `Compress-Archive` porque el
   cmdlet de PowerShell 5.1 revienta con `MAX_PATH` ante `node_modules` profundos. Antes de
   comprimir, un **guard** recorre el stage y aborta si sobrevive algún symlink/junction
   (barrera determinista contra el ciclo de recursión que infló el ZIP en desarrollo).

La aceptación realista (según ERRATA del orquestador) es **instalación local**: el script
`scripts/install-check.mjs` copia el stage a `%LOCALAPPDATA%\Programs\Ninja AI Framework`,
lanza `start.bat` y hace *polling* de `/health` hasta obtener `200`. No existe "máquina limpia"
en este entorno de CI/worktree; esa limitación queda documentada en el dossier.

## Consequences

**Ventajas**

- Build **100 % offline y determinista**: sin NSIS, sin MakeAppx, sin `node.exe` descargado, sin
  SDK de Windows. Solo `pnpm` + `tsup` + `tar.exe` (todos en el stack o en Windows).
- **Robusto frente a la grieta de `exports`**: al inlinear los workspace packages, el artefacto
  no depende de que los `package.json#exports` de los 34 paquetes sean correctos para Node.
- `~/.ninja` se crea solo en primer arranque (la app ya lo hace). El ZIP no toca el home en la
  extracción → **desinstalación = borrar la carpeta** (y opcionalmente `~/.ninja`).
- Portable = probado en worktree sin permisos de administrador ni firma.

**Limitaciones / trade-offs documentados (aceptados para el "minimal")**

- **Node requerido en la máquina** (≥22 <25). No se embebe `node.exe` porque eso exigiría
  descargar ~30 MB por plataforma en build (viola "sin descargas pesadas"). Contrapartida: el
  checker valida la versión y reporta con precisión. Embeber Node queda como mejora F5.x.
- **La consola (`forge-console`) NO viaja servible**: el ZIP minimal solo incluye
  `forge-console/README.txt` con la nota de arranque en dev (el `.next` del repo es un build de
  server —no standalone— y venía contaminado con ~195 MB de `.next/dev`). Servir la consola
  embebida requiere `output: 'standalone'` en `next.config.ts`, cambio del package
  `forge-console` **fuera del alcance** que el prompt autoriza (solo se permiten ajustes menores
  en `kage-runtime`). Se documenta como deuda para T8.2/F5. El gate durísimo de `/health` es el
  runtime y sí responde tras instalar.
- Sin asistente de instalación gráfico ni registro real en Add/Remove Programs (eso era NSIS);
  para un producto local-first privado y en esta fase, acceptable. Podría envolverse el ZIP en
  NSIS más adelante sin cambiar la receta de `stage`.
- El hecho de que `bootstrap()` **no propague `NINJA_RUNTIME_PORT`** al `listen` (el runtime
  arranca siempre en `:3141` por `DEFAULT_PORT`) es un hallazgo colateral registrado; el
  checker usa `:3141`. Corregir la propagación excede T8.1.

**Deuda destapada (para ADR propio en F5):** arreglar los `exports` de los packages
`"type": "module"` (apuntar a `index.js`/`index.cjs` reales, purgar `index.mjs` stale) para que
`node dist/...` funcione sin bundling. Mientras tanto, el bundling del instalador es la
barrera que lo oculta de forma segura.

## Alternatives considered

1. **NSIS vía electron-builder standalone** — descartado: descarga binarios NSIS + winCodeSign
   (decenas de MB) en build, contradice "sin descargas pesadas" y la sombra Electron; SmartScreen
   sin firma.
2. **MSIX (MakeAppx / msix-packaging)** — descartado: exige Windows SDK + certificado de
   confianza para instalar fuera de tienda; máxima fricción, mínima ventaja para local-first
   privado.
3. **Empaquetar el `dist` de turbo tal cual (`pnpm deploy` sin bundle)** — descartado por el
   hallazgo de la grieta `exports` (`ErrorCodes` no exportado bajo Node real). Solo funciona
   inliniendo los workspace deps (la decisión adoptada) o arreglando 34 `package.json` (fuera de
   alcance).
4. **Portable ZIP con `node.exe` embebido** — descartado *por ahora*: requiere descarga por
   plataforma en build; se pospone a F5.x. Se mitiga con verificación de Node + mensaje claro.
