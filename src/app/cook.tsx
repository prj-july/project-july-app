import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { OvenError } from '@/api/client';
import { MODES, cToF, fToC, formatDuration, isFixed, validPlan, type CookMode } from '@/api/modes';
import { DELAYS_MIN, MAX_DELAY_MIN, clampDelayMin, delayLabel, fromDelayMin, startsAtLabel, startsIn } from '@/api/schedule';
import { GlassFill, ModeTile } from '@/components/glass';
import { Icon } from '@/components/Icon';
import { useNow } from '@/components/OvenHero';
import { Slider } from '@/components/Slider';
import { Button, Chip, Field, Notice, RoundButton, Screen, SectionLabel, Segmented, T, tell } from '@/components/ui';
import { useOven, useOvenName } from '@/state/oven';
import { space, useTheme } from '@/theme';

const TIMERS = [0, 10, 15, 20, 30, 45, 60, 90];
// Glass: the review closes itself after 5 minutes (the UL 1026 remote-programming
// window), so nothing can start from a screen left open on the counter.
const REVIEW_MS = 5 * 60_000;
const STEP_F = 5;

export default function Cook() {
  const { look } = useTheme();
  const { link, prefs, countUse, recordCook, scheduleCook } = useOven();
  const glass = look.hero === 'glass';
  const unit = prefs.unit;
  // `temp` (°F), `plan` and `timer` come from Repeat (home or history).
  const params = useLocalSearchParams<{ mode?: string; temp?: string; plan?: string; timer?: string }>();
  const [modeId, setModeId] = useState(MODES.some((m) => m.id === params.mode) ? params.mode! : 'bake');
  const mode = MODES.find((m) => m.id === modeId)!;
  // Held in °F on 5° steps, the oven's native scale; °C is shown rounded.
  const asked = Number(params.temp);
  const [tempF, setTempF] = useState(asked >= mode.minF && asked <= mode.maxF ? Math.round(asked / 5) * 5 : mode.defaultF);
  // A mode with plans (toast level, grill heat) picks one instead of a temperature.
  const [plan, setPlan] = useState(validPlan(mode, params.plan ? Number(params.plan) : undefined));
  const askedTimer = Number(params.timer);
  const [timerMin, setTimerMin] = useState(
    Number.isFinite(askedTimer) && askedTimer > 0
      ? Math.min(mode.timed?.maxMin ?? 600, Math.max(1, Math.round(askedTimer)))
      : (mode.timed?.defaultMin ?? 0),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What the start sends: the plan's own temperature, or the one picked.
  const startF = mode.plans && plan !== undefined ? mode.plans[plan].f : tempF;
  const shown = unit === 'F' ? startF : Math.round(fToC(startF));
  const pick = (id: string) => {
    const m = MODES.find((x) => x.id === id)!;
    setModeId(id);
    setTempF(m.defaultF);
    setPlan(validPlan(m, undefined));
    setTimerMin(m.timed?.defaultMin ?? 0);
  };
  const clampF = (f: number) => Math.min(mode.maxF, Math.max(mode.minF, Math.round(f / STEP_F) * STEP_F));
  const nudge = (d: 1 | -1) => setTempF((t) => clampF(t + d * STEP_F));

  async function start() {
    if (!link) return;
    setBusy(true);
    setError(null);
    try {
      await link.preheat(mode.id, fToC(startF), plan);
      // Counted only when the oven accepts: a review opened and cancelled is not a use.
      countUse(mode.id);
      recordCook(mode.id, startF, plan, { timerMin: timerMin || undefined });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
      // The timer waits for the oven to report the new cook's plan (LiveOven.runningPlan).
      if (timerMin) {
        await link.setTimer(timerMin * 60_000).catch((e) => {
          tell(`${mode.label} started without its timer`, `${e instanceof OvenError ? e.message : 'The timer wasn’t set.'} Add time on the oven's page.`);
        });
      }
    } catch (e) {
      setError(e instanceof OvenError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function later(startAt: number) {
    scheduleCook({ mode: mode.id, tempF: startF, plan, timerMin, startAt });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  }

  // A timed mode's timer is the review's own control; a self-timed plan has none.
  const timer = mode.timed || mode.noTimer ? null : (
    <View style={{ gap: space[3] }}>
      <SectionLabel>Timer (optional)</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {TIMERS.map((m) => (
          <Chip key={m} selected={timerMin === m} onPress={() => setTimerMin(m)}>
            {m === 0 ? 'No timer' : m < 60 ? `${m} min` : `${m / 60 === 1 ? '1 hr' : '1½ hr'}`}
          </Chip>
        ))}
      </View>
    </View>
  );

  if (glass) {
    return (
      <GlassReview
        mode={mode} tempF={startF} setTempF={(f) => setTempF(clampF(f))} nudge={nudge} unit={unit} plan={plan} setPlan={setPlan}
        timerMin={timerMin} setTimerMin={setTimerMin} busy={busy} error={error} onStart={start} onLater={later} timer={timer}
      />
    );
  }
  return <JulyCook modeId={modeId} pick={pick} tempF={startF} plan={plan} setPlan={setPlan} shown={shown} nudge={nudge} unit={unit} timerMin={timerMin} setTimerMin={setTimerMin} busy={busy} error={error} onStart={start} onLater={later} timer={timer} />;
}

// --- Still Glass: the card's review (july-oven-card.js, review) ------------------

function GlassReview({ mode, tempF, setTempF, nudge, unit, plan, setPlan, timerMin, setTimerMin, busy, error, onStart, onLater, timer }: {
  mode: CookMode; tempF: number; setTempF: (f: number) => void; nudge: (d: 1 | -1) => void; unit: 'F' | 'C';
  plan: number | undefined; setPlan: (plan: number) => void;
  timerMin: number; setTimerMin: (min: number) => void;
  busy: boolean; error: string | null; onStart: () => void; onLater: (startAt: number) => void; timer: React.ReactNode;
}) {
  const { c, f, r, t } = useTheme();
  const name = useOvenName();
  const [openedAt] = useState(() => Date.now());
  const now = useNow(true);
  const closesIn = Math.max(0, REVIEW_MS - (now - openedAt));
  const later = useLater();
  // What is being typed into the number, until Enter or leaving the field.
  const [typed, setTyped] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => { if (router.canGoBack()) router.back(); }, REVIEW_MS);
    return () => clearTimeout(id);
  }, []);

  const toF = (v: number) => (unit === 'F' ? v : cToF(v));
  const fromF = (v: number) => (unit === 'F' ? v : Math.round(fToC(v)));
  const lo = fromF(mode.minF);
  const hi = fromF(mode.maxF);
  const shown = fromF(tempF);

  function onType(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 3);
    setTyped(digits);
    // The slider follows any value in range; the number snaps when committed.
    const v = parseInt(digits, 10);
    if (v >= lo && v <= hi) setTempF(toF(v));
  }
  function commit() {
    const v = parseInt(typed ?? '', 10);
    if (Number.isFinite(v)) setTempF(toF(Math.max(lo, Math.min(hi, v))));
    setTyped(null);
  }

  return (
    <>
      <Stack.Screen options={{ title: `${mode.label} · ${name}` }} />
      <Screen
        footer={
          <>
            {error ? <Notice tone="warning" title="The oven didn't start">{error}</Notice> : null}
            {later.open && later.startAt ? (
              <T v="small" muted>
                Nothing heats until {startsAtLabel(later.startAt)}. Keep this app open on your home Wi-Fi. This closes in{' '}
                <Text style={{ fontFamily: f.sansStrong, color: c.ink }}>{formatDuration(closesIn)}</Text>.
              </T>
            ) : (
              <T v="small" muted>
                Make sure the oven is empty and the door is closed. Nothing heats until you press Start. This closes in{' '}
                <Text style={{ fontFamily: f.sansStrong, color: c.ink }}>{formatDuration(closesIn)}</Text>.
              </T>
            )}
            <View style={{ flexDirection: 'row', gap: space[3] }}>
              <Button style={{ flexGrow: 0, flexShrink: 0, minWidth: 116 }} onPress={() => (later.open ? later.close() : router.back())}>
                {later.open ? 'Back' : 'Not now'}
              </Button>
              {later.open && later.startAt ? (
                <Button style={{ flex: 1 }} variant="primary" busy={busy} onPress={() => onLater(later.startAt!)}>
                  {`Start at ${startsAtLabel(later.startAt)}`}
                </Button>
              ) : (
                <Button style={{ flex: 1 }} variant="primary" busy={busy} onPress={onStart}>Start preheating</Button>
              )}
            </View>
            {later.open ? null : <Button variant="quiet" onPress={() => later.pick(30)}>Start later</Button>}
          </>
        }
      >
        <Text style={[t.label, { color: c.inkMuted, marginBottom: -space[3] }]}>Step 2 of 2 · Review</Text>

        <View style={[styles.tempBox, { borderRadius: r.lg, borderColor: c.line, backgroundColor: c.surfaceRaised }]}>
          <GlassFill />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
            <ModeTile mode={mode.id} label="" size={64} accessibilityLabel={mode.label} />
            {mode.plans ? (
              <View style={{ flex: 1 }}><PlanPicker mode={mode} plan={plan!} setPlan={setPlan} compact /></View>
            ) : mode.timed ? (
              <View style={{ flex: 1 }}><TimerControl min={timerMin} max={mode.timed.maxMin} setMin={setTimerMin} size={34} /></View>
            ) : isFixed(mode) ? (
              <View style={{ flex: 1 }}><FixedTemp tempF={tempF} unit={unit} size={52} /></View>
            ) : (
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                <RoundButton icon="minus" label="Lower the temperature" onPress={() => nudge(-1)} disabled={tempF <= mode.minF} size={48} />
                <Pressable style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }} accessible={false}>
                  <TextInput
                    value={typed ?? String(shown)}
                    onChangeText={onType}
                    onFocus={() => { setFocused(true); setTyped(String(shown)); }}
                    onBlur={() => { setFocused(false); commit(); }}
                    onSubmitEditing={commit}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    maxLength={3}
                    selectTextOnFocus
                    accessibilityLabel={`Temperature in °${unit}: type a number from ${lo} to ${hi}`}
                    style={{
                      width: 92, paddingVertical: 0, paddingBottom: 2, textAlign: 'center',
                      fontFamily: f.number, fontSize: 52, lineHeight: 58, color: c.ink, fontVariant: ['tabular-nums'],
                      borderBottomWidth: 2, borderStyle: focused ? 'solid' : 'dashed', borderBottomColor: focused ? c.ember : c.lineStrong,
                    }}
                  />
                  <Text style={{ fontFamily: f.sans, fontSize: 16, color: c.inkMuted }}>°{unit}</Text>
                </Pressable>
                <RoundButton icon="plus" label="Raise the temperature" onPress={() => nudge(1)} disabled={tempF >= mode.maxF} size={48} />
              </View>
            )}
          </View>
          {mode.plans ? (
            <PlanUnder mode={mode} plan={plan!} setPlan={setPlan} tempF={tempF} unit={unit} />
          ) : mode.timed ? (
            <TimerSlider min={timerMin} max={mode.timed.maxMin} setMin={setTimerMin} note={`Reheats at ${atTemp(tempF, unit)}`} />
          ) : isFixed(mode) ? (
            <T v="small" muted style={{ textAlign: 'center' }}>The oven sets this temperature</T>
          ) : (
            <View>
              <Slider
                value={tempF}
                min={mode.minF}
                max={mode.maxF}
                step={STEP_F}
                onChange={(v) => { setTyped(null); setTempF(v); }}
                accessibilityLabel={`Temperature in °${unit}`}
                valueText={`${shown}°${unit}`}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 }}>
                <T v="small" muted>{lo}°</T>
                <T v="small" muted>{hi}°</T>
              </View>
            </View>
          )}
          <T v="small" muted style={{ textAlign: 'center' }}>{mode.hint}</T>
        </View>

        {timer}

        {later.open ? <LaterPicks later={later} now={now} /> : null}
      </Screen>
    </>
  );
}

