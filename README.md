# Project July — mobile app

The phone app for Project July ("June, local"). One Expo / React Native codebase builds the
**iOS and Android** apps. The app talks to the oven's local `june-local`
server over the home network, with no June cloud involved.

It has two themes, each in light and dark (Settings → Appearance, with Match phone /
Light / Dark):

- **Still Glass** (the default) matches the Home Assistant July Oven card
  ([prj-july/ha-june-oven, docs/july-oven-card](https://github.com/prj-july/ha-june-oven/tree/main/docs/july-oven-card)).
  It uses Barlow Semi Condensed / Barlow Condensed type and the oven's black glass in dark.
  The oven tile follows the card's layout: name with a one-tap red Stop, a big number
  with a status mark (↑ preheating, ✓ ready, flame cooking), the heat line, a 4:3 camera
  and +1/+5/+10 min chips. When the oven is off it shows the home screen, with a clock and
  glowing mode tiles. Starting goes through a review that warns the oven must be empty
  and closes itself after 5 minutes.
- **July** is the original July Oven design system: warm
  neutrals, one ember accent, Fraunces / Public Sans / IBM Plex Mono, and soft cards.

Both use 18px body text and touch targets of 48px or more, and meet WCAG AA contrast.
Colours, fonts, type scale and component choices for each theme live in
`src/theme/themes.ts`.

## What it does

| Screen | |
|---|---|
| **Welcome** | What Project July is, then *Set up this phone* or *Try the demo first*. |
| **Set up** | Enter the oven's address (`june.local` by default). The app finds the server (HTTPS first, then the plain :80 listener, then :8080 for the reference server) and names this phone. |
| **Pair** | Shows the eight-digit code to type on the oven's Connect screen, with a countdown, then runs the SRP key exchange. |
| **Oven** | Live camera still, large temperature readout, status pill, preheat progress, timer countdown, and probe reading with its target. Controls for target temperature, timer and *Stop cooking*. |
| **Start a cook** | Mode (Bake, Roast, Air fry, Broil, Pizza, Reheat, Keep warm, Dehydrate, Proof, Slow cook), temperature and an optional timer. |
| **Live view** | The oven's MJPEG camera stream (about one picture a second, the stock camera's rate). The camera and interior light stay on while it is open. |
| **Settings** | Theme and light/dark, oven details, connection, °F/°C, server status page, and unpairing. |

The demo mode is a simulated oven, always labelled *Demo*, so people can try
the app (and designers can review it) without an oven.

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
- **Commands** (`src/api/client.ts`). These are compact JSON frames in the stock
  app's Gson key order, signed with Ed25519 (`signature = base64(blake2b8(pubkey) || sig)`).
  june-local only relays; the **oven** checks the signature, so only paired phones
  can control it. Acknowledgements (`10020`) are matched by `order` and turned into
  plain-language errors ("The oven door is open…").
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

### Certificates and the plain-HTTP fallback

`june-local` serves the same routes on TLS :443 and plain :80 (the installer's
boot image runs it with `--http-port 80`; the Python reference server uses
:8080). The app tries HTTPS first. If the phone doesn't trust the home
certificate yet, it uses plain :80 (or :8080), and says so on the setup and
settings screens. Over plain HTTP, commands are still signed and pairing is still
SRP-protected, but the link itself is not encrypted. Basic installs keep June's
factory certificate, which no phone will accept for the oven's address, so they
always use plain HTTP.

The installer names the oven `june.local` by default, advertises it over mDNS,
and puts it in the certificate.

To use HTTPS, generate per-install certs with june-local's `generate_certs.sh` (set
`JUNE_IP_SAN` to the oven's IP so the address people type matches the
certificate), then install `ca.crt` on the phone:

- **Android:** Settings → Security → Encryption & credentials → Install a
  certificate → CA certificate. The app's network security config (added by
  `plugins/withLocalNetwork.js`) trusts user CAs.
- **iOS:** AirDrop or email `ca.crt`, install the profile, then turn it on under
  Settings → General → About → Certificate Trust Settings.

## Develop

```bash
npm install
```

```bash
npx expo start
```

The **web** build runs the demo only, because browsers can't reach the oven's
TLS or set WebSocket headers. For a real oven, use a development build on a
phone. Expo Go may reach the plain :80 listener, but it doesn't include the app's network config plugin:

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
  stills fallback against a local stand-in for june-local's stream.
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
                  demo.ts, endpoint.ts, mjpeg.ts (camera stream), modes.ts, pairingCode.ts
src/state/        OvenProvider (paired oven, live link, preferences), secure storage
src/components/   shared components, icons, OvenHero (July), GlassHero + glass.tsx (Still Glass)
src/theme/        themes.ts (Still Glass and July: palettes, fonts, type, looks) and the ThemeProvider
plugins/          Android network security config (user CAs, cleartext for the plain listener)
scripts/          protocol, client, camera and integration tests
```

## Known gaps

- **Not yet tested on a real oven.** Protocol behaviour comes from the Home
  Assistant integration (which does run against ovens) and the reference server.
  Pair a phone and check every control against a real oven before handing the
  app to owners.
- Changing the temperature mid-cook tries `11005`. If the oven refuses, the app
  restarts the cook at the new temperature, as the Home Assistant integration does.
- No recipes or guided programs yet, and one oven per phone. The installer can
  now put June's presets content on the oven (not in the public payload), which
  Proof and Slow Cook load on the oven. Starting those from the phone with
  `11002` is unverified: the Home Assistant integration offers only Bake, Roast,
  Broil, Air fry and Toast, and only Bake has been tested on a real oven.
- No way to set a probe target from the phone; the app shows the one the oven reports.
- Pairing identifies the phone as `platform: "Android"` on both OSes, matching
  the stock app, because the oven's expectations for other values are unknown.
