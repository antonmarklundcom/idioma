'use client';

import { useEffect, useState } from 'react';

// PLAN.md §12.2: "shown as a small toast after each turn."
export function XpToast({ xpAwarded, onDismiss }: { xpAwarded: number; onDismiss: () => void }) {
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
      className={`pointer-events-none fixed bottom-6 right-6 z-50 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
    >
      +{xpAwarded} XP
    </div>
  );
}
