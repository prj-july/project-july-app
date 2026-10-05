// Live link to an oven through june-local: REST snapshot + companion WebSocket.
import { rehomeMediaUrl, urls, type Connection } from './endpoint';
import { NotAStreamError, readMjpeg } from './mjpeg';
import { MODES } from './modes';
import { MC, OrderGenerator, buildSignedFrame, toB64, type CompanionKeys } from './protocol';

// --- Shared types ------------------------------------------------------------

export type Paired = {
  conn: Connection;
  deviceId: string;
  deviceName: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  keys: CompanionKeys;
  oven: { id: string; name: string; model?: string; serial?: string; version?: string; publicSigningKey?: string };
  pairedAt: number;
};

export type Phase = 'idle' | 'preheating' | 'cooking' | 'done';

export type OvenSnapshot = {
  link: 'connecting' | 'online' | 'offline';
  ovenOnline: boolean | null;
  active: boolean;
  phase: Phase;
  mode: string | null;
  cavityC: number | null;
  targetC: number | null;
  probeC: number | null;
  /** The food probe target from the current step's exit criteria, if any. */
  probeTargetC: number | null;
  planId: number;
  progress: number | null;
  remainingMs: number | null;
  remainingAt: number;
  elapsedMs: number | null;
  imageUrl: string | null;
  imageAt: number | null;
  offer: { type: 'keep_longer' | 'keep_shorter'; durationMs: number } | null;
  ended: 'completed' | 'cancelled' | null;
};

export const emptySnapshot = (): OvenSnapshot => ({
  link: 'connecting', ovenOnline: null, active: false, phase: 'idle', mode: null,
  cavityC: null, targetC: null, probeC: null, probeTargetC: null, planId: 0, progress: null,
  remainingMs: null, remainingAt: 0, elapsedMs: null, imageUrl: null, imageAt: null,
  offer: null, ended: null,
});

export interface OvenLink {
  readonly demo: boolean;
  snapshot(): OvenSnapshot;
  subscribe(fn: (s: OvenSnapshot) => void): () => void;
  start(): void;
  stop(): void;
  preheat(mode: string, tempC: number): Promise<void>;
  cancel(): Promise<void>;
  setTemperature(tempC: number): Promise<void>;
  setTimer(ms: number): Promise<void>;
  keepCooking(): Promise<void>;
  respondToOffer(accept: boolean): Promise<void>;
  /**
   * Live camera pictures while a screen is watching: calls `onFrame` with an
   * image URI for each new picture. Returns a function that stops watching.
   */
  watchCamera(onFrame: (uri: string) => void): () => void;
  unpair(): Promise<void>;
}

// --- Errors ------------------------------------------------------------------

const ACK_MESSAGES: Record<string, string> = {
  'not-allowed': "The oven didn't allow that right now.",
  'invalid-request': "The oven didn't understand that request.",
  failure: "The oven couldn't do that. Try again, or use the oven's screen.",
  'not-ready': "The oven isn't ready yet. Wait a moment, then try again.",
  cleaning: 'The oven is cleaning. Try again when it has finished.',
  'door-open': 'The oven door is open. Close it, then try again.',
  'preheat-warning-probe-detected': 'A probe is plugged in. Unplug it to preheat, or start a probe cook on the oven.',
  'preheat-warning-food-present-and-probe-detected': 'The oven sees food and a probe inside. Take them out to preheat.',
  'preheat-warning-food-present': 'The oven sees food inside. Take it out to preheat, then put it back once the oven is hot.',
  'session-start-disabled': 'Starting a cook from the phone is turned off on the oven.',
  'preset-not-installed': "That cook mode isn't installed on this oven.",
  'start-cook-warning-no-food': "The oven doesn't see any food yet.",
};

export class OvenError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}

const ackError = (status: string | null) =>
  status === null
    ? new OvenError("The oven didn't answer. Check it is switched on and connected to Wi-Fi.", 'timeout')
    : new OvenError(ACK_MESSAGES[status] ?? `The oven replied “${status}”.`, status);

// --- REST helpers ------------------------------------------------------------

export const USER_AGENT = 'okhttp/4.8.1';

