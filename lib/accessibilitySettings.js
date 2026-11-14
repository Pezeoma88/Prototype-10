// Accessibility Mode settings (Prototype 10, Accessibility Phase 1).
//
// Profile › Accessibility. Accessibility Mode is the master switch for
// CarpoolBoard's own, optional customizations:
//   enabled              Accessibility Mode on/off (off = the usual look)
//   textSize             'normal' | 'large' | 'extraLarge' (1×, 1.15×, 1.3×)
//   reduceMotion         turn off sliding/zooming animations
//   highContrast         saved for later; not available yet (Coming soon)
//   simplifiedInterface  saved for later; not available yet (Coming soon)
// The custom settings only take effect while Accessibility Mode is on, and
// are remembered while it's off. The phone's own accessibility settings
// (text size, Reduce Motion, screen readers) always apply, whatever this is.
//
// Saved on this phone only (lib/preferences.js); nothing goes to Supabase.

export const TEXT_SIZE_OPTIONS = [
  { key: 'normal', label: 'Normal', scale: 1 },
  { key: 'large', label: 'Large', scale: 1.15 },
  { key: 'extraLarge', label: 'Extra Large', scale: 1.3 },
];

// Settings that can't be turned on yet. The Profile screen shows them as
// Coming soon, and normalizeAccessibilitySettings keeps them off, so a
// stored value can't switch on something that doesn't work yet.
export const COMING_SOON_SETTINGS = ['highContrast', 'simplifiedInterface'];

export const DEFAULT_ACCESSIBILITY_SETTINGS = Object.freeze({
  enabled: false,
  textSize: 'normal',
  reduceMotion: false,
  highContrast: false,
  simplifiedInterface: false,
});

// A complete, valid settings object from anything (saved JSON, a partial
// update, garbage). Unknown keys are dropped; bad values use the default.
export function normalizeAccessibilitySettings(value) {
  const input = value !== null && typeof value === 'object' ? value : {};
  const textSize = TEXT_SIZE_OPTIONS.some((option) => option.key === input.textSize)
    ? input.textSize
    : DEFAULT_ACCESSIBILITY_SETTINGS.textSize;
  const settings = {
    enabled: input.enabled === true,
    textSize,
    reduceMotion: input.reduceMotion === true,
    highContrast: input.highContrast === true,
    simplifiedInterface: input.simplifiedInterface === true,
  };
  for (const key of COMING_SOON_SETTINGS) {
    settings[key] = false;
  }
  return settings;
}

// Reads saved settings (a JSON string, or null when nothing is saved).
export function parseAccessibilitySettings(json) {
  if (typeof json !== 'string' || json === '') {
    return { ...DEFAULT_ACCESSIBILITY_SETTINGS };
  }
  try {
    return normalizeAccessibilitySettings(JSON.parse(json));
  } catch {
    return { ...DEFAULT_ACCESSIBILITY_SETTINGS };
  }
}

export function serializeAccessibilitySettings(settings) {
  return JSON.stringify(normalizeAccessibilitySettings(settings));
}

// The multiplier for a text size key (1 for anything unknown).
export function textSizeScale(textSize) {
  const option = TEXT_SIZE_OPTIONS.find((o) => o.key === textSize);
  return option ? option.scale : 1;
}

// CarpoolBoard's own text size multiplier: the chosen size while
// Accessibility Mode is on, otherwise 1 (the phone's setting still applies).
export function getAppTextScale(settings) {
  return settings && settings.enabled ? textSizeScale(settings.textSize) : 1;
}

// Whether to reduce motion: always when the phone's Reduce Motion is on,
// and also when the app's own Reduce Motion is on in Accessibility Mode.
export function shouldReduceMotion(settings, systemReduceMotion) {
  if (systemReduceMotion === true) {
    return true;
  }
  return Boolean(settings && settings.enabled && settings.reduceMotion);
}
