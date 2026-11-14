// Automated tests for Accessibility Mode, Phase 1 (settings foundation).
// Pins down:
//   1. the settings model: defaults, cleaning saved values, Coming soon
//      settings staying off, text size multipliers, Reduce Motion rules
//   2. persistence: settings are saved on this phone and read back the way
//      the app reads them at launch (a restart), and storage failures fall
//      back to Accessibility Mode off
//   3. text scaling: the app's text size multiplies font sizes in the shared
//      style sheets, combines with the phone's setting for the large-text
//      layouts, and fixed-size chrome still stays within 1.5× in total
//   4. reduced motion: the phone's setting always applies, the app's own
//      setting only in Accessibility Mode, and the toast stops animating
//   5. the Profile › Accessibility section: screen-reader switches, text size
//      choices, Coming soon settings that can't be turned on
//
// Faked: expo-secure-store (an in-memory store), the icon font, and the
// AccessibilityInfo calls that ask the phone about its settings.

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Dimensions, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import AccessibilitySettingsSection from '../components/AccessibilitySettingsSection';
import AppButton from '../components/AppButton';
import TabBar from '../components/TabBar';
import Toast from '../components/Toast';
import {
  COMING_SOON_SETTINGS,
  DEFAULT_ACCESSIBILITY_SETTINGS,
  TEXT_SIZE_OPTIONS,
  getAppTextScale,
  normalizeAccessibilitySettings,
  parseAccessibilitySettings,
  serializeAccessibilitySettings,
  shouldReduceMotion,
  textSizeScale,
} from '../lib/accessibilitySettings';
import { loadAccessibilitySettings, saveAccessibilitySettings } from '../lib/preferences';
import { AccessibilityContext, useAccessibilityState, useSystemReduceMotion } from '../lib/useAccessibility';
import { getEffectiveFontScale, useLargeText } from '../lib/useLargeText';
import {
  MAX_CHROME_FONT_SCALE,
  applyTextScale,
  chromeMaxFontSizeMultiplier,
  createThemedStyles,
  getTextScale,
  scaleTextStyles,
} from '../theme/theme';

const mockStore = new Map();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
  getItem: jest.fn((key) => (mockStore.has(key) ? mockStore.get(key) : null)),
  getItemAsync: jest.fn(async (key) => (mockStore.has(key) ? mockStore.get(key) : null)),
  setItemAsync: jest.fn(async (key, value) => {
    mockStore.set(key, value);
  }),
}));

jest.mock('@react-native-vector-icons/ionicons', () => {
  const { Text: MockText } = require('react-native');
  return { __esModule: true, default: ({ name }) => <MockText testID={`icon-${name}`} /> };
});

const STORAGE_KEY = 'carpoolboard.accessibility';
const ORIGINAL_DIMENSIONS = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };

async function setFontScale(fontScale) {
  await act(async () => {
    Dimensions.set({
      window: { ...ORIGINAL_DIMENSIONS.window, fontScale },
      screen: { ...ORIGINAL_DIMENSIONS.screen, fontScale },
    });
  });
}

// The phone's Reduce Motion setting, and the listener the app registers.
let systemReduceMotion = false;
let reduceMotionListener = null;

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
  systemReduceMotion = false;
  reduceMotionListener = null;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(async () => systemReduceMotion);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'reduceMotionChanged') reduceMotionListener = listener;
    return { remove: jest.fn() };
  });
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(async () => {
  jest.restoreAllMocks();
  applyTextScale(1);
  await setFontScale(ORIGINAL_DIMENSIONS.window.fontScale);
});

const flat = (node) => StyleSheet.flatten(node.props.style) || {};

// --- 1. The settings model -------------------------------------------------

