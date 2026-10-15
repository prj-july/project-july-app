import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { probe, urls, type ProbeResult } from '@/api/endpoint';
import { NO_TRUST } from '@/api/trust';
import { CertificatePanel } from '@/components/CertificatePanel';
import { Button, Card, Divider, Notice, Row, Screen, SectionLabel, Segmented, T, confirm } from '@/components/ui';
import { CAMERA_FPS, useOven, useOvenName } from '@/state/oven';
import { Icon } from '@/components/Icon';
import { space, THEMES, useTheme, useThemeSettings, type ThemeId } from '@/theme';

export default function Settings() {
  const { c, look } = useTheme();
  const { ovens, paired, link, prefs, setUnit, setPref, forget } = useOven();
  const glass = look.hero === 'glass';
  const name = useOvenName();
  const demo = !!link?.demo;

  async function leaveDemo() {
    await forget();
    router.replace('/');
  }

  async function forgetOven() {
    const ok = await confirm(
      `Forget ${name}?`,
      `This phone will stop controlling ${name}. You can pair again at any time with a new code.`,
      'Forget this oven',
    );
    if (!ok) return;
    const others = ovens.filter((o) => o.paired && o.id !== paired?.oven.id).length;
    await forget();
    // Back to the home screen: another oven if there is one, or Welcome.
    if (others > 0 && router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <Screen>
      {!demo ? <OvenList /> : null}

      <Card padded={false}>
        <Row icon="history" label="Cook history" onPress={() => router.push('/history')} />
      </Card>

      {paired ? (
        <View style={{ gap: space[3] }}>
          <SectionLabel>{name}</SectionLabel>
          <Card padded={false}>
            <Row icon="oven" label="Name" value={paired.oven.name} />
            <Divider />
            <Row label="Model" value={paired.oven.model ?? 'June Oven'} />
            <Divider />
            <Row label="Oven ID" value={paired.oven.id.slice(0, 12) + (paired.oven.id.length > 12 ? '…' : '')} mono />
            <Divider />
            <Row label="Paired" value={new Date(paired.pairedAt).toLocaleDateString()} />
          </Card>
        </View>
      ) : null}

      {paired ? <ConnectionSettings /> : null}

      {paired ? (
        <Button onPress={forgetOven} style={{ borderColor: c.fault }}>Forget this oven</Button>
      ) : null}

      <View style={{ gap: space[3] }}>
        <SectionLabel>Appearance</SectionLabel>
        <ThemePicker />
      </View>

      <View style={{ gap: space[3] }}>
        <SectionLabel>Display</SectionLabel>
        <Segmented
          label="Temperature units"
          value={prefs.unit}
          onChange={setUnit}
          options={[{ value: 'F', label: '°F  Fahrenheit' }, { value: 'C', label: '°C  Celsius' }]}
        />
      </View>

      <View style={{ gap: space[3] }}>
        <SectionLabel>Camera frame rate</SectionLabel>
        <Segmented
          label="Camera frame rate"
          value={String(prefs.cameraFps)}
          onChange={(v) => setPref('cameraFps', Number(v))}
          options={CAMERA_FPS.map((v) => ({ value: String(v), label: `${v} fps` }))}
        />
        <T v="small" muted>For ovens that send single pictures rather than a live stream: how often Live view fetches a new one. The stock June app showed 1 fps at most.</T>
      </View>

      {glass ? <HomeScreenSettings /> : null}

      <View style={{ gap: space[3] }}>
        <SectionLabel>About</SectionLabel>
        <T muted>
          Project July is a community project that keeps June ovens working after the June cloud shut down. This phone talks to june-local, a small server that runs on the oven itself. It is not made by, or affiliated with, June or Weber.
        </T>
        <T v="small" muted>Version {Constants.expoConfig?.version ?? '1.0.0'}</T>
      </View>

      {demo ? (
        <Button onPress={leaveDemo} style={{ borderColor: c.lineStrong }}>Leave the demo</Button>
      ) : null}
    </Screen>
  );
}

/** Every paired oven: tap one to show it, or add another. */
function OvenList() {
  const { c } = useTheme();
  const { ovens, currentId, select } = useOven();
  const paired = ovens.filter((o) => o.paired);

  return (
    <View style={{ gap: space[3] }}>
      <SectionLabel>Ovens</SectionLabel>
      <Card padded={false}>
        {paired.map((o) => {
          const on = o.id === currentId;
          return (
            <View key={o.id}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={on ? `${o.name}, showing` : `Show ${o.name}`}
                onPress={() => select(o.id)}
                style={({ pressed }) => [styles.oven, pressed && { backgroundColor: c.surfaceSunken }]}
              >
                <Icon name="oven" color={on ? c.ember : c.inkMuted} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" numberOfLines={1}>{o.name}</T>
                  <T v="code" muted numberOfLines={1}>{o.paired?.conn.host}</T>
                </View>
                {on ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
                    <T v="small" color={c.ember}>Showing</T>
                    <Icon name="check-circle" size={22} color={c.ember} />
                  </View>
                ) : null}
              </Pressable>
              <Divider />
            </View>
          );
        })}
        <Row icon="plus" label={paired.length ? 'Add another oven' : 'Add an oven'} onPress={() => router.push('/setup')} />
      </Card>
      {paired.length > 1 ? <T v="small" muted>Swipe on the home screen to switch ovens. The settings below are for the one showing.</T> : null}
    </View>
  );
}

