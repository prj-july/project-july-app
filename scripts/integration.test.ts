/// <reference types="node" />
// End-to-end: the app's real PairingSession + LiveOven against june-local (the
// Go server, JUNE_LOCAL_BIN) or the Python reference server (june_local_cloud.py,
// JUNE_LOCAL_CLOUD), with a simulated oven on the other side.
//
// Run: JUNE_LOCAL_BIN=/path/to/june-local npm run test:integration
//  or: JUNE_LOCAL_CLOUD=/path/to/june_local_cloud.py npm run test:integration (needs `py`)
// Both need `openssl`.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha1 } from '@noble/hashes/legacy.js';
import { blake2b } from '@noble/hashes/blake2.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { SRP_N, fromB64, open, seal, sessionKey, toB64, toHex } from '../src/api/protocol';
import { PairingSession, type PairingStep } from '../src/api/pairing';
import { LiveOven, type Paired } from '../src/api/client';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // throwaway self-signed cert below
const SERVER = process.env.JUNE_LOCAL_CLOUD;
// The real server instead: a june-local binary built from the installer repo's
// golocal/ (`go build -o june-local.exe .`). It also gets the plain-listener and
// camera-stream checks.
const GO_BIN = process.env.JUNE_LOCAL_BIN;
if (!SERVER && !GO_BIN) throw new Error('Set JUNE_LOCAL_BIN to a june-local binary, or JUNE_LOCAL_CLOUD to the path of june_local_cloud.py');
const PORT = 18443;
const HTTP_PORT = 18080;
const OVEN_ID = 'oven-sim-0001';
const conn = { host: `127.0.0.1:${PORT}`, secure: true };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(what: string, fn: () => T | undefined | null | false, ms = 15000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(50);
  }
}

// --- throwaway server --------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), 'july-it-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
  '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem')], { stdio: 'ignore' });
