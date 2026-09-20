/**
 * Haptic feedback utility for mobile web & PWAs.
 * Safe fallback wrapper that silently ignores unsupported devices (e.g. iOS / Desktop)
 * and ensures zero impact on app functionality if disabled or removed.
 */

export const haptic = {
  /** Light pulse for UI interactions like opening/closing menus (30ms) */
  tap() {
    triggerVibration(30);
  },

  /** Crisp short tick for selection toggles like marking attendance (20ms) */
  tick() {
    triggerVibration(20);
  },

  /** Double-pulse confirmation for success actions like recording fee or creating lecture */
  success() {
    triggerVibration([50, 50, 100]);
  },

  /** Warning pattern for error states or limit exceeded */
  warning() {
    triggerVibration([100, 50, 100]);
  },

  /** Custom vibration pattern */
  custom(pattern: number | number[]) {
    triggerVibration(pattern);
  },
};

function triggerVibration(pattern: number | number[]) {
  if (typeof window !== "undefined" && "navigator" in window && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore vibration errors silently
    }
  }
}
