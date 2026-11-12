import { Text, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useLargeText } from '../lib/useLargeText';
import { colors, createThemedStyles, spacing, typography } from '../theme/theme';

// One label/value line inside a details card, with an optional icon. Pass
// `right` instead of `value` to show a badge or button on the right side.
//
// Long values (a full pickup location, a long name) wrap instead of being
// cut off. With large text (lib/useLargeText.js) the value moves under its
// label so both stay readable.
export default function InfoRow({ icon, label, value, right, muted = false, divider = false }) {
  const isLarge = useLargeText();
  const iconElement = icon ? <Ionicons name={icon} size={17} color={colors.textMuted} style={styles.icon} /> : null;

  if (isLarge) {
    return (
      <View testID="info-row" style={[styles.stacked, divider && styles.divider]}>
        <View style={styles.labelRow}>
          {iconElement}
          <Text style={[styles.label, styles.labelStacked]}>{label}</Text>
        </View>
        {right ? (
          <View style={styles.rightStacked}>{right}</View>
        ) : (
          <Text style={[styles.value, styles.valueStacked, muted && styles.valueMuted]}>{value}</Text>
        )}
      </View>
    );
  }

  return (
    <View testID="info-row" style={[styles.row, divider && styles.divider]}>
      {iconElement}
      <Text style={styles.label}>{label}</Text>
      {right ? (
        right
      ) : (
        <Text style={[styles.value, muted && styles.valueMuted]}>{value}</Text>
      )}
    </View>
  );
}

const styles = createThemedStyles(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  stacked: {
    paddingVertical: spacing.md,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 10,
  },
  label: {
    ...typography.label,
    color: colors.textMuted,
    marginRight: spacing.md,
    // A long label wraps rather than squeezing the value to nothing.
    flexShrink: 1,
    maxWidth: '50%',
  },
  labelStacked: {
    marginRight: 0,
    maxWidth: '100%',
  },
  value: {
    ...typography.bodyStrong,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
  valueStacked: {
    flex: 0,
    textAlign: 'left',
    marginTop: spacing.xs,
  },
  valueMuted: {
    color: colors.textFaint,
    fontWeight: '500',
  },
  rightStacked: {
    alignItems: 'flex-start',
    marginTop: spacing.sm,
  },
}));
