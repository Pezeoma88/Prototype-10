import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  DEFAULT_ACCESSIBILITY_SETTINGS,
  getAppTextScale,
  normalizeAccessibilitySettings,
  shouldReduceMotion,
  shouldSimplifyInterface,
  shouldUseHighContrast,
} from './accessibilitySettings';
import { saveAccessibilitySettings } from './preferences';
import { applyHighContrast, applyTextScale } from '../theme/theme';

// Shares the Profile › Accessibility settings (lib/accessibilitySettings.js)
// with the rest of the app. App owns the state (useAccessibilityState) and
// provides it; components read it with useAccessibility / useReduceMotion.
// Without a provider (e.g. a component rendered on its own in a test) the
// defaults apply: Accessibility Mode off, no reduced motion, the usual
// layout.

const DEFAULT_VALUE = {
  settings: DEFAULT_ACCESSIBILITY_SETTINGS,
  systemReduceMotion: false,
  reduceMotion: false,
  simplifiedInterface: false,
  highContrast: false,
  updateSettings: () => {},
};

export const AccessibilityContext = createContext(DEFAULT_VALUE);

export function useAccessibility() {
  return useContext(AccessibilityContext);
}

// True when animations should be skipped or made instant: the phone's
// Reduce Motion is on, or the app's own Reduce Motion is on in
// Accessibility Mode.
export function useReduceMotion() {
  return useContext(AccessibilityContext).reduceMotion;
}

// True when Home and the ride/rider cards should use their simplified
// layouts (Accessibility Mode on, with Simplified Interface chosen).
export function useSimplifiedInterface() {
  return useContext(AccessibilityContext).simplifiedInterface === true;
}

// The phone's Reduce Motion setting (iOS Settings › Accessibility › Motion;
// Android Remove animations). Follows changes while the app is open.
export function useSystemReduceMotion() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let isCurrent = true;
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .then((value) => {
        if (isCurrent) setEnabled(value === true);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => {
      setEnabled(value === true);
    });
    return () => {
      isCurrent = false;
      subscription?.remove?.();
    };
  }, []);
  return enabled;
}

// App's accessibility state. `initialSettings` comes from
// loadAccessibilitySettings() at launch. updateSettings({ ...changes })
// applies the new text size and contrast to the shared styles, re-renders
// (App re-renders everything under it), and saves on this phone.
export function useAccessibilityState(initialSettings) {
  const [settings, setSettings] = useState(() => normalizeAccessibilitySettings(initialSettings));
  const settingsRef = useRef(settings);
  const systemReduceMotion = useSystemReduceMotion();

  const updateSettings = useCallback((changes) => {
    const next = normalizeAccessibilitySettings({ ...settingsRef.current, ...changes });
    settingsRef.current = next;
    // Before the re-render, so every style sheet rebuilds at the new size
    // and with the new colors.
    applyTextScale(getAppTextScale(next));
    applyHighContrast(shouldUseHighContrast(next));
    setSettings(next);
    saveAccessibilitySettings(next);
  }, []);

  return useMemo(
    () => ({
      settings,
      systemReduceMotion,
      reduceMotion: shouldReduceMotion(settings, systemReduceMotion),
      simplifiedInterface: shouldSimplifyInterface(settings),
      highContrast: shouldUseHighContrast(settings),
      updateSettings,
    }),
    [settings, systemReduceMotion, updateSettings]
  );
}