/** How this phone reaches the paired oven, and the oven's home certificate. */
function ConnectionSettings() {
  const { paired, trusts, setHostTrust, updateConnection } = useOven();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<ProbeResult | null>(null);
  if (!paired) return null;
  const { conn } = paired;
  const trust = trusts[conn.host] ?? NO_TRUST;
  const link = !conn.secure ? `Plain port ${conn.httpPort ?? 8080}`
    : trust.caPem ? 'HTTPS, checked against your ca.crt'
    : trust.insecure ? 'HTTPS, certificate not checked'
    : 'Secure (HTTPS)';

  // After a certificate change: use HTTPS if it now works, or the plain port if not.
  async function recheck() {
    setChecking(true);
    setChecked(null);
    const r = await probe(conn.host);
    setChecked(r);
    if (r.ok) await updateConnection({ host: conn.host, secure: r.secure, httpPort: r.httpPort ?? conn.httpPort });
    setChecking(false);
  }

  return (
    <View style={{ gap: space[3] }}>
      <SectionLabel>Connection</SectionLabel>
      <Card padded={false}>
        <Row icon="wifi" label="Address" value={conn.host} mono />
        <Divider />
        <Row icon="house" label="Link" value={link} />
        <Divider />
        <Row icon="link" label="Server status page" onPress={() => WebBrowser.openBrowserAsync(urls(conn).statusPage)} />
      </Card>
      {!conn.secure ? (
        <Notice tone="info" title="Using the plain port">
          Commands are signed by this phone, so the oven only obeys you. To also encrypt the connection, add your home’s certificate (ca.crt) below, then check the connection.
        </Notice>
      ) : null}
      <CertificatePanel trust={trust} onChange={(t) => { setHostTrust(conn.host, t); setChecked(null); }} />
      <Button busy={checking} onPress={recheck}>Check the connection</Button>
      {checked?.ok ? (
        <Notice tone="success" title={checked.secure ? 'Connected over HTTPS' : `Connected on the plain port (${checked.httpPort})`}>
          {checked.secure ? 'This phone now reaches the oven over an encrypted link.' : 'HTTPS didn’t answer, so the app keeps using the plain port.'}
        </Notice>
      ) : checked ? (
        <Notice tone="warning" title="Couldn't reach the oven">{checked.message}</Notice>
      ) : null}
    </View>
  );
}

