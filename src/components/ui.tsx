// Shared components. Colour, type, radii and a few component choices come from
// the active theme (src/theme/themes.ts): the July design system or Still Glass.
import { forwardRef, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space, useTheme, type TypeName } from '@/theme';
import { GlassFill, Gradient, StatusLine, type MarkKind } from './glass';
import { Icon, type IconName } from './Icon';

export type OvenState = 'ready' | 'paired' | 'preheating' | 'cooking' | 'offline' | 'fault' | 'idle' | 'done';

// --- Text ------------------------------------------------------------------

export function T({ v = 'body', muted, color, style, children, ...rest }: {
  v?: TypeName; muted?: boolean; color?: string; style?: TextStyle | TextStyle[];
  children: ReactNode; numberOfLines?: number; accessibilityRole?: 'header' | 'text';
}) {
  const { c, t } = useTheme();
  return (
    <Text {...rest} style={[t[v], { color: color ?? (muted ? c.inkMuted : c.ink) }, style]}>
      {children}
    </Text>
  );
}

// --- Button ----------------------------------------------------------------

export function Button({ variant = 'secondary', icon, onPress, disabled, busy, children, style, accessibilityLabel }: {
  /** `stop` is red on glass and an ordinary outlined button in July. */
  variant?: 'primary' | 'secondary' | 'quiet' | 'stop'; icon?: IconName; onPress?: () => void;
  disabled?: boolean; busy?: boolean; children: ReactNode; style?: ViewStyle; accessibilityLabel?: string;
}) {
  const { c, t, r, look } = useTheme();
  const gradient = variant === 'primary' && look.primary === 'gradient';
  const redStop = variant === 'stop' && look.stop === 'red';
  const kind = variant === 'stop' && !redStop ? 'secondary' : variant;
  const fg = gradient ? c.onGo : redStop ? c.onStop : kind === 'primary' ? c.onEmber : kind === 'quiet' ? c.ember : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={() => {
        Haptics.impactAsync(variant === 'stop' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.btn,
        { minHeight: look.buttonHeight, borderRadius: gradient ? r.lg : r.md },
        kind === 'primary' && { backgroundColor: c.ember, borderColor: gradient ? 'transparent' : c.ember },
        redStop && { backgroundColor: c.stop, borderColor: c.stop },
        kind === 'secondary' && { backgroundColor: pressed ? c.surfaceSunken : look.glassCards ? 'transparent' : c.surfaceRaised, borderColor: c.lineStrong },
        kind === 'quiet' && { backgroundColor: pressed ? c.emberSoft : 'transparent', borderColor: 'transparent', paddingHorizontal: space[3] },
        (kind === 'primary' || redStop) && pressed && { opacity: 0.88 },
        (disabled || busy) && { opacity: 0.5 },
        style,
      ]}
    >
      {gradient ? <Gradient colors={[c.go1, c.go2]} horizontal /> : null}
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <Text style={[t.button, { color: fg }]}>{children}</Text>
    </Pressable>
  );
}

// --- StatusPill ------------------------------------------------------------

const PILL_LABEL: Record<OvenState, string> = {
  ready: 'Ready', paired: 'Paired', preheating: 'Preheating', cooking: 'Cooking',
  offline: 'Offline', fault: 'Needs attention', idle: 'Idle', done: 'Done',
};

const STATE_MARK: Record<OvenState, MarkKind> = {
  ready: 'ready', paired: 'ready', preheating: 'preheat', cooking: 'cooking',
  offline: 'offline', fault: 'warn', idle: 'off', done: 'done',
};

export function StatusPill({ state, children }: { state: OvenState; children?: string }) {
  const { c, f, look } = useTheme();
  const label = children ?? PILL_LABEL[state];
  if (look.status === 'mark') return <StatusLine kind={STATE_MARK[state]} word={label} />;
  const [bg, fg] =
    state === 'ready' || state === 'paired' || state === 'done' ? [c.readySoft, c.ready]
    : state === 'preheating' ? [c.heatSoft, c.heat]
    : state === 'cooking' ? [c.emberSoft, c.ember]
    : state === 'fault' ? [c.faultSoft, c.fault]
    : [c.surfaceSunken, c.inkMuted];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]} accessibilityRole="text" accessibilityLabel={`Status: ${label}`}>
      <View style={[styles.pillDot, { backgroundColor: fg }]} />
      <Text style={{ fontFamily: f.sansStrong, fontSize: 15, color: fg }}>{label}</Text>
    </View>
  );
}

// --- Card / Notice / SetupStep --------------------------------------------

