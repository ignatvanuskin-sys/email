const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');

const root = process.cwd();
const outDir = path.join(root, '.final-verification');
fs.mkdirSync(outDir, { recursive: true });
const results = { startedAt: new Date().toISOString(), commands: [], production: null };

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
function run(name, command, args, options = {}) {
  return new Promise((resolve) => {
    const stdoutPath = path.join(outDir, `${name}.stdout.log`);
    const stderrPath = path.join(outDir, `${name}.stderr.log`);
    const stdout = fs.createWriteStream(stdoutPath);
    const stderr = fs.createWriteStream(stderrPath);
    const startedAt = new Date().toISOString();
    const child = spawnPortable(command, args, {
      cwd: root,
      env: { ...process.env, ...(options.env || {}) },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(stdout); child.stderr.pipe(stderr);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    }, options.timeout || 20 * 60_000);
    child.on('error', (error) => finish(null, null, error));
    child.on('close', (code, signal) => finish(code, signal));
    let done = false;
    function finish(code, signal, error) {
      if (done) return; done = true; clearTimeout(timer); stdout.end(); stderr.end();
      const item = { name, command: [command, ...args].join(' '), pid: child.pid, startedAt, finishedAt: new Date().toISOString(), exitCode: code, signal, timedOut, stdoutPath, stderrPath, error: error ? String(error.stack || error) : null };
      results.commands.push(item); write(); resolve(item);
    }
  });
}
function write() { fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2)); }
function freePort() { return new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(e => e ? reject(e) : resolve(p)); }); s.on('error', reject); }); }
async function wait200(url, timeout = 120000) { const end = Date.now() + timeout; let last; while (Date.now() < end) { try { const r = await fetch(url); last = `HTTP ${r.status}`; if (r.status === 200) return; } catch (e) { last = e.message; } await new Promise(r => setTimeout(r, 1000)); } throw new Error(`Health timeout: ${last}`); }
async function killTree(pid) { await new Promise(resolve => { const p = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }); p.on('close', resolve); p.on('error', resolve); }); }

(async () => {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const checks = [
    ['prisma-generate', npx, ['prisma', 'generate']],
    ['typecheck', npm, ['run', 'typecheck']],
    ['test', npm, ['test']],
    ['lint', npm, ['run', 'lint']],
    ['build', npm, ['run', 'build']],
  ];
  for (const c of checks) { const r = await run(...c, { timeout: 30 * 60_000 }); if (r.exitCode !== 0) { results.finishedAt = new Date().toISOString(); write(); process.exitCode = 1; return; } }
  const port = await freePort();
  const stdoutPath = path.join(outDir, 'production.stdout.log');
  const stderrPath = path.join(outDir, 'production.stderr.log');
  const server = spawnPortable(npm, ['run', 'start', '--', '-p', String(port)], { cwd: root, env: { ...process.env, MOCK_AI: 'true', MOCK_EMAIL: 'true', PORT: String(port) }, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.pipe(fs.createWriteStream(stdoutPath)); server.stderr.pipe(fs.createWriteStream(stderrPath));
  results.production = { pid: server.pid, port, baseUrl: `http://127.0.0.1:${port}`, stdoutPath, stderrPath, health: null, smokeExitCode: null };
  write();
  try {
    await wait200(`${results.production.baseUrl}/api/health`);
    results.production.health = 200; write();
    const smoke = await run('mvp-smoke', process.execPath, ['scripts/mvp-smoke.mjs'], { timeout: 10 * 60_000, env: { MOCK_AI: 'true', MOCK_EMAIL: 'true', BASE_URL: results.production.baseUrl, APP_URL: results.production.baseUrl } });
    results.production.smokeExitCode = smoke.exitCode;
    if (smoke.exitCode !== 0) process.exitCode = 1;
  } catch (e) { results.production.error = String(e.stack || e); process.exitCode = 1; }
  finally { await killTree(server.pid); results.production.terminated = true; results.finishedAt = new Date().toISOString(); write(); }
})().catch(e => { results.fatalError = String(e.stack || e); results.finishedAt = new Date().toISOString(); write(); process.exitCode = 1; });
