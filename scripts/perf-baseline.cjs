/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const root = process.cwd();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function quoteCmdArg(arg) {
  const value = String(arg);
  if (!/[\s&()[\]{}^=;!'+,`~%|<>"]/u.test(value)) return value;
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

function spawnPortable(command, args, options = {}) {
  if (process.platform === 'win32' && /\.cmd$/i.test(command)) {
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', [command, ...args].map(quoteCmdArg).join(' ')], options);
  }
  return spawn(command, args, options);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
    server.on('error', reject);
  });
}

async function request(url) {
  const started = performance.now();
  const response = await fetch(url, { redirect: 'manual' });
  await response.arrayBuffer();
  return { status: response.status, ms: Number((performance.now() - started).toFixed(1)) };
}

async function waitForHttp(url, timeoutMs = 120000) {
  const started = performance.now();
  let lastError = 'not started';
  while (performance.now() - started < timeoutMs) {
    try {
      const result = await request(url);
      return { ...result, ms: Number((performance.now() - started).toFixed(1)) };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`HTTP startup timeout: ${lastError}`);
}

async function killTree(pid) {
  if (process.platform !== 'win32') {
    try { process.kill(-pid, 'SIGTERM'); } catch {}
    return;
  }
  await new Promise((resolve) => {
    const child = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
    child.on('close', resolve);
    child.on('error', resolve);
  });
}

async function measure(mode) {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const log = fs.createWriteStream(path.join(root, `.perf-${mode}.log`));
  const args = ['run', mode === 'dev' ? 'dev' : 'start', '--', '-p', String(port)];
  const started = performance.now();
  const server = spawnPortable(npm, args, {
    cwd: root,
    env: { ...process.env, MOCK_AI: 'true', MOCK_EMAIL: 'true', PORT: String(port) },
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  try {
    const ready = await waitForHttp(`${baseUrl}/api/health`);
    const hits = [];
    for (const route of ['/api/health', '/api/health', '/login', '/login', '/', '/api/auth/me', '/api/auth/me', '/api/dashboard']) {
      hits.push({ route, ...(await request(baseUrl + route)) });
    }
    return {
      mode,
      port,
      spawnToFirstHttpMs: ready.ms,
      firstStatus: ready.status,
      hits,
      totalMs: Number((performance.now() - started).toFixed(1)),
    };
  } finally {
    await killTree(server.pid);
    log.end();
  }
}

(async () => {
  const mode = process.argv[2] || 'dev';
  if (!['dev', 'production'].includes(mode)) throw new Error('Usage: node scripts/perf-baseline.cjs dev|production');
  console.log(JSON.stringify(await measure(mode), null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
