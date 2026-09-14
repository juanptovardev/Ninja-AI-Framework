#!/usr/bin/env node
/**
 * scripts/build-installer.mjs — Ninja AI Framework · T8.1 (WP-F4 minimal)
 *
 * Genera un instalador **portable ZIP** para Windows local-first según ADR-0014
 * (`docs/adr/0014-windows-portable-packaging.md`).
 *
 * Pipeline:
 *   1. Asegura el build turbo (`pnpm build`) o valida que `dist`/`.next` ya existen.
 *   2. Bundlea `kage-runtime` a un único CJS autocontenido con `tsup`
 *      (`noExternal: /^@ninja\//`), dejando `better-sqlite3` como único external nativo.
 *      Esto esquiva el mapa `exports` roto de los packages workspace (ver ADR-0014 Context).
 *   3. `pnpm --filter @ninja/kage-runtime deploy --prod` → node_modules plano offline.
 *   4. Ensambla el stage: bundle + node_modules + `.next` de forge-console + `dist` de
 *      dojo-cli + `content/` + `.env.example` + `start.bat`.
 *   5. `tar.exe` (bsdtar, nativo de Windows 10+) crea el `.zip` → `dist-installer/`.
 *
 * Cero dependencias externas: solo Node builtins + utilidades de Windows (tar/cmd). No baja binarios.
 * Uso:
 *   node scripts/build-installer.mjs            # pipeline completo
 *   node scripts/build-installer.mjs --skip-build   # asume turbo build ya hecho
 *   node scripts/build-installer.mjs --no-zip       # deja el stage sin comprimir (debug)
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STAGE_NAME = 'ninja-ai-framework';
const DIST_INSTALLER = path.join(ROOT, 'dist-installer');
const STAGE_DIR = path.join(DIST_INSTALLER, STAGE_NAME);
const BUNDLE_ENTRY = 'server.bundle.cjs';

// ──────────────────────────────────────────────────────────────────────────────
// Utilidades tipadas (sin `any`, sin throws crudos fuera del wrapper)
// ──────────────────────────────────────────────────────────────────────────────

class InstallerError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'InstallerError';
    if (cause !== undefined) this.cause = cause;
  }
}

/** JSON parse seguro: never leaks a raw SyntaxError. */
function readJson(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (cause) {
    throw new InstallerError(`No se pudo leer ${filePath}`, cause);
  }
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new InstallerError(`JSON inválido en ${filePath}`, cause);
  }
}

function log(msg) {
  console.log(`[installer] ${msg}`);
}

function step(n, msg) {
  console.log(`\n[installer] ── PASO ${n} · ${msg}`);
}

/**
 * Ejecuta un comando y lanza InstallerError si el exit code no es 0.
 *
 * En Windows muchas invocaciones son wrappers `.cmd`/`.ps1` (pnpm, tsup) que exigen
 * `shell: true`. Pasar args como ARRAY con `shell: true` dispara DEP0190 (los args no
 * se escapan, solo se concatenan). Para evitar el warning y la inyección, se compone
 * UNA cadena con cada argumento entrecomillado y se invoca el shell sin array de args.
 */
function run(cmd, args, opts = {}) {
  const label = `${cmd} ${args.join(' ')}`.trim();
  let result;
  if (process.platform === 'win32') {
    const quote = (s) => `"${String(s).replace(/"/g, '\\"')}"`;
    const commandLine = [cmd, ...args].map(quote).join(' ');
    result = spawnSync(commandLine, {
      cwd: opts.cwd ?? ROOT,
      stdio: 'inherit',
      shell: true,
      windowsHide: true,
      env: { ...process.env, ...opts.env },
    });
  } else {
    result = spawnSync(cmd, args, {
      cwd: opts.cwd ?? ROOT,
      stdio: 'inherit',
      env: { ...process.env, ...opts.env },
    });
  }
  if (result.error) {
    throw new InstallerError(`Fallo al lanzar "${label}": ${result.error.message}`, result.error);
  }
  if (result.status !== 0) {
    throw new InstallerError(`"${label}" terminó con exit code ${result.status}`);
  }
  return label;
}

