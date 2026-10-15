import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { cookParams, entryLine, entrySummary, groupByDay, outcomeLabel } from '@/api/history';
import { Icon } from '@/components/Icon';
import { useNow } from '@/components/OvenHero';
import { Button, Card, Screen, SectionLabel, T, confirm } from '@/components/ui';
import { useOven, useOvenName } from '@/state/oven';
import { space, useTheme } from '@/theme';

export default function History() {
  const { c, f } = useTheme();
  const { history, currentId, prefs, clearHistory, ovens } = useOven();
  const name = useOvenName();
  const unit = prefs.unit;
  const now = useNow(true, 30_000);
  const days = currentId ? groupByDay(history, currentId, now) : [];
  const empty = days.length === 0;
  const hasOven = ovens.length > 0;

  async function clear() {
    const ok = await confirm(
      `Clear ${name}'s history?`,
      'This removes the cooks listed here from this phone. The oven is not changed.',
      'Clear history',
    );
    if (ok) clearHistory();
  }

  return (
    <Screen
      footer={
        empty ? (
          hasOven ? (
            <Button variant="primary" icon="flame" onPress={() => router.push('/cook')}>Start a cook</Button>
          ) : null
        ) : (
          <Button variant="quiet" onPress={clear}>Clear history</Button>
        )
      }
    >
      <View style={{ gap: space[2] }}>
        <T v="lead">{name}</T>
        <T muted>
          {empty
            ? 'Nothing here yet. Cooks you start from this phone, and cooks that finish on the oven, show up here. Repeat opens the review with the same settings; nothing heats until you press Start.'
            : 'Repeat opens the review with the same mode, temperature and timer. Nothing heats until you press Start.'}
        </T>
      </View>

      {days.map((day) => (
        <View key={day.key} style={{ gap: space[3] }}>
          <SectionLabel>{day.label}</SectionLabel>
          <Card padded={false}>
            {day.entries.map((e, i) => {
              const summary = entrySummary(e, unit);
              const cooking = e.outcome === 'running';
              return (
                <View key={e.id}>
                  {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: space[5] }} /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Repeat ${summary}. ${entryLine(e, now)}`}
                    onPress={() => router.push({ pathname: '/cook', params: cookParams(e) })}
                    style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfaceSunken }]}
                  >
                    <View style={[styles.dot, { backgroundColor: cooking ? c.ember : e.outcome === 'completed' ? c.ready : c.inkMuted }]} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text numberOfLines={1} style={{ fontFamily: f.sansStrong, fontSize: 17, color: c.ink }}>{summary}</Text>
                      <Text numberOfLines={1} style={{ fontFamily: f.sans, fontSize: 14, lineHeight: 19, color: c.inkMuted }}>{entryLine(e, now)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Text style={{ fontFamily: f.sansStrong, fontSize: 16, color: c.ember }}>Repeat</Text>
                      <Text style={{ fontFamily: f.sans, fontSize: 13, color: c.inkMuted }}>{outcomeLabel(e.outcome)}</Text>
                    </View>
                    <Icon name="chevron-right" size={18} color={c.inkMuted} />
                  </Pressable>
                </View>
              );
            })}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 72, paddingHorizontal: space[5], paddingVertical: space[3] },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
