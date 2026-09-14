# WP-F4 (T8.1) — Windows installer pipeline minimal (Portable ZIP, ADR-0014)

**Estado:** ✅ implementado y verificado (rama `feat/wp-f4-packaging`, retomada por segundo obrero tras sesión interrumpida)
**Refs:** PLAN_EJECUCION.md F4/T8.1 · ADR-0014 (`docs/adr/0014-windows-portable-packaging.md`) · Quality Manual §11 (evidence re-ejecutable)

## Scope (archivos tocados)

- `docs/adr/0014-windows-portable-packaging.md` — **nuevo**: decisión Portable ZIP gestionado; opciones NSIS/MSIX descartadas (descargas pesadas / SDK+certificado); grieta `exports` de Node "pelado" documentada como hallazgo raíz.
- `scripts/build-installer.mjs` — **nuevo**: pipeline de 5 pasos (build → deploy hoisted `--prod --ignore-scripts` + alineación nativa → bundle tsup autocontenido → ensamble stage → ZIP `tar.exe`), con guard anti-junctions y autochequeo `require` de `better-sqlite3`.
- `scripts/install-check.mjs` — **nuevo**: verificación post-instalación local: extrae el ZIP a `%LOCALAPPDATA%\Programs\Ninja AI Framework`, materializa `.env` de stubs (sin credenciales), lanza `start.bat`, hace *polling* `/health` hasta 200, mata el árbol y **desinstala** (borra la carpeta) salvo `--keep`.
- `docs/adr/README.md` — índice ADR-0014 (nota: 0005–0013 siguen sin indexar — laguna preexistente registrada, fuera de alcance).
- `.gitignore` — `dist-installer/` (artefacto regenerable).

## Qué necesita arrancar el runtime empaquetado (documentado en el pipeline)

1. **Node del sistema ≥22 <25** en `PATH` (trade-off ADR-0014: no se embebe `node.exe`; `start.bat` valida y reporta con instrucción clara).
2. **`.env`** (o variables) con `LLM_BASE_URL`, `LLM_DEFAULT_MODEL`, `LLM_API_KEY` — fail-fast ADR-0004. `/health` es liveness: no llama al LLM, así que los stubs de validación de forma bastan para el gate.
3. Puerto `:3141` libre (el bundled runtime ignora `NINJA_RUNTIME_PORT` en `listen` — hallazgo colateral registrado en ADR; excede T8.1).
4. `~/.ninja/` se crea solo en primer arranque (`runtime.key` + `engram.db`/`ninja.db`) → verificado en la instalación de prueba.

## Pipeline (receta final ejecutada)

```
node scripts/build-installer.mjs
 PASO 1  pnpm build            → Tasks: 35 successful, 35 total (FULL TURBO)
 PASO 2  pnpm --filter @ninja/kage-runtime deploy runtime/ --prod
         --node-linker=hoisted --ignore-scripts   (offline: "reused 131, downloaded 0")
         + poda @ninja/* residual + poda dist/ roto del deploy
         + alineación better-sqlite3 → ver debajo
 PASO 3  tsup config transitoria (noExternal /^@ninja\//, external better-sqlite3)
         → runtime/server.bundle.cjs 769.6 KB, 0 requires de @ninja/*
 PASO 4  stage: runtime/ + dojo-cli/ + content/ + .env.example + start.bat
         + installer-manifest.json + VERSION + forge-console/README.txt (nota T8.2)
 PASO 5  guard anti-junctions OK → tar.exe -a -cf → ZIP 8.55 MB
```

### Incidentes resueltos durante el ensamblaje (todos con fix determinista en el pipeline)

1. **Recursión de junctions de pnpm → GB de bloat.** Dos materializaciones observadas: `fs.cpSync` sigue los junctions del virtual store `.pnpm` y duplica el árbol (stage de 11.8 GB con 269 854 archivos), y `bsdtar` recorre los ciclos de junctions al comprimir (ZIP de 1.9 GB y creciendo). Fix: deploy `--node-linker=hoisted` (árbol 100 % real) + `rename` O(1) en lugar de copiar el store + **guard** que aborta si sobrevive algún symlink/junction en el stage.
2. **`pnpm deploy --node-linker=hoisted` en pnpm 9 re-resuelve sin lockfile**: `better-sqlite3 ^12.8.0` flotó a 12.11.1, versión sin binding compilado en esta máquina, y el script de install (`node-gyp`) fallaba por falta de toolchain (descargarla violaría "sin descargas pesadas" del propio prompt). Fix: `--ignore-scripts` + alineación deliberada del paquete con la versión EXACTA del lockfile ya compilada en el store `.pnpm` del repo (misma máquina, offline), autochequeada con `require` + `SELECT 1` en memoria.
3. **Sesión obrera anterior no estaba muerta**: un `node scripts/build-installer.mjs --skip-build` desatendido seguía ejecutándose y re-escribiendo scripts/stage en paralelo (ZIP truncado a 0 B, ficheros con mtime > esta sesión). Se dejó terminar/matar su árbol, se purgó `dist-installer/` y el stage corrupto, y se re-ejecutó limpio. Restos experimentales de esa sesión (`iso-flat/`, `iso-test/`, `installer-run.log` en raíz) borrados antes del commit.

