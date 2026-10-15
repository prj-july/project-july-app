// A cook the phone will start later: one pending start per oven. The oven is
// not told until the time arrives (and this phone can reach it).

import { cookSummary, type Unit } from './modes';

export const MAX_DELAY_MIN = 12 * 60;
export const AUTO_START_GRACE_MS = 15 * 60_000;
/** Quick choices on the review: 15 min, 30 min, 1 hr, 2 hr, 4 hr. */
export const DELAYS_MIN = [15, 30, 60, 120, 240];

export type ScheduledCook = {
  ovenId: string;
  mode: string;
  tempF: number;
  plan?: number;
  timerMin: number;
  startAt: number;
  createdAt: number;
};

export type ScheduleDecision = 'wait' | 'start' | 'hold' | 'ask';

export type OvenGate = { active: boolean; connected: boolean };

/** Minutes from now, 1 to 12 hours. Null if it isn't a delay. */
export function fromDelayMin(now: number, min: number): number | null {
  if (!Number.isFinite(min) || min < 1) return null;
  const clamped = Math.min(MAX_DELAY_MIN, Math.max(1, Math.round(min)));
  return now + clamped * 60_000;
}

export function delayLabel(min: number): string {
  const n = Math.max(0, Math.round(min));
  if (n < 60) return `${Math.max(1, n)} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (!m) return h === 1 ? '1 hr' : `${h} hr`;
  return `${h} hr ${m} min`;
}

export function startsAtLabel(startAt: number): string {
  return new Date(startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function startsIn(startAt: number, now: number): string {
  const sec = Math.max(0, Math.round((startAt - now) / 1000));
  if (sec < 60) return 'less than a minute';
  return delayLabel(sec / 60);
}

/**
 * What to do with a pending start. Offline or a running cook holds even after
 * the grace window; a missed start on an idle, reachable oven asks first.
 */
export function decide(s: ScheduledCook, now: number, oven: OvenGate): ScheduleDecision {
  if (now < s.startAt) return 'wait';
  if (!oven.connected || oven.active) return 'hold';
  if (now - s.startAt > AUTO_START_GRACE_MS) return 'ask';
  return 'start';
}

export function setFor(all: Record<string, ScheduledCook>, s: ScheduledCook): Record<string, ScheduledCook> {
  return { ...all, [s.ovenId]: s };
}

export function clearFor(all: Record<string, ScheduledCook>, ovenId: string): Record<string, ScheduledCook> {
  if (!(ovenId in all)) return all;
  const next = { ...all };
  delete next[ovenId];
  return next;
}

export function scheduleSummary(s: Pick<ScheduledCook, 'mode' | 'tempF' | 'plan'>, unit: Unit): string {
  return cookSummary(s.mode, s.tempF, s.plan, unit);
}

export type BannerKind = 'wait' | 'hold' | 'start' | 'ask';

export function bannerCopy(s: ScheduledCook, now: number, oven: OvenGate, unit: Unit): {
  kind: BannerKind; title: string; body: string;
} {
  const summary = scheduleSummary(s, unit);
  const at = startsAtLabel(s.startAt);
  const kind = decide(s, now, oven);
  if (kind === 'wait') {
    return { kind, title: `${summary} starts at ${at}`, body: `In ${startsIn(s.startAt, now)}. Nothing heats until then.` };
  }
  if (kind === 'start') {
    return { kind, title: `Starting ${summary}`, body: 'Sending to the oven…' };
  }
  if (kind === 'ask') {
    return { kind, title: `${summary} was due at ${at}`, body: 'The oven did not start. Start now, or cancel.' };
  }
  return {
    kind,
    title: `${summary} starts at ${at}`,
    body: !oven.connected
      ? 'Waiting until this phone can reach the oven.'
      : 'Waiting until the oven is free.',
  };
}

export function ovenGate(s: { active: boolean; link: string; ovenOnline: boolean | null }): OvenGate {
  return { active: s.active, connected: s.link === 'online' && s.ovenOnline !== false };
}