describe('accessibility settings model', () => {
  test('defaults: Accessibility Mode off, Normal text, nothing else on', () => {
    expect(DEFAULT_ACCESSIBILITY_SETTINGS).toEqual({
      enabled: false,
      textSize: 'normal',
      reduceMotion: false,
      highContrast: false,
      simplifiedInterface: false,
    });
  });

  test('text sizes are Normal 1×, Large 1.15×, Extra Large 1.3×', () => {
    expect(TEXT_SIZE_OPTIONS.map((o) => [o.key, o.label, o.scale])).toEqual([
      ['normal', 'Normal', 1],
      ['large', 'Large', 1.15],
      ['extraLarge', 'Extra Large', 1.3],
    ]);
    expect(textSizeScale('extraLarge')).toBe(1.3);
    expect(textSizeScale('huge')).toBe(1);
  });

  test('cleans bad, partial, and unknown values', () => {
    expect(normalizeAccessibilitySettings(null)).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
    expect(normalizeAccessibilitySettings('yes')).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
    expect(
      normalizeAccessibilitySettings({ enabled: 'true', textSize: 'giant', reduceMotion: 1, extra: true })
    ).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
    expect(normalizeAccessibilitySettings({ enabled: true, textSize: 'large' })).toEqual({
      ...DEFAULT_ACCESSIBILITY_SETTINGS,
      enabled: true,
      textSize: 'large',
    });
  });

  test('Coming soon settings stay off even if a saved value says on', () => {
    expect(COMING_SOON_SETTINGS).toEqual(['highContrast', 'simplifiedInterface']);
    const settings = normalizeAccessibilitySettings({ enabled: true, highContrast: true, simplifiedInterface: true });
    expect(settings.highContrast).toBe(false);
    expect(settings.simplifiedInterface).toBe(false);
  });

  test('the app text size only applies while Accessibility Mode is on', () => {
    expect(getAppTextScale({ enabled: true, textSize: 'extraLarge' })).toBe(1.3);
    expect(getAppTextScale({ enabled: true, textSize: 'large' })).toBe(1.15);
    expect(getAppTextScale({ enabled: false, textSize: 'extraLarge' })).toBe(1);
    expect(getAppTextScale(null)).toBe(1);
  });

  test('the phone’s Reduce Motion always applies; the app’s only in Accessibility Mode', () => {
    const off = { enabled: false, reduceMotion: true };
    const on = { enabled: true, reduceMotion: true };
    expect(shouldReduceMotion(off, true)).toBe(true);
    expect(shouldReduceMotion(DEFAULT_ACCESSIBILITY_SETTINGS, true)).toBe(true);
    expect(shouldReduceMotion(off, false)).toBe(false);
    expect(shouldReduceMotion(on, false)).toBe(true);
    expect(shouldReduceMotion({ enabled: true, reduceMotion: false }, false)).toBe(false);
  });

  test('round-trips through its saved JSON form', () => {
    const settings = { ...DEFAULT_ACCESSIBILITY_SETTINGS, enabled: true, textSize: 'large', reduceMotion: true };
    expect(parseAccessibilitySettings(serializeAccessibilitySettings(settings))).toEqual(settings);
    expect(parseAccessibilitySettings('{not json')).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
    expect(parseAccessibilitySettings(null)).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
  });
});

// --- 2. Persistence --------------------------------------------------------

