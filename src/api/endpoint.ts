// One configured endpoint (the oven's LAN address) derives every URL.
//
// june-local serves the same routes on TLS :443 and on a plain listener, so a
// phone that cannot trust the home certificate can fall back to plain HTTP.
// Commands stay Ed25519-signed and pairing stays SRP-protected either way.
//
// On the oven the plain listener is :80 (`june-local --http-port 80`, set by the
// installer's boot image). The Python reference server uses :8080, so setup
// tries that too.

/** `port` is the plain listener's port; it is unused when `secure`. */
export type Connection = { host: string; secure: boolean; port?: number };

export const PLAIN_PORT = 80;
const PLAIN_PORTS = [PLAIN_PORT, 8080];

export function normalizeHost(input: string): string {
  return input.trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '').replace(/:(443|80|8080)$/, '');
}

export function urls({ host, secure, port = PLAIN_PORT }: Connection) {
  const bare = host.replace(/:\d+$/, '');
  const plain = `${bare}${port === 80 ? '' : `:${port}`}`;
  const base = secure ? `https://${host}` : `http://${plain}`;
  return {
    base,
    ws: `${secure ? 'wss' : 'ws'}://${secure ? host : plain}/1/messaging/websocket/companion`,
    statusPage: `http://${plain}/local`,
    latestImage: `${base}/media/prod/images/latest.jpg`,
    stream: `${base}/media/stream.mjpg`,
  };
}

/** Re-home a camera URL from a 10011 frame (it names api.junelife.com) onto our endpoint. */
export function rehomeMediaUrl(conn: Connection, imageUrl: string): string {
  const m = imageUrl.match(/^[a-z]+:\/\/[^/]+(\/.*)$/i);
  return m ? urls(conn).base + m[1] : imageUrl;
}

export type LocalStatus = { ok: boolean; mode: string; server: string; version: string };

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fn(ctl.signal);
  } finally {
    clearTimeout(t);
  }
}

export type ProbeResult =
  | { ok: true; conn: Connection; status: LocalStatus }
  | { ok: false; reason: 'unreachable' | 'not-july'; message: string };

/**
 * Find how this phone can reach the server: HTTPS first, then plain :80, then
 * plain :8080. All three are tried at once so an unreachable address costs one
 * timeout. If only a plain port answers, the home certificate isn't trusted yet.
 */
export async function probe(host: string): Promise<ProbeResult> {
  const candidates: Connection[] = [{ host, secure: true }, ...PLAIN_PORTS.map((port) => ({ host, secure: false, port }))];
  const results = await Promise.allSettled(candidates.map((conn) =>
    withTimeout(5000, async (signal) => {
      const res = await fetch(`${urls(conn).base}/local/status`, { signal });
      return (await res.json()) as LocalStatus;
    })));

  for (let i = 0; i < candidates.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value?.server === 'june-local') return { ok: true, conn: candidates[i], status: r.value };
  }
  if (results.some((r) => r.status === 'fulfilled')) {
    return { ok: false, reason: 'not-july', message: 'Something answered at that address, but it is not a june-local server.' };
  }
  return {
    ok: false,
    reason: 'unreachable',
    message: 'No answer from that address. Check the phone is on the same Wi-Fi as the oven, and that the oven is switched on.',
  };
}
