import { AccessibilityInfo, Pressable, Switch, Text, View } from 'react-native';
import Badge from './Badge';
import FormSection from './FormSection';
import SegmentedControl from './SegmentedControl';
import { TEXT_SIZE_OPTIONS } from '../lib/accessibilitySettings';
import { useAccessibility } from '../lib/useAccessibility';
import { colors, createThemedStyles, spacing, typography } from '../theme/theme';

// Profile › Accessibility (Accessibility Phase 1). Accessibility Mode is the
// master switch; while it's on, the app's own text size, Reduce Motion, High
// Contrast, and Simplified Interface can be chosen. Settings are saved on this phone right away
// (lib/useAccessibility.js); the phone's own accessibility settings always
// apply, whatever is chosen here.
//
// While the phone's Reduce Motion is on, the app's Reduce Motion switch is
// shown on and can't be changed (motion is reduced anyway). The saved app
// choice is left as it was and shows again once the phone's setting is off.
export default function AccessibilitySettingsSection() {
  const { settings, systemReduceMotion, updateSettings } = useAccessibility();

  function handleToggleMode(enabled) {
    updateSettings({ enabled });
    AccessibilityInfo.announceForAccessibility(
      enabled
        ? 'Accessibility Mode on. Text size, motion, contrast, and layout settings are shown below.'
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
            : 'Turn on to choose a larger text size, reduce motion, use high contrast, or simplify the layout in CarpoolBoard.'
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
                : REDUCE_MOTION_DESCRIPTION
            }
            value={systemReduceMotion || settings.reduceMotion}
            onChange={(reduceMotion) => updateSettings({ reduceMotion })}
            disabled={systemReduceMotion}
            divider
          />

          <SettingSwitch
            title="High Contrast"
            description="Darker text, stronger borders and outlines, and clearer status colors, in both Light and Dark appearance."
            value={settings.highContrast}
            onChange={(highContrast) => updateSettings({ highContrast })}
            divider
          />

          <SettingSwitch
            title="Simplified Interface"
            description="Shows fewer details on Home and on ride cards, with full-width, clearly labeled buttons. Ride times, places, drivers, seats, and request status stay visible."
            value={settings.simplifiedInterface}
            onChange={(simplifiedInterface) => updateSettings({ simplifiedInterface })}
            divider
          />
        </>
      )}
    </FormSection>
  );
}

// What the app's own Reduce Motion changes, in plain words.
const REDUCE_MOTION_DESCRIPTION =
  'Map zooming and re-centering, scrolling, pop-up messages, and button press effects happen instantly instead of animating.';

// One setting: the whole row is a single switch for screen readers ("Reduce
// Motion, switch, off" plus the description) and one large touch target.
// The Switch drawn on the right is part of the row, not a second stop.
// `comingSoon` rows are shown off and disabled with a Coming soon badge.
// `disabled` rows show `value` but can't be changed.
function SettingSwitch({
  title,
  description,
  value = false,
  onChange,
  comingSoon = false,
  disabled: isLocked = false,
  divider = false,
}) {
  const disabled = comingSoon || isLocked;
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
