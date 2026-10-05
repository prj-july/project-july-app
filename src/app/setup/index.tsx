import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import { normalizeHost, probe, type ProbeResult } from '@/api/endpoint';
import { Button, Field, Notice, Screen, SetupStep, T } from '@/components/ui';
import { useOven } from '@/state/oven';
import { space, useTheme } from '@/theme';

export default function Setup() {
  const { c, f, t } = useTheme();
  const { startDemo } = useOven();
  const [host, setHost] = useState('');
  const [phoneName, setPhoneName] = useState(Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const clean = normalizeHost(host);

  async function check() {
    setChecking(true);
    setResult(null);
    setResult(await probe(clean));
    setChecking(false);
  }

  const found = result?.ok === true;

  return (
    <Screen
      footer={
        found ? (
          <>
            <Button
              variant="primary"
              onPress={() => router.push({ pathname: '/setup/pair', params: { host: clean, secure: result.conn.secure ? '1' : '0', port: String(result.conn.port ?? ''), name: phoneName.trim() || 'Phone' } })}
            >
              Continue to pairing
            </Button>
            <Button variant="quiet" onPress={check}>Check again</Button>
          </>
        ) : (
          <Button variant="primary" icon="wifi" busy={checking} disabled={!clean} onPress={check}>
            Find my oven
          </Button>
        )
      }
    >
      <View style={{ gap: space[2] }}>
        <Text accessibilityRole="header" style={[t.title, { color: c.ink }]}>Connect to your oven</Text>
        <T v="lead" muted>This takes about two minutes. Stand near the oven — you’ll type a code on its screen.</T>
      </View>

      <View style={{ gap: space[5] }}>
        <SetupStep n={1} title="Join your home Wi-Fi" done={found}>
          This phone needs to be on the same network as the oven.
        </SetupStep>
        <SetupStep n={2} title="Enter the oven's address" done={found}>
          Whoever installed Project July will have noted it. It is also in your router’s list of devices, and looks like 192.168.1.75.
        </SetupStep>
      </View>

      <Field
        label="Oven address"
        hint="An IP address, or june.local unless your installer chose another name"
        placeholder="192.168.1.75"
        value={host}
        onChangeText={(t) => { setHost(t); setResult(null); }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'url'}
        returnKeyType="go"
        onSubmitEditing={() => clean && check()}
        style={{ fontFamily: f.mono, fontSize: 20 }}
      />
      <Field
        label="Name for this phone"
        hint="The oven lists paired phones by this name."
        value={phoneName}
        onChangeText={setPhoneName}
        maxLength={40}
      />

      {result?.ok && result.conn.secure ? (
        <Notice tone="success" title="Found your oven">Secure connection to june-local on your oven. You’re ready to pair.</Notice>
      ) : null}
      {result?.ok && !result.conn.secure ? (
        <Notice tone="info" title="Found your oven, on the local port">
          This phone doesn’t trust your home’s certificate yet, so it will use the oven’s local port. Commands are still signed by this phone. To encrypt the link as well, install ca.crt on this phone, then check again.
        </Notice>
      ) : null}
      {result && !result.ok ? <Notice tone="warning" title="Couldn't find the oven">{result.message}</Notice> : null}

      <Button variant="quiet" onPress={() => { startDemo(); router.replace('/'); }}>Try the demo instead</Button>
    </Screen>
  );
}
