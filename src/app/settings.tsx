import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { PLAIN_PORT, urls } from '@/api/endpoint';
import { Button, Card, Divider, Notice, Row, Screen, SectionLabel, Segmented, T, confirm } from '@/components/ui';
import { useOven, useOvenName } from '@/state/oven';
import { Icon } from '@/components/Icon';
import { space, THEMES, useTheme, useThemeSettings, type ThemeId } from '@/theme';

export default function Settings() {
  const { c } = useTheme();
  const { paired, link, prefs, setUnit, forget } = useOven();
  const name = useOvenName();
  const demo = !!link?.demo;

  async function unpair() {
    if (demo) { await forget(); router.replace('/'); return; }
    const ok = await confirm(
      'Unpair this phone?',
      `This phone will stop controlling ${name}. You can pair again at any time with a new code.`,
      'Unpair',
    );
    if (!ok) return;
    await forget();
    router.replace('/');
  }

  return (
    <Screen>
      {paired ? (
        <View style={{ gap: space[3] }}>
          <SectionLabel>Oven</SectionLabel>
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

      {paired ? (
        <View style={{ gap: space[3] }}>
          <SectionLabel>Connection</SectionLabel>
          <Card padded={false}>
            <Row icon="wifi" label="Address" value={paired.conn.host} mono />
            <Divider />
            <Row icon="house" label="Link" value={paired.conn.secure ? 'Secure (HTTPS)' : `Local port ${paired.conn.port ?? PLAIN_PORT}`} />
            <Divider />
            <Row icon="link" label="Server status page" onPress={() => WebBrowser.openBrowserAsync(urls(paired.conn).statusPage)} />
          </Card>
          {!paired.conn.secure ? (
            <Notice tone="info" title="Using the local port">
              Commands are signed by this phone, so the oven only obeys you. To also encrypt the connection, install your home’s certificate (ca.crt) on this phone and pair again.
            </Notice>
          ) : null}
        </View>
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
        <SectionLabel>About</SectionLabel>
        <T muted>
          Project July is a community project that keeps June ovens working after the June cloud shut down. This phone talks to june-local, a small server that runs on the oven itself. It is not made by, or affiliated with, June or Weber.
        </T>
        <T v="small" muted>Version {Constants.expoConfig?.version ?? '1.0.0'}</T>
      </View>

      {paired || demo ? (
        <Button onPress={unpair} style={{ borderColor: demo ? c.lineStrong : c.fault }}>
          {demo ? 'Leave the demo' : 'Unpair this phone'}
        </Button>
      ) : null}
    </Screen>
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
});
