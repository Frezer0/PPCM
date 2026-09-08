const url = `http://localhost:${Number(process.env.PORT || 3000)}`;
try {
  const health = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
  if ((await health.json()).app !== 'ppcm') throw new Error('El puerto está ocupado por otra aplicación.');
  const result = await fetch(`${url}/api/shutdown`, { method: 'POST' });
  if (!result.ok) throw new Error('No se pudo detener PPCM.');
  console.log('PPCM detenido. Los datos quedaron guardados.');
} catch (error) {
  console.log(error.message === 'fetch failed' ? 'PPCM no está en ejecución.' : error.message);
}
