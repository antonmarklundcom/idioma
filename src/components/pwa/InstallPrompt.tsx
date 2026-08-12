'use client';

import { useCallback, useEffect, useState } from 'react';

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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 sm:p-4">
      <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <span className="text-2xl leading-none" role="img" aria-hidden="true">
          🗣️
        </span>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Install Idioma
          </p>
          {showIosHint ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Tap <span aria-label="the Share button">Share&nbsp;⎋</span> in Safari, then{' '}
              <span className="font-medium">Add to Home Screen&nbsp;➕</span> — you&apos;ll
              get full-screen lessons and a faster mic.
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Add it to your home screen for full-screen lessons and a faster mic.
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {installEvent && (
              <button
                type="button"
                onClick={install}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-slate-900"
              >
                Install
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full px-3 py-2 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="-mt-1 -mr-1 rounded-full p-1 text-lg leading-none text-slate-400 hover:text-slate-700 dark:hover:text-white"
        >
          ×
        </button>
      </div>
    </div>
  );
}
