import { SkeletonBlock } from '@/components/ui/Skeleton';

export default function LiveLoading() {
  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-6 py-10">
      <SkeletonBlock className="h-4 w-32" />
      <SkeletonBlock className="h-6 w-full max-w-lg" />
      <SkeletonBlock className="h-20 w-20 rounded-full" />
    </div>
  );
}
