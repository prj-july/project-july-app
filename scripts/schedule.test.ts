/// <reference types="node" />
// Run: npx tsx scripts/schedule.test.ts — delayed start: delay math, when the
// oven should preheat on its own, and the home-screen copy.
import assert from 'node:assert/strict';
import {
  AUTO_START_GRACE_MS, DELAYS_MIN, MAX_DELAY_MIN, bannerCopy, clearFor, decide,
  delayLabel, fromDelayMin, ovenGate, scheduleSummary, setFor, startsIn,
  type ScheduledCook,
} from '../src/api/schedule';

const t0 = Date.parse('2026-03-14T18:00:00');
const cook = (over: Partial<ScheduledCook> = {}): ScheduledCook => ({
  ovenId: 'oven', mode: 'roast', tempF: 400, timerMin: 45, startAt: t0 + 30 * 60_000, createdAt: t0, ...over,
});

{
  assert.equal(fromDelayMin(t0, 0), null);
  assert.equal(fromDelayMin(t0, -5), null);
  assert.equal(fromDelayMin(t0, Number.NaN), null);
  assert.equal(fromDelayMin(t0, 15), t0 + 15 * 60_000);
  assert.equal(fromDelayMin(t0, 15.4), t0 + 15 * 60_000);
  assert.equal(fromDelayMin(t0, MAX_DELAY_MIN + 90), t0 + MAX_DELAY_MIN * 60_000);
  assert.equal(fromDelayMin(t0, 1), t0 + 60_000);
  assert.deepEqual(DELAYS_MIN, [15, 30, 60, 120, 240]);
  console.log('✓ delays are 1 minute to 12 hours, with the review’s quick choices');
}

{
  assert.equal(delayLabel(15), '15 min');
  assert.equal(delayLabel(1), '1 min');
  assert.equal(delayLabel(60), '1 hr');
  assert.equal(delayLabel(120), '2 hr');
  assert.equal(delayLabel(90), '1 hr 30 min');
  assert.equal(startsIn(t0 + 30_000, t0), 'less than a minute');
  assert.equal(startsIn(t0 + 15 * 60_000, t0), '15 min');
  assert.equal(startsIn(t0 - 5_000, t0), 'less than a minute');
  console.log('✓ delays and countdowns read in words');
}

{
  const idle = { active: false, connected: true };
  const busy = { active: true, connected: true };
  const lost = { active: false, connected: false };
  const s = cook();
  assert.equal(decide(s, t0, idle), 'wait');
  assert.equal(decide(s, s.startAt - 1, idle), 'wait');
  assert.equal(decide(s, s.startAt, idle), 'start');
  assert.equal(decide(s, s.startAt + AUTO_START_GRACE_MS, idle), 'start');
  assert.equal(decide(s, s.startAt + AUTO_START_GRACE_MS + 1, idle), 'ask');
  assert.equal(decide(s, s.startAt + 1_000, busy), 'hold');
  assert.equal(decide(s, s.startAt + 1_000, lost), 'hold');
  assert.equal(decide(s, s.startAt + AUTO_START_GRACE_MS + 60_000, lost), 'hold');
  assert.equal(decide(s, s.startAt + AUTO_START_GRACE_MS + 60_000, busy), 'hold');
  console.log('✓ start on time when idle; hold if busy or offline; ask after 15 minutes late');
}

{
  const all = setFor({}, cook());
  assert.equal(Object.keys(all).length, 1);
  const replaced = setFor(all, cook({ mode: 'bake', tempF: 350, startAt: t0 + 60_000 }));
  assert.equal(replaced.oven.mode, 'bake');
  assert.equal(Object.keys(replaced).length, 1);
  const two = setFor(replaced, cook({ ovenId: 'other', mode: 'toast', tempF: 500, plan: 4 }));
  assert.equal(Object.keys(two).length, 2);
  const dropped = clearFor(two, 'oven');
  assert.equal(dropped.oven, undefined);
  assert.equal(dropped.other.mode, 'toast');
  const same = clearFor(dropped, 'oven');
  assert.equal(same, dropped);
  console.log('✓ one pending start per oven, replacing the previous, leaving the others');
}

{
  assert.equal(scheduleSummary(cook(), 'F'), 'Roast 400 °F');
  assert.equal(scheduleSummary(cook({ mode: 'grill', tempF: 450, plan: 0 }), 'F'), 'Grill High');
  assert.equal(scheduleSummary(cook({ mode: 'toast', tempF: 500, plan: 5 }), 'F'), 'Toast 6');
  console.log('✓ the pending start is named the way Repeat names a cook');
}

{
  const s = cook();
  const wait = bannerCopy(s, t0, { active: false, connected: true }, 'F');
  assert.equal(wait.kind, 'wait');
  assert.match(wait.title, /Roast 400 °F starts at/);
  assert.match(wait.body, /In 30 min/);
  const holdBusy = bannerCopy(s, s.startAt + 1_000, { active: true, connected: true }, 'F');
  assert.equal(holdBusy.kind, 'hold');
  assert.match(holdBusy.body, /free/);
  const holdOff = bannerCopy(s, s.startAt + 1_000, { active: false, connected: false }, 'F');
  assert.match(holdOff.body, /reach the oven/);
  const go = bannerCopy(s, s.startAt, { active: false, connected: true }, 'F');
  assert.equal(go.kind, 'start');
  const late = bannerCopy(s, s.startAt + AUTO_START_GRACE_MS + 1, { active: false, connected: true }, 'F');
  assert.equal(late.kind, 'ask');
  assert.match(late.title, /was due at/);
  console.log('✓ home-screen copy follows wait, hold, start and a missed start');
}

{
  assert.deepEqual(ovenGate({ active: false, link: 'online', ovenOnline: true }), { active: false, connected: true });
  assert.deepEqual(ovenGate({ active: false, link: 'offline', ovenOnline: false }), { active: false, connected: false });
  assert.deepEqual(ovenGate({ active: false, link: 'connecting', ovenOnline: null }), { active: false, connected: false });
  assert.deepEqual(ovenGate({ active: true, link: 'online', ovenOnline: true }), { active: true, connected: true });
  assert.deepEqual(ovenGate({ active: false, link: 'online', ovenOnline: null }), { active: false, connected: true });
  console.log('✓ only an online oven is reachable; connecting or offline holds the start');
}

console.log('all schedule checks passed');
