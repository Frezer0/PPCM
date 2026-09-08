// Stop the isolated test service before Playwright's Windows process-tree cleanup.
export default async function teardown() {
  const base = 'http://127.0.0.1:4173';
  try {
    const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) });
    if ((await health.json()).app === 'ppcm') {
      await fetch(`${base}/api/shutdown`, { method: 'POST', signal: AbortSignal.timeout(2000) });
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  } catch { /* The server may already have stopped after a failed startup. */ }
}