export function Card({ children, style, padded = true }: { children: ReactNode; style?: ViewStyle; padded?: boolean }) {
  const { c, r, look, shadowSm } = useTheme();
  return (
    <View
      style={[
        { borderRadius: r.lg, borderWidth: 1, borderColor: c.line, backgroundColor: c.surfaceRaised },
        look.glassCards ? { overflow: 'hidden' } : shadowSm,
        padded && { padding: space[5] },
        style,
      ]}
    >
      {look.glassCards ? <GlassFill /> : null}
      {children}
    </View>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'success' | 'warning'; title?: ReactNode; children?: ReactNode }) {
  const { c, r } = useTheme();
  const bg = tone === 'success' ? c.readySoft : tone === 'warning' ? c.faultSoft : c.surfaceSunken;
  const mark = tone === 'success' ? c.ready : tone === 'warning' ? c.fault : c.inkMuted;
  return (
    <View
      style={[styles.notice, { borderRadius: r.md, backgroundColor: bg, borderColor: tone === 'info' ? c.line : 'transparent' }]}
      accessibilityLiveRegion={tone === 'warning' ? 'assertive' : 'none'}
    >
      <Icon name={tone === 'success' ? 'check-circle' : tone === 'warning' ? 'alert' : 'house'} color={mark} />
      <View style={{ flex: 1, gap: space[1] }}>
        {title ? <T v="bodyStrong">{title}</T> : null}
        {children ? <T muted>{children}</T> : null}
      </View>
    </View>
  );
}

export function SetupStep({ n, title, children, done }: { n: number; title: ReactNode; children?: ReactNode; done?: boolean }) {
  const { c, t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space[4], alignItems: 'flex-start' }}>
      <View style={[styles.stepNum, { backgroundColor: done ? c.readySoft : c.emberSoft }]}>
        {done ? <Icon name="check-circle" size={22} color={c.ready} /> : <Text style={[t.button, { color: c.ember }]}>{n}</Text>}
      </View>
      <View style={{ flex: 1, gap: space[1], paddingTop: 6 }}>
        <T v="bodyStrong">{title}</T>
        {children ? <T muted>{children}</T> : null}
      </View>
    </View>
  );
}

// --- Field -----------------------------------------------------------------

export const Field = forwardRef<TextInput, TextInputProps & { label: string; hint?: ReactNode; code?: boolean; error?: string }>(
  function Field({ label, hint, code, error, style, ...rest }, ref) {
    const { c, f, r } = useTheme();
    const [focused, setFocused] = useState(false);
    return (
      <View style={{ gap: space[2] }}>
        <Text style={{ fontFamily: f.sansStrong, fontSize: 15, color: c.ink }}>{label}</Text>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={c.inkMuted}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
          {...rest}
          style={[
            styles.input,
            { fontFamily: f.sans, borderRadius: r.sm, color: c.ink, backgroundColor: c.surfaceRaised, borderColor: error ? c.fault : focused ? c.focus : c.lineStrong },
            focused && { borderWidth: 2.5 },
            code && { fontFamily: f.mono, fontSize: 28, letterSpacing: 8, textAlign: 'center', minHeight: 64 },
            style,
          ]}
        />
        {error ? <T v="small" color={c.fault}>{error}</T> : hint ? <T v="small" muted>{hint}</T> : null}
      </View>
    );
  },
);

// --- Rows ------------------------------------------------------------------

export function Row({ icon, label, value, onPress, mono }: { icon?: IconName; label: string; value?: ReactNode; onPress?: () => void; mono?: boolean }) {
  const { c } = useTheme();
  const body = (
    <View style={styles.row}>
      {icon ? <Icon name={icon} color={c.inkMuted} /> : null}
      <T style={{ flex: 1 }}>{label}</T>
      {value != null ? <T v={mono ? 'code' : 'body'} muted numberOfLines={1}>{value}</T> : null}
      {onPress ? <Icon name="chevron-right" size={20} color={c.inkMuted} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { backgroundColor: c.surfaceSunken }}>
      {body}
    </Pressable>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: space[5] }} />;
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1.5, paddingHorizontal: space[6], overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2],
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: space[2], alignSelf: 'flex-start',
    minHeight: 32, paddingLeft: space[3], paddingRight: space[4], borderRadius: 9999,
  },
  pillDot: { width: 10, height: 10, borderRadius: 9999 },
  notice: { flexDirection: 'row', gap: space[3], padding: space[5], borderWidth: 1 },
  stepNum: { width: 40, height: 40, borderRadius: 9999, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 56, paddingHorizontal: space[4], borderWidth: 1.5, fontSize: 18 },
  screenInner: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: space[5], paddingTop: space[4], gap: space[6] },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[4], paddingHorizontal: space[5] },
  footerInner: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space[3] },
  chip: { minHeight: 48, paddingHorizontal: space[4], borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  chipCompact: { minHeight: 36, minWidth: 56, paddingHorizontal: space[3], borderWidth: 1 },
  segment: { flexDirection: 'row', padding: 4, borderWidth: 1, gap: 4 },
  segmentItem: { flex: 1, minHeight: 48, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[5], minHeight: 56 },
});

// --- Layout & controls -----------------------------------------------------

function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return shown;
}

