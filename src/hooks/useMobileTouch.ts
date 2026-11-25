'use client';

/**
 * Mobile Touch & Haptic Feedback Utilities
 *
 * Implements accessible, low-latency haptic vibrations on supported mobile devices
 * with graceful fallback for desktop and unsupported browsers.
 */

export type HapticFeedbackType =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error'
  | 'selection';

export function triggerHaptic(type: HapticFeedbackType = 'light'): void {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) {
    return;
  }

  try {
    switch (type) {
      case 'light':
      case 'selection':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate(22);
        break;
      case 'heavy':
        navigator.vibrate(40);
        break;
      case 'success':
        // Double pleasant pulse
        navigator.vibrate([15, 45, 25]);
        break;
      case 'warning':
        navigator.vibrate([30, 40, 30]);
        break;
      case 'error':
        // Triple urgent buzz
        navigator.vibrate([40, 40, 40, 40, 40]);
        break;
      default:
        navigator.vibrate(15);
        break;
    }
  } catch {
    // Non-fatal if vibration is suppressed by browser policy
  }
}

export function useMobileTouch() {
  return {
    triggerHaptic,
  };
}
