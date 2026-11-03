import { Skeleton } from '@/components/ui/skeleton';

/** Shown while a page is rendering on the server. Marked busy for assistive technology. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" aria-label="Carregando" className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}
