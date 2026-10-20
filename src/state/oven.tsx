import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { LiveOven, OvenError, emptySnapshot, type OvenLink, type OvenSnapshot, type Paired } from '@/api/client';
import { DEMO_SCENES, DemoOven, type DemoScene } from '@/api/demo';
import type { Connection } from '@/api/endpoint';
import { beginCook, demoSample, dropOven, noteLive, type HistoryEntry } from '@/api/history';
import { MODES, fToC, type Unit } from '@/api/modes';
import { clearFor, decide, dropStale, failFor, ovenGate, setFor, type ScheduledCook } from '@/api/schedule';
import { applyTrust, hasTrust, type Trust } from '@/api/trust';
import { tell } from '@/components/ui';
import { load, remove, save } from './storage';

/** The paired ovens' ids, in pairing order. Each one's pairing is under ovenKey(id). */
const OVENS_KEY = 'july.ovens.v1';
/**
 * One pairing per key: a pairing holds keys and tokens, and some iOS releases refuse
 * keystore values over about 2 KB, so the list can't share one value.
 */
const OVEN_KEY_PREFIX = 'july.oven.v1.';
/** The oven the home screen shows first, and Settings, Start a cook and Live view act on. */
const CURRENT_KEY = 'july.current.v1';
/** Before several ovens: the one pairing. Moved into OVENS_KEY on load. */
const OLD_PAIRED_KEY = 'july.paired.v1';
const PREFS_KEY = 'july.prefs.v1';
const USES_KEY = 'july.uses.v1';
/** Certificate trust per oven host (a home CA, or opt-in no checks). */
const TRUST_KEY = 'july.trust.v1';
/** One pending delayed start per oven. Demo ovens stay in memory. */
const SCHEDULE_KEY = 'july.schedule.v1';

/** Keystore keys allow letters, digits, '.', '-' and '_' only; anything else is spelled out. */
function ovenKey(id: string): string {
  return OVEN_KEY_PREFIX + id.replace(/[^A-Za-z0-9.-]/g, (ch) => `_${ch.charCodeAt(0).toString(16)}_`);
}

/**
 * Display choices. The home screen ones follow the Home Assistant card's own Settings
 * (july-oven-card.js): camera frame rate, the name tucking into the icon, the clock
 * and the mode order. (The oven's icon is not a choice here: always the June oven.)
 */
export type Prefs = {
  unit: Unit;
  /** Pictures per second in the camera window. */
  cameraFps: number;
  /** Tuck the oven's name into its icon 5 s after the home screen appears. */
  hideName: boolean;
  clock: 'auto' | '12' | '24';
  /** Mode tiles in the oven's order, or most used first. */
  modeOrder: 'oven' | 'used';
  /** The stored shape: 2 from the 15 fps default on (older saves have none). */
  version: number;
};

/**
 * As on the card (v0.4.4): 1 fps is the stock June app's rate. The oven sends about
 * one new still a second, so faster rates mostly re-fetch it; they only apply while
 * the camera window or Live view is open.
 */
export const CAMERA_FPS = [1, 5, 10, 15];
const DEFAULT_PREFS: Prefs = { unit: 'F', cameraFps: 15, hideName: true, clock: 'auto', modeOrder: 'oven', version: 2 };

/** Cooks started from this phone, per mode. Kept apart from the settings, so Reset keeps them. */
export type Uses = Record<string, number>;

/** The last cook started from this phone, for Repeat on the home screen. */
/** `plan`: the toast level or grill heat (11002 plan_index), for modes that have plans. */
export type LastCook = { mode: string; tempF: number; plan?: number; at: number };
/** Last cook per oven id (paired ovens only; the demo's are kept in memory). */
const LAST_COOKS_KEY = 'july.lastcooks.v1';
/** Before several ovens: the one last cook. Moved to the first oven on load. */
const OLD_LAST_KEY = 'july.last.v1';
/** Cooks this phone has seen, newest first. Demo ovens stay in memory. */
const HISTORY_KEY = 'july.history.v1';

