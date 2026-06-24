import { printInfo, printSuccess, printError, printDivider, printWarning } from '../display.js';
import { CONSOLE_URL } from '../constants.js';
import { openInBrowser } from '../utils/browser.js';
import { checkRuntimeHealth, getRuntimeStatus, startRuntime, getActiveRuns } from '../runtime-client.js';

export async function startCommand(): Promise<void> {
  printInfo('Iniciando Ninja AI Framework...');
  printDivider();

  const isHealthy = await checkRuntimeHealth();

  if (isHealthy) {
    printSuccess('✅ Runtime ya está activo');

    const status = await getRuntimeStatus();
    if (status) {
      console.log(`   Versión  : ${status.version}`);
      console.log(`   Uptime   : ${Math.floor(status.uptime)} segundos`);
      console.log(`   Estado   : ${status.status}`);
    }

    const runs = await getActiveRuns();
    if (runs && Array.isArray(runs) && runs.length > 0) {
      console.log(`   Runs activos : ${runs.length}`);
    }

    printDivider();
    printInfo('Abriendo Forge Console...');
    await openInBrowser(CONSOLE_URL);
    return;
  }

  // Runtime no disponible — intentar arrancarlo como subproceso
  printWarning('Runtime no disponible — intentando arrancarlo automáticamente...');
  const started = await startRuntime();

  if (started) {
    printSuccess('✅ Kage Runtime arrancado correctamente');
    printInfo('Abriendo Forge Console...');
    await openInBrowser(CONSOLE_URL);
  } else {
    printError('❌ No se pudo arrancar el runtime automáticamente');
    console.log('');
    printInfo('Instrucciones manuales:');
    console.log('   1. Abre una nueva terminal');
    console.log('   2. Ejecuta: pnpm runtime:dev');
    console.log('   3. Vuelve aquí y ejecuta: ninja start');
    console.log('');
    printInfo(`Una vez iniciado, abre: ${CONSOLE_URL}`);
  }
}
