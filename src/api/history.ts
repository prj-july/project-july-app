// Cooks this phone has seen: started from here, or picked up from the oven's
// live state. Newest first. Capped per oven so the store stays small.

import { MODES, cToF, cookSummary, isFixed, type Unit } from './modes';

export const HISTORY_CAP = 50;
/** A phone start and the oven going active can land a few seconds apart. */
export const MERGE_MS = 8_000;

/** `ended`: the oven was found idle without seeing how the cook ended (the app was closed). */
export type HistoryOutcome = 'running' | 'completed' | 'cancelled' | 'ended';

export type HistoryEntry = {
  id: string;
  ovenId: string;
  mode: string;
  tempF: number;
  plan?: number;
  timerMin?: number;
  startedAt: number;
  endedAt?: number;
  outcome: HistoryOutcome;
};

export type HistoryStart = {
  ovenId: string;
  mode: string;
  tempF: number;
  plan?: number;
  timerMin?: number;
  at: number;
};

/** Enough of a live snapshot to open or close a history row. */
export type LiveCook = {
  active: boolean;
  ended: 'completed' | 'cancelled' | null;
  mode: string | null;
  targetC: number | null;
  /** How long the running cook has gone, when the oven says. */
  elapsedMs?: number | null;
  /** When the end was reported, in this app's clock. */
  endedAt?: number | null;
  /** When the oven last reported its state; null while that may be stale. */
  statusAt?: number | null;
};

export type HistoryDay = { key: string; label: string; entries: HistoryEntry[] };

function newId(start: HistoryStart): string {
  return `${start.ovenId}:${start.at}:${start.mode}`;
}

function capOven(list: HistoryEntry[], ovenId: string): HistoryEntry[] {
  let n = 0;
  return list.filter((e) => {
    if (e.ovenId !== ovenId) return true;
    n += 1;
    return n <= HISTORY_CAP;
  });
}

/** °F on the oven's 5° steps, or the mode's own temperature when the oven sets it. */
export function liveTempF(mode: string, targetC: number | null): number {
  const m = MODES.find((x) => x.id === mode || mode.startsWith(x.id));
  if (m && isFixed(m)) return m.minF;
  if (targetC === null) return m?.defaultF ?? 0;
  return Math.round(cToF(targetC) / 5) * 5;
}

/**
 * Record a cook this phone started. If the oven already reported the same cook
 * (a running row for this oven a few seconds old), fill that row in rather than
 * adding a second one.
 */
export function beginCook(list: HistoryEntry[], start: HistoryStart, id?: string): HistoryEntry[] {
  const running = list.find((e) => e.ovenId === start.ovenId && e.outcome === 'running');
  if (running && Math.abs(start.at - running.startedAt) < MERGE_MS) {
    return list.map((e) => (e.id === running.id ? {
      ...e,
      mode: start.mode,
      tempF: start.tempF,
      plan: start.plan ?? e.plan,
      timerMin: start.timerMin ?? e.timerMin,
    } : e));
  }
  const rest = list.map((e) => (
    e.ovenId === start.ovenId && e.outcome === 'running'
      ? { ...e, outcome: 'cancelled' as const, endedAt: start.at }
      : e
  ));
  const entry: HistoryEntry = {
    id: id ?? newId(start),
    ovenId: start.ovenId,
    mode: start.mode,
    tempF: start.tempF,
    ...(start.plan !== undefined ? { plan: start.plan } : {}),
    ...(start.timerMin ? { timerMin: start.timerMin } : {}),
    startedAt: start.at,
    outcome: 'running',
  };
  return capOven([entry, ...rest], start.ovenId);
}

/**
 * Follow the oven: open a row when a cook starts there, close the running row
 * when it finishes or is stopped. Same-array when nothing changed.
 */
export function noteLive(list: HistoryEntry[], ovenId: string, live: LiveCook, at: number): HistoryEntry[] {
  const running = list.find((e) => e.ovenId === ovenId && e.outcome === 'running');
  if (live.active) {
    if (running || !live.mode) return list;
    // A cook found already going (the app just opened) started when the oven says.
    const elapsed = live.elapsedMs && live.elapsedMs > 0 ? live.elapsedMs : 0;
    return beginCook(list, {
      ovenId,
      mode: live.mode,
      tempF: liveTempF(live.mode, live.targetC),
      at: at - elapsed,
    });
  }
  if (!running) return list;
  if (live.ended === 'completed' || live.ended === 'cancelled') {
    const endedAt = live.endedAt && live.endedAt >= running.startedAt ? live.endedAt : at;
    return list.map((e) => (e.id === running.id ? { ...e, outcome: live.ended!, endedAt } : e));
  }
  // Idle by a report from after the start, with no end seen: it ended while the app
  // wasn't listening. (A report within MERGE_MS of a start may predate it.)
  if (live.statusAt && live.statusAt - running.startedAt > MERGE_MS) {
    return list.map((e) => (e.id === running.id ? { ...e, outcome: 'ended' as const } : e));
  }
  return list;
}