/** One paired oven (or a demo oven, whose `paired` is null). */
export type OvenEntry = { id: string; name: string; paired: Paired | null; link: OvenLink };

type Ctx = {
  ready: boolean;
  /** Every oven, in pairing order (the demo's ovens while in the demo). */
  ovens: OvenEntry[];
  /** The oven the home pager shows; Settings, Start a cook and Live view act on it. */
  currentId: string | null;
  /** Show this oven (remembered across launches). */
  select(id: string): void;
  /** The current oven's pairing (null for a demo oven). */
  paired: Paired | null;
  /** The current oven's link; null when there are no ovens (the Welcome screen). */
  link: OvenLink | null;
  /** The current oven's live state. */
  snap: OvenSnapshot;
  prefs: Prefs;
  setUnit(unit: Unit): void;
  setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void;
  /** Put the home screen choices back; units are kept. */
  resetPrefs(): void;
  uses: Uses;
  /** Count a cook started from this phone (on a successful start only). */
  countUse(mode: string): void;
  /** The current oven's last cook. */
  lastCook: LastCook | null;
  /** Last cook per oven id, for Repeat on each oven's page. */
  lastCooks: Record<string, LastCook>;
  /** Remember a cook an oven accepted (the current one unless `ovenId`), for Repeat and the history. */
  recordCook(mode: string, tempF: number, plan?: number, opts?: { timerMin?: number; ovenId?: string }): void;
  /** Cooks this phone has seen, newest first (every oven). */
  history: HistoryEntry[];
  /** Drop the current oven's history from this phone. */
  clearHistory(): void;
  /** The current oven's pending delayed start, if any. */
  scheduled: ScheduledCook | null;
  /** Pending delayed starts, keyed by oven id. */
  schedules: Record<string, ScheduledCook>;
  /** Remember a cook to start later on the current oven (replaces a previous one). */
  scheduleCook(cook: Omit<ScheduledCook, 'ovenId' | 'createdAt'>): void;
  /** Drop the current oven's delayed start, or a named oven's. */
  cancelSchedule(ovenId?: string): void;
  /** Start a delayed cook now (the current oven if `ovenId` is omitted). */
  startScheduled(ovenId?: string): Promise<void>;
  trusts: Record<string, Trust>;
  /** Trust `host`'s certificate this way from now on (saved), or only as the phone does (null). */
  setHostTrust(host: string, trust: Trust | null): void;
  /** Reach the current oven another way (HTTPS or the plain port), e.g. after a certificate change. */
  updateConnection(conn: Connection): Promise<void>;
  /** Add a newly paired oven (or replace the same oven's old pairing), show it, and leave the demo. */
  completePairing(p: Paired): Promise<void>;
  startDemo(): void;
  /** Unpair and remove the current oven (in the demo: leave the demo). */
  forget(): Promise<void>;
};

const OvenContext = createContext<Ctx | null>(null);
const EMPTY = emptySnapshot();
const noSubscribe = () => () => {};

function entryFor(p: Paired): OvenEntry {
  return { id: p.oven.id, name: p.oven.name, paired: p, link: new LiveOven(p) };
}

/** Extra ovens for reviewing the home pager (web dev builds: `?demo&ovens=3`). */
const DEMO_NAMES = ['Demo oven', 'Garage oven', 'Studio oven', 'Cabin oven', 'Office oven'];

function demoEntries(scene: DemoScene, count: number): OvenEntry[] {
  const n = Math.max(1, Math.min(DEMO_NAMES.length, Math.floor(count) || 1));
  return DEMO_NAMES.slice(0, n).map((name, i) => ({
    id: i === 0 ? 'demo' : `demo-${i + 1}`,
    name,
    paired: null,
    link: new DemoOven(i === 0 ? scene : 'off'),
  }));
}