export async function rest<T = Record<string, unknown>>(
  conn: Connection, method: string, path: string, opts: { token?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8000);
  try {
    const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(urls(conn).base + path, {
      method, headers, signal: ctl.signal,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    if (!res.ok) throw new OvenError(`The oven server answered ${res.status}.`);
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  } catch (e) {
    if (e instanceof OvenError) throw e;
    throw new OvenError("Can't reach the oven. Check the phone is on your home Wi-Fi.");
  } finally {
    clearTimeout(t);
  }
}

export function openSocket(conn: Connection, token: string): WebSocket {
  const url = urls(conn).ws;
  // Only React Native's WebSocket takes headers (as a third argument); browsers
  // and Node cannot set them, and june-local does not require them.
  if (globalThis.navigator?.product !== 'ReactNative') return new WebSocket(url);
  const RNWebSocket = WebSocket as unknown as new (u: string, p: undefined, o: { headers: Record<string, string> }) => WebSocket;
  return new RNWebSocket(url, undefined, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT } });
}

// --- Cook-plan parsing -------------------------------------------------------

type Json = Record<string, any>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function planTarget(plan: Json | undefined): { targetC: number | null; probeTargetC: number | null; mode: string | null; planId: number | null } {
  const food = plan?.food;
  const steps: Json[] = food?.plan?.steps ?? [];
  const idx = num(plan?.step_state?.step_index) ?? 0;
  const step = steps[idx] ?? steps[0];
  const t = num(step?.temperature_cavity);
  // exit_criteria: [{ type: "probe", target: { id: "left", value: <milli-°C> } }]
  const criteria: Json[] = Array.isArray(step?.exit_criteria) ? step.exit_criteria : [];
  const probe = criteria.map((c) => (c?.type === 'probe' ? num(c?.target?.value) : null)).find((v) => v !== null && v > 0) ?? null;
  return {
    targetC: t !== null && t > 0 ? t / 1000 : null,
    probeTargetC: probe !== null ? probe / 1000 : null,
    mode: typeof food?.name === 'string' ? food.name : null,
    planId: num(food?.plan?.id),
  };
}

// --- Live link ---------------------------------------------------------------

export class LiveOven implements OvenLink {
  readonly demo = false;
  private s = emptySnapshot();
  private subs = new Set<(s: OvenSnapshot) => void>();
  private ws: WebSocket | null = null;
  private orders = new OrderGenerator();
  private pending = new Map<number, (status: string | null) => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private keepalive: ReturnType<typeof setInterval> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private retry = 0;
  private stopped = true;
  private preheatDone = false;

  constructor(private p: Paired) {}

  snapshot() { return this.s; }
  subscribe(fn: (s: OvenSnapshot) => void) {
    this.subs.add(fn);
    return () => { this.subs.delete(fn); };
  }
  private set(patch: Partial<OvenSnapshot>) {
    this.s = { ...this.s, ...patch };
    this.s.phase = this.derivePhase();
    for (const fn of this.subs) fn(this.s);
  }

  private derivePhase(): Phase {
    const { active, cavityC, targetC, ended } = this.s;
    if (!active) return ended === 'completed' ? 'done' : 'idle';
    if (this.preheatDone) return 'cooking';
    if (cavityC !== null && targetC !== null && cavityC < targetC - 3) return 'preheating';
    return 'cooking';
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
    this.refreshStatus();
    this.poll = setInterval(() => this.refreshStatus(), 30_000);
  }

