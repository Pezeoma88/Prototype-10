// Automated tests for High Contrast (Prototype 10, Profile › Accessibility).
//
// Pins down:
//   C   contrast: every text, border, and status pair in both High Contrast
//       palettes meets WCAG AA, measured against the background it is
//       actually drawn on (including translucent tints blended over it)
//   N   the normal Light and Dark palettes are unchanged
//   T   switching: on/off, Light/Dark in either order, style sheets rebuild
//   S   the setting: a working switch, saved and read back after a restart,
//       only in Accessibility Mode
//   O   selected-control outlines and status-colored borders
//   M   the map: diamond outlines, ride pins vs diamonds, "full" labels
//   X   together with Extra Large Text, Reduce Motion, Simplified Interface
//
// The WCAG formula and the expected palette values are written out here
// rather than imported from the app, so the app can't define what counts as
// correct.
//
// Faked: expo-secure-store (in memory), the icon font, react-native-maps (a
// native map can't run in Jest), and the phone's accessibility settings.

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native';
import AccessibilitySettingsSection from '../components/AccessibilitySettingsSection';
import ModeToggle from '../components/ModeToggle';
import Notice from '../components/Notice';
import RideCard from '../components/RideCard';
import SegmentedControl from '../components/SegmentedControl';
import Toast from '../components/Toast';
import MapScreen from '../screens/MapScreen';
import { DEFAULT_ACCESSIBILITY_SETTINGS, shouldUseHighContrast } from '../lib/accessibilitySettings';
import { loadAccessibilitySettings } from '../lib/preferences';
import { AccessibilityContext, useAccessibilityState } from '../lib/useAccessibility';
import {
  applyColorScheme,
  applyHighContrast,
  applyTextScale,
  colors,
  createThemedStyles,
  getPalette,
  getTextScale,
  isHighContrast,
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

// Records each marker's props by accessibility label, and draws custom
// marker views (the diamonds) so their styles can be checked.
let mockMarkers = {};
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');
  function MapView({ ref, children }) {
    mockMarkers = {};
    React.useImperativeHandle(ref, () => ({ animateToRegion: jest.fn(), fitToCoordinates: jest.fn() }));
    return <View>{children}</View>;
  }
  function Marker({ children, onPress, accessibilityLabel, ...props }) {
    mockMarkers[accessibilityLabel] = { ...props, hasCustomView: children != null };
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}>
        {children}
      </Pressable>
    );
  }
  return { __esModule: true, default: MapView, Marker, Polyline: () => null };
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

