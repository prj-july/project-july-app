/// <reference types="node" />
// Run: npx tsx scripts/camera.test.ts — endpoint URLs, the MJPEG stream parser,
// and LiveOven.watchCamera against a local server that writes the stream the
// way june-local's serveMJPEG does (installer repo, golocal/rest.go).
import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LiveOven, type Paired } from '../src/api/client';
import { normalizeHost, urls } from '../src/api/endpoint';
import { MjpegParser, NotAStreamError, boundaryOf, readMjpeg } from '../src/api/mjpeg';
import { fromB64, generateKeys } from '../src/api/protocol';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(what: string, fn: () => T | undefined | null | false, ms = 8000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(20);
  }
}

/** A fake JPEG whose body contains the boundary text, so only Content-Length can split it. */
function jpeg(n: number, size = 3000): Uint8Array {
  const b = new Uint8Array(size);
  for (let i = 0; i < size; i++) b[i] = (i * 31 + n * 7) & 0xff;
  b.set([0xff, 0xd8], 0);
  if (size > 120) b.set(new TextEncoder().encode('\r\n--frame\r\n'), 100);
  b.set([0xff, 0xd9], size - 2);
  return b;
}

/** One part exactly as serveMJPEG writes it. */
const part = (j: Uint8Array) => Buffer.concat([
  Buffer.from(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${j.length}\r\n\r\n`), Buffer.from(j), Buffer.from('\r\n'),
]);

// --- endpoint URLs -------------------------------------------------------------
{
  const plain = urls({ host: '192.168.1.75', secure: false });
  assert.equal(plain.base, 'http://192.168.1.75');
  assert.equal(plain.ws, 'ws://192.168.1.75/1/messaging/websocket/companion');
  assert.equal(plain.statusPage, 'http://192.168.1.75/local');
  assert.equal(plain.stream, 'http://192.168.1.75/media/stream.mjpg');
  assert.equal(urls({ host: 'june.local', secure: false, port: 8080 }).base, 'http://june.local:8080');
  const tls = urls({ host: 'june.local', secure: true, port: 8080 });
  assert.equal(tls.base, 'https://june.local');
  assert.equal(tls.statusPage, 'http://june.local:8080/local');
  assert.equal(urls({ host: '127.0.0.1:18443', secure: true }).ws, 'wss://127.0.0.1:18443/1/messaging/websocket/companion');
  for (const typed of ['june.local', 'http://june.local/', 'https://june.local:443', 'june.local:80', ' june.local:8080/local ']) {
    assert.equal(normalizeHost(typed), 'june.local', typed);
  }
  console.log('✓ plain connections use :80 (no port in the URL) unless told otherwise');
}

// --- parser --------------------------------------------------------------------
{
  assert.equal(boundaryOf('multipart/x-mixed-replace; boundary=frame'), 'frame');
  assert.equal(boundaryOf('multipart/x-mixed-replace;boundary="--myb"'), 'myb');
  assert.equal(boundaryOf('image/jpeg'), null);
  assert.equal(boundaryOf(null), null);

  const frames = [jpeg(1), jpeg(2, 50_000), jpeg(3, 10)];
  const wire = new Uint8Array(Buffer.concat([Buffer.from('junk before the first part\r\n'), ...frames.map(part)]));
  const same = (got: Uint8Array[]) => {
    assert.equal(got.length, frames.length);
    got.forEach((g, i) => assert.deepEqual(g, frames[i]));
  };

  same(new MjpegParser('frame').push(wire));
  const p = new MjpegParser('frame');
  const oneByte: Uint8Array[] = [];
  for (let i = 0; i < wire.length; i++) oneByte.push(...p.push(wire.subarray(i, i + 1)));
  same(oneByte);
  const q = new MjpegParser('frame');
  const odd: Uint8Array[] = [];
  for (let i = 0; i < wire.length; i += 997) odd.push(...q.push(wire.subarray(i, i + 997)));
  same(odd);

  // Parts without Content-Length run to the next boundary.
  const bare = (j: Uint8Array) => Buffer.concat([Buffer.from('--frame\r\nContent-Type: image/jpeg\r\n\r\n'), Buffer.from(j), Buffer.from('\r\n')]);
  const simple = [jpeg(4).slice(0, 90), jpeg(5).slice(0, 90)]; // before the embedded boundary text
  const got = new MjpegParser('frame').push(new Uint8Array(Buffer.concat([...simple.map(bare), Buffer.from('--frame\r\n')])));
  assert.deepEqual(got, simple);

  // Non-JPEG parts are dropped.
  const text = Buffer.from('not a picture');
  assert.deepEqual(new MjpegParser('frame').push(new Uint8Array(Buffer.concat([
    Buffer.from(`--frame\r\nContent-Length: ${text.length}\r\n\r\n`), text, Buffer.from('\r\n'),
  ]))), []);
  console.log('✓ MJPEG parts split by Content-Length, in any chunking');
}

// --- a june-local stand-in -----------------------------------------------------

type Mode = 'stream' | 'drop-after-one' | 'old';
const log: string[] = [];
let mode: Mode = 'stream';
let openStreams = 0;
const still = jpeg(99);

const server = createServer((req, res: ServerResponse) => {
  const path = (req.url ?? '').split('?')[0];
  log.push(`${req.method} ${path}`);
  if (req.method === 'POST' && (path === '/internal/camera/on' || path === '/internal/camera/off')) {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"success":true}');
    return;
  }
  if (path === '/media/prod/images/latest.jpg') {
    res.writeHead(200, { 'Content-Type': 'image/jpeg' }).end(Buffer.from(still));
    return;
  }
  if (path === '/media/stream.mjpg' && mode !== 'old') {
    res.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=frame', 'Cache-Control': 'no-store', Connection: 'close' });
    openStreams++;
    let n = 0;
    const tick = setInterval(() => {
      res.write(part(jpeg(++n)));
      if (mode === 'drop-after-one') { clearInterval(tick); res.end(); }
    }, 50);
    res.on('close', () => { clearInterval(tick); openStreams--; log.push('stream closed'); });
    return;
  }
  res.writeHead(404).end('not found');
});

const paired = (port: number) => ({
  conn: { host: '127.0.0.1', secure: false, port }, deviceId: 'phone', deviceName: 'Test phone', password: '',
  accessToken: 'token', refreshToken: '', keys: generateKeys(), oven: { id: 'oven' }, pairedAt: 0,
}) as Paired;

async function main() {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const link = new LiveOven(paired(port));

  {
    // readMjpeg on its own: frames arrive, abort ends it.
    const ctl = new AbortController();
    const got: Uint8Array[] = [];
    const done = readMjpeg(`http://127.0.0.1:${port}/media/stream.mjpg`, { signal: ctl.signal, onFrame: (f) => got.push(f) });
    await until('two frames', () => got.length >= 2);
    assert.deepEqual(got[0], jpeg(1));
    ctl.abort();
    await assert.rejects(done);
    await assert.rejects(readMjpeg(`http://127.0.0.1:${port}/nope`, { signal: new AbortController().signal, onFrame: () => {} }),
      (e) => e instanceof NotAStreamError);
    await until('stream closed', () => openStreams === 0);
    console.log('✓ readMjpeg streams frames and stops on abort');
  }

  {
    // watchCamera prefers the stream, hands over data URIs, and closes it on stop.
    log.length = 0;
    const uris: string[] = [];
    const stop = link.watchCamera((u) => uris.push(u));
    await until('three frames', () => uris.length >= 3);
    assert.ok(uris[0].startsWith('data:image/jpeg;base64,'));
    assert.deepEqual(fromB64(uris[0].slice('data:image/jpeg;base64,'.length)), jpeg(1));
    assert.equal(openStreams, 1);
    stop();
    await until('stream closed after stop', () => openStreams === 0);
    assert.ok(!log.some((l) => l.includes('/internal/camera')), 'the stream holds the camera gate itself');
    console.log('✓ watchCamera uses the MJPEG stream and closes it when stopped');
  }

  {
    // A dropped stream is reopened.
    mode = 'drop-after-one';
    log.length = 0;
    const uris: string[] = [];
    const stop = link.watchCamera((u) => uris.push(u));
    await until('a frame from a second connection', () => uris.length >= 2, 6000);
    stop();
    assert.ok(log.filter((l) => l === 'GET /media/stream.mjpg').length >= 2);
    console.log('✓ watchCamera reconnects when the stream drops');
  }

  {
    // An older june-local without the stream: stills once a second, camera on, then off at stop.
    mode = 'old';
    log.length = 0;
    const uris: string[] = [];
    const stop = link.watchCamera((u) => uris.push(u));
    await until('a still', () => uris.length >= 1, 4000);
    assert.match(uris[0], new RegExp(`^http://127\\.0\\.0\\.1:${port}/media/prod/images/latest\\.jpg\\?ts=\\d+$`));
    assert.ok(log.includes('POST /internal/camera/on'));
    stop();
    await until('camera off', () => log.includes('POST /internal/camera/off'));
    console.log('✓ without a stream, watchCamera polls stills and turns the camera off when stopped');
  }

  console.log('all camera checks passed');
}

main()
  .catch((e) => { console.error('\nFAILED:', e); process.exitCode = 1; })
  .finally(() => { server.closeAllConnections(); server.close(); });