/** The Home Assistant card's own settings, for the glass home screen. */
function HomeScreenSettings() {
  const { prefs, setPref, resetPrefs } = useOven();

  return (
    <>
      <View style={{ gap: space[3] }}>
        <SectionLabel>Oven name</SectionLabel>
        <Segmented
          label="Oven name"
          value={prefs.hideName ? 'tuck' : 'show'}
          onChange={(v) => setPref('hideName', v === 'tuck')}
          options={[{ value: 'tuck', label: 'Tuck into the icon' }, { value: 'show', label: 'Always show' }]}
        />
        <T v="small" muted>On the home screen the name tucks into the oven’s icon after 5 seconds. Tap the icon to see it.</T>
      </View>

      <View style={{ gap: space[3] }}>
        <SectionLabel>Cook modes</SectionLabel>
        <Segmented
          label="Cook mode order"
          value={prefs.modeOrder}
          onChange={(v) => setPref('modeOrder', v)}
          options={[{ value: 'oven', label: 'Oven’s order' }, { value: 'used', label: 'Most used first' }]}
        />
        <T v="small" muted>Most used first counts the cooks started from this phone.</T>
      </View>

      <View style={{ gap: space[3] }}>
        <SectionLabel>Clock</SectionLabel>
        <Segmented
          label="Clock"
          value={prefs.clock}
          onChange={(v) => setPref('clock', v)}
          options={[{ value: 'auto', label: 'Automatic' }, { value: '12', label: '12-hour' }, { value: '24', label: '24-hour' }]}
        />
      </View>

      <Button variant="quiet" onPress={resetPrefs}>Reset the home screen</Button>
    </>
  );
}

/** One preview swatch per theme, each drawn in its own colours and fonts. */
function ThemePicker() {
  const { name, c, f, r } = useTheme();
  const { themeId, setThemeId, appearance, setAppearance } = useThemeSettings();
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        {(Object.keys(THEMES) as ThemeId[]).map((id) => {
          const def = THEMES[id];
          const p = def.palette[name];
          const tf = def.fonts[name];
          const on = id === themeId;
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${def.label} theme. ${def.description}`}
              onPress={() => setThemeId(id)}
              style={[styles.choice, { borderRadius: r.lg, borderColor: on ? c.ember : c.line, borderWidth: on ? 2.5 : 1 }]}
            >
              <View style={[styles.swatch, { backgroundColor: p.cardBottom, borderRadius: def.radius.md }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.ember }} />
                  <Text style={{ fontFamily: tf.sansStrong, fontSize: 11, letterSpacing: 0.8, color: p.ink }}>COOKING</Text>
                </View>
                <Text style={{ fontFamily: tf.number, fontSize: 40, lineHeight: 44, color: p.ink }}>350°</Text>
                <View style={{ height: 5, borderRadius: 3, backgroundColor: p.line }}>
                  <View style={{ width: '65%', height: '100%', borderRadius: 3, backgroundColor: p.ember }} />
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  <View style={{ flex: 1, height: 22, borderRadius: def.radius.sm, backgroundColor: id === 'glass' ? p.stop : p.ember }} />
                  <View style={{ flex: 1, height: 22, borderRadius: def.radius.sm, borderWidth: 1, borderColor: p.lineStrong }} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: f.sansStrong, fontSize: 17, color: c.ink }}>{def.label}</Text>
                {on ? <Icon name="check-circle" size={22} color={c.ember} /> : null}
              </View>
              <Text style={{ fontFamily: f.sans, fontSize: 14, lineHeight: 19, color: c.inkMuted }}>{def.description}</Text>
            </Pressable>
          );
        })}
      </View>
      <Segmented
        label="Light or dark"
        value={appearance}
        onChange={setAppearance}
        options={[{ value: 'system', label: 'Match phone' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  choice: { flex: 1, padding: space[3], gap: space[2] },
  swatch: { padding: space[3], gap: 4 },
  oven: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 64, paddingHorizontal: space[5], paddingVertical: space[3] },
});
