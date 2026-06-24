import open from 'open';
import { printSuccess, printError } from '../display.js';

export async function openInBrowser(url: string): Promise<void> {
  try {
    await open(url);
    printSuccess(`Abierto en el navegador: ${url}`);
  } catch (error) {
    printError(`No se pudo abrir en el navegador: ${(error as Error).message}`);
    console.log(`Por favor, abre manualmente: ${url}`);
  }
}
