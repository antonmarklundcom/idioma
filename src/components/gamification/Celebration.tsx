'use client';

import { useEffect, useState } from 'react';

// PLAN.md §12.1/§12.2: short (<2s), skippable, no sound by default. No animation
// library needed - just a CSS transition toggled after mount.
export function Celebration({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = requestAnimationFrame(() => setVisible(true));
    const hide = setTimeout(() => setVisible(false), 1600);
    const dismiss = setTimeout(onDismiss, 1900);
    return () => {
      cancelAnimationFrame(show);
      clearTimeout(hide);
      clearTimeout(dismiss);
    };
  }, [onDismiss]);

  return (
    <div
      role="status"
      onClick={onDismiss}
      className={`fixed inset-x-0 top-4 z-50 mx-auto w-fit cursor-pointer rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-all duration-300 dark:bg-white dark:text-slate-900 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
    >
      {message}
    </div>
  );
}
