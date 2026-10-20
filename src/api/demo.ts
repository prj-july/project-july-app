// A simulated oven so people can try the app (and designers can review it)
// without an oven on the network. Always labelled "Demo" in the UI.
import { emptySnapshot, OvenError, type OvenLink, type OvenSnapshot, type Phase } from './client';

const AMBIENT_C = 21;
const MIN = 60_000;

/** States the demo can start in, for previewing screens (web dev builds: `?demo=cooking`). */
export const DEMO_SCENES = ['off', 'preheat', 'ready', 'cooking', 'probe', 'done', 'offline'] as const;
export type DemoScene = (typeof DEMO_SCENES)[number];

export class DemoOven implements OvenLink {
  readonly demo = true;
  private s: OvenSnapshot = { ...emptySnapshot(), link: 'online', ovenOnline: true, cavityC: AMBIENT_C, statusAt: Date.now() };
  private subs = new Set<(s: OvenSnapshot) => void>();
  private tick: ReturnType<typeof setInterval> | null = null;
  private preheated = false;
  private startedAt = 0;

  constructor(scene: DemoScene = 'off') {
    const now = Date.now();
    const bake = { active: true, mode: 'bake', targetC: 204.4, planId: 1, imageUrl: 'demo', imageAt: now };
    if (scene === 'preheat') this.s = { ...this.s, ...bake, cavityC: 160, progress: 0.75 };
    if (scene === 'ready' || scene === 'cooking' || scene === 'probe') {
      this.preheated = true;
      this.startedAt = now - 7.5 * MIN;
      this.s = { ...this.s, ...bake, cavityC: 204.4, progress: 0, elapsedMs: 7.5 * MIN };
      if (scene === 'cooking') this.s = { ...this.s, remainingMs: 12.5 * MIN, remainingAt: now };
      if (scene === 'probe') this.s = { ...this.s, mode: 'roast', targetC: 176.7, probeC: 55 };
    }
    if (scene === 'done') this.s = { ...this.s, mode: 'bake', ended: 'completed', endedAt: now - 2 * MIN, imageUrl: 'demo', imageAt: now - 2 * MIN, cavityC: 150, probeC: 63 };
    if (scene === 'offline') this.s = { ...this.s, ...bake, link: 'offline', ovenOnline: false, cavityC: 198, imageAt: now - 3 * MIN };
    this.s.phase = this.phase();
  }

  snapshot() { return this.s; }
  subscribe(fn: (s: OvenSnapshot) => void) {
    this.subs.add(fn);
    return () => { this.subs.delete(fn); };
  }
  private set(patch: Partial<OvenSnapshot>) {
    this.s = { ...this.s, ...patch };
    this.s.phase = this.phase();
    for (const fn of this.subs) fn(this.s);
  }
  private phase(): Phase {
    if (!this.s.active) return this.s.ended === 'completed' ? 'done' : 'idle';
    return this.preheated ? 'cooking' : 'preheating';
  }

  start() {
    if (this.tick) return;
    this.tick = setInterval(() => this.step(), 1000);
  }
  stop() {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
  }

  private step() {
    // An offline oven sends nothing: its last values stay as they were.
    if (this.s.link === 'offline') return;
    const { active, cavityC, targetC, remainingMs, remainingAt } = this.s;
    const cav = cavityC ?? AMBIENT_C;
    if (!active || targetC === null) {
      if (cav > AMBIENT_C + 0.5) this.set({ cavityC: cav - Math.max(0.6, (cav - AMBIENT_C) * 0.03) });
      return;
    }
    const patch: Partial<OvenSnapshot> = { imageAt: Date.now() };
    if (!this.preheated) {
      const next = Math.min(targetC, cav + 7 + Math.random());
      patch.cavityC = next;
      patch.progress = Math.min(1, (next - AMBIENT_C) / (targetC - AMBIENT_C));
      if (next >= targetC - 0.5) { this.preheated = true; this.startedAt = Date.now(); patch.progress = 0; }
    } else {
      patch.cavityC = targetC + Math.sin(Date.now() / 9000) * 1.2;
      patch.elapsedMs = Date.now() - this.startedAt;
      if (remainingMs !== null) {
        const left = remainingMs - (Date.now() - remainingAt);
        if (left <= 0) {
          this.preheated = false;
          this.set({ active: false, ended: 'completed', endedAt: Date.now(), remainingMs: null, progress: null });
          return;
        }
      }
    }
    this.set(patch);
  }

  private async wait() { await new Promise((r) => setTimeout(r, 350)); }

  async preheat(mode: string, tempC: number) {
    await this.wait();
    this.preheated = false;
    this.set({ active: true, ended: null, mode, targetC: tempC, planId: 1, progress: 0, remainingMs: null, elapsedMs: null, imageUrl: 'demo' });
  }
  async cancel() {
    await this.wait();
    this.preheated = false;
    this.set({ active: false, ended: 'cancelled', progress: null, remainingMs: null, elapsedMs: null, imageUrl: null });
  }
  async setTemperature(tempC: number) {
    await this.wait();
    if (tempC > (this.s.cavityC ?? 0) + 3) this.preheated = false;
    this.set({ targetC: tempC });
  }
  async setTimer(ms: number) {
    await this.wait();
    if (!this.s.active) throw new OvenError('Start a cook first, then set a timer.');
    this.set({ remainingMs: ms, remainingAt: Date.now() });
  }
  async keepCooking() { await this.wait(); }
  async respondToOffer() { await this.wait(); this.set({ offer: null }); }
  watchCamera() {
    const frame = () => this.set({ imageUrl: 'demo', imageAt: Date.now() });
    frame();
    const t = setInterval(frame, 1000);
    return () => clearInterval(t);
  }
  async unpair() {}
}