function rmrf(target) {
  // Windows: fs.rmSync recursivo es lento sobre node_modules (miles de hardlinks del
  // store de pnpm). `rmdir /s /q` es mucho más rápido. Reintento con backoff corto
  // por handles transitorios (antivirus / hijos recién terminados).
  if (!fs.existsSync(target)) return;
  let lastErr;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      if (process.platform === 'win32') {
        const r = spawnSync('cmd.exe', ['/c', 'rmdir', '/s', '/q', target], {
          stdio: 'ignore',
          windowsHide: true,
        });
        if (r.status === 0 && !fs.existsSync(target)) return;
      }
      fs.rmSync(target, { recursive: true, force: true });
      if (!fs.existsSync(target)) return;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
    const until = Date.now() + attempt * 250;
    while (Date.now() < until) {
      /* spin corto sync: rmrf se usa en secuencia bloqueante */
    }
  }
  if (fs.existsSync(target)) {
    throw new InstallerError(
      `No se pudo eliminar ${target}${lastErr ? ` (${lastErr.message})` : ''}`
    );
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Copia recursiva. `dereference` convierte symlinks relativos del layout de pnpm
 * en ficheros reales: al mover el `node_modules` fuera del árbol `.pnpm`, los symlinks
 * relativos quedan colgando (tar/Expand no pueden stat). Con dereference el árbol es
 * autónomo.
 */
function copy(src, dest, opts = {}) {
  if (!fs.existsSync(src)) {
    throw new InstallerError(`Origen esperado no encontrado: ${src}`);
  }
  fs.cpSync(src, dest, {
    recursive: true,
    dereference: opts.dereference === true,
    force: true,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Pre-requirements
// ──────────────────────────────────────────────────────────────────────────────

function detectNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(major)) {
    throw new InstallerError('No se pudo parsear la versión de Node.');
  }
  if (major < 22 || major > 24) {
    throw new InstallerError(
      `Ninja requiere Node >=22 <25 (engines del root package.json). Detectado: ${process.versions.node}`
    );
  }
  return process.versions.node;
}

// ──────────────────────────────────────────────────────────────────────────────
// Pipeline steps
// ──────────────────────────────────────────────────────────────────────────────

function assertTurboBuilt() {
  const runtimeDist = path.join(ROOT, 'apps', 'kage-runtime', 'dist', 'index.js');
  const consoleBuild = path.join(ROOT, 'apps', 'forge-console', '.next');
  const dojoDist = path.join(ROOT, 'apps', 'dojo-cli', 'dist', 'index.js');
  for (const artifact of [runtimeDist, consoleBuild, dojoDist]) {
    if (!fs.existsSync(artifact)) {
      throw new InstallerError(
        `Falta el artefacto de build: ${artifact}. Ejecuta "pnpm build" o quita --skip-build.`
      );
    }
  }
  log('Artefactos de turbo build verificados (runtime dist, .next, dojo dist).');
}

function bundleRuntime() {
  step(3, 'Bundleando kage-runtime a un único CJS autocontenido (tsup)');
  const runtimePkg = path.join(ROOT, 'apps', 'kage-runtime');
  const outDir = path.join(STAGE_DIR, 'runtime');
  ensureDir(outDir);

  // tsup es devDependency de kage-runtime → su bin vive en su node_modules.
  const tsupBin = path.join(runtimePkg, 'node_modules', '.bin', 'tsup.CMD');
  if (!fs.existsSync(tsupBin)) {
    throw new InstallerError(`No se encontró tsup en ${tsupBin}. ¿Falta "pnpm install"?`);
  }

  // `noExternal` NO es flag CLI en tsup 8 (cac lo rechaza) → config transitoria.
  // La config vive solo durante el build y se borra al terminar: el repo queda intacto.
  const relOut = path.relative(runtimePkg, outDir).split(path.sep).join('/');
  const configPath = path.join(runtimePkg, 'tsup.packaging.config.mjs');
  const configSrc = [
    '// Generado por scripts/build-installer.mjs · ADR-0014. No commitear (transitorio).',
    "import { defineConfig } from 'tsup';",
    'export default defineConfig({',
    "  entry: ['src/index.ts'],",
    "  format: ['cjs'],",
    "  platform: 'node',",
    "  target: 'node22',",
    '  splitting: false,',
    "  outDir: '" + relOut + "',",
    "  external: ['better-sqlite3'],",
    '  noExternal: [/^@ninja\\//],',
    '});',
    '',
  ].join('\n');
  fs.writeFileSync(configPath, configSrc, 'utf8');

  try {
    run(tsupBin, ['--config', path.basename(configPath)], { cwd: runtimePkg });
  } finally {
    rmrf(configPath);
  }

  const bundled = path.join(outDir, 'index.js');
  const renamed = path.join(outDir, BUNDLE_ENTRY);
  if (!fs.existsSync(bundled)) {
    throw new InstallerError(`tsup no generó ${bundled}`);
  }
  fs.renameSync(bundled, renamed);

  // Autochequeo: el bundle NO debe requerir @ninja en runtime (todo inlineado).
  const code = fs.readFileSync(renamed, 'utf8');
  const ninjaRequires = (code.match(/require\(["']@ninja\//g) || []).length;
  if (ninjaRequires > 0) {
    throw new InstallerError(
      `El bundle aún resuelve ${ninjaRequires} require(s) de @ninja/* — ` +
        'el inline falló y el instalador arrastraría la grieta de exports.'
    );
  }
  log(`Bundle generado: ${path.relative(ROOT, renamed)} (${(code.length / 1024).toFixed(1)} KB, ` +
    '0 requires de @ninja/*).');
}

function deployNodeModules() {
  step(2, 'Desplegando node_modules de producción (pnpm deploy --prod, offline)');
  const runtimeDir = path.join(STAGE_DIR, 'runtime');
  // El deploy va DIRECTO al <stage>/runtime (pnpm exige target vacío; limpia runtime/).
  rmrf(runtimeDir);
  ensureDir(path.dirname(runtimeDir));

  // --node-linker=hoisted → node_modules PLANO con directorios reales, SIN los junctions
  // del virtual store `.pnpm` (que crean ciclos y hacen que tar/bsdtar recursara al
  // infinito → ZIP de gigas). hoisted es el layout correcto para un deploy portable.
  // --ignore-scripts → pnpm NO reintenta node-gyp en el deploy (sin toolchain en esta
  // máquina); el binding nativo de better-sqlite3 se inyecta abajo desde el store local.
  run('pnpm', [
    '--filter', '@ninja/kage-runtime',
    'deploy', runtimeDir,
    '--prod',
    '--node-linker=hoisted',
    '--ignore-scripts',
  ]);

  const deployedNm = path.join(runtimeDir, 'node_modules');
  if (!fs.existsSync(deployedNm)) {
    throw new InstallerError(`pnpm deploy no generó node_modules en ${deployedNm}`);
  }

  // El bundle inlinea todos los @ninja/* → podamos los @ninja residuales del deploy para
  // que el ZIP no arrastre el mapa `exports` roto ni código muerto (dead code se LISTA).
  const residualNinja = path.join(deployedNm, '@ninja');
  if (fs.existsSync(residualNinja)) {
    rmrf(residualNinja);
    log('Poda del @ninja/* residual del deploy (ya inlineado en el bundle).');
  }

  // El deploy copia también un `dist` roto (exports) que NO usamos: el runtime arranca
  // desde server.bundle.cjs. Lo eliminamos para no embarcarlo.
  const deployedDist = path.join(runtimeDir, 'dist');
  if (fs.existsSync(deployedDist)) {
    rmrf(deployedDist);
    log('Poda del dist del deploy (roto por exports; se usa server.bundle.cjs).');
  }

  // better-sqlite3 nativo: presente, con la versión del LOCKFILE y cargable.
  const bs3 = path.join(deployedNm, 'better-sqlite3');
  if (!fs.existsSync(bs3)) {
    throw new InstallerError(`Falta better-sqlite3 (nativo) en ${bs3}.`);
  }
  alignNativeBetterSqlite3(bs3);
  log('node_modules de producción desplegado en el stage (plano, sin junctions).');
}

/**
 * Alinea el better-sqlite3 del stage con la versión EXACTA del lockfile ya
 * compilada en el store `.pnpm` del repo (misma máquina → binario seguro, offline).
 *
 * Por qué hace falta: `pnpm deploy --node-linker=hoisted` en pnpm 9 re-resuelve
 * `^12.8.0` sin consultar el lockfile (flota a 12.11.1, que no tiene binding
 * compilada aquí). Con `--ignore-scripts` nadie intenta node-gyp (no hay
 * toolchain, y descargarla violaría ADR-0014). Es la ÚNICA dependencia nativa del
 * runtime; lo demás son JS puro cuyo float dentro del rango semver es inocuo.
 */
function alignNativeBetterSqlite3(bs3Dir) {
  const pnpmDir = path.join(ROOT, 'node_modules', '.pnpm');
  let storeEntries;
  try {
    storeEntries = fs
      .readdirSync(pnpmDir)
      .filter((d) => d.startsWith('better-sqlite3@'))
      .filter((d) => fs.existsSync(path.join(pnpmDir, d, 'node_modules', 'better-sqlite3', 'build')));
  } catch (cause) {
    throw new InstallerError('No se pudo leer node_modules/.pnpm (¿falta "pnpm install"?).', cause);
  }
  if (storeEntries.length === 0) {
    throw new InstallerError(
      'No hay ningún better-sqlite3 compilado (build/) en el store local del repo. ' +
        'Ejecuta "pnpm install" en el repo antes de empaquetar.'
    );
  }
  const storeEntry = storeEntries[0];
  const storeVer = storeEntry.slice('better-sqlite3@'.length);
  const storePkg = path.join(pnpmDir, storeEntry, 'node_modules', 'better-sqlite3');

  const deployedVer = String(readJson(path.join(bs3Dir, 'package.json')).version);
  if (deployedVer !== storeVer) {
    log(
      `El deploy hoisted trajo better-sqlite3@${deployedVer} (re-resolución sin lockfile); ` +
        `se alinea con la versión compilada del store/lockfile: @${storeVer}.`
    );
    rmrf(bs3Dir);
    copy(storePkg, bs3Dir);
  } else if (!fs.existsSync(path.join(bs3Dir, 'build'))) {
    copy(path.join(storePkg, 'build'), path.join(bs3Dir, 'build'));
    log(`build/ nativo de better-sqlite3@${storeVer} inyectado desde el store local.`);
  }

  // Autochequeo duro: el .node debe cargar en este mismo Node (mismo SO/arquitectura).
  const probe = spawnSync(
    process.execPath,
    [
      '-e',
      "const D=require('./node_modules/better-sqlite3');const db=new D(':memory:');if(db.prepare('select 1 as ok').get().ok!==1)process.exit(2);",
    ],
    { cwd: path.dirname(path.dirname(bs3Dir)), encoding: 'utf8', shell: false }
  );
  if (probe.error) {
    throw new InstallerError(`No se pudo lanzar el autochequeo de better-sqlite3: ${probe.error.message}`, probe.error);
  }
  if (probe.status !== 0) {
    throw new InstallerError(
      `El binding nativo de better-sqlite3 NO carga: ${(probe.stderr || '').trim().split('\n').slice(0, 3).join(' | ')}`
    );
  }
  log(`Autochequeo better-sqlite3@${storeVer} OK (require + SELECT 1 en memoria).`);
}

/**
 * Guard determinista: cualquier symlink/junction que sobreviva al stage reabre la
 * pathology de recursión de tar/bsdtar (ZIP de gigas) y enlaces colgantes tras la
 * extracción. El stage portable debe ser 100 % árbol real.
 */
function assertNoLinks(root) {
  const offenders = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (cause) {
      throw new InstallerError(`No se pudo enumerar ${dir}`, cause);
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isSymbolicLink()) {
        offenders.push(full);
      } else if (ent.isDirectory()) {
        stack.push(full);
      }
    }
  }
  if (offenders.length > 0) {
    const sample = offenders.slice(0, 5).join('\n  - ');
    throw new InstallerError(
      `El stage contiene ${offenders.length} symlink(s)/junction(s) (arboles de pnpm ` +
        `sin hoistear, ciclos de tar):\n  - ${sample}\n` +
        'El ZIP se hinchó así a gigas en el intento previo. Revisa el deploy (debe ser --node-linker=hoisted).'
    );
  }
}

function assembleStage(version) {
  step(4, 'Ensamblando el stage portable');
  // 4.1 forge-console — VER ADR-0014: servir la consola embebida exige `output:
  //     'standalone'` en next.config.ts, cambio de `forge-console` FUERA del alcance que
  //     autoriza T8.1 (solo se permiten ajustes menores en kage-runtime). El gate duro de
  //     aceptación es el runtime (`/health`). No embarcamos `.next` (es un build de server,
  //     no estático, y aquí además venía contaminado con ~195 MB de `.next/dev`): se deja
  //     una nota para T8.2/F5 donde se empaquetará standalone.
  const consoleDest = path.join(STAGE_DIR, 'forge-console');
  rmrf(consoleDest);
  ensureDir(consoleDest);
  fs.writeFileSync(
    path.join(consoleDest, 'README.txt'),
    [
      'Forge Console (dashboard web de Ninja AI Framework)',
      '',
      'En este instalador minimal (WP-F4 / T8.1) la consola NO se empaqueta servible:',
      'requiere configurar Next.js en modo "standalone" (output: "standalone" en',
      'next.config.ts), lo cual excede el alcance de T8.1 y se aborda en T8.2 / F5',
      '(ver docs/adr/0014-windows-portable-packaging.md).',
      '',
      'Para levantar la consola en desarrollo desde el repo:',
      '  pnpm install && pnpm --filter @ninja/forge-console dev   # http://localhost:3001',
      'El runtime empaquetado (start.bat) expone /health en http://127.0.0.1:3141.',
      '',
    ].join('\r\n'),
    'utf8'
  );
  log('forge-console: nota README.txt (standalone se empaqueta en T8.2/F5, ADR-0014).');

  // 4.2 dojo-cli dist
  const dojoDest = path.join(STAGE_DIR, 'dojo-cli');
  rmrf(dojoDest);
  ensureDir(dojoDest);
  copy(path.join(ROOT, 'apps', 'dojo-cli', 'dist'), path.join(dojoDest, 'dist'));
  copy(path.join(ROOT, 'apps', 'dojo-cli', 'package.json'), path.join(dojoDest, 'package.json'));
  log('dojo-cli/dist copiado.');

  // 4.3 content/ (arsenal: skills/workflows/templates)
  const contentSrc = path.join(ROOT, 'content');
  if (fs.existsSync(contentSrc)) {
    copy(contentSrc, path.join(STAGE_DIR, 'content'));
    log('content/ copiado.');
  } else {
    log('AVISO: no existe content/ en el repo — se omite (runtime lo tolera).');
  }

  // 4.4 .env.example (el runtime requiere LLM_* en arranque)
  const envExample = path.join(ROOT, '.env.example');
  if (fs.existsSync(envExample)) {
    copy(envExample, path.join(STAGE_DIR, '.env.example'));
    log('.env.example copiado.');
  }

  // 4.5 start.bat — lanzador con Node del sistema (trade-off ADR-0014)
  // buildStartBat() ya emite saltos CRLF; escribir como utf8 plano.
  const startBat = buildStartBat();
  fs.writeFileSync(path.join(STAGE_DIR, 'start.bat'), startBat, 'utf8');

  // 4.6 VERSION + manifest para el checker
  const manifest = {
    name: 'ninja-ai-framework',
    version,
    generatedAt: new Date().toISOString(),
    runtimeEntry: `runtime/${BUNDLE_ENTRY}`,
    healthUrl: 'http://127.0.0.1:3141/health',
    platform: 'win-x64',
  };
  fs.writeFileSync(path.join(STAGE_DIR, 'installer-manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(STAGE_DIR, 'VERSION'), version);
  log('start.bat, installer-manifest.json y VERSION escritos.');
}

function buildStartBat() {
  return [
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    'where node >nul 2>nul',
    'if errorlevel 1 (',
    '  echo [ninja] ERROR: Node.js no esta en el PATH.',
    '  echo [ninja] Instala Node >=22 y <25 desde https://nodejs.org y reintenta.',
    '  exit /b 1',
    ')',
    'if not exist ".env" (',
    '  echo [ninja] AVISO: no hay .env . Copia .env.example a .env y completa LLM_* antes de usar el producto.',
    '  echo [ninja] El runtime no arrancara sin LLM_BASE_URL, LLM_API_KEY y LLM_DEFAULT_MODEL.',
    ')',
    `echo [ninja] Iniciando Kage Runtime (http://127.0.0.1:3141/health) ...`,
    `node "runtime\\${BUNDLE_ENTRY}"`,
    'endlocal',
    '',
  ].join('\r\n');
}

function zipStage(version) {
  step(5, 'Comprimiendo el stage a ZIP portable (tar.exe / bsdtar, nativo de Windows 10+)');
  assertNoLinks(STAGE_DIR);
  log('Guard OK: stage sin symlinks/junctions (árbol 100% real).');
  const zipName = `${STAGE_NAME}-${version}-win-x64-portable.zip`;
  const zipPath = path.join(DIST_INSTALLER, zipName);
  rmrf(zipPath);
  // Compress-Archive de PS 5.1 revienta con MAX_PATH sobre node_modules profundos.
  // bsdtar (C:\Windows\System32\tar.exe) maneja rutas largas y crea .zip con -a.
  // Se empaquetan los CONTENIDOS del stage (cwd = stage) para que Extrae → sueltos.
  const result = spawnSync(
    'tar.exe',
    ['-a', '-c', '-f', zipPath, '.'],
    { cwd: STAGE_DIR, encoding: 'utf8', shell: false }
  );
  if (result.error) {
    throw new InstallerError(`Fallo al invocar tar.exe: ${result.error.message}`, result.error);
  }
  // bsdtar puede salir !=0 por symlinks puntuales irrelevantes (p. ej. un .d.ts de tipos
  // colgante del layout pnpm). Validamos el ZIP real, no el exit code crudo.
  if (!fs.existsSync(zipPath)) {
    const errTail = (result.stderr || '').split(/\r?\n/).slice(0, 6).join('\n');
    throw new InstallerError(`tar.exe no generó ${zipPath}\n${errTail}`);
  }
  const containsRuntime = spawnSync('tar.exe', ['-tf', zipPath, './runtime/server.bundle.cjs'], {
    encoding: 'utf8',
    shell: false,
  });
  if (containsRuntime.status !== 0 || !containsRuntime.stdout.includes('server.bundle.cjs')) {
    throw new InstallerError('El ZIP no contiene runtime/server.bundle.cjs — empaquetado incompleto.');
  }
  if (result.status !== 0) {
    log(`AVISO: tar.exe devolvió exit ${result.status} (entradas no críticas ignoradas); ZIP validado OK.`);
  }
  const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(2);
  log(`ZIP generado: dist-installer/${zipName} (${sizeMb} MB)`);
  return { zipName, zipPath, sizeMb };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2);
  const skipBuild = argv.includes('--skip-build');
  const noZip = argv.includes('--no-zip');

  const nodeVer = detectNode();
  log(`Node ${nodeVer} · plataforma ${process.platform} · ROOT=${ROOT}`);

  const rootPkg = readJson(path.join(ROOT, 'package.json'));
  const version = String(rootPkg.version ?? '0.0.0');
  log(`Versión del paquete raíz (solo lectura): ${version}`);

  ensureDir(DIST_INSTALLER);
  rmrf(STAGE_DIR);
  ensureDir(STAGE_DIR);

  if (skipBuild) {
    step(1, 'Usando turbo build existente (--skip-build)');
    assertTurboBuilt();
  } else {
    step(1, 'Compilando todos los paquetes (pnpm build / turbo)');
    run('pnpm', ['build']);
    assertTurboBuilt();
  }

  // Orden: deploy primero (pnpm deploy exige target vacío y limpia runtime/), luego el
  // bundle escribe server.bundle.cjs DENTRO de runtime/ sin borrar el node_modules.
  deployNodeModules();
  bundleRuntime();
  assembleStage(version);

  if (noZip) {
    log('Omitiendo ZIP (--no-zip). Stage listo en ' + path.relative(ROOT, STAGE_DIR));
  } else {
    const { zipName, sizeMb } = zipStage(version);
    console.log(`\n[installer] ✅ INSTALADOR LISTO → dist-installer/${zipName} (${sizeMb} MB)`);
  }
}

try {
  main();
} catch (err) {
  if (err instanceof InstallerError) {
    console.error(`\n[installer] ❌ FALLO: ${err.message}`);
    if (err.cause) console.error(`[installer]    causa: ${String(err.cause)}`);
  } else {
    console.error(`\n[installer] ❌ FALLO INESPERADO: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(1);
}