/** Web dev builds only: `?demo=<scene>&ovens=<n>` from the address bar. */
function demoParams(): { scene: DemoScene; count: number } | null {
  if (!__DEV__ || Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const scene = q.get('demo');
  if (scene === null) return null;
  return { scene: DEMO_SCENES.find((d) => d === scene) ?? 'off', count: Number(q.get('ovens') ?? 1) };
}

/** Load the paired ovens, moving a single pairing from before several ovens into the list. */
async function loadPaired(): Promise<Paired[]> {
  const ids = await load<string[]>(OVENS_KEY);
  if (ids) {
    const all = await Promise.all(ids.map((id) => load<Paired>(ovenKey(id))));
    return all.filter((p): p is Paired => !!p);
  }
  const old = await load<Paired>(OLD_PAIRED_KEY);
  if (!old) return [];
  try {
    await save(ovenKey(old.oven.id), old);
    await save(OVENS_KEY, [old.oven.id]);
    await remove(OLD_PAIRED_KEY);
  } catch {}
  return [old];
}

/** After an unanswered start: whether the oven reports a cook within `ms`. */
async function becomesActive(link: OvenLink, ms = 10_000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (link.snapshot().active) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return link.snapshot().active;
}

/** A timer for a cook just started, giving the oven a few chances to report the cook's plan. */
async function setTimerPatiently(link: OvenLink, ms: number, tries = 3): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await link.setTimer(ms);
      return;
    } catch (e) {
      if (i >= tries || !(e instanceof OvenError && e.code === 'no-plan')) throw e;
    }
  }
}