beforeEach(async () => {
  await setFontScale(1);
  mockStore.clear();
  mockMarkers = {};
  jest.clearAllMocks();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(async () => false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

// The palette is shared by the whole app: always put it back.
afterEach(async () => {
  jest.restoreAllMocks();
  applyHighContrast(false);
  applyColorScheme('light');
  applyTextScale(1);
  await setFontScale(ORIGINAL_DIMENSIONS.window.fontScale);
});

const flat = (node) => StyleSheet.flatten(node.props.style) || {};
const savedSettings = () => JSON.parse(mockStore.get(STORAGE_KEY));
const settingSwitch = (name) => screen.getByRole('switch', { name });

// --- WCAG 2.x contrast, written out -----------------------------------------

// '#RRGGBB', '#RRGGBBAA', or 'rgba(r, g, b, a)' -> { r, g, b, a } (0-255, 0-1).
function parseColor(value) {
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(value);
  if (rgba) return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: +rgba[4] };
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (!hex) throw new Error(`Unreadable color: ${value}`);
  const n = parseInt(hex[1], 16);
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: hex[2] ? parseInt(hex[2], 16) / 255 : 1 };
}

// A (possibly translucent) color drawn over an opaque background.
function over(foreground, background) {
  const f = parseColor(foreground);
  const b = parseColor(background);
  const mix = (x, y) => Math.round(x * f.a + y * (1 - f.a));
  const hex = (n) => n.toString(16).padStart(2, '0');
  return `#${hex(mix(f.r, b.r))}${hex(mix(f.g, b.g))}${hex(mix(f.b, b.b))}`;
}

function luminance(value) {
  const { r, g, b } = parseColor(value);
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground, background) {
  const fg = over(foreground, background);
  const [light, dark] = [luminance(fg), luminance(background)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test('C-00: the contrast helper matches known WCAG values', () => {
  expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  expect(contrast('#767676', '#FFFFFF')).toBeCloseTo(4.54, 1);
  // 0x14 alpha (20/255) blue over white: 255 - (255 - 37) * 20/255 = 238 (ee), etc.
  expect(over('#2563EB14', '#FFFFFF')).toBe('#eef3fd');
});

// --- C: contrast in both High Contrast palettes ------------------------------

const TEXT = 4.5; // normal-size text
const UI = 3; // borders, outlines, icons, and other meaningful indicators

// Stand-ins for the map tiles under the markers (not themed by the app).
const MAP_TILES = { light: ['#FFFFFF', '#E8E4DC', '#F2EFE9'], dark: ['#000000', '#242F3E', '#1C1C1E'] };

// [what it is, foreground token or color, background token, minimum]
function pairsFor(p, scheme) {
  const tint = (token, alphaHex = '14') => over(`${p[token]}${alphaHex}`, p.surface);
  return [
    // Body, secondary, and hint text on every surface they appear on.
    ...['bg', 'surface', 'surfaceRaised', 'surfaceSunken'].flatMap((bg) => [
      [`text on ${bg}`, p.text, p[bg], TEXT],
      [`textMuted on ${bg}`, p.textMuted, p[bg], TEXT],
      [`textFaint (placeholders, inactive tabs, disabled labels) on ${bg}`, p.textFaint, p[bg], TEXT],
    ]),
    // Labels on filled buttons, avatars, bubbles, badges, check circles.
    ...['primary', 'primaryPressed', 'driver', 'rider', 'riderPressed', 'success', 'danger'].map((bg) => [
      `textOnAccent on ${bg}`,
      p.textOnAccent,
      p[bg],
      TEXT,
    ]),
    ['tile subtitle on primary', p.textOnAccentMuted, p.primary, TEXT],
    // Badges and notices: status text, and body text, on their soft fills.
    ...[
      ['primary', 'primarySoft'],
      ['driver', 'driverSoft'],
      ['rider', 'riderSoft'],
      ['success', 'successSoft'],
      ['pending', 'pendingSoft'],
      ['danger', 'dangerSoft'],
      ['danger', 'dangerPressed'],
      ['textMuted', 'mutedSoft'],
    ].flatMap(([fg, bg]) => [
      [`${fg} on ${bg}`, p[fg], p[bg], TEXT],
      [`text on ${bg}`, p.text, p[bg], TEXT],
    ]),
    // Status pills and icon chips: the color on its own 8% tint over a card.
    ...['primary', 'driver', 'rider', 'success', 'pending', 'danger', 'textMuted'].map((token) => [
      `${token} on its 8% tint`,
      p[token],
      tint(token),
      TEXT,
    ]),
    // Status and accent text straight on a card.
    ...['primary', 'rider', 'success', 'pending', 'danger'].map((token) => [`${token} on surface`, p[token], p.surface, TEXT]),
    // Disabled button label on its fill (exempt from WCAG, checked anyway).
    ['disabled button label', p.textFaint, p.surfaceSunken, TEXT],
    // Edges and indicators.
    ...['bg', 'surface', 'surfaceRaised'].flatMap((bg) => [
      [`border on ${bg}`, p.border, p[bg], UI],
      [`borderStrong on ${bg}`, p.borderStrong, p[bg], UI],
    ]),
    ['focused input border', p.primary, p.surface, UI],
    ['error input border', p.danger, p.surface, UI],
    ['inactive tab icon', p.textFaint, p.surface, UI],
    ['rating stars', p.star, p.surface, UI],
    ['switch track (on)', p.primary, p.surface, UI],
    ['selected segment outline', p.text, p.surfaceSunken, UI],
    ...['primary', 'pending', 'danger', 'success'].map((token) => [`${token} status border`, p[token], p.surface, UI]),
    // Map: the diamond's outline against the tiles around it.
    ...MAP_TILES[scheme].map((tile) => [`diamond outline on map ${tile}`, p.markerOutline, tile, UI]),
  ];
}

describe.each(['light', 'dark'])('C: %s High Contrast meets WCAG AA', (scheme) => {
  const palette = getPalette(scheme, true);
  test.each(pairsFor(palette, scheme))('%s', (_name, foreground, background, minimum) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(minimum);
  });
});

// --- N: the normal palettes stay the same ------------------------------------

describe('N: normal palettes are unchanged', () => {
  // The Prototype 8 values, written out. `suggested` and `markerOutline` are
  // new names for what the map already drew (amber, white/navy).
  const LIGHT = {
    bg: '#FFFFFF', surface: '#FFFFFF', surfaceRaised: '#F8FAFC', surfaceSunken: '#F1F5F9',
    border: '#E5E7EB', borderStrong: '#D1D5DB', text: '#111827', textMuted: '#64748B',
    textFaint: '#94A3B8', textOnAccent: '#FFFFFF', textOnAccentMuted: 'rgba(255, 255, 255, 0.85)',
    onAccentSoft: 'rgba(255, 255, 255, 0.2)', primary: '#2563EB', primaryPressed: '#1D4ED8',
    primarySoft: '#EFF6FF', accent: '#2563EB', driver: '#2563EB', driverSoft: '#EFF6FF',
    rider: '#0D9488', riderSoft: '#F0FDFA', riderPressed: '#0F766E', riderBorder: '#99F6E4',
    success: '#16A34A', successSoft: '#F0FDF4', pending: '#B45309', pendingSoft: '#FFFBEB',
    danger: '#DC2626', dangerSoft: '#FEF2F2', dangerPressed: '#FEE2E2', muted: '#E5E7EB',
    star: '#F59E0B', mutedSoft: '#F1F5F9', suggested: '#B45309', markerOutline: '#FFFFFF',
  };
  const DARK = {
    bg: '#0F172A', surface: '#16213E', surfaceRaised: '#1E2B4D', surfaceSunken: '#0B1222',
    border: '#2A3A5E', borderStrong: '#3B4D75', text: '#F1F5F9', textMuted: '#A5B4CB',
    textFaint: '#7A8AA6', textOnAccent: '#FFFFFF', textOnAccentMuted: 'rgba(255, 255, 255, 0.85)',
    onAccentSoft: 'rgba(255, 255, 255, 0.2)', primary: '#3B82F6', primaryPressed: '#2563EB',
    primarySoft: '#172B55', accent: '#3B82F6', driver: '#3B82F6', driverSoft: '#172B55',
    rider: '#10A090', riderSoft: '#123A45', riderPressed: '#0D857A', riderBorder: '#1C6B66',
    success: '#4ADE80', successSoft: '#123726', pending: '#FBBF24', pendingSoft: '#3A2F12',
    danger: '#F87171', dangerSoft: '#3D1C2A', dangerPressed: '#4A2233', muted: '#2A3A5E',
    star: '#FBBF24', mutedSoft: '#1E2B4D', suggested: '#FBBF24', markerOutline: '#16213E',
  };

  test('N-01: Light and Dark keep their exact values', () => {
    expect(getPalette('light')).toEqual(LIGHT);
    expect(getPalette('dark')).toEqual(DARK);
  });

  test('N-02: the High Contrast palettes have exactly the same keys', () => {
    expect(Object.keys(getPalette('light', true)).sort()).toEqual(Object.keys(LIGHT).sort());
    expect(Object.keys(getPalette('dark', true)).sort()).toEqual(Object.keys(DARK).sort());
  });

  test('N-03: with High Contrast off, the live colors are the normal ones', () => {
    expect(isHighContrast()).toBe(false);
    expect({ ...colors }).toEqual(LIGHT);
    applyColorScheme('dark');
    expect({ ...colors }).toEqual(DARK);
  });
});

// --- T: switching -------------------------------------------------------------

describe('T: switching High Contrast and Light/Dark', () => {
  test('T-01: on and off swaps the live colors and restores them exactly', () => {
    const before = { ...colors };
    applyHighContrast(true);
    expect(isHighContrast()).toBe(true);
    expect({ ...colors }).toEqual(getPalette('light', true));
    applyHighContrast(false);
    expect({ ...colors }).toEqual(before);
  });

  test('T-02: Light/Dark while High Contrast is on, in either order', () => {
    applyHighContrast(true);
    applyColorScheme('dark');
    expect({ ...colors }).toEqual(getPalette('dark', true));
    applyColorScheme('light');
    expect({ ...colors }).toEqual(getPalette('light', true));

    applyHighContrast(false);
    applyColorScheme('dark');
    applyHighContrast(true);
    expect({ ...colors }).toEqual(getPalette('dark', true));
    applyHighContrast(false);
    expect({ ...colors }).toEqual(getPalette('dark'));
  });

  test('T-03: themed style sheets rebuild with the new colors', () => {
    const styles = createThemedStyles(() => ({ box: { borderColor: colors.border } }));
    expect(StyleSheet.flatten(styles.box).borderColor).toBe('#E5E7EB');
    applyHighContrast(true);
    expect(StyleSheet.flatten(styles.box).borderColor).toBe('#6B7280');
    applyColorScheme('dark');
    expect(StyleSheet.flatten(styles.box).borderColor).toBe('#8B9BB8');
  });
});

// --- S: the setting -----------------------------------------------------------

const ON = { ...DEFAULT_ACCESSIBILITY_SETTINGS, enabled: true };

async function renderWithSettings(children, initialSettings = ON) {
  const latest = {};
  function Harness() {
    const value = useAccessibilityState(initialSettings);
    latest.value = value;
    return (
      <AccessibilityContext.Provider value={value}>
        <AccessibilitySettingsSection />
        {children}
      </AccessibilityContext.Provider>
    );
  }
  const view = await render(<Harness />);
  await act(async () => {});
  latest.unmount = () => view.unmount();
  return latest;
}

describe('S: the High Contrast setting', () => {
  test('S-01: the switch turns it on and off, applies it right away, and saves it', async () => {
    const latest = await renderWithSettings(null);
    const row = settingSwitch('High Contrast');
    expect(row).toBeEnabled();
    expect(row.props.accessibilityHint).toMatch(/both Light and Dark/);

    await fireEvent.press(row);
    expect(settingSwitch('High Contrast')).toBeChecked();
    expect(latest.value.highContrast).toBe(true);
    expect(isHighContrast()).toBe(true);
    expect(colors.text).toBe('#000000');
    expect(savedSettings().highContrast).toBe(true);

    await fireEvent.press(settingSwitch('High Contrast'));
    expect(isHighContrast()).toBe(false);
    expect(colors.text).toBe('#111827');
    expect(savedSettings().highContrast).toBe(false);
  });

  test('S-02: it is read back and applied before the first screen after a restart', async () => {
    const first = await renderWithSettings(null);
    await fireEvent.press(settingSwitch('High Contrast'));
    await act(async () => first.unmount());

    // A restart: the palette starts normal, then App applies what was saved
    // before drawing (App.js, at load).
    applyHighContrast(false);
    const saved = loadAccessibilitySettings();
    expect(saved).toMatchObject({ enabled: true, highContrast: true });
    applyHighContrast(shouldUseHighContrast(saved));
    expect(colors.border).toBe('#6B7280');

    await renderWithSettings(null, saved);
    expect(settingSwitch('High Contrast')).toBeChecked();
  });

  test('S-03: Accessibility Mode off restores the usual colors and remembers the choice', async () => {
    // As at launch: App applies the saved choice, then draws.
    const saved = { ...ON, highContrast: true };
    applyHighContrast(shouldUseHighContrast(saved));
    await renderWithSettings(null, saved);
    expect(isHighContrast()).toBe(true);

    await fireEvent.press(settingSwitch('Accessibility Mode'));
    expect(isHighContrast()).toBe(false);
    expect(colors.text).toBe('#111827');
    expect(savedSettings()).toMatchObject({ enabled: false, highContrast: true });

    await fireEvent.press(settingSwitch('Accessibility Mode'));
    expect(isHighContrast()).toBe(true);
  });

  test('S-04: it never applies while Accessibility Mode is off', () => {
    expect(shouldUseHighContrast({ ...DEFAULT_ACCESSIBILITY_SETTINGS, highContrast: true })).toBe(false);
    expect(shouldUseHighContrast({ ...ON, highContrast: true })).toBe(true);
    expect(shouldUseHighContrast(null)).toBe(false);
  });
});

// --- O: outlines and borders --------------------------------------------------

describe('O: selected outlines and status borders', () => {
  const TEXT_SIZES = [
    { key: 'normal', label: 'Normal' },
    { key: 'large', label: 'Large' },
  ];

  test('O-01: the selected segment gets an outline only in High Contrast', async () => {
    const view = await render(
      <SegmentedControl options={TEXT_SIZES} value="normal" onChange={jest.fn()} accessibilityLabel="Text size" />
    );
    expect(flat(screen.getByRole('button', { name: 'Text size: Normal' })).borderWidth).toBeUndefined();

    applyHighContrast(true);
    await view.rerender(
      <SegmentedControl options={TEXT_SIZES} value="normal" onChange={jest.fn()} accessibilityLabel="Text size" />
    );
    const selected = flat(screen.getByRole('button', { name: 'Text size: Normal' }));
    expect(selected).toMatchObject({ borderWidth: 2, borderColor: '#000000' });
    expect(flat(screen.getByRole('button', { name: 'Text size: Large' })).borderWidth).toBeUndefined();
  });

  test('O-02: the active Driver/Rider side gets an outline only in High Contrast', async () => {
    applyColorScheme('dark');
    applyHighContrast(true);
    await render(<ModeToggle activeMode="rider" onChange={jest.fn()} />);
    expect(flat(screen.getByRole('radio', { name: 'Rider mode' }))).toMatchObject({
      borderWidth: 2,
      borderColor: '#FFFFFF',
    });
    expect(flat(screen.getByRole('radio', { name: 'Driver mode' })).borderWidth).toBeUndefined();
  });

  test('O-03: notices use a full-strength status border in High Contrast, and keep their icon', async () => {
    const view = await render(<Notice message="Request sent" tone="warning" />);
    const box = () => screen.getByText('Request sent').parent;
    expect(flat(box())).toMatchObject({ borderWidth: 1, borderColor: '#B4530940' });

    applyHighContrast(true);
    await view.rerender(<Notice message="Request sent" tone="warning" />);
    expect(flat(box())).toMatchObject({ borderWidth: 2, borderColor: '#92400E' });
    expect(screen.getByTestId('icon-alert-circle')).toBeOnTheScreen();
  });

  test('O-04: toasts use a full-strength status border in High Contrast', async () => {
    applyHighContrast(true);
    await render(<Toast toast={{ id: 1, title: 'Profile saved', message: '', tone: 'success' }} onHide={jest.fn()} />);
    const toast = screen.getByRole('alert');
    expect(flat(toast)).toMatchObject({ borderWidth: 2, borderColor: '#15803D' });
    expect(screen.getByTestId('icon-checkmark-circle')).toBeOnTheScreen();
  });
});

// --- M: the map ---------------------------------------------------------------

const FONDREN = { latitude: 32.84454, longitude: -96.78343, label: 'Fondren Library' };
const MOODY = { latitude: 32.8404, longitude: -96.78068, label: 'Moody Coliseum' };

function mapRide(id, pickup, seats) {
  return {
    id,
    name: `Driver ${id}`,
    avatarUrl: null,
    destination: 'Downtown Dallas',
    departureTime: 'Today, 5:00 PM',
    seats,
    pickup,
    destinationPoint: null,
  };
}

async function renderMap(drivers) {
  await render(
    <MapScreen
      drivers={drivers}
      isBoardLoading={false}
      isRefreshing={false}
      boardError=""
      handleRefresh={jest.fn()}
      onOpenRide={jest.fn()}
      onGoHome={jest.fn()}
    />
  );
}

const suggestedLabels = () => Object.keys(mockMarkers).filter((label) => label.startsWith('Suggested spot, '));

describe('M: map markers', () => {
  test.each([
    ['light', '#D97706', '#000000'],
    ['dark', '#FBBF24', '#FFFFFF'],
  ])('M-01: %s High Contrast: amber diamonds with a visible outline, all 9 still there', async (scheme, fill, outline) => {
    applyColorScheme(scheme);
    applyHighContrast(true);
    await renderMap([]);

    expect(suggestedLabels()).toHaveLength(9);
    // 9 map markers plus the one in the map key.
    const diamonds = screen.getAllByTestId('suggested-diamond');
    expect(diamonds).toHaveLength(10);
    for (const diamond of diamonds) {
      expect(flat(diamond)).toMatchObject({ backgroundColor: fill, borderColor: outline, borderWidth: 2 });
    }
  });

  test('M-02: normal colors draw the diamond exactly as before', async () => {
    await renderMap([]);
    expect(flat(screen.getAllByTestId('suggested-diamond')[0])).toMatchObject({
      backgroundColor: '#B45309',
      borderColor: '#FFFFFF',
    });
  });

  test('M-03: ride pins stay native pins, diamonds stay custom views', async () => {
    applyHighContrast(true);
    await renderMap([mapRide('a', FONDREN, 2)]);
    const ride = mockMarkers['Fondren Library: 1 ride'];
    const suggested = mockMarkers['Suggested spot, Dallas Hall. No rides posted here.'];
    expect(ride.hasCustomView).toBe(false);
    expect(ride.pinColor).toBe('#1D4ED8');
    expect(suggested.hasCustomView).toBe(true);
    expect(suggested.pinColor).toBeUndefined();
  });

  test('M-04: a spot where every ride is full says "full"; others don’t', async () => {
    await renderMap([mapRide('a', FONDREN, 0), mapRide('b', FONDREN, 0), mapRide('c', MOODY, 1)]);
    expect(mockMarkers['Fondren Library: 2 rides, full']).toBeDefined();
    expect(mockMarkers['Moody Coliseum: 1 ride']).toBeDefined();
    expect(mockMarkers['Moody Coliseum: 1 ride, full']).toBeUndefined();
  });

  test('M-05: a spot with one full and one open ride is not labeled full', async () => {
    await renderMap([mapRide('a', FONDREN, 0), mapRide('b', FONDREN, 3)]);
    expect(mockMarkers['Fondren Library: 2 rides']).toBeDefined();
  });
});

// --- X: together with the other settings --------------------------------------

describe('X: with the other accessibility settings', () => {
  const NOW_MS = Date.parse('2026-11-15T18:00:00Z');
  const ride = {
    id: 'ride-1',
    driverAccountId: 'driver-1',
    name: 'Dana Driver',
    avatarUrl: null,
    destination: 'Dallas Love Field',
    pickup: { label: 'Fondren Library' },
    departureAt: new Date(NOW_MS + 3 * 60 * 60 * 1000),
    departureTime: 'Sunday, November 15 · 3:00 PM',
    totalSeats: 3,
    seats: 2,
    driverRating: null,
    matchedRiders: [],
    pendingRequests: [{ riderId: 'rider-1' }],
  };

  test('X-01: High Contrast + Extra Large + Reduce Motion + Simplified, in Dark', async () => {
    applyColorScheme('dark');
    const latest = await renderWithSettings(
      <RideCard
        ride={ride}
        currentUser={{ id: 'rider-1' }}
        activeMode="rider"
        myRequestStatus="pending"
        nowMs={NOW_MS}
        onView={jest.fn()}
        onRequest={jest.fn()}
      />,
      { ...ON, textSize: 'extraLarge', reduceMotion: true, simplifiedInterface: true }
    );
    await fireEvent.press(settingSwitch('High Contrast'));

    expect(latest.value).toMatchObject({ reduceMotion: true, simplifiedInterface: true, highContrast: true });
    expect(getTextScale()).toBe(1.3);
    expect({ ...colors }).toEqual(getPalette('dark', true));

    // Status keeps its words and icon, not just a color.
    expect(screen.getByText('Request pending')).toBeOnTheScreen();
    expect(screen.getByTestId('icon-time')).toBeOnTheScreen();
    const details = screen.getByRole('button', { name: 'View Ride Details' });
    expect(flat(details.parent).flexDirection).toBe('column');
    expect(flat(screen.getByText('Request pending')).color).toBe('#FCD34D');

    // Turning High Contrast off leaves the other settings alone.
    await fireEvent.press(settingSwitch('High Contrast'));
    expect({ ...colors }).toEqual(getPalette('dark'));
    expect(latest.value).toMatchObject({ reduceMotion: true, simplifiedInterface: true });
    expect(getTextScale()).toBe(1.3);
  });
});
