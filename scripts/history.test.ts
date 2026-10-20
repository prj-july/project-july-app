/// <reference types="node" />
// Run: npx tsx scripts/history.test.ts — cook history: phone starts, live
// oven updates, Repeat params, grouping and the per-oven cap.
import assert from 'node:assert/strict';
import {
  HISTORY_CAP, MERGE_MS, beginCook, cookLength, cookParams, dayLabel, demoSample, dropOven,
  entryLine, entrySummary, forOven, groupByDay, liveTempF, noteLive, outcomeLabel,
  type HistoryEntry, type HistoryStart, type LiveCook,
} from '../src/api/history';

const oven = 'oven-a';
const other = 'oven-b';
const t0 = Date.parse('2026-03-14T18:20:00');

const start = (over: Partial<HistoryStart> = {}): HistoryStart => ({
  ovenId: oven, mode: 'bake', tempF: 350, at: t0, ...over,
});

const live = (over: Partial<LiveCook> = {}): LiveCook => ({
  active: false, ended: null, mode: null, targetC: null, ...over,
});

{
  const list = beginCook([], start(), 'one');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'one');
  assert.equal(list[0].outcome, 'running');
  assert.equal(list[0].mode, 'bake');
  assert.equal(list[0].tempF, 350);
  assert.equal(list[0].startedAt, t0);
  assert.equal(list[0].plan, undefined);
  assert.equal(list[0].timerMin, undefined);
  console.log('✓ phone start opens a running row');
}

{
  const first = beginCook([], start({ mode: 'roast', tempF: 400 }), 'a');
  const next = beginCook(first, start({ mode: 'bake', tempF: 350, at: t0 + MERGE_MS }), 'b');
  assert.equal(next.length, 2);
  assert.equal(next[0].id, 'b');
  assert.equal(next[0].outcome, 'running');
  assert.equal(next[1].id, 'a');
  assert.equal(next[1].outcome, 'cancelled');
  assert.equal(next[1].endedAt, t0 + MERGE_MS);
  console.log('✓ a later start cancels the cook it replaces');
}

{
  const fromOven = noteLive([], oven, live({ active: true, mode: 'roast', targetC: 204.444 }), t0);
  assert.equal(fromOven.length, 1);
  assert.equal(fromOven[0].tempF, 400);
  const merged = beginCook(fromOven, start({ mode: 'roast', tempF: 400, plan: undefined, timerMin: 45, at: t0 + 400 }), 'phone');
  const earlier = beginCook(fromOven, start({ mode: 'roast', tempF: 400, timerMin: 30, at: t0 - 400 }), 'early');
  assert.equal(earlier.length, 1);
  assert.equal(earlier[0].timerMin, 30);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, fromOven[0].id);
  assert.equal(merged[0].timerMin, 45);
  assert.equal(merged[0].tempF, 400);
  console.log('✓ a phone start within the merge window fills the oven’s row');
}

{
  const phone = beginCook([], start({ timerMin: 20 }), 'phone');
  const same = noteLive(phone, oven, live({ active: true, mode: 'bake', targetC: 176.667 }), t0 + 200);
  assert.equal(same, phone);
  console.log('✓ the oven going active does not duplicate a phone start');
}

{
  let list: HistoryEntry[] = [];
  list = noteLive(list, oven, live({ active: false }), t0);
  assert.equal(list.length, 0);
  list = noteLive(list, oven, live({ active: true, mode: null }), t0);
  assert.equal(list.length, 0);
  list = noteLive(list, oven, live({ active: true, mode: 'airfry', targetC: 204.4 }), t0);
  assert.equal(list.length, 1);
  assert.equal(list[0].mode, 'airfry');
  const again = noteLive(list, oven, live({ active: true, mode: 'airfry', targetC: 204.4 }), t0 + 1000);
  assert.equal(again, list);
  console.log('✓ live state opens one row when the oven starts, and ignores idle ticks');
}