// --- July -------------------------------------------------------------------------

function JulyCook({ modeId, pick, tempF, plan, setPlan, shown, nudge, unit, timerMin, setTimerMin, busy, error, onStart, onLater, timer }: {
  modeId: string; pick: (id: string) => void; tempF: number; plan: number | undefined; setPlan: (plan: number) => void; shown: number; nudge: (d: 1 | -1) => void; unit: 'F' | 'C';
  timerMin: number; setTimerMin: (min: number) => void;
  busy: boolean; error: string | null; onStart: () => void; onLater: (startAt: number) => void; timer: React.ReactNode;
}) {
  const { c, f, r } = useTheme();
  const mode = MODES.find((m) => m.id === modeId)!;
  const later = useLater();
  const now = useNow(later.open);
  return (
    <Screen
      footer={
        <>
          {error ? <Notice tone="warning" title="The oven didn't start">{error}</Notice> : null}
          {later.open && later.startAt ? (
            <>
              <Button variant="primary" busy={busy} onPress={() => onLater(later.startAt!)}>{`Start at ${startsAtLabel(later.startAt)}`}</Button>
              <Button variant="quiet" onPress={later.close}>Start now instead</Button>
              <T v="small" muted style={{ textAlign: 'center' }}>Nothing heats until then. Keep this app open on your home Wi-Fi.</T>
            </>
          ) : (
            <>
              <Button variant="primary" icon="flame" busy={busy} onPress={onStart}>{mode.plans || mode.timed ? `Start ${mode.label.toLowerCase()}` : `Preheat to ${shown}°${unit}`}</Button>
              <Button variant="quiet" onPress={() => later.pick(30)}>Start later</Button>
              <T v="small" muted style={{ textAlign: 'center' }}>The oven lets you know when it’s hot.</T>
            </>
          )}
        </>
      }
    >
      <View style={{ gap: space[3] }}>
        <SectionLabel>Cook mode</SectionLabel>
        <View style={styles.grid}>
          {MODES.map((m) => {
            const on = m.id === modeId;
            return (
              <Pressable
                key={m.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${m.label}. ${m.hint}`}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); pick(m.id); }}
                style={({ pressed }) => [
                  styles.tile,
                  { borderRadius: r.md, borderColor: on ? c.ember : c.line, backgroundColor: on ? c.emberSoft : pressed ? c.surfaceSunken : c.surfaceRaised },
                  on && { borderWidth: 2 },
                ]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontFamily: f.sansStrong, fontSize: 18, color: on ? c.ember : c.ink }}>{m.label}</Text>
                  {on ? <Icon name="check-circle" size={20} color={c.ember} /> : null}
                </View>
                <Text style={{ fontFamily: f.sans, fontSize: 15, lineHeight: 20, color: c.inkMuted }} numberOfLines={2}>{m.hint}</Text>              </Pressable>
            );
          })}
        </View>
      </View>

      {mode.plans ? (
        <View style={{ gap: space[3] }}>
          <SectionLabel>{mode.planPicker === 'level' ? 'Level' : 'Heat'}</SectionLabel>
          <PlanPicker mode={mode} plan={plan!} setPlan={setPlan} />
          <PlanUnder mode={mode} plan={plan!} setPlan={setPlan} tempF={tempF} unit={unit} />
        </View>
      ) : mode.timed ? (
        <View style={{ gap: space[3] }}>
          <SectionLabel>Timer</SectionLabel>
          <View style={[styles.julyTimer, { borderRadius: r.lg, backgroundColor: c.surfaceRaised, borderColor: c.line }]}>
            <TimerControl min={timerMin} max={mode.timed.maxMin} setMin={setTimerMin} size={48} />
            <TimerSlider min={timerMin} max={mode.timed.maxMin} setMin={setTimerMin} note={`Reheats at ${atTemp(tempF, unit)}`} />
          </View>
        </View>
      ) : isFixed(mode) ? (
        <View style={{ gap: space[3] }}>
          <SectionLabel>Temperature</SectionLabel>
          <View style={[styles.julyTimer, { borderRadius: r.lg, backgroundColor: c.surfaceRaised, borderColor: c.line, alignItems: 'center' }]}>
            <FixedTemp tempF={tempF} unit={unit} size={64} />
            <T v="small" muted>The oven sets this temperature</T>
          </View>
        </View>
      ) : (
        <View style={{ gap: space[3] }}>
          <SectionLabel>Temperature</SectionLabel>
          <View style={[styles.julyTemp, { borderRadius: r.lg, backgroundColor: c.surfaceRaised, borderColor: c.line }]}>
            <RoundButton icon="minus" label="Lower by 5 degrees" onPress={() => nudge(-1)} disabled={tempF <= mode.minF} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text accessibilityLiveRegion="polite" style={{ fontFamily: f.number, fontSize: 64, lineHeight: 70, color: c.ink, fontVariant: ['tabular-nums'] }}>
                {shown}°
              </Text>
              <T v="small" muted>{unit === 'F' ? `Fahrenheit · ${Math.round(fToC(tempF))}°C` : `Celsius · ${Math.round(cToF(fToC(tempF)))}°F`}</T>
            </View>
            <RoundButton icon="plus" label="Raise by 5 degrees" onPress={() => nudge(1)} disabled={tempF >= mode.maxF} />
          </View>
        </View>
      )}

      {timer}

      {later.open ? <LaterPicks later={later} now={now} /> : null}
    </Screen>
  );
}

function useLater() {
  const [open, setOpen] = useState(false);
  const [delayMin, setDelayMin] = useState(30);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const pick = (min: number, fromType = false) => {
    const at = fromDelayMin(Date.now(), min);
    if (!at) return;
    setDelayMin(clampDelayMin(min));
    setStartAt(at);
    setOpen(true);
    if (!fromType) setTyped('');
  };
  const close = () => { setOpen(false); setTyped(''); };
  const type = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 3);
    const n = parseInt(digits, 10);
    // Past 12 hours the field shows the 12 hours the start will use.
    setTyped(n > MAX_DELAY_MIN ? String(MAX_DELAY_MIN) : digits);
    if (n >= 1) pick(n, true);
  };
  return { open, delayMin, startAt, typed, pick, close, type };
}

function LaterPicks({ later, now }: { later: ReturnType<typeof useLater>; now: number }) {
  return (
    <View style={{ gap: space[3] }}>
      <SectionLabel>Start later</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {DELAYS_MIN.map((m) => (
          <Chip key={m} selected={later.delayMin === m && !later.typed} onPress={() => later.pick(m)}>
            {delayLabel(m)}
          </Chip>
        ))}
      </View>
      <Field
        label="Minutes from now"
        value={later.typed}
        onChangeText={later.type}
        keyboardType="number-pad"
        hint={`1 min to ${delayLabel(MAX_DELAY_MIN)}`}
      />
      {later.startAt ? (
        <T muted>{`Starts at ${startsAtLabel(later.startAt)} · in ${startsIn(later.startAt, now)}`}</T>
      ) : null}
    </View>
  );
}

// --- Plans (toast level, grill heat) and the reheat timer: the card's review controls ---

const atTemp = (tempF: number, unit: 'F' | 'C') => `${unit === 'F' ? tempF : Math.round(fToC(tempF))} °${unit}`;

const timerText = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} hr${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);

/** The temperature a fixed mode runs at, shown rather than picked. */
function FixedTemp({ tempF, unit, size }: { tempF: number; unit: 'F' | 'C'; size: number }) {
  const { c, f } = useTheme();
  return (
    <View accessible accessibilityLabel={`${atTemp(tempF, unit)}, set by the oven`} style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 2 }}>
      <Text style={{ fontFamily: f.number, fontSize: size, lineHeight: size * 1.1, color: c.ink, fontVariant: ['tabular-nums'] }}>
        {unit === 'F' ? tempF : Math.round(fToC(tempF))}
      </Text>
      <Text style={{ fontFamily: f.sans, fontSize: 16, color: c.inkMuted }}>°{unit}</Text>
    </View>
  );
}

/**
 * The mode's plan: grill's heats side by side, Low to High as on the card; toast's level
 * as a big number with − / +, its slider under it (PlanUnder).
 */
function PlanPicker({ mode, plan, setPlan, compact }: { mode: CookMode; plan: number; setPlan: (plan: number) => void; compact?: boolean }) {
  const { c, f } = useTheme();
  const plans = mode.plans!;
  if (mode.planPicker === 'level') {
    const size = compact ? 40 : 48;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <RoundButton icon="minus" label={`Lighter ${mode.label.toLowerCase()}`} onPress={() => setPlan(plan - 1)} disabled={plan <= 0} size={size} />
        <Text
          accessibilityLabel={`${mode.label} level ${plans[plan].label} of ${plans.length}`}
          style={{ minWidth: 56, textAlign: 'center', fontFamily: f.number, fontSize: compact ? 52 : 64, lineHeight: compact ? 58 : 70, color: c.ink, fontVariant: ['tabular-nums'] }}
        >
          {plans[plan].label}
        </Text>
        <RoundButton icon="plus" label={`Darker ${mode.label.toLowerCase()}`} onPress={() => setPlan(plan + 1)} disabled={plan >= plans.length - 1} size={size} />
      </View>
    );
  }
  return (
    <Segmented
      value={String(plan)}
      options={plans.map((p, i) => ({ value: String(i), label: p.label })).reverse()}
      onChange={(v) => setPlan(Number(v))}
      label={`${mode.label} heat`}
    />
  );
}

/** Under the plan: toast's 1 Light to 9 Dark slider, or the temperature grill's heat runs at. */
function PlanUnder({ mode, plan, setPlan, tempF, unit }: { mode: CookMode; plan: number; setPlan: (plan: number) => void; tempF: number; unit: 'F' | 'C' }) {
  const plans = mode.plans!;
  if (mode.planPicker === 'level') {
    return (
      <View>
        <Slider
          value={plan + 1} min={1} max={plans.length} step={1}
          onChange={(v) => setPlan(v - 1)}
          accessibilityLabel={`${mode.label} level, 1 to ${plans.length}`}
          valueText={plans[plan].label}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 }}>
          <T v="small" muted>1 · Light</T>
          <T v="small" muted>{`${plans.length} · Dark`}</T>
        </View>
      </View>
    );
  }
  return <T v="small" muted style={{ textAlign: 'center' }}>{`Grills at ${atTemp(tempF, unit)}`}</T>;
}

/**
 * A timed mode's timer, as the card's reheat review: − / + a minute, and the time typed as
 * minutes, or hours and minutes from an hour on. The split stays put while typing, so "90"
 * typed into minutes becomes 1 hr 30 min only on leaving the field.
 */
function TimerControl({ min, max, setMin, size }: { min: number; max: number; setMin: (m: number) => void; size: number }) {
  const { c, f } = useTheme();
  const [typed, setTyped] = useState<{ h: string; m: string; withH: boolean } | null>(null);
  const [focused, setFocused] = useState<'h' | 'm' | null>(null);
  const withH = typed ? typed.withH : min >= 60;
  const h = typed?.h ?? String(Math.floor(min / 60));
  const m = typed?.m ?? String(withH ? min % 60 : min);
  const total = (t: { h: string; m: string; withH: boolean }) => (t.withH ? (parseInt(t.h, 10) || 0) * 60 : 0) + (parseInt(t.m, 10) || 0);
  const clamp = (v: number) => Math.min(max, Math.max(1, Math.round(v)));

  function onType(field: 'h' | 'm', text: string) {
    const next = { h, m, withH, [field]: text.replace(/\D/g, '').slice(0, field === 'h' ? 2 : 3) };
    setTyped(next);
    // Start can be pressed without leaving the field, so the timer follows (clamped) as typed.
    const v = total(next);
    if (v >= 1) setMin(clamp(v));
  }
  function commit() {
    if (typed) setMin(clamp(total(typed)));
    setTyped(null);
    setFocused(null);
  }
  const field = (which: 'h' | 'm', value: string, unitLabel: string, digits: number) => (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
      <TextInput
        value={value}
        onChangeText={(text) => onType(which, text)}
        onFocus={() => { setFocused(which); setTyped({ h, m, withH }); }}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="number-pad"
        returnKeyType="done"
        maxLength={which === 'h' ? 2 : 3}
        selectTextOnFocus
        accessibilityLabel={which === 'h' ? 'Timer hours' : 'Timer minutes'}
        style={{
          width: size * 0.48 * digits + 6, paddingVertical: 0, paddingBottom: 2, textAlign: 'center',
          fontFamily: f.number, fontSize: size, lineHeight: size * 1.1, color: c.ink, fontVariant: ['tabular-nums'],
          borderBottomWidth: 2, borderStyle: focused === which ? 'solid' : 'dashed', borderBottomColor: focused === which ? c.ember : c.lineStrong,
        }}
      />
      <Text style={{ fontFamily: f.sans, fontSize: size < 44 ? 14 : 16, color: c.inkMuted }}>{unitLabel}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: size < 44 ? 6 : 10 }}>
      <RoundButton icon="minus" label="Shorten the timer" onPress={() => { setTyped(null); setMin(clamp(min - 1)); }} disabled={min <= 1} size={size < 44 ? 40 : 48} />
      <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        {withH ? field('h', h, 'hr', 2) : null}
        {field('m', m, 'min', withH ? 2 : 3)}
      </View>
      <RoundButton icon="plus" label="Lengthen the timer" onPress={() => { setTyped(null); setMin(clamp(min + 1)); }} disabled={min >= max} size={size < 44 ? 40 : 48} />
    </View>
  );
}

/** The timer's 1 minute to `max` slider, with what the oven does in the middle of its ends. */
function TimerSlider({ min, max, setMin, note }: { min: number; max: number; setMin: (m: number) => void; note: string }) {
  return (
    <View>
      <Slider value={min} min={1} max={max} step={1} onChange={setMin} accessibilityLabel="Timer in minutes" valueText={timerText(min)} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 }}>
        <T v="small" muted>1 min</T>
        <T v="small" muted>{note}</T>
        <T v="small" muted>{timerText(max)}</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  tile: { flexBasis: '47%', flexGrow: 1, minHeight: 88, padding: space[4], borderWidth: 1, gap: space[1] },
  tempBox: { padding: space[5], borderWidth: 1, overflow: 'hidden', gap: space[3] },
  julyTemp: { flexDirection: 'row', alignItems: 'center', gap: space[4], padding: space[5], borderWidth: 1 },
  julyTimer: { gap: space[3], padding: space[5], borderWidth: 1 },
});