export function dropOven(list: HistoryEntry[], ovenId: string): HistoryEntry[] {
  return list.filter((e) => e.ovenId !== ovenId);
}

export function forOven(list: HistoryEntry[], ovenId: string): HistoryEntry[] {
  return list.filter((e) => e.ovenId === ovenId);
}

/** Params Repeat uses to open the start review with this cook filled in. */
export function cookParams(e: Pick<HistoryEntry, 'mode' | 'tempF' | 'plan' | 'timerMin'>): {
  mode: string; temp: string; plan?: string; timer?: string;
} {
  const params: { mode: string; temp: string; plan?: string; timer?: string } = { mode: e.mode, temp: String(e.tempF) };
  if (e.plan !== undefined) params.plan = String(e.plan);
  if (e.timerMin && e.timerMin > 0) params.timer = String(e.timerMin);
  return params;
}

export function entrySummary(e: Pick<HistoryEntry, 'mode' | 'tempF' | 'plan'>, unit: Unit): string {
  return cookSummary(e.mode, e.tempF, e.plan, unit);
}

/** Local calendar day, independent of DST as long as we stay in one zone. */
export function dayNumber(t: number): number {
  return Math.floor((t - new Date(t).getTimezoneOffset() * 60_000) / 86_400_000);
}

export function dayLabel(at: number, now: number): string {
  const days = dayNumber(now) - dayNumber(at);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return new Date(at).toLocaleDateString(undefined, { weekday: 'long' });
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function whenLabel(at: number, now: number): string {
  const time = new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = dayNumber(now) - dayNumber(at);
  if (days <= 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  if (days < 7) return `${new Date(at).toLocaleDateString([], { weekday: 'long' })} ${time}`;
  return new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Elapsed time in words: "12 min", "1 hr 5 min". */
export function cookLength(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function outcomeLabel(outcome: HistoryOutcome): string {
  if (outcome === 'running') return 'Cooking';
  if (outcome === 'completed') return 'Finished';
  if (outcome === 'ended') return 'Ended';
  return 'Stopped';
}

export function entryLine(e: HistoryEntry, now: number): string {
  const when = whenLabel(e.startedAt, now);
  if (e.outcome === 'running') return `${when} · cooking`;
  const outcome = outcomeLabel(e.outcome).toLowerCase();
  const dur = e.endedAt && e.endedAt > e.startedAt ? cookLength(e.endedAt - e.startedAt) : null;
  return dur ? `${when} · ${dur} · ${outcome}` : `${when} · ${outcome}`;
}

/** A few past cooks so the demo's history screen isn't empty. */
export function demoSample(ovenId: string, now: number): HistoryEntry[] {
  return [
    { id: `${ovenId}:sample:roast`, ovenId, mode: 'roast', tempF: 400, startedAt: now - 26 * 3_600_000, endedAt: now - 25 * 3_600_000, outcome: 'completed' },
    { id: `${ovenId}:sample:bake`, ovenId, mode: 'bake', tempF: 350, timerMin: 45, startedAt: now - 2 * 3_600_000, endedAt: now - 1 * 3_600_000, outcome: 'completed' },
    { id: `${ovenId}:sample:toast`, ovenId, mode: 'toast', tempF: 500, plan: 4, startedAt: now - 3 * 86_400_000, endedAt: now - 3 * 86_400_000 + 5 * 60_000, outcome: 'cancelled' },
  ];
}

export function groupByDay(list: HistoryEntry[], ovenId: string, now: number): HistoryDay[] {
  const days: HistoryDay[] = [];
  const entries = forOven(list, ovenId).slice().sort((a, b) => b.startedAt - a.startedAt);
  for (const e of entries) {
    const key = String(dayNumber(e.startedAt));
    const last = days[days.length - 1];
    if (last && last.key === key) last.entries.push(e);
    else days.push({ key, label: dayLabel(e.startedAt, now), entries: [e] });
  }
  return days;
}
