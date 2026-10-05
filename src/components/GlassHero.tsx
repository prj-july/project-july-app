// The Still Glass oven tile: the Home Assistant July Oven card's layout on a
// phone (docs/july-oven-card/DESIGN.md, "The design as built"). One job per state:
//
//   running  name + red Stop | big number, status line, heat line | 4:3 camera
//            +1 · +5 · +10 min while a timer runs
//   done     "Take food out", with Food is out to dismiss
//   off      the oven's home screen: clock and date, then the mode tiles
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import type { OvenSnapshot } from '@/api/client';
import { MODES, QUICK_MODES, formatDuration, modeLabel, show, type Unit } from '@/api/modes';
import { space, useTheme } from '@/theme';
import { CameraPill, GlassFill, ModeTile, StatusLine, type MarkKind } from './glass';
import { Icon } from './Icon';
import { remainingNow, useNow } from './OvenHero';
import { Button, Chip, ProgressBar, type BarKind } from './ui';

const DEMO_IMAGE = require('../../assets/demo-camera.jpg');
const PX = 16;
const GAP = 16;

type Props = {
  s: OvenSnapshot;
  unit: Unit;
  demo: boolean;
  name: string;
  onCamera: () => void;
  onStop: () => void;
  stopping: boolean;
  onAddMinutes: (min: number) => void;
  onMode: (mode: string) => void;
  onMore: () => void;
  showDone: boolean;
  onDismissDone: () => void;
};

/** What the running card shows, from the oven's state (DESIGN.md, "States"). */
function running(s: OvenSnapshot, unit: Unit, left: number | null) {
  const offline = s.link === 'offline' || s.ovenOnline === false;
  const target = s.targetC !== null ? `${show(s.targetC, unit)}°` : null;
  const oven = `${show(s.cavityC, unit)}°`;
  const label = modeLabel(s.mode);
  const elapsed = s.elapsedMs ?? 0;
  if (offline) {
    return { mark: 'offline' as MarkKind, word: 'Offline', q: 'last reading', hero: oven, stale: true, bar: ['stale', 1] as [BarKind, number], a: 'Not connected to the oven', b: 'The app keeps trying on its own.' };
  }
  if (s.phase === 'preheating') {
    return { mark: 'preheat' as MarkKind, word: 'Preheating', q: target ? `to ${target}` : undefined, hero: oven, bar: ['preheat', s.progress ?? 0] as [BarKind, number], a: `${label}${target ? ` at ${target}` : ''}`, b: left !== null ? `Timer ${formatDuration(left)} once hot` : 'The oven lets you know when it’s hot.' };
  }
  if (s.probeC !== null) {
    const food = s.probeTargetC !== null ? `food · target ${show(s.probeTargetC, unit)}°` : 'food';
    return { mark: 'cooking' as MarkKind, word: 'Cooking', q: food, hero: `${show(s.probeC, unit)}°`, bar: ['heat', s.progress ?? 1] as [BarKind, number], a: `${label}${target ? ` at ${target}` : ''}`, b: `Oven ${oven}` };
  }
  if (left !== null) {
    const total = elapsed + left;
    return { mark: 'cooking' as MarkKind, word: 'Cooking', q: 'left', hero: formatDuration(left), bar: ['heat', total > 0 ? elapsed / total : 0] as [BarKind, number], a: `${label}${target ? ` at ${target}` : ''}`, b: `Oven ${oven}` };
  }
  return { mark: 'ready' as MarkKind, word: 'Ready', q: 'holding', hero: oven, bar: ['heat', 1] as [BarKind, number], a: `${label}${target ? ` at ${target}` : ''}`, b: 'Add a timer below, or stop when you’re done.' };
}