export function Screen({ children, footer, scroll = true }: { children: ReactNode; footer?: ReactNode; scroll?: boolean }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  // The app draws edge to edge, so Android no longer resizes the window for the
  // keyboard: pad on both platforms so the footer rides on top of it.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const keyboard = useKeyboardShown();
  const inner = <View style={styles.screenInner}>{children}</View>;
  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={headerHeight} style={{ flex: 1, backgroundColor: c.surface }}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ paddingBottom: footer ? space[6] : insets.bottom + space[8] }} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : inner}
      {footer ? (
        <View style={[styles.footer, { borderTopColor: c.line, backgroundColor: c.surface, paddingBottom: (keyboard ? 0 : insets.bottom) + space[4] }]}>
          <View style={styles.footerInner}>{footer}</View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <T v="label" muted accessibilityRole="header">{children}</T>;
}

export function Chip({ selected, onPress, children, accessibilityLabel, compact }: {
  selected?: boolean; onPress: () => void; children: ReactNode; accessibilityLabel?: string;
  /** Drawn 36 px tall with a 48 px tap area (the card's add-time buttons). */
  compact?: boolean;
}) {
  const { c, f, r, look } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      hitSlop={compact ? { top: 6, bottom: 6 } : undefined}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.chipCompact,
        { borderRadius: look.glassCards ? r.sm : 9999 },
        { borderColor: selected ? c.ember : c.lineStrong, backgroundColor: selected ? c.emberSoft : pressed ? c.surfaceSunken : look.glassCards ? 'transparent' : c.surfaceRaised },
        selected && { borderWidth: 2 },
      ]}
    >
      <Text style={{ fontFamily: look.glassCards ? f.sansMedium : f.sansStrong, fontSize: 16, lineHeight: 22, fontVariant: ['tabular-nums'], color: selected ? c.ember : c.ink }}>{children}</Text>
    </Pressable>
  );
}

export function Segmented<V extends string>({ value, options, onChange, label }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; label: string }) {
  const { c, t, r } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segment, { borderRadius: r.md, backgroundColor: c.surfaceSunken, borderColor: c.line }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(o.value); }}
            style={[styles.segmentItem, { borderRadius: r.sm }, on && { backgroundColor: c.surfaceRaised, borderColor: c.lineStrong }]}
          >
            <Text style={[t.button, { fontSize: 16, color: on ? c.ink : c.inkMuted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function RoundButton({ icon, onPress, label, disabled, size = 56 }: { icon: IconName; onPress: () => void; label: string; disabled?: boolean; size?: number }) {
  const { c, look } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={6}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onPress(); }}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
        { borderColor: c.lineStrong, backgroundColor: pressed ? c.surfaceSunken : look.glassCards ? 'transparent' : c.surfaceRaised },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Icon name={icon} size={26} color={c.ink} />
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label }: { icon: IconName; onPress: () => void; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, pressed && { backgroundColor: c.surfaceSunken }]}
    >
      <Icon name={icon} color={c.ink} />
    </Pressable>
  );
}

export type BarKind = 'preheat' | 'heat' | 'done' | 'stale';

/**
 * July: a solid bar in `color`. Glass: the card's heat line, 6 px, blue to ember
 * while preheating (the gradient spans the whole track, so it warms as it fills).
 */
export function ProgressBar({ value, color, kind = 'heat' }: { value: number; color: string; kind?: BarKind }) {
  const { c, look } = useTheme();
  const p = Math.max(0, Math.min(1, value));
  const pct = p * 100;
  const a11y = { accessibilityRole: 'progressbar' as const, accessibilityValue: { min: 0, max: 100, now: Math.round(pct) } };
  if (look.bar === 'solid') {
    return (
      <View {...a11y} style={{ height: 8, borderRadius: 4, backgroundColor: c.surfaceSunken, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', borderRadius: 4, backgroundColor: color }} />
      </View>
    );
  }
  const fill =
    kind === 'preheat' ? <Gradient colors={[c.cool, '#e9c24a', c.ember]} locations={[0, 0.6, 1]} horizontal style={{ width: `${100 / Math.max(p, 0.001)}%` }} />
    : kind === 'heat' ? <Gradient colors={[c.ember, c.ember2]} horizontal />
    : kind === 'done' ? <View style={[StyleSheet.absoluteFill, { backgroundColor: c.ready }]} />
    : <View style={[StyleSheet.absoluteFill, { backgroundColor: c.grey, opacity: 0.6 }]} />;
  return (
    <View {...a11y} style={{ height: 6, borderRadius: 3, backgroundColor: c.line }}>
      <View
        style={[
          { width: `${pct}%`, height: '100%', borderRadius: 3, overflow: 'hidden' },
          (kind === 'preheat' || kind === 'heat') && c.glow !== 'transparent' && { shadowColor: c.ember, shadowOpacity: 0.55, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
        ]}
      >
        {fill}
      </View>
    </View>
  );
}

/** A message with an OK button (window.alert on web, where Alert.alert does nothing). */
export function tell(title: string, message: string) {
  if (Platform.OS === 'web') globalThis.alert?.(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/** Alert.alert does nothing on web; fall back to window.confirm there. */
export function confirm(title: string, message: string, confirmLabel: string, cancelLabel = 'Keep going'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? true);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}
