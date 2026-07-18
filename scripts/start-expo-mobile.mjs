import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const apiPort = process.env.EXPO_PUBLIC_API_PORT || '3001';
const metroPort = process.env.EXPO_METRO_PORT || '8083';
const useTunnel = args.includes('--tunnel');
const expoArgs = args.filter((arg) => arg !== '--tunnel');
const require = createRequire(import.meta.url);
const expoCli = require.resolve('expo/bin/cli');

function findLanIp() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (
        entry.address.startsWith('10.') ||
        entry.address.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(entry.address)
      ) {
        return entry.address;
      }
    }
  }
  return null;
}

const lanIp = findLanIp();
const env = { ...process.env };

if (useTunnel && !env.EXPO_PUBLIC_API_BASE_URL) {
  env.EXPO_PUBLIC_API_VIA_METRO = 'true';
} else if (!env.EXPO_PUBLIC_API_BASE_URL && lanIp) {
  env.EXPO_PUBLIC_API_BASE_URL = `http://${lanIp}:${apiPort}`;
}

if (env.EXPO_PUBLIC_API_VIA_METRO === 'true') {
  console.log('RiskRadar mobile API: routed through the Expo tunnel');
} else if (env.EXPO_PUBLIC_API_BASE_URL) {
  console.log(`RiskRadar mobile API base: ${env.EXPO_PUBLIC_API_BASE_URL}`);
} else {
  console.warn('RiskRadar could not detect a LAN IP automatically. Set EXPO_PUBLIC_API_BASE_URL manually if Expo Go cannot reach the API.');
}

function isPortOpen(host, targetPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: Number(targetPort) });
    socket.setTimeout(600);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

function findCloudflared() {
  if (env.CLOUDFLARED_PATH && fs.existsSync(env.CLOUDFLARED_PATH)) {
    return env.CLOUDFLARED_PATH;
  }

  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  const located = spawnSync(command, ['cloudflared'], { encoding: 'utf8' });
  const firstMatch = located.stdout?.split(/\r?\n/).find(Boolean);
  if (firstMatch && fs.existsSync(firstMatch)) return firstMatch;

  if (process.platform === 'win32' && env.LOCALAPPDATA) {
    const packagesRoot = path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
    const packageName = fs.existsSync(packagesRoot)
      ? fs.readdirSync(packagesRoot).find((name) => name.startsWith('Cloudflare.cloudflared_'))
      : null;
    const wingetBinary = packageName ? path.join(packagesRoot, packageName, 'cloudflared.exe') : null;
    if (wingetBinary && fs.existsSync(wingetBinary)) return wingetBinary;
  }

  return null;
}

function startCloudflareTunnel(targetPort) {
  const cloudflared = findCloudflared();
  if (!cloudflared) {
    throw new Error(
      'Cloudflare Tunnel is not installed. Run: winget install --id Cloudflare.cloudflared --exact --scope user',
    );
  }

  const tunnelChild = spawn(
    cloudflared,
    ['tunnel', '--url', `http://127.0.0.1:${targetPort}`, '--no-autoupdate'],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );

  const ready = new Promise((resolve, reject) => {
    let publicUrl = null;
    let output = '';
    const timeout = setTimeout(() => {
      reject(new Error(`Cloudflare Tunnel did not become ready. ${output.slice(-800)}`));
    }, 30_000);

    const inspectOutput = (chunk) => {
      const message = chunk.toString();
      output += message;
      publicUrl ??= message.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0] ?? null;

      if (publicUrl && message.includes('Registered tunnel connection')) {
        clearTimeout(timeout);
        resolve(publicUrl);
      }
    };

    tunnelChild.stdout.on('data', inspectOutput);
    tunnelChild.stderr.on('data', inspectOutput);
    tunnelChild.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    tunnelChild.once('exit', (code) => {
      clearTimeout(timeout);
      if (!publicUrl) reject(new Error(`Cloudflare Tunnel exited with code ${code}. ${output.slice(-800)}`));
    });
  });

  return { child: tunnelChild, ready };
}

let apiChild = null;
if (!(await isPortOpen('127.0.0.1', apiPort))) {
  console.log(`Starting RiskRadar API on port ${apiPort}...`);
  apiChild = spawn(process.execPath, ['backend/server.mjs'], {
    stdio: 'inherit',
    env,
  });
} else {
  console.log(`RiskRadar API is already running on port ${apiPort}.`);
}

let tunnelChild = null;
if (useTunnel) {
  console.log('Creating a secure Cloudflare quick tunnel for Expo Go...');
  try {
    const tunnel = startCloudflareTunnel(metroPort);
    tunnelChild = tunnel.child;
    env.EXPO_PACKAGER_PROXY_URL = await tunnel.ready;
    console.log(`Expo tunnel ready: ${env.EXPO_PACKAGER_PROXY_URL}`);
  } catch (error) {
    if (apiChild && !apiChild.killed) apiChild.kill();
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const command = {
  file: process.execPath,
  args: [expoCli, 'start', '--go', '--port', metroPort, ...expoArgs],
};

const child = spawn(command.file, command.args, {
  stdio: 'inherit',
  env,
});

let stopping = false;
function stopProcessTree(target) {
  if (!target || target.killed || !target.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(target.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    target.kill();
  }
}

function stopChildren() {
  if (stopping) return;
  stopping = true;
  if (apiChild && !apiChild.killed) apiChild.kill();
  stopProcessTree(child);
  stopProcessTree(tunnelChild);
}

process.once('SIGINT', stopChildren);
process.once('SIGTERM', stopChildren);

child.on('exit', (code, signal) => {
  stopChildren();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
