/// <reference types="node" />
// Run: npx tsx scripts/client.test.ts — LiveOven frame parsing and command rules,
// driven through a fake socket (no server). Frame shapes follow the relayed
// captures in June/local-resources/june-arch/capture.
import assert from 'node:assert/strict';
import { LiveOven, OvenError, type Paired } from '../src/api/client';
import { MC, generateKeys } from '../src/api/protocol';

// Commands wait 10 s for an ack; make a silent oven time out at once.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((fn: () => void, ms?: number) => realSetTimeout(fn, ms && ms >= 10_000 ? 1 : ms)) as typeof setTimeout;

type Sent = { code: number; data: any };
/** Reply with an ack status, or null to stay silent. */
type Oven = (code: number, data: any, emit: (code: number, data: object) => void) => string | null;

function rig(oven: Oven) {
  const paired = {
    conn: { host: 'oven.test', secure: true }, deviceId: 'phone', deviceName: 'Test phone', password: '', accessToken: '',
    refreshToken: '', keys: generateKeys(), oven: { id: 'oven' }, pairedAt: 0,
  } as Paired;
  const link = new LiveOven(paired);
  const emit = (code: number, data: object) => (link as any).onFrame(JSON.stringify({ message_code: code, data }));
  const sent: Sent[] = [];
  (link as any).ws = {
    readyState: 1,
    send(raw: string) {
      const f = JSON.parse(raw);
      sent.push({ code: f.message_code, data: f.data });
      queueMicrotask(() => {
        const status = oven(f.message_code, f.data, emit);
        if (status !== null) emit(MC.Ack, { request_order: f.order, status });
      });
    },
  };
  return { link, emit, sent };
}

const plan = (name: string, id: number, milliC: number) =>
  ({ food: { name, plan: { id, steps: [{ id: 1, temperature_cavity: milliC }] } }, step_state: { step_index: 0 } });

/** Stands in for the oven: 11002 starts a plan-0 cook, 11004 ends it, 11005 answers `onSetTemp`. */
const oven = (onSetTemp: string | null): Oven => (code, data, emit) => {
  if (code === MC.SetCavityTemp) return onSetTemp;
  if (code === MC.Preheat) emit(MC.CookPlanStarted, plan(data.primitive_type, 0, data.temperature_cavity));
  if (code === MC.Cancel) emit(MC.CookPlanEnded, { plan_id: data.plan_id, type: 'cancelled' });
  return 'success';
};

const rejects = async (p: Promise<unknown>, code: string) => {
  await assert.rejects(p, (e) => e instanceof OvenError && e.code === code);
};

// --- progress.percentage is 0–100 --------------------------------------------
{
  const { link, emit } = rig(oven('success'));
  const progress = (percentage: unknown) => {
    emit(MC.CookingState, { sensor_data: { cavity: 26_700 }, cook_state_data: { progress: { percentage, label_type: 'temperature' } } });
    return link.snapshot().progress;
  };
  // relay-frames-20260922-g: ~1% of the 25.2 → 176.7 °C gap covered.
  assert.ok(Math.abs(progress(0.99031466)! - 0.0099031466) < 1e-9);
  // factory-reset-20260923 relay-phase11: holding at temperature.
  assert.equal(progress(100.0), 1);
  assert.equal(progress(50), 0.5);
  assert.equal(progress(0), 0);
  assert.equal(progress(140), 1);
  assert.equal(progress(-3), 0);
  assert.equal(progress(undefined), null);
  console.log('✓ progress.percentage read as 0–100, clamped to 0..1');
}

// --- probe target from the step's exit criteria --------------------------------
{
  const { link, emit } = rig(oven('success'));
  // Shape from the Home Assistant integration's parse_cook_plan (_probe_target).
  const probePlan = {
    food: { name: 'roast', plan: { id: 0, steps: [{ id: 1, temperature_cavity: 176_667,
      exit_criteria: [{ type: 'time', value: 600_000 }, { type: 'probe', target: { id: 'left', value: 62_778 } }] }] } },
    step_state: { step_index: 0 },
  };
  emit(MC.CookPlanStarted, probePlan);
  assert.ok(Math.abs(link.snapshot().probeTargetC! - 62.778) < 1e-9);
  // A 10013 without a probe criterion clears it; one with it sets it again.
  emit(MC.CookingState, { sensor_data: { cavity: 170_000 }, cook_plan_data: plan('roast', 0, 176_667) });
  assert.equal(link.snapshot().probeTargetC, null);
  emit(MC.CookingState, { sensor_data: { cavity: 170_000 }, cook_plan_data: probePlan });
  assert.ok(Math.abs(link.snapshot().probeTargetC! - 62.778) < 1e-9);
  emit(MC.CookPlanEnded, { plan_id: 0, type: 'completed' });
  assert.equal(link.snapshot().probeTargetC, null);
  console.log('✓ probe target read from exit_criteria and cleared when the cook ends');
}

// --- setTemperature ---------------------------------------------------------
async function main() {
  {
    const { link, sent } = rig(oven('success'));
    await link.preheat('bake', 176.667);
    await link.setTemperature(190);
    assert.deepEqual(sent.map((s) => s.code), [MC.Preheat, MC.SetCavityTemp]);
    assert.deepEqual(sent[1].data, { plan_id: 0, temperature_cavity: 190000 });
    assert.equal(link.snapshot().targetC, 190);
    console.log('✓ accepted 11005 changes the target in place');
  }
  {
    const { link, sent } = rig(oven('not-allowed'));
    await link.preheat('bake', 176.667);
    await link.setTemperature(190);
    assert.deepEqual(sent.map((s) => s.code), [MC.Preheat, MC.SetCavityTemp, MC.Cancel, MC.Preheat]);
    assert.deepEqual(sent[3].data, { primitive_type: 'bake', temperature_cavity: 190000 });
    assert.equal(link.snapshot().targetC, 190);
    console.log('✓ refused 11005 on a phone-startable cook restarts it at the new temperature');
  }
  {
    const { link, sent } = rig(oven(null));
    await link.preheat('bake', 176.667);
    await rejects(link.setTemperature(190), 'timeout');
    assert.deepEqual(sent.map((s) => s.code), [MC.Preheat, MC.SetCavityTemp]);
    assert.ok(Math.abs(link.snapshot().targetC! - 176.667) < 1e-9);
    console.log('✓ unanswered 11005 never cancels the cook');
  }
  {
    // relay-frames-20260922-p: proof started on the touchscreen runs as plan 114.
    const { link, emit, sent } = rig(oven('not-allowed'));
    emit(MC.CookPlanStarted, plan('proof', 114, 37_778));
    assert.equal(link.snapshot().mode, 'proof');
    await rejects(link.setTemperature(40), 'not-allowed');
    assert.deepEqual(sent.map((s) => s.code), [MC.SetCavityTemp]);
    assert.equal(link.snapshot().active, true);
    console.log('✓ refused 11005 on a touchscreen program (proof, plan 114) leaves it running');
  }
  {
    const { link, emit, sent } = rig(oven('not-allowed'));
    emit(MC.CookPlanStarted, plan('toast', 0, 200_000));
    await rejects(link.setTemperature(210), 'not-allowed');
    assert.deepEqual(sent.map((s) => s.code), [MC.SetCavityTemp]);
    console.log('✓ refused 11005 on a mode the phone cannot start leaves it running');
  }
  console.log('all client checks passed');
}

main()
  .catch((e) => { console.error('\nFAILED:', e); process.exitCode = 1; })
  .finally(() => { globalThis.setTimeout = realSetTimeout; });
