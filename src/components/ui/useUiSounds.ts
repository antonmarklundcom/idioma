'use client';

import { useCallback, useEffect, useState } from 'react';
import { playUiSound, readSoundPreference, type UiSound } from '@/lib/uiSounds';

/**
 * The app's sounds, respecting this device's setting.
 *
 * The preference is read AFTER mount rather than in the initial state: it lives in
 * localStorage, the server has no idea what it says, and reading it during the first
 * render makes the server's HTML and the client's disagree - which throws away
 * hydration and takes every click handler on the page with it.
 */
export function useUiSounds() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(readSoundPreference());
  }, []);

  return useCallback((sound: UiSound) => playUiSound(sound, enabled), [enabled]);
}