const server = GO_BIN
  ? spawn(GO_BIN, ['--cert', join(dir, 'c.pem'), '--key', join(dir, 'k.pem'), '--port', String(PORT), '--http-port', String(HTTP_PORT),
    '--bind', '127.0.0.1', '--log', join(dir, 'server.log'), '--jsonl', join(dir, 'frames.jsonl'),
    '--companion-state', join(dir, 'companions.json'), '--content-root', dir, '--media-dir', join(dir, 'media')], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  : spawn('py', ['-3', SERVER as string, '--cert', join(dir, 'c.pem'), '--key', join(dir, 'k.pem'), '--port', String(PORT),
    '--bind', '127.0.0.1', '--log', join(dir, 'server.log'), '--jsonl', join(dir, 'frames.jsonl')], {
    env: { ...process.env, JUNE_COMPANION_STATE: join(dir, 'companions.json'), JUNE_CONTENT_ROOT: dir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const SERVER_NAME = GO_BIN ? 'june-local (Go)' : 'reference server';
let serverOut = '';
server.stdout.on('data', (d) => (serverOut += d));
server.stderr.on('data', (d) => (serverOut += d));

// --- simulated oven ----------------------------------------------------------

const L = 1024, g = 19n, N = SRP_N;
const big = (b: Uint8Array) => BigInt('0x' + toHex(b));
const enc = (n: bigint, len = 0) => {
  let h = n.toString(16); if (h.length % 2) h = '0' + h;
  const r = Uint8Array.from(h.match(/../g)!, (x) => parseInt(x, 16));
  const o = new Uint8Array(Math.max(len, r.length)); o.set(r, o.length - r.length); return o;
};
const cat = (...p: Uint8Array[]) => Uint8Array.from(p.flatMap((x) => Array.from(x)));
const pow = (b: bigint, e: bigint, m: bigint) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; };

class SimOven {
  ws!: WebSocket;
  pin = '';
  a = big(crypto.getRandomValues(new Uint8Array(32)));
  companion: { public_signing_key: string; companion_id: string } | null = null;
  received: any[] = [];
  badSignatures = 0;
  cavity = 21_000;

  async connect() {
    this.ws = new WebSocket(`wss://${conn.host}/1/messaging/websocket/oven`);
    await new Promise<void>((res, rej) => { this.ws.onopen = () => res(); this.ws.onerror = () => rej(new Error('oven ws')); });
    this.ws.onmessage = (ev) => this.onFrame(JSON.parse(String(ev.data)));
    this.send(10018, { state: 'idle' });
  }

  send(code: number, data: object) {
    const t = Date.now();
    this.ws.send(JSON.stringify({ v: 2, message_code: code, order: t & 0x7fffffff, time: t, signature: '', device_name: 'June Oven', device_id: OVEN_ID, data }));
  }

  startPairing(pin: string) {
    this.pin = pin;
    this.send(10026, { pin: { code: pin }, key_info: { A: toB64(enc(pow(g, this.a, N))) } });
  }

  onFrame(f: any) {
    if (f.message_code === 11025) return this.finishPairing(f.data.key_info);
    if (f.device_id === OVEN_ID || f.message_code >= 12000 || f.message_code < 11000) return; // our own reflected frames
    this.received.push(f);
    if (!this.verify(f)) this.badSignatures++;
    const ack = (status = 'success') => this.send(10020, { request_order: f.order, status });
    switch (f.message_code) {
      case 11002: {
        ack();
        const plan = { food: { name: f.data.primitive_type, plan: { id: 0, steps: [{ id: 1, temperature_cavity: f.data.temperature_cavity }] } }, step_state: { step_index: 0 } };
        this.send(10014, plan);
        this.send(10018, { state: 'active' });
        this.cavity = 60_000;
        this.send(10013, { sensor_data: { cavity: this.cavity, probe: [] }, cook_state_data: { progress: { percentage: 20, label_type: 'temperature' } }, cook_plan_data: plan });
        this.send(10011, { image_url: 'https://api.junelife.com/media/prod/images/latest.jpg?ts=1' });
        return;
      }
      case 11006: return ack();
      case 11005: return ack('not-allowed'); // exercise the restart fallback
      case 11004: ack(); this.send(10017, { type: 'cancelled' }); this.send(10018, { state: 'idle' }); return;
      case 11011: return; // keepalive
      default: return ack();
    }
  }

  /** Verify a companion frame exactly as the oven does. */
  verify(f: any): boolean {
    if (!this.companion) return false;
    const sig = fromB64(f.signature);
    const pub = fromB64(this.companion.public_signing_key);
    if (toHex(sig.subarray(0, 8)) !== toHex(blake2b(pub, { dkLen: 8 }))) return false;
    const unsigned = JSON.stringify({ ...f, signature: '' });
    return ed25519.verify(sig.subarray(8), new TextEncoder().encode(unsigned), pub);
  }

  finishPairing(ki: { B: string; salt: string; companion_info: string }) {
    const salt = fromB64(ki.salt), B = big(fromB64(ki.B)), A = pow(g, this.a, N);
    const u = big(sha1(cat(enc(A, L), enc(B, L))));
    const k = big(sha1(cat(enc(N, L), enc(g, L))));
    const x = big(sha1(cat(salt, sha1(new TextEncoder().encode('user:' + this.pin)))));
    const S = pow(((B - k * pow(g, x, N)) % N + N) % N, this.a + u * x, N);
    const K = sessionKey(enc(S));
    this.companion = open(ki.companion_info, K);
    const ovenInfo = { oven_id: OVEN_ID, oven_name: 'Test Kitchen', model_number: 'meerkat', version: 'sim', serial_number: 'SIM1', public_signing_key: toB64(new Uint8Array(32)), public_encryption_key: toB64(new Uint8Array(32)) };
    this.send(10026, { pin: { code: this.pin }, key_info: { oven_info: seal(ovenInfo, K) } });
  }
}

// --- test --------------------------------------------------------------------

async function main() {
  for (let i = 0; ; i++) {
    try { await fetch(`https://${conn.host}/local/status`); break; } catch { if (i > 60) throw new Error('server did not start'); await sleep(250); }
  }
  const oven = new SimOven();
  await oven.connect();
  console.log(`✓ simulated oven connected to ${SERVER_NAME}`);

  const steps: PairingStep[] = [];
  const session = new PairingSession(conn, 'Integration phone', (s) => steps.push(s));
  await session.begin();
  const shown = await until('pairing code', () => steps.find((s) => s.step === 'show-code')) as Extract<PairingStep, { step: 'show-code' }>;
  assert.match(shown.code, /^\d{8}$/);
  console.log(`✓ got pairing code ${shown.code}`);

  oven.startPairing(shown.code);
  const done = await until('pairing to finish', () => steps.find((s) => s.step === 'paired' || s.step === 'failed'));
  if (done.step === 'failed') throw new Error('pairing failed: ' + done.message);
  const paired = (done as Extract<PairingStep, { step: 'paired' }>).paired;
  assert.equal(paired.oven.id, OVEN_ID);
  assert.equal(paired.oven.name, 'Test Kitchen');
  assert.ok(oven.companion, 'oven unsealed companion_info');
  console.log('✓ paired: oven unsealed companion_info, phone unsealed oven_info');

  const link = new LiveOven(paired as Paired);
  link.start();
  await until('link online', () => link.snapshot().link === 'online');

  await link.preheat('bake', 176.667);
  await until('cooking telemetry', () => link.snapshot().cavityC === 60);
  const s = link.snapshot();
  assert.equal(s.active, true);
  assert.equal(s.mode, 'bake');
  assert.equal(s.planId, 0); // phone-started cooks run as plan 0
  assert.equal(s.progress, 0.2);
  assert.equal(s.phase, 'preheating');
  assert.ok(Math.abs((s.targetC ?? 0) - 176.667) < 0.01);
  await until('camera frame', () => link.snapshot().imageUrl);
  assert.equal(link.snapshot().imageUrl, `https://${conn.host}/media/prod/images/latest.jpg?ts=1`);
  console.log('✓ preheat acked; telemetry, plan and re-homed camera URL applied');

  await link.setTimer(20 * 60_000);
  const timer = oven.received.find((f) => f.message_code === 11006);
  assert.deepEqual(timer.data, { plan_id: 0, duration: 1_200_000 });
  console.log('✓ timer set with the live plan_id');

  await link.setTemperature(190);
  assert.ok(oven.received.some((f) => f.message_code === 11002 && f.data.temperature_cavity === 190000));
  console.log('✓ temperature change falls back to restart when the oven refuses 11005');

  await link.cancel();
  await until('idle', () => !link.snapshot().active);
  console.log('✓ cancel acked; oven idle');

  const commands = oven.received.filter((f) => f.message_code !== 11011);
  assert.ok(commands.length >= 5);
  assert.equal(oven.badSignatures, 0, 'every companion frame carries a valid Ed25519 signature');
  assert.ok(commands.every((f) => f.target?.id === OVEN_ID && f.device_id === paired.deviceId));
  console.log(`✓ all ${oven.received.length} companion frames verified against the paired signing key`);

  if (GO_BIN) await plainAndCamera(paired as Paired);

  link.stop();
  oven.ws.close();
  console.log('\nintegration: all checks passed');
}

/** june-local only: the plain listener, and Live view's MJPEG stream fed by camerad's /internal/video. */
async function plainAndCamera(paired: Paired) {
  const plain = new LiveOven({ ...paired, conn: { host: '127.0.0.1', secure: false, port: HTTP_PORT } });
  plain.start();
  await until('plain link online', () => plain.snapshot().link === 'online');
  console.log(`✓ the same pairing works over the plain listener (:${HTTP_PORT} here, :80 on the oven)`);

  const uris: string[] = [];
  const stop = plain.watchCamera((u) => uris.push(u));
  const state = () => fetch(`http://127.0.0.1:${HTTP_PORT}/internal/camera-state`).then((r) => r.json() as Promise<{ viewer: boolean }>);
  for (let i = 0; !(await state()).viewer; i++) { if (i > 100) throw new Error('stream never opened the camera gate'); await sleep(50); }

  const jpeg = new Uint8Array(4096).map((_, i) => (i * 13) & 0xff);
  jpeg.set([0xff, 0xd8], 0);
  jpeg.set([0xff, 0xd9], jpeg.length - 2);
  const res = await fetch(`http://127.0.0.1:${HTTP_PORT}/internal/video`, { method: 'POST', body: jpeg });
  assert.equal(res.status, 200);
  const uri = await until('a stream frame', () => uris[uris.length - 1]);
  assert.deepEqual(fromB64(uri.slice('data:image/jpeg;base64,'.length)), jpeg);
  await until('10011 for the new still', () => plain.snapshot().imageUrl?.startsWith(`http://127.0.0.1:${HTTP_PORT}/media/prod/images/latest.jpg`));
  stop();
  plain.stop();
  console.log('✓ Live view reads the MJPEG stream, which holds the camera gate open while watched');
}

main()
  .catch((e) => { console.error('\nFAILED:', e); console.error('--- server output ---\n' + serverOut.slice(-3000)); process.exitCode = 1; })
  .finally(() => { server.kill(); setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} process.exit(); }, 300); });
