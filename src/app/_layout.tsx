import '@/polyfills';
import '@/devPreview';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Fraunces_500Medium, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { PublicSans_400Regular, PublicSans_600SemiBold } from '@expo-google-fonts/public-sans';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono';
import {
  BarlowSemiCondensed_400Regular, BarlowSemiCondensed_500Medium, BarlowSemiCondensed_600SemiBold,
} from '@expo-google-fonts/barlow-semi-condensed';
import { BarlowCondensed_300Light, BarlowCondensed_400Regular } from '@expo-google-fonts/barlow-condensed';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/theme';
import { OvenProvider } from '@/state/oven';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    // July
    Fraunces_500Medium, Fraunces_600SemiBold, PublicSans_400Regular, PublicSans_600SemiBold, IBMPlexMono_400Regular,
    // Still Glass (the Home Assistant card's stand-ins for June's DIN Next)
    BarlowSemiCondensed_400Regular, BarlowSemiCondensed_500Medium, BarlowSemiCondensed_600SemiBold,
    BarlowCondensed_300Light, BarlowCondensed_400Regular,
  });
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);
  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <OvenProvider>
          <Screens />
        </OvenProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Screens() {
  const { c, f, name } = useTheme();
  return (
    <>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.surface },
          headerShadowVisible: false,
          headerTintColor: c.ember,
          headerTitleStyle: { fontFamily: f.sansStrong, fontSize: 18, color: c.ink },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: c.surface },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="setup/index" options={{ title: 'Set up' }} />
        <Stack.Screen name="setup/pair" options={{ title: 'Pair your oven' }} />
        <Stack.Screen name="cook" options={{ title: 'Start a cook', presentation: 'modal' }} />
        <Stack.Screen name="history" options={{ title: 'Cook history' }} />
        <Stack.Screen name="camera" options={{ title: 'Live view', headerShown: false, presentation: 'fullScreenModal', animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
