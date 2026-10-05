import { useCallback, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { show } from '@/api/modes';
import { Icon } from '@/components/Icon';
import { pillState, useNow } from '@/components/OvenHero';
import { Notice, Screen, StatusPill, T } from '@/components/ui';
import { useOven } from '@/state/oven';
import { space, useTheme } from '@/theme';

const DEMO_IMAGE = require('../../assets/demo-camera.jpg');

export default function Camera() {
  const { c, f, r } = useTheme();
  const { link, snap: s, prefs } = useOven();
  const [src, setSrc] = useState<string | null>(null);
  const [lastFrame, setLastFrame] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const now = useNow(true);

  // Watch the camera while this screen is open and the app is in front. Stopping
  // lets the oven turn its camera and interior light off again.
  useFocusEffect(useCallback(() => {
    if (!link) return;
    let stop: (() => void) | null = null;
    const start = () => { stop ??= link.watchCamera(setSrc); };
    const pause = () => { stop?.(); stop = null; };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (state) => (state === 'active' ? start() : pause()));
    return () => { sub.remove(); pause(); };
  }, [link]));

  const frameAt = link?.demo ? s.imageAt : lastFrame;
  const age = frameAt ? Math.round((now - frameAt) / 1000) : null;
  const fresh = age !== null && age < 5;
  const source = link?.demo ? DEMO_IMAGE : src ? { uri: src } : null;

  return (
    <Screen>
      <View style={[styles.frame, { borderRadius: r.lg, backgroundColor: c.win, borderColor: c.line }]}>
        {source ? (
          <Image
            source={source}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            transition={0}
            cachePolicy="none"
            onLoad={() => { setLastFrame(Date.now()); setFailed(false); }}
            onError={() => setFailed(true)}
            accessibilityLabel="Live picture from inside the oven"
          />
        ) : null}
        {!fresh ? (
          <View style={styles.waiting}>
            <Icon name="camera" size={36} color="#b8aa98" />
            <Text style={[styles.waitingText, { fontFamily: f.sans }]}>{failed ? 'No picture yet' : 'Waking the camera…'}</Text>
          </View>
        ) : null}
        <View style={styles.overlay}>
          <View style={styles.badge}>
            <View style={[styles.dot, { backgroundColor: fresh ? '#f89a4e' : '#877869' }]} />
            <Text style={[styles.badgeText, { fontFamily: f.sansStrong }]}>{fresh ? 'LIVE' : 'PAUSED'}</Text>
          </View>
          <View style={styles.badge}>
            <Icon name="thermometer" size={16} color="#f4eee4" />
            <Text style={[styles.badgeText, { fontFamily: f.sansStrong }]}>{show(s.cavityC, prefs.unit)}°{prefs.unit}</Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <StatusPill state={pillState(s)} />
        <T v="small" muted>{age === null ? '' : age < 2 ? 'Updated just now' : `Updated ${age}s ago`}</T>
      </View>

      {failed && !link?.demo ? (
        <Notice tone="info" title="The camera hasn't sent a picture">
          It wakes when a cook starts, and stays on while this screen is open. If it stays dark, check the camera service on the oven.
        </Notice>
      ) : null}

      <Notice tone="info" title="Private by design">
        Pictures go straight from the oven to this phone over your home Wi-Fi. Nothing is uploaded.
      </Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 4 / 3, overflow: 'hidden', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  waiting: { alignItems: 'center', gap: space[2] },
  waitingText: { color: '#b8aa98', fontSize: 16 },
  overlay: { position: 'absolute', top: space[3], left: space[3], right: space[3], flexDirection: 'row', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(23,19,15,0.72)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { color: '#f4eee4', fontSize: 14, letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
});
