export {};

async function main() {
  const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000";
  const concurrency = Math.min(Number(process.env.LOAD_CONCURRENCY ?? 10), 100);
  const started = Date.now();
  const results = await Promise.all(Array.from({ length: concurrency }, async () => {
    const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(10_000) });
    return response.status;
  }));
  const ok = results.filter((status) => status === 200).length;
  console.log(JSON.stringify({ concurrency, ok, failed: results.length - ok, durationMs: Date.now() - started }));
  if (ok !== results.length) process.exit(1);
}
void main();
