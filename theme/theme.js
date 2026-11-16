import { StyleSheet } from 'react-native';

// CarpoolBoard design tokens (Prototype 8: light redesign + dark mode).
//
// Every screen/component reads its colors, spacing, radii, and type sizes
// from here instead of hard-coding values, so the look stays consistent and
// can be tuned in one place.
//
// Light (the default) is a clean white interface: white screens, white cards
// with thin gray borders, one blue accent, and quiet gray secondary text.
// Driver stays blue (the primary accent); Rider uses a muted teal so the two
// modes are still easy to tell apart. Dark brings back the navy look of the
// earlier prototypes with the same layout.
//
// A few components build a translucent tint by appending a 2-digit hex alpha
// to a color (e.g. `${colors.rider}29`), so keep accent colors as 6-digit hex.
//
// How switching works: `colors` is one shared object whose values are
// swapped in place by applyColorScheme. Anything read during render (inline
// `colors.x`, roleColor, tone maps built in a function) picks up the new
// values on the next render, and createThemedStyles rebuilds each file's
// style sheet the first time it's used after a switch. App re-renders the
// whole tree when the scheme changes, so nothing needs a restart.
//
// High Contrast (Prototype 10, Profile › Accessibility): each scheme has a
// high-contrast twin (lightHighContrastColors / darkHighContrastColors)
// with the same keys. applyHighContrast swaps it in the same way, so the
// active palette is always scheme × contrast. Every text, border, and
// status pair in the twins meets WCAG AA (4.5:1 for text, 3:1 for borders
// and indicators); __tests__/high-contrast-test.js checks them.

const lightColors = {
  // Surfaces
  bg: '#FFFFFF', // app background
  surface: '#FFFFFF', // cards (separated from the background by a border)
  surfaceRaised: '#F8FAFC', // inputs, chips, inset boxes, pressed cards
  surfaceSunken: '#F1F5F9', // tracks behind segmented controls
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',

  // Text
  text: '#111827',
  textMuted: '#64748B',
  textFaint: '#94A3B8', // placeholders, hints, disabled labels
  textOnAccent: '#FFFFFF',
  textOnAccentMuted: 'rgba(255, 255, 255, 0.85)',
  onAccentSoft: 'rgba(255, 255, 255, 0.2)', // icon chips on filled tiles

  // Brand / actions
  primary: '#2563EB',
  primaryPressed: '#1D4ED8',
  primarySoft: '#EFF6FF',
  accent: '#2563EB',

  // Role identity
  driver: '#2563EB',
  driverSoft: '#EFF6FF',
  rider: '#0D9488',
  riderSoft: '#F0FDFA',
  riderPressed: '#0F766E',
  riderBorder: '#99F6E4',

  // Status (text-safe shades for use on white and on their soft fills)
  success: '#16A34A',
  successSoft: '#F0FDF4',
  pending: '#B45309',
  pendingSoft: '#FFFBEB',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  dangerPressed: '#FEE2E2',
  muted: '#E5E7EB', // disabled button fill
  star: '#F59E0B', // rating stars
  mutedSoft: '#F1F5F9',

  // Map: the suggested-meeting-spot diamond and the outline around it
  suggested: '#B45309',
  markerOutline: '#FFFFFF',
};

// Dark: deep navy backgrounds, slightly lighter navy cards, light text, and
// brighter blue/teal accents that stay readable on navy. The soft fills are
// opaque dark tints rather than pastel, so badges and notices don't glare.
const darkColors = {
  // Surfaces
  bg: '#0F172A',
  surface: '#16213E',
  surfaceRaised: '#1E2B4D',
  surfaceSunken: '#0B1222',
  border: '#2A3A5E',
  borderStrong: '#3B4D75',

  // Text
  text: '#F1F5F9',
  textMuted: '#A5B4CB',
  textFaint: '#7A8AA6',
  textOnAccent: '#FFFFFF',
  textOnAccentMuted: 'rgba(255, 255, 255, 0.85)',
  onAccentSoft: 'rgba(255, 255, 255, 0.2)',

  // Brand / actions
  primary: '#3B82F6',
  primaryPressed: '#2563EB',
  primarySoft: '#172B55',
  accent: '#3B82F6',

  // Role identity
  driver: '#3B82F6',
  driverSoft: '#172B55',
  rider: '#10A090',
  riderSoft: '#123A45',
  riderPressed: '#0D857A',
  riderBorder: '#1C6B66',

  // Status
  success: '#4ADE80',
  successSoft: '#123726',
  pending: '#FBBF24',
  pendingSoft: '#3A2F12',
  danger: '#F87171',
  dangerSoft: '#3D1C2A',
  dangerPressed: '#4A2233',
  muted: '#2A3A5E',
  star: '#FBBF24',
  mutedSoft: '#1E2B4D',

  // Map
  suggested: '#FBBF24',
  markerOutline: '#16213E',
};