export function GlassHero(p: Props) {
  const { c, f, r } = useTheme();
  const [w, setW] = useState(340);
  // Screens hidden in the stack lay out at 0 wide; keep the last real width.
  const onLayout = (e: LayoutChangeEvent) => { const lw = e.nativeEvent.layout.width; if (lw >= 200) setW(lw); };
  const s = p.s;
  const now = useNow(true, 1000);
  const left = remainingNow(s, now);
  const inner = w - PX * 2;

  const shell = (children: ReactNode) => (
    <View onLayout={onLayout} style={[styles.card, { borderRadius: r.lg, borderColor: c.line, backgroundColor: c.surfaceRaised }]}>
      <GlassFill />
      {children}
    </View>
  );

  // --- Done ---------------------------------------------------------------------
  if (!s.active && s.phase === 'done' && p.showDone) {
    return shell(
      <View style={{ padding: PX, gap: space[4] }}>
        <Text style={[styles.name, { fontFamily: f.sansMedium, color: c.ink }]} numberOfLines={1}>{p.name}</Text>
        <Text accessibilityRole="header" style={{ fontFamily: f.number, fontSize: Math.min(inner * 0.14, 52), lineHeight: Math.min(inner * 0.16, 58), color: c.ink }}>Take food out</Text>
        <StatusLine kind="done" word="Done" qualifier="cooling down" />
        <ProgressBar value={1} color={c.ready} kind="done" />
        <Button onPress={p.onDismissDone}>Food is out</Button>
      </View>,
    );
  }

  // --- Off: the oven's home screen ---------------------------------------------------
  if (!s.active) {
    const offline = s.link === 'offline' || s.ovenOnline === false;
    const d = new Date(now);
    const hour12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 !== false;
    const h = d.getHours();
    const clock = `${hour12 ? h % 12 || 12 : String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const date = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const tile = Math.max(48, Math.min(Math.floor((inner - 2 * GAP) / 3), 96));
    const tiles = [...QUICK_MODES.map((id) => MODES.find((m) => m.id === id)!), null];
    const camW = Math.max(64, inner * 0.2);
    return shell(
      <View style={{ padding: PX, gap: space[5] }}>
        <View style={{ alignItems: 'center' }} accessible accessibilityLabel={`Time ${clock}, ${date}`}>
          <Text style={{ fontFamily: f.number, fontSize: Math.min(inner * 0.2, 76), lineHeight: Math.min(inner * 0.2, 76) * 0.95, fontVariant: ['tabular-nums'], color: c.ink }}>{clock}</Text>
          <Text style={{ fontFamily: f.sans, fontSize: 15, lineHeight: 20, color: c.inkMuted, marginTop: 4 }}>{date}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.name, { fontFamily: f.sansMedium, color: c.ink }]} numberOfLines={1}>{p.name}</Text>
            <StatusLine kind={offline ? 'offline' : 'off'} word={offline ? 'Offline' : 'Off'} qualifier={offline ? undefined : `${show(s.cavityC, p.unit)}°`} size="small" />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open the camera" onPress={p.onCamera}
            style={[styles.camOff, { width: camW, height: camW * 0.75, borderColor: c.lineStrong }]}>
            <Icon name="camera" size={18} color={c.inkMuted} />
            <Text style={{ fontFamily: f.sansMedium, fontSize: 11, color: c.inkMuted }}>Camera off</Text>
          </Pressable>
        </View>
        {/* Always 3 × 2, as on the card. */}
        <View style={{ width: tile * 3 + GAP * 2, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: space[3] }}>
          {tiles.map((m) => m ? (
            <ModeTile key={m.id} mode={m.id} label={m.label} size={tile} onPress={() => p.onMode(m.id)} accessibilityLabel={`${m.label}: review and start`} />
          ) : (
            <ModeTile key="more" mode="more" label="More" util size={tile} onPress={p.onMore} accessibilityLabel="More cook modes" />
          ))}
        </View>
      </View>,
    );
  }

  // --- Running ------------------------------------------------------------------
  const m = running(s, p.unit, left);
  // The camera spans the number group (number, status line, bar), so its size follows
  // the number; the number gives up at most 10% to fit beside it. "19:07" is the
  // widest number at about 1.86 em with tabular figures (measured, Barlow Condensed); long timers ("1:05:00") use a smaller size.
  const hs0 = Math.min(inner * 0.27, 100);
  const camW = Math.round(Math.min((hs0 * 0.95 + 44) * 4 / 3, inner * 0.46));
  const leftW = inner - camW - GAP;
  const hs = Math.max(Math.min(hs0, leftW / (m.hero.length > 5 ? 2.7 : 1.92)), m.hero.length > 5 ? 0 : hs0 * 0.9);
  const image = p.demo ? (s.imageUrl ? DEMO_IMAGE : null) : s.imageUrl ? { uri: s.imageUrl } : null;
  const age = s.imageAt ? Math.round((now - s.imageAt) / 1000) : null;
  const deg = m.hero.endsWith('°');
  const heroText = deg ? m.hero.slice(0, -1) : m.hero;

  return shell(
    <View style={{ paddingHorizontal: PX, paddingTop: 14, paddingBottom: PX, gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: GAP }}>
        <Text style={[styles.name, { flex: 1, fontFamily: f.sansMedium, color: c.ink }]} numberOfLines={1}>{p.name}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Stop the ${p.name} oven`}
          disabled={p.stopping}
          onPress={p.onStop}
          style={({ pressed }) => [styles.stop, { width: camW, borderRadius: r.md, backgroundColor: c.stop, opacity: p.stopping ? 0.75 : pressed ? 0.88 : 1 }]}
        >
          <View style={{ width: 13, height: 13, borderRadius: 2, backgroundColor: c.onStop }} />
          <Text style={{ fontFamily: f.sansStrong, fontSize: 17, color: c.onStop }}>Stop</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: GAP, alignItems: 'flex-start' }}>
        <View style={{ width: leftW, gap: 6 }}>
          {/* The degree sign at half size, level with the top of the digits. */}
          <View
            accessible
            accessibilityLabel={m.q === 'left' ? `${m.hero} left` : `${heroText} degrees`}
            style={{ flexDirection: 'row', alignItems: 'flex-start', opacity: m.stale ? 0.42 : 1 }}
          >
            <Text numberOfLines={1} style={{ fontFamily: f.number, fontSize: hs, lineHeight: hs * 0.95, fontVariant: ['tabular-nums'], color: c.ink }}>{heroText}</Text>
            {deg ? <Text style={{ fontFamily: f.number, fontSize: hs * 0.5, lineHeight: hs * 0.5, marginTop: hs * 0.04, color: c.ink }}>°</Text> : null}
          </View>
          <StatusLine kind={m.mark} word={m.word} qualifier={m.q} size="small" />
          <View style={{ marginTop: 4 }}>
            <ProgressBar value={m.bar[1]} color={c.ember} kind={m.bar[0]} />
          </View>
        </View>
        <View style={{ width: camW }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Open live camera" onPress={p.onCamera}
            style={[styles.cam, { borderRadius: 10, backgroundColor: c.win, borderColor: c.line }]}>
            {image ? (
              <>
                <Image source={image} style={StyleSheet.absoluteFill} contentFit="contain" transition={200} />
                <CameraPill>{age === null || age < 5 ? 'LIVE' : `${age}s`}</CameraPill>
              </>
            ) : (
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Icon name="camera" size={20} color={c.inkMuted} />
                <Text style={{ fontFamily: f.sansMedium, fontSize: 12, color: c.inkMuted }}>Waking…</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <View style={{ gap: 2 }}>
        <Text style={{ fontFamily: f.sansMedium, fontSize: 17, lineHeight: 22, color: c.ink }} numberOfLines={2}>{m.a}</Text>
        <Text style={{ fontFamily: f.sans, fontSize: 15, lineHeight: 20, color: c.inkMuted }} numberOfLines={2}>{m.b}</Text>
      </View>

      {left !== null && s.phase !== 'preheating' ? (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          {[1, 5, 10].map((n) => (
            <View key={n} style={{ flex: 1 }}>
              <Chip onPress={() => p.onAddMinutes(n)} accessibilityLabel={`Add ${n} minute${n > 1 ? 's' : ''}`}>{`+${n} min`}</Chip>
            </View>
          ))}
        </View>
      ) : null}
    </View>,
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, overflow: 'hidden' },
  name: { fontSize: 22, lineHeight: 28 },
  stop: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  cam: { width: '100%', aspectRatio: 4 / 3, overflow: 'hidden', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  camOff: { borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2 },
});