export function OvenProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  /** Paired ovens, in pairing order. */
  const [real, setReal] = useState<OvenEntry[]>([]);
  const realRef = useRef<OvenEntry[]>([]);
  const [realCurrent, setRealCurrent] = useState<string | null>(null);
  /** The demo's ovens while in the demo; null otherwise. */
  const [demo, setDemo] = useState<OvenEntry[] | null>(null);
  const [demoCurrent, setDemoCurrent] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [uses, setUses] = useState<Uses>({});
  const [lastCooks, setLastCooks] = useState<Record<string, LastCook>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [schedules, setSchedules] = useState<Record<string, ScheduledCook>>({});
  const [trusts, setTrusts] = useState<Record<string, Trust>>({});

  const setRealList = useCallback((next: OvenEntry[]) => {
    realRef.current = next;
    setReal(next);
  }, []);

  useEffect(() => {
    (async () => {
      const [list, cur, pr, u, tr, lc, oldLast, hist, sched] = await Promise.all([
        loadPaired(), load<string>(CURRENT_KEY), load<Partial<Prefs>>(PREFS_KEY), load<Uses>(USES_KEY),
        load<Record<string, Trust>>(TRUST_KEY), load<Record<string, LastCook>>(LAST_COOKS_KEY), load<LastCook>(OLD_LAST_KEY),
        load<HistoryEntry[]>(HISTORY_KEY), load<Record<string, ScheduledCook>>(SCHEDULE_KEY),
      ]);
      if (pr) {
        const next = { ...DEFAULT_PREFS, ...pr };
        // Saves from before the 15 fps default carry the old default (1), stored with
        // everything else: start them at 15 too. Not released then, so no one chose it.
        if ((pr.version ?? 1) < 2) { next.cameraFps = DEFAULT_PREFS.cameraFps; next.version = 2; save(PREFS_KEY, next); }
        // Anything off the list moves to the nearest choice.
        if (!CAMERA_FPS.includes(next.cameraFps)) next.cameraFps = CAMERA_FPS.reduce((a, b) => (Math.abs(b - next.cameraFps) < Math.abs(a - next.cameraFps) ? b : a));
        setPrefs(next);
      }
      if (u) setUses(u);
      // The last cook from before several ovens belongs to the first (then only) oven.
      let cooks = lc ?? {};
      if (oldLast) {
        if (list[0] && !cooks[list[0].oven.id]) {
          cooks = { ...cooks, [list[0].oven.id]: oldLast };
          save(LAST_COOKS_KEY, cooks).catch(() => {});
        }
        remove(OLD_LAST_KEY).catch(() => {});
      }
      setLastCooks(cooks);
      let nextHist = hist ?? [];
      if (sched) {
        // A start missed by hours (the app was closed) is dropped, not offered.
        const fresh = dropStale(sched, Date.now());
        if (fresh !== sched) save(SCHEDULE_KEY, fresh).catch(() => {});
        setSchedules(fresh);
      }
      // Before the oven links start, so their first requests already trust the home CA.
      if (tr) {
        for (const [host, t] of Object.entries(tr)) { try { applyTrust(host, t); } catch {} }
        setTrusts(tr);
      }
      if (list.length) {
        setRealList(list.map(entryFor));
        setRealCurrent(cur);
      } else {
        // Web dev builds only: ?demo opens straight into the demo oven, for previewing
        // screens; ?demo=cooking (or preheat, ready, probe, done, offline) starts it
        // there, and &ovens=3 adds more (idle) ovens for the home pager.
        const d = demoParams();
        if (d) {
          const entries = demoEntries(d.scene, d.count);
          setDemo(entries);
          nextHist = [...demoSample(entries[0].id, Date.now()), ...nextHist];
        }
      }
      setHistory(nextHist);
      setReady(true);
    })();
  }, [setRealList]);

  const ovens = demo ?? real;
  const chosen = demo ? demoCurrent : realCurrent;
  const current = ovens.find((o) => o.id === chosen) ?? ovens[0] ?? null;
  const currentId = current?.id ?? null;
  const paired = current?.paired ?? null;
  const link = current?.link ?? null;
  const snap = useSnapshot(link);
  const lastCook = (currentId && lastCooks[currentId]) || null;
  const scheduled = (currentId && schedules[currentId]) || null;

  // Every shown oven's link runs while the app is in the foreground, so each page of
  // the home screen is live. A link is started once and stopped when its oven goes.
  const running = useRef(new Set<OvenLink>());
  const foreground = useRef(true);
  const links = useMemo(() => ovens.map((o) => o.link), [ovens]);
  useEffect(() => {
    const want = new Set(links);
    for (const l of running.current) if (!want.has(l)) { l.stop(); running.current.delete(l); }
    for (const l of want) if (!running.current.has(l)) { running.current.add(l); if (foreground.current) l.start(); }
  }, [links]);
  useEffect(() => {
    const all = running.current;
    const sub = AppState.addEventListener('change', (st) => {
      foreground.current = st === 'active';
      for (const l of all) { if (foreground.current) l.start(); else l.stop(); }
    });
    return () => { sub.remove(); for (const l of all) l.stop(); all.clear(); };
  }, []);

  const select = useCallback((id: string) => {
    if (demo) { setDemoCurrent(id); return; }
    setRealCurrent(id);
    save(CURRENT_KEY, id).catch(() => {});
  }, [demo]);

  const setPref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => { const next = { ...p, [key]: value }; save(PREFS_KEY, next); return next; });
  }, []);
  const setUnit = useCallback((unit: Unit) => setPref('unit', unit), [setPref]);
  const resetPrefs = useCallback(() => {
    setPrefs((p) => { const next = { ...DEFAULT_PREFS, unit: p.unit }; save(PREFS_KEY, next); return next; });
  }, []);
  const setHostTrust = useCallback((host: string, trust: Trust | null) => {
    applyTrust(host, trust);
    setTrusts((all) => {
      const next = { ...all };
      if (hasTrust(trust)) next[host] = trust; else delete next[host];
      save(TRUST_KEY, next);
      return next;
    });
  }, []);

  /** Save the last cooks of paired ovens only (the demo's stay in memory). */
  const saveCooks = useCallback((all: Record<string, LastCook>) => {
    const ids = new Set(realRef.current.map((o) => o.id));
    save(LAST_COOKS_KEY, Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(id)))).catch(() => {});
  }, []);
  const saveHistory = useCallback((all: HistoryEntry[]) => {
    const ids = new Set(realRef.current.map((o) => o.id));
    save(HISTORY_KEY, all.filter((e) => ids.has(e.ovenId))).catch(() => {});
  }, []);
  const saveSchedules = useCallback((all: Record<string, ScheduledCook>) => {
    const ids = new Set(realRef.current.map((o) => o.id));
    save(SCHEDULE_KEY, Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(id)))).catch(() => {});
  }, []);
  const recordCook = useCallback((mode: string, tempF: number, plan?: number, opts?: { timerMin?: number; ovenId?: string }) => {
    const id = opts?.ovenId ?? currentId;
    if (!id) return;
    const at = Date.now();
    const cook: LastCook = { mode, tempF, plan, at };
    setLastCooks((all) => { const next = { ...all, [id]: cook }; saveCooks(next); return next; });
    setHistory((all) => {
      const next = beginCook(all, { ovenId: id, mode, tempF, plan, timerMin: opts?.timerMin, at });
      saveHistory(next);
      return next;
    });
  }, [currentId, saveCooks, saveHistory]);
  const clearHistory = useCallback(() => {
    if (!currentId) return;
    setHistory((all) => { const next = dropOven(all, currentId); saveHistory(next); return next; });
  }, [currentId, saveHistory]);
  const countUse = useCallback((mode: string) => {
    setUses((u) => { const next = { ...u, [mode]: (u[mode] ?? 0) + 1 }; save(USES_KEY, next); return next; });
  }, []);

  const completePairing = useCallback(async (p: Paired) => {
    const entry = entryFor(p);
    const list = realRef.current;
    const next = list.some((o) => o.id === entry.id) ? list.map((o) => (o.id === entry.id ? entry : o)) : [...list, entry];
    await save(ovenKey(entry.id), p);
    await save(OVENS_KEY, next.map((o) => o.id));
    setRealList(next);
    setRealCurrent(entry.id);
    save(CURRENT_KEY, entry.id).catch(() => {});
    setDemo(null);
    setDemoCurrent(null);
  }, [setRealList]);

  const updateConnection = useCallback(async (conn: Connection) => {
    if (!paired) return;
    const p = { ...paired, conn };
    await save(ovenKey(p.oven.id), p);
    const entry = entryFor(p);
    setRealList(realRef.current.map((o) => (o.id === entry.id ? entry : o)));
  }, [paired, setRealList]);

  const startDemo = useCallback(() => {
    const d = demoParams();
    const entries = demoEntries(d?.scene ?? 'off', d?.count ?? 1);
    const id = entries[0].id;
    setDemo(entries);
    setDemoCurrent(id);
    setHistory((h) => (h.some((e) => e.ovenId === id) ? h : [...demoSample(id, Date.now()), ...h]));
  }, []);

  const runCook = useCallback(async (entry: OvenEntry, cook: { mode: string; tempF: number; plan?: number; timerMin?: number }) => {
    const wasActive = entry.link.snapshot().active;
    try {
      await entry.link.preheat(cook.mode, fToC(cook.tempF), cook.plan);
    } catch (e) {
      // An unanswered start may still have gone through: the oven's next report says.
      if (!(e instanceof OvenError && e.code === 'timeout') || wasActive || !(await becomesActive(entry.link))) throw e;
    }
    countUse(cook.mode);
    recordCook(cook.mode, cook.tempF, cook.plan, { timerMin: cook.timerMin || undefined, ovenId: entry.id });
    if (cook.timerMin) {
      // Nobody may be at the oven, so a timer that didn't take is said out loud.
      await setTimerPatiently(entry.link, cook.timerMin * 60_000).catch((e) => {
        const label = MODES.find((m) => m.id === cook.mode)?.label ?? 'The cook';
        tell(`${label} started without its timer`, `${e instanceof OvenError ? e.message : 'The timer wasn’t set.'} Add time on the oven's page.`);
      });
    }
  }, [countUse, recordCook]);

  const scheduleCook = useCallback((cook: Omit<ScheduledCook, 'ovenId' | 'createdAt'>) => {
    if (!currentId) return;
    const nextCook: ScheduledCook = { ...cook, ovenId: currentId, createdAt: Date.now() };
    setSchedules((all) => { const next = setFor(all, nextCook); saveSchedules(next); return next; });
  }, [currentId, saveSchedules]);

  const cancelSchedule = useCallback((ovenId?: string) => {
    const id = ovenId ?? currentId;
    if (!id) return;
    setSchedules((all) => { const next = clearFor(all, id); saveSchedules(next); return next; });
  }, [currentId, saveSchedules]);

  const ovensRef = useRef(ovens);
  const schedulesRef = useRef(schedules);
  const firing = useRef(new Set<string>());
  useEffect(() => { ovensRef.current = ovens; }, [ovens]);
  useEffect(() => { schedulesRef.current = schedules; }, [schedules]);

  // Changes to a start that was just tried go into the ref at once as well, so the
  // next tick can't send it again before React re-renders.
  const changeSchedules = useCallback((change: (all: Record<string, ScheduledCook>) => Record<string, ScheduledCook>) => {
    schedulesRef.current = change(schedulesRef.current);
    setSchedules((all) => { const next = change(all); if (next !== all) saveSchedules(next); return next; });
  }, [saveSchedules]);

  const startScheduled = useCallback(async (ovenId?: string) => {
    const id = ovenId ?? currentId;
    if (!id) throw new OvenError('No oven is selected.');
    const cook = schedulesRef.current[id];
    const entry = ovensRef.current.find((o) => o.id === id);
    if (!cook || !entry) throw new OvenError('There is no delayed start for this oven.');
    if (firing.current.has(id)) return;
    firing.current.add(id);
    try {
      await runCook(entry, cook);
      changeSchedules((all) => clearFor(all, id, cook.createdAt));
    } finally {
      firing.current.delete(id);
    }
  }, [currentId, runCook, changeSchedules]);

  const fireDue = useCallback(async () => {
    const now = Date.now();
    for (const s of Object.values(schedulesRef.current)) {
      const entry = ovensRef.current.find((o) => o.id === s.ovenId);
      if (!entry || firing.current.has(s.ovenId)) continue;
      const snap = entry.link.snapshot();
      if (decide(s, now, ovenGate(snap)) !== 'start') continue;
      firing.current.add(s.ovenId);
      try {
        await runCook(entry, s);
        changeSchedules((all) => clearFor(all, s.ovenId, s.createdAt));
      } catch (e) {
        // Tried once: the home screen asks before trying again, with the reason.
        const why = e instanceof OvenError ? e.message : 'Something went wrong.';
        changeSchedules((all) => failFor(all, s, why));
      } finally {
        firing.current.delete(s.ovenId);
      }
    }
  }, [runCook, changeSchedules]);

  useEffect(() => {
    if (!Object.keys(schedules).length) return;
    const id = setInterval(() => { void fireDue(); }, 1000);
    void fireDue();
    // On return to the foreground the links restart; fireDue holds until each oven reports (ovenGate).
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void fireDue(); });
    return () => { clearInterval(id); sub.remove(); };
  }, [schedules, fireDue]);

  const forget = useCallback(async () => {
    if (demo) {
      const ids = new Set(demo.map((o) => o.id));
      setDemo(null);
      setDemoCurrent(null);
      setHistory((all) => all.filter((e) => !ids.has(e.ovenId)));
      setSchedules((all) => Object.fromEntries(Object.entries(all).filter(([id]) => !ids.has(id))));
      return;
    }
    const gone = current;
    if (!gone?.paired) return;
    const host = gone.paired.conn.host;
    await gone.link.unpair().catch(() => {});
    const list = realRef.current;
    const at = list.findIndex((o) => o.id === gone.id);
    const next = list.filter((o) => o.id !== gone.id);
    await remove(ovenKey(gone.id)).catch(() => {});
    await save(OVENS_KEY, next.map((o) => o.id)).catch(() => {});
    // Keep the certificate trust while another oven still uses the same address.
    if (!next.some((o) => o.paired?.conn.host === host)) setHostTrust(host, null);
    setRealList(next);
    setLastCooks((all) => {
      if (!(gone.id in all)) return all;
      const rest = { ...all };
      delete rest[gone.id];
      saveCooks(rest);
      return rest;
    });
    setHistory((all) => { const next = dropOven(all, gone.id); saveHistory(next); return next; });
    setSchedules((all) => { const next = clearFor(all, gone.id); saveSchedules(next); return next; });
    // Show a neighbour: the oven after it, or else the one before.
    const neighbour = next[Math.min(Math.max(at, 0), next.length - 1)] ?? null;
    setRealCurrent(neighbour?.id ?? null);
    if (neighbour) save(CURRENT_KEY, neighbour.id).catch(() => {}); else remove(CURRENT_KEY).catch(() => {});
  }, [demo, current, setHostTrust, setRealList, saveCooks, saveHistory, saveSchedules]);

  // Close (or open) history rows from each oven's live state: a cook started on
  // the oven, or a phone start that has now finished.
  useEffect(() => {
    const unsubs = ovens.map((o) => {
      const apply = (s: OvenSnapshot) => {
        setHistory((all) => {
          const next = noteLive(all, o.id, {
            active: s.active, ended: s.ended, mode: s.mode, targetC: s.targetC,
            elapsedMs: s.elapsedMs, endedAt: s.endedAt, statusAt: s.statusAt,
          }, Date.now());
          if (next === all) return all;
          saveHistory(next);
          return next;
        });
      };
      apply(o.link.snapshot());
      return o.link.subscribe(apply);
    });
    return () => { unsubs.forEach((u) => u()); };
  }, [ovens, saveHistory]);

  const value = useMemo<Ctx>(
    () => ({
      ready, ovens, currentId, select, paired, link, snap, prefs, setUnit, setPref, resetPrefs, uses, countUse,
      lastCook, lastCooks, recordCook, history, clearHistory, scheduled, schedules, scheduleCook, cancelSchedule, startScheduled,
      trusts, setHostTrust, updateConnection, completePairing, startDemo, forget,
    }),
    [ready, ovens, currentId, select, paired, link, snap, prefs, setUnit, setPref, resetPrefs, uses, countUse,
      lastCook, lastCooks, recordCook, history, clearHistory, scheduled, schedules, scheduleCook, cancelSchedule, startScheduled,
      trusts, setHostTrust, updateConnection, completePairing, startDemo, forget],
  );
  return <OvenContext.Provider value={value}>{children}</OvenContext.Provider>;
}

export function useOven(): Ctx {
  const c = useContext(OvenContext);
  if (!c) throw new Error('useOven outside OvenProvider');
  return c;
}

/** Live snapshot of any oven's link (for pages that aren't the current oven). */
export function useSnapshot(link: OvenLink | null): OvenSnapshot {
  const subscribe = useMemo(() => (link ? link.subscribe.bind(link) : noSubscribe), [link]);
  const getSnapshot = useMemo(() => (link ? link.snapshot.bind(link) : () => EMPTY), [link]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Display name for the current oven ('Demo oven' in the demo). */
export function useOvenName(): string {
  const { ovens, currentId } = useOven();
  return ovens.find((o) => o.id === currentId)?.name ?? 'Your oven';
}