// Light High Contrast: black text, mid-gray borders that read as edges
// (4.8:1), and darker accents that keep white text above 4.5:1.
const lightHighContrastColors = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceRaised: '#F3F4F6',
  surfaceSunken: '#E5E7EB',
  border: '#6B7280',
  borderStrong: '#374151',

  text: '#000000',
  textMuted: '#374151',
  textFaint: '#4B5563',
  textOnAccent: '#FFFFFF',
  textOnAccentMuted: '#FFFFFF',
  onAccentSoft: 'rgba(255, 255, 255, 0.25)',

  primary: '#1D4ED8',
  primaryPressed: '#1E3A8A',
  primarySoft: '#DBEAFE',
  accent: '#1D4ED8',

  driver: '#1D4ED8',
  driverSoft: '#DBEAFE',
  rider: '#0F766E',
  riderSoft: '#CCFBF1',
  riderPressed: '#115E59',
  riderBorder: '#0F766E',

  success: '#15803D',
  successSoft: '#DCFCE7',
  pending: '#92400E',
  pendingSoft: '#FEF3C7',
  danger: '#B91C1C',
  dangerSoft: '#FEE2E2',
  dangerPressed: '#FDD5D5',
  muted: '#D1D5DB',
  star: '#B45309',
  mutedSoft: '#E5E7EB',

  // Map: still amber, now with a black outline so it stands out on the tiles.
  suggested: '#D97706',
  markerOutline: '#000000',
};

// Dark High Contrast: black background, white text, and bright accents.
// Text on an accent fill is BLACK here (textOnAccent), since a blue dark
// enough for white text can't also stand out as text on black.
const darkHighContrastColors = {
  bg: '#000000',
  surface: '#0A0F1C',
  surfaceRaised: '#151D30',
  surfaceSunken: '#000000',
  border: '#8B9BB8',
  borderStrong: '#C9D3E6',

  text: '#FFFFFF',
  textMuted: '#DCE3EE',
  textFaint: '#B7C2D4',
  textOnAccent: '#000000',
  textOnAccentMuted: 'rgba(0, 0, 0, 0.85)',
  onAccentSoft: 'rgba(0, 0, 0, 0.15)',

  primary: '#7DB3FF',
  primaryPressed: '#5A9BFF',
  primarySoft: '#0F2550',
  accent: '#7DB3FF',

  driver: '#7DB3FF',
  driverSoft: '#0F2550',
  rider: '#5EEAD4',
  riderSoft: '#06302C',
  riderPressed: '#2DD4BF',
  riderBorder: '#5EEAD4',

  success: '#86EFAC',
  successSoft: '#052E16',
  pending: '#FCD34D',
  pendingSoft: '#3A2A05',
  danger: '#FCA5A5',
  dangerSoft: '#3F0D12',
  dangerPressed: '#5A1218',
  muted: '#2B3550',
  star: '#FCD34D',
  mutedSoft: '#151D30',

  // Map: amber with a white outline.
  suggested: '#FBBF24',
  markerOutline: '#FFFFFF',
};

const PALETTES = { light: lightColors, dark: darkColors };
const HIGH_CONTRAST_PALETTES = { light: lightHighContrastColors, dark: darkHighContrastColors };

// The palette for a scheme ('light' | 'dark') and contrast. A copy, so the
// caller can't change the originals. Used by the tests to check contrast.
export function getPalette(scheme, highContrast = false) {
  const key = scheme === 'dark' ? 'dark' : 'light';
  return { ...(highContrast ? HIGH_CONTRAST_PALETTES : PALETTES)[key] };
}

// The active palette. Its values change in place (see applyColorScheme), so
// always read `colors.x` at render time rather than copying it at load.
export const colors = { ...lightColors };

let colorScheme = 'light';
// Whether the High Contrast twin of the scheme is active.
let highContrast = false;
// Bumped on every color scheme or text size switch so themed style sheets
// know to rebuild.
let schemeVersion = 0;
// CarpoolBoard's own text size multiplier (Profile › Accessibility): 1 at
// Normal, or while Accessibility Mode is off. It is applied on top of the
// phone's text size setting, which React Native applies by itself.
let textScale = 1;

// 'light' or 'dark'. Also usable directly as a keyboardAppearance,
// DateTimePicker themeVariant, or MapView userInterfaceStyle.
export function getColorScheme() {
  return colorScheme;
}

// expo-status-bar style with readable icons on the active background.
export function statusBarStyle() {
  return colorScheme === 'dark' ? 'light' : 'dark';
}

