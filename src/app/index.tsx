import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OvenError, type OvenLink, type OvenSnapshot } from '@/api/client';
import { MODES, fToC, isFixed, show, formatDuration } from '@/api/modes';
import { bannerCopy, ovenGate } from '@/api/schedule';
import { CameraTile } from '@/components/CameraTile';
import { DONE_WINDOW_MS, GlassHero } from '@/components/GlassHero';
import { Icon, JulyMark, type IconName } from '@/components/Icon';
import { OvenHero, remainingNow, useNow } from '@/components/OvenHero';
import { Button, Card, Chip, IconButton, Notice, RoundButton, Screen, SectionLabel, T, confirm } from '@/components/ui';
import { useOven, useSnapshot, type OvenEntry } from '@/state/oven';
import { space, useTheme } from '@/theme';

export default function Home() {
  const { ready, link } = useOven();
  const { c } = useTheme();
  if (!ready) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }}><ActivityIndicator color={c.ember} /></View>;
  }
  return link ? <Dashboard /> : <Welcome />;
}

// --- Welcome -----------------------------------------------------------------

function Welcome() {
  const { c, f, t } = useTheme();
  const { startDemo } = useOven();
  const insets = useSafeAreaInsets();
  const points: [IconName, string, string][] = [
    ['house', 'Stays at home', 'Your oven, phone and camera talk only on your own Wi-Fi.'],
    ['thermometer', 'Full control', 'Preheat, change the temperature, set timers and stop a cook.'],
    ['camera', 'Live camera', 'Watch the food cook from the sofa. No picture ever leaves the house.'],
  ];
  return (
    <Screen
      footer={
        <>
          <Button variant="primary" onPress={() => router.push('/setup')}>Set up this phone</Button>
          <Button variant="quiet" onPress={startDemo}>Try the demo first</Button>
        </>
      }
    >
      <View style={{ paddingTop: insets.top + space[8], gap: space[5] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
          <View style={[styles.markDisc, { backgroundColor: c.emberSoft }]}>
            <JulyMark size={52} color={c.ember} />
          </View>
          <View accessible accessibilityLabel="Project July. June, now local.">
            <Text style={{ fontFamily: f.display, fontSize: 24, lineHeight: 30, color: c.ink }}>Project July</Text>
            <Text style={[t.label, { color: c.ember }]}>June, now local</Text>
          </View>
        </View>
        <Text accessibilityRole="header" style={[t.hero, { color: c.ink, fontSize: 48, lineHeight: 54 }]}>
          Your oven keeps working.
        </Text>
        <T v="lead" muted>Project July connects this phone to your June oven over your home network. No cloud, no subscription.</T>
      </View>
      <View style={{ gap: space[5] }}>
        {points.map(([icon, title, body]) => (
          <View key={title} style={{ flexDirection: 'row', gap: space[4] }}>
            <View style={[styles.pointIcon, { backgroundColor: c.surfaceSunken }]}>
              <Icon name={icon} color={c.ember} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="bodyStrong">{title}</T>
              <T muted>{body}</T>
            </View>
          </View>
        ))}
      </View>
      <T v="small" muted>A community project. Not made by, or affiliated with, June or Weber.</T>
    </Screen>
  );
}

// --- Dashboard ---------------------------------------------------------------
// One page per paired oven; swipe sideways (or tap a dot) to switch. The page in
// view is the current oven, which Settings, Start a cook and Live view act on.

function Dashboard() {
  const { c, f, t, look } = useTheme();
  const { ovens, currentId, select, link } = useOven();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const focused = useIsFocused();
  const pager = useRef<ScrollView>(null);
  const offset = useRef(0);
  const index = Math.max(0, ovens.findIndex((o) => o.id === currentId));
  const many = ovens.length > 1;

  // Follow the current oven when it changes elsewhere (Settings, a new pairing), but
  // not while a swipe is what changed it.
  useEffect(() => {
    if (Math.round(offset.current / width) !== index) pager.current?.scrollTo({ x: index * width, animated: false });
  }, [index, width]);

  const goTo = (i: number) => {
    pager.current?.scrollTo({ x: i * width, animated: true });
    if (ovens[i]) select(ovens[i].id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <View style={[styles.topBar, { paddingTop: insets.top + space[2] }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <JulyMark size={28} color={c.ember} />
          <Text style={{ fontFamily: f.display, fontSize: 20, color: c.ink }}>Project July</Text>
          {link?.demo ? (
            <View style={[styles.demoTag, { backgroundColor: c.heatSoft }]}>
              <Text style={[t.label, { color: c.heat }]}>Demo</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row' }}>
          <IconButton icon="history" label="Cook history" onPress={() => router.push('/history')} />
          <IconButton icon="gear" label="Settings" onPress={() => router.push('/settings')} />
        </View>
      </View>

      {many ? (
        // Swiping is never the only way: each dot is a 48 px button. The July page
        // already has the oven's name as its title, so there the dots stand alone.
        <View style={[styles.switcher, look.hero !== 'glass' && { justifyContent: 'center' }]}>
          {look.hero === 'glass' ? (
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: f.sansStrong, fontSize: 16, color: c.ink }}>{ovens[index]?.name}</Text>
          ) : null}
          <View style={{ flexDirection: 'row' }}>
            {ovens.map((o, i) => (
              <Pressable
                key={o.id}
                accessibilityRole="button"
                accessibilityLabel={`Show ${o.name}, oven ${i + 1} of ${ovens.length}`}
                accessibilityState={{ selected: i === index }}
                onPress={() => goTo(i)}
                style={styles.dot}
              >
                <View style={{ width: i === index ? 18 : 8, height: 8, borderRadius: 4, backgroundColor: i === index ? c.ember : c.ink, opacity: i === index ? 1 : 0.28 }} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        scrollEnabled={many}
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: index * width, y: 0 }}
        scrollEventThrottle={32}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.x;
          const o = ovens[Math.round(offset.current / width)];
          if (o && o.id !== currentId) select(o.id);
        }}
        style={{ flex: 1 }}
      >
        {ovens.map((o, i) => (
          <View key={o.id} style={{ width }} accessibilityLabel={many ? `${o.name}, oven ${i + 1} of ${ovens.length}` : undefined}>
            <OvenPage entry={o} visible={focused && i === index} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function OvenPage({ entry, visible }: { entry: OvenEntry; visible: boolean }) {
  const { c, t, look } = useTheme();
  const { prefs, lastCooks, select } = useOven();
  const insets = useSafeAreaInsets();
  const link = entry.link;
  const s = useSnapshot(link);
  const name = entry.name;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissedDone, setDismissedDone] = useState(false);
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unit = prefs.unit;
  const glass = look.hero === 'glass';

  // A new cook re-arms the "finished" notice (state adjusted during render, not in an effect).
  const [wasActive, setWasActive] = useState(s.active);
  if (s.active !== wasActive) {
    setWasActive(s.active);
    if (s.active) setDismissedDone(false);
  }
  // Glass: Done shows from when the cook completed, for 30 minutes or until dismissed.
  const done = s.phase === 'done' && !dismissedDone ? { at: s.endedAt } : null;

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof OvenError ? e.message : 'Something went wrong. Try again.');
      if (errTimer.current) clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setError(null), 8000);
    } finally {
      setBusy(null);
    }
  }

  // Screens opened from here act on the current oven: make sure it is this one.
  const open = (href: Parameters<typeof router.push>[0]) => { select(entry.id); router.push(href); };

  const offline = s.link === 'offline' || s.ovenOnline === false;
  const now = useNow(s.remainingMs !== null || done !== null);
  const left = remainingNow(s, now);
  const showDone = done !== null && (done.at === null || now - done.at < DONE_WINDOW_MS);
  const connection = link.demo ? 'Simulated. Nothing is sent to an oven.'
    : s.link === 'connecting' ? 'Connecting on your home network…'
    : offline ? 'Not connected'
    : `Connected at home · ${entry.paired?.conn.host}`;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space[8] }}>
      <View style={styles.page}>
        {glass ? (
          // The oven's own screen carries its name; only the connection line sits above it.
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Icon name={offline ? 'alert' : 'house'} size={18} color={offline ? c.fault : c.inkMuted} />
            <T v="small" muted style={{ flexShrink: 1 }}>{connection}</T>
          </View>
        ) : (
          <View style={{ gap: space[1] }}>
            <Text accessibilityRole="header" style={[t.title, { color: c.ink }]}>{name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Icon name={offline ? 'alert' : 'house'} size={18} color={offline ? c.fault : c.inkMuted} />
              <T v="small" muted style={{ flexShrink: 1 }}>{connection}</T>
            </View>
          </View>
        )}

        {offline && !link.demo ? (
          <Notice tone="warning" title="Can't reach the oven">
            Check that this phone is on your home Wi-Fi and the oven is switched on. The app keeps trying on its own.
          </Notice>
        ) : null}

        <ScheduleBanner entryId={entry.id} s={s} unit={unit} run={run} visible={visible} />

        {glass ? (
          <GlassHero
            s={s}
            unit={unit}
            demo={!!link.demo}
            name={name}
            // Stop is one tap and never confirmed (DESIGN.md, "The rules every state follows").
            onStop={() => run('cancel', () => link.cancel())}
            stopping={busy === 'cancel'}
            onAddMinutes={(min) => run('timer', () => link.setTimer((left ?? 0) + min * 60_000))}
            onMode={(mode) => open({ pathname: '/cook', params: { mode } })}
            onRepeat={(mode, tempF, plan) => open({ pathname: '/cook', params: { mode, temp: String(tempF), ...(plan === undefined ? {} : { plan: String(plan) }) } })}
            onCamera={() => open('/camera')}
            lastCook={lastCooks[entry.id] ?? null}
            done={done}
            onDismissDone={() => setDismissedDone(true)}
          />
        ) : (
          <OvenHero s={s} unit={unit} demo={!!link.demo} onCamera={() => open('/camera')} />
        )}

        {glass && !offline && (s.active || showDone) ? (
          <CameraTile name={name} demo={!!link.demo} on={visible} onFullscreen={() => open('/camera')} />
        ) : null}

        {error ? <Notice tone="warning" title="That didn't work">{error}</Notice> : null}

        {s.offer ? (
          <Notice tone="info" title={s.offer.type === 'keep_longer' ? 'The oven suggests a little longer' : 'The oven thinks it may be done early'}>
            {`About ${Math.round(s.offer.durationMs / 60000)} min ${s.offer.type === 'keep_longer' ? 'more' : 'less'}.`}
          </Notice>
        ) : null}
        {s.offer ? (
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            <Button style={{ flex: 1 }} onPress={() => run('offer', () => link.respondToOffer(true))}>Accept</Button>
            <Button style={{ flex: 1 }} variant="quiet" onPress={() => run('offer', () => link.respondToOffer(false))}>No thanks</Button>
          </View>
        ) : null}

        {!glass && s.phase === 'done' && !dismissedDone ? (
          <Notice tone="success" title="Cooking finished">The oven has switched off its heat and is cooling down.</Notice>
        ) : null}

        {s.active ? (
          <ActiveControls s={s} link={link} unit={unit} busy={busy} run={run} />
        ) : glass ? null : (
          <IdleControls
            disabled={offline && !link.demo}
            open={open}
            onDismissDone={() => setDismissedDone(true)}
            showDismiss={s.phase === 'done' && !dismissedDone}
          />
        )}
      </View>
    </ScrollView>
  );
}

function ScheduleBanner({ entryId, s, unit, run, visible }: {
  entryId: string; s: OvenSnapshot; unit: 'F' | 'C';
  run: (key: string, fn: () => Promise<void>) => Promise<void>;
  /** Only the oven on screen asks; another asks when swiped to. */
  visible: boolean;
}) {
  const { schedules, cancelSchedule, startScheduled } = useOven();
  const scheduled = schedules[entryId];
  const now = useNow(!!scheduled);
  const asked = useRef<string | null>(null);
  const gate = ovenGate(s);
  const copy = scheduled ? bannerCopy(scheduled, now, gate, unit) : null;

  useEffect(() => {
    if (!visible || !scheduled || copy?.kind !== 'ask') return;
    if (asked.current === scheduled.startAt + ':' + scheduled.createdAt) return;
    asked.current = scheduled.startAt + ':' + scheduled.createdAt;
    // Not now (or dismissing) leaves the start pending: the banner keeps Cancel and Start now.
    const why = scheduled.failed ? `The oven did not start: ${scheduled.failed}` : 'The oven did not preheat at the time you set.';
    void confirm(copy.title, `${why} Start this cook now?`, 'Start now', 'Not now')
      .then((ok) => { if (ok) void run('sched', () => startScheduled(entryId)); });
  }, [visible, scheduled, copy?.kind, copy?.title, entryId, run, startScheduled]);

  if (!scheduled || !copy) return null;

  return (
    <View style={{ gap: space[3] }}>
      <Notice tone={copy.kind === 'ask' ? 'warning' : copy.kind === 'start' ? 'success' : 'info'} title={copy.title}>
        {copy.body}
      </Notice>
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <Button style={{ flex: 1 }} variant="quiet" onPress={() => cancelSchedule(entryId)}>Cancel</Button>
        <Button
          style={{ flex: 1 }}
          variant="primary"
          busy={copy.kind === 'start'}
          onPress={() => run('sched', () => startScheduled(entryId))}
        >
          Start now
        </Button>
      </View>
    </View>
  );
}

function IdleControls({ disabled, open, onDismissDone, showDismiss }: {
  disabled: boolean; open: (href: Parameters<typeof router.push>[0]) => void; onDismissDone: () => void; showDismiss: boolean;
}) {
  const { prefs } = useOven();
  const quick = MODES.slice(0, 3);
  return (
    <View style={{ gap: space[4] }}>
      <Button variant="primary" icon="flame" disabled={disabled} onPress={() => { onDismissDone(); open('/cook'); }}>
        Start cooking
      </Button>
      <SectionLabel>Quick start</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {quick.map((m) => (
          <Chip key={m.id} onPress={() => open({ pathname: '/cook', params: { mode: m.id } })}>
            {`${m.label} ${prefs.unit === 'F' ? m.defaultF : Math.round(fToC(m.defaultF) / 5) * 5}°`}
          </Chip>
        ))}
      </View>
      {showDismiss ? <Button variant="quiet" onPress={onDismissDone}>Dismiss</Button> : null}
    </View>
  );
}

function ActiveControls({ s, link, unit, busy, run }: {
  s: OvenSnapshot; link: OvenLink; unit: 'F' | 'C'; busy: string | null;
  run: (key: string, fn: () => Promise<void>) => Promise<void>;
}) {
  const { c, f, look } = useTheme();
  const step = unit === 'F' ? 5 : 5 * (5 / 9);
  const [pendingC, setPendingC] = useState<number | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownTarget = pendingC ?? s.targetC;
  const now = useNow(s.remainingMs !== null);
  const left = remainingNow(s, now);
  // On glass the card already carries Stop and the +1/+5/+10 buttons.
  const glass = look.hero === 'glass';
  // The running mode's own range; a mode the oven sets the temperature for (toast, broil,
  // grill's heat, reheat…) has no − / +: a change would only run its plan at the wrong heat.
  const running = MODES.find((m) => m.id === s.mode);
  const tunable = !running || (!isFixed(running) && !running.plans);

  function nudge(dir: 1 | -1) {
    if (shownTarget === null || !tunable) return;
    const lo = fToC(running?.minF ?? 100), hi = fToC(running?.maxF ?? 450);
    const next = Math.min(hi, Math.max(lo, shownTarget + dir * step));
    setPendingC(next);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      run('temp', () => link.setTemperature(next)).finally(() => setPendingC(null));
    }, 900);
  }

  const addTimer = (min: number) => run('timer', () => link.setTimer((left ?? 0) + min * 60_000));

  return (
    <View style={{ gap: space[4] }}>
      <Card>
        <View style={{ gap: space[3] }}>
          <SectionLabel>Target temperature</SectionLabel>
          <View style={styles.stepper}>
            {tunable ? <RoundButton icon="minus" label={`Lower by 5 degrees`} onPress={() => nudge(-1)} /> : null}
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={{ fontFamily: f.number, fontSize: glass ? 56 : 48, lineHeight: glass ? 58 : 54, color: c.ink, fontVariant: ['tabular-nums'] }}>
                {show(shownTarget, unit)}°
              </Text>
              <T v="small" muted>{busy === 'temp' ? 'Sending to the oven…' : pendingC !== null ? 'Setting…' : !tunable ? 'Set by the oven' : unit === 'F' ? 'Fahrenheit' : 'Celsius'}</T>
            </View>
            {tunable ? <RoundButton icon="plus" label={`Raise by 5 degrees`} onPress={() => nudge(1)} /> : null}
          </View>
        </View>
      </Card>

      {glass && left !== null ? null : (
        <Card>
          <View style={{ gap: space[3] }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <SectionLabel>Timer</SectionLabel>
              {left !== null ? <T v="bodyStrong">{formatDuration(left)} left</T> : <T v="small" muted>Not set</T>}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {(left !== null ? [1, 5, 10] : [10, 20, 30, 45]).map((m) => (
                <Chip key={m} onPress={() => addTimer(m)} accessibilityLabel={left !== null ? `Add ${m} minutes` : `Set ${m} minute timer`}>
                  {left !== null ? `+${m} min` : `${m} min`}
                </Chip>
              ))}
            </View>
          </View>
        </Card>
      )}

      {glass ? null : (
        <Button
          variant="stop"
          icon="stop"
          busy={busy === 'cancel'}
          onPress={async () => {
            if (!look.confirmStop || await confirm('Stop cooking?', 'The oven will turn off its heat.', 'Stop cooking')) run('cancel', () => link.cancel());
          }}
        >
          Stop cooking
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  markDisc: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  pointIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: space[5], paddingRight: space[3], paddingBottom: space[2] },
  switcher: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], paddingLeft: space[5], paddingRight: space[3], marginTop: -space[2] },
  dot: { width: 32, height: 48, alignItems: 'center', justifyContent: 'center' },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: space[5], paddingTop: space[2], gap: space[6] },
  demoTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginLeft: space[1] },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
});