{
  const running = beginCook([], start({ mode: 'toast', tempF: 500, plan: 5 }), 'toast');
  const done = noteLive(running, oven, live({ active: false, ended: 'completed', mode: 'toast' }), t0 + 6 * 60_000);
  assert.equal(done[0].outcome, 'completed');
  assert.equal(done[0].endedAt, t0 + 6 * 60_000);
  const stopped = noteLive(running, oven, live({ active: false, ended: 'cancelled' }), t0 + 30_000);
  assert.equal(stopped[0].outcome, 'cancelled');
  const idle = noteLive(running, oven, live({ active: false, ended: null }), t0 + 30_000);
  assert.equal(idle, running);
  const late = noteLive(running, oven, live({ active: false, ended: 'completed', endedAt: t0 + 5 * 60_000 }), t0 + 60 * 60_000);
  assert.equal(late[0].endedAt, t0 + 5 * 60_000);
  console.log('✓ finishing or stopping closes the running row; a quiet idle does not');
}

{
  // Finished while the phone was locked: the oven is idle on a report from after the start.
  const running = beginCook([], start(), 'bake');
  assert.equal(noteLive(running, oven, live({ active: false, statusAt: t0 + 2_000 }), t0 + 2_000), running);
  const found = noteLive(running, oven, live({ active: false, statusAt: t0 + 60 * 60_000 }), t0 + 60 * 60_000);
  assert.equal(found[0].outcome, 'ended');
  assert.equal(found[0].endedAt, undefined);
  assert.equal(entryLine(found[0], t0 + 60 * 60_000).endsWith('· ended'), true);
  // Then a cook started on the oven gets its own row.
  const next = noteLive(found, oven, live({ active: true, mode: 'roast', targetC: 204.444, statusAt: t0 + 61 * 60_000 }), t0 + 61 * 60_000);
  assert.equal(next.length, 2);
  assert.equal(next[0].mode, 'roast');
  console.log('✓ a cook that ended unseen closes on the next idle report, and the next one is recorded');
}

{
  const found = noteLive([], oven, live({ active: true, mode: 'bake', targetC: 176.667, elapsedMs: 20 * 60_000 }), t0);
  assert.equal(found[0].startedAt, t0 - 20 * 60_000);
  console.log('✓ a cook found already going is dated from when it started');
}

{
  const a = beginCook([], start(), 'a');
  const both = beginCook(a, start({ ovenId: other, mode: 'grill', tempF: 450, plan: 1, at: t0 + 10 }), 'b');
  assert.equal(both.length, 2);
  assert.deepEqual(forOven(both, oven).map((e) => e.id), ['a']);
  assert.deepEqual(forOven(both, other).map((e) => e.id), ['b']);
  const gone = dropOven(both, oven);
  assert.deepEqual(gone.map((e) => e.id), ['b']);
  console.log('✓ history is per oven: list, drop, leave the other oven alone');
}

{
  let list: HistoryEntry[] = [];
  for (let i = 0; i < HISTORY_CAP + 7; i++) {
    list = beginCook(list, start({ at: t0 + i * 60_000, mode: i % 2 ? 'bake' : 'roast' }), `n${i}`);
  }
  const mine = forOven(list, oven);
  assert.equal(mine.length, HISTORY_CAP);
  assert.equal(mine[0].id, `n${HISTORY_CAP + 6}`);
  assert.equal(mine[HISTORY_CAP - 1].id, `n${7}`);
  // A second oven is not squeezed out by the first oven’s cap.
  const withOther = beginCook(list, start({ ovenId: other, at: t0 }), 'other');
  assert.equal(forOven(withOther, other).length, 1);
  assert.equal(forOven(withOther, oven).length, HISTORY_CAP);
  console.log('✓ each oven keeps the newest 50 cooks');
}

{
  assert.equal(liveTempF('bake', 176.667), 350);
  assert.equal(liveTempF('roast', 204.444), 400);
  assert.equal(liveTempF('broil', 260), 500);
  assert.equal(liveTempF('reheat', 176.667), 350);
  assert.equal(liveTempF('toast', null), 500);
  console.log('✓ live temperatures round to the oven’s 5° F steps, and fixed modes keep theirs');
}

