'use client';

import { useEffect, useState } from 'react';
import { t, type Locale } from '@/lib/i18n';

// PLAN.md §12.2: "shown as a small toast after each turn."
export function XpToast({
  xpAwarded,
  onDismiss,
  locale,
}: {
  xpAwarded: number;
  onDismiss: () => void;
  locale: Locale;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = requestAnimationFrame(() => setVisible(true));
    const hide = setTimeout(() => setVisible(false), 1200);
    const dismiss = setTimeout(onDismiss, 1500);
    return () => {
      cancelAnimationFrame(show);
      clearTimeout(hide);
      clearTimeout(dismiss);
    };
  }, [onDismiss]);

  return (
    <div
      role="status"
      // Sits above the mobile tab bar rather than behind it (P0.3).
      className={`pointer-events-none fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 rounded-full bg-success-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-raised transition-all duration-300 sm:bottom-6 ${
        visible ? 'animate-pop translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
    >
      {t(locale).gamification.xpAwarded(xpAwarded)}
    </div>
  );
}
