import { SkeletonBlock } from '@/components/ui/Skeleton';

// Covers the lesson browser (/lesson). Also the nearest ancestor loading boundary
// for /lesson/[lessonId] and /lesson/practice while those navigate in, since
// neither defines its own top-of-list skeleton.
export default function LessonLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-3">
        <SkeletonBlock className="h-8 w-32" />
        <SkeletonBlock className="h-9 w-28" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-7 w-16 rounded-full" />
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-16" />
        ))}
      </ul>
    </div>
  );
}
