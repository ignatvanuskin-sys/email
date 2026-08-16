async function main() {
  const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000";
  const paths = ["/api/health", "/api/docs/openapi"];
  let failed = false;
  for (const path of paths) {
    try {
      const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(10_000) });
      const text = await response.text();
      console.log(`${response.status} ${path} ${text.slice(0, 200)}`);
      if (!response.ok && path === "/api/health") failed = true;
    } catch (error) { console.error(`failed ${path}`, error); failed = true; }
  }
  if (failed) process.exit(1);
}
void main();