describe('saving on this phone', () => {
  test('nothing saved yet: Accessibility Mode off', () => {
    expect(loadAccessibilitySettings()).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
  });

  test('saved settings are read back the way the app reads them at launch', async () => {
    const settings = { ...DEFAULT_ACCESSIBILITY_SETTINGS, enabled: true, textSize: 'extraLarge', reduceMotion: true };
    await saveAccessibilitySettings(settings);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String), expect.any(Object));
    expect(loadAccessibilitySettings()).toEqual(settings);
  });

  test('a storage failure falls back to Accessibility Mode off without throwing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    SecureStore.getItem.mockImplementationOnce(() => {
      throw new Error('keychain locked');
    });
    expect(loadAccessibilitySettings()).toEqual(DEFAULT_ACCESSIBILITY_SETTINGS);
    SecureStore.setItemAsync.mockRejectedValueOnce(new Error('disk full'));
    await expect(saveAccessibilitySettings(DEFAULT_ACCESSIBILITY_SETTINGS)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

// --- 3. Text scaling -------------------------------------------------------

describe('app text size', () => {
  test('scales font sizes and line heights, and nothing else', () => {
    const scaled = scaleTextStyles(
      { title: { fontSize: 20, lineHeight: 24, padding: 8, minHeight: 50 }, box: { width: 10 } },
      1.3
    );
    expect(scaled.title).toEqual({ fontSize: 26, lineHeight: 31.2, padding: 8, minHeight: 50 });
    expect(scaled.box).toEqual({ width: 10 });
  });

  test('ignores invalid multipliers', () => {
    applyTextScale(0.5);
    expect(getTextScale()).toBe(1);
    applyTextScale(Number.NaN);
    expect(getTextScale()).toBe(1);
    applyTextScale(1.15);
    expect(getTextScale()).toBe(1.15);
  });

  test('themed style sheets rebuild at the new size', () => {
    const styles = createThemedStyles(() => ({ text: { fontSize: 10 } }));
    expect(styles.text.fontSize).toBe(10);
    applyTextScale(1.3);
    expect(styles.text.fontSize).toBe(13);
    applyTextScale(1);
    expect(styles.text.fontSize).toBe(10);
  });

  test('shared components draw their text at the chosen size', async () => {
    applyTextScale(1.3);
    await render(<AppButton title="Save Ride" onPress={jest.fn()} />);
    const title = screen.getByText('Save Ride');
    expect(flat(title).fontSize).toBeCloseTo(16 * 1.3);
    // The phone's text size still applies on top: no cap on ordinary text.
    expect(title.props.maxFontSizeMultiplier).toBeUndefined();
    expect(title.props.allowFontScaling).not.toBe(false);
  });

  test('fixed-size chrome stays within 1.5× of its size in total', async () => {
    expect(chromeMaxFontSizeMultiplier()).toBe(MAX_CHROME_FONT_SCALE);
    applyTextScale(1.3);
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <TabBar activeTab="home" onTabPress={jest.fn()} badges={{ requests: 3 }} />
      </SafeAreaProvider>
    );
    for (const text of ['Home', '3']) {
      const node = screen.getByText(text);
      const base = text === 'Home' ? 11 : 10;
      const total = (flat(node).fontSize * node.props.maxFontSizeMultiplier) / base;
      expect(total).toBeCloseTo(MAX_CHROME_FONT_SCALE);
    }
  });

  test('combined text size = phone setting × app setting', () => {
    expect(getEffectiveFontScale(1, 1.3)).toBeCloseTo(1.3);
    expect(getEffectiveFontScale(1.2, 1.15)).toBeCloseTo(1.38);
    expect(getEffectiveFontScale(undefined, 1)).toBe(1);
  });

  function LayoutProbe() {
    return <Text>{useLargeText() ? 'stacked' : 'side by side'}</Text>;
  }

  test('large-text layouts follow the combined size', async () => {
    await setFontScale(1);
    await render(<LayoutProbe />);
    expect(screen.getByText('side by side')).toBeOnTheScreen();

    // Extra Large alone reaches the stacking threshold (1.3).
    applyTextScale(1.3);
    await render(<LayoutProbe />);
    expect(screen.getByText('stacked')).toBeOnTheScreen();

    // Large alone doesn't, but Large on top of a bigger phone setting does.
    applyTextScale(1.15);
    await render(<LayoutProbe />);
    expect(screen.getByText('side by side')).toBeOnTheScreen();
    await setFontScale(1.2);
    expect(screen.getByText('stacked')).toBeOnTheScreen();
  });

  test('existing large-text support is unchanged with Accessibility Mode off', async () => {
    await setFontScale(1.3);
    await render(<LayoutProbe />);
    expect(screen.getByText('stacked')).toBeOnTheScreen();
    await setFontScale(1.29);
    expect(screen.getByText('side by side')).toBeOnTheScreen();
  });
});

// --- 4. Reduced motion -----------------------------------------------------

