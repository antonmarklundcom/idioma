import { SkeletonBlock } from '@/components/ui/Skeleton';

export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col gap-8 px-6 py-10">
      <SkeletonBlock className="h-8 w-48" />
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-16" />
        ))}
      </section>
      <SkeletonBlock className="h-16" />
      <SkeletonBlock className="h-20" />
      <div className="flex flex-col gap-3">
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="h-24" />
      </div>
      <div className="flex flex-col gap-3">
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="h-32" />
      </div>
    </div>
  );
}
