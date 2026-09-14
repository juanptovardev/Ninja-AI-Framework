#!/usr/bin/env node
/**
 * scripts/install-check.mjs — Ninja AI Framework · T8.1 (WP-F4 minimal)
 *
 * Verificación post-instalación según ADR-0014. Como no existe "máquina limpia" en este
 * entorno (ERRATA del orquestador), la aceptación realista es **instalación local**:
 *
 *   1. Localiza el ZIP del instalador (o el stage si viene con --from-stage).
 *   2. "Instala": extrae el ZIP a %LOCALAPPDATA%\Programs\Ninja AI Framework
 *      (borrando una instalación previa si la hay).
 *   3. Materializa un `.env` mínimo de verificación (con stubs, porque el runtime hace
 *      fail-fast si faltan LLM_* → ADR-0004). No toca claves reales.
 *   4. Lanza `start.bat` (Node del sistema) como proceso hijo.
 *   5. Hace *polling* de `GET /health` hasta 200 o timeout.
 *   6. Informa y **desinstala** (borra la carpeta) salvo `--keep`.
 *
 * Exit 0 → `/health` respondió 200 tras instalar. Exit 1 → fallo de aceptación.
 * Uso:
 *   node scripts/install-check.mjs
 *   node scripts/install-check.mjs --from-stage     # sin ZIP, instala el stage directo
 *   node scripts/install-check.mjs --keep           # no borrar tras la prueba
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST_INSTALLER = path.join(ROOT, 'dist-installer');
const STAGE_NAME = 'ninja-ai-framework';
const STAGE_DIR = path.join(DIST_INSTALLER, STAGE_NAME);
const HEALTH_URL = 'http://127.0.0.1:3141/health';
const HEALTH_TIMEOUT_MS = 45_000;
const HEALTH_INTERVAL_MS = 1_500;

class CheckError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'CheckError';
    if (cause !== undefined) this.cause = cause;
  }
}

function log(msg) {
  console.log(`[install-check] ${msg}`);
}

function findLatestZip() {
  if (!fs.existsSync(DIST_INSTALLER)) {
    throw new CheckError(`No existe dist-installer/. Ejecuta antes "node scripts/build-installer.mjs".`);
  }
  const zips = fs
    .readdirSync(DIST_INSTALLER)
    .filter((f) => f.endsWith('-portable.zip'))
    .map((f) => ({ f, mtime: fs.statSync(path.join(DIST_INSTALLER, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (zips.length === 0) {
    throw new CheckError('No hay ningún instalador *.zip en dist-installer/.');
  }
  return path.join(DIST_INSTALLER, zips[0].f);
}

function installTargetDir() {
  const base =
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'Programs', 'Ninja AI Framework');
}

function extractTo(zipPath, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  // Expand-Archive de PS 5.1 revienta con MAX_PATH (los node_modules del stage son
  // profundos). tar.exe (bsdtar) soporta rutas largas y es nativo de Windows 10+.
  const t = spawnSync('tar.exe', ['-xf', zipPath, '-C', dest], { stdio: 'inherit', shell: false });
  if (t.error) throw new CheckError(`Fallo al invocar tar.exe: ${t.error.message}`, t.error);
  if (t.status !== 0) throw new CheckError(`tar.exe -xf terminó con exit ${t.status}`);
}

function writeStubEnv(dest) {
  // El runtime exige LLM_* (ADR-0004 fail-fast). Usamos stubs que pasen la validación
  // de forma (url + ≥8 chars). /health es liveness: no hace llamadas al LLM.
  const envPath = path.join(dest, '.env');
  if (fs.existsSync(envPath)) {
    log('.env ya presente en la instalación → se conserva.');
    return;
  }
  const stub = [
    '# Generado por install-check.mjs SOLO para la prueba de aceptación /health.',
    '# No contiene credenciales reales.',
    'LLM_BASE_URL=http://127.0.0.1:9/v1',
    'LLM_API_KEY=install-check-stub-key',
    'LLM_DEFAULT_MODEL=install-check-stub-model',
    'NODE_ENV=production',
    '',
  ].join('\r\n');
  fs.writeFileSync(envPath, stub, 'utf8');
  log('.env de verificación (stubs) escrito.');
}

function locateStartBat(root) {
  const direct = path.join(root, 'start.bat');
  if (fs.existsSync(direct)) return direct;
  // El ZIP puede envolver todo dentro de la carpeta del stage.
  const nested = path.join(root, STAGE_NAME, 'start.bat');
  if (fs.existsSync(nested)) return nested;
  throw new CheckError(`No se encontró start.bat en ${root}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollHealth(child) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new CheckError(`El proceso del runtime terminó antes de responder (exit ${child.exitCode}).`);
    }
    attempt++;
    try {
      const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(4000) });
      const body = await res.text();
      if (res.status === 200) {
        return { status: res.status, body, attempt };
      }
      log(`  · intento ${attempt}: status ${res.status} (esperando...)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`  · intento ${attempt}: aún sin respuesta (${msg})`);
    }
    await sleep(HEALTH_INTERVAL_MS);
  }
  throw new CheckError(`Timeout: /health no respondió 200 en ${HEALTH_TIMEOUT_MS / 1000}s.`);
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    /* best-effort */
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const fromStage = argv.includes('--from-stage');
  const keep = argv.includes('--keep');

  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(major) || major < 22 || major > 24) {
    throw new CheckError(`Node >=22 <25 requerido para lanzar el runtime. Detectado ${process.versions.node}.`);
  }

  const dest = installTargetDir();
  log(`Objetivo de instalación: ${dest}`);

  if (fromStage) {
    if (!fs.existsSync(STAGE_DIR)) throw new CheckError(`No existe el stage ${STAGE_DIR}.`);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(STAGE_DIR, dest, { recursive: true });
    log('Instalado desde el stage (sin ZIP).');
  } else {
    const zipPath = findLatestZip();
    log(`ZIP del instalador: ${path.basename(zipPath)}`);
    extractTo(zipPath, dest);
    log('Extraído (instalado) en el destino.');
  }

  const startBat = locateStartBat(dest);
  writeStubEnv(dest);

  log('Lanzando start.bat (runtime)...');
  const child = spawn('cmd.exe', ['/c', startBat], {
    cwd: path.dirname(startBat),
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });
  child.on('error', (err) => {
    log(`ERROR al lanzar start.bat: ${err.message}`);
  });

  try {
    const health = await pollHealth(child);
    log(`✅ /health respondió ${health.status} al intento ${health.attempt}: ${health.body}`);
    console.log('\n[install-check] RESULTADO: ACEPTACIÓN OK — el instalador local arranca y /health da 200.');
    return 0;
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    console.log(`\n[install-check] ❌ RESULTADO: FALLO — ${m}`);
    return 1;
  } finally {
    killTree(child);
    if (!keep) {
      log('Desinstalando (borrando carpeta)... usa --keep para conservar.');
      fs.rmSync(dest, { recursive: true, force: true });
    }
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    if (err instanceof CheckError) {
      console.error(`\n[install-check] ❌ FALLO: ${err.message}`);
    } else {
      console.error(`\n[install-check] ❌ FALLO INESPERADO: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  });
