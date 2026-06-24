import { printInfo, printSuccess, printError, printDivider } from '../display.js';
import { checkRuntimeHealth, getRuntimeStatus } from '../runtime-client.js';

export async function statusCommand(): Promise<void> {
  printInfo('Verificando estado del sistema...');
  printDivider();

  const isHealthy = await checkRuntimeHealth();

  if (isHealthy) {
    printSuccess('✅ Runtime está activo');

    const status = await getRuntimeStatus();
    if (status) {
      console.log(`   Versión: ${status.version}`);
      console.log(`   Estado: ${status.status}`);
      console.log(`   Uptime: ${Math.floor(status.uptime)} segundos`);
      console.log(`   Última verificación: ${new Date(status.timestamp).toLocaleString()}`);
    }
  } else {
    printError('❌ Runtime no disponible');
    console.log('   El runtime debe estar iniciado para mostrar información detallada.');
  }

  printDivider();
}