describe('reduced motion', () => {
  function SystemProbe() {
    return <Text>{useSystemReduceMotion() ? 'phone: reduce' : 'phone: normal'}</Text>;
  }

  test('follows the phone’s Reduce Motion setting, including changes', async () => {
    systemReduceMotion = true;
    await render(<SystemProbe />);
    expect(await screen.findByText('phone: reduce')).toBeOnTheScreen();
    await act(async () => reduceMotionListener(false));
    expect(screen.getByText('phone: normal')).toBeOnTheScreen();
  });

  function renderToast(reduceMotion, onHide = jest.fn()) {
    const value = {
      settings: DEFAULT_ACCESSIBILITY_SETTINGS,
      systemReduceMotion: false,
      reduceMotion,
      updateSettings: jest.fn(),
    };
    return render(
      <AccessibilityContext.Provider value={value}>
        <Toast toast={{ id: 1, title: 'Profile saved', message: '', tone: 'success' }} onHide={onHide} />
      </AccessibilityContext.Provider>
    );
  }

  test('the toast fades and slides normally', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    await renderToast(false);
    expect(timing).toHaveBeenCalled();
  });

  test('with Reduce Motion the toast appears in place, is announced, and still hides', async () => {
    jest.useFakeTimers();
    try {
      const timing = jest.spyOn(Animated, 'timing');
      const onHide = jest.fn();
      await renderToast(true, onHide);
      expect(timing).not.toHaveBeenCalled();
      expect(screen.getByText('Profile saved')).toBeOnTheScreen();
      expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Profile saved');
      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      expect(onHide).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

// --- 5. Profile › Accessibility --------------------------------------------

// The same setup App uses: state from useAccessibilityState, shared by the
// provider. `latest.value` exposes what the rest of the app would see.
function renderSection(initialSettings = DEFAULT_ACCESSIBILITY_SETTINGS) {
  const latest = {};
  function Harness() {
    const value = useAccessibilityState(initialSettings);
    latest.value = value;
    return (
      <AccessibilityContext.Provider value={value}>
        <AccessibilitySettingsSection />
      </AccessibilityContext.Provider>
    );
  }
  return render(<Harness />).then(() => latest);
}

const settingSwitch = (name) => screen.getByRole('switch', { name });
const savedSettings = () => JSON.parse(mockStore.get(STORAGE_KEY));

describe('Profile › Accessibility', () => {
  test('starts with only the Accessibility Mode switch, off', async () => {
    await renderSection();
    expect(screen.getByText('Accessibility')).toBeOnTheScreen();
    expect(settingSwitch('Accessibility Mode')).not.toBeChecked();
    expect(screen.queryByText('Text size')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Reduce Motion' })).toBeNull();
  });

  test('turning Accessibility Mode on shows the options, announces it, and saves', async () => {
    await renderSection();
    await fireEvent.press(settingSwitch('Accessibility Mode'));
    expect(settingSwitch('Accessibility Mode')).toBeChecked();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Accessibility Mode on. Text size and motion settings are shown below.'
    );
    expect(screen.getByRole('button', { name: 'Text size: Normal' })).toBeSelected();
    expect(settingSwitch('Reduce Motion')).not.toBeChecked();
    expect(savedSettings().enabled).toBe(true);
  });

  test('choosing a text size applies it right away and saves it', async () => {
    await renderSection({ ...DEFAULT_ACCESSIBILITY_SETTINGS, enabled: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Text size: Extra Large' }));
    expect(screen.getByRole('button', { name: 'Text size: Extra Large' })).toBeSelected();
    expect(getTextScale()).toBe(1.3);
    expect(savedSettings().textSize).toBe('extraLarge');

    await fireEvent.press(screen.getByRole('button', { name: 'Text size: Large' }));
    expect(getTextScale()).toBe(1.15);
  });

  test('turning Accessibility Mode off restores normal text but remembers the choice', async () => {
    await renderSection({ ...DEFAULT_ACCESSIBILITY_SETTINGS, enabled: true, textSize: 'extraLarge' });
    await fireEvent.press(settingSwitch('Accessibility Mode'));
    expect(getTextScale()).toBe(1);
    expect(savedSettings()).toMatchObject({ enabled: false, textSize: 'extraLarge' });

    await fireEvent.press(settingSwitch('Accessibility Mode'));
    expect(getTextScale()).toBe(1.3);
  });

  test('Reduce Motion switches the app’s motion off', async () => {
    const latest = await renderSection({ ...DEFAULT_ACCESSIBILITY_SETTINGS, enabled: true });
    expect(latest.value.reduceMotion).toBe(false);
    await fireEvent.press(settingSwitch('Reduce Motion'));
    expect(settingSwitch('Reduce Motion')).toBeChecked();
    expect(latest.value.reduceMotion).toBe(true);
    expect(savedSettings().reduceMotion).toBe(true);

    // Accessibility Mode off: the app's own Reduce Motion no longer applies.
    await fireEvent.press(settingSwitch('Accessibility Mode'));
    expect(latest.value.reduceMotion).toBe(false);
  });

  test('the phone’s Reduce Motion applies even with Accessibility Mode off, and is explained', async () => {
    systemReduceMotion = true;
    const latest = await renderSection();
    await act(async () => {});
    expect(latest.value.reduceMotion).toBe(true);

    await fireEvent.press(settingSwitch('Accessibility Mode'));
    expect(
      screen.getByText(
        'Your phone’s Reduce Motion setting is on, so CarpoolBoard already keeps motion to a minimum.'
      )
    ).toBeOnTheScreen();
  });

  test('High Contrast and Simplified Interface are Coming soon and can’t be turned on', async () => {
    await renderSection({ ...DEFAULT_ACCESSIBILITY_SETTINGS, enabled: true });
    expect(screen.getAllByText('Coming soon')).toHaveLength(2);
    for (const name of ['High Contrast, coming soon', 'Simplified Interface, coming soon']) {
      const row = settingSwitch(name);
      expect(row).toBeDisabled();
      expect(row).not.toBeChecked();
      await fireEvent.press(row);
      expect(settingSwitch(name)).not.toBeChecked();
    }
    expect(mockStore.has(STORAGE_KEY)).toBe(false);
  });

  test('each setting is one screen-reader stop with a description', async () => {
    await renderSection({ ...DEFAULT_ACCESSIBILITY_SETTINGS, enabled: true });
    const row = settingSwitch('Reduce Motion');
    expect(row.props.accessibilityHint).toBe(
      'Turns off sliding, zooming, and shrinking animations in CarpoolBoard.'
    );
    // The drawn Switch is hidden from screen readers so it isn't a second stop.
    expect(screen.getAllByRole('switch')).toHaveLength(4);
  });
});
