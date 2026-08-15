const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rootKey = root.toLowerCase();
const port = Number(process.env.PORT || process.argv[2] || 3100);
const mode = (process.env.VERIFY_MODE || process.argv[3] || 'production').toLowerCase();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port: ${port}`);
if (!['production', 'dev'].includes(mode)) throw new Error('VERIFY_MODE must be production or dev');

function quoteCmdArg(arg) {
  const value = String(arg);
  if (!/[\s&()[\]{}^=;!'+,`~%|<>"]/u.test(value)) return value;
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

function spawnPortable(command, args, options = {}) {
  if (process.platform === 'win32' && /\.cmd$/i.test(command)) {
    const commandLine = [command, ...args].map(quoteCmdArg).join(' ');
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine], options);
  }
  return spawn(command, args, options);
}

function exec(command, args, options = {}) {
  return new Promise((resolve, reject) => execFile(command, args, { windowsHide: true, ...options }, (error, stdout, stderr) => error ? reject(new Error(`${error.message}\n${stderr || ''}`)) : resolve(stdout)));
}

async function processOnPort() {
  if (process.platform !== 'win32') return null;
  let output;
  try { output = await exec('netstat.exe', ['-ano', '-p', 'tcp']); } catch { return null; }
  const line = output.split(/\r?\n/).find((row) => row.includes('LISTENING') && new RegExp(`[:.]${port}\\s+`).test(row));
  if (!line) return null;
  const pid = Number(line.trim().split(/\s+/).at(-1));
  if (!pid) return null;
  const ps = await exec('powershell.exe', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`]);
  return { pid, commandLine: ps.trim() };
}

async function freeOwnedPort() {
  const owner = await processOnPort();
  if (!owner) return;
  if (!owner.commandLine.toLowerCase().includes(rootKey)) {
    throw new Error(`Port ${port} is used by another process; refusing to stop PID ${owner.pid}`);
  }
  await exec('taskkill.exe', ['/PID', String(owner.pid), '/T', '/F']);
}

async function waitForHealth(baseUrl, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'not started';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      last = `HTTP ${response.status}`;
      if (response.status === 200) return;
    } catch (error) { last = error.message; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Health check timed out: ${last}`);
}

async function stopTree(pid) {
  if (process.platform === 'win32') {
    try { await exec('taskkill.exe', ['/PID', String(pid), '/T', '/F']); } catch {}
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch {}
  }
}

(async () => {
  await freeOwnedPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dbPath = path.join(root, `.verify-${process.pid}.db`);
  try { fs.rmSync(dbPath, { force: true }); } catch {}
  const verifyEnv = {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: `file:${dbPath}`,
    SESSION_SECRET: process.env.SESSION_SECRET || 'verify-session-secret-change-me-32-characters',
    CREDENTIALS_KEY: process.env.CREDENTIALS_KEY || 'MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=',
    BOUNCE_WEBHOOK_SECRET: process.env.BOUNCE_WEBHOOK_SECRET || 'verify-bounce-secret-change-me-32-characters',
    UNSUBSCRIBE_SECRET: process.env.UNSUBSCRIBE_SECRET || 'verify-unsubscribe-secret-change-me-32-characters',
    APP_URL: `https://127.0.0.1:${port}`,
    MOCK_AI: 'true',
    MOCK_EMAIL: 'true',
  };
  await exec(npm, ['exec', '--', 'prisma', 'db', 'push', '--skip-generate'], { cwd: root, env: verifyEnv });
  const server = spawnPortable(npm, ['run', mode === 'production' ? 'start' : 'dev', '--', '-p', String(port)], {
    cwd: root,
    env: verifyEnv,
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: 'inherit',
  });
  try {
    await waitForHealth(baseUrl);
    const smoke = spawnPortable(process.execPath, ['scripts/mvp-smoke.mjs'], {
      cwd: root,
      env: { ...verifyEnv, BASE_URL: baseUrl, MOCK_AI: 'true', MOCK_EMAIL: 'true' },
      shell: false,
      windowsHide: true,
      stdio: 'inherit',
    });
    const code = await new Promise((resolve, reject) => { smoke.on('error', reject); smoke.on('close', resolve); });
    if (code !== 0) throw new Error(`Smoke failed with exit code ${code}`);
  } finally {
    await stopTree(server.pid);
    try { fs.rmSync(dbPath, { force: true }); } catch {}
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
