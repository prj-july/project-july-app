import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { formatDuration } from '@/api/modes';
import { PairingSession, type PairingStep } from '@/api/pairing';
import { Icon } from '@/components/Icon';
import { useNow } from '@/components/OvenHero';
import { Button, Card, Notice, ProgressBar, Screen, SetupStep, T } from '@/components/ui';
import { useOven } from '@/state/oven';
import { space, useTheme } from '@/theme';

export default function Pair() {
  const { c, f, t, r, look } = useTheme();
  const { completePairing } = useOven();
  const params = useLocalSearchParams<{ host: string; secure: string; port?: string; name: string }>();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<PairingStep>({ step: 'starting' });
  const session = useRef<PairingSession | null>(null);
  const [total, setTotal] = useState(0);

  function begin() {
    session.current?.close();
    const s = new PairingSession({ host: params.host, secure: params.secure === '1', port: params.port ? Number(params.port) : undefined },params.name ?? 'Phone', (st) => {
      setStep(st);
      if (st.step === 'show-code') setTotal(st.expiresAt - Date.now());
      if (st.step === 'paired') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        completePairing(st.paired);
      }
      if (st.step === 'failed') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    });
    session.current = s;
    setReady(true);
    s.begin();
  }

  useEffect(() => () => session.current?.close(), []);

  const now = useNow(step.step === 'show-code');
  const left = step.step === 'show-code' ? Math.max(0, step.expiresAt - now) : 0;

  if (!ready) {
    return (
      <Screen footer={<Button variant="primary" onPress={begin}>The oven is ready — show the code</Button>}>
        <View style={{ gap: space[2] }}>
          <Text accessibilityRole="header" style={[t.title, { color: c.ink }]}>Get the oven ready</Text>
          <T v="lead" muted>The code only lasts a minute or two, so open the oven’s Connect screen first.</T>
        </View>
        <View style={{ gap: space[5] }}>
          <SetupStep n={1} title="Make sure the oven is idle">Nothing cooking, door closed.</SetupStep>
          <SetupStep n={2} title="On the oven, open Settings, then Connect">Leave it on the screen that asks for a code.</SetupStep>
          <SetupStep n={3} title="Come back here">Tap the button below to get your eight-digit code.</SetupStep>
        </View>
      </Screen>
    );
  }

  if (step.step === 'paired') {
    return (
      <Screen footer={<Button variant="primary" onPress={() => router.dismissTo('/')}>Go to my oven</Button>}>
        <View style={{ alignItems: 'center', gap: space[4], paddingTop: space[12] }}>
          <View style={[styles.doneDisc, { backgroundColor: c.readySoft }]}>
            <Icon name="check-circle" size={56} color={c.ready} />
          </View>
          <Text accessibilityRole="header" style={[t.title, { color: c.ink, textAlign: 'center' }]}>Setup complete</Text>
          <T v="lead" muted style={{ textAlign: 'center' }}>
            {`This phone is paired with ${step.paired.oven.name}. Only paired phones can control it.`}
          </T>
        </View>
      </Screen>
    );
  }

  if (step.step === 'failed') {
    return (
      <Screen footer={<Button variant="primary" onPress={begin}>Get a new code</Button>}>
        <Text accessibilityRole="header" style={[t.title, { color: c.ink }]}>Pairing didn’t finish</Text>
        <Notice tone="warning" title="What happened">{step.message}</Notice>
        <T muted>Check the oven is still on its Connect screen, then get a new code.</T>
      </Screen>
    );
  }

  const code = step.step === 'show-code' || step.step === 'exchanging' ? step.code : null;
  const exchanging = step.step === 'exchanging';

  return (
    <Screen>
      <View style={{ gap: space[2] }}>
        <Text accessibilityRole="header" style={[t.title, { color: c.ink }]}>
          {exchanging ? 'Pairing…' : 'Enter this code on the oven'}
        </Text>
        <T v="lead" muted>{exchanging ? 'The oven has the code. Exchanging keys — keep the oven on this screen.' : 'Type all eight digits on the oven’s Connect screen.'}</T>
      </View>

      <Card>
        <View style={{ gap: space[4], alignItems: 'center' }}>
          {code ? (
            <View
              accessible
              accessibilityLabel={`Pairing code ${code.split('').join(' ')}`}
              style={{ flexDirection: 'row', gap: space[3] }}
            >
              {[code.slice(0, 4), code.slice(4)].map((group, gi) => (
                <View key={gi} style={{ flexDirection: 'row', gap: 6 }}>
                  {group.split('').map((d, i) => (
                    <View key={i} style={[styles.digit, { borderRadius: r.sm, backgroundColor: c.surfaceSunken, borderColor: c.line }]}>
                      <Text style={[styles.digitText, { fontFamily: look.glassCards ? f.number : f.mono, fontSize: look.glassCards ? 38 : 30, color: c.ink }]}>{d}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ) : (
            <View style={{ height: 64, justifyContent: 'center' }}><T muted>Getting a code…</T></View>
          )}
          {step.step === 'show-code' ? (
            <View style={{ alignSelf: 'stretch', gap: space[2] }}>
              <ProgressBar value={total ? left / total : 0} color={left < 30_000 ? c.fault : c.ember} />
              <T v="small" muted style={{ textAlign: 'center' }}>{`Code expires in ${formatDuration(left)}`}</T>
            </View>
          ) : null}
        </View>
      </Card>

      <View style={{ gap: space[5] }}>
        <SetupStep n={1} title="Phone registered with the oven server" done={step.step !== 'starting'} />
        <SetupStep n={2} title="Code entered on the oven" done={exchanging} />
        <SetupStep n={3} title="Keys exchanged">Your phone and oven agree on a secret no one else knows.</SetupStep>
      </View>

      <Button variant="quiet" onPress={begin}>Get a new code</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  digit: { width: 36, height: 56, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  digitText: { fontSize: 30 },
  doneDisc: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center' },
});
