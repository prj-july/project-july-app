# Project July — mobile app

## Get the app (Android)

Project July is in **beta on Google Play**. While it's a closed beta, these three
steps have to be done in order, signed in with the same Google account that's on
your phone:

1. **Join the beta group:** <https://groups.google.com/g/prj-july-beta>
2. **Become a tester:** <https://play.google.com/apps/testing/org.projectjuly.oven>
3. **Install from Google Play:** <https://play.google.com/store/apps/details?id=org.projectjuly.oven>

The Play Store page says *Not found* until steps 1 and 2 are done, and it can take
a few minutes to appear after that. No oven yet? Tap **Try the demo first** in the app.
You'll also need [june-local](https://github.com/prj-july) running on your home
network to control a real oven. Feedback: hello@project-july.org

## Get the app (iPhone)

Project July is in **beta on TestFlight**, and anyone can join:

1. **Install TestFlight** (Apple's free app for testing apps): <https://apps.apple.com/app/testflight/id899247664>
2. **Join the beta** by opening this link on your iPhone, then **Accept** and **Install**: <https://testflight.apple.com/join/duDPqwBk>

Updates arrive through TestFlight.

---

The phone app for Project July ("June, now local"). The app talks to the oven's
local `june-local` server over the home network, with no June cloud involved.

The **Android** app is tested on real ovens: pairing, starting and stopping cooks,
temperature and timer changes, the probe, the live camera and several ovens on
one phone. The **iOS** app, built from the same Expo / React Native codebase, has
been tested on an iPhone too.

<p align="center">
  <img src="docs/screenshots/welcome.png" width="160" alt="Welcome screen: Your oven keeps working, with Set up this phone and Try the demo first">
  <img src="docs/screenshots/home.png" width="160" alt="Home screen with the oven off: a big clock, the last cook with Repeat, and twelve glowing mode tiles">
  <img src="docs/screenshots/start.png" width="160" alt="Start review for Roast at 400 °F with a temperature slider, timer choices and Start preheating">
  <img src="docs/screenshots/cooking.png" width="160" alt="Cooking: 12:25 left with a red Stop, +1/+5/+10 buttons and the camera tile">
  <img src="docs/screenshots/july-light.png" width="160" alt="The July theme in light mode: the camera above a large 401 °F reading and the 400° target">
</p>
<p align="center"><sub>Demo mode, in the Still Glass theme and (right) July in light. <code>store-assets/</code> has the Play Store versions.</sub></p>

It has two themes, each in light and dark (Settings → Appearance, with Match phone /
Light / Dark):

- **Still Glass** (the default) matches the Home Assistant July Oven card
  ([prj-july/ha-june-oven, docs/july-oven-card](https://github.com/prj-july/ha-june-oven/tree/main/docs/july-oven-card)).
  It uses Barlow Semi Condensed / Barlow Condensed type and the oven's black glass in dark.
  The oven tile follows the card's layout: the oven's icon as its lamp (orange
  while heating) with its name and a one-tap red Stop, a big number with a status mark
  (↑ preheating, ✓ ready, flame cooking), the heat line and +1/+5/+10 buttons. While
  the oven is on, the camera is its own full-width tile below, with Full screen, Save
  (to Photos) and Share in its corner. When the oven is off the app shows the oven's
  home screen, drawn on the app itself rather than in a card: an oven-sized clock, the
  last cook with **Repeat** (which opens its review with the same mode and
  temperature), and glowing mode tiles four across with Camera last; Settings is in the
  top bar. It sizes itself to the phone: the big clock if every row fits, a smaller
  clock to make them fit, and only then does the screen scroll. With several ovens,
  each is a page you swipe to (or pick with the dots under the top bar). The name tucks into the icon after 5 s. Starting
  goes through a review with a slider and a typed temperature, which warns the oven
  must be empty and closes itself after 5 minutes.
- **July** is the original July Oven design system: warm
  neutrals, one ember accent, Fraunces / Public Sans / IBM Plex Mono, and soft cards.

Both use 18px body text and touch targets of 48px or more, and meet WCAG AA contrast.
Colours, fonts, type scale and component choices for each theme live in
`src/theme/themes.ts`.

## What it does

| Screen | |
|---|---|
| **Welcome** | What Project July is, then *Set up this phone* or *Try the demo first*. |
| **Set up** | Finds the oven on the home network (or takes a typed address), checks the server (HTTPS first, then the plain listener on port 80 or 8080), optionally takes the home `ca.crt`, and names this phone. |
| **Pair** | Shows the eight-digit code to type on the oven's Connect screen, with a countdown, then runs the SRP key exchange. |
| **Oven** | One page per paired oven; swipe (or tap the dots) to switch. Large temperature readout, status, preheat progress, timer countdown and probe reading, and while it's on, a full-width live camera tile with Full screen, Save and Share. Controls for target temperature, timer and *Stop cooking*. |
| **Start a cook** | Mode, temperature and an optional timer: Bake, Roast, Air fry, Broil, Toast, Grill, Pizza, Reheat, Keep warm, Dehydrate and Proof, as on the Home Assistant card. Toast takes a level from 1 (light) to 9 (dark) and times itself. Grill takes the oven's Low, Medium or High heat. Reheat runs at the 350 °F the oven sets, and its one control is a timer from 1 minute to 10 hours (an hour unless changed). Broil, Pizza and Keep warm run at the temperature the oven sets (500, 500 and 170 °F). Proof needs June's presets content on the oven, which the installer can add (it isn't in the public payload). **Start later** sets a time up to 12 hours ahead; the oven stays off until then, and this phone starts it if the app is open on your home Wi-Fi. |
| **Live view** | The camera full screen, with Save (to Photos) and Share. Reads june-local's MJPEG stream; on a server without it, stills at the chosen frame rate (1, 5, 10 or 15 per second). Keeps the camera awake while open. |
| **Settings** | Theme and light/dark, the paired ovens (show one, add another), the current oven's details, connection and *Forget this oven*, °F/°C, camera frame rate and server status page. With Still Glass, also the home screen choices from the Home Assistant card: the name tucking into the icon, cook modes in the oven's order or most used first, and a 12/24-hour clock. The oven's icon is always the June oven. |

The demo mode is a simulated oven, always labelled *Demo*, so people can try
the app (and designers can review it) without an oven. In a web dev build
(`npx expo start --web`), `?demo` opens it straight away, and
`?demo=preheat|ready|cooking|probe|done|offline` starts it in that state, and
`&ovens=2` (up to 5) adds idle demo ovens to swipe between.

## How it talks to the oven

Source of truth: the `june-local` server (its Go source is in
[prj-july/installer](https://github.com/prj-july/installer) under `golocal/`,
with the camera design in `CAMERA.md`) and the tested Python client in
[prj-july/ha-june-oven](https://github.com/prj-july/ha-june-oven), which runs
against real ovens.

- **Pairing** (`src/api/pairing.ts`). The app registers as a companion
  (`POST /2/devices/register`), opens `wss://<oven>/1/messaging/websocket/companion`,
  mints a code (`POST /2/devices/pairing`) and shows `code + 2 random digits + Damm check`.
  The phone acts as the SRP-6a *server* (RFC 5054 8192-bit group, g = 19, SHA-1,
  identity `user`, password = the full eight digits). Session key is `K = BLAKE2b-256(S)`.
  `companion_info` / `oven_info` are NaCl secretbox, with the nonce prepended.
  The phone registers as `platform: "Android"` on both OSes, as the stock app does.
- **Commands** (`src/api/client.ts`). These are compact JSON frames in the stock
  app's Gson key order, signed with Ed25519 (`signature = base64(blake2b8(pubkey) || sig)`).
  june-local only relays; the **oven** checks the signature, so only paired phones
  can control it. Acknowledgements (`10020`) are matched by `order` and turned into
  plain-language errors ("The oven door is open…"). A temperature change mid-cook
  sends `11005`; if the oven refuses it, the app restarts the cook at the new
  temperature, as the Home Assistant integration does. A timer (`11006`) or
  temperature change names the running cook's plan, so right after a start the app
  waits (up to 3 s) for the oven to report the new plan: the oven acknowledges a
  start before it reports the plan, and a timer sent with the previous plan id
  made the next Stop reboot the oven (Home Assistant integration v0.5.16). Grill's
  heat level goes in the start as `plan_index` (0 High, 1 Medium, 2 Low).
- **Live state**. `10013` telemetry (milli-°C), `10014`/`10017` cook plan
  start/end (the probe target comes from the step's `exit_criteria`), `10018`
  device state, `10011` camera frames (re-homed from `api.junelife.com` to the
  oven's address), `10012` notifications.
- **Camera** (`src/api/mjpeg.ts`). Live view reads `GET /media/stream.mjpg` with
  `fetch` and shows each JPEG as it arrives, because expo-image can't play MJPEG.
  An open stream counts as a viewer: june-local keeps the camera and the interior
  light on, and lets them lapse about 15 s after the stream closes. The app
  closes it when Live view loses focus or the app goes to the background. The
  stream sends each new picture once, at the camera's own rate of about one a
  second, and at the same size as `latest.jpg`. On a server without the stream,
  the app falls back to fetching `GET /media/prod/images/latest.jpg` once a
  second, with `POST /internal/camera/on?seconds=120` while open and
  `/internal/camera/off` on leaving.

Pairing keys are stored in the iOS Keychain / Android Keystore via
`expo-secure-store` (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`).

### Finding the oven

The oven doesn't announce itself (no mDNS or broadcast), so Set up searches the
phone's own home network: it asks each address on the /24 it is on for
`/local/status` on the plain ports, a few seconds in all, and fills in the first
june-local that answers. It only searches private addresses (10.x, 172.16–31.x,
192.168.x) while on Wi-Fi or Ethernet, and never on the web, where expo-network
reports the public address. People can always type the address instead.

### Certificates and the plain-port fallback

`june-local` serves the same routes on TLS :443 and a plain listener: port 80 on
the oven (its init script runs `--http-port 80`), 8080 on the reference server.
The app tries HTTPS first, then both plain ports, and remembers which answered.
If the phone doesn't trust the home certificate, it uses the plain port and says
so on the setup and settings screens. There, commands are still signed and
pairing is still SRP-protected, but the link itself is not encrypted.

To use HTTPS with per-install certs from `generate_certs.sh`, either:

- **Give the app the CA** (Set up or Settings → Home certificate): pick `ca.crt`
  or paste it. The app then accepts the oven's certificate if its chain leads to
  that CA, for that oven's address only. The hostname isn't checked, since the
  certificate is often made for `oven.local` and reached by IP.
- **Opt in to no checks** (same place, off by default): the link is encrypted
  but the oven isn't verified. The screen says so.
- **Install `ca.crt` on the phone**. Android: Settings → Security →
  Encryption & credentials → Install a certificate → CA certificate (the network
  security config from `plugins/withLocalNetwork.js` trusts user CAs). iOS:
  install the profile, then turn it on under Settings → General → About →
  Certificate Trust Settings.

The first two use the app's own native module, `modules/july-tls` (Kotlin and
Swift), which adds a per-host rule to React Native's fetch and WebSocket. The
phone's normal checks always run first; a rule only rescues a certificate they
refuse. It needs a development or EAS build; in Expo Go and on the web, setup
says so and the app uses the plain port or a CA installed on the phone.

## Develop

```bash
npm install
```

```bash
npx expo start
```

The **web** build runs the demo only, because browsers can't reach the oven's
TLS or set WebSocket headers. For a real oven, use a development build on a
phone. Expo Go may reach the plain port, but it doesn't include the app's network config plugin or its certificate module:

```bash
npx eas-cli@latest build --profile development --platform android
```

Installable test builds (an APK for Android, internal distribution for iOS):

```bash
npx eas-cli@latest build --profile preview --platform all
```

iOS builds need an Apple Developer account; EAS handles signing, so no Mac is needed.

If EAS can't resolve the project's git root (for example when building from a
mapped network drive), set `EAS_NO_VCS=1`. EAS then uploads the folder as-is,
filtered by `.easignore`. Building from a local copy of the folder also works.

### Phone board (review every screen at once)

`public/phones.html` shows the app's screens side by side in phone-sized frames:
Welcome, Set up, Pair, the home screen in each oven state (preheating, ready,
cooking, probe, done, offline), the start review, Settings and the camera. Pick
the device size (your phone, small Android, iPhone, iPhone SE) and zoom at the
top. Each frame is the real web dev build, so you can tap and scroll in it.

```bash
npx expo start --web
```

Then open **http://localhost:8081/phones.html**. To review from another computer
on the same network, open `http://<this computer's IP>:8081/phones.html` instead
(`ipconfig` shows the IP; Windows may ask once to let Node through its firewall).
The frames load two at a time, the ones in view first, so the board fills in
over a few seconds. If every frame stays blank, restart the dev server: piled-up
bundle requests can keep it busy.

The oven states come from `?demo=<state>` (web dev builds only), so any screen can
be opened on its own too, for example `http://localhost:8081/?demo=cooking`.
The home screen sizes itself to the phone, so switch the device size at the top
to see it on each.

### Build an APK on this machine

No EAS and no build quota: one command builds an APK to send to any Android phone.

```bash
npm run build:apk
```

It builds the current commit (uncommitted changes are left out, with a warning)
and copies the APK to `dist/project-july-<commit>.apk`. By default it builds for
64-bit ARM (`arm64-v8a`), which covers phones from the last several years;
`npm run build:apk -- --abi=all` adds older and emulator CPUs at about four
times the build time. The first build takes a few minutes; later ones are
faster.

**One-time setup:**

- **Java 17**, for example `winget install --id Microsoft.OpenJDK.17 --scope user`.
  The script finds it in the usual install folders, or uses `JAVA_HOME`.
- **The Android SDK**, in `%LOCALAPPDATA%\Android\Sdk` (or `ANDROID_HOME`):
  platform 36, build-tools 36.0.0, NDK 27.1.12297006 and CMake 3.22.1. Download
  the command-line tools from developer.android.com into
  `Sdk\cmdline-tools\latest`, run `sdkmanager --licenses` to read and accept
  Google's license, then install the packages. Pass them in a file
  (`sdkmanager --package_file=packages.txt`, one per line), because Windows
  splits a `ndk;27…` argument at the semicolon. Android Studio's setup does the
  same if you'd rather use it.

**Why it builds in `C:\pj-july`.** On Windows the native C++ build fails in a
deep folder: object file paths pass CMake's 250-character limit and ninja stops
with *build.ninja still dirty after 100 tries*. A `subst` drive or a junction
doesn't help, because Node resolves them back to the real path. So when this
checkout's path is long, the script keeps a second git worktree at `C:\pj-july`
(`--dir=` to choose another), moves it to the current commit, and builds there.
Remove it with `git worktree remove C:/pj-july`.

**Installing.** The APK is signed with the standard local test key, not EAS's.
Android won't install one over the other, so uninstall an EAS build of the app
first; that clears its pairing.

### Release builds and updates

Google Play builds are AABs signed with the EAS keystore. They can be built on
EAS (`eas build -p android --profile production`) or on your own machine, which
doesn't use the EAS build quota:

```bash
npm run build:android:local
```

Unlike `npm run build:apk`, it builds this checkout in place (uncommitted changes
included) and signs with the EAS key, so the AAB can go to Play.
It writes `dist/project-july-<versionCode>.aab`, taking the next version code
after EAS's (`eas build:version:get`). Afterwards, run
`eas build:version:set -p android` and enter that number so the next build doesn't
reuse it. A local build needs:

- `credentials.json` from `eas credentials -p android` (credentials.json →
  Download). It's gitignored and easignored; `plugins/withLocalReleaseSigning.js`
  reads it at build time.
- JDK 17+ and the Android SDK, plus, on Windows, CMake 3.31.6
  (`sdkmanager "cmake/3.31.6"`) and long paths turned on
  (`LongPathsEnabled` = 1 under `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem`).
  `plugins/withWindowsNativeBuild.js` points the native builds at that CMake.

JavaScript-only changes ship without a new build, through EAS Update:

```bash
npx eas-cli@latest update --channel production --message "Describe the change" --environment production
```

An update reaches only builds with the same runtime version, which is a
fingerprint of the native project (`runtimeVersion.policy: fingerprint`). Changing
`app.json`, `plugins/`, native dependencies or package.json scripts changes it,
so those changes need a new build. `fingerprint.config.js` leaves `eas.json` and
`.easignore` out.

`store-assets/` holds the Play Store icon, feature graphic and screenshots, and
`docs/screenshots/` the smaller ones above. Both come from the web demo
(`?demo=<scene>`) at 1080×1920.

### Checks

```bash
npm run typecheck
```

```bash
npx expo lint
```

```bash
npm test
```

```bash
npm run test:integration
```

- `npm test` checks the protocol against the Home Assistant client's test
  vectors: the SRP `B` hash, the Damm check digit, signature layout, and a full
  SRP handshake where both sides derive the same key. It also checks the
  endpoint URLs, the MJPEG parser, and Live view's stream, reconnect and
  stills fallback against a local stand-in for june-local's stream, and delayed
  start (when a pending cook should wait, start, hold, or ask).
- `npm run test:integration` starts the Python reference server
  (`june_local_cloud.py`; set `JUNE_LOCAL_CLOUD` to its path, needs `py` and
  `openssl`) with a throwaway certificate.
  It then drives the app's real `PairingSession` and `LiveOven` against a
  simulated oven: pairing, preheat, timer, temperature change, cancel, camera
  URL, and an Ed25519 check of every frame.
- To run it against the real server instead, build `june-local` from the
  installer repo's `golocal/` (Go 1.22 or newer; `camerad` builds only for
  Linux) and set `JUNE_LOCAL_BIN`. This also checks the plain listener and
  Live view's MJPEG stream:

  ```bash
  JUNE_LOCAL_BIN=/path/to/golocal/june-local.exe npm run test:integration
  ```

If Node reports *Access is denied* loading a `.node` file (some drives block
native binaries), prefix commands with
`NODE_OPTIONS=--require ./scripts/dev/native-from-c.cjs`.

## Layout

```
src/app/          screens (Expo Router): index, cook, camera, settings, setup/index, setup/pair
src/api/          protocol.ts (crypto + frames), pairing.ts, client.ts (live link),
                  mjpeg.ts (camera stream), demo.ts, endpoint.ts, modes.ts, schedule.ts, pairingCode.ts,
                  discover.ts + scan.ts (network search), trust.ts (home certificate)
src/state/        OvenProvider (paired oven, live link, preferences, certificate trust), secure storage
src/components/   shared components, icons, OvenHero (July), GlassHero + glass.tsx (Still Glass)
src/theme/        themes.ts (Still Glass and July: palettes, fonts, type, looks) and the ThemeProvider
modules/july-tls/ native module: per-host certificate trust for fetch and WebSocket
docs/screenshots/ README screenshots (store-assets/ has the Play Store graphics)
plugins/          Android network security config (user CAs, cleartext for the plain port),
                  photo saving permission, local release signing, Windows native build settings
scripts/          protocol, client, camera, discovery, delayed-start and integration tests;
                  build-apk.mjs (test APK), build-android-release.js (Play AAB)
```

## Known gaps

- No recipes or guided programs.
- No way to set a probe target from the phone; the app shows the one the oven reports.
  A phone start is refused while a probe is plugged in, so probe cooks (a probe on
  Reheat too) start on the oven.
- **Slow cook** isn't offered, here or in the Home Assistant integration. On the oven
  it is a choice of High or Low power, like Grill without Medium: `plan_index` 0 High
  (320 °F, `temperature_cavity` 160000) or 1 Low (284 °F, 140000). The installer's
  Chef patch refuses a remote `slow_cook` (`not-allowed`): its plans carry 0-duration
  steps until the oven's own screen sets a duration, and an earlier patch that let it
  through rebooted the oven. To add it: a duration with the start (`duration_ms`) in
  the installer, then a High / Low choice and a required timer in the review (Grill's
  picker and Reheat's timer).
- **Sous vide** isn't offered yet, pending a test on a real oven. The stock Chef app
  already accepts it remotely: `primitive_type: "sous_vide"`, one plan at 60 °C
  (140 °F). To try: start it from the phone, then check the oven runs it, a
  temperature change (`11005`) and a timer, and Stop.