## Evidence (comandos + output real — 2026-09-14)

```
node scripts/build-installer.mjs
  [installer] Autochequeo better-sqlite3@12.8.0 OK (require + SELECT 1 en memoria).
  [installer] Bundle generado: ...\runtime\server.bundle.cjs (769.6 KB, 0 requires de @ninja/*).
  [installer] Guard OK: stage sin symlinks/junctions (árbol 100% real).
  [installer] ZIP generado: dist-installer/ninja-ai-framework-1.0.0-win-x64-portable.zip (8.55 MB)
  [installer] ✅ INSTALADOR LISTO → dist-installer/ninja-ai-framework-1.0.0-win-x64-portable.zip (8.55 MB)
  exit 0

tar -tf <zip> | wc -l = 4126 entradas; contiene ./runtime/server.bundle.cjs,
./runtime/node_modules/better-sqlite3/build/Release/better_sqlite3.node,
fastify/pino/zod/dotenv, content/, forge-console/README.txt, start.bat.

node scripts/install-check.mjs
  [install-check] Objetivo de instalación: C:\Users\...\AppData\Local\Programs\Ninja AI Framework
  [install-check] ZIP del instalador: ninja-ai-framework-1.0.0-win-x64-portable.zip
  → runtime empaquetado arranca con .env de stubs:
    storage "Database initialized successfully" · EngramClient ~/.ninja/engram.db ·
    ContentPackLoader "8 registrados" · ArsenalRegistry "6 herramientas, 3 skills" ·
    roster detecta 10 clientes · Sentinel (5 políticas, ApprovalManager, Auditor, Guardian) ·
    "Kage Runtime listening → http://127.0.0.1:3141" · "Bootstrap completado exitosamente."
  [install-check] ✅ /health respondió 200 al intento 12:
    {"status":"ok","timestamp":"2026-09-14T21:21:15.843Z","uptime":16.384848}
  [install-check] RESULTADO: ACEPTACIÓN OK — el instalador local arranca y /health da 200.
  exit 0 (desinstala la carpeta al terminar)

pnpm build        → Tasks: 35 successful, 35 total        (PASO 1 del pipeline)
pnpm typecheck    → Tasks: 34 successful, 34 total, exit 0
pnpm test         → Test Files 110 passed (110), Tests 1311 passed (1311), exit 0
pnpm errors:check → ✅ docs/errors.md is up to date (47 error codes)
pnpm lint         → 0 errors, 50 warnings (baseline preexistente) — este WP no toca fuentes TS
```

## Limitaciones (aceptadas para el "minimal", documentadas en ADR-0014)

- **Instalación local, no máquina limpia** (ERRATA del orquestador): no existe VM limpia en este entorno; el gate real es extraer→`start.bat`→`/health` 200. La extracción se prueba con el mismo `tar.exe` nativo que usará el usuario final.
- **Node del sistema requerido** (≥22 <25); embeber `node.exe` queda para F5.x (violaría "sin descargas pesadas" ahora).
- **Consola no servible en el ZIP** (solo nota `README.txt`): requiere `output: 'standalone'` en `forge-console` — fuera del alcance que autoriza T8.1 → marcador T8.2/F5.
- **Alineación `better-sqlite3`** depende de que el store `.pnpm` del repo tenga el binding compilado (lo tiene: los 1311 tests lo usan). En un builder limpio sin `pnpm install` previo, el pipeline falla con mensaje explícito (no silencioso).
- `NINJA_RUNTIME_PORT` no propagado al `listen` (arranca siempre en `:3141`) — hallazgo registrado, corregir excede T8.1.
- Deuda mayor documentada: `exports` rotos de packages `"type": "module"` bajo Node real (candidato ADR propio en F5); el bundling del instalador es la barrera segura mientras tanto.

## Riesgos / Notas

- El stage se ensambla con artefactos de `pnpm build`; si el árbol de trabajo está rojo, el PASO 1 aborta antes de tocar `dist-installer/` — el pipeline nunca empaqueta build huérfano.
- `install-check` usa stubs de LLM que apuntan a `127.0.0.1:9` (descartado): `/health` nunca alcanza el LLM; cualquier llamada real fallaría con error claro, no con cuelgue.
- Re-ejecución: ambos scripts son idempotentes (limpian stage/destino propio; `rmrf` usa `rmdir /s /q` nativo tras la lección del borrado lento).
