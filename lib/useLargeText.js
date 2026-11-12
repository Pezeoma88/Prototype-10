import { useWindowDimensions } from 'react-native';

// Large text support (Prototype 10, Phase 2).
//
// Text in CarpoolBoard follows the phone's text size setting (iOS Settings →
// Accessibility → Display & Text Size → Larger Text; Android Settings →
// Display → Font size). `fontScale` is 1 at the default size and grows with
// that setting (about 1.35 at iOS's largest standard size, and up to about
// 3.1 with the iOS accessibility sizes turned on).
//
// From LARGE_TEXT_SCALE up, shared components put side-by-side pieces
// (label and value, name and seat badge, Details and Request buttons) on
// separate lines, because there's no longer room for both on one line
// without cutting text off.
export const LARGE_TEXT_SCALE = 1.3;

export function isLargeTextScale(fontScale) {
  return typeof fontScale === 'number' && fontScale >= LARGE_TEXT_SCALE;
}

// True while the phone's text size is large enough that rows should stack.
// Re-renders when the setting changes.
export function useLargeText() {
  const { fontScale } = useWindowDimensions();
  return isLargeTextScale(fontScale);
}
