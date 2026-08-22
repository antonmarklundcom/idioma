import { SkeletonBlock } from '@/components/ui/Skeleton';

export default function TodayLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-6 px-5 py-8 sm:px-6 sm:py-10">
      <SkeletonBlock className="h-4 w-64 self-start" />
      <SkeletonBlock className="h-8 w-40 self-start" />
      <SkeletonBlock className="h-48 w-full max-w-lg" />
      <SkeletonBlock className="size-24 rounded-full" />
    </div>
  );
}
