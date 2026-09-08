import { spawn, execFile } from 'node:child_process';
import { openSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 3000);
const url = `http://localhost:${port}`;
const healthy = async () => {
  try { const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1200) }); return response.ok && (await response.json()).app === 'ppcm'; } catch { return false; }
};
if (!await healthy()) {
  const dataDir = process.env.PPCM_DATA_DIR || path.join(root, 'data');
  mkdirSync(dataDir, { recursive: true });
  const output = openSync(path.join(dataDir, 'server.log'), 'a');
  const child = spawn(process.execPath, ['server/index.mjs'], { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', output, output] });
  child.unref();
  for (let attempt = 0; attempt < 25 && !await healthy(); attempt++) await new Promise(resolve => setTimeout(resolve, 400));
}
if (!await healthy()) {
  console.error(`No se pudo iniciar PPCM. Revisa data/server.log o comprueba si el puerto ${port} está ocupado.`);
  process.exitCode = 1;
} else {
  console.log(`PPCM está disponible en ${url}`);
  // Invoked by the user's desktop launcher; server stays hidden in the background.
  if (process.platform === 'win32' && !process.argv.includes('--no-open')) execFile('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${url}' -WindowStyle Hidden`]);
}
