'use client';

import { useCallback, useEffect, useState } from 'react';
import { normalizeLocale, t, type Locale } from '@/lib/i18n';

/**
 * PLAN.md §7.1 — install UI.
 *
 * Two platforms, two mechanisms:
 *
 *  - Android/Chrome fires `beforeinstallprompt`. We stop its default mini-infobar, keep
 *    the event, and show our own Install button that calls `prompt()` on tap.
 *  - iOS/Safari never fires that event and has no programmatic install, so it gets a
 *    one-time "Add to Home Screen" hint describing the Share-sheet steps instead.
 *
 * Both are dismissible, the dismissal is remembered in `localStorage`, and neither is
 * ever rendered when the app is already running standalone.
 */

/** Not in lib.dom yet — Chromium-only. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = 'idioma.pwa.install-dismissed';
const IOS_HINT_KEY = 'idioma.pwa.ios-hint-seen';
const IOS_HINT_DELAY_MS = 4_000;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's non-standard flag, the only reliable signal on that platform.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports a desktop Mac UA; touch points are what give it away.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1)
  );
}

/** localStorage throws in some privacy modes; a missing hint is never worth a crash. */
function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    // Ignore — the prompt simply reappears next time.
  }
}

export function InstallPrompt() {
  // Rendered from the root layout, outside any per-user data fetch, so - same as
  // ErrorRetryPanel - the locale is guessed from the browser rather than
  // `users.nativeLang`. The iOS hint is the one that matters most here: es/sv
  // learners need to actually understand the Share -> Add to Home Screen steps.
  const [locale] = useState<Locale>(() =>
    typeof navigator === 'undefined' ? 'en' : normalizeLocale(navigator.language),
  );
  const strings = t(locale).installPrompt;
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone() || readFlag(DISMISS_KEY)) return;

    if (isIos()) {
      if (readFlag(IOS_HINT_KEY)) return;
      // Deliberately deferred: interrupting the first paint with a banner is hostile,
      // and Android's own prompt arrives asynchronously too, so both platforms behave
      // the same way. One-time — marked seen as soon as it is shown.
      const timer = window.setTimeout(() => {
        writeFlag(IOS_HINT_KEY);
        setShowIosHint(true);
      }, IOS_HINT_DELAY_MS);
      return () => window.clearTimeout(timer);
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault(); // suppress Chrome's own mini-infobar
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      writeFlag(DISMISS_KEY);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null);
    if (outcome === 'accepted') writeFlag(DISMISS_KEY);
  }, [installEvent]);

  const dismiss = useCallback(() => {
    writeFlag(DISMISS_KEY);
    setDismissed(true);
    setInstallEvent(null);
    setShowIosHint(false);
  }, []);

  if (dismissed || (!installEvent && !showIosHint)) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4rem)] z-50 flex justify-center p-3 sm:bottom-0 sm:p-4">
      <div className="card animate-rise pointer-events-auto flex w-full max-w-md items-start gap-3 shadow-raised">
        <span className="text-2xl leading-none" role="img" aria-hidden="true">
          🗣️
        </span>
        <div className="flex-1 text-left">
          <p className="text-sm font-bold text-ink">{strings.title}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {showIosHint ? strings.iosHint : strings.androidHint}
          </p>
          <div className="mt-3 flex items-center gap-2">
            {installEvent && (
              <button
                type="button"
                onClick={install}
                className="btn-primary btn-sm"
              >
                {strings.install}
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="cursor-pointer rounded-full px-3 py-2 text-sm font-semibold text-ink-muted hover:text-ink"
            >
              {strings.notNow}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={strings.dismiss}
          className="-mt-1 -mr-1 cursor-pointer rounded-full p-1 text-lg leading-none text-ink-muted hover:text-ink"
        >
          ×
        </button>
      </div>
    </div>
  );
}
