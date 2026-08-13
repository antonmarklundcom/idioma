import { SkeletonBlock } from '@/components/ui/Skeleton';

export default function LessonDetailLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-8 w-64 max-w-full" />
        <SkeletonBlock className="h-4 w-full max-w-md" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-14" />
        ))}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10">
        <SkeletonBlock className="h-6 w-full max-w-lg" />
        <SkeletonBlock className="h-20 w-20 rounded-full" />
      </div>
    </div>
  );
}
