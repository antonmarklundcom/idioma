'use client';

import { useEffect, useState } from 'react';
import { playUiSound, readSoundPreference, writeSoundPreference } from '@/lib/uiSounds';
import { t, type Locale } from '@/lib/i18n';

/**
 * The app's small sounds, on or off. Stored per DEVICE rather than per account: the
 * same person wants sound on the sofa and silence on the bus, and that is a property
 * of where they are, not of who they are.
 */
export function SoundToggle({ locale }: { locale: Locale }) {
  const strings = t(locale).settings;
  const [enabled, setEnabled] = useState(true);

  // Read after mount: the server cannot know what this device's storage says, and
  // rendering a guess would break hydration (see the timezone note in onboarding).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(readSoundPreference());
  }, []);

  return (
    <section className="card flex max-w-md flex-col gap-2">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={enabled}
          onChange={() => {
            const next = !enabled;
            setEnabled(next);
            writeSoundPreference(next);
            // Turning it ON demonstrates itself. Turning it off says nothing, which
            // is the correct sound for "off".
            if (next) playUiSound('success', true);
          }}
        />
        <span>
          <span className="block font-bold text-ink">{strings.soundEffects}</span>
          <span className="block text-sm text-ink-muted">{strings.soundEffectsHint}</span>
        </span>
      </label>
    </section>
  );
}