{
  assert.deepEqual(cookParams({ mode: 'bake', tempF: 375 }), { mode: 'bake', temp: '375' });
  assert.deepEqual(cookParams({ mode: 'grill', tempF: 450, plan: 2 }), { mode: 'grill', temp: '450', plan: '2' });
  assert.deepEqual(cookParams({ mode: 'reheat', tempF: 350, timerMin: 90 }), { mode: 'reheat', temp: '350', timer: '90' });
  assert.deepEqual(cookParams({ mode: 'bake', tempF: 350, timerMin: 0 }), { mode: 'bake', temp: '350' });
  console.log('✓ Repeat params carry mode, temperature, plan and timer');
}

{
  assert.equal(entrySummary({ mode: 'toast', tempF: 500, plan: 5 }, 'F'), 'Toast 6');
  assert.equal(entrySummary({ mode: 'grill', tempF: 450, plan: 0 }, 'F'), 'Grill High');
  assert.equal(entrySummary({ mode: 'bake', tempF: 350 }, 'F'), 'Bake 350 °F');
  assert.equal(entrySummary({ mode: 'bake', tempF: 350 }, 'C'), 'Bake 177 °C');
  assert.equal(outcomeLabel('running'), 'Cooking');
  assert.equal(outcomeLabel('completed'), 'Finished');
  assert.equal(outcomeLabel('cancelled'), 'Stopped');
  assert.equal(cookLength(12 * 60_000), '12 min');
  assert.equal(cookLength(60_000), '1 min');
  assert.equal(cookLength(90 * 60_000), '1 hr 30 min');
  assert.equal(cookLength(120 * 60_000), '2 hr');
  console.log('✓ summaries, outcomes and durations read in words');
}

{
  const now = t0 + 2 * 60_000;
  const running: HistoryEntry = {
    id: 'r', ovenId: oven, mode: 'bake', tempF: 350, startedAt: t0, outcome: 'running',
  };
  const finished: HistoryEntry = {
    ...running, id: 'f', outcome: 'completed', endedAt: t0 + 45 * 60_000,
  };
  assert.match(entryLine(running, now), /cooking$/);
  assert.match(entryLine(finished, t0 + 45 * 60_000), /45 min · finished$/);
  console.log('✓ a row’s line names when, how long, and how it ended');
}

{
  const now = Date.parse('2026-06-10T16:00:00');
  assert.equal(dayLabel(now - 3_600_000, now), 'Today');
  assert.equal(dayLabel(now - 26 * 3_600_000, now), 'Yesterday');
  const older = beginCook([], start({ at: now - 2 * 3_600_000 }), 'today');
  const yest = beginCook(older, start({ at: now - 26 * 3_600_000, mode: 'roast', tempF: 400 }), 'yest');
  const days = groupByDay(yest, oven, now);
  assert.equal(days.length, 2);
  assert.equal(days[0].label, 'Today');
  assert.deepEqual(days[0].entries.map((e) => e.id), ['today']);
  assert.equal(days[1].label, 'Yesterday');
  assert.deepEqual(days[1].entries.map((e) => e.id), ['yest']);
  // A third cook today stays in Today’s group, newest first.
  const more = beginCook(yest, start({ at: now - 60_000, mode: 'airfry', tempF: 400 }), 'later');
  const grouped = groupByDay(more, oven, now);
  assert.deepEqual(grouped[0].entries.map((e) => e.id), ['later', 'today']);
  console.log('✓ cooks group by day, newest first, Today then Yesterday');
}

{
  const sample = demoSample('demo', t0);
  assert.equal(sample.length, 3);
  assert.equal(sample[0].ovenId, 'demo');
  assert.equal(sample[0].outcome, 'completed');
  assert.equal(sample[2].plan, 4);
  const days = groupByDay(sample, 'demo', t0);
  assert.ok(days.length >= 2);
  console.log('✓ the demo’s sample cooks group into more than one day');
}

console.log('all history checks passed');