  stop() {
    this.stopped = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.keepalive) clearInterval(this.keepalive);
    if (this.poll) clearInterval(this.poll);
    this.keepalive = this.poll = null;
    this.ws?.close();
    this.ws = null;
    for (const resolve of this.pending.values()) resolve(null);
    this.pending.clear();
  }

  private connect() {
    if (this.stopped) return;
    this.set({ link: 'connecting' });
    const ws = openSocket(this.p.conn, this.p.accessToken);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.set({ link: 'online' });
      this.send(MC.Ping, {});
      this.keepalive = setInterval(() => this.send(MC.Ping, {}), 7000);
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') this.onFrame(ev.data);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      if (this.keepalive) clearInterval(this.keepalive);
      this.keepalive = null;
      this.ws = null;
      if (this.stopped) return;
      this.set({ link: 'offline' });
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.retry++, 5));
      this.timers.push(setTimeout(() => this.connect(), delay));
    };
    ws.onerror = () => ws.close();
  }

  private async refreshStatus() {
    try {
      const st = await rest<Json>(this.p.conn, 'GET', `/1/messaging/device/${this.p.oven.id}/status`, { token: this.p.accessToken });
      const ds = st.device_state?.data ?? st.device_state ?? st.device_state_data?.data;
      const plan = st.cook_plan?.data ?? st.cook_plan ?? st.cook_plan_data?.data;
      const patch: Partial<OvenSnapshot> = {
        ovenOnline: st.connection_state === 'connected' || st.connection_state === 'online' || st.online === true,
      };
      if (ds && typeof ds.state === 'string') patch.active = ds.state === 'active';
      if (plan && patch.active !== false) {
        const t = planTarget(plan);
        if (t.targetC !== null) patch.targetC = t.targetC;
        if (t.mode) patch.mode = t.mode;
        if (t.planId !== null) patch.planId = t.planId;
      }
      this.set(patch);
    } catch {
      if (this.s.link !== 'online') this.set({ ovenOnline: null });
    }
  }

  private onFrame(raw: string) {
    let f: Json;
    try { f = JSON.parse(raw); } catch { return; }
    const d: Json = f.data && typeof f.data === 'object' ? f.data : {};
    switch (f.message_code) {
      case MC.Ack: {
        const resolve = this.pending.get(d.request_order);
        if (resolve) { this.pending.delete(d.request_order); resolve(typeof d.status === 'string' ? d.status : 'failure'); }
        return;
      }
      case MC.CookingState: {
        const patch: Partial<OvenSnapshot> = { ovenOnline: true, active: true, ended: null };
        const cav = num(d.sensor_data?.cavity);
        if (cav !== null) patch.cavityC = cav / 1000;
        const probe = Array.isArray(d.sensor_data?.probe) ? d.sensor_data.probe.find((p: Json) => num(p?.value) !== null) : null;
        patch.probeC = probe ? probe.value / 1000 : null;
        const cs = d.cook_state_data;
        if (cs) {
          // Always 0–100 on the wire (0.99 is 1% of the preheat gap, not 99%).
          const pct = num(cs.progress?.percentage);
          patch.progress = pct === null ? null : Math.max(0, Math.min(1, pct / 100));
          patch.remainingMs = num(cs.cook_time_remaining);
          patch.remainingAt = Date.now();
          patch.elapsedMs = num(cs.cook_time_elapsed);
          if (cs.progress?.label_type === 'time') this.preheatDone = true;
        }
        if (d.cook_plan_data) {
          const t = planTarget(d.cook_plan_data);
          if (t.targetC !== null) patch.targetC = t.targetC;
          patch.probeTargetC = t.probeTargetC;
          if (t.mode) patch.mode = t.mode;
          if (t.planId !== null) patch.planId = t.planId;
        }
        this.set(patch);
        return;
      }
      case MC.CookPlanStarted: {
        const t = planTarget(d);
        this.preheatDone = false;
        this.set({ active: true, ended: null, targetC: t.targetC, probeTargetC: t.probeTargetC, mode: t.mode, planId: t.planId ?? 0 });
        return;
      }
      case MC.CookPlanEnded:
        this.preheatDone = false;
        this.set({ active: false, ended: d.type === 'completed' ? 'completed' : 'cancelled', progress: null, remainingMs: null, probeTargetC: null, offer: null });
        return;
      case MC.DeviceState:
        if (d.state === 'idle') this.preheatDone = false;
        this.set({ active: d.state === 'active', ovenOnline: true });
        return;
      case MC.Notification:
        if (d.notification_id === 'NOTIFICATION_PREHEAT_COMPLETE') { this.preheatDone = true; this.set({}); }
        if (d.notification_id === 'NOTIFICATION_COOK_COMPLETE') this.set({ ended: 'completed' });
        return;
      case MC.VideoFrame:
        if (typeof d.image_url === 'string') this.set({ imageUrl: rehomeMediaUrl(this.p.conn, d.image_url), imageAt: Date.now() });
        return;
      case 10033:
        this.set({ offer: { type: d.type === 'keep_shorter' ? 'keep_shorter' : 'keep_longer', durationMs: num(d.duration) ?? 0 } });
        return;
      case 10034:
        this.set({ offer: null });
        return;
    }
  }

  private send(code: number, data: Record<string, unknown>): number | null {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return null;
    const order = this.orders.next();
    ws.send(buildSignedFrame(
      { deviceId: this.p.deviceId, deviceName: this.p.deviceName, ovenId: this.p.oven.id, signSeedHex: this.p.keys.signSeedHex },
      code, data, order,
    ));
    return order;
  }

  /** Send a signed command and wait for the oven's acknowledgement. */
  private command(code: number, data: Record<string, unknown>, timeoutMs = 10_000): Promise<string | null> {
    const order = this.send(code, data);
    if (order === null) return Promise.reject(new OvenError("Not connected to the oven yet. Check the phone is on your home Wi-Fi."));
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.pending.delete(order); resolve(null); }, timeoutMs);
      this.pending.set(order, (status) => { clearTimeout(t); resolve(status); });
    });
  }

  private async must(code: number, data: Record<string, unknown>, ok: string[] = ['success']) {
    const status = await this.command(code, data);
    if (!status || !ok.includes(status)) throw ackError(status);
  }

  async preheat(mode: string, tempC: number) {
    this.preheatDone = false;
    await this.must(MC.Preheat, { primitive_type: mode, temperature_cavity: Math.round(tempC * 1000) });
    this.set({ active: true, ended: null, mode, targetC: tempC });
  }

  async cancel() {
    await this.must(MC.Cancel, { plan_id: this.s.planId }, ['success', 'not-allowed']);
    this.preheatDone = false;
    this.set({ active: false, ended: 'cancelled', progress: null, remainingMs: null, probeTargetC: null });
  }

  async setTemperature(tempC: number) {
    const status = await this.command(MC.SetCavityTemp, { plan_id: this.s.planId, temperature_cavity: Math.round(tempC * 1000) });
    if (status === 'success') { this.set({ targetC: tempC }); return; }
    // Some firmware rejects a live change; restart the cook at the new temperature,
    // as the Home Assistant integration does. Only after a definite refusal (a
    // timeout may still have applied it), and only for a cook the phone can start
    // again: 11002 cooks run as plan 0, while touchscreen programs such as proof
    // (plan 114) share a mode name but can't be restarted from here.
    const mode = this.s.mode;
    if (status === null || !mode || this.s.planId !== 0 || !MODES.some((m) => m.id === mode)) throw ackError(status);
    await this.cancel();
    await new Promise((r) => setTimeout(r, 400));
    await this.preheat(mode, tempC);
  }

  async setTimer(ms: number) {
    await this.must(MC.SetTimer, { plan_id: this.s.planId, duration: Math.round(ms) });
    this.set({ remainingMs: ms, remainingAt: Date.now() });
  }

  async keepCooking() { await this.must(MC.KeepCooking, {}); }

  async respondToOffer(accept: boolean) {
    await this.must(11035, { action: accept ? 'accept' : 'dismiss' });
    this.set({ offer: null });
  }

  watchCamera(onFrame: (uri: string) => void): () => void {
    const ctl = new AbortController();
    let stopPolling: (() => void) | null = null;
    const headers = { Authorization: `Bearer ${this.p.accessToken}`, 'User-Agent': USER_AGENT };
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Prefer june-local's MJPEG stream: one download per new picture, and the
    // server turns the camera and light off ~15 s after it closes. Reconnect
    // when it drops; after two attempts in a row with no picture, or on a
    // server without the stream, fall back to fetching stills.
    (async () => {
      let misses = 0;
      while (!ctl.signal.aborted) {
        let got = false;
        try {
          await readMjpeg(urls(this.p.conn).stream, {
            headers, signal: ctl.signal,
            onFrame: (jpeg) => { got = true; misses = 0; onFrame(`data:image/jpeg;base64,${toB64(jpeg)}`); },
          });
        } catch (e) {
          if (ctl.signal.aborted) return;
          if (e instanceof NotAStreamError) break;
        }
        if (!got && ++misses >= 2) break;
        await wait(2000);
      }
      if (!ctl.signal.aborted) stopPolling = this.pollStills(onFrame);
    })();

    return () => { ctl.abort(); stopPolling?.(); };
  }

  /** Fallback live view: keep the camera awake and fetch the latest still once a second (its cadence). */
  private pollStills(onFrame: (uri: string) => void): () => void {
    const on = () => rest(this.p.conn, 'POST', '/internal/camera/on?seconds=120', { token: this.p.accessToken }).catch(() => {});
    on();
    const wake = setInterval(on, 100_000);
    const pull = setInterval(() => onFrame(`${urls(this.p.conn).latestImage}?ts=${Date.now()}`), 1000);
    return () => {
      clearInterval(wake);
      clearInterval(pull);
      // Turns the interior light off too, which follows the camera.
      rest(this.p.conn, 'POST', '/internal/camera/off', { token: this.p.accessToken }).catch(() => {});
    };
  }

  async unpair() {
    await this.command(MC.Unpair, {}, 4000).catch(() => null);
    await rest(this.p.conn, 'POST', `/2/devices/${this.p.deviceId}/dissociate`, { token: this.p.accessToken }).catch(() => {});
  }
}
