import { AccessibilityInfo, Pressable, Switch, Text, View } from 'react-native';
import Badge from './Badge';
import FormSection from './FormSection';
import SegmentedControl from './SegmentedControl';
import { TEXT_SIZE_OPTIONS } from '../lib/accessibilitySettings';
import { useAccessibility } from '../lib/useAccessibility';
import { colors, createThemedStyles, spacing, typography } from '../theme/theme';

// Profile › Accessibility (Accessibility Phase 1). Accessibility Mode is the
// master switch; while it's on, the app's own text size and Reduce Motion can
// be chosen. High Contrast and Simplified Interface are shown as Coming soon
// and can't be switched on yet. Settings are saved on this phone right away
// (lib/useAccessibility.js); the phone's own accessibility settings always
// apply, whatever is chosen here.
export default function AccessibilitySettingsSection() {
  const { settings, systemReduceMotion, updateSettings } = useAccessibility();

  function handleToggleMode(enabled) {
    updateSettings({ enabled });
    AccessibilityInfo.announceForAccessibility(
      enabled
        ? 'Accessibility Mode on. Text size and motion settings are shown below.'
        : 'Accessibility Mode off.'
    );
  }

  return (
    <FormSection title="Accessibility" icon="accessibility-outline" tint={colors.primary}>
      <Text style={styles.intro}>
        Your phone’s accessibility settings, like text size, Reduce Motion, VoiceOver, and TalkBack,
        always work in CarpoolBoard. Accessibility Mode adds extra options. Saved on this phone.
      </Text>

      <SettingSwitch
        title="Accessibility Mode"
        description={
          settings.enabled
            ? 'On. Choose your options below.'
            : 'Turn on to choose a larger text size and reduce motion in CarpoolBoard.'
        }
        value={settings.enabled}
        onChange={handleToggleMode}
      />

      {settings.enabled && (
        <>
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Text size</Text>
            <Text style={styles.description}>
              Makes CarpoolBoard’s text larger, on top of your phone’s text size setting.
            </Text>
            <SegmentedControl
              options={TEXT_SIZE_OPTIONS}
              value={settings.textSize}
              onChange={(textSize) => updateSettings({ textSize })}
              accessibilityLabel="Text size"
              style={styles.segmented}
            />
          </View>

          <SettingSwitch
            title="Reduce Motion"
            description={
              systemReduceMotion
                ? 'Your phone’s Reduce Motion setting is on, so CarpoolBoard already keeps motion to a minimum.'
                : 'Turns off sliding, zooming, and shrinking animations in CarpoolBoard.'
            }
            value={settings.reduceMotion}
            onChange={(reduceMotion) => updateSettings({ reduceMotion })}
            divider
          />

          <SettingSwitch
            title="High Contrast"
            description="Stronger colors and borders for easier reading."
            comingSoon
            divider
          />

          <SettingSwitch
            title="Simplified Interface"
            description="Fewer details on each screen, with larger, simpler actions."
            comingSoon
            divider
          />
        </>
      )}
    </FormSection>
  );
}

// One setting: the whole row is a single switch for screen readers ("Reduce
// Motion, switch, off" plus the description) and one large touch target.
// The Switch drawn on the right is part of the row, not a second stop.
// `comingSoon` rows are shown off and disabled with a Coming soon badge.
function SettingSwitch({ title, description, value = false, onChange, comingSoon = false, divider = false }) {
  const disabled = comingSoon;
  return (
    <Pressable
      onPress={() => onChange?.(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={comingSoon ? `${title}, coming soon` : title}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled }}
      style={({ pressed }) => [
        styles.row,
        divider && styles.divider,
        pressed && !disabled && styles.rowPressed,
      ]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, disabled && styles.rowTitleDisabled]}>{title}</Text>
        {comingSoon ? <Badge label="Coming soon" tone="muted" style={styles.badge} /> : null}
        <Text style={styles.description}>{description}</Text>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ false: colors.borderStrong, true: colors.primary }}
          ios_backgroundColor={colors.borderStrong}
        />
      </View>
    </Pressable>
  );
}

const styles = createThemedStyles(() => ({
  intro: {
    ...typography.body,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: spacing.md,
  },
  rowPressed: {
    opacity: 0.7,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowText: {
    flex: 1,
    marginRight: spacing.md,
  },
  rowTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  // Muted rather than faint so a Coming soon title stays readable.
  rowTitleDisabled: {
    color: colors.textMuted,
  },
  badge: {
    marginTop: spacing.xs,
  },
  description: {
    ...typography.caption,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: 2,
  },
  block: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.md,
  },
  blockTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  segmented: {
    marginTop: spacing.md,
  },
}));
