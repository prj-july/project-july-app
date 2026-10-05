// The July theme's live oven tile: camera well, big temperature, status and
// progress. A richer, live version of the design system's OvenCard. The Still
// Glass theme uses GlassHero instead.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { OvenSnapshot } from '@/api/client';
import { formatDuration, modeLabel, show, type Unit } from '@/api/modes';
import { space, useTheme } from '@/theme';
import { Icon } from './Icon';
import { Card, ProgressBar, StatusPill, T, type OvenState } from './ui';

const DEMO_IMAGE = require('../../assets/demo-camera.jpg');

export function useNow(active: boolean, everyMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs]);
  return now;
}

export function pillState(s: OvenSnapshot): OvenState {
  if (s.link === 'offline' || s.ovenOnline === false) return 'offline';
  if (s.phase === 'preheating') return 'preheating';
  if (s.phase === 'cooking') return 'cooking';
  if (s.phase === 'done') return 'ready';
  return 'idle';
}

export function remainingNow(s: OvenSnapshot, now: number): number | null {
  if (s.remainingMs === null) return null;
  return Math.max(0, s.remainingMs - (now - s.remainingAt));
}

export function OvenHero({ s, unit, demo, onCamera }: { s: OvenSnapshot; unit: Unit; demo: boolean; onCamera: () => void }) {
  const { c, f, r } = useTheme();
  const now = useNow(s.remainingMs !== null);
  const left = remainingNow(s, now);
  const state = pillState(s);
  const cooking = s.active;
  const image = demo ? (s.imageUrl ? DEMO_IMAGE : null) : s.imageUrl ? { uri: s.imageUrl } : null;

  const phaseLine =
    s.phase === 'preheating' ? `${modeLabel(s.mode)} · heating up`
    : s.phase === 'cooking' ? `${modeLabel(s.mode)} · at temperature`
    : s.phase === 'done' ? 'Finished · cooling down'
    : state === 'offline' ? 'Not connected'
    : 'Ready when you are';

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open live camera"
        onPress={onCamera}
        style={[styles.well, { backgroundColor: c.surfaceSunken, borderBottomColor: c.line }]}
      >
        {image && cooking ? (
          <>
            <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
            <View style={styles.live}>
              <View style={[styles.liveDot, { backgroundColor: '#f89a4e' }]} />
              <Text style={[styles.liveText, { fontFamily: f.sansStrong }]}>LIVE</Text>
            </View>
          </>
        ) : (
          <View style={{ alignItems: 'center', gap: space[2], paddingHorizontal: space[6] }}>
            <Icon name="camera" size={32} color={c.inkMuted} />
            <T v="small" muted style={{ textAlign: 'center' }}>
              {cooking ? 'Waiting for the first picture…' : 'The camera turns on while cooking. Tap to look inside.'}
            </T>
          </View>
        )}
      </Pressable>

      <View style={{ padding: space[5], gap: space[4] }}>
        <View style={styles.headRow}>
          <StatusPill state={state} />
          {left !== null ? (
            <View style={styles.timer} accessibilityLabel={`Timer ${formatDuration(left)} left`}>
              <Icon name="timer" size={20} color={c.ember} />
              <Text style={[styles.timerText, { fontFamily: f.sansStrong, color: c.ink }]}>{formatDuration(left)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.readoutRow}>
          <Text
            accessibilityLabel={`Oven temperature ${show(s.cavityC, unit)} degrees`}
            style={[styles.temp, { fontFamily: f.number, color: c.ink }]}
          >
            {show(s.cavityC, unit)}
            <Text style={[styles.deg, { fontFamily: f.number, color: c.inkMuted }]}>°{unit}</Text>
          </Text>
          <View style={{ flex: 1, alignItems: 'flex-end', paddingBottom: 10 }}>
            {cooking && s.targetC !== null ? (
              <>
                <T v="label" muted>Target</T>
                <Text style={[styles.target, { fontFamily: f.number, color: c.ink }]}>{show(s.targetC, unit)}°</Text>
              </>
            ) : null}
          </View>
        </View>

        {s.phase === 'preheating' && s.progress !== null ? (
          <ProgressBar value={s.progress} color={c.heat} />
        ) : null}
        <T muted>{phaseLine}</T>
        {s.probeC !== null ? (
          <View style={[styles.probe, { borderRadius: r.md, backgroundColor: c.surfaceSunken }]}>
            <Icon name="probe" color={c.inkMuted} />
            <T style={{ flex: 1 }}>Food probe</T>
            <T v="bodyStrong">{show(s.probeC, unit)}°{unit}</T>
            {s.probeTargetC !== null ? <T muted>of {show(s.probeTargetC, unit)}°</T> : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  well: { aspectRatio: 4 / 3, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, maxHeight: 300, width: '100%' },
  live: {
    position: 'absolute', top: space[3], left: space[3], flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(23,19,15,0.72)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { color: '#f4eee4', fontSize: 13, letterSpacing: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timer: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  timerText: { fontSize: 20, fontVariant: ['tabular-nums'] },
  readoutRow: { flexDirection: 'row', alignItems: 'flex-end' },
  temp: { fontSize: 88, lineHeight: 92, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  deg: { fontSize: 32 },
  target: { fontSize: 34, lineHeight: 40, fontVariant: ['tabular-nums'] },
  probe: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4] },
});
