#!/usr/bin/env node
// Runs the strict performance audit against a local static server.

import { spawn } from 'node:child_process';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const args = process.argv.slice(2);
const auditArgs = args.length ? args : ['--ci'];
let serverProcess = null;
let stoppingServer = false;

function findOpenPort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (port) resolvePort(port);
        else reject(new Error('Unable to allocate an open port'));
      });
    });
  });
}

function spawnNode(script, scriptArgs, options = {}) {
  return spawn(process.execPath, [script, ...scriptArgs], {
    cwd: repoRoot,
    windowsHide: true,
    ...options,
  });
}

async function waitForServer(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.status === 200) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveTimeout) => setTimeout(resolveTimeout, 150));
  }
  throw new Error(`Static server did not become ready at ${url}: ${lastError?.message || 'timed out'}`);
}

function terminateServer() {
  if (!serverProcess || serverProcess.killed) return;
  stoppingServer = true;
  serverProcess.kill();
}

function runAudit(url) {
  return new Promise((resolveExit) => {
    const auditProcess = spawnNode(resolve(repoRoot, 'scripts', 'audit-pagespeed.mjs'), auditArgs, {
      env: {
        ...process.env,
        WORKSHOP_ARCADE_URL: url,
      },
      stdio: 'inherit',
    });

    auditProcess.on('exit', (code, signal) => {
      resolveExit({ code: code ?? 1, signal });
    });
  });
}

process.on('exit', terminateServer);
process.on('SIGINT', () => {
  terminateServer();
  process.exit(130);
});
process.on('SIGTERM', () => {
  terminateServer();
  process.exit(143);
});

const port = await findOpenPort();
const url = `http://${host}:${port}`;
serverProcess = spawnNode(resolve(repoRoot, 'scripts', 'serve-static.mjs'), ['--host', host, '--port', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

serverProcess.stdout.on('data', (chunk) => process.stdout.write(chunk));
serverProcess.stderr.on('data', (chunk) => process.stderr.write(chunk));
serverProcess.on('exit', (code, signal) => {
  if (stoppingServer) return;
  if (code !== null && code !== 0) {
    console.error(`Static server exited early with code ${code}`);
  } else if (signal) {
    console.error(`Static server exited early from signal ${signal}`);
  }
});

await waitForServer(`${url}/`);
console.log(`Running local performance audit against ${url}/`);
const result = await runAudit(url);
terminateServer();

if (result.signal) {
  console.error(`Performance audit stopped by signal ${result.signal}`);
}
process.exit(result.code);