// Switches the shared palette to 'light' or 'dark' (anything else is light).
// Callers re-render afterwards; App does this from its colorScheme state.
export function applyColorScheme(scheme) {
  const next = scheme === 'dark' ? 'dark' : 'light';
  if (next === colorScheme) {
    return;
  }
  colorScheme = next;
  applyActivePalette();
}

// Whether High Contrast colors are active (Profile › Accessibility).
export function isHighContrast() {
  return highContrast;
}

// Turns High Contrast on or off for the current scheme. Like
// applyColorScheme, callers re-render afterwards; App does this from its
// accessibility settings state.
export function applyHighContrast(enabled) {
  const next = enabled === true;
  if (next === highContrast) {
    return;
  }
  highContrast = next;
  applyActivePalette();
}

// Copies the palette for the current scheme and contrast into `colors` and
// marks every themed style sheet for rebuilding.
function applyActivePalette() {
  schemeVersion += 1;
  Object.assign(colors, (highContrast ? HIGH_CONTRAST_PALETTES : PALETTES)[colorScheme]);
  gradients.primary = [colors.primary, colors.primaryPressed];
}

// The app's own text size multiplier (1 = Normal / Accessibility Mode off).
export function getTextScale() {
  return textScale;
}

// Sets the app's text size multiplier (anything that isn't a number ≥ 1 is
// treated as 1). Like applyColorScheme, callers re-render afterwards; App
// does this from its accessibility settings state.
export function applyTextScale(scale) {
  const next = typeof scale === 'number' && Number.isFinite(scale) && scale >= 1 ? scale : 1;
  if (next === textScale) {
    return;
  }
  textScale = next;
  schemeVersion += 1;
}

// Multiplies fontSize and lineHeight in each style of a sheet definition.
// Everything else (padding, icon sizes, min heights) is left alone: those
// already make room for longer text, the same as with the phone's setting.
export function scaleTextStyles(definition, scale) {
  if (scale === 1) {
    return definition;
  }
  const scaled = {};
  for (const [name, style] of Object.entries(definition)) {
    if (style === null || typeof style !== 'object') {
      scaled[name] = style;
      continue;
    }
    const next = { ...style };
    for (const key of ['fontSize', 'lineHeight']) {
      if (typeof next[key] === 'number') {
        next[key] = Math.round(next[key] * scale * 10) / 10;
      }
    }
    scaled[name] = next;
  }
  return scaled;
}

// A StyleSheet whose colors follow the active scheme and whose text follows
// the app's text size. Use it like StyleSheet.create, but pass a function:
// `createThemedStyles(() => ({...}))`. The sheet is built on first use and
// again after each scheme or text size switch.
export function createThemedStyles(build) {
  let sheet = null;
  let builtFor = -1;
  function current() {
    if (builtFor !== schemeVersion) {
      sheet = StyleSheet.create(scaleTextStyles(build(), textScale));
      builtFor = schemeVersion;
    }
    return sheet;
  }
  return new Proxy({}, { get: (_target, key) => current()[key] });
}

// Two-stop gradient for the occasional highlight (not for every surface).
export const gradients = {
  primary: [colors.primary, colors.primaryPressed],
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

// Standard horizontal page gutter.
export const gutter = spacing.xl;

export const radius = {
  sm: 10,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

// The largest text-size multiplier for small fixed-size chrome (tab bar
// labels, count dots). Everything else scales with the phone's text size
// setting without a cap; these sit in fixed-width or fixed-height spaces, so
// past this they'd overlap their neighbors instead of becoming readable.
export const MAX_CHROME_FONT_SCALE = 1.5;

// maxFontSizeMultiplier for that chrome. The app's text size is already
// built into its font sizes, so the phone's setting may only add what's
// left of MAX_CHROME_FONT_SCALE: the total stays at most 1.5× either way.
export function chromeMaxFontSizeMultiplier() {
  return Math.max(1, MAX_CHROME_FONT_SCALE / textScale);
}

export const typography = {
  caption: { fontSize: 12, fontWeight: '500' },
  label: { fontSize: 13, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  bodyStrong: { fontSize: 15, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '600' },
  heading: { fontSize: 22, fontWeight: '700', letterSpacing: -0.2 },
  display: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
};

// Very soft shadow for cards on white. iOS uses the shadow* props; Android
// uses elevation. The border does most of the separation work.
export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  raised: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
};

// Accent color for a Driver/Rider role.
export function roleColor(role) {
  return role === 'rider' ? colors.rider : colors.driver;
}

export function roleSoftColor(role) {
  return role === 'rider' ? colors.riderSoft : colors.driverSoft;
}
