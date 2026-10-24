import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const children: ChildProcess[] = [];
let shuttingDown = false;

function start(command: string, args: string[], environment: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, {
    cwd: root,
    env: environment,
    stdio: 'inherit',
  });
  children.push(child);
  return child;
}

function stopAll(exitCode = 0): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exitCode = exitCode;
}

const api = start(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  ...process.env,
  // The Vite development proxy is configured for 3001. Use a production
  // reverse proxy for any other port.
  PORT: '3001',
  HOST: '127.0.0.1',
});

const vite = start(process.execPath, [path.resolve(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port=3000', '--host=0.0.0.0'], process.env);

api.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`Admin API stopped with exit code ${code ?? 'unknown'}.`);
    stopAll(code ?? 1);
  }
});

vite.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`Vite stopped with exit code ${code ?? 'unknown'}.`);
    stopAll(code ?? 1);
  }
});

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
