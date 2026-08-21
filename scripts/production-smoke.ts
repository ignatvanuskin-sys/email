export {};

async function main() {
  const baseUrl = process.env.SMOKE_BASE_URL ?? process.env.APP_URL ?? "http://localhost:3000";
  const checks: Array<{ path: string; expected: number }> = [
    { path: "/api/health", expected: 200 },
    { path: "/api/docs/openapi", expected: 200 },
    { path: "/login", expected: 200 },
    { path: "/register", expected: 200 },
    { path: "/api/dashboard", expected: 401 },
  ];
  let failed = false;
  for (const check of checks) {
    try {
      const response = await fetch(`${baseUrl}${check.path}`, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      const text = await response.text();
      console.log(`${response.status} ${check.path} ${text.slice(0, 200)}`);
      if (response.status !== check.expected) failed = true;
    } catch (error) { console.error(`failed ${check.path}`, error); failed = true; }
  }
  if (failed) process.exit(1);
}
void main();
